// The Contamination Circuit: the road to the World Cup.
//
// A circuit season ends with the World Cup on Halloween (finals on 31 October, UTC). From November to
// September the server hosts one Monthly Major per month on its first Saturday (double elimination, so a
// player is out after the second loss). Registration needs a minimum MMR. Placements earn Circuit Points;
// every Major champion and the best players of the points race qualify directly for the World Cup group
// stage, everybody else above the World Cup threshold can try the Last Chance qualifier (Swiss) in the
// last days of October.

import type { Db } from './db.ts';
import type { Tournament, TournamentService, Prize } from './tournaments.ts';

export const CIRCUIT = {
  /** minimum MMR to register for a Monthly Major */
  majorMinMmr: 1150,
  /** minimum MMR (or any Circuit Points) to enter the World Cup Last Chance qualifier */
  wmMinMmr: 1250,
  /** direct World Cup group seeds from the points race (Major champions come on top, max 12 direct) */
  directFromPoints: 8,
  maxDirect: 12,
  /** World Cup group stage size */
  groupField: 16,
  majorHourUtc: 17,
  majorRegistrationDays: 14,
  checkinMinutes: 60,
} as const;

/** Circuit Points by final placement (place ≤ key). Everyone who plays at least one match gets 10. */
export const CIRCUIT_POINTS: [number, number][] = [
  [1, 400],
  [2, 300],
  [4, 200],
  [8, 120],
  [16, 60],
  [32, 30],
];
export const PARTICIPATION_POINTS = 10;

export function pointsFor(place: number): number {
  for (const [p, pts] of CIRCUIT_POINTS) if (place <= p) return pts;
  return PARTICIPATION_POINTS;
}

const DAY = 86400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The World Cup of a season is played on Halloween of that year: qualifiers 29 Oct, groups 30 Oct, finals 31 Oct. */
export function halloweenSchedule(year: number): { registrationAt: number; qualifiersAt: number; groupsAt: number; playoffsAt: number } {
  return {
    registrationAt: Date.UTC(year, 9, 1, 0, 0),
    qualifiersAt: Date.UTC(year, 9, 29, 17, 0),
    groupsAt: Date.UTC(year, 9, 30, 17, 0),
    playoffsAt: Date.UTC(year, 9, 31, 17, 0),
  };
}

/** Season = year of the next Halloween finals that have not finished yet. */
export function circuitSeason(now: number): number {
  const y = new Date(now).getUTCFullYear();
  return now > Date.UTC(y, 9, 31, 23, 59) ? y + 1 : y;
}

/** First Saturday of the month, 17:00 UTC. */
export function majorStart(year: number, month: number): number {
  const first = new Date(Date.UTC(year, month, 1, CIRCUIT.majorHourUtc, 0));
  const shift = (6 - first.getUTCDay() + 7) % 7;
  return first.getTime() + shift * DAY;
}

export interface MajorSlot {
  season: number;
  year: number;
  month: number;
  name: string;
  series: string;
  startsAt: number;
  registrationOpensAt: number;
}

/** The 11 Monthly Majors of a season: November of the previous year to September. October belongs to the World Cup. */
export function seasonMajors(season: number): MajorSlot[] {
  const out: MajorSlot[] = [];
  for (let i = 0; i < 11; i++) {
    const month = (10 + i) % 12;
    const year = month >= 10 ? season - 1 : season;
    const startsAt = majorStart(year, month);
    out.push({
      season,
      year,
      month,
      name: `${MONTHS[month]} Major ${year}`,
      series: `major-${year}-${String(month + 1).padStart(2, '0')}`,
      startsAt,
      registrationOpensAt: startsAt - CIRCUIT.majorRegistrationDays * DAY,
    });
  }
  return out;
}

export interface CircuitEntry {
  playerId: string;
  name: string;
  points: number;
  majors: { series: string; name: string; place: number; points: number }[];
  majorWins: number;
}

export interface CircuitStandings {
  season: number;
  entries: Record<string, CircuitEntry>;
  /** series ids already counted */
  counted: string[];
}

const majorPrizes = (month: string): Prize[] => [
  { place: 1, gold: 3000, trophies: 200, title: `${month} Major Champion`, chest: 'large', badge: `${month} Major Champion` },
  { place: 2, gold: 1800, trophies: 120, chest: 'large' },
  { place: 3, gold: 1100, trophies: 80, chest: 'medium' },
  { place: 4, gold: 800, trophies: 60, chest: 'medium' },
  { place: 8, gold: 400, trophies: 30, chest: 'small' },
  { place: 16, gold: 200, trophies: 15, chest: 'small' },
];

export class CircuitService {
  private db: Db;
  private tournaments: TournamentService;
  constructor(db: Db, tournaments: TournamentService) {
    this.db = db;
    this.tournaments = tournaments;
  }

  standings(season: number): CircuitStandings {
    return this.db.getDoc<CircuitStandings>('circuit', String(season)) ?? { season, entries: {}, counted: [] };
  }

  ranking(season: number): (CircuitEntry & { rank: number })[] {
    return Object.values(this.standings(season).entries)
      .sort((a, b) => b.points - a.points || b.majorWins - a.majorWins || a.name.localeCompare(b.name))
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  pointsOf(season: number, playerId: string): number {
    return this.standings(season).entries[playerId]?.points ?? 0;
  }

  /** Make sure the next Monthly Major exists (registration opens two weeks before it starts). */
  tick(now: number): Tournament | null {
    const season = circuitSeason(now);
    const slots = [...seasonMajors(season), ...seasonMajors(season + 1)];
    const next = slots.find((m) => m.startsAt > now);
    if (!next || now < next.registrationOpensAt) return null;
    if (this.tournaments.list().some((t) => t.series === next.series)) return null;
    return this.tournaments.create({
      name: next.name,
      series: next.series,
      format: 'double',
      startsAt: next.startsAt,
      checkinOpensAt: next.startsAt - CIRCUIT.checkinMinutes * 60_000,
      minPlayers: 4,
      maxPlayers: 128,
      planningSeconds: 40,
      prizes: majorPrizes(MONTHS[next.month]!),
      featured: true,
      requirement: { minMmr: CIRCUIT.majorMinMmr },
      circuit: { season: next.season, month: next.month, year: next.year },
    });
  }

  /** Called when any tournament finishes: Majors award Circuit Points. */
  onTournamentFinished(t: Tournament): void {
    if (!t.circuit || !t.placements) return;
    const st = this.standings(t.circuit.season);
    if (st.counted.includes(t.series)) return;
    const played = new Set(t.bracket?.matches.filter((m) => m.status === 'done').flatMap((m) => [m.a, m.b]) ?? []);
    for (const p of t.placements) {
      const reg = t.registrations.find((r) => r.playerId === p.playerId);
      if (reg?.isBot || !played.has(p.playerId)) continue;
      const pts = pointsFor(p.place);
      const e = (st.entries[p.playerId] ??= { playerId: p.playerId, name: p.name, points: 0, majors: [], majorWins: 0 });
      e.name = p.name;
      e.points += pts;
      e.majors.push({ series: t.series, name: t.name, place: p.place, points: pts });
      if (p.place === 1) e.majorWins++;
    }
    st.counted.push(t.series);
    this.db.putDoc('circuit', String(st.season), st);
  }

  /** Major champions first (in calendar order), then the points race, max 12 direct World Cup seeds. */
  directQualifiers(season: number): { playerId: string; name: string; via: string }[] {
    const out: { playerId: string; name: string; via: string }[] = [];
    const seen = new Set<string>();
    const majors = this.tournaments
      .list()
      .filter((t) => t.circuit?.season === season && t.status === 'finished' && t.placements?.length)
      .sort((a, b) => a.startsAt - b.startsAt);
    for (const t of majors) {
      const champ = t.placements!.find((p) => p.place === 1)!;
      const reg = t.registrations.find((r) => r.playerId === champ.playerId);
      if (reg?.isBot || seen.has(champ.playerId)) continue;
      seen.add(champ.playerId);
      out.push({ playerId: champ.playerId, name: champ.name, via: `${t.name} champion` });
    }
    for (const e of this.ranking(season)) {
      if (out.length >= CIRCUIT.maxDirect) break;
      if (seen.has(e.playerId) || e.rank > CIRCUIT.directFromPoints) continue;
      seen.add(e.playerId);
      out.push({ playerId: e.playerId, name: e.name, via: `Circuit #${e.rank} (${e.points} pts)` });
    }
    return out.slice(0, CIRCUIT.maxDirect);
  }

  /** Season calendar for the client. */
  calendar(season: number) {
    const ts = this.tournaments.list();
    const wm = halloweenSchedule(season);
    return {
      season,
      majors: seasonMajors(season).map((m) => {
        const t = ts.find((x) => x.series === m.series);
        return { ...m, tournamentId: t?.id ?? null, status: t?.status ?? 'upcoming', champion: t?.placements?.find((p) => p.place === 1)?.name ?? null, players: t?.registrations.length ?? 0 };
      }),
      worldCup: wm,
      rules: CIRCUIT,
      points: CIRCUIT_POINTS,
    };
  }
}
