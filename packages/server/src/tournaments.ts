// Automated tournaments: scheduled daily/weekly events, check-in, seeding by MMR, bracket generation,
// match provisioning, result reporting, automatic prize distribution and the Trophy Hall.

import { randomBytes } from 'node:crypto';
import type { ChestSize, ServerMsg } from '@contaminant/engine';
import type { Db, PlayerRow } from './db.ts';
import type { PlayerService } from './players.ts';
import type { Clock, MatchRoom, RoomManager, RoomResult } from './rooms.ts';
import {
  byId,
  champion,
  doubleElimination,
  placements,
  playable,
  report,
  singleElimination,
  swiss,
  swissNextRound,
  swissStandings,
  type Bracket,
  type Entrant,
} from './brackets.ts';

export type TournamentFormat = 'single' | 'double' | 'swiss';

export interface Prize {
  place: number;
  gold: number;
  trophies: number;
  title?: string;
  badge?: string;
  chest?: ChestSize;
}

export interface Registration {
  playerId: string;
  name: string;
  mmr: number;
  checkedIn: boolean;
  deckId?: string;
  isBot?: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  series: string;
  format: TournamentFormat;
  status: 'scheduled' | 'checkin' | 'running' | 'finished' | 'cancelled';
  createdAt: number;
  checkinOpensAt: number;
  startsAt: number;
  finishedAt?: number;
  minPlayers: number;
  maxPlayers: number;
  mode: string;
  planningSeconds: number;
  botFill: boolean;
  registrations: Registration[];
  bracket?: Bracket;
  prizes: Prize[];
  placements?: { playerId: string; name: string; place: number }[];
  rooms: Record<string, string>;
  featured?: boolean;
  swissRounds?: number;
}

export interface ScheduleSpec {
  id: string;
  name: string;
  format: TournamentFormat;
  /** UTC time of day; weekday (0 = Sunday) for weekly events */
  hour: number;
  minute: number;
  weekday?: number;
  checkinMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  prizes: Prize[];
  swissRounds?: number;
}

const stdPrizes = (scale: number, title: string): Prize[] => [
  { place: 1, gold: 600 * scale, trophies: 60 * scale, title, chest: 'large', badge: `${title} Champion` },
  { place: 2, gold: 350 * scale, trophies: 35 * scale, chest: 'medium' },
  { place: 3, gold: 200 * scale, trophies: 20 * scale, chest: 'medium' },
  { place: 4, gold: 150 * scale, trophies: 15 * scale, chest: 'small' },
  { place: 8, gold: 80 * scale, trophies: 8 * scale, chest: 'small' },
  { place: 16, gold: 40 * scale, trophies: 4 * scale },
];

export const DEFAULT_SCHEDULES: ScheduleSpec[] = [
  { id: 'daily-spore-cup', name: 'Daily Spore Cup', format: 'single', hour: 18, minute: 0, checkinMinutes: 30, minPlayers: 4, maxPlayers: 64, prizes: stdPrizes(1, 'Spore Cup') },
  { id: 'daily-rust-swiss', name: 'Daily Rust Swiss', format: 'swiss', hour: 20, minute: 30, checkinMinutes: 30, minPlayers: 4, maxPlayers: 128, prizes: stdPrizes(1, 'Rust Swiss'), swissRounds: 5 },
  { id: 'weekly-bone-harvest', name: 'Weekly Bone Harvest', format: 'double', hour: 17, minute: 0, weekday: 0, checkinMinutes: 45, minPlayers: 4, maxPlayers: 64, prizes: stdPrizes(3, 'Bone Harvest') },
];

export function nextOccurrence(spec: ScheduleSpec, now: number): number {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), spec.hour, spec.minute);
  let at = t;
  if (spec.weekday !== undefined) {
    const diff = (spec.weekday - new Date(t).getUTCDay() + 7) % 7;
    at = t + diff * 86400_000;
    if (at <= now) at += 7 * 86400_000;
  } else if (at <= now) at += 86400_000;
  return at;
}

export interface TournamentHost {
  db: Db;
  players: PlayerService;
  rooms: RoomManager;
  clock: Clock;
  notify(playerId: string, m: ServerMsg): void;
  planningSeconds: number;
  fillWithBots: boolean;
}

export class TournamentService {
  private h: TournamentHost;
  private schedules: ScheduleSpec[];
  constructor(h: TournamentHost, schedules: ScheduleSpec[] = DEFAULT_SCHEDULES) {
    this.h = h;
    this.schedules = schedules;
  }

  list(): Tournament[] {
    return this.h.db.listDocs<Tournament>('tournament').sort((a, b) => b.startsAt - a.startsAt);
  }

  get(id: string): Tournament | undefined {
    return this.h.db.getDoc<Tournament>('tournament', id);
  }

  save(t: Tournament): void {
    this.h.db.putDoc('tournament', t.id, t);
  }

  create(input: Partial<Tournament> & { name: string; format: TournamentFormat; startsAt: number }): Tournament {
    const t: Tournament = {
      id: `t_${randomBytes(4).toString('hex')}`,
      series: 'custom',
      status: 'scheduled',
      createdAt: this.h.clock.now(),
      checkinOpensAt: input.startsAt - 30 * 60_000,
      minPlayers: 4,
      maxPlayers: 64,
      mode: 'contamination',
      planningSeconds: this.h.planningSeconds,
      botFill: this.h.fillWithBots,
      registrations: [],
      prizes: stdPrizes(1, input.name),
      rooms: {},
      ...input,
    };
    this.save(t);
    return t;
  }

  /** Make sure the next occurrence of every scheduled series exists. */
  scheduleTick(now = this.h.clock.now()): Tournament[] {
    const created: Tournament[] = [];
    const all = this.list();
    for (const spec of this.schedules) {
      const pending = all.find((t) => t.series === spec.id && (t.status === 'scheduled' || t.status === 'checkin'));
      if (pending) continue;
      const at = nextOccurrence(spec, now);
      created.push(
        this.create({
          name: `${spec.name} · ${new Date(at).toISOString().slice(0, 10)}`,
          series: spec.id,
          format: spec.format,
          startsAt: at,
          checkinOpensAt: at - spec.checkinMinutes * 60_000,
          minPlayers: spec.minPlayers,
          maxPlayers: spec.maxPlayers,
          prizes: spec.prizes,
          swissRounds: spec.swissRounds,
        }),
      );
    }
    return created;
  }

  lifecycleTick(now = this.h.clock.now()): void {
    for (const t of this.list()) {
      if (t.status === 'scheduled' && now >= t.checkinOpensAt) {
        t.status = 'checkin';
        this.save(t);
        for (const r of t.registrations) this.h.notify(r.playerId, { t: 'tournament', id: t.id, event: 'checkin_open', data: { name: t.name, startsAt: t.startsAt } });
      }
      if ((t.status === 'scheduled' || t.status === 'checkin') && now >= t.startsAt) this.start(t.id);
    }
  }

  register(id: string, p: PlayerRow, deckId?: string): { ok: boolean; error?: string } {
    const t = this.get(id);
    if (!t) return { ok: false, error: 'unknown tournament' };
    if (t.status !== 'scheduled' && t.status !== 'checkin') return { ok: false, error: 'registration is closed' };
    if (t.registrations.length >= t.maxPlayers) return { ok: false, error: 'tournament is full' };
    if (!t.registrations.some((r) => r.playerId === p.id)) t.registrations.push({ playerId: p.id, name: p.name, mmr: p.mmr, checkedIn: false, deckId, isBot: !!p.is_bot });
    this.save(t);
    return { ok: true };
  }

  unregister(id: string, playerId: string): void {
    const t = this.get(id);
    if (!t || t.status === 'running' || t.status === 'finished') return;
    t.registrations = t.registrations.filter((r) => r.playerId !== playerId);
    this.save(t);
  }

  checkin(id: string, playerId: string): { ok: boolean; error?: string } {
    const t = this.get(id);
    if (!t) return { ok: false, error: 'unknown tournament' };
    if (t.status !== 'checkin') return { ok: false, error: 'check-in is not open' };
    const r = t.registrations.find((x) => x.playerId === playerId);
    if (!r) return { ok: false, error: 'not registered' };
    r.checkedIn = true;
    this.save(t);
    return { ok: true };
  }

  start(id: string, opts: { force?: boolean } = {}): Tournament | undefined {
    const t = this.get(id);
    if (!t || t.status === 'running' || t.status === 'finished') return t;
    let field = t.registrations.filter((r) => r.checkedIn || r.isBot || opts.force);
    if (field.length < t.minPlayers && (t.botFill || opts.force)) {
      const bots = this.h.players.ensureBots(Math.max(t.minPlayers, 8)).filter((b) => !field.some((r) => r.playerId === b.id));
      for (const b of bots.slice(0, Math.max(0, Math.max(t.minPlayers, 8) - field.length))) {
        const reg = { playerId: b.id, name: b.name, mmr: b.mmr, checkedIn: true, isBot: true };
        t.registrations.push(reg);
        field.push(reg);
      }
    }
    if (field.length < 2) {
      t.status = 'cancelled';
      this.save(t);
      return t;
    }
    field = field.sort((a, b) => b.mmr - a.mmr).slice(0, t.maxPlayers);
    const entrants: Entrant[] = field.map((r, i) => ({ id: r.playerId, name: r.name, seed: i + 1, mmr: r.mmr }));
    t.bracket = t.format === 'single' ? singleElimination(entrants, { thirdPlace: true }) : t.format === 'double' ? doubleElimination(entrants) : swiss(entrants, t.swissRounds);
    t.status = 'running';
    this.save(t);
    for (const r of field) this.h.notify(r.playerId, { t: 'tournament', id: t.id, event: 'started', data: { name: t.name, format: t.format } });
    this.provision(t.id);
    return this.get(t.id);
  }

  /** Create match lobbies for every playable bracket match. Bot-only matches resolve instantly. */
  provision(id: string): void {
    let guard = 0;
    while (guard++ < 500) {
      const t = this.get(id);
      if (!t || !t.bracket || t.status !== 'running') return;
      const todo = playable(t.bracket).filter((m) => !t.rooms[m.id]);
      if (!todo.length) {
        this.advanceIfDone(t);
        return;
      }
      const m = todo[0]!;
      const regA = t.registrations.find((r) => r.playerId === m.a)!;
      const regB = t.registrations.find((r) => r.playerId === m.b)!;
      const seat = (r: Registration) => {
        const p = this.h.players.byId(r.playerId)!;
        const deck = this.h.players.deck(r.playerId, r.deckId)!;
        return { playerId: r.playerId, name: r.name, deck: { characters: deck.characters, items: deck.items }, mmr: p.mmr, bot: r.isBot ? { difficulty: 'normal' as const } : undefined };
      };
      const room = this.h.rooms.create([seat(regA), seat(regB)], {
        kind: 'tournament',
        planningSeconds: t.planningSeconds,
        tournamentId: t.id,
        tournamentMatchId: m.id,
        featured: t.featured,
      });
      t.rooms[m.id] = room.id;
      byId(t.bracket, m.id).roomId = room.id;
      byId(t.bracket, m.id).status = 'live';
      this.save(t);
      for (const r of [regA, regB]) if (!r.isBot) this.h.notify(r.playerId, { t: 'tournament', id: t.id, event: 'match_ready', data: { room: room.id, round: m.round, bracket: m.bracket } });
      room.start(); // all-bot rooms finish synchronously and call onRoomEnd
    }
  }

  onRoomEnd(room: MatchRoom, result: RoomResult): void {
    const tid = room.opts.tournamentId;
    const mid = room.opts.tournamentMatchId;
    if (!tid || !mid) return;
    const t = this.get(tid);
    if (!t?.bracket) return;
    const m = byId(t.bracket, mid);
    let winner: string | null = result.winner === 'draw' || result.winner === null ? null : room.seats[result.winner].playerId;
    const elimination = t.format !== 'swiss';
    if (winner === null && elimination) {
      // tie-break: VP, then the higher seed
      const seedOf = (pid: string) => t.bracket!.entrants.find((e) => e.id === pid)?.seed ?? 999;
      winner = result.vp[0] !== result.vp[1] ? room.seats[result.vp[0] > result.vp[1] ? 0 : 1].playerId : seedOf(m.a!) < seedOf(m.b!) ? m.a : m.b;
    }
    const aIsSeat0 = room.seats[0].playerId === m.a;
    report(t.bracket, mid, winner, aIsSeat0 ? result.vp[0] : result.vp[1], aIsSeat0 ? result.vp[1] : result.vp[0]);
    this.save(t);
    this.provision(tid);
  }

  private advanceIfDone(t: Tournament): void {
    if (!t.bracket) return;
    if (t.format === 'swiss') {
      const open = t.bracket.matches.some((m) => m.status !== 'done' && m.status !== 'void');
      if (open) return;
      if ((t.bracket.current ?? 0) < t.bracket.rounds) {
        swissNextRound(t.bracket);
        this.save(t);
        this.provision(t.id);
        return;
      }
      this.finish(t);
      return;
    }
    if (champion(t.bracket)) {
      const third = t.bracket.matches.find((m) => m.bracket === '3RD');
      if (third && third.status !== 'done' && third.status !== 'void') return;
      this.finish(t);
    }
  }

  finish(t: Tournament): void {
    if (!t.bracket || t.status === 'finished') return;
    const pl = placements(t.bracket);
    t.placements = pl.map((p) => ({ playerId: p.id, name: t.registrations.find((r) => r.playerId === p.id)?.name ?? '?', place: p.place }));
    t.status = 'finished';
    t.finishedAt = this.h.clock.now();
    this.save(t);
    const sortedPrizes = t.prizes.slice().sort((a, b) => a.place - b.place);
    for (const p of t.placements) {
      const prize = sortedPrizes.find((x) => p.place <= x.place);
      if (!prize) continue;
      const reg = t.registrations.find((r) => r.playerId === p.playerId);
      if (!reg?.isBot) this.h.players.grant(p.playerId, { gold: prize.gold, trophies: prize.trophies, title: p.place === 1 ? prize.badge : undefined, chest: prize.chest }, `tournament:${t.id}:place${p.place}`);
      this.h.notify(p.playerId, { t: 'tournament', id: t.id, event: 'finished', data: { place: p.place, prize } });
      if (p.place <= 3) {
        this.h.db.run('INSERT INTO hall(kind,title,player_id,player_name,season,created,data) VALUES(?,?,?,?,?,?,?)', 'trophy', `${t.name} — ${p.place === 1 ? 'Champion' : p.place === 2 ? 'Runner-up' : 'Third place'}`, p.playerId, p.name, t.series, this.h.clock.now(), JSON.stringify({ tournament: t.id, place: p.place, format: t.format }));
      }
    }
  }

  standings(id: string) {
    const t = this.get(id);
    if (!t?.bracket) return [];
    if (t.format === 'swiss') return swissStandings(t.bracket);
    return placements(t.bracket);
  }

  trophyHall(limit = 100) {
    return this.h.db.all<{ id: number; kind: string; title: string; player_id: string; player_name: string; season: string; created: number; data: string }>("SELECT * FROM hall WHERE kind='trophy' ORDER BY created DESC LIMIT ?", limit);
  }
}
