// Trap items (TR1–TR10): hidden tiles that trigger when an enemy enters (passing counts).

import { ITEMS } from './data/items.ts';
import { burst, distance, eq, neighbors, type Hex } from './hex.ts';
import { shuffle } from './rng.ts';
import { addEvent, bounds, getUnit, tileAt } from './state.ts';
import { hasChar, hasStatus } from './stats.ts';
import { applyStatus } from './status.ts';
import { addField } from './fields.ts';
import { fieldTickDamage, revealHidden, swapUnits } from './combat.ts';
import type { GameState, Trap, Unit } from './types.ts';

export const MAX_TRAPS = 3;
export const TRAP_LIFETIME = 6;

export function affinity(u: Unit, itemId: string): number {
  const it = ITEMS[itemId];
  if (!it || it.type === 'intel') return 1;
  return hasChar(u, it.trait) ? 1.25 : 1;
}

export function trapAt(s: GameState, h: Hex): Trap | undefined {
  return s.traps.find((t) => eq(t.pos, h));
}

export function triggerTrapsAt(s: GameState, u: Unit, h: Hex): void {
  const tr = s.traps.find((t) => eq(t.pos, h) && t.owner !== u.owner);
  if (!tr || u.isObject) return;
  s.traps.splice(s.traps.indexOf(tr), 1);
  const it = ITEMS[tr.itemId]!;
  const aff = affinity(u, tr.itemId);
  u.data.moveInterrupted = true;
  addEvent(s, { kind: 'trap', text: `${u.name} triggers a ${it.name}!`, target: u.uid, to: { ...h } });
  const b = bounds(s);
  switch (tr.itemId) {
    case 'spike_pit':
      fieldTickDamage(s, u, 0.15 * aff, 'pierce', 'Spike Pit');
      if (s.units.includes(u)) applyStatus(s, u, 'bleeding');
      break;
    case 'bear_snare':
      applyStatus(s, u, 'snared', { duration: 0 });
      applyStatus(s, u, 'slow');
      u.rt.snaredLeft = 0;
      break;
    case 'alarm_bell':
      applyStatus(s, u, 'marked', { duration: 2 });
      for (const o of s.units) if (o.owner !== tr.owner && distance(o.pos, h) <= 2 && hasStatus(o, 'hidden')) revealHidden(s, o, 'Alarm Bell');
      break;
    case 'frost_mine':
      for (const x of burst(h, 1, b)) addField(s, x, 'ice', { duration: 2, owner: tr.owner, silent: true });
      applyStatus(s, u, 'frozen');
      break;
    case 'shock_plate':
      applyStatus(s, u, 'shock');
      addField(s, h, 'electric', { duration: 2, owner: tr.owner });
      break;
    case 'gas_leak':
      for (const x of burst(h, 1, b)) addField(s, x, 'gas', { duration: 3, owner: tr.owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Gas leaks out', tiles: burst(h, 1, b), field: 'gas' });
      break;
    case 'acid_mine': {
      const ns = shuffle(s.rng, neighbors(h, b).filter((n) => !tileAt(s, n)?.wall)).slice(0, 2);
      for (const x of [h, ...ns]) addField(s, x, 'acid', { duration: 3, owner: tr.owner, silent: true });
      applyStatus(s, u, 'corrosion');
      break;
    }
    case 'rad_capsule':
      for (const x of burst(h, 1, b)) addField(s, x, 'radiation', { duration: 3, owner: tr.owner, silent: true });
      applyStatus(s, u, 'brittle', { duration: 2 });
      break;
    case 'gag_order':
      applyStatus(s, u, 'silence', { duration: 2 });
      applyStatus(s, u, 'weakened', { duration: 1 });
      break;
    case 'switchback_rune': {
      const pref = getUnit(s, tr.swapWith);
      const mine = (pref && pref.owner === tr.owner && distance(pref.pos, h) <= 6 ? [pref] : [])
        .concat(s.units.filter((o) => o.owner === tr.owner && !o.isObject && distance(o.pos, h) <= 6))
        .filter((o) => o.uid !== u.uid);
      if (mine.length) swapUnits(s, u, mine[0]!, getUnit(s, tr.swapWith) ?? mine[0]!);
      break;
    }
    default:
      break;
  }
}

export function expireTraps(s: GameState): void {
  // a trap placed in round R lasts 6 rounds (R .. R+5) and is removed in the end phase of R+5
  s.traps = s.traps.filter((t) => s.round - t.placedRound < TRAP_LIFETIME - 1);
}
