// High-level match API used by the client (offline/local), the server (authoritative) and bots.

import { BOSSES, CHARACTERS } from './data/characters.ts';
import { levelMult } from './formulas.ts';
import { hashString } from './rng.ts';
import { addEvent, createMatch, createUnitFromCard, deployZoneTiles, freshRound, type CreateMatchOptions } from './state.ts';
import { distance } from './hex.ts';
import { resolveRound, startRound, type RoundResult } from './resolve.ts';
import type { GameState, Plan, PlayerId } from './types.ts';

export function newMatch(opts: CreateMatchOptions): GameState {
  const s = createMatch(opts);
  if (s.settings.mode === 'anomaly') spawnBoss(s, 1, s.settings.bossId ?? 'matriarch');
  startRound(s);
  return s;
}

/** ANOMALY: a Boss with buffed stats stands in player 1's zone from the start. */
export function spawnBoss(s: GameState, p: PlayerId, bossId: string): void {
  const b = BOSSES[bossId] ?? BOSSES.matriarch!;
  const base = CHARACTERS[b.base]!;
  const zone = deployZoneTiles(s, p);
  const centre = { c: Math.floor(s.settings.bounds.cols / 2), r: Math.floor(s.settings.bounds.rows / 2) };
  const tile = zone.filter((h) => !s.tiles.find((t) => t.c === h.c && t.r === h.r)?.wall).sort((a, c) => distance(a, centre) - distance(c, centre))[0]!;
  const u = createUnitFromCard(s, p, { uid: `boss-${bossId}`, defId: base.id, level: s.settings.friendly ? 10 : 5, tuning: {} }, tile);
  u.cardUid = undefined;
  u.name = b.name;
  u.tier = 'boss';
  u.maxHp = Math.round(base.stats.hp * levelMult(u.level) * b.hpMult);
  u.baseMaxHp = u.maxHp;
  u.hp = u.maxHp;
  u.stats = {
    patk: Math.round(base.stats.patk * b.atkMult),
    satk: Math.round(base.stats.satk * b.atkMult),
    pdef: Math.round(base.stats.pdef * b.defMult),
    sdef: Math.round(base.stats.sdef * b.defMult),
    speed: Math.round(base.stats.speed * b.speedMult),
  };
  u.data.boss = bossId;
  u.deployedRound = 0;
  u.rt = freshRound(u);
  s.units.push(u);
  addEvent(s, { kind: 'summon', text: `${b.name} awakens!`, actor: u.uid, to: tile });
}

export function playRound(s: GameState, plans: [Plan, Plan]): RoundResult {
  if (s.phase === 'over') return { events: [], winner: s.winner };
  return resolveRound(s, plans);
}

/** Stable hash of the authoritative state (anti-cheat replay checks, lockstep desync detection). */
export function stateHash(s: GameState): string {
  const slim = {
    round: s.round,
    rng: s.rng.s,
    units: s.units.map((u) => [u.uid, u.pos.c, u.pos.r, u.hp, u.maxHp, u.statuses.map((x) => `${x.id}${x.stacks}${x.duration}`).join('|')]),
    vp: s.players.map((p) => p.vp),
    ap: s.players.map((p) => p.ap),
    fields: s.tiles.map((t) => t.fields.map((f) => f.id).join('+')).join(','),
  };
  return hashString(JSON.stringify(slim)).toString(16).padStart(8, '0');
}

export function isOver(s: GameState): boolean {
  return s.phase === 'over';
}
