// Board generation (section 1 "Board and setup" + section 5 terrain).

import { allHexes, inBounds, key, neighbors, type Bounds, type Hex, STANDARD_BOUNDS } from './hex.ts';
import { pick, randInt, shuffle, type RngState } from './rng.ts';
import type { FieldId, ModeId, ObjectiveKind, PlayerId, Tile } from './types.ts';

export const WALL_HP = 120;
export const WALL_DEF = 60;
export const CENTER: Hex = { c: 7, r: 4 };

export function deployZoneCols(side: 'left' | 'right', bounds: Bounds = STANDARD_BOUNDS): [number, number] {
  const third = Math.floor(bounds.cols / 3);
  return side === 'left' ? [0, third - 1] : [bounds.cols - third, bounds.cols - 1];
}

export function inDeployZone(h: Hex, side: 'left' | 'right', bounds: Bounds = STANDARD_BOUNDS): boolean {
  const [a, b] = deployZoneCols(side, bounds);
  return h.c >= a && h.c <= b && h.r >= 0 && h.r < bounds.rows;
}

export function objectivesFor(mode: ModeId, bounds: Bounds = STANDARD_BOUNDS): { pos: Hex; kind: ObjectiveKind }[] {
  const mid = Math.floor(bounds.cols / 2);
  const cr = Math.floor(bounds.rows / 2);
  const top = { c: mid, r: 1 };
  const bot = { c: mid, r: bounds.rows - 2 };
  const centre = { c: mid, r: cr };
  switch (mode) {
    case 'domination':
      return [
        { pos: centre, kind: 'control' },
        { pos: top, kind: 'control' },
        { pos: bot, kind: 'control' },
      ];
    case 'research':
      return [
        { pos: centre, kind: 'terminal' },
        { pos: top, kind: 'terminal' },
        { pos: bot, kind: 'terminal' },
      ];
    case 'anomaly':
      return [
        { pos: centre, kind: 'lab' },
        { pos: top, kind: 'control' },
        { pos: bot, kind: 'control' },
      ];
    case 'contamination':
      return [
        { pos: centre, kind: 'control' },
        { pos: top, kind: 'terminal' },
        { pos: bot, kind: 'terminal' },
      ];
    default:
      return [{ pos: centre, kind: 'control' }];
  }
}

function emptyTiles(bounds: Bounds): Tile[] {
  return allHexes(bounds).map((h) => ({ c: h.c, r: h.r, wall: null, fields: [] }));
}

export function tileIndex(h: Hex, bounds: Bounds): number {
  return h.r * bounds.cols + h.c;
}

/** BFS over walkable tiles (no walls, not in `blocked`). Returns path from any start to any goal. */
export function findPath(
  tiles: Tile[],
  bounds: Bounds,
  starts: Hex[],
  isGoal: (h: Hex) => boolean,
  blocked: Set<string> = new Set(),
): Hex[] | null {
  const prev = new Map<string, string | null>();
  const queue: Hex[] = [];
  for (const s of starts) {
    const t = tiles[tileIndex(s, bounds)]!;
    if (t.wall || blocked.has(key(s))) continue;
    prev.set(key(s), null);
    queue.push(s);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (isGoal(cur)) {
      const path: Hex[] = [];
      let k: string | null = key(cur);
      while (k) {
        const [c, r] = k.split(',').map(Number);
        path.unshift({ c: c!, r: r! });
        k = prev.get(k) ?? null;
      }
      return path;
    }
    for (const n of neighbors(cur, bounds)) {
      const k = key(n);
      if (prev.has(k) || blocked.has(k)) continue;
      if (tiles[tileIndex(n, bounds)]!.wall) continue;
      prev.set(k, key(cur));
      queue.push(n);
    }
  }
  return null;
}

/** "At least 2 separate walkable routes between the sides": two vertex-disjoint paths outside the zones. */
export function hasTwoRoutes(tiles: Tile[], bounds: Bounds): boolean {
  const [, l1] = deployZoneCols('left', bounds);
  const [r0] = deployZoneCols('right', bounds);
  const starts = allHexes(bounds).filter((h) => h.c === l1);
  const goal = (h: Hex) => h.c === r0;
  const p1 = findPath(tiles, bounds, starts, goal);
  if (!p1) return false;
  const blocked = new Set(p1.filter((h) => h.c > l1 && h.c < r0).map(key));
  // also block the start/end tiles of the first route so the second really is separate
  blocked.add(key(p1[0]!));
  blocked.add(key(p1[p1.length - 1]!));
  const p2 = findPath(tiles, bounds, starts, goal, blocked);
  return !!p2;
}

export interface MapOptions {
  mode: ModeId;
  bounds?: Bounds;
  wallPct?: [number, number];
  terrainPct?: [number, number];
}

export function generateMap(rng: RngState, opts: MapOptions): Tile[] {
  const bounds = opts.bounds ?? STANDARD_BOUNDS;
  const total = bounds.cols * bounds.rows;
  const [wMin, wMax] = opts.wallPct ?? [0.12, 0.18];
  const [tMin, tMax] = opts.terrainPct ?? [0.08, 0.12];
  const objectives = objectivesFor(opts.mode, bounds);
  const reserved = new Set(objectives.map((o) => key(o.pos)));
  for (const o of objectives) for (const n of neighbors(o.pos, bounds)) if (o.kind === 'terminal') reserved.add(key(n));

  for (let attempt = 0; attempt < 200; attempt++) {
    const tiles = emptyTiles(bounds);
    const wallCount = randInt(rng, Math.ceil(total * wMin), Math.floor(total * wMax));
    const [, l1] = deployZoneCols('left', bounds);
    const [r0] = deployZoneCols('right', bounds);
    // walls mostly in the middle band, occasionally at the inner edge of the zones; mirrored for fairness
    const candidates = allHexes(bounds).filter((h) => h.c >= l1 && h.c <= r0 && !reserved.has(key(h)));
    let placed = 0;
    const order = shuffle(rng, candidates.slice());
    for (const h of order) {
      if (placed >= wallCount) break;
      const t = tiles[tileIndex(h, bounds)]!;
      if (t.wall) continue;
      // mirrored tile (point symmetry) for a fair board
      const m = { c: bounds.cols - 1 - h.c, r: bounds.rows - 1 - h.r };
      const tm = tiles[tileIndex(m, bounds)]!;
      if (reserved.has(key(m))) continue;
      t.wall = { hp: WALL_HP, maxHp: WALL_HP };
      placed++;
      if (placed < wallCount && !tm.wall) {
        tm.wall = { hp: WALL_HP, maxHp: WALL_HP };
        placed++;
      }
    }
    if (!hasTwoRoutes(tiles, bounds)) continue;

    // terrain clusters: water, overgrowth, ice
    const terrainCount = randInt(rng, Math.ceil(total * tMin), Math.floor(total * tMax));
    let tp = 0;
    let guard = 0;
    while (tp < terrainCount && guard++ < 500) {
      const kind: FieldId = pick(rng, ['water', 'overgrowth', 'ice'] as const);
      let cur: Hex = { c: randInt(rng, 1, bounds.cols - 2), r: randInt(rng, 0, bounds.rows - 1) };
      const size = randInt(rng, 2, 4);
      for (let i = 0; i < size && tp < terrainCount; i++) {
        const t = tiles[tileIndex(cur, bounds)]!;
        if (!t.wall && !reserved.has(key(cur)) && t.fields.length === 0) {
          t.fields.push({ id: kind, until: null, createdRound: 0 });
          tp++;
        }
        const ns = neighbors(cur, bounds);
        cur = pick(rng, ns);
      }
    }
    for (const o of objectives) {
      const t = tiles[tileIndex(o.pos, bounds)]!;
      t.objective = o.kind;
      t.wall = null;
      t.fields = [];
      if (o.kind === 'terminal') t.terminalReadyRound = 1;
    }
    return tiles;
  }
  // fallback: open board
  const tiles = emptyTiles(bounds);
  for (const o of objectivesFor(opts.mode, bounds)) tiles[tileIndex(o.pos, bounds)]!.objective = o.kind;
  return tiles;
}

/** Tutorial test chamber: 9×5 hexes, 2–4 walls at fixed positions. */
export function testChamber(walls: Hex[], bounds: Bounds = { cols: 9, rows: 5 }): Tile[] {
  const tiles = emptyTiles(bounds);
  for (const w of walls) if (inBounds(w, bounds)) tiles[tileIndex(w, bounds)]!.wall = { hp: WALL_HP, maxHp: WALL_HP };
  return tiles;
}

export function sideOf(player: PlayerId, firstSide: 'left' | 'right'): 'left' | 'right' {
  if (player === 0) return firstSide;
  return firstSide === 'left' ? 'right' : 'left';
}

