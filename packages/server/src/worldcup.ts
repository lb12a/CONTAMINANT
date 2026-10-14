// Online World Cup (WM online), held every year on Halloween: Last Chance qualifier (Swiss, 29 Oct) →
// group stage (round robin, 30 Oct) → playoffs (single elimination + 3rd place, finals on 31 Oct) →
// World Champion crown, title badge and permanent hall-of-fame record. Monthly Major champions and the
// top of the Circuit Points race are seeded straight into the groups (see circuit.ts).
// Every WM match is "featured": spectators and casters get it with a broadcast delay.

import type { ServerMsg } from '@contaminant/engine';
import type { Db, PlayerRow } from './db.ts';
import type { PlayerService } from './players.ts';
import type { Clock, MatchRoom, RoomManager, RoomResult } from './rooms.ts';
import {
  byId,
  champion,
  groupStandings,
  placements,
  playable,
  report,
  roundRobinGroups,
  singleElimination,
  swiss,
  swissNextRound,
  swissStandings,
  type Bracket,
  type Entrant,
} from './brackets.ts';
import type { Registration } from './tournaments.ts';
import { CIRCUIT, circuitSeason, halloweenSchedule, type CircuitService } from './circuit.ts';

export type WmStage = 'qualifiers' | 'groups' | 'playoffs';

export interface WorldCup {
  id: string;
  edition: number;
  /** circuit season (= the Halloween year); absent for ad-hoc editions opened by an admin */
  season?: number;
  name: string;
  status: 'registration' | WmStage | 'finished';
  createdAt: number;
  schedule: { qualifiersAt: number; groupsAt: number; playoffsAt: number };
  /** a stage that is ready but waits for its scheduled day */
  pendingStage?: 'groups' | 'playoffs';
  qualifierAdvance: number;
  groupCount: number;
  registrations: Registration[];
  qualifiers?: Bracket;
  groups?: Bracket;
  playoffs?: Bracket;
  rooms: Record<string, string>;
  champion?: { playerId: string; name: string };
  podium?: { playerId: string; name: string; place: number }[];
  broadcastDelayRounds: number;
  planningSeconds: number;
}

export interface WmHost {
  db: Db;
  players: PlayerService;
  rooms: RoomManager;
  clock: Clock;
  notify(playerId: string, m: ServerMsg): void;
  fillWithBots: boolean;
  circuit?: CircuitService;
  /** respect the Halloween calendar (stages wait for their day); off for ad-hoc editions and tests */
  calendar?: boolean;
}

export class WorldCupService {
  private h: WmHost;
  constructor(h: WmHost) {
    this.h = h;
  }

  all(): WorldCup[] {
    return this.h.db.listDocs<WorldCup>('worldcup').sort((a, b) => b.edition - a.edition);
  }

  current(): WorldCup | undefined {
    return this.all().find((w) => w.status !== 'finished') ?? this.all()[0];
  }

  save(w: WorldCup): void {
    this.h.db.putDoc('worldcup', w.id, w);
  }

  open(opts: { edition?: number; qualifiersAt?: number; days?: number } = {}): WorldCup {
    const now = this.h.clock.now();
    const edition = opts.edition ?? (this.all()[0]?.edition ?? 0) + 1;
    const day = 86400_000 * (opts.days ?? 2);
    const q = opts.qualifiersAt ?? now + day;
    const w: WorldCup = {
      id: `wm${edition}`,
      edition,
      name: `Contaminant World Championship ${new Date(q).getUTCFullYear()} · Edition ${edition}`,
      status: 'registration',
      createdAt: now,
      schedule: { qualifiersAt: q, groupsAt: q + day, playoffsAt: q + 2 * day },
      qualifierAdvance: 16,
      groupCount: 4,
      registrations: [],
      rooms: {},
      broadcastDelayRounds: 2,
      planningSeconds: 45,
    };
    this.save(w);
    return w;
  }

  /** The Halloween edition of a circuit season: opens on 1 October with the direct qualifiers already seeded. */
  ensureSeason(now = this.h.clock.now()): WorldCup | null {
    const season = circuitSeason(now);
    const id = `wm-${season}`;
    const existing = this.h.db.getDoc<WorldCup>('worldcup', id);
    if (existing) return existing;
    const sch = halloweenSchedule(season);
    if (now < sch.registrationAt) return null;
    const w: WorldCup = {
      id,
      edition: (this.all()[0]?.edition ?? 0) + 1,
      season,
      name: `Contaminant World Cup ${season} · Halloween`,
      status: 'registration',
      createdAt: now,
      schedule: { qualifiersAt: sch.qualifiersAt, groupsAt: sch.groupsAt, playoffsAt: sch.playoffsAt },
      qualifierAdvance: CIRCUIT.groupField,
      groupCount: 4,
      registrations: [],
      rooms: {},
      broadcastDelayRounds: 2,
      planningSeconds: 45,
    };
    for (const q of this.h.circuit?.directQualifiers(season) ?? []) {
      const p = this.h.players.byId(q.playerId);
      if (p) w.registrations.push({ playerId: p.id, name: p.name, mmr: p.mmr, checkedIn: true, direct: true, via: q.via });
    }
    this.save(w);
    for (const r of w.registrations) this.h.notify(r.playerId, { t: 'tournament', id: w.id, event: 'wm_qualified', data: { via: r.via } });
    return w;
  }

  /** Who may enter: direct seeds are registered automatically; others need the World Cup MMR or Circuit Points. */
  eligibility(p: PlayerRow, w = this.current()): { ok: boolean; direct: boolean; reason: string } {
    if (!w) return { ok: false, direct: false, reason: 'No World Cup is open' };
    const reg = w.registrations.find((r) => r.playerId === p.id);
    if (reg?.direct) return { ok: true, direct: true, reason: reg.via ?? 'Direct seed' };
    const pts = w.season !== undefined ? this.h.circuit?.pointsOf(w.season, p.id) ?? 0 : 0;
    if (p.is_bot || p.mmr >= CIRCUIT.wmMinMmr || pts > 0) return { ok: true, direct: false, reason: pts > 0 ? `${pts} Circuit Points` : `${Math.round(p.mmr)} MMR` };
    return { ok: false, direct: false, reason: `Needs ${CIRCUIT.wmMinMmr} MMR or Circuit Points from a Monthly Major` };
  }

  register(p: PlayerRow, deckId?: string): { ok: boolean; error?: string } {
    const w = this.current();
    if (!w || w.status !== 'registration') return { ok: false, error: 'World Cup registration is closed' };
    const el = this.eligibility(p, w);
    if (!el.ok && w.season !== undefined) return { ok: false, error: el.reason };
    const existing = w.registrations.find((r) => r.playerId === p.id);
    if (existing) existing.deckId = deckId ?? existing.deckId;
    else w.registrations.push({ playerId: p.id, name: p.name, mmr: p.mmr, checkedIn: true, deckId, isBot: !!p.is_bot });
    this.save(w);
    return { ok: true };
  }

  tick(now = this.h.clock.now()): void {
    if (this.h.calendar) this.ensureSeason(now);
    const w = this.current();
    if (!w || w.status === 'finished') return;
    if (w.status === 'registration' && now >= w.schedule.qualifiersAt) this.startQualifiers(w.id);
    if (w.pendingStage === 'groups' && now >= w.schedule.groupsAt) this.startGroups(w);
    else if (w.pendingStage === 'playoffs' && now >= w.schedule.playoffsAt) this.startPlayoffs(w);
  }

  /** Stages of a calendar edition wait for their day (groups 30 Oct, finals 31 Oct). */
  private waitFor(w: WorldCup, stage: 'groups' | 'playoffs'): boolean {
    if (w.season === undefined || !this.h.calendar) return false;
    const at = stage === 'groups' ? w.schedule.groupsAt : w.schedule.playoffsAt;
    if (this.h.clock.now() >= at) return false;
    w.pendingStage = stage;
    this.save(w);
    return true;
  }

  private bracketFor(w: WorldCup, stage: WmStage): Bracket | undefined {
    return stage === 'qualifiers' ? w.qualifiers : stage === 'groups' ? w.groups : w.playoffs;
  }

  startQualifiers(id: string): void {
    const w = this.h.db.getDoc<WorldCup>('worldcup', id)!;
    if (w.status !== 'registration') return;
    // direct seeds skip the Last Chance qualifier; it fills the remaining group places
    const direct = w.registrations.filter((r) => r.direct);
    w.qualifierAdvance = Math.max(4, CIRCUIT.groupField - direct.length);
    let field = w.registrations.filter((r) => !r.direct);
    const want = w.qualifierAdvance * 2;
    if (field.length < want && this.h.fillWithBots) {
      for (const b of this.h.players.ensureBots(want)) {
        if (field.length >= want) break;
        if (field.some((r) => r.playerId === b.id)) continue;
        const reg = { playerId: b.id, name: b.name, mmr: b.mmr, checkedIn: true, isBot: true };
        w.registrations.push(reg);
        field.push(reg);
      }
    }
    field = field.sort((a, b) => b.mmr - a.mmr);
    if (field.length < 2) {
      // nobody needs the Last Chance qualifier: straight to the groups
      w.status = 'qualifiers';
      this.save(w);
      if (!this.waitFor(w, 'groups')) this.startGroups(w);
      return;
    }
    const entrants: Entrant[] = field.map((r, i) => ({ id: r.playerId, name: r.name, seed: i + 1, mmr: r.mmr }));
    w.qualifiers = swiss(entrants, Math.max(3, Math.ceil(Math.log2(entrants.length))));
    w.status = 'qualifiers';
    this.save(w);
    for (const r of field) this.h.notify(r.playerId, { t: 'tournament', id: w.id, event: 'wm_stage', data: { stage: 'qualifiers' } });
    this.provision(w.id);
  }

  private startGroups(w: WorldCup): void {
    w.pendingStage = undefined;
    const mmrOf = (id: string) => w.registrations.find((r) => r.playerId === id)?.mmr ?? 1000;
    // direct seeds (Major champions, points race) first, then the qualifier survivors
    const direct = w.registrations.filter((r) => r.direct).map((r) => ({ id: r.playerId, name: r.name }));
    const fromSwiss = w.qualifiers ? swissStandings(w.qualifiers).slice(0, w.qualifierAdvance).map((s) => ({ id: s.id, name: s.name })) : [];
    const st = [...direct, ...fromSwiss.filter((s) => !direct.some((d) => d.id === s.id))];
    const entrants: Entrant[] = st.map((s, i) => ({ id: s.id, name: s.name, seed: i + 1, mmr: mmrOf(s.id) }));
    w.groups = roundRobinGroups(entrants, Math.min(w.groupCount, Math.max(1, Math.floor(entrants.length / 2))));
    w.status = 'groups';
    this.save(w);
    for (const e of entrants) this.h.notify(e.id, { t: 'tournament', id: w.id, event: 'wm_stage', data: { stage: 'groups' } });
    this.provision(w.id);
  }

  private startPlayoffs(w: WorldCup): void {
    w.pendingStage = undefined;
    const groups = Object.keys(w.groups!.groups ?? {});
    const winners = groups.map((g) => groupStandings(w.groups!, g)[0]!).filter(Boolean);
    const runners = groups.map((g) => groupStandings(w.groups!, g)[1]!).filter(Boolean);
    const seeded = [...winners, ...runners].map((s, i) => ({ id: s.id, name: s.name, seed: i + 1, mmr: 0 }));
    w.playoffs = singleElimination(seeded, { thirdPlace: true });
    w.status = 'playoffs';
    this.save(w);
    for (const e of seeded) this.h.notify(e.id, { t: 'tournament', id: w.id, event: 'wm_stage', data: { stage: 'playoffs' } });
    this.provision(w.id);
  }

  provision(id: string): void {
    let guard = 0;
    while (guard++ < 1000) {
      const w = this.h.db.getDoc<WorldCup>('worldcup', id);
      if (!w || w.status === 'registration' || w.status === 'finished') return;
      if (w.pendingStage) return;
      const stage = w.status as WmStage;
      const b = this.bracketFor(w, stage);
      if (!b) return;
      const todo = playable(b).filter((m) => !w.rooms[`${stage}:${m.id}`]);
      if (!todo.length) {
        this.advance(w, stage);
        return;
      }
      const m = todo[0]!;
      const seat = (pid: string) => {
        const reg = w.registrations.find((r) => r.playerId === pid)!;
        const p = this.h.players.byId(pid)!;
        const deck = this.h.players.deck(pid, reg.deckId)!;
        return { playerId: pid, name: reg.name, deck: { characters: deck.characters, items: deck.items }, mmr: p.mmr, bot: reg.isBot ? { difficulty: 'hard' as const } : undefined };
      };
      const room = this.h.rooms.create([seat(m.a!), seat(m.b!)], {
        kind: 'wm',
        planningSeconds: w.planningSeconds,
        tournamentId: w.id,
        tournamentMatchId: `${stage}:${m.id}`,
        featured: true,
        spectatorDelayRounds: w.broadcastDelayRounds,
      });
      w.rooms[`${stage}:${m.id}`] = room.id;
      byId(b, m.id).roomId = room.id;
      byId(b, m.id).status = 'live';
      this.save(w);
      for (const pid of [m.a!, m.b!]) this.h.notify(pid, { t: 'tournament', id: w.id, event: 'match_ready', data: { room: room.id, stage } });
      room.start();
    }
  }

  onRoomEnd(room: MatchRoom, result: RoomResult): void {
    const key = room.opts.tournamentMatchId;
    if (!key || room.kind !== 'wm') return;
    const w = this.h.db.getDoc<WorldCup>('worldcup', room.opts.tournamentId!);
    if (!w) return;
    const [stage, mid] = key.split(':') as [WmStage, string];
    const b = this.bracketFor(w, stage)!;
    const m = byId(b, mid);
    let winner: string | null = result.winner === 'draw' || result.winner === null ? null : room.seats[result.winner].playerId;
    if (winner === null && stage === 'playoffs') winner = result.vp[0] >= result.vp[1] ? room.seats[0].playerId : room.seats[1].playerId;
    const aIs0 = room.seats[0].playerId === m.a;
    report(b, mid, winner, aIs0 ? result.vp[0] : result.vp[1], aIs0 ? result.vp[1] : result.vp[0]);
    this.save(w);
    this.provision(w.id);
  }

  private advance(w: WorldCup, stage: WmStage): void {
    const b = this.bracketFor(w, stage)!;
    const open = b.matches.some((m) => m.status !== 'done' && m.status !== 'void');
    if (stage === 'qualifiers') {
      if (open) return;
      if ((b.current ?? 0) < b.rounds) {
        swissNextRound(b);
        this.save(w);
        this.provision(w.id);
        return;
      }
      if (!this.waitFor(w, 'groups')) this.startGroups(w);
      return;
    }
    if (stage === 'groups') {
      if (open) return;
      if (!this.waitFor(w, 'playoffs')) this.startPlayoffs(w);
      return;
    }
    if (stage === 'playoffs' && !open && champion(b)) this.crown(w);
  }

  private crown(w: WorldCup): void {
    const pl = placements(w.playoffs!).slice(0, 4);
    const nameOf = (id: string) => w.registrations.find((r) => r.playerId === id)?.name ?? '?';
    w.podium = pl.map((p) => ({ playerId: p.id, name: nameOf(p.id), place: p.place }));
    const champ = pl.find((p) => p.place === 1)!;
    w.champion = { playerId: champ.id, name: nameOf(champ.id) };
    w.status = 'finished';
    this.save(w);
    const year = new Date(w.schedule.playoffsAt).getUTCFullYear();
    const rewards: Record<number, { gold: number; trophies: number; title?: string }> = {
      1: { gold: 10000, trophies: 500, title: `World Champion ${year}` },
      2: { gold: 5000, trophies: 250, title: `World Finalist ${year}` },
      3: { gold: 2500, trophies: 150, title: `World Bronze ${year}` },
      4: { gold: 1500, trophies: 100 },
    };
    for (const p of w.podium) {
      const r = rewards[p.place];
      const reg = w.registrations.find((x) => x.playerId === p.playerId);
      if (r && !reg?.isBot) this.h.players.grant(p.playerId, { ...r, cardBack: p.place === 1 ? 'world_crown' : undefined, skin: p.place === 1 ? 'champion_crown' : undefined }, `worldcup:${w.id}:place${p.place}`);
      if (p.place <= 3) {
        this.h.db.run(
          'INSERT INTO hall(kind,title,player_id,player_name,season,created,data) VALUES(?,?,?,?,?,?,?)',
          p.place === 1 ? 'world_champion' : 'world_podium',
          p.place === 1 ? `World Champion ${year}` : p.place === 2 ? `World Finalist ${year}` : `World Bronze ${year}`,
          p.playerId,
          p.name,
          w.id,
          this.h.clock.now(),
          JSON.stringify({ edition: w.edition, place: p.place, crown: p.place === 1 }),
        );
      }
      this.h.notify(p.playerId, { t: 'tournament', id: w.id, event: 'wm_finished', data: { place: p.place } });
    }
  }

  /** Live leaderboard for the active stage. */
  leaderboard(): unknown {
    const w = this.current();
    if (!w) return null;
    if (w.status === 'qualifiers' && w.qualifiers) return { stage: 'qualifiers', round: w.qualifiers.current, rounds: w.qualifiers.rounds, standings: swissStandings(w.qualifiers) };
    if (w.status === 'groups' && w.groups) return { stage: 'groups', groups: Object.fromEntries(Object.keys(w.groups.groups ?? {}).map((g) => [g, groupStandings(w.groups!, g)])) };
    if ((w.status === 'playoffs' || w.status === 'finished') && w.playoffs) return { stage: w.status, bracket: w.playoffs.matches, champion: w.champion, podium: w.podium };
    return { stage: w.status, registrations: w.registrations.length, direct: w.registrations.filter((r) => r.direct).map((r) => ({ name: r.name, via: r.via })) };
  }

  /** The reigning World Champion and every past champion with the podium. */
  champions(): { current: { name: string; playerId: string; season?: number; edition: number; name_of_cup: string } | null; history: { edition: number; season?: number; cup: string; champion: string; playerId: string; podium: WorldCup['podium'] }[] } {
    const done = this.all().filter((w) => w.status === 'finished' && w.champion);
    const history = done.map((w) => ({ edition: w.edition, season: w.season, cup: w.name, champion: w.champion!.name, playerId: w.champion!.playerId, podium: w.podium }));
    const top = done[0];
    return { current: top ? { name: top.champion!.name, playerId: top.champion!.playerId, season: top.season, edition: top.edition, name_of_cup: top.name } : null, history };
  }

  hallOfFame(): unknown[] {
    return this.h.db.all("SELECT * FROM hall WHERE kind IN ('world_champion','world_podium','season_champion') ORDER BY created DESC LIMIT 200");
  }
}
