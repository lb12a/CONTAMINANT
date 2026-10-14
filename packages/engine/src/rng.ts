// Deterministic, serialisable PRNG (mulberry32). The whole match state carries its
// RNG state so a match can be replayed bit-for-bit from seed + plans, which the
// server uses for anti-cheat replay checks and the P2P lockstep mode relies on.

export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

export function nextU32(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform float in [0, 1). */
export function rand(rng: RngState): number {
  return nextU32(rng) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(rand(rng) * (max - min + 1));
}

/** True with probability p (0..1). */
export function chance(rng: RngState, p: number): boolean {
  if (p >= 1) return true;
  if (p <= 0) return false;
  return rand(rng) < p;
}

export function pick<T>(rng: RngState, arr: readonly T[]): T {
  return arr[Math.floor(rand(rng) * arr.length)]!;
}

export function shuffle<T>(rng: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Weighted pick: weights need not sum to 1. */
export function weighted<T>(rng: RngState, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let x = rand(rng) * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x < 0) return v;
  }
  return entries[entries.length - 1]![0];
}

/** Hash a string into a 32-bit seed (FNV-1a). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
