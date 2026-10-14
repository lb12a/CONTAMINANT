// Move commands: path validation, AP cost (incl. terrain), execution step by step.

import { distance, eq, type Hex } from './hex.ts';
import { moveCost } from './formulas.ts';
import { addEvent, blockerAt, getUnit, tileAt } from './state.ts';
import { getStatus, gearStrength, hasChar, hasStatus, isAirborne, maxMove } from './stats.ts';
import { applyStatus, removeStatus } from './status.ts';
import { onEnterTile } from './fields.ts';
import { fieldTickDamage, revealHidden, triggerBombAt } from './combat.ts';
import { triggerTrapsAt } from './traps.ts';
import type { GameState, Unit } from './types.ts';

function fieldIds(s: GameState, h: Hex): string[] {
  return tileAt(s, h)?.fields.map((f) => f.id) ?? [];
}

function solidForPhasing(s: GameState, h: Hex): boolean {
  const f = fieldIds(s, h);
  return f.includes('resonance') || f.includes('sterile');
}

/** Extra AP for entering a tile (terrain + fields). */
export function enterExtra(s: GameState, u: Unit, h: Hex): number {
  const t = tileAt(s, h);
  if (!t) return 0;
  let extra = 0;
  const air = isAirborne(u);
  const f = t.fields;
  const has = (id: string) => f.some((x) => x.id === id);
  if (t.wall && hasChar(u, 'burrowing')) extra += 1;
  if (!air) {
    if ((has('overgrowth') || has('mutation')) && hasChar(u, 'grounded') && !hasChar(u, 'photosynthetic')) extra += 1;
    if (has('ice') || has('frozen_water')) extra += 1;
    if (has('swamp') && !hasChar(u, 'amphibious')) extra += 1;
    const bandage = f.find((x) => x.id === 'bandage');
    if (bandage && bandage.owner !== undefined && bandage.owner !== u.owner) extra += 1;
  }
  return extra;
}

/** Fields that cost no per-field AP (Amphibious on Water and Swamp). */
function freeField(s: GameState, u: Unit, h: Hex): boolean {
  if (!hasChar(u, 'amphibious')) return false;
  const f = fieldIds(s, h);
  return f.includes('swamp') || f.includes('water') || f.includes('electrified_water') || f.includes('contaminated_water');
}

export function pathCost(s: GameState, u: Unit, path: Hex[]): number {
  if (u.defId === 'shrink_head') return 0;
  let fields = 0;
  let extra = 0;
  for (const h of path) {
    if (!freeField(s, u, h)) fields++;
    extra += enterExtra(s, u, h);
  }
  const mult = u.gear === 'running_shoes' ? 1 - 0.25 * gearStrength(u) : 1;
  return moveCost(fields, u.apPerField, extra, mult);
}

export interface PathCheck {
  ok: boolean;
  error?: string;
}

/** Can the unit pass through (not end on) this tile? */
export function canPass(s: GameState, u: Unit, h: Hex): boolean {
  const t = tileAt(s, h);
  if (!t) return false;
  const phasing = hasChar(u, 'phasing') && !solidForPhasing(s, h);
  if (t.wall) {
    if (phasing) return true;
    if (hasChar(u, 'burrowing')) return true;
    return false;
  }
  const b = blockerAt(s, h);
  if (b && b !== u && u.blocks) return phasing;
  return true;
}

/** Can the unit end its move on this tile? */
export function canEnd(s: GameState, u: Unit, h: Hex): boolean {
  const t = tileAt(s, h);
  if (!t || t.wall) return false;
  const b = blockerAt(s, h);
  if (b && b !== u && u.blocks) return false;
  return true;
}

export function validatePath(s: GameState, u: Unit, path: Hex[], budget: number): PathCheck {
  if (!path.length) return { ok: false, error: 'empty path' };
  if (path.length > budget) return { ok: false, error: `path too long (${path.length} > ${budget})` };
  let prev = u.pos;
  for (let i = 0; i < path.length; i++) {
    const h = path[i]!;
    if (distance(prev, h) !== 1) return { ok: false, error: 'path must be contiguous' };
    const last = i === path.length - 1;
    if (last ? !canEnd(s, u, h) : !canPass(s, u, h)) return { ok: false, error: `tile ${h.c + 1}/${h.r + 1} is blocked` };
    prev = h;
  }
  return { ok: true };
}

export function canMoveVoluntarily(s: GameState, u: Unit): string | null {
  if (hasChar(u, 'rooted') && u.defId !== 'shrink_head') return 'Rooted units cannot move';
  if (u.isObject) return 'objects cannot move';
  if (hasStatus(u, 'frozen')) return 'Frozen';
  if (hasStatus(u, 'entranced')) return 'Entranced';
  if (u.rt.hold) return 'Hold Position';
  if (maxMove(s, u) <= 0 && u.defId !== 'shrink_head') return 'Max Move 0';
  return null;
}

/** Executes a Move command step by step. Returns the number of fields actually moved. */
export function executeMove(s: GameState, u: Unit, path: Hex[]): number {
  const from = { ...u.pos };
  const walked: Hex[] = [];
  u.data.moveInterrupted = false;
  const fear = getStatus(u, 'fear');
  const fearSrc = fear ? getUnit(s, fear.source) : undefined;
  for (let i = 0; i < path.length; i++) {
    if (!s.units.includes(u)) break;
    const h = path[i]!;
    if (hasStatus(u, 'frozen')) {
      addEvent(s, { kind: 'info', text: `${u.name} is Frozen and cannot move`, target: u.uid });
      break;
    }
    if (u.rt.snaredLeft !== null && u.rt.snaredLeft <= 0) {
      addEvent(s, { kind: 'info', text: `${u.name} is Snared`, target: u.uid });
      break;
    }
    if (fearSrc && s.units.includes(fearSrc) && distance(h, fearSrc.pos) < distance(u.pos, fearSrc.pos)) {
      addEvent(s, { kind: 'info', text: `${u.name} is too afraid to approach ${fearSrc.name}`, target: u.uid });
      break;
    }
    const last = i === path.length - 1;
    if (distance(u.pos, h) !== 1) break;
    if (last ? !canEnd(s, u, h) : !canPass(s, u, h)) {
      addEvent(s, { kind: 'info', text: `${u.name}'s path is blocked`, target: u.uid, to: h });
      break;
    }
    // stopping inside a wall/unit is not allowed: if the remaining path cannot finish, stop here
    u.pos = { ...h };
    walked.push({ ...h });
    u.rt.moved++;
    if (u.rt.snaredLeft !== null) u.rt.snaredLeft--;
    const bleed = getStatus(u, 'bleeding');
    if (bleed) {
      const pct = (bleed.value ?? 4) / 100;
      fieldTickDamage(s, u, pct * bleed.stacks, null, 'Bleeding');
      if (!s.units.includes(u)) break;
    }
    onEnterTile(s, u, h);
    triggerTrapsAt(s, u, h);
    triggerBombAt(s, u, h);
    if (!s.units.includes(u)) break;
    if (u.data.moveInterrupted) break;
  }
  // end-of-move: if standing inside an obstacle/unit (burrowing/phasing interrupted), step back
  if (s.units.includes(u)) {
    while (walked.length && !canEnd(s, u, u.pos)) {
      walked.pop();
      u.pos = walked.length ? { ...walked[walked.length - 1]! } : { ...from };
    }
  }
  if (walked.length && s.units.includes(u)) {
    addEvent(s, {
      kind: 'move',
      text: `${u.name} moves ${walked.length} field${walked.length > 1 ? 's' : ''}`,
      actor: u.uid,
      from,
      to: { ...u.pos },
      tiles: [from, ...walked],
      hiddenFrom: hasStatus(u, 'hidden') ? (u.owner === 0 ? 1 : 0) : undefined,
    });
    afterMoveStop(s, u);
  }
  return walked.length;
}

/** Things that happen when a unit stops on a tile (end of a move or deploy). */
export function afterMoveStop(s: GameState, u: Unit): void {
  if (!s.units.includes(u)) return;
  const t = tileAt(s, u.pos);
  if (!t) return;
  if (u.rt.moved > 2 && hasStatus(u, 'hidden')) revealHidden(s, u, 'moved more than 2 fields');
  if (!isAirborne(u) && t.fields.some((f) => f.id === 'ice')) applyStatus(s, u, 'slow', { duration: 1 });
  const corrupted = t.fields.find((f) => f.id === 'corrupted');
  if (corrupted && !u.isObject && !u.isSummon && !isAirborne(u)) {
    const nexus = getUnit(s, corrupted.data?.nexus as string | undefined);
    const holder = getUnit(s, corrupted.data?.holder as string | undefined);
    if (!holder) {
      applyStatus(s, u, 'corruption', { source: nexus ?? null, duration: -1 });
      corrupted.data = { ...corrupted.data, holder: u.uid, revealed: true };
      addEvent(s, { kind: 'field', text: `${u.name} is Corrupted!`, target: u.uid, tiles: [{ ...u.pos }], field: 'corrupted' });
    } else if (holder.uid !== u.uid && holder.owner === u.owner) {
      removeStatus(s, holder, 'corruption');
      applyStatus(s, u, 'corruption', { source: nexus ?? null, duration: -1 });
      corrupted.data = { ...corrupted.data, holder: u.uid };
      addEvent(s, { kind: 'field', text: `${u.name} takes over the Corruption from ${holder.name}`, target: u.uid, field: 'corrupted' });
    }
  }
}

export function sameTile(a: Hex, b: Hex) {
  return eq(a, b);
}
