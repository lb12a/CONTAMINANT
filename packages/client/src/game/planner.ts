// Client-side planning state: builds a Plan from clicks/taps with live validation against the
// player's own fog-of-war view (the server re-validates everything).

import {
  activeAbilities,
  attackDefFor,
  attacksOf,
  burst,
  canEnd,
  canMoveVoluntarily,
  canPass,
  CHARACTERS,
  cone,
  coneWedgeToward,
  distance,
  eq,
  fieldTileAllowed,
  inZone,
  isFree,
  ITEMS,
  key,
  line,
  maxMove,
  neighbors,
  pathCost,
  previewOrder,
  ray,
  ring,
  trapTileAllowed,
  validatePlan,
  type AttackDef,
  type Command,
  type GameState,
  type Hex,
  type Plan,
  type PlayerId,
  type Unit,
} from '@contaminant/engine';
import type { HighlightKind, Overlay } from '../render/board.ts';

export type Mode =
  | { kind: 'idle' }
  | { kind: 'move'; unit: string }
  | { kind: 'attack'; unit: string; attack: string; item?: string; tiles: Hex[] }
  | { kind: 'ability'; unit: string; ability: string; item?: string }
  | { kind: 'deploy'; card: string }
  | { kind: 'item'; card: string }
  | { kind: 'vector'; unit: string; attack: string; target?: string };

export interface PlannerState {
  commands: Command[];
  rest: string[];
  speedShift: Record<string, number>;
  watch?: string;
  selected?: string;
  mode: Mode;
  deployChoices: Record<string, { mood?: string }>;
}

export const emptyPlanner = (): PlannerState => ({ commands: [], rest: [], speedShift: {}, mode: { kind: 'idle' }, deployChoices: {} });

export function toPlan(ps: PlannerState, me: PlayerId): Plan {
  return {
    player: me,
    commands: ps.commands.map((c) => (c.kind === 'deploy' && ps.deployChoices[c.card] ? { ...c, choice: { ...c.choice, ...ps.deployChoices[c.card] } } : c)),
    rest: ps.rest,
    speedShift: ps.speedShift,
    watch: ps.watch,
  };
}

/** Planned end position of a unit after its queued Move commands. */
export function plannedPos(view: GameState, ps: PlannerState, uid: string): Hex | undefined {
  const u = view.units.find((x) => x.uid === uid);
  if (!u) return undefined;
  let pos = u.pos;
  for (const c of ps.commands) if (c.kind === 'move' && c.unit === uid && c.path.length) pos = c.path[c.path.length - 1]!;
  return pos;
}

export function movedSoFar(ps: PlannerState, uid: string): number {
  return ps.commands.filter((c) => c.kind === 'move' && c.unit === uid).reduce((s, c) => s + (c.kind === 'move' ? c.path.length : 0), 0);
}

/** BFS paths from a position, honouring the movement rules. */
export function reachableFrom(view: GameState, u: Unit, from: Hex, budget: number): Map<string, Hex[]> {
  const out = new Map<string, Hex[]>();
  const fake = { ...u, pos: from } as Unit;
  let frontier: { pos: Hex; path: Hex[] }[] = [{ pos: from, path: [] }];
  const seen = new Set([key(from)]);
  for (let d = 0; d < budget; d++) {
    const next: { pos: Hex; path: Hex[] }[] = [];
    for (const f of frontier) {
      for (const n of neighbors(f.pos, view.settings.bounds)) {
        const k = key(n);
        if (seen.has(k) || !canPass(view, fake, n)) continue;
        seen.add(k);
        const path = [...f.path, n];
        next.push({ pos: n, path });
        if (canEnd(view, fake, n)) out.set(k, path);
      }
    }
    frontier = next;
  }
  return out;
}

export function shapeTiles(view: GameState, a: AttackDef, from: Hex, target: Hex): Hex[] {
  const b = view.settings.bounds;
  if (a.shape === 'cone3') return cone(from, coneWedgeToward(from, target), 3, b);
  if (a.custom === 'lance') return ray(from, target, a.range, b);
  if (a.custom === 'order_up') return ring(target, 1, b);
  if (a.custom === 'flaming_skull' || a.custom === 'moonlit_charge') return ray(from, target, a.range, b);
  if (a.custom === 'prismatic_beam') return line(from, target).slice(1);
  if (a.custom === 'marsh_gas') return [target, ...ring(target, 1, b)];
  return [target];
}

export interface PlannerView {
  overlay: Overlay;
  cost: number;
  apLeft: number;
  issues: string[];
  order: ReturnType<typeof previewOrder>;
}

export function computeOverlay(view: GameState, me: PlayerId, ps: PlannerState, hover: Hex | null): PlannerView {
  const highlights = new Map<string, HighlightKind>();
  const paths: Overlay['paths'] = [];
  const targets: Overlay['targets'] = [];
  const ghosts: Overlay['ghosts'] = [];
  const plan = toPlan(ps, me);
  const chk = validatePlan(view, plan);
  const order = previewOrder(view, chk.plan);
  // planned moves and attacks of the whole team
  for (const c of ps.commands) {
    if (c.kind === 'move') paths.push({ unit: c.unit, tiles: c.path, color: '#4FE3FF' });
  }
  const posAt = new Map<string, Hex>();
  for (const c of ps.commands) {
    if (c.kind === 'move' && c.path.length) posAt.set(c.unit, c.path[c.path.length - 1]!);
    if (c.kind === 'attack' || c.kind === 'ability') {
      const u = view.units.find((x) => x.uid === c.unit);
      if (!u) continue;
      const from = posAt.get(c.unit) ?? u.pos;
      const tu = view.units.find((x) => x.uid === c.target.unit);
      const to = c.target.tile ?? tu?.pos ?? c.target.tiles?.[0];
      if (to) {
        const a = c.kind === 'attack' ? attackDefFor(view, u, c.attack) : undefined;
        targets.push({ from, to, color: a && (a.category === 'support' || (tu && tu.owner === me)) ? '#8CFF5A' : '#ff5a5a', area: a ? shapeTiles(view, a, from, to).slice(0, 40) : undefined });
      }
      for (const t of c.target.tiles ?? []) targets.push({ from, to: t, color: '#ff9a1f' });
    }
    if (c.kind === 'deploy') highlights.set(key(c.tile), 'ally');
  }
  for (const [uid, pos] of posAt) {
    const u = view.units.find((x) => x.uid === uid);
    if (u) ghosts.push({ unit: u, pos, order: order.findIndex((o) => o.unit === uid) + 1 });
  }
  // mode-specific highlights
  const m = ps.mode;
  if (m.kind === 'move') {
    const u = view.units.find((x) => x.uid === m.unit);
    if (u) {
      const from = plannedPos(view, ps, u.uid)!;
      const budget = (u.defId === 'shrink_head' ? 5 : maxMove(view, u)) - movedSoFar(ps, u.uid);
      for (const [k, path] of reachableFrom(view, u, from, Math.max(0, budget))) {
        highlights.set(k, 'move');
        if (hover && key(hover) === k) {
          paths.push({ unit: u.uid, tiles: path, color: '#e8dfc8' });
          for (const h of path) highlights.set(key(h), 'path');
        }
      }
    }
  }
  if (m.kind === 'attack' || m.kind === 'vector') {
    const u = view.units.find((x) => x.uid === m.unit);
    const a = u ? attackDefFor(view, u, m.attack) : undefined;
    if (u && a) {
      const from = plannedPos(view, ps, u.uid)!;
      const range = a.range + (u.defId === 'frankenstein' && (u.counters.charges ?? 0) >= 3 ? 1 : 0) + (m.kind === 'attack' && m.item && ITEMS[view.players[me].hand.find((c) => c.uid === m.item)?.itemId ?? '']?.id === 'scope' ? 2 : 0);
      if (a.targeting === 'self') {
        for (const h of a.shape === 'burst2' ? burst(from, 2, view.settings.bounds) : ring(from, 1, view.settings.bounds)) highlights.set(key(h), 'area');
      } else {
        for (const t of view.tiles) {
          const d = distance(from, t);
          if (d === 0 || d > Math.max(range, 1)) continue;
          highlights.set(key(t), 'attack');
        }
        for (const t of m.kind === 'attack' ? m.tiles : []) highlights.set(key(t), 'target');
        for (const o of view.units) {
          if (distance(from, o.pos) > Math.max(range, 1) || o.uid === u.uid) continue;
          if (a.targeting === 'character' || a.targeting === 'vector') highlights.set(key(o.pos), o.owner === me ? 'ally' : 'target');
          if (a.targeting === 'ally' && o.owner === me) highlights.set(key(o.pos), 'ally');
        }
        if (hover && (a.targeting === 'field' || a.targeting === 'multi-field')) for (const h of shapeTiles(view, a, from, hover)) highlights.set(key(h), 'area');
      }
    }
  }
  if (m.kind === 'ability') {
    const u = view.units.find((x) => x.uid === m.unit);
    const ab = u ? activeAbilities(view, u).find((a) => a.id === m.ability) : undefined;
    if (u && ab) {
      const from = plannedPos(view, ps, u.uid)!;
      for (const o of view.units) if (o.owner === me && distance(o.pos, from) <= Math.max(1, ab.range) && o !== u) highlights.set(key(o.pos), 'ally');
      if (ab.targeting === 'field') for (const n of neighbors(from, view.settings.bounds)) highlights.set(key(n), 'attack');
    }
  }
  if (m.kind === 'deploy') {
    for (const t of view.tiles) if (inZone(view, me, t) && isFree(view, t) && !ps.commands.some((c) => c.kind === 'deploy' && eq(c.tile, t))) highlights.set(key(t), 'deploy');
  }
  if (m.kind === 'item') {
    const card = view.players[me].hand.find((c) => c.uid === m.card);
    const it = card ? ITEMS[card.itemId] : undefined;
    if (it?.targeting === 'tile') for (const t of view.tiles) if (fieldTileAllowed(view, me, t)) highlights.set(key(t), 'attack');
    if (it?.targeting === 'trap-tile') for (const t of view.tiles) if (trapTileAllowed(view, me, t)) highlights.set(key(t), 'deploy');
    if (it && ['unit', 'ally', 'enemy'].includes(it.targeting)) for (const o of view.units) if (!o.isObject && (it.targeting !== 'ally' || o.owner === me)) highlights.set(key(o.pos), o.owner === me ? 'ally' : 'target');
  }
  const apLeft = view.players[me].ap - chk.cost;
  return {
    overlay: { highlights, paths, targets, ghosts, selected: ps.selected, hover },
    cost: chk.cost,
    apLeft,
    issues: chk.issues.map((i) => i.error),
    order,
  };
}

/** Handles a tap on a tile. Returns the new planner state and an optional toast message. */
export function tapTile(view: GameState, me: PlayerId, ps: PlannerState, h: Hex): { ps: PlannerState; msg?: string } {
  const unitHere = view.units.find((u) => eq(u.pos, h) && u.blocks) ?? view.units.find((u) => eq(u.pos, h));
  const m = ps.mode;
  const push = (c: Command, keepMode = false): PlannerState => ({ ...ps, commands: [...ps.commands, c], mode: keepMode ? ps.mode : { kind: 'idle' } });
  switch (m.kind) {
    case 'move': {
      const u = view.units.find((x) => x.uid === m.unit)!;
      const from = plannedPos(view, ps, u.uid)!;
      const budget = (u.defId === 'shrink_head' ? 5 : maxMove(view, u)) - movedSoFar(ps, u.uid);
      const path = reachableFrom(view, u, from, Math.max(0, budget)).get(key(h));
      if (!path) return { ps: { ...ps, mode: { kind: 'idle' } }, msg: 'Out of reach' };
      return { ps: push({ kind: 'move', unit: u.uid, path }) };
    }
    case 'attack': {
      const u = view.units.find((x) => x.uid === m.unit)!;
      const a = attackDefFor(view, u, m.attack)!;
      if (a.targeting === 'multi-field') {
        const tiles = [...m.tiles, h];
        const need = a.custom === 'candy_rain' ? 3 : 2;
        if (a.custom === 'prismatic_beam' || tiles.length >= need) {
          if (a.custom === 'prismatic_beam' && tiles.length < 2) return { ps: { ...ps, mode: { ...m, tiles } }, msg: 'Tap a second tile to bend the beam (or the same tile again to fire straight)' };
          const final = a.custom === 'prismatic_beam' && eq(tiles[0], tiles[1]) ? [tiles[0]!] : tiles;
          return { ps: push({ kind: 'attack', unit: u.uid, attack: a.id, target: { tiles: final }, item: m.item }) };
        }
        return { ps: { ...ps, mode: { ...m, tiles } }, msg: `Choose ${need - tiles.length} more tile${need - tiles.length > 1 ? 's' : ''}` };
      }
      if (a.targeting === 'field') {
        const target = unitHere && ['lance', 'flaming_skull', 'moonlit_charge', 'sporecloud', 'mire_song'].includes(a.custom ?? '') ? { unit: unitHere.uid, tile: h } : { tile: h };
        return { ps: push({ kind: 'attack', unit: u.uid, attack: a.id, target, item: m.item }) };
      }
      if (a.targeting === 'self') return { ps: push({ kind: 'attack', unit: u.uid, attack: a.id, target: {}, item: m.item }) };
      if (!unitHere) return { ps: push({ kind: 'attack', unit: u.uid, attack: a.id, target: { tile: h }, item: m.item }), msg: 'Aimed at the tile: hits whoever stands there' };
      // Grand Jeté / Lab Assistant retreat use extra tiles; default without
      return { ps: push({ kind: 'attack', unit: u.uid, attack: a.id, target: { unit: unitHere.uid }, item: m.item }) };
    }
    case 'vector': {
      if (!m.target) {
        if (!unitHere) return { ps, msg: 'Choose a unit to move' };
        return { ps: { ...ps, mode: { ...m, target: unitHere.uid } }, msg: 'Now tap the destination (up to 3 in a straight line)' };
      }
      const t = view.units.find((x) => x.uid === m.target)!;
      const d = distance(t.pos, h);
      if (d < 1 || d > 3) return { ps, msg: 'Destination must be 1–3 tiles away' };
      let dir = -1;
      for (let k = 0; k < 6; k++) {
        const seg = ray(t.pos, h, d, view.settings.bounds);
        void seg;
      }
      const dirs = [0, 1, 2, 3, 4, 5];
      for (const k of dirs) {
        let p = t.pos;
        for (let i = 0; i < d; i++) p = stepDir(p, k);
        if (eq(p, h)) dir = k;
      }
      if (dir < 0) return { ps, msg: 'Pick a tile in a straight line' };
      return { ps: push({ kind: 'attack', unit: m.unit, attack: m.attack, target: { unit: t.uid, dir, dist: d } }) };
    }
    case 'ability': {
      const target = unitHere ? { unit: unitHere.uid, tile: h } : { tile: h };
      return { ps: push({ kind: 'ability', unit: m.unit, ability: m.ability, target, item: m.item }) };
    }
    case 'deploy': {
      if (!inZone(view, me, h) || !isFree(view, h)) return { ps, msg: 'Deploy on a free tile of your zone' };
      return { ps: push({ kind: 'deploy', card: m.card, tile: h }) };
    }
    case 'item': {
      const card = view.players[me].hand.find((c) => c.uid === m.card);
      const it = card ? ITEMS[card.itemId] : undefined;
      if (!it) return { ps: { ...ps, mode: { kind: 'idle' } } };
      if (it.targeting === 'tile' || it.targeting === 'trap-tile') return { ps: push({ kind: 'item', card: m.card, target: { tile: h, dir: 0 } }) };
      if (!unitHere) return { ps, msg: 'Choose a unit' };
      return { ps: push({ kind: 'item', card: m.card, target: { unit: unitHere.uid } }) };
    }
    default: {
      if (unitHere && unitHere.owner === me) return { ps: { ...ps, selected: unitHere.uid } };
      return { ps: { ...ps, selected: unitHere?.uid } };
    }
  }
}

function stepDir(h: Hex, dir: number): Hex {
  const n = neighbors(h, { cols: 99, rows: 99 });
  void n;
  // axial step without bounds
  const q = h.c - (h.r - (h.r & 1)) / 2;
  const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][dir]!;
  const nq = q + D[0]!;
  const nr = h.r + D[1]!;
  return { c: nq + (nr - (nr & 1)) / 2, r: nr };
}

export function unitActions(view: GameState, u: Unit) {
  return { attacks: attacksOf(view, u), abilities: activeAbilities(view, u), canMove: !canMoveVoluntarily(view, u) || u.defId === 'shrink_head' };
}

export function commandLabel(view: GameState, c: Command): string {
  switch (c.kind) {
    case 'move':
      return `Move ${c.path.length}`;
    case 'attack': {
      const u = view.units.find((x) => x.uid === c.unit);
      return (u && attackDefFor(view, u, c.attack)?.name) ?? c.attack;
    }
    case 'ability': {
      const u = view.units.find((x) => x.uid === c.unit);
      return (u && activeAbilities(view, u).find((a) => a.id === c.ability)?.name) ?? c.ability;
    }
    case 'deploy': {
      const card = view.players.flatMap((p) => p.cards).find((x) => x.uid === c.card);
      return `Deploy ${CHARACTERS[card?.defId ?? '']?.name ?? ''}`;
    }
    case 'item': {
      const card = view.players.flatMap((p) => p.hand).find((x) => x.uid === c.card);
      return ITEMS[card?.itemId ?? '']?.name ?? 'Card';
    }
    case 'wait':
      return 'Wait';
    case 'hold':
      return 'Hold Position';
  }
}

export { pathCost };
