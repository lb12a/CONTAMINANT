// Section 4: applying, stacking, removing statuses.

import { CHARACTERISTICS } from './data/characteristics.ts';
import { STATUSES } from './data/statuses.ts';
import { statusChance } from './formulas.ts';
import { chance } from './rng.ts';
import { addEvent, hasField } from './state.ts';
import { getStatus, hasChar, hasStatus, statusChanceMods } from './stats.ts';
import type { GameState, StatusId, Unit } from './types.ts';

/** Damage-over-time style statuses tick the round they are applied. Others last through following rounds. */
const DOT_LIKE = new Set<StatusId>(['poison', 'burn', 'bleeding', 'infection', 'leeched', 'echo', 'regeneration', 'egg']);

export interface ApplyOpts {
  /** 0..1, default 1 */
  chance?: number;
  duration?: number;
  stacks?: number;
  source?: Unit | null;
  hexScroll?: boolean;
  value?: number;
  silent?: boolean;
}

export function isImmune(s: GameState, u: Unit, id: StatusId): boolean {
  if (u.isObject) return true;
  for (const cid of Object.values(u.chars)) {
    if (CHARACTERISTICS[cid]?.immune?.includes(id)) return true;
  }
  if (hasStatus(u, 'gilded') && ['poison', 'bleeding', 'burn', 'corrosion'].includes(id)) return true;
  if (hasStatus(u, 'cleanse_immune') && ['poison', 'infection', 'egg', 'leeched'].includes(id)) return true;
  if (id === 'blind' && u.gear === 'night_goggles') return true;
  if (id === 'shock' && u.gear === 'insulated_gloves') return true;
  if (id === 'silence' && hasStatus(u, 'silence_immune')) return true;
  if (id === 'burn' && hasStatus(u, 'soaked')) return true;
  return false;
}

function adjustedDuration(s: GameState, u: Unit, id: StatusId, base: number, hexScroll: boolean): number {
  if (base <= 0) return base;
  let d = base;
  if ((id === 'poison' || id === 'infection') && hasChar(u, 'artificial')) d -= 1;
  if (id === 'frozen' && hasChar(u, 'liquid')) d += 1;
  if ((id === 'frozen' || id === 'shock') && hasChar(u, 'chronal')) d += 1;
  if (id === 'shock' && hasChar(u, 'artificial')) d += 1;
  if (id === 'shock' && hasField(s, u.pos, 'resonance')) d += 1;
  if (id === 'corrosion' && hasChar(u, 'synthetic')) d += 1;
  if (id === 'slow' && hasChar(u, 'robust')) d += 1;
  if (id === 'blind' && hasChar(u, 'perceptive')) d += 1;
  if (['fear', 'silence', 'depressed', 'spotlight'].includes(id) && hasChar(u, 'multi_minded')) d -= 1;
  if (id === 'marked' && hasChar(u, 'emotionless')) d += 1;
  if (hasField(s, u.pos, 'contamination')) d += 1;
  if (hexScroll) d += 1;
  return Math.max(id === 'spotlight' || id === 'depressed' ? 0 : 1, d);
}

/** Rolls and applies a status. Returns true if it landed. */
export function applyStatus(s: GameState, u: Unit, id: StatusId, opts: ApplyOpts = {}): boolean {
  const def = STATUSES[id];
  if (!def) return false;
  if (isImmune(s, u, id)) {
    if (!opts.silent && (opts.chance ?? 1) >= 1)
      addEvent(s, { kind: 'status', text: `${u.name} is immune to ${def.name}`, target: u.uid, status: id });
    return false;
  }
  const base = opts.chance ?? 1;
  if (base < 1) {
    const { resist, mult } = statusChanceMods(s, u, id);
    const p = statusChance(base, resist, mult * (opts.hexScroll ? 1.25 : 1));
    const ok = s.settings.fixedRandom ? p >= 0.25 : chance(s.rng, p);
    if (!ok) return false;
  } else if (hasChar(u, 'mythic') && opts.source && opts.source.owner !== u.owner) {
    // Mythic: status chances against it −20% (applies to guaranteed statuses too)
    const ok = s.settings.fixedRandom ? true : chance(s.rng, 0.8);
    if (!ok) return false;
  }
  const duration = adjustedDuration(s, u, id, opts.duration ?? def.duration, !!opts.hexScroll);
  const addStacks = opts.stacks ?? 1;
  const existing = getStatus(u, id);
  if (existing) {
    if (duration < 0 || existing.duration < 0) existing.duration = -1;
    else existing.duration = Math.max(existing.duration, duration);
    existing.stacks = Math.min(def.maxStacks, existing.stacks + addStacks);
    existing.appliedRound = s.round;
    if (opts.source) {
      existing.source = opts.source.uid;
      existing.sourceOwner = opts.source.owner;
    }
    if (opts.value !== undefined) existing.value = opts.value;
  } else {
    u.statuses.push({
      id,
      duration,
      stacks: Math.min(def.maxStacks, addStacks),
      source: opts.source?.uid,
      sourceOwner: opts.source?.owner,
      value: opts.value,
      appliedRound: s.round,
    });
    onApplied(s, u, id, opts);
  }
  if (!opts.silent && !def.internal) {
    addEvent(s, { kind: 'status', text: `${u.name}: ${def.name}${existing ? ' (refreshed)' : ''}`, target: u.uid, status: id, actor: opts.source?.uid });
  }
  return true;
}

function onApplied(s: GameState, u: Unit, id: StatusId, _opts: ApplyOpts): void {
  switch (id) {
    case 'corruption': {
      u.data.preCorruptMax = u.maxHp;
      u.maxHp = Math.max(1, Math.round(u.maxHp / 2));
      u.hp = Math.max(1, Math.min(u.maxHp, Math.round(u.hp / 2)));
      break;
    }
    case 'soaked':
      removeStatus(s, u, 'burn', true);
      break;
    case 'gilded':
      for (const x of ['poison', 'bleeding', 'burn', 'corrosion'] as StatusId[]) removeStatus(s, u, x, true);
      break;
    case 'shock':
      if (u.defId === 'frankenstein') gainCharge(s, u, 'shock');
      break;
    default:
      break;
  }
}

export function gainCharge(s: GameState, u: Unit, source: string): void {
  if (u.defId !== 'frankenstein') return;
  const key = `charge_${source}_${s.round}`;
  if (u.data[key]) return;
  u.data[key] = true;
  u.counters.charges = Math.min(3, (u.counters.charges ?? 0) + 1);
  addEvent(s, { kind: 'ability', text: `${u.name} gains a Static Charge (${u.counters.charges}/3)`, actor: u.uid });
}

export function removeStatus(s: GameState, u: Unit, id: StatusId, silent = false): boolean {
  const idx = u.statuses.findIndex((x) => x.id === id);
  if (idx < 0) return false;
  u.statuses.splice(idx, 1);
  if (id === 'corruption' && u.data.preCorruptMax) {
    u.maxHp = u.data.preCorruptMax;
    delete u.data.preCorruptMax;
  }
  if (!silent) addEvent(s, { kind: 'status', text: `${u.name} loses ${STATUSES[id].name}`, target: u.uid, status: id });
  return true;
}

/** Removes the listed statuses (cleanses never remove Corruption, Gilded, Garland or Hidden). */
export function cleanse(s: GameState, u: Unit, ids: StatusId[]): number {
  let n = 0;
  for (const id of ids) {
    if (STATUSES[id]?.uncleansable) continue;
    if (removeStatus(s, u, id)) n++;
  }
  return n;
}

/** End-phase duration countdown. */
export function tickDurations(s: GameState, u: Unit): void {
  const keep = [] as typeof u.statuses;
  for (const st of u.statuses) {
    const def = STATUSES[st.id];
    if (st.duration < 0) {
      keep.push(st);
      continue;
    }
    if (st.duration === 0 || def.duration === 0) {
      // "rest of round" statuses
      if (st.id === 'corruption') keep.push(st);
      continue;
    }
    const fresh = st.appliedRound === s.round && !DOT_LIKE.has(st.id);
    if (!fresh) st.duration -= 1;
    if (st.duration <= 0) {
      if (st.id === 'egg') continue; // handled by egg hatch logic before the countdown
      if (st.id === 'corruption' && u.data.preCorruptMax) u.maxHp = u.data.preCorruptMax;
      continue;
    }
    keep.push(st);
  }
  u.statuses = keep;
}

export function statusName(id: StatusId): string {
  return STATUSES[id]?.name ?? id;
}
