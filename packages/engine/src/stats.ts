// Derived (effective) values: speed, defense, accuracy and damage modifiers.
// Each function documents which rule from the Game Plan it implements.

import { CHARACTERISTICS } from './data/characteristics.ts';
import { FOG_LIKE } from './data/fields.ts';
import { distance, eq, line, neighbors, type Hex } from './hex.ts';
import { bounds, getUnit, hasField, tileAt } from './state.ts';
import type { AttackDef, DamageTag, GameState, StatusId, StatusInst, Unit } from './types.ts';

export function hasChar(u: Unit, id: string): boolean {
  return (
    u.chars.material === id ||
    u.chars.existence === id ||
    u.chars.movement === id ||
    u.chars.trait === id ||
    u.chars.mind === id
  );
}

export function getStatus(u: Unit, id: StatusId): StatusInst | undefined {
  return u.statuses.find((x) => x.id === id);
}

export function hasStatus(u: Unit, id: StatusId): boolean {
  return u.statuses.some((x) => x.id === id);
}

export function stacks(u: Unit, id: StatusId): number {
  return getStatus(u, id)?.stacks ?? 0;
}

export function gearIs(u: Unit, id: string): boolean {
  return u.gear === id;
}

/** Feral: Gear works at 50% strength (Wolf Pelt exempt). Returns the strength factor of the wearer's gear. */
export function gearStrength(u: Unit): number {
  if (!u.gear) return 0;
  if (u.gear === 'wolf_pelt') return 1;
  return hasChar(u, 'feral') ? 0.5 : 1;
}

export function hpPct(u: Unit): number {
  return u.maxHp > 0 ? u.hp / u.maxHp : 0;
}

export function isAirborne(u: Unit): boolean {
  return hasChar(u, 'airborne');
}

/** Ground fields hit Grounded units fully; Airborne ignores them. */
export function affectedByField(u: Unit, ground: boolean): boolean {
  return !(ground && isAirborne(u));
}

export function friendsWithin(s: GameState, u: Unit, radius: number, opts: { summons?: boolean } = {}): Unit[] {
  return s.units.filter(
    (o) =>
      o.uid !== u.uid &&
      o.owner === u.owner &&
      !o.isObject &&
      (opts.summons !== false || !o.isSummon) &&
      distance(o.pos, u.pos) <= radius,
  );
}

/** Hive Mind: +5% per adjacent friendly Hive Mind unit (Shrink Heads count for the Master), max +15%. */
export function hiveBonus(s: GameState, u: Unit): number {
  if (!hasChar(u, 'hive_mind')) return 0;
  const n = s.units.filter(
    (o) => o.uid !== u.uid && o.owner === u.owner && distance(o.pos, u.pos) === 1 && hasChar(o, 'hive_mind') && !o.isObject,
  ).length;
  return Math.min(0.15, 0.05 * n);
}

export function fullMoon(s: GameState): boolean {
  return s.round > 0 && s.round % 5 === 0;
}

export function onMoonlit(s: GameState, h: Hex): boolean {
  return fullMoon(s) || hasField(s, h, 'moonlit');
}

// ---------------------------------------------------------------- speed

/** Effective Speed used for resolution order (section 1 + statuses + characteristics). */
export function effectiveSpeed(s: GameState, u: Unit): number {
  let sp = u.stats.speed;
  sp *= 1 + u.speedRoll;
  sp *= 1 + u.speedShift / 100;
  const chronal = hasChar(u, 'chronal');
  if (hasStatus(u, 'haste')) sp *= chronal ? 1.125 : 1.25;
  if (hasStatus(u, 'slow')) sp *= chronal ? 0.9 : 0.8;
  if (hasChar(u, 'robust')) sp *= 0.9;
  if (hasStatus(u, 'exhausted')) sp *= 0.85;
  if (hasStatus(u, 'gilded')) sp *= 0.65;
  if (hasStatus(u, 'corruption')) sp *= 1.4;
  if (u.gear === 'aegis_plate') sp *= 1 - 0.1 * gearStrength(u);
  if (hasChar(u, 'amphibious') && hasField(s, u.pos, ['fire', 'ash', 'sterile', 'wildfire'])) sp *= 0.9;
  if (hasStatus(u, 'dazed')) sp -= 20;
  if (hasStatus(u, 'mired') && !hasChar(u, 'burrowing')) sp -= 15;
  if (hasChar(u, 'feral') && hpPct(u) < 0.5) sp += 10;
  if (u.defId === 'calaca') sp += 3 * (u.counters.souls ?? 0);
  if (u.rt?.rest) sp *= 0.5;
  return Math.max(1, Math.round(sp * 100) / 100);
}

export function maxMove(s: GameState, u: Unit): number {
  if (hasChar(u, 'rooted')) return 0;
  let m = u.move + (u.rt?.maxMoveBonus ?? 0);
  if (u.gear === 'lead_boots') m -= 1;
  if (hasStatus(u, 'gilded')) m -= 1;
  return Math.max(0, m);
}

// ---------------------------------------------------------------- defense

export function defenseMult(s: GameState, u: Unit, kind: 'p' | 's'): number {
  let m = 1;
  if (hasStatus(u, 'fortified')) m += 0.2;
  const robust = hasChar(u, 'robust') || hasStatus(u, 'gilded');
  if (!robust && hasStatus(u, 'brittle')) m -= 0.2;
  if (kind === 'p' && !robust) m -= 0.15 * stacks(u, 'corrosion');
  if (hasChar(u, 'grounded') && u.rt && u.rt.moved === 0) m += 0.1;
  if (hasChar(u, 'rooted')) m += 0.2;
  m += hiveBonus(s, u);
  if (kind === 's' && hasChar(u, 'devoted')) m += Math.min(0.2, 0.1 * friendsWithin(s, u, 2).length);
  if (hasStatus(u, 'gilded')) m += 0.4;
  if (u.gear === 'aegis_plate') m += 0.25 * gearStrength(u);
  return Math.max(0.1, m);
}

export function effectiveDef(s: GameState, u: Unit, category: 'physical' | 'special'): number {
  return category === 'physical' ? u.stats.pdef * defenseMult(s, u, 'p') : u.stats.sdef * defenseMult(s, u, 's');
}

export function effectiveAtk(u: Unit, category: 'physical' | 'special'): number {
  return category === 'physical' ? u.stats.patk : u.stats.satk;
}

// ---------------------------------------------------------------- line of sight / accuracy

export function pathTiles(a: Hex, b: Hex): Hex[] {
  return line(a, b);
}

/** Character-Target attacks are blocked by Obstacles and Fog (adjacent targets excepted for Fog). */
export function hasLos(s: GameState, from: Hex, to: Hex, viewer?: Unit): boolean {
  const ln = line(from, to);
  const adjacent = distance(from, to) <= 1;
  for (let i = 1; i < ln.length - 1; i++) {
    const t = tileAt(s, ln[i]!);
    if (!t) return false;
    if (t.wall) return false;
    if (!adjacent && t.fields.some((f) => FOG_LIKE.includes(f.id)) && !(viewer && hasChar(viewer, 'perceptive'))) return false;
  }
  return true;
}

export interface AccContext {
  attack?: AttackDef;
  scope?: boolean;
  firstAction?: boolean;
}

export function accuracyMods(s: GameState, att: Unit, target: Unit | null, ctx: AccContext = {}): { total: number; parts: [string, number][] } {
  const parts: [string, number][] = [];
  const add = (n: string, v: number) => {
    if (v) parts.push([n, v]);
  };
  if (hasStatus(att, 'blind') && att.gear !== 'night_goggles') add('Blind', -30);
  if (hasStatus(att, 'jinx')) add('Jinx', -10);
  if (hasChar(att, 'perceptive')) add('Perceptive', 10);
  if ((att.data.accPenaltyUntil ?? -1) >= s.round) add('Rage Pill', -10);
  const hive = hiveBonus(s, att);
  if (hive) add('Hive Mind', Math.round(hive * 100));
  if (hasChar(att, 'devoted') && friendsWithin(s, att, 3).length === 0) add('Devoted (alone)', -10);
  if (hasChar(att, 'multi_minded') && (ctx.firstAction ?? att.rt.actionsTaken === 0)) add('Multi-Minded', -10);
  if (att.gear === 'night_goggles') add('Night Goggles', Math.round(10 * gearStrength(att)));
  if (ctx.scope) add('Scope', 10);
  if (target) {
    const fear = getStatus(att, 'fear');
    if (fear && fear.source === target.uid) add('Fear', -20);
    if (hasStatus(target, 'marked')) add('Marked', 15);
    if (target.defId === 'arachnia' && hasChar(att, 'emotional') && distance(att.pos, target.pos) <= 2) add('Arachnophobia', -10);
    if (!hasChar(att, 'perceptive') && !hasStatus(target, 'marked')) {
      const path = line(att.pos, target.pos);
      const dark = path.some((h) => hasField(s, h, ['darkness']));
      const fog = path.some((h) => hasField(s, h, FOG_LIKE));
      if (dark) add('Darkness', -15);
      if (fog) add('Fog', -15);
    }
  }
  return { total: parts.reduce((a, p) => a + p[1], 0), parts };
}

// ---------------------------------------------------------------- damage modifiers

export interface DamageContext {
  attack?: AttackDef;
  tag: DamageTag;
  category: 'physical' | 'special';
  area: boolean;
  /** damage from a field/terrain tick */
  fieldDamage?: boolean;
  /** extra modifiers already known by the caller */
  extra?: [string, number][];
}

/** T: product of all characteristic multipliers that apply to the tag (target side). */
export function tagMultiplier(s: GameState, target: Unit, ctx: DamageContext): { product: number; parts: [string, number][] } {
  const parts: [string, number][] = [];
  let p = 1;
  const mul = (n: string, v: number) => {
    if (v !== 1) {
      parts.push([n, v]);
      p *= v;
    }
  };
  for (const cid of Object.values(target.chars)) {
    const c = CHARACTERISTICS[cid];
    const v = c?.tagMult?.[ctx.tag];
    if (v) mul(c!.name, v);
  }
  if (hasChar(target, 'amphibious') && ctx.tag === 'electric' && hasField(s, target.pos, ['water', 'electrified_water', 'contaminated_water'])) mul('Amphibious on Water', 1.25);
  if (hasChar(target, 'colony') && !ctx.fieldDamage) mul(ctx.area ? 'Colony (area)' : 'Colony (single)', ctx.area ? 1.25 : 0.85);
  if (hasChar(target, 'rooted') && ctx.fieldDamage) mul('Rooted (field)', 1.25);
  if (hasStatus(target, 'soaked')) {
    if (ctx.tag === 'electric') mul('Soaked', 1.25);
    if (ctx.tag === 'fire') mul('Soaked', 0.75);
  }
  if (hasStatus(target, 'frozen') && ctx.tag === 'fire') mul('Frozen', 1.25);
  if (target.gear === 'insulated_gloves' && ctx.tag === 'electric') mul('Insulated Gloves', 1 - 0.5 * gearStrength(target));
  return { product: p, parts };
}

/** M: 1 + sum of status, field, ability and item modifiers (attacker and target side). */
export function damageMods(s: GameState, att: Unit | null, target: Unit, ctx: DamageContext): { sum: number; parts: [string, number][] } {
  const parts: [string, number][] = [...(ctx.extra ?? [])];
  const add = (n: string, v: number) => {
    if (v) parts.push([n, v]);
  };
  if (att) {
    const emotionless = hasChar(att, 'emotionless');
    if (hasStatus(att, 'empowered') && !emotionless) add('Empowered', 0.25);
    if (hasStatus(att, 'weakened')) add('Weakened', -0.2);
    if (hasStatus(att, 'depressed')) add('Depressed', -0.25);
    if (hasStatus(att, 'jinx')) add('Jinx', -0.1);
    if (hasStatus(att, 'well_fed') && !emotionless) add('Well Fed', 0.1);
    if (hasStatus(att, 'corruption')) add('Corruption', 0.6);
    if (hasStatus(att, 'gilded')) add('Gilded', 0.3);
    if (hasChar(att, 'feral') && hpPct(att) < 0.5) add('Feral', 0.15);
    if (hasChar(att, 'emotional') && s.players[att.owner].allyKoLastRound) add('Emotional', 0.1);
    if (hasChar(att, 'predatory')) {
      if (hpPct(target) < 0.5) add('Predatory', 0.25);
      else if (target.hp >= target.maxHp) add('Predatory (full HP)', -0.15);
      if (onMoonlit(s, att.pos)) add('Moonlit', 0.1);
    }
    if (hasChar(att, 'parasitic') && ['steel', 'crystal', 'synthetic', 'gas'].includes(target.chars.material)) add('Parasitic', -0.2);
    if (hasChar(att, 'photosynthetic') && hasField(s, att.pos, 'darkness')) add('Darkness', -0.1);
    if (ctx.tag === 'fire' && hasChar(att, 'volatile')) {
      add('Volatile', 0.15);
      if (hasStatus(att, 'soaked')) add('Soaked (Volatile)', -0.5);
    }
    if (ctx.tag === 'electric' && hasChar(att, 'conductive')) add('Conductive', 0.15);
    if (ctx.tag === 'fire' && att.defId === 'calaca') add('Souls', 0.04 * (att.counters.souls ?? 0));
    if (ctx.tag === 'sonic' && hasField(s, att.pos, 'resonance')) add('Resonance', 0.3);
  }
  if (hasStatus(target, 'vulnerable')) add('Vulnerable', 0.2);
  if (hasStatus(target, 'spotlight') && !hasChar(target, 'emotionless')) add('Spotlight', 0.25);
  if (ctx.tag === 'sonic' && hasField(s, target.pos, 'resonance') && !(att && hasField(s, att.pos, 'resonance'))) add('Resonance', 0.3);
  if (target.rt?.hold && !target.rt.firstHitTaken) add('Hold Position', -0.1);
  return { sum: parts.reduce((a, p) => a + p[1], 0), parts };
}

// ---------------------------------------------------------------- status resist and healing

/** Resist reduces status chances: Mythic −20%. Multipliers: Emotional fear ×1.5, Devoted alone fear ×1.25, Living infection ×1.25, Contamination field ×1.25. */
export function statusChanceMods(s: GameState, target: Unit, id: StatusId): { resist: number; mult: number } {
  let resist = 0;
  let mult = 1;
  if (hasChar(target, 'mythic')) resist += 0.2;
  if (id === 'fear' && hasChar(target, 'emotional')) mult *= 1.5;
  if (id === 'fear' && hasChar(target, 'devoted') && friendsWithin(s, target, 3).length === 0) mult *= 1.25;
  if (id === 'infection' && hasChar(target, 'living')) mult *= 1.25;
  if (hasField(s, target.pos, 'contamination')) mult *= 1.25;
  return { resist, mult };
}

export type HealSource = 'generic' | 'poison' | 'souls' | 'marigold' | 'bandage' | 'item';

export function healMult(u: Unit, source: HealSource): number {
  let m = 1;
  if (hasChar(u, 'organic')) m += 0.2;
  if (hasChar(u, 'living')) m += 0.1;
  if (hasChar(u, 'dead') && !['poison', 'souls', 'marigold', 'bandage'].includes(source)) m -= 0.3;
  if (hasChar(u, 'artificial')) m -= 0.25;
  if (u.defId === 'werewolf' && u.form === 'wolf') m -= 0.5;
  return Math.max(0, m);
}

// ---------------------------------------------------------------- visibility

export function isHidden(u: Unit): boolean {
  return hasStatus(u, 'hidden');
}

/** Can player `viewer` currently see unit u? (Hidden units, Perceptive/Goggles/Spy Drone/Moonlit/Marked reveal). */
export function canSee(s: GameState, viewer: 0 | 1, u: Unit): boolean {
  if (u.owner === viewer) return true;
  if (!isHidden(u)) return true;
  if (hasStatus(u, 'marked')) return true;
  if (hasField(s, u.pos, 'moonlit') || fullMoon(s)) {
    if (!hasField(s, u.pos, 'darkness')) return true;
  }
  const pl = s.players[viewer];
  for (const o of s.units) {
    if (o.owner !== viewer || o.isObject) continue;
    const d = distance(o.pos, u.pos);
    if (hasChar(o, 'perceptive') && d <= 3) return true;
    if (o.gear === 'night_goggles' && d <= 4) return true;
    if (pl.spyDroneUntil >= s.round && d <= 4) return true;
  }
  return false;
}

export function adjacentUnits(s: GameState, h: Hex): Unit[] {
  const ns = neighbors(h, bounds(s));
  return s.units.filter((u) => ns.some((n) => eq(n, u.pos)));
}

export function masterOf(s: GameState, u: Unit): Unit | undefined {
  return getUnit(s, u.master);
}
