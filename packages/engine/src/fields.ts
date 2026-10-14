// Section 5: fields and terrain – placement, combination table, end-phase effects, spreading, expiry.

import { FIELDS, FIRE_LIKE, WATER_LIKE } from './data/fields.ts';
import { eq, key, neighbors, ring, type Hex } from './hex.ts';
import { pick } from './rng.ts';
import { addEvent, bounds, getUnit, tileAt, unitsAt } from './state.ts';
import { affectedByField, hasChar, hasStatus, healMult } from './stats.ts';
import { applyStatus, cleanse, gainCharge, removeStatus } from './status.ts';
import type { FieldId, FieldInst, GameState, PlayerId, Tile, Unit } from './types.ts';
// circular-safe: combat imports fields lazily through function calls only
import { areaDamage, fieldTickDamage, healUnit } from './combat.ts';

/** Fields that never count toward the 2-fields-per-tile limit (markers). */
const MARKERS: FieldId[] = ['corrupted', 'crystal_bomb'];

export interface AddFieldOpts {
  owner?: PlayerId;
  duration?: number | null;
  data?: FieldInst['data'];
  /** skip the combination table (direct placement, e.g. Rain Barrel removes Fire) */
  noCombo?: boolean;
  silent?: boolean;
  /** attacker uid for explosions */
  source?: string;
}

export function fieldsAt(s: GameState, h: Hex): FieldInst[] {
  return tileAt(s, h)?.fields ?? [];
}

export function getField(s: GameState, h: Hex, id: FieldId): FieldInst | undefined {
  return fieldsAt(s, h).find((f) => f.id === id);
}

export function removeField(s: GameState, h: Hex, id: FieldId | FieldId[]): boolean {
  const t = tileAt(s, h);
  if (!t) return false;
  const ids = Array.isArray(id) ? id : [id];
  const before = t.fields.length;
  t.fields = t.fields.filter((f) => !ids.includes(f.id));
  return t.fields.length !== before;
}

function untilFor(s: GameState, id: FieldId, duration: number | null | undefined): number | null {
  const d = duration === undefined ? FIELDS[id].duration : duration;
  if (d === null) return null;
  return s.round + Math.max(1, d) - 1;
}

/** Flood fill connected water tiles from h. */
export function connectedWater(s: GameState, h: Hex): Hex[] {
  const out: Hex[] = [];
  const seen = new Set<string>();
  const stack = [h];
  while (stack.length) {
    const cur = stack.pop()!;
    const k = key(cur);
    if (seen.has(k)) continue;
    seen.add(k);
    const t = tileAt(s, cur);
    if (!t || !t.fields.some((f) => WATER_LIKE.includes(f.id))) continue;
    out.push(cur);
    for (const n of neighbors(cur, bounds(s))) stack.push(n);
  }
  return out;
}

function pushField(s: GameState, t: Tile, f: FieldInst): void {
  // replace same id (refresh)
  t.fields = t.fields.filter((x) => x.id !== f.id);
  const counted = t.fields.filter((x) => !MARKERS.includes(x.id));
  if (!MARKERS.includes(f.id) && counted.length >= 2) {
    // a third replaces the oldest
    const oldest = counted.reduce((a, b) => (a.createdRound <= b.createdRound ? a : b));
    t.fields = t.fields.filter((x) => x !== oldest);
  }
  t.fields.push(f);
}

/** Places a field and resolves the combination table. Returns the field ids that ended up on the tile. */
export function addField(s: GameState, h: Hex, id: FieldId, opts: AddFieldOpts = {}): boolean {
  const t = tileAt(s, h);
  if (!t) return false;
  if (t.wall && id !== 'acid') return false;
  const has = (ids: FieldId[]) => t.fields.some((f) => ids.includes(f.id));
  // Sterile: no Toxic or Contamination can be created here
  if ((id === 'toxic' || id === 'contamination' || id === 'contaminated_water') && has(['sterile'])) {
    if (!opts.silent) addEvent(s, { kind: 'field', text: `Sterile tile suppresses ${FIELDS[id].name}`, tiles: [h], field: 'sterile' });
    return false;
  }
  // Ash: Fire Fields cannot be created and Overgrowth cannot grow here
  if ((id === 'fire' || id === 'overgrowth' || id === 'wildfire') && has(['ash'])) return false;

  const inst = (fid: FieldId, dur?: number | null): FieldInst => ({
    id: fid,
    owner: opts.owner,
    until: untilFor(s, fid, dur === undefined ? opts.duration : dur),
    createdRound: s.round,
    data: opts.data,
  });
  const ev = (text: string, fid: FieldId, tiles: Hex[] = [h]) => {
    if (!opts.silent) addEvent(s, { kind: 'field', text, tiles, field: fid });
  };

  if (!opts.noCombo) {
    const isFire = FIRE_LIKE.includes(id);
    // Fire or Electric + Gas → Explosion
    if ((isFire || id === 'electric') && has(['gas'])) {
      detonateGas(s, h, opts.source);
      if (isFire) {
        pushField(s, t, inst('fire'));
      }
      return true;
    }
    if (id === 'gas' && has([...FIRE_LIKE, 'electric'])) {
      detonateGas(s, h, opts.source, true);
      return true;
    }
    // Fire + Water → Steam (both consumed)
    if ((isFire && has(['water'])) || (id === 'water' && has(FIRE_LIKE))) {
      t.fields = t.fields.filter((f) => f.id !== 'water' && !FIRE_LIKE.includes(f.id));
      pushField(s, t, inst('steam', 2));
      ev('Fire meets Water: Steam', 'steam');
      return true;
    }
    // Fire + Toxic → Toxic Smoke
    if ((isFire && has(['toxic'])) || (id === 'toxic' && has(FIRE_LIKE))) {
      t.fields = t.fields.filter((f) => f.id !== 'toxic' && !FIRE_LIKE.includes(f.id));
      pushField(s, t, inst('toxic_smoke', 2));
      ev('Fire meets Toxic: Toxic Smoke', 'toxic_smoke');
      return true;
    }
    // Fire + Ice → Water
    if ((isFire && has(['ice', 'frozen_water'])) || (id === 'ice' && has(FIRE_LIKE))) {
      t.fields = t.fields.filter((f) => f.id !== 'ice' && f.id !== 'frozen_water' && !FIRE_LIKE.includes(f.id));
      pushField(s, t, inst('water', null));
      ev('The Ice melts into Water', 'water');
      return true;
    }
    // Ice + Water → Frozen Water
    if ((id === 'ice' && has(['water'])) || (id === 'water' && has(['ice']))) {
      t.fields = t.fields.filter((f) => f.id !== 'ice' && f.id !== 'water');
      pushField(s, t, inst('frozen_water', null));
      ev('Ice meets Water: Frozen Water', 'frozen_water');
      return true;
    }
    // Fire + Overgrowth → Wildfire
    if ((isFire && has(['overgrowth', 'mutation'])) || (id === 'overgrowth' && has(FIRE_LIKE))) {
      t.fields = t.fields.filter((f) => f.id !== 'overgrowth' && f.id !== 'mutation' && !FIRE_LIKE.includes(f.id));
      pushField(s, t, inst('wildfire', 3));
      ev('Fire in the Overgrowth: Wildfire', 'wildfire');
      return true;
    }
    // Fire + Swamp → Swamp Gas
    if (isFire && has(['swamp'])) {
      t.fields = t.fields.filter((f) => f.id !== 'swamp');
      pushField(s, t, inst('gas', 3));
      ev('The swamp dries out: Swamp Gas', 'gas');
      return true;
    }
    // Fire + Marigold → burns away, Calaca +1 Soul, Burn on units
    if (isFire && has(['marigold'])) {
      t.fields = t.fields.filter((f) => f.id !== 'marigold');
      for (const c of s.units.filter((u) => u.defId === 'calaca')) gainSoul(s, c, 'marigold burned');
      for (const u of unitsAt(s, h)) applyStatus(s, u, 'burn');
      pushField(s, t, inst('fire'));
      ev('The Marigold burns away', 'fire');
      return true;
    }
    // Water + Electric → Electrified Water (spreads over connected water)
    if (id === 'electric' && has(WATER_LIKE)) {
      const tiles = connectedWater(s, h);
      for (const w of tiles) pushField(s, tileAt(s, w)!, inst('electrified_water', 3));
      ev('Electrified Water spreads over the connected water', 'electrified_water', tiles);
      return true;
    }
    if (id === 'toxic' && has(WATER_LIKE)) {
      const tiles = connectedWater(s, h);
      for (const w of tiles) pushField(s, tileAt(s, w)!, inst('contaminated_water', 3));
      ev('Contaminated Water spreads over the connected water', 'contaminated_water', tiles);
      return true;
    }
    if (id === 'acid' && has(WATER_LIKE)) {
      const tiles = connectedWater(s, h);
      for (const w of tiles) pushField(s, tileAt(s, w)!, inst('diluted_acid', 3));
      ev('Diluted Acid spreads over the connected water', 'diluted_acid', tiles);
      return true;
    }
    if (id === 'water' && has(['electric'])) {
      t.fields = t.fields.filter((f) => f.id !== 'electric');
      pushField(s, t, inst('water', opts.duration));
      for (const w of connectedWater(s, h)) pushField(s, tileAt(s, w)!, inst('electrified_water', 3));
      ev('Electrified Water', 'electrified_water');
      return true;
    }
    // Electric + Resonance → Shock Storm
    if ((id === 'electric' && has(['resonance'])) || (id === 'resonance' && has(['electric']))) {
      t.fields = t.fields.filter((f) => f.id !== 'electric' && f.id !== 'resonance');
      pushField(s, t, inst('shock_storm', 2));
      ev('Electric meets Resonance: Shock Storm', 'shock_storm');
      return true;
    }
    // Sterile + Toxic / Contamination → Suppressed (Sterile wins)
    if (id === 'sterile' && has(['toxic', 'contamination', 'contaminated_water'])) {
      t.fields = t.fields.filter((f) => !['toxic', 'contamination', 'contaminated_water'].includes(f.id));
      ev('Sterile suppresses the contamination', 'sterile');
    }
    // Radiation + Overgrowth → Mutation
    if ((id === 'radiation' && has(['overgrowth'])) || (id === 'overgrowth' && has(['radiation']))) {
      t.fields = t.fields.filter((f) => f.id !== 'overgrowth' && f.id !== 'radiation');
      pushField(s, t, inst('mutation', 3));
      ev('Radiation meets Overgrowth: Mutation', 'mutation');
      return true;
    }
  }
  pushField(s, t, inst(id));
  ev(`${FIELDS[id].name} field`, id);
  return true;
}

export function gainSoul(s: GameState, calaca: Unit, why: string): void {
  if (calaca.defId !== 'calaca') return;
  const before = calaca.counters.souls ?? 0;
  if (before >= 5) return;
  calaca.counters.souls = before + 1;
  addEvent(s, { kind: 'ability', text: `${calaca.name} collects a Soul (${calaca.counters.souls}/5): ${why}`, actor: calaca.uid });
}

/** Gas explosion: Ring-1, Power 80 Fire. The gas is consumed. Explosions hit friends. */
export function detonateGas(s: GameState, h: Hex, sourceUid?: string, includeCenter = true): void {
  if (!removeField(s, h, 'gas')) return;
  const tiles = [...(includeCenter ? [h] : []), ...ring(h, 1, bounds(s))];
  addEvent(s, { kind: 'field', text: 'The gas explodes!', tiles: [h, ...ring(h, 1, bounds(s))], field: 'gas' });
  const src = getUnit(s, sourceUid);
  areaDamage(s, src ?? null, tiles, { power: 80, tag: 'fire', category: 'special', label: 'Gas explosion', friendly: true });
  // chain reaction into adjacent gas
  for (const n of ring(h, 1, bounds(s))) if (getField(s, n, 'gas')) detonateGas(s, n, sourceUid);
}

/** Fire/Electric attacks that cross or hit a Gas Field detonate it. */
export function detonateGasOnPath(s: GameState, path: Hex[], sourceUid?: string): void {
  for (const h of path) if (getField(s, h, 'gas')) detonateGas(s, h, sourceUid);
}

// ---------------------------------------------------------------- end phase

function fieldApplies(u: Unit, f: FieldInst): boolean {
  return affectedByField(u, FIELDS[f.id].ground);
}

/** End-phase step 1: field effects on units standing on them. */
export function fieldEffects(s: GameState): void {
  for (const u of [...s.units]) {
    if (u.isObject || u.hp <= 0) continue;
    const t = tileAt(s, u.pos);
    if (!t) continue;
    for (const f of [...t.fields]) {
      if (!fieldApplies(u, f)) continue;
      if (!s.units.includes(u)) break;
      switch (f.id) {
        case 'fire':
        case 'wildfire':
          applyStatus(s, u, 'burn', { chance: 1 });
          break;
        case 'toxic':
          if (u.defId === 'vile') u.data.toxicTick = true;
          else applyStatus(s, u, 'poison');
          break;
        case 'electric':
        case 'portal':
        case 'electrified_water':
          fieldTickDamage(s, u, 0.05, 'electric', FIELDS[f.id].name);
          applyStatus(s, u, 'shock', { chance: 0.5 });
          gainCharge(s, u, 'field');
          break;
        case 'acid':
          fieldTickDamage(s, u, 0.04, 'acid', 'Acid');
          applyStatus(s, u, 'corrosion');
          break;
        case 'diluted_acid':
          fieldTickDamage(s, u, 0.02, 'acid', 'Diluted Acid');
          applyStatus(s, u, 'corrosion', { chance: 0.5 });
          break;
        case 'radiation':
          fieldTickDamage(s, u, 0.05, 'radiant', 'Radiation');
          if (hasChar(u, 'regenerative')) applyStatus(s, u, 'regen_paused', { duration: 1, silent: true });
          break;
        case 'sterile':
          cleanse(s, u, ['poison', 'infection', 'egg', 'leeched']);
          if (hasChar(u, 'toxic') || hasChar(u, 'cursed')) fieldTickDamage(s, u, 0.05, null, 'Sterile');
          break;
        case 'water':
          applyStatus(s, u, 'soaked', { silent: hasStatus(u, 'soaked') });
          break;
        case 'contaminated_water':
          applyStatus(s, u, 'soaked', { silent: true });
          applyStatus(s, u, 'poison');
          break;
        case 'steam':
          fieldTickDamage(s, u, 0.03, 'fire', 'Steam');
          break;
        case 'toxic_smoke':
          applyStatus(s, u, 'poison');
          applyStatus(s, u, 'blind', { chance: 0.5 });
          break;
        case 'shock_storm':
          applyStatus(s, u, 'shock');
          fieldTickDamage(s, u, 0.05, 'electric', 'Shock Storm');
          break;
        case 'scalded':
          fieldTickDamage(s, u, 0.05, 'fire', 'Scalded');
          applyStatus(s, u, 'burn', { chance: 0.5 });
          break;
        case 'chrono':
          applyStatus(s, u, 'slow');
          removeStatus(s, u, 'haste');
          break;
        case 'ant_trail':
          if (f.owner !== undefined && f.owner !== u.owner) antTrailHit(s, u, f);
          break;
        default:
          break;
      }
    }
  }
}

export function antTrailHit(s: GameState, u: Unit, f: FieldInst): void {
  const k = `trail_${f.data?.trail}_${s.round}`;
  if (u.data[k]) return;
  u.data[k] = true;
  const src = getUnit(s, f.data?.source as string | undefined);
  areaDamage(s, src ?? null, [u.pos], { power: 25, tag: 'pierce', category: 'physical', label: 'Ant Trail', onlyUnit: u.uid });
}

/** End-phase healing from fields (part of "regeneration and healing triggers"). */
export function fieldHealing(s: GameState): void {
  for (const u of s.units) {
    if (u.isObject) continue;
    const t = tileAt(s, u.pos);
    if (!t) continue;
    for (const f of t.fields) {
      if (!fieldApplies(u, f)) continue;
      switch (f.id) {
        case 'marigold':
          if (hasChar(u, 'dead') || hasChar(u, 'bone') || hasChar(u, 'spectral')) healUnit(s, u, 0.06 * u.maxHp, 'marigold', 'Marigold Field');
          else if (hasChar(u, 'living')) healUnit(s, u, 0.03 * u.maxHp, 'marigold', 'Marigold Field');
          break;
        case 'bandage':
          if (f.owner === u.owner && (hasChar(u, 'cloth') || hasChar(u, 'cursed') || hasChar(u, 'dead')))
            healUnit(s, u, 0.08 * u.maxHp, 'bandage', 'Bandage Field');
          break;
        case 'ash':
          if (hasChar(u, 'dead') || hasChar(u, 'bone')) healUnit(s, u, 0.04 * u.maxHp, 'generic', 'Ash Field');
          break;
        case 'swamp':
        case 'water':
          if (hasChar(u, 'amphibious') && !u.data[`amph_${s.round}`]) {
            u.data[`amph_${s.round}`] = true;
            healUnit(s, u, 0.05 * u.maxHp, 'generic', 'Amphibious');
          }
          break;
        default:
          break;
      }
    }
  }
}

/** Spreading (wildfire, mutation) and expiry of fields at the end of the round. */
export function fieldUpkeep(s: GameState): void {
  const b = bounds(s);
  const spreads: { h: Hex; id: FieldId; dur: number }[] = [];
  for (const t of s.tiles) {
    for (const f of t.fields) {
      if (f.id === 'wildfire' && f.until !== null && f.until > s.round) {
        const ns = neighbors(t, b).filter((n) => {
          const nt = tileAt(s, n)!;
          return !nt.wall && !nt.fields.some((x) => FIRE_LIKE.includes(x.id) || x.id === 'ash');
        });
        if (ns.length) spreads.push({ h: pick(s.rng, ns), id: 'fire', dur: 2 });
      }
      if (f.id === 'mutation') {
        const ns = neighbors(t, b).filter((n) => {
          const nt = tileAt(s, n)!;
          return !nt.wall && !nt.fields.some((x) => x.id === 'overgrowth' || x.id === 'mutation' || x.id === 'ash');
        });
        if (ns.length) spreads.push({ h: pick(s.rng, ns), id: 'overgrowth', dur: 0 });
      }
    }
  }
  for (const sp of spreads) addField(s, sp.h, sp.id, { duration: sp.dur === 0 ? null : sp.dur, silent: true });

  for (const t of s.tiles) {
    const expired = t.fields.filter((f) => f.until !== null && f.until <= s.round);
    if (!expired.length) continue;
    t.fields = t.fields.filter((f) => !expired.includes(f));
    for (const f of expired) {
      if (f.id === 'fire') addField(s, t, 'ash', { duration: 3, silent: true, noCombo: true });
      if (f.id === 'mutation') addField(s, t, 'overgrowth', { duration: null, silent: true, noCombo: true });
      if (f.id === 'ant_trail') continue;
    }
  }
}

/** Units entering a tile: Snare, Swamp (Mired), Frozen Water, Acid crossing, Ant Trail, Ice slow at end of move. */
export function onEnterTile(s: GameState, u: Unit, h: Hex): void {
  const t = tileAt(s, h);
  if (!t) return;
  for (const f of [...t.fields]) {
    if (!fieldApplies(u, f)) continue;
    switch (f.id) {
      case 'snare':
        if (!hasChar(u, 'burrowing') && u.rt.snaredLeft === null) {
          applyStatus(s, u, 'snared', { duration: 0 });
          u.rt.snaredLeft = 1;
        }
        break;
      case 'swamp':
        if (!hasChar(u, 'amphibious') && !hasChar(u, 'burrowing')) applyStatus(s, u, 'mired', { silent: hasStatus(u, 'mired') });
        break;
      case 'frozen_water':
        applyStatus(s, u, 'frozen');
        t.fields = t.fields.filter((x) => x !== f);
        t.fields.push({ id: 'ice', until: null, createdRound: s.round });
        break;
      case 'acid':
        applyStatus(s, u, 'corrosion');
        break;
      case 'ant_trail':
        if (f.owner !== undefined && f.owner !== u.owner) antTrailHit(s, u, f);
        break;
      default:
        break;
    }
  }
}

export function tilesWithField(s: GameState, id: FieldId): Tile[] {
  return s.tiles.filter((t) => t.fields.some((f) => f.id === id));
}

export function isWater(s: GameState, h: Hex): boolean {
  return fieldsAt(s, h).some((f) => WATER_LIKE.includes(f.id) || f.id === 'swamp');
}

export function sameTile(a: Hex, b: Hex): boolean {
  return eq(a, b);
}

export { healMult };
