// Teams (clans): create or join a team, a team page with its roster, and the team ladder.
// The team rating is the mean Team MMR of its five best members; Team Battles between two
// premade parties of different teams also count as team wins and losses.

import { randomBytes } from 'node:crypto';
import type { Db, PlayerRow } from './db.ts';
import type { PlayerService } from './players.ts';
import { divisionFor, START_MMR } from './rating.ts';

export const TEAM_MAX = 12;

export interface Team {
  id: string;
  name: string;
  tag: string;
  motto: string;
  open: boolean;
  created: number;
  captain: string;
  members: { playerId: string; joined: number; role: 'captain' | 'member' }[];
  wins: number;
  losses: number;
  draws: number;
}

export interface TeamView extends Team {
  rating: number;
  division: string;
  roster: { playerId: string; name: string; role: string; mmr: number; teamMmr: number; games: number; wins: number }[];
}

function cleanName(raw: unknown, max: number): string {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N} _\-.']/gu, '')
    .trim()
    .slice(0, max);
}

export class TeamService {
  private db: Db;
  private players: PlayerService;
  constructor(db: Db, players: PlayerService) {
    this.db = db;
    this.players = players;
  }

  get(id: string): Team | undefined {
    return this.db.getDoc<Team>('team', id);
  }

  private save(t: Team): void {
    this.db.putDoc('team', t.id, t);
  }

  view(t: Team): TeamView {
    const roster = t.members
      .map((m) => ({ m, p: this.players.byId(m.playerId) }))
      .filter((x): x is { m: Team['members'][number]; p: PlayerRow } => !!x.p)
      .map(({ m, p }) => ({ playerId: p.id, name: p.name, role: m.role, mmr: Math.round(p.mmr), teamMmr: Math.round(p.team_mmr), games: p.games, wins: p.wins }))
      .sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : b.teamMmr - a.teamMmr));
    const best = roster.map((r) => r.teamMmr).sort((a, b) => b - a).slice(0, 5);
    const rating = best.length ? Math.round(best.reduce((a, b) => a + b, 0) / best.length) : START_MMR;
    return { ...t, rating, division: divisionFor(rating).label, roster };
  }

  ladder(limit = 100): (TeamView & { rank: number })[] {
    return this.db
      .listDocs<Team>('team')
      .map((t) => this.view(t))
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
      .slice(0, limit)
      .map((t, i) => ({ ...t, rank: i + 1 }));
  }

  teamOf(playerId: string): Team | undefined {
    const p = this.players.byId(playerId);
    return p?.team_id ? this.get(p.team_id) : undefined;
  }

  create(p: PlayerRow, input: { name?: unknown; tag?: unknown; motto?: unknown; open?: unknown }): { ok: boolean; error?: string; team?: TeamView } {
    if (this.teamOf(p.id)) return { ok: false, error: 'Leave your current team first' };
    const name = cleanName(input.name, 24);
    const tag = cleanName(input.tag, 4).replace(/\s/g, '').toUpperCase();
    if (name.length < 3) return { ok: false, error: 'Team name needs at least 3 characters' };
    if (tag.length < 2) return { ok: false, error: 'Tag needs 2–4 letters or digits' };
    const taken = this.db.listDocs<Team>('team').some((t) => t.name.toLowerCase() === name.toLowerCase() || t.tag === tag);
    if (taken) return { ok: false, error: 'Name or tag is already taken' };
    const now = Date.now();
    const t: Team = {
      id: `team_${randomBytes(4).toString('hex')}`,
      name,
      tag,
      motto: cleanName(input.motto, 80),
      open: input.open !== false,
      created: now,
      captain: p.id,
      members: [{ playerId: p.id, joined: now, role: 'captain' }],
      wins: 0,
      losses: 0,
      draws: 0,
    };
    this.save(t);
    this.players.setTeam(p.id, t.id);
    return { ok: true, team: this.view(t) };
  }

  join(p: PlayerRow, teamId: string): { ok: boolean; error?: string; team?: TeamView } {
    const t = this.get(teamId);
    if (!t) return { ok: false, error: 'Unknown team' };
    if (this.teamOf(p.id)) return { ok: false, error: 'Leave your current team first' };
    if (!t.open) return { ok: false, error: 'This team is invite-only' };
    if (t.members.length >= TEAM_MAX) return { ok: false, error: `Teams have at most ${TEAM_MAX} members` };
    t.members.push({ playerId: p.id, joined: Date.now(), role: 'member' });
    this.save(t);
    this.players.setTeam(p.id, t.id);
    return { ok: true, team: this.view(t) };
  }

  leave(p: PlayerRow): { ok: boolean; error?: string } {
    const t = this.teamOf(p.id);
    if (!t) return { ok: false, error: 'You are not in a team' };
    t.members = t.members.filter((m) => m.playerId !== p.id);
    this.players.setTeam(p.id, null);
    if (!t.members.length) {
      this.db.deleteDoc('team', t.id);
      return { ok: true };
    }
    if (t.captain === p.id) {
      // the longest-serving member inherits the captaincy
      const heir = t.members.slice().sort((a, b) => a.joined - b.joined)[0]!;
      heir.role = 'captain';
      t.captain = heir.playerId;
    }
    this.save(t);
    return { ok: true };
  }

  /** Team Battle result: counts when each side is a premade party from one team. */
  recordBattle(sides: [string[], string[]], winnerTeam: 0 | 1 | null): void {
    const teamOfSide = (ids: string[]) => {
      const tids = new Set(ids.map((id) => this.players.byId(id)?.team_id ?? null));
      return tids.size === 1 ? [...tids][0] : null;
    };
    const ta = teamOfSide(sides[0]);
    const tb = teamOfSide(sides[1]);
    if (!ta || !tb || ta === tb) return;
    for (const [tid, side] of [[ta, 0], [tb, 1]] as const) {
      const t = this.get(tid);
      if (!t) continue;
      if (winnerTeam === null) t.draws++;
      else if (winnerTeam === side) t.wins++;
      else t.losses++;
      this.save(t);
    }
  }
}
