// Pointy-top hex grid in "odd-r" offset layout (odd rows shifted right).
// Offset coordinates are 0-based internally: col 0..14, row 0..8 on the 15×9 board.
// The design documents use 1-based numbers (column 8, row 5 = Control Field = {c:7,r:4}).

export interface Hex {
  c: number;
  r: number;
}

export interface Cube {
  q: number;
  r: number;
  s: number;
}

export interface Bounds {
  cols: number;
  rows: number;
}

export const STANDARD_BOUNDS: Bounds = { cols: 15, rows: 9 };

/** Axial direction vectors: E, NE, NW, W, SW, SE (clockwise from E would be E, SE, SW, W, NW, NE). */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
export const DIR_NAMES = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;

export function hex(c: number, r: number): Hex {
  return { c, r };
}

export function key(h: Hex): string {
  return `${h.c},${h.r}`;
}

export function parseKey(k: string): Hex {
  const [c, r] = k.split(',').map(Number);
  return { c: c!, r: r! };
}

export function eq(a: Hex | null | undefined, b: Hex | null | undefined): boolean {
  return !!a && !!b && a.c === b.c && a.r === b.r;
}

export function toCube(h: Hex): Cube {
  const q = h.c - (h.r - (h.r & 1)) / 2;
  return { q, r: h.r, s: -q - h.r };
}

export function fromCube(cu: Cube): Hex {
  const c = cu.q + (cu.r - (cu.r & 1)) / 2;
  return { c, r: cu.r };
}

export function fromAxial(q: number, r: number): Hex {
  return fromCube({ q, r, s: -q - r });
}

export function inBounds(h: Hex, b: Bounds = STANDARD_BOUNDS): boolean {
  return h.c >= 0 && h.r >= 0 && h.c < b.cols && h.r < b.rows;
}

export function distance(a: Hex, b: Hex): number {
  const x = toCube(a);
  const y = toCube(b);
  return Math.max(Math.abs(x.q - y.q), Math.abs(x.r - y.r), Math.abs(x.s - y.s));
}

export function step(h: Hex, dir: number, n = 1): Hex {
  const cu = toCube(h);
  const d = DIRS[((dir % 6) + 6) % 6]!;
  return fromAxial(cu.q + d[0] * n, cu.r + d[1] * n);
}

export function offsetBy(h: Hex, dq: number, dr: number): Hex {
  const cu = toCube(h);
  return fromAxial(cu.q + dq, cu.r + dr);
}

export function neighbors(h: Hex, b: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = [];
  for (let d = 0; d < 6; d++) {
    const n = step(h, d);
    if (inBounds(n, b)) out.push(n);
  }
  return out;
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return distance(a, b) === 1;
}

function cubeRound(q: number, r: number, s: number): Cube {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return { q: rq, r: rr, s: rs };
}

/** Hex line from a to b inclusive (cube lerp with a small nudge for deterministic tie-breaking). */
export function line(a: Hex, b: Hex): Hex[] {
  const A = toCube(a);
  const B = toCube(b);
  const n = distance(a, b);
  const out: Hex[] = [];
  if (n === 0) return [a];
  const e = 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(
      fromCube(
        cubeRound(
          A.q + e + (B.q - A.q) * t,
          A.r + e + (B.r - A.r) * t,
          A.s - 2 * e + (B.s - A.s) * t,
        ),
      ),
    );
  }
  return out;
}

/** Extend the ray from a through b until it reaches `length` steps from a (or leaves bounds). Excludes a. */
export function ray(a: Hex, b: Hex, length: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  if (eq(a, b)) return [];
  const A = toCube(a);
  const B = toCube(b);
  const d = distance(a, b);
  const out: Hex[] = [];
  const e = 1e-6;
  for (let i = 1; i <= length; i++) {
    const t = i / d;
    const h = fromCube(
      cubeRound(A.q + e + (B.q - A.q) * t, A.r + e + (B.r - A.r) * t, A.s - 2 * e + (B.s - A.s) * t),
    );
    if (!inBounds(h, bounds)) break;
    out.push(h);
  }
  return out;
}

export function straight(origin: Hex, dir: number, length: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = [];
  for (let i = 1; i <= length; i++) {
    const h = step(origin, dir, i);
    if (!inBounds(h, bounds)) break;
    out.push(h);
  }
  return out;
}

export function ring(center: Hex, radius: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  if (radius === 0) return inBounds(center, bounds) ? [center] : [];
  const out: Hex[] = [];
  const cu = toCube(center);
  // start at direction 4 (SW) * radius, walk around
  let q = cu.q + DIRS[4]![0] * radius;
  let r = cu.r + DIRS[4]![1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < radius; i++) {
      const h = fromAxial(q, r);
      if (inBounds(h, bounds)) out.push(h);
      q += DIRS[side]![0];
      r += DIRS[side]![1];
    }
  }
  return out;
}

export function burst(center: Hex, radius: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = [];
  for (let k = 0; k <= radius; k++) out.push(...ring(center, k, bounds));
  return out;
}

/** Cone: 60° wedge between DIRS[w] and DIRS[w+1]; rows of 2, 3, 4 ... tiles. */
export function cone(origin: Hex, wedge: number, length: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = [];
  const cu = toCube(origin);
  const d1 = DIRS[((wedge % 6) + 6) % 6]!;
  const d2 = DIRS[(((wedge + 1) % 6) + 6) % 6]!;
  const edge = [d2[0] - d1[0], d2[1] - d1[1]];
  for (let k = 1; k <= length; k++) {
    for (let j = 0; j <= k; j++) {
      const h = fromAxial(cu.q + d1[0] * k + edge[0]! * j, cu.r + d1[1] * k + edge[1]! * j);
      if (inBounds(h, bounds)) out.push(h);
    }
  }
  return out;
}

/** Pixel-space angle (radians) from a to b for a pointy-top layout of unit size. */
export function angle(a: Hex, b: Hex): number {
  const pa = toPixel(a, 1);
  const pb = toPixel(b, 1);
  return Math.atan2(pb.y - pa.y, pb.x - pa.x);
}

/** Pick the cone wedge whose bisector points closest to `target`. */
export function coneWedgeToward(origin: Hex, target: Hex): number {
  const ang = angle(origin, target);
  let best = 0;
  let bestD = Infinity;
  for (let w = 0; w < 6; w++) {
    const a1 = dirAngle(w);
    const a2 = dirAngle(w + 1);
    const mid = Math.atan2(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2));
    const d = Math.abs(Math.atan2(Math.sin(ang - mid), Math.cos(ang - mid)));
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export function dirAngle(dir: number): number {
  const d = DIRS[((dir % 6) + 6) % 6]!;
  const x = Math.sqrt(3) * (d[0] + d[1] / 2);
  const y = 1.5 * d[1];
  return Math.atan2(y, x);
}

/** Nearest of the 6 directions from a toward b. */
export function directionTo(a: Hex, b: Hex): number {
  const ang = angle(a, b);
  let best = 0;
  let bestD = Infinity;
  for (let d = 0; d < 6; d++) {
    const diff = Math.abs(Math.atan2(Math.sin(ang - dirAngle(d)), Math.cos(ang - dirAngle(d))));
    if (diff < bestD) {
      bestD = diff;
      best = d;
    }
  }
  return best;
}

export function star(center: Hex, armLength: number, bounds: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = inBounds(center, bounds) ? [center] : [];
  for (let d = 0; d < 6; d++) out.push(...straight(center, d, armLength, bounds));
  return out;
}

/** Clock Ring offsets (axial) indexed by hour 1..12 (index 0 = hour 12 at the top). */
const CLOCK_AXIAL: readonly (readonly [number, number])[] = [
  [1, -2], // 12
  [2, -2], // 1
  [2, -1], // 2
  [2, 0], // 3
  [1, 1], // 4
  [0, 2], // 5
  [-1, 2], // 6
  [-2, 2], // 7
  [-2, 1], // 8
  [-2, 0], // 9
  [-1, -1], // 10
  [0, -2], // 11
];

/** Returns the clock ring tile for hour 1..12 (may be out of bounds; caller filters). */
export function clockTile(center: Hex, hour: number): Hex {
  const h = (((hour - 1) % 12) + 12) % 12 + 1; // 1..12
  const idx = h % 12;
  const off = CLOCK_AXIAL[idx]!;
  return offsetBy(center, off[0], off[1]);
}

export function clockRing(center: Hex): { hour: number; tile: Hex }[] {
  const out: { hour: number; tile: Hex }[] = [];
  for (let h = 1; h <= 12; h++) out.push({ hour: h, tile: clockTile(center, h) });
  return out;
}

export function toPixel(h: Hex, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (h.c + 0.5 * (h.r & 1));
  const y = size * 1.5 * h.r;
  return { x, y };
}

export function fromPixel(x: number, y: number, size: number): Hex {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return fromCube(cubeRound(q, r, -q - r));
}

export function allHexes(b: Bounds = STANDARD_BOUNDS): Hex[] {
  const out: Hex[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) out.push({ c, r });
  return out;
}

export function uniqueHexes(list: Hex[]): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const h of list) {
    const k = key(h);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

/** 1-based label as used in the design documents, e.g. "8/5". */
export function label(h: Hex): string {
  return `${h.c + 1}/${h.r + 1}`;
}
