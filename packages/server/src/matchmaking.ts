// Matchmaking: ranked & casual solo queues with widening MMR windows, bot fill, a practice bot queue,
// and a Team Battle queue (parties of 2: each member plays a 1v1 vs the other team; most wins, then VP, decide).

import { randomBytes } from 'node:crypto';
import type { QueueKind, ServerMsg, DeckCardInput } from '@contaminant/engine';
import { fairBotDeck, hashString, isDevName, makeRng } from '@contaminant/engine';
import type { RoomManager, MatchRoom, RoomResult, Clock } from './rooms.ts';
import type { PlayerService } from './players.ts';
import { rate, teamRating } from './rating.ts';

export interface QueueEntry {
  playerId: string;
  name: string;
  mmr: number;
  teamMmr: number;
  games: number;
  deck: { characters: DeckCardInput[]; items: string[] };
  joinedAt: number;
  queue: QueueKind;
  partyId?: string;
  mode?: string;
}

export interface Party {
  code: string;
  leader: string;
  members: string[];
}

export interface MatchmakerConfig {
  botFillSeconds: number;
  rankedBotFill: boolean;
  planningSeconds: number;
}

interface TeamBattle {
  id: string;
  teams: [string[], string[]];
  rooms: string[];
  results: { room: string; winnerTeam: 0 | 1 | null; vp: [number, number] }[];
}

export class Matchmaker {
  readonly queues: Record<QueueKind, QueueEntry[]> = { ranked: [], casual: [], team: [], bot: [] };
  readonly parties = new Map<string, Party>();
  readonly battles = new Map<string, TeamBattle>();

  private clock: Clock;
  private rooms: RoomManager;
  private players: PlayerService;
  private notify: (playerId: string, m: ServerMsg) => void;
  private cfg: MatchmakerConfig;

  constructor(clock: Clock, rooms: RoomManager, players: PlayerService, notify: (playerId: string, m: ServerMsg) => void, cfg: MatchmakerConfig) {
    this.clock = clock;
    this.rooms = rooms;
    this.players = players;
    this.notify = notify;
    this.cfg = cfg;
  }

  window(e: QueueEntry, now: number): number {
    const waited = (now - e.joinedAt) / 1000;
    if (e.queue === 'casual') return Math.min(1000, 200 + 30 * waited);
    return Math.min(600, 50 + 15 * waited);
  }

  join(e: QueueEntry): void {
    this.leave(e.playerId, true);
    if (e.queue === 'bot') {
      this.startBotMatch(e, 'normal');
      return;
    }
    this.queues[e.queue].push(e);
    const q = this.queues[e.queue];
    this.notify(e.playerId, { t: 'queued', queue: e.queue, position: q.length, estimate: Math.max(5, 60 - q.length * 10) });
    this.tick();
  }

  leave(playerId: string, silent = false): void {
    let found = false;
    for (const k of Object.keys(this.queues) as QueueKind[]) {
      const before = this.queues[k].length;
      this.queues[k] = this.queues[k].filter((e) => e.playerId !== playerId);
      if (this.queues[k].length !== before) found = true;
    }
    if (found && !silent) this.notify(playerId, { t: 'queue_left' });
  }

  inQueue(playerId: string): QueueKind | null {
    for (const k of Object.keys(this.queues) as QueueKind[]) if (this.queues[k].some((e) => e.playerId === playerId)) return k;
    return null;
  }

  tick(): void {
    const now = this.clock.now();
    for (const kind of ['ranked', 'casual'] as const) {
      const q = this.queues[kind].sort((a, b) => a.mmr - b.mmr);
      const used = new Set<string>();
      for (let i = 0; i < q.length; i++) {
        const a = q[i]!;
        if (used.has(a.playerId)) continue;
        let best: QueueEntry | null = null;
        for (let j = i + 1; j < q.length; j++) {
          const b = q[j]!;
          if (used.has(b.playerId)) continue;
          const gap = Math.abs(a.mmr - b.mmr);
          if (gap <= Math.min(this.window(a, now), this.window(b, now)) && (!best || gap < Math.abs(a.mmr - best.mmr))) best = b;
        }
        if (best) {
          used.add(a.playerId);
          used.add(best.playerId);
          this.startMatch(kind, a, best);
        }
      }
      this.queues[kind] = q.filter((e) => !used.has(e.playerId));
      // bot fill for players who waited too long
      for (const e of [...this.queues[kind]]) {
        const waited = (now - e.joinedAt) / 1000;
        if (waited >= this.cfg.botFillSeconds && (kind === 'casual' || this.cfg.rankedBotFill)) {
          this.queues[kind] = this.queues[kind].filter((x) => x !== e);
          this.startBotMatch(e, e.mmr > 1500 ? 'hard' : 'normal', kind);
        }
      }
    }
    this.tickTeams(now);
  }

  private startMatch(kind: 'ranked' | 'casual', a: QueueEntry, b: QueueEntry): MatchRoom {
    const room = this.rooms.create(
      [
        { playerId: a.playerId, name: a.name, deck: a.deck, mmr: a.mmr },
        { playerId: b.playerId, name: b.name, deck: b.deck, mmr: b.mmr },
      ],
      { kind, planningSeconds: this.cfg.planningSeconds },
    );
    room.start();
    return room;
  }

  startBotMatch(e: QueueEntry, difficulty: 'easy' | 'normal' | 'hard', kind: 'ranked' | 'casual' | 'bot' = 'bot'): MatchRoom {
    const bot = this.players.ensureBots(1)[0]!;
    // a fair opponent: only characters the player could own by now, never above the player's level
    const human = this.players.byId(e.playerId);
    const best = human && !isDevName(human.name) ? this.players.collection(e.playerId).bestTrophies : 99_999;
    const deck = fairBotDeck(makeRng(hashString(`bot:${e.playerId}:${this.clock.now()}`)), e.deck, best);
    const room = this.rooms.create(
      [
        { playerId: e.playerId, name: e.name, deck: e.deck, mmr: e.mmr },
        { playerId: bot.id, name: bot.name, deck: { characters: deck.characters, items: deck.items }, bot: { difficulty }, mmr: bot.mmr },
      ],
      { kind: kind === 'ranked' ? 'ranked' : 'bot', planningSeconds: this.cfg.planningSeconds },
    );
    room.start();
    return room;
  }

  // ---------------------------------------------------------------- parties & team battles

  createParty(leader: string): Party {
    const code = randomBytes(3).toString('hex').toUpperCase();
    const p: Party = { code, leader, members: [leader] };
    this.parties.set(code, p);
    return p;
  }

  joinParty(code: string, playerId: string): Party | null {
    const p = this.parties.get(code.toUpperCase());
    if (!p || p.members.length >= 2) return null;
    if (!p.members.includes(playerId)) p.members.push(playerId);
    return p;
  }

  partyOf(playerId: string): Party | undefined {
    for (const p of this.parties.values()) if (p.members.includes(playerId)) return p;
    return undefined;
  }

  private tickTeams(now: number): void {
    const q = this.queues.team;
    // group entries into teams: premade parties first, then solos by MMR
    const teams: { members: QueueEntry[]; premade: boolean; mmr: number; joined: number }[] = [];
    const used = new Set<string>();
    for (const e of q) {
      if (used.has(e.playerId) || !e.partyId) continue;
      const mates = q.filter((x) => x.partyId === e.partyId);
      if (mates.length === 2) {
        mates.forEach((m) => used.add(m.playerId));
        teams.push({ members: mates, premade: true, mmr: teamRating(mates.map((m) => m.teamMmr), true), joined: Math.min(...mates.map((m) => m.joinedAt)) });
      }
    }
    const solos = q.filter((e) => !used.has(e.playerId) && !e.partyId).sort((a, b) => a.teamMmr - b.teamMmr);
    for (let i = 0; i + 1 < solos.length; i += 2) {
      const pair = [solos[i]!, solos[i + 1]!];
      pair.forEach((m) => used.add(m.playerId));
      teams.push({ members: pair, premade: false, mmr: teamRating(pair.map((m) => m.teamMmr), false), joined: Math.min(...pair.map((m) => m.joinedAt)) });
    }
    teams.sort((a, b) => a.mmr - b.mmr);
    const matched = new Set<number>();
    for (let i = 0; i < teams.length; i++) {
      if (matched.has(i)) continue;
      for (let j = i + 1; j < teams.length; j++) {
        if (matched.has(j)) continue;
        const waited = (now - Math.min(teams[i]!.joined, teams[j]!.joined)) / 1000;
        if (Math.abs(teams[i]!.mmr - teams[j]!.mmr) <= Math.min(800, 100 + 20 * waited)) {
          matched.add(i);
          matched.add(j);
          this.startTeamBattle(teams[i]!.members, teams[j]!.members);
          break;
        }
      }
    }
    const inBattle = new Set([...matched].flatMap((i) => teams[i]!.members.map((m) => m.playerId)));
    this.queues.team = q.filter((e) => !inBattle.has(e.playerId));
  }

  startTeamBattle(a: QueueEntry[], b: QueueEntry[]): TeamBattle {
    const id = `tb_${randomBytes(4).toString('hex')}`;
    const A = a.slice().sort((x, y) => y.mmr - x.mmr);
    const B = b.slice().sort((x, y) => y.mmr - x.mmr);
    const battle: TeamBattle = { id, teams: [A.map((x) => x.playerId), B.map((x) => x.playerId)], rooms: [], results: [] };
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      const room = this.rooms.create(
        [
          { playerId: A[i]!.playerId, name: A[i]!.name, deck: A[i]!.deck, mmr: A[i]!.teamMmr },
          { playerId: B[i]!.playerId, name: B[i]!.name, deck: B[i]!.deck, mmr: B[i]!.teamMmr },
        ],
        { kind: 'team', planningSeconds: this.cfg.planningSeconds },
      );
      (room as MatchRoom & { battle?: string }).battle = id;
      battle.rooms.push(room.id);
      room.start();
    }
    this.battles.set(id, battle);
    return battle;
  }

  /** Called when a team room ends. Returns the final team result once all rooms are done. */
  teamRoomEnded(room: MatchRoom, result: RoomResult): { winnerTeam: 0 | 1 | null; teams: [string[], string[]] } | null {
    const id = (room as MatchRoom & { battle?: string }).battle;
    const battle = id ? this.battles.get(id) : undefined;
    if (!battle) return null;
    const seatTeam = battle.teams[0].includes(room.seats[0].playerId) ? 0 : 1;
    const winnerTeam = result.winner === 'draw' || result.winner === null ? null : result.winner === 0 ? (seatTeam as 0 | 1) : ((1 - seatTeam) as 0 | 1);
    const vp: [number, number] = seatTeam === 0 ? result.vp : [result.vp[1], result.vp[0]];
    battle.results.push({ room: room.id, winnerTeam, vp });
    if (battle.results.length < battle.rooms.length) return null;
    const wins = [0, 0];
    const vps = [0, 0];
    for (const r of battle.results) {
      if (r.winnerTeam !== null) wins[r.winnerTeam]!++;
      vps[0]! += r.vp[0];
      vps[1]! += r.vp[1];
    }
    const final: 0 | 1 | null = wins[0]! > wins[1]! ? 0 : wins[1]! > wins[0]! ? 1 : vps[0]! > vps[1]! ? 0 : vps[1]! > vps[0]! ? 1 : null;
    // team MMR update (each member against the other team's average)
    const avg = (ids: string[]) => ids.reduce((s, x) => s + (this.players.byId(x)?.team_mmr ?? 1000), 0) / ids.length;
    const ta = avg(battle.teams[0]);
    const tb = avg(battle.teams[1]);
    for (const [t, ids] of battle.teams.entries()) {
      for (const pid of ids) {
        const p = this.players.byId(pid);
        if (!p || p.is_bot) continue;
        const score = final === null ? 0.5 : final === t ? 1 : 0;
        const r = rate(p.team_mmr, t === 0 ? tb : ta, p.games, 30, score);
        this.players.setTeamMmr(pid, r.a);
      }
    }
    this.battles.delete(battle.id);
    return { winnerTeam: final, teams: battle.teams };
  }
}
