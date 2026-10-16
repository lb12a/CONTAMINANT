// Attack visuals by damage type. Every attack plays as charge → flight → impact, and each damage type has
// its own projectile and impact: a fireball that leaves embers, a jagged bolt, a toxic glob that drips, an
// acid spray, sonic wave fronts, orbiting psychic orbs, a wobbling soul wisp, a radiant beam, an arrow, a
// tumbling rock and a spinning blade. Drawn into the additive effects layer of the diorama each frame.

import type { Graphics } from 'pixi.js';
import type { DamageTag } from '@contaminant/engine';
import type { Vfx } from './types.ts';

export interface Pt {
  x: number;
  y: number;
}

export interface FxCtx {
  g: Graphics;
  now: number;
  /** tile radius in world units */
  S: number;
  reduce: boolean;
  emit: (x: number, y: number, vx: number, vy: number, life: number, color: number, r: number, grav?: number) => void;
}

/** size unit: the literal sizes below are for a tile radius of 30, U scales them to the real one */
let U = 2;

/** an arc that begins its own sub-path (a bare arc() is joined to the previous point by a line) */
function arcAt(g: Graphics, x: number, y: number, r: number, a0: number, a1: number): Graphics {
  return g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1);
}

const hexNum = (c: string) => parseInt(c.replace('#', '').slice(0, 6), 16) || 0xffffff;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number) => k * k;
/** cheap repeatable noise: flickers at a fixed rate instead of every frame */
const jitter = (seed: number) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

/** how high each projectile arcs (in tiles) and how its speed feels */
const ARC: Partial<Record<DamageTag, number>> = { fire: 0.7, toxic: 1.5, acid: 0.5, blunt: 1.1, psychic: 0.35, soul: 0.2, sonic: 0, electric: 0, radiant: 0, pierce: 0.12, slash: 0.15 };

/** Where the flight is at progress k (0..1), with the arc of its damage type. */
function along(a: Pt, b: Pt, k: number, arc: number, S: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * S * arc };
}

/** Draws one attack visual. a = attacker (chest height), b = target (chest height), k = 0..1(+) of its duration. */
export function drawAttackFx(c: FxCtx, fx: Vfx, a: Pt, b: Pt, k: number): void {
  U = c.S / 30;
  const tag = fx.tag ?? 'slash';
  const col = fx.color;
  const num = hexNum(col);
  if (fx.kind === 'charge') return charge(c, a, k, col, num);
  if (fx.kind === 'impact') return fx.miss ? missPuff(c, b, k, col) : impact(c, tag, b, k, col, num);
  if (fx.kind === 'beam' || (fx.kind === 'projectile' && (tag === 'electric' || tag === 'radiant'))) return tag === 'electric' ? bolt(c, a, b, k, col, num) : beam(c, a, b, k, col, num);
  if (fx.kind === 'projectile') return projectile(c, tag, a, b, k, col, num);
  if (fx.kind === 'slash') return claws(c, b, k, col);
  // plain burst (abilities without a damage type)
  const r = c.S * (0.3 + 0.9 * k);
  c.g.ellipse(b.x, b.y + c.S * 0.3, r, r * 0.7).stroke({ width: 5 * U, color: col, alpha: Math.max(0, 1 - k) });
}

/** Wind-up at the attacker: a ring closes in and sparks are drawn towards the creature. */
function charge(c: FxCtx, a: Pt, k: number, col: string, num: number): void {
  if (k > 1) return;
  const { g, S } = c;
  const r = S * (1.1 - 0.7 * easeOut(k));
  g.circle(a.x, a.y, r).stroke({ width: 3 * U + 4 * k, color: col, alpha: 0.25 + 0.6 * k });
  g.circle(a.x, a.y, S * 0.25 * k).fill({ color: col, alpha: 0.35 * k });
  if (!c.reduce && Math.random() < 0.7) {
    const ang = Math.random() * Math.PI * 2;
    const d = S * (0.9 + Math.random() * 0.4);
    c.emit(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d * 0.8, -Math.cos(ang) * d * 2.2, -Math.sin(ang) * d * 1.8, 380, num, 2 + Math.random() * 2, 0);
  }
}

function projectile(c: FxCtx, tag: DamageTag, a: Pt, b: Pt, k: number, col: string, num: number): void {
  const { g, S } = c;
  const kk = clamp01(k);
  const arc = ARC[tag] ?? 0.6;
  const fade = k > 1 ? Math.max(0, 1 - (k - 1) * 6) : 1;
  const head = along(a, b, kk, arc, S);
  const dir = Math.atan2(b.y - a.y, b.x - a.x);
  switch (tag) {
    case 'fire': {
      // fireball: a small hot core inside an orange body and halo, a flame trail, embers that rise
      for (let i = 7; i >= 1; i--) {
        const p = along(a, b, Math.max(0, kk - i * 0.035), arc, S);
        g.circle(p.x, p.y, U * (10 - i) * (1 + 0.15 * Math.sin(c.now / 40 + i))).fill({ color: i < 4 ? 0xff7a1a : 0xc0301a, alpha: (1 - i / 8) * 0.4 * fade });
      }
      g.circle(head.x, head.y, 20 * U).fill({ color: num, alpha: 0.2 * fade });
      g.circle(head.x, head.y, 11 * U * (1 + 0.08 * Math.sin(c.now / 30))).fill({ color: 0xff8a1f, alpha: 0.55 * fade });
      g.circle(head.x, head.y, 5 * U).fill({ color: 0xffe9a0, alpha: 0.85 * fade });
      if (!c.reduce) for (let i = 0; i < 2; i++) c.emit(head.x + jitter(c.now + i) * 10, head.y + jitter(c.now * 2 + i) * 10, jitter(c.now * 3 + i) * 40, -30 - Math.random() * 50, 450, Math.random() < 0.5 ? 0xff8a1f : 0xffd070, 2 + Math.random() * 2.5, -60);
      break;
    }
    case 'toxic': {
      // a wobbling glob on a high arc, dripping on the way
      const wob = Math.sin(c.now / 60) * 0.18;
      g.ellipse(head.x, head.y, U * 12 * (1 + wob), U * 12 * (1 - wob)).fill({ color: num, alpha: 0.95 * fade });
      g.circle(head.x - 4 * U, head.y - 4 * U, 4 * U).fill({ color: 0xeaffd8, alpha: 0.8 * fade });
      for (let i = 1; i < 6; i++) {
        const p = along(a, b, Math.max(0, kk - i * 0.05), arc, S);
        g.circle(p.x, p.y, U * (7 - i)).fill({ color: num, alpha: (0.5 - i * 0.08) * fade });
      }
      if (!c.reduce && Math.random() < 0.45) c.emit(head.x, head.y + 8, jitter(c.now) * 20, 30, 600, num, 2.5 + Math.random() * 2, 420);
      break;
    }
    case 'acid': {
      // a spray of droplets, one after the other
      for (let d = 0; d < 6; d++) {
        const t = clamp01(kk * 1.3 - d * 0.07);
        if (t <= 0 || t >= 1) continue;
        const p = along(a, b, t, arc, S);
        g.ellipse(p.x, p.y, 6 * U, 4.5 * U).fill({ color: d % 2 ? 0xf4ff9a : num, alpha: 0.9 * fade });
      }
      break;
    }
    case 'sonic': {
      // wave fronts: arcs perpendicular to the flight that grow as they travel
      for (let w = 0; w < 4; w++) {
        const t = clamp01(kk * 1.25 - w * 0.12);
        if (t <= 0 || t >= 1) continue;
        const p = along(a, b, t, 0, S);
        const r = S * (0.25 + 0.55 * t);
        arcAt(g, p.x, p.y, r, dir - 0.9, dir + 0.9).stroke({ width: 5 * U - w, color: col, alpha: (1 - t * 0.6) * fade });
      }
      break;
    }
    case 'psychic': {
      // an orb with three satellites spiralling around the path
      g.circle(head.x, head.y, 10 * U).fill({ color: num, alpha: 0.9 * fade });
      g.circle(head.x, head.y, 18 * U).stroke({ width: 2 * U, color: col, alpha: 0.5 * fade });
      for (let s = 0; s < 3; s++) {
        const ang = c.now / 90 + (s * Math.PI * 2) / 3;
        g.circle(head.x + Math.cos(ang) * 20, head.y + Math.sin(ang) * 12, 4 * U).fill({ color: 0xffd0f0, alpha: 0.9 * fade });
      }
      if (!c.reduce && Math.random() < 0.4) c.emit(head.x, head.y, jitter(c.now) * 60, jitter(c.now + 9) * 60, 500, 0xffb0e8, 2, 0);
      break;
    }
    case 'soul': {
      // a pale wisp that wobbles towards the target with a long fading tail
      const perp = dir + Math.PI / 2;
      for (let i = 14; i >= 0; i--) {
        const t = Math.max(0, kk - i * 0.03);
        const p = along(a, b, t, arc, S);
        const w = Math.sin(t * Math.PI * 4 + c.now / 120) * S * 0.28 * Math.sin(Math.PI * t);
        g.circle(p.x + Math.cos(perp) * w, p.y + Math.sin(perp) * w, U * (10 - i * 0.6)).fill({ color: i === 0 ? 0xeef4ff : num, alpha: (1 - i / 15) * 0.7 * fade });
      }
      break;
    }
    case 'pierce': {
      // an arrow or spike: fast, almost straight, a thin streak behind it
      const tail = along(a, b, Math.max(0, kk - 0.18), arc, S);
      g.moveTo(tail.x, tail.y).lineTo(head.x, head.y).stroke({ width: 3 * U, color: col, alpha: 0.6 * fade });
      const ang = Math.atan2(head.y - tail.y, head.x - tail.x);
      const tip = { x: head.x + Math.cos(ang) * 14 * U, y: head.y + Math.sin(ang) * 14 * U };
      const l = { x: head.x + Math.cos(ang + 2.6) * 9 * U, y: head.y + Math.sin(ang + 2.6) * 9 * U };
      const r = { x: head.x + Math.cos(ang - 2.6) * 9 * U, y: head.y + Math.sin(ang - 2.6) * 9 * U };
      g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y], true).fill({ color: 0xffffff, alpha: fade });
      break;
    }
    case 'blunt': {
      // a tumbling rock with a dust trail
      const rot = c.now / 70;
      const pts: number[] = [];
      for (let i = 0; i < 7; i++) {
        const ang = rot + (i / 7) * Math.PI * 2;
        const rr = U * (11 + (i % 3) * 2.5);
        pts.push(head.x + Math.cos(ang) * rr, head.y + Math.sin(ang) * rr);
      }
      g.poly(pts, true).fill({ color: num, alpha: 0.9 * fade });
      if (!c.reduce && Math.random() < 0.5) c.emit(head.x, head.y, 0, 10, 380, 0xb9b09a, 3, 30);
      break;
    }
    default: {
      // slash and anything else: a spinning crescent blade
      const rot = c.now / 45;
      arcAt(g, head.x, head.y, 14 * U, rot, rot + 2.4).stroke({ width: 5 * U, color: 0xffffff, alpha: fade });
      arcAt(g, head.x, head.y, 18 * U, rot, rot + 2.4).stroke({ width: 3 * U, color: col, alpha: 0.7 * fade });
    }
  }
}

/** Electric: a jagged bolt that strikes and flickers, re-drawn ~16 times a second. */
function bolt(c: FxCtx, a: Pt, b: Pt, k: number, col: string, num: number): void {
  if (k > 1.1) return;
  const { g, S } = c;
  const reach = clamp01(k * 2.2);
  const end = { x: a.x + (b.x - a.x) * reach, y: a.y + (b.y - a.y) * reach };
  const alpha = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.6) * (0.6 + 0.4 * Math.sin(c.now / 25));
  const seed = Math.floor(c.now / 60);
  for (const [w, color, al] of [
    [11, col, 0.3],
    [3, '#ffffff', 1],
  ] as const) {
    g.moveTo(a.x, a.y);
    const n = 9;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      g.lineTo(a.x + (end.x - a.x) * t + jitter(seed + i) * S * 0.5, a.y + (end.y - a.y) * t + jitter(seed * 3 + i) * S * 0.5);
    }
    g.lineTo(end.x, end.y).stroke({ width: w * U, color, alpha: al * alpha });
  }
  if (!c.reduce && reach >= 1 && Math.random() < 0.6) c.emit(b.x, b.y, jitter(c.now) * 260, jitter(c.now + 3) * 260, 220, num, 1.8, 0);
}

/** Radiant (and other beams): a column of light that grows from the attacker and burns bright, with sparkles. */
function beam(c: FxCtx, a: Pt, b: Pt, k: number, col: string, num: number): void {
  if (k > 1.1) return;
  const { g } = c;
  const reach = clamp01(k * 2.5);
  const end = { x: a.x + (b.x - a.x) * reach, y: a.y + (b.y - a.y) * reach };
  const life = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.5);
  const w = U * 8 + U * 6 * Math.sin(Math.min(1, k * 2) * Math.PI * 0.5);
  g.moveTo(a.x, a.y).lineTo(end.x, end.y).stroke({ width: w * 3, color: col, alpha: 0.18 * life });
  g.moveTo(a.x, a.y).lineTo(end.x, end.y).stroke({ width: w, color: col, alpha: 0.55 * life });
  g.moveTo(a.x, a.y).lineTo(end.x, end.y).stroke({ width: w * 0.35, color: 0xffffff, alpha: 0.95 * life });
  if (!c.reduce && Math.random() < 0.6) {
    const t = Math.random() * reach;
    c.emit(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, jitter(c.now) * 50, -20 - Math.random() * 40, 500, num, 2, -20);
  }
}

/** Melee claw marks: three bright strokes raked across the target. */
function claws(c: FxCtx, b: Pt, k: number, col: string): void {
  if (k > 1) return;
  const { g, S } = c;
  const draw = clamp01(k * 2.4);
  const alpha = k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) * 2);
  for (let i = -1; i <= 1; i++) {
    const x0 = b.x - S * 0.5 + i * S * 0.22;
    const y0 = b.y - S * 0.55;
    const x1 = b.x + S * 0.35 + i * S * 0.22;
    const y1 = b.y + S * 0.45;
    const ex = x0 + (x1 - x0) * draw;
    const ey = y0 + (y1 - y0) * draw;
    g.moveTo(x0, y0).lineTo(ex, ey).stroke({ width: 9 * U - Math.abs(i) * 2, color: col, alpha: 0.45 * alpha });
    g.moveTo(x0, y0).lineTo(ex, ey).stroke({ width: 3.5 * U - Math.abs(i), color: 0xffffff, alpha: alpha });
  }
}

/** The hit itself, by damage type. */
function impact(c: FxCtx, tag: DamageTag, b: Pt, k: number, col: string, num: number): void {
  if (k > 1) return;
  const { g, S } = c;
  const first = k < 0.08;
  const fade = 1 - k;
  const ground = b.y + S * 0.55;
  switch (tag) {
    case 'fire': {
      const r = S * (0.25 + 0.75 * easeOut(k));
      g.circle(b.x, b.y, r).fill({ color: 0xff7a1a, alpha: 0.35 * fade });
      g.circle(b.x, b.y, r * 0.4).fill({ color: 0xffe08a, alpha: 0.45 * fade * fade });
      g.circle(b.x, b.y, r * 1.15).stroke({ width: 5 * U, color: num, alpha: 0.8 * fade });
      if (first && !c.reduce) for (let i = 0; i < 26; i++) c.emit(b.x, b.y, jitter(c.now + i) * 300, -60 - Math.random() * 180, 600 + Math.random() * 400, i % 3 ? 0xffa43a : 0xffe08a, 2 + Math.random() * 4, -40);
      break;
    }
    case 'electric': {
      const seed = Math.floor(c.now / 50);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + jitter(seed + i);
        const len = S * (0.5 + 0.6 * Math.abs(jitter(seed * 7 + i))) * (0.6 + 0.4 * fade);
        const mid = { x: b.x + Math.cos(ang + 0.3) * len * 0.5, y: b.y + Math.sin(ang + 0.3) * len * 0.5 };
        g.moveTo(b.x, b.y).lineTo(mid.x, mid.y).lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len).stroke({ width: 3 * U, color: i % 2 ? 0xffffff : col, alpha: fade });
      }
      g.circle(b.x, b.y, S * 0.4 * fade).fill({ color: 0xffffff, alpha: 0.5 * fade });
      if (first && !c.reduce) for (let i = 0; i < 18; i++) c.emit(b.x, b.y, jitter(c.now + i) * 520, jitter(c.now * 2 + i) * 520, 260, num, 1.8, 120);
      break;
    }
    case 'toxic': {
      g.ellipse(b.x, ground, S * (0.3 + 0.8 * easeOut(k)), S * (0.12 + 0.3 * easeOut(k))).stroke({ width: 5 * U, color: col, alpha: 0.8 * fade });
      g.ellipse(b.x, ground, S * (0.25 + 0.5 * easeOut(k)), S * (0.1 + 0.2 * easeOut(k))).fill({ color: col, alpha: 0.25 * fade });
      if (first && !c.reduce) {
        for (let i = 0; i < 16; i++) c.emit(b.x, b.y, jitter(c.now + i) * 260, -120 - Math.random() * 160, 700, num, 2.5 + Math.random() * 3, 520);
        for (let i = 0; i < 8; i++) c.emit(b.x + jitter(c.now * 5 + i) * S, ground, 0, -30 - Math.random() * 30, 1100, 0xc8ff9a, 2 + Math.random() * 2, -10);
      }
      break;
    }
    case 'acid': {
      g.circle(b.x, b.y, S * (0.2 + 0.4 * easeOut(k))).stroke({ width: 4 * U, color: col, alpha: fade });
      if (!c.reduce && Math.random() < 0.5 * fade) c.emit(b.x + jitter(c.now) * S * 0.8, b.y + jitter(c.now + 1) * S * 0.5, jitter(c.now + 2) * 20, -40 - Math.random() * 30, 900, 0xe8f0b0, 3 + Math.random() * 3, -20);
      if (first && !c.reduce) for (let i = 0; i < 12; i++) c.emit(b.x, b.y, jitter(c.now + i) * 200, -100 - Math.random() * 100, 500, num, 2 + Math.random() * 2, 400);
      break;
    }
    case 'sonic': {
      for (let i = 0; i < 3; i++) {
        const t = clamp01(k * 1.3 - i * 0.15);
        if (t <= 0 || t >= 1) continue;
        g.circle(b.x, b.y, S * (0.2 + 1.1 * t)).stroke({ width: 5 * U - i, color: col, alpha: (1 - t) * 0.9 });
      }
      break;
    }
    case 'psychic': {
      g.circle(b.x, b.y, S * (0.3 + 0.8 * easeOut(k))).stroke({ width: 4 * U, color: col, alpha: fade });
      const rot = k * 3;
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = (i % 2 ? 0.18 : 0.5) * S * (0.6 + 0.6 * k);
        pts.push(b.x + Math.cos(rot + (i / 10) * Math.PI * 2) * rr, b.y + Math.sin(rot + (i / 10) * Math.PI * 2) * rr);
      }
      g.poly(pts, true).fill({ color: num, alpha: 0.55 * fade });
      if (first && !c.reduce) for (let i = 0; i < 14; i++) c.emit(b.x, b.y, jitter(c.now + i) * 220, jitter(c.now * 3 + i) * 220, 600, 0xffb0e8, 2, 0);
      break;
    }
    case 'soul': {
      g.circle(b.x, b.y, S * (0.35 + 0.6 * easeOut(k))).stroke({ width: 3 * U, color: col, alpha: 0.7 * fade });
      if (!c.reduce && Math.random() < 0.6 * fade) c.emit(b.x + jitter(c.now) * S * 0.6, b.y, jitter(c.now + 5) * 30, -70 - Math.random() * 50, 900, num, 3 + Math.random() * 2, -30);
      break;
    }
    case 'radiant': {
      const rot = k * 1.2;
      for (let i = 0; i < 12; i++) {
        const ang = rot + (i / 12) * Math.PI * 2;
        const len = S * (i % 2 ? 0.6 : 1.1) * (0.4 + 0.6 * easeOut(k));
        g.moveTo(b.x, b.y).lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len).stroke({ width: (i % 2 ? 2 : 4) * U, color: i % 3 ? col : '#ffffff', alpha: fade });
      }
      g.circle(b.x, b.y, S * 0.5 * (1 - easeIn(k))).fill({ color: 0xffffff, alpha: 0.6 * fade });
      break;
    }
    case 'pierce': {
      for (let i = 0; i < 5; i++) {
        const ang = -0.6 + i * 0.3 + Math.PI;
        const r0 = S * 0.15;
        const r1 = S * (0.3 + 0.6 * easeOut(k));
        g.moveTo(b.x + Math.cos(ang) * r0, b.y + Math.sin(ang) * r0).lineTo(b.x + Math.cos(ang) * r1, b.y + Math.sin(ang) * r1).stroke({ width: 2.5 * U, color: i === 2 ? 0xffffff : col, alpha: fade });
      }
      g.circle(b.x, b.y, U * (6 * fade + 2)).fill({ color: 0xffffff, alpha: fade });
      break;
    }
    case 'blunt': {
      // a comic smash star and a ring of dust on the ground
      const r = S * (0.35 + 0.55 * easeOut(k));
      const pts: number[] = [];
      for (let i = 0; i < 16; i++) {
        const rr = i % 2 ? r * 0.5 : r;
        pts.push(b.x + Math.cos((i / 16) * Math.PI * 2 + 0.2) * rr, b.y + Math.sin((i / 16) * Math.PI * 2 + 0.2) * rr);
      }
      g.poly(pts, true).fill({ color: 0xfff0b0, alpha: 0.45 * fade }).stroke({ width: 4 * U, color: col, alpha: fade });
      g.ellipse(b.x, ground, S * (0.4 + 0.9 * easeOut(k)), S * (0.12 + 0.28 * easeOut(k))).stroke({ width: 4 * U, color: 0xd8cbb0, alpha: 0.6 * fade });
      if (first && !c.reduce) for (let i = 0; i < 14; i++) c.emit(b.x + jitter(c.now + i) * S, ground, jitter(c.now * 2 + i) * 160, -40 - Math.random() * 60, 600, 0xb9b09a, 3 + Math.random() * 3, 160);
      break;
    }
    default: {
      // slash: claw marks and a few sparks
      claws(c, b, k, col);
      if (first && !c.reduce) for (let i = 0; i < 10; i++) c.emit(b.x, b.y, jitter(c.now + i) * 300, jitter(c.now * 2 + i) * 300 - 60, 400, 0xffffff, 2, 300);
    }
  }
}

/** A miss: the attack whiffs past, only a faint puff where it landed. */
function missPuff(c: FxCtx, b: Pt, k: number, col: string): void {
  if (k > 1) return;
  c.g.circle(b.x + c.S * 0.5 * k, b.y - c.S * 0.2 * k, c.S * 0.25 * (1 + k)).stroke({ width: 2 * U, color: col, alpha: 0.5 * (1 - k) });
}

/** Screen shake offset for the effects playing now (heavy hits and crits). */
export function shakeOffset(list: Vfx[] | undefined, now: number): Pt {
  let x = 0;
  let y = 0;
  for (const fx of list ?? []) {
    if (!fx.shake) continue;
    const k = (now - fx.t0) / Math.min(fx.dur, 420);
    if (k < 0 || k > 1) continue;
    const amp = fx.shake * (1 - k) * (1 - k);
    x += Math.sin(now / 16) * amp;
    y += Math.cos(now / 21) * amp * 0.7;
  }
  return { x, y };
}
