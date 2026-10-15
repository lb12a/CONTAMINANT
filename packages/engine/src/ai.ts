// Bot planner. Works only on the bot's own fog-of-war view (no cheating), scores candidate
// actions with the real damage/hit formulas and respects every planning rule.
// "Learning": optional per-card weights (from telemetry win rates) bias deployments and item use.

import { CHARACTERS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { computeDamage, hitChance } from './formulas.ts';
import { distance, eq, neighbors, ring, burst, cone, coneWedgeToward, directionTo, type Hex } from './hex.ts';
import { makeRng, rand, shuffle, hashString, type RngState } from './rng.ts';
import { attacksOf, activeAbilities } from './actions.ts';
import { bounds, charactersOnBoard, getUnit, inZone, isFree, tileAt } from './state.ts';
import { accuracyMods, damageMods, effectiveAtk, effectiveDef, hasChar, hasLos, hasStatus, hpPct, maxMove, tagMultiplier } from './stats.ts';
import { canEnd, canPass, pathCost, canMoveVoluntarily } from './movement.ts';
import { deployCost, validatePlan, MAX_ON_BOARD } from './planning.ts';
import { fieldTileAllowed, itemCost, trapTileAllowed } from './itemfx.ts';
import { viewFor } from './visibility.ts';
import type { AttackDef, Command, GameState, Plan, PlayerId, Unit } from './types.ts';
import { KO_VP } from './formulas.ts';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';

export interface BotOptions {
  difficulty?: Difficulty;
  /** learned preference weights by defId / itemId (1 = neutral) */
  weights?: Record<string, number>;
  seed?: number;
}

interface Reach {
  pos: Hex;
  path: Hex[];
  cost: number;
}

/** BFS over tiles the unit can reach with one Move command (≤ max fields). */
export function reachable(s: GameState, u: Unit, maxFields: number): Reach[] {
  const out: Reach[] = [{ pos: { ...u.pos }, path: [], cost: 0 }];
  if (maxFields <= 0) return out;
  const seen = new Map<string, Hex[]>();
  seen.set(`${u.pos.c},${u.pos.r}`, []);
  let frontier: { pos: Hex; path: Hex[] }[] = [{ pos: u.pos, path: [] }];
  for (let d = 0; d < maxFields; d++) {
    const next: { pos: Hex; path: Hex[] }[] = [];
    for (const f of frontier) {
      for (const n of neighbors(f.pos, bounds(s))) {
        const k = `${n.c},${n.r}`;
        if (seen.has(k)) continue;
        if (!canPass(s, u, n)) continue;
        const path = [...f.path, n];
        seen.set(k, path);
        next.push({ pos: n, path });
        if (canEnd(s, u, n)) out.push({ pos: n, path, cost: pathCost(s, u, path) });
      }
    }
    frontier = next;
  }
  return out;
}

function estimateHit(s: GameState, att: Unit, from: Hex, a: AttackDef, t: Unit, power?: number): { dmg: number; p: number } {
  if (!a.power && !power) return { dmg: 0, p: 0 };
  const cat = a.category === 'physical' ? 'physical' : 'special';
  const saved = att.pos;
  att.pos = from;
  const tm = tagMultiplier(s, t, { tag: a.tag ?? 'blunt', category: cat, area: !!a.shape && a.shape !== 'single' });
  const dm = damageMods(s, att, t, { tag: a.tag ?? 'blunt', category: cat, area: false });
  const acc = a.acc === null ? 100 : hitChance(a.acc, accuracyMods(s, att, t).total);
  att.pos = saved;
  const calc = computeDamage({ power: power ?? a.power ?? 0, atk: effectiveAtk(att, cat), def: effectiveDef(s, t, cat), tagProduct: tm.product, crit: false, modSum: dm.sum, level: att.level });
  return { dmg: calc.final * (1 + (a.crit / 100) * 0.5), p: acc / 100 };
}

function koValue(t: Unit): number {
  if (t.isObject || t.isSummon) return 5;
  return (KO_VP[t.tier] ?? 10) * 4;
}

interface Option {
  score: number;
  cmds: Command[];
  ap: number;
  endPos: Hex;
  attackId?: string;
}

function attackOptions(s: GameState, u: Unit, a: AttackDef, positions: Reach[], enemies: Unit[], allies: Unit[], p: PlayerId): Option[] {
  const out: Option[] = [];
  const b = bounds(s);
  for (const r of positions) {
    const moveCmd: Command[] = r.path.length ? [{ kind: 'move', unit: u.uid, path: r.path }] : [];
    const base = { cmds: moveCmd, ap: r.cost + a.ap, endPos: r.pos, attackId: a.id };
    const custom = a.custom ?? '';
    if (a.category === 'support' || custom === 'bedside_manner' || custom === 'mind_root' || custom === 'marigold_garland' || custom === 'overclock') {
      // heals / buffs on allies
      for (const ally of [u, ...allies]) {
        if (distance(r.pos, ally.pos) > a.range) continue;
        let score = 0;
        if (custom === 'bedside_manner' || custom === 'mind_root') score = (1 - hpPct(ally)) * ally.maxHp * 0.6;
        else if (custom === 'marigold_garland') score = (u.counters.souls ?? 0) >= 3 && hpPct(ally) < 0.5 ? 60 : 0;
        else if (custom === 'overclock') score = hasStatus(ally, 'corruption') ? 50 : 0;
        if (custom === 'mind_root' && ally.data.symbiosisWith !== u.uid) score = 0;
        if (score > 5) out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { unit: ally.uid } }] });
      }
      if (a.statuses?.length && a.category === 'support') {
        for (const e of enemies) {
          if (distance(r.pos, e.pos) > a.range || !hasLos(s, r.pos, e.pos)) continue;
          out.push({ ...base, score: 25, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { unit: e.uid } }] });
        }
      }
      continue;
    }
    if (a.targeting === 'self') {
      const tiles = a.shape === 'burst2' ? burst(r.pos, 2, b) : ring(r.pos, 1, b);
      let score = 0;
      for (const h of tiles) {
        for (const t of [...enemies, ...allies]) {
          if (!eq(t.pos, h) || t === u) continue;
          const { dmg } = estimateHit(s, u, r.pos, a, t);
          const v = Math.min(dmg, t.hp) + (dmg >= t.hp ? koValue(t) : 0);
          score += t.owner === p ? (a.enemiesOnly ? 0 : -v * 1.2) : v;
        }
      }
      if (score > 10) out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: {} }] });
      continue;
    }
    if (a.targeting === 'field' || a.targeting === 'multi-field') {
      for (const e of enemies) {
        if (distance(r.pos, e.pos) > a.range + (custom === 'lance' || custom === 'flaming_skull' ? 0 : 0)) continue;
        let tiles: Hex[] = [e.pos];
        if (a.shape === 'cone3') tiles = cone(r.pos, coneWedgeToward(r.pos, e.pos), 3, b);
        if (a.shape === 'ring1' || custom === 'order_up') tiles = ring(e.pos, 1, b);
        let score = 0;
        for (const t of [...enemies, ...allies]) {
          if (!tiles.some((h) => eq(h, t.pos)) || t === u) continue;
          const { dmg, p: hp } = estimateHit(s, u, r.pos, a, t, custom === 'candy_rain' ? 65 : undefined);
          const v = (Math.min(dmg, t.hp) + (dmg >= t.hp ? koValue(t) : 0)) * hp;
          score += t.owner === p ? -v * 1.2 : v;
        }
        if (custom === 'marsh_gas' || custom === 'orb_bomb' || custom === 'barbed_fence') score = 20;
        if (custom === 'ant_trail') continue;
        if (custom === 'gnaw_swarm') score = Math.max(score, 15);
        if (['lance', 'flaming_skull', 'moonlit_charge', 'sporecloud', 'mire_song'].includes(custom)) {
          // direction attacks: aim at the unit so the direction follows it at execution
          if (score > 5) out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { unit: e.uid, tile: e.pos } }] });
          continue;
        }
        if (custom === 'order_up') {
          const land = neighbors(e.pos, b).find((h) => isFree(s, h) && distance(r.pos, h) <= a.range);
          if (!land) continue;
          out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tile: land } }] });
          continue;
        }
        if (custom === 'teleport_trick') {
          const land = neighbors(e.pos, b).find((h) => isFree(s, h) && distance(r.pos, h) <= a.range);
          if (!land) continue;
          out.push({ ...base, score: score * 0.9, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tile: land } }] });
          continue;
        }
        if (custom === 'candy_rain') {
          const tilesTargets = enemies.filter((x) => distance(r.pos, x.pos) <= a.range).slice(0, 3).map((x) => x.pos);
          out.push({ ...base, score: score * Math.max(1, tilesTargets.length), cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tiles: tilesTargets } }] });
          continue;
        }
        if (custom === 'prismatic_beam' || custom === 'box_leap' || custom === 'barbed_fence') {
          if (custom === 'box_leap') continue;
          out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tiles: [e.pos] } }] });
          continue;
        }
        if (custom === 'strike_the_hour') {
          out.push({ ...base, score: score * 0.5, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tile: e.pos } }] });
          continue;
        }
        if (score > 5) out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { tile: e.pos } }] });
      }
      continue;
    }
    if (a.targeting === 'vector') continue; // Trainticket: used by hard bots below
    if (a.targeting === 'ally') continue;
    // character target
    for (const t of enemies) {
      const d = distance(r.pos, t.pos);
      if (d > a.range) continue;
      if (!a.ignoresLos && !hasLos(s, r.pos, t.pos, u)) continue;
      let power = a.power;
      if (a.custom === 'penny_shot') power = 50 * (1 + 0.1 * Math.min(6, u.counters.coins ?? 0));
      if (a.custom === 'crash') power = 40 * (1 + (1 - hpPct(u)));
      if (a.custom === 'claw_rake') power = u.form === 'wolf' ? 85 : 60;
      if (a.custom === 'lay_eggs' && t.chars.existence !== 'living') continue;
      if (a.custom === 'shake_down') continue;
      const { dmg, p: hp } = estimateHit(s, u, r.pos, a, t, power);
      let score = (Math.min(dmg, t.hp) + (dmg >= t.hp ? koValue(t) : 0)) * hp;
      if (a.statuses?.length) score += 8 * a.statuses.length;
      if (a.custom === 'scalpel_backstab' && hasStatus(t, 'patient')) score *= 1.35;
      out.push({ ...base, score, cmds: [...moveCmd, { kind: 'attack', unit: u.uid, attack: a.id, target: { unit: t.uid } }] });
    }
  }
  return out;
}

/** Fields that hurt or hinder whoever ends a move on them. */
const HARMFUL_FIELDS = new Set(['fire', 'wildfire', 'scalded', 'toxic', 'toxic_smoke', 'acid', 'diluted_acid', 'electrified_water', 'contaminated_water', 'radiation', 'shock_storm', 'corrupted', 'snare', 'swamp']);

function hazard(s: GameState, h: Hex, u: Unit): number {
  const t = tileAt(s, h);
  if (!t) return 0;
  let n = 0;
  for (const f of t.fields) if (HARMFUL_FIELDS.has(f.id) && !(f.id === 'corrupted' && u.defId === 'nexus')) n += f.id === 'snare' || f.id === 'swamp' ? 1 : 3;
  return n;
}

/**
 * Walking distance to `goal` around walls (BFS over every tile without a wall; other units are ignored
 * because they move too). Tiles that cannot reach the goal get Infinity.
 */
function distanceField(s: GameState, u: Unit, goal: Hex): Map<string, number> {
  const field = new Map<string, number>();
  const k = (h: Hex) => `${h.c},${h.r}`;
  const passable = (h: Hex) => {
    const t = tileAt(s, h);
    return !!t && (!t.wall || hasChar(u, 'phasing') || hasChar(u, 'burrowing'));
  };
  field.set(k(goal), 0);
  let frontier = [goal];
  let d = 0;
  while (frontier.length) {
    d++;
    const next: Hex[] = [];
    for (const f of frontier) {
      for (const n of neighbors(f, bounds(s))) {
        if (field.has(k(n)) || !passable(n)) continue;
        field.set(k(n), d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return field;
}

/**
 * Best reachable position toward `goal`: real walking distance around walls (no dead ends behind a
 * wall), the wanted range for ranged attackers, then fewer hazards and cheaper paths.
 */
function moveToward(s: GameState, u: Unit, goal: Hex, positions: Reach[], keepRange: number): Reach | null {
  const field = distanceField(s, u, goal);
  const walk = (h: Hex) => field.get(`${h.c},${h.r}`) ?? 99;
  const score = (r: Reach) => {
    const w = walk(r.pos);
    const rangeMiss = keepRange > 1 ? Math.abs(distance(r.pos, goal) - keepRange) * 1.5 + (w > keepRange + 2 ? w - keepRange : 0) : Math.abs(w - keepRange);
    return rangeMiss + hazard(s, r.pos, u) * 2 + r.cost * 0.05;
  };
  let best: Reach | null = null;
  let bestScore = score({ pos: u.pos, path: [], cost: 0 });
  for (const r of positions) {
    if (!r.path.length) continue;
    const sc = score(r);
    if (sc < bestScore - 0.01) {
      bestScore = sc;
      best = r;
    }
  }
  return best;
}

/** A badly hurt creature with no finishing blow falls back toward its allies, away from enemies. */
function retreat(s: GameState, u: Unit, positions: Reach[], enemies: Unit[], allies: Unit[]): Reach | null {
  if (!enemies.length) return null;
  const threat = (h: Hex) => enemies.reduce((m, e) => Math.min(m, distance(e.pos, h)), 99);
  const support = (h: Hex) => (allies.length ? allies.reduce((m, a) => Math.min(m, distance(a.pos, h)), 99) : 0);
  let best: Reach | null = null;
  let bestScore = threat(u.pos) * 2 - support(u.pos) * 0.5 - hazard(s, u.pos, u) * 3;
  for (const r of positions) {
    if (!r.path.length) continue;
    const sc = threat(r.pos) * 2 - support(r.pos) * 0.5 - hazard(s, r.pos, u) * 3 - r.cost * 0.1;
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }
  return best;
}

export function botPlan(real: GameState, p: PlayerId, opts: BotOptions = {}): Plan {
  const difficulty = opts.difficulty ?? 'normal';
  const s = viewFor(real, p);
  const rng: RngState = makeRng(opts.seed ?? hashString(`${real.seed}:${real.round}:${p}:bot`));
  const pl = s.players[p];
  const enemyId: PlayerId = p === 0 ? 1 : 0;
  const cmds: Command[] = [];
  const rest: string[] = [];
  let ap = pl.ap;
  const w = (id: string) => opts.weights?.[id] ?? 1;
  const reserve = (n: number) => {
    if (n > ap) return false;
    ap -= n;
    return true;
  };

  const mine = s.units.filter((u) => u.owner === p && !u.isObject && u.deployedRound < s.round);
  const enemies = s.units.filter((u) => u.owner === enemyId && !u.isObject);
  const objectives = s.tiles.filter((t) => t.objective === 'control' || t.objective === 'lab').map((t) => ({ c: t.c, r: t.r }));
  const occupied: Hex[] = [];

  // ---------------- deployments
  const onBoard = charactersOnBoard(s, p).length;
  const wantBoard = difficulty === 'easy' ? 3 : 4;
  const offered = shuffle(rng, pl.offered.slice()).sort((a, b) => {
    const da = CHARACTERS[real.players[p].cards.find((c) => c.uid === a.cardUid)?.defId ?? '']!;
    const db = CHARACTERS[real.players[p].cards.find((c) => c.uid === b.cardUid)?.defId ?? '']!;
    return (db?.deploy ?? 0) * w(db?.id ?? '') - (da?.deploy ?? 0) * w(da?.id ?? '');
  });
  let deployed = 0;
  const zone = s.tiles.filter((t) => inZone(s, p, t) && isFree(s, t)).map((t) => ({ c: t.c, r: t.r }));
  const centre = { c: Math.floor(s.settings.bounds.cols / 2), r: Math.floor(s.settings.bounds.rows / 2) };
  zone.sort((a, b) => distance(a, centre) - distance(b, centre) + (rand(rng) - 0.5) * 0.5);
  for (const o of offered) {
    if (onBoard + deployed >= Math.min(MAX_ON_BOARD, wantBoard + (s.round > 3 ? 1 : 0))) break;
    const card = real.players[p].cards.find((c) => c.uid === o.cardUid);
    if (!card) continue;
    const tile = zone.find((h) => !occupied.some((x) => eq(x, h)));
    if (!tile) break;
    const cost = deployCost(real, p, card.defId, tile).cost;
    const keepForActions = mine.length ? 4 : 0;
    if (cost > ap - keepForActions && !(mine.length === 0 && cost <= ap)) continue;
    if (!reserve(cost)) continue;
    occupied.push(tile);
    const choice: { mood?: string; tile?: Hex } = {};
    if (card.defId === 'pokerface') choice.mood = enemies.length && rand(rng) < 0.5 ? 'angry' : rand(rng) < 0.5 ? 'happy' : 'sad';
    cmds.push({ kind: 'deploy', card: card.uid, tile, choice });
    deployed++;
  }

  // ---------------- unit actions
  const planned: { u: Unit; score: number }[] = [];
  for (const u of shuffle(rng, mine.slice())) {
    if (hasStatus(u, 'entranced')) continue;
    const allies = mine.filter((x) => x !== u);
    const mm = canMoveVoluntarily(real, getUnit(real, u.uid)!) ? 0 : u.defId === 'shrink_head' ? 2 : maxMove(s, u);
    const positions = reachable(s, u, Math.min(mm, 5)).filter((r) => !occupied.some((x) => eq(x, r.pos)) || eq(r.pos, u.pos));
    const atks = attacksOf(s, u);
    const options: Option[] = [];
    for (const a of atks) options.push(...attackOptions(s, u, a, positions.slice(0, 40), enemies, allies, p));
    options.sort((a, b) => b.score / Math.max(1, b.ap) - a.score / Math.max(1, a.ap));
    let chosen: Option | undefined = options.find((o) => o.ap <= ap && o.score > (difficulty === 'easy' ? 15 : 8));
    if (difficulty === 'easy' && options.length && rand(rng) < 0.3) chosen = options[Math.floor(rand(rng) * Math.min(3, options.length))];
    if (chosen && chosen.ap <= ap) {
      reserve(chosen.ap);
      cmds.push(...chosen.cmds);
      occupied.push(chosen.endPos);
      planned.push({ u, score: chosen.score });
      // second attack with the same weapon if uses and AP allow (normal+)
      if (difficulty !== 'easy') {
        const a = atks.find((x) => x.id === chosen!.attackId);
        const last = chosen.cmds[chosen.cmds.length - 1]!;
        if (a && a.maxUses >= 2 && a.ap <= ap && last.kind === 'attack' && a.targeting === 'character') {
          const t = getUnit(s, last.target.unit);
          if (t && estimateHit(s, u, chosen.endPos, a, t).dmg < t.hp) {
            reserve(a.ap);
            cmds.push({ ...last });
          }
        }
      }
      continue;
    }
    // badly hurt and nothing worth hitting: fall back toward allies (normal+)
    if (difficulty !== 'easy' && hpPct(u) <= 0.25 && !options.some((o) => o.score > 30)) {
      const back = retreat(s, u, positions, enemies, allies);
      if (back && back.cost <= ap) {
        reserve(back.cost);
        cmds.push({ kind: 'move', unit: u.uid, path: back.path });
        occupied.push(back.pos);
        continue;
      }
    }
    // no good attack: move toward the nearest enemy, or hold an objective
    const onObjective = objectives.some((h) => eq(h, u.pos));
    if (onObjective && difficulty !== 'easy') {
      cmds.push({ kind: 'hold', unit: u.uid });
      continue;
    }
    const ranged = atks.some((a) => a.range >= 4);
    const nearestEnemy = enemies.slice().sort((a, b) => distance(a.pos, u.pos) - distance(b.pos, u.pos) + (a.hp - b.hp) / 2000)[0];
    const nearestObj = objectives.slice().sort((a, b) => distance(a, u.pos) - distance(b, u.pos))[0];
    const goal = nearestEnemy && (!nearestObj || distance(nearestEnemy.pos, u.pos) < 6) ? nearestEnemy.pos : nearestObj;
    if (!goal) continue;
    const mv = moveToward(s, u, goal, positions, nearestEnemy && goal === nearestEnemy.pos && ranged ? 3 : nearestEnemy && goal === nearestEnemy.pos ? 1 : 0);
    if (mv && mv.cost <= ap && mv.cost > 0) {
      reserve(mv.cost);
      cmds.push({ kind: 'move', unit: u.uid, path: mv.path });
      occupied.push(mv.pos);
    } else if (mv && mv.cost === 0) {
      cmds.push({ kind: 'move', unit: u.uid, path: mv.path });
      occupied.push(mv.pos);
    }
    // active abilities worth using
    for (const ab of activeAbilities(s, u)) {
      if (ab.id === 'werewolf.moon_pull' && ab.ap <= ap && nearestEnemy && distance(nearestEnemy.pos, u.pos) <= 4) {
        reserve(ab.ap);
        cmds.push({ kind: 'ability', unit: u.uid, ability: ab.id, target: {} });
      }
      if (ab.id === 'common.hack' && ab.ap <= ap) {
        const term = neighbors(u.pos, bounds(s)).find((h) => tileAt(s, h)?.objective === 'terminal' && (tileAt(s, h)?.terminalReadyRound ?? 0) <= s.round);
        if (term) {
          reserve(1);
          cmds.push({ kind: 'ability', unit: u.uid, ability: ab.id, target: { tile: term } });
        }
      }
    }
    if (u.defId === 'cymbal_chimp' && nearestEnemy && distance(nearestEnemy.pos, u.pos) <= 1 && difficulty !== 'easy') rest.push(u.uid);
  }

  // ---------------- item cards (max 3, ≤2 free, one name per round)
  let cards = pl.cardsPlayedThisRound;
  const names = new Set<string>(pl.itemNamesThisRound);
  for (const card of shuffle(rng, pl.hand.slice())) {
    if (cards >= 3 || card.tarnished) continue;
    const it = ITEMS[card.itemId];
    if (!it || names.has(it.name)) continue;
    const cost = itemCost(real, p, it.id);
    if (cost > ap) continue;
    const pref = w(it.id) * (difficulty === 'easy' ? 0.5 : 1);
    if (rand(rng) > Math.min(0.95, 0.55 * pref + (difficulty === 'hard' || difficulty === 'boss' ? 0.25 : 0))) continue;
    let cmd: Command | null = null;
    const hurt = mine.slice().sort((a, b) => hpPct(a) - hpPct(b))[0];
    const strongest = mine.slice().sort((a, b) => b.maxHp - a.maxHp)[0];
    const cluster = enemies
      .map((e) => ({ e, n: enemies.filter((o) => distance(o.pos, e.pos) <= 1).length }))
      .sort((a, b) => b.n - a.n)[0]?.e;
    switch (it.type) {
      case 'character':
        if (['field_medkit', 'second_wind'].includes(it.id) && hurt && hpPct(hurt) < 0.5) cmd = { kind: 'item', card: card.uid, target: { unit: hurt.uid } };
        if (['iron_tonic', 'rage_pill', 'adrenaline_shot'].includes(it.id) && strongest && enemies.length) cmd = { kind: 'item', card: card.uid, target: { unit: strongest.uid } };
        if (it.id === 'smelling_salts' && hurt && hurt.statuses.some((x) => ['shock', 'fear', 'blind', 'slow', 'silence'].includes(x.id))) cmd = { kind: 'item', card: card.uid, target: { unit: hurt.uid } };
        if (it.id === 'antidote') {
          const pois = mine.find((x) => x.statuses.some((y) => ['poison', 'infection', 'egg', 'leeched'].includes(y.id)));
          if (pois) cmd = { kind: 'item', card: card.uid, target: { unit: pois.uid } };
        }
        if (it.id === 'phoenix_feather' && strongest && hpPct(strongest) < 0.6) cmd = { kind: 'item', card: card.uid, target: { unit: strongest.uid } };
        if (it.id === 'midas_touch_card' && strongest) cmd = { kind: 'item', card: card.uid, target: { unit: strongest.uid } };
        break;
      case 'field':
        if (cluster && fieldTileAllowed(real, p, cluster.pos) && !['seed_bomb', 'moon_charm', 'rain_barrel', 'emergency_sterilization', 'blackout_lantern', 'smoke_candle'].includes(it.id)) cmd = { kind: 'item', card: card.uid, target: { tile: cluster.pos, dir: directionTo(cluster.pos, centre) } };
        break;
      case 'gear':
        if (strongest && !strongest.gear) cmd = { kind: 'item', card: card.uid, target: { unit: strongest.uid } };
        break;
      case 'trap': {
        const front = s.tiles.filter((t) => trapTileAllowed(real, p, t) && inZone(s, p, t)).sort((a, b) => distance(a, centre) - distance(b, centre))[Math.floor(rand(rng) * 4)];
        if (front && it.cost > 0) cmd = { kind: 'item', card: card.uid, target: { tile: { c: front.c, r: front.r } } };
        break;
      }
      case 'intel':
        if (it.id === 'spy_drone' && real.players[enemyId].cards.some((c) => c.defId === 'lullabun')) cmd = { kind: 'item', card: card.uid, target: {} };
        if (it.id === 'scout_card') cmd = { kind: 'item', card: card.uid, target: {} };
        if (it.id === 'customs_inspector') cmd = { kind: 'item', card: card.uid, target: { choice: 'character' } };
        break;
      case 'attack': {
        const atk = cmds.find((c) => c.kind === 'attack' && !c.item && (() => {
          const u = getUnit(s, c.unit);
          const a = u ? attacksOf(s, u).find((x) => x.id === c.attack) : undefined;
          return !!a && a.category !== 'support' && a.category !== 'utility' && (it.id !== 'scope' || a.targeting === 'character');
        })());
        if (atk && atk.kind === 'attack') {
          atk.item = card.uid;
          ap -= cost;
          cards++;
          names.add(it.name);
        }
        continue;
      }
      default:
        break;
    }
    if (cmd && it.cost === 0 && it.free) continue; // free cards with requirements: skip for simplicity
    if (cmd) {
      cmds.push(cmd);
      ap -= cost;
      cards++;
      names.add(it.name);
    }
  }

  // Idle Bonus: if the plan is weak, save AP (normal+ bots)
  const plan: Plan = { player: p, commands: cmds, rest };
  const check = validatePlan(real, plan);
  return check.plan;
}

export function easyBot(s: GameState, p: PlayerId): Plan {
  return botPlan(s, p, { difficulty: 'easy' });
}
