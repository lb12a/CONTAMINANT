// 2.5D "diorama" board renderer (PixiJS v8).
// A tilted hex board on a continuous painted ground: props and creatures stand upright on their hexes,
// team hexes glow (blue = you, orange = enemy) with slowly turning rune rings, planned positions show as
// blue holograms, warm god rays and a vignette frame the scene. All motion is code-driven
// (idle breathing, hops, lunges, hit shakes, dissolves, particles) and honours prefers-reduced-motion.

import { Application, BlurFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { GodrayFilter } from 'pixi-filters';
import { FIELDS, fromPixel, key, toPixel, type GameState, type Hex, type PlayerId, type Unit, type Zone } from '@contaminant/engine';
import { assetImage, assetUrl, assetList } from './assets.ts';
import { figureCanvas, lookKey } from './art.ts';
import { statusKind } from '../ui/glyphs.ts';
import { iconUrl } from '../ui/Icon.tsx';
import type { Camera, Floater, HighlightKind, Insets, Overlay, Pulse } from './types.ts';

/** world hex radius */
const S = 64;
/** vertical squash of the board plane (camera tilt) */
const TILT = 0.62;
const SQ3 = Math.sqrt(3);

export const TEAM_MINE = 0x52b8ff;
export const TEAM_ENEMY = 0xff8a2a;

const ZONE_GROUND: Record<Zone, { base: string; dark: string; light: string; speck: string }> = {
  laboratory: { base: '#59625a', dark: '#3c443e', light: '#788273', speck: '#9fdc6a' },
  graveyard: { base: '#4a4250', dark: '#2f2836', light: '#6a6070', speck: '#c9c1a8' },
  bog: { base: '#4a5a34', dark: '#2e3b22', light: '#6b7a44', speck: '#a7d36b' },
  toyroom: { base: '#6e4c34', dark: '#4a3122', light: '#8d6646', speck: '#e3c88a' },
  forest: { base: '#425434', dark: '#2a3822', light: '#5f744a', speck: '#c7a35a' },
  tomb: { base: '#9a7c50', dark: '#6e5534', light: '#b99a68', speck: '#e8d6a6' },
};

const HL: Record<HighlightKind, number> = {
  move: 0x4fe3ff,
  path: 0x4fe3ff,
  attack: 0xff4a4a,
  area: 0xff5a5a,
  target: 0xffa22f,
  deploy: 0x8cff5a,
  ally: 0x8cff5a,
  invalid: 0x777777,
  corrupt: 0xff2bd6,
};

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * View transform shared by the drawing helpers. The board is drawn so that your own side is on the left
 * (mirror when you start on the right); on portrait screens it is turned 90° so your side is at the bottom
 * and the long axis runs up the phone. Board pixels (bx, by) → world (x, y·TILT).
 */
const VT = { portrait: false, mirror: false, BW: 0, BH: 0 };

function toWorld(bx: number, by: number): { x: number; y: number } {
  if (VT.portrait) return { x: by, y: (VT.mirror ? bx : VT.BW - bx) * TILT };
  return { x: VT.mirror ? VT.BW - bx : bx, y: by * TILT };
}

function fromWorld(x: number, y: number): { bx: number; by: number } {
  const Y = y / TILT;
  if (VT.portrait) return { bx: VT.mirror ? Y : VT.BW - Y, by: x };
  return { bx: VT.mirror ? VT.BW - x : x, by: Y };
}

export function worldCenter(h: Hex): { x: number; y: number } {
  const p = toPixel(h, S);
  return toWorld(p.x + (SQ3 / 2) * S, p.y + S);
}

/** World-space size of the board (x extent, y extent after tilt). */
function contentSize(): { cw: number; ch: number } {
  return VT.portrait ? { cw: VT.BH, ch: VT.BW * TILT } : { cw: VT.BW, ch: VT.BH * TILT };
}

function hexPoints(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  // pointy-top on landscape, flat-top once the board is turned for portrait
  const rot = VT.portrait ? 0 : -30;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + rot);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a) * TILT);
  }
  return pts;
}

// ---------------------------------------------------------------- procedural textures

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

function radialTex(inner: string, outer: string, size = 256, stop = 0): Texture {
  return canvasTex(size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.5 * stop, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Painted ground fallback: blotchy soil with pebbles and stains in the zone palette, feathered at the edges. */
const groundCache = new Map<Zone, Texture>();
function groundFallback(zone: Zone): Texture {
  let t = groundCache.get(zone);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    paintGround(c.getContext('2d')!, zone);
    t = featherTex(c);
    groundCache.set(zone, t);
  }
  return t;
}

function paintGround(ctx: CanvasRenderingContext2D, zone: Zone): void {
  const pal = ZONE_GROUND[zone] ?? ZONE_GROUND.laboratory;
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 420; i++) {
    const x = hash(i * 3 + 1) * 1024;
    const y = hash(i * 7 + 2) * 512;
    const r = 6 + hash(i * 11 + 3) * 46;
    ctx.globalAlpha = 0.08 + hash(i * 13) * 0.12;
    ctx.fillStyle = hash(i * 17) > 0.5 ? pal.dark : pal.light;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, hash(i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 160; i++) {
    const x = hash(i * 5 + 9) * 1024;
    const y = hash(i * 19 + 4) * 512;
    const r = 1.5 + hash(i * 23) * 4;
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.ellipse(x, y + 1.5, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hash(i * 29) > 0.85 ? pal.speck : pal.light;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Copies an image into a canvas whose edges fade out in an irregular, painterly oval (diorama ground plate). */
function featherTex(src: CanvasImageSource & { width: number; height: number }): Texture {
  const w = src.width;
  const h = src.height;
  return canvasTex(w, h, (ctx) => {
    ctx.drawImage(src, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const m = mask.getContext('2d')!;
    m.filter = `blur(${Math.round(Math.min(w, h) * 0.045)}px)`;
    m.fillStyle = '#000';
    m.beginPath();
    // superellipse (rounded rectangle with soft, slightly wobbly edges)
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + (hash((i % n) * 7 + 3) - 0.5) * 0.06;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      const x = w / 2 + Math.sign(cx) * Math.pow(Math.abs(cx), 0.5) * w * 0.44 * wob;
      const y = h / 2 + Math.sign(cy) * Math.pow(Math.abs(cy), 0.5) * h * 0.42 * wob;
      if (i === 0) m.moveTo(x, y);
      else m.lineTo(x, y);
    }
    m.closePath();
    m.fill();
    ctx.drawImage(mask, 0, 0);
  });
}

class TexCache {
  private map = new Map<string, Texture>();
  private loading = new Set<string>();
  version = 0;

  /** Generated image if loaded, else `fallback()` (and the image starts loading). */
  get(path: string, fallback: () => Texture | null, transform?: (im: HTMLImageElement) => Texture): Texture | null {
    const hit = this.map.get(path);
    if (hit) return hit;
    const url = assetUrl(path);
    if (url && !this.loading.has(path)) {
      this.loading.add(path);
      const img = assetImage(path);
      const finish = (im: HTMLImageElement) => {
        this.map.set(path, transform ? transform(im) : Texture.from(im));
        this.version++;
      };
      if (img) finish(img);
      else {
        const im = new Image();
        im.src = url;
        im.onload = () => finish(im);
      }
    }
    const loaded = this.map.get(path);
    if (loaded) return loaded;
    const fb = fallback();
    return fb;
  }

  private images = new Map<string, HTMLImageElement>();

  /** drawn interface icons (status marks, objective and trap fallbacks), rasterised once */
  iconVersion = 0;
  private icons = new Map<string, Texture | 'loading'>();
  icon(name: string): Texture | null {
    const hit = this.icons.get(name);
    if (hit && hit !== 'loading') return hit;
    if (!hit) {
      const url = iconUrl(name);
      if (!url) return null;
      this.icons.set(name, 'loading');
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        c.getContext('2d')!.drawImage(im, 0, 0, 96, 96);
        this.icons.set(name, Texture.from(c));
        this.iconVersion++;
      };
      im.src = url;
    }
    return null;
  }

  /** The decoded generated image itself (for textures that are composed per board size). */
  image(path: string): HTMLImageElement | null {
    const hit = this.images.get(path);
    if (hit) return hit;
    const url = assetUrl(path);
    if (url && !this.loading.has(`img:${path}`)) {
      this.loading.add(`img:${path}`);
      const im = new Image();
      im.onload = () => {
        this.images.set(path, im);
        this.version++;
      };
      im.src = url;
    }
    return null;
  }
}

/** How many hexes one generated ground texture spans (its width); beyond that it repeats mirrored. */
const GROUND_HEXES: Record<Zone, number> = {
  laboratory: 13.5, // ~9 painted tiles → 1.5 hexes per tile
  tomb: 12,
  toyroom: 11,
  graveyard: 16, // framed compositions roughly match a standard board
  bog: 16,
  forest: 16,
};

const plateCache = new Map<string, Texture>();
/**
 * The ground plate for a board: the generated texture at a fixed size per hex, centred on the board
 * and repeated mirror-tiled (no seams) where the board is larger, squashed by the tilt, edges faded.
 */
function groundPlate(img: HTMLImageElement, zone: Zone, gw: number, gh: number): Texture {
  const ck = `${zone}|${Math.round(gw)}x${Math.round(gh)}`;
  const hit = plateCache.get(ck);
  if (hit) return hit;
  const W = 2048;
  const H = Math.round((W * gh) / gw);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // a 2 × 2 mirrored tile has no seams
  const m = document.createElement('canvas');
  m.width = img.width * 2;
  m.height = img.height * 2;
  const mc = m.getContext('2d')!;
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    mc.setTransform(fx, 0, 0, fy, fx < 0 ? m.width : 0, fy < 0 ? m.height : 0);
    mc.drawImage(img, 0, 0);
  }
  const worldPerTexPx = (S * SQ3 * (GROUND_HEXES[zone] ?? 14)) / img.width;
  const sx = worldPerTexPx * (W / gw);
  const sy = sx * TILT;
  const pat = ctx.createPattern(m, 'repeat')!;
  // centre the (unmirrored) texture on the plate
  pat.setTransform(new DOMMatrix().translate(W / 2 - (img.width * sx) / 2, H / 2 - (img.height * sy) / 2).scale(sx, sy));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  const t = featherTex(c);
  plateCache.set(ck, t);
  return t;
}

const figTexCache = new Map<string, Texture>();
function figureTex(k: string): Texture {
  let t = figTexCache.get(k);
  if (!t) {
    t = Texture.from(figureCanvas(k, 256));
    figTexCache.set(k, t);
  }
  return t;
}

const STATUS_TINT: [string, number][] = [
  ['frozen', 0xb8e6ff],
  ['gilded', 0xffe6a0],
  ['corruption', 0xffa0f0],
  ['burn', 0xffd0b0],
  ['poison', 0xd8ffc8],
];

function statusTint(ids: string[]): number {
  for (const [id, c] of STATUS_TINT) if (ids.includes(id)) return c;
  return 0xffffff;
}

// ---------------------------------------------------------------- unit views

interface UnitView {
  uid: string;
  root: Container;
  shadow: Graphics;
  spr: Sprite;
  label: Container | null;
  labelText: string;
  look: string;
  x: number;
  y: number;
  target: string;
  move: { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number } | null;
  phase: number;
  dying: number | null;
  /** set for units that appear after the first sync: they drop in */
  bornAt: number | null;
  height: number;
  /** HP shown on the bar (drains toward the real value; the gap shows as a pale trail) */
  hpShown: number | null;
  hpTrail: number | null;
}

interface WallView {
  spr: Sprite | Graphics | Container;
  look: string;
}

export class DioramaRenderer {
  readonly app = new Application();
  readonly cam: Camera = { zoom: 1, panX: 0, panY: 0 };
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private ready = false;
  private destroyed = false;
  private state: GameState | null = null;
  private me: PlayerId = 0;
  private ov: Overlay = { highlights: new Map(), paths: [], targets: [], ghosts: [] };
  private tex = new TexCache();
  private texVersion = -1;
  private iconSeen = 0;
  private reduce = reducedMotion();

  private world = new Container();
  private groundLayer = new Container();
  private ground = new Sprite();
  private groundShade = new Sprite();
  private decor = new Container();
  private gridG = new Graphics();
  private fieldsG = new Graphics();
  private glowG = new Graphics();
  private crispG = new Graphics();
  private entities = new Container();
  private barsG = new Graphics();
  private textLayer = new Container();
  private fxG = new Graphics();
  private light = new Container();
  private rays = new Graphics();
  private godray: GodrayFilter | null = null;
  private spot = new Sprite();
  private vignette = new Sprite();

  private units = new Map<string, UnitView>();
  private walls = new Map<string, WallView>();
  private ghostSprites: Sprite[] = [];
  private badgeTexts: Text[] = [];
  private objSprites = new Map<string, Sprite | Text>();
  private trapSprites = new Map<string, Sprite | Text>();
  private tombSprites: (Sprite | Text)[] = [];
  private floaterTexts = new Map<Floater, Text>();
  private particles: { x: number; y: number; vx: number; vy: number; life: number; t0: number; color: number; r: number; grav?: number }[] = [];
  /** dust and spores drifting through the light (world space) */
  private motes: { x: number; y: number; r: number; phase: number; speed: number; color: number }[] = [];
  private seenPulses = new WeakSet<Pulse>();
  private moteBox = { w: 1, h: 1 };
  private firstSyncDone = false;
  private zone: Zone | null = null;
  private bounds = { cols: 0, rows: 0 };
  private scale = 1;
  private lastW = 0;
  private lastH = 0;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: 'webgl',
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    const canvas = this.app.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.setAttribute('aria-label', 'Hex battlefield');
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);

    this.ground.anchor.set(0.5);
    this.groundShade.anchor.set(0.5);
    this.groundShade.texture = radialTex('rgba(10,7,12,0)', 'rgba(10,7,12,0.6)', 512, 0.74);
    this.groundLayer.addChild(this.ground, this.decor, this.groundShade);
    const glowBlur = new BlurFilter({ strength: 10, quality: 3 });
    this.glowG.filters = [glowBlur];
    this.glowG.blendMode = 'add';
    this.entities.sortableChildren = true;
    this.world.addChild(this.groundLayer, this.gridG, this.fieldsG, this.glowG, this.crispG, this.entities, this.barsG, this.textLayer, this.fxG);
    this.fxG.blendMode = 'add';

    // light: warm spotlight + god rays, then the vignette frame
    this.spot.texture = radialTex('rgba(255,214,150,0.4)', 'rgba(255,190,120,0)', 512);
    this.spot.anchor.set(0.5);
    this.spot.blendMode = 'add';
    if (!this.reduce) {
      this.godray = new GodrayFilter({ angle: 28, parallel: true, gain: 0.42, lacunarity: 2.6, alpha: 0.55, time: 0 });
      this.rays.filters = [this.godray];
      this.rays.alpha = 0.32;
      this.rays.blendMode = 'add';
    }
    this.light.addChild(this.spot, this.rays);
    this.vignette.texture = radialTex('rgba(6,4,8,0)', 'rgba(6,4,8,0.86)', 512, 0.5);
    this.vignette.anchor.set(0.5);
    this.app.stage.addChild(this.world, this.light, this.vignette);

    this.ready = true;
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(() => this.frame(performance.now()));
    if (this.state) this.sync();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.ready) this.app.destroy(true, { children: true });
  }

  resize(): void {
    if (this.ready) this.app.resize();
  }

  get canvas(): HTMLCanvasElement | null {
    return this.ready ? this.app.canvas : null;
  }

  set(state: GameState, me: PlayerId, ov: Overlay): void {
    this.state = state;
    this.me = me;
    this.ov = ov;
    if (this.ready) this.sync();
  }

  // ---------------------------------------------------------------- camera

  /** Sets the view transform; returns true when the orientation or mirroring changed. */
  private orient(aw: number, ah: number): boolean {
    const s = this.state!;
    const b = s.settings.bounds;
    const portrait = aw < ah * 0.92;
    const mirror = s.players[this.me]?.side === 'right';
    const BW = SQ3 * S * (b.cols + 0.5);
    const BH = S * (1.5 * b.rows + 0.5);
    const changed = portrait !== VT.portrait || mirror !== VT.mirror || BW !== VT.BW || BH !== VT.BH;
    Object.assign(VT, { portrait, mirror, BW, BH });
    return changed;
  }

  private layout(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const { top, right, bottom, left } = this.insets;
    const aw = Math.max(80, W - left - right);
    const ah = Math.max(80, H - top - bottom);
    if (this.orient(aw, ah)) this.reorient();
    const { cw: bw, ch: bh } = contentSize();
    const padTop = S * 1.55;
    const padBottom = S * 0.35;
    // small boards (testing chambers) are not blown up beyond a comfortable tile size
    const fit = Math.min(aw / (bw + S * 0.6), ah / (bh + padTop + padBottom), 1.05);
    this.scale = fit * this.cam.zoom;
    this.world.scale.set(this.scale);
    this.world.x = left + (aw - bw * this.scale) / 2 + this.cam.panX;
    this.world.y = top + (ah - (bh + padTop + padBottom) * this.scale) / 2 + padTop * this.scale + this.cam.panY;
    // screen-space light and vignette
    const cx = this.world.x + (bw / 2) * this.scale;
    const cy = this.world.y + (bh / 2) * this.scale;
    this.spot.position.set(cx - bw * 0.12 * this.scale, cy - bh * 0.35 * this.scale);
    this.spot.width = bw * 1.25 * this.scale;
    this.spot.height = bh * 2.0 * this.scale;
    this.vignette.position.set(W / 2, H / 2);
    this.vignette.width = W * 1.35;
    this.vignette.height = H * 1.45;
    if (W !== this.lastW || H !== this.lastH) {
      this.lastW = W;
      this.lastH = H;
      this.rays.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.001 });
    }
  }

  /** Screen point → hex (or null outside the board). */
  hexAt(x: number, y: number): Hex | null {
    if (!this.state || !this.ready) return null;
    const wx = (x - this.world.x) / this.scale;
    const wy = (y - this.world.y) / this.scale;
    const { bx, by } = fromWorld(wx, wy);
    const h = fromPixel(bx - (SQ3 / 2) * S, by - S, S);
    const b = this.state.settings.bounds;
    if (h.c < 0 || h.r < 0 || h.c >= b.cols || h.r >= b.rows) return null;
    return h;
  }

  /** Hex → screen point (centre of the tile). */
  screenOf(h: Hex): { x: number; y: number } {
    const w = worldCenter(h);
    return { x: this.world.x + w.x * this.scale, y: this.world.y + w.y * this.scale };
  }

  // ---------------------------------------------------------------- static scene sync

  /** Orientation changed: rebuild the static scene and snap units to their new places. */
  private reorient(): void {
    this.zone = null;
    this.sync();
    for (const v of this.units.values()) {
      const [c, r] = v.target.split(',').map(Number);
      const w = worldCenter({ c: c!, r: r! });
      v.x = w.x;
      v.y = w.y;
      v.move = null;
    }
  }

  private sync(): void {
    const s = this.state!;
    const b = s.settings.bounds;
    if (!VT.BW) this.orient(this.app.screen.width - this.insets.left - this.insets.right, this.app.screen.height - this.insets.top - this.insets.bottom);
    if (this.zone !== s.settings.zone || this.bounds.cols !== b.cols || this.bounds.rows !== b.rows || this.texVersion !== this.tex.version) {
      this.zone = s.settings.zone;
      this.bounds = { cols: b.cols, rows: b.rows };
      this.texVersion = this.tex.version;
      this.buildGround();
      this.walls.forEach((w) => w.spr.destroy());
      this.walls.clear();
      for (const m of [this.objSprites, this.trapSprites]) {
        m.forEach((d) => d.destroy());
        m.clear();
      }
      this.tombSprites.splice(0).forEach((d) => d.destroy());
    }
    this.drawGrid();
    this.syncWalls();
    this.syncUnits();
    this.syncObjectives();
    this.syncTraps();
    this.syncTombs();
  }

  private buildGround(): void {
    const s = this.state!;
    const zone = s.settings.zone;
    const b = s.settings.bounds;
    const { cw: bw, ch: bh } = contentSize();
    const gw = bw * 1.36;
    const gh = bh * 1.8;
    const img = this.tex.image(`ground/${zone}`);
    const tex = img ? groundPlate(img, zone, gw, gh) : groundFallback(zone);
    this.ground.texture = tex;
    this.ground.position.set(bw / 2, bh / 2);
    if (img) {
      this.ground.width = gw;
      this.ground.height = gh;
    } else {
      const sc = Math.max(gw / tex.width, gh / tex.height);
      this.ground.scale.set(sc, sc);
    }
    this.groundShade.position.set(bw / 2, bh / 2);
    this.motes = this.reduce
      ? []
      : Array.from({ length: 54 }, (_, i) => ({
          x: hash(i * 11 + 5) * bw,
          y: hash(i * 23 + 7) * bh - S,
          r: 1.2 + hash(i * 31) * 2.6,
          phase: hash(i * 41) * 6.28,
          speed: 4 + hash(i * 53) * 10,
          color: hash(i * 61) > 0.8 ? 0xb6ff8c : 0xffe2b0,
        }));
    this.moteBox = { w: bw, h: bh };
    this.groundShade.width = gw * 1.02;
    this.groundShade.height = gh * 1.08;
    // decorative props around the board edge (dimmed, outside the playable hexes)
    this.decor.removeChildren().forEach((c) => c.destroy());
    const props = assetList(`props/${zone}_`);
    if (props.length) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = (i + hash(i * 31 + b.cols) * 0.6) / n;
        const ang = t * Math.PI * 2;
        const rx = bw / 2 + S * (1.1 + hash(i * 7) * 0.9);
        const ry = bh / 2 + S * (0.75 + hash(i * 5) * 0.6);
        const x = bw / 2 + Math.cos(ang) * rx;
        const y = bh / 2 + Math.sin(ang) * ry;
        const path = props[Math.floor(hash(i * 13 + 1) * props.length)]!.replace(/\.(webp|png)$/, '');
        const tx = this.tex.get(path, () => null);
        if (!tx) continue;
        const holder = new Container();
        const sp = new Sprite(tx);
        sp.anchor.set(0.5, 0.97);
        const hgt = S * (1.2 + hash(i * 17) * 0.8);
        const sc = Math.min(hgt / tx.height, (S * 1.8) / tx.width);
        sp.scale.set(hash(i * 3) > 0.5 ? -sc : sc, sc);
        sp.tint = y < bh / 2 ? 0x6a6470 : 0x857d88;
        const shadow = new Graphics().ellipse(0, -2, Math.min(S, (tx.width * sc) / 2 + S * 0.1), S * 0.32).fill({ color: 0x050307, alpha: 0.4 });
        shadow.scale.y = TILT;
        holder.addChild(shadow, sp);
        holder.position.set(x, y);
        holder.alpha = 0.92;
        this.decor.addChild(holder);
      }
      this.decor.children.sort((a, c) => a.y - c.y);
    }
  }

  private drawGrid(): void {
    const s = this.state!;
    const g = this.gridG.clear();
    const third = Math.floor(s.settings.bounds.cols / 3);
    const mySide = s.players[this.me].side;
    for (const t of s.tiles) {
      const { x, y } = worldCenter(t);
      const inLeft = t.c < third;
      const inRight = t.c >= s.settings.bounds.cols - third;
      if (inLeft || inRight) {
        const mine = (inLeft && mySide === 'left') || (inRight && mySide === 'right');
        g.poly(hexPoints(x, y, S * 0.97), true).fill({ color: mine ? TEAM_MINE : TEAM_ENEMY, alpha: 0.045 });
      }
      // engraved hex: dark groove plus a light lip below it
      g.poly(hexPoints(x, y + 1.5, S * 0.96), true).stroke({ width: 2, color: 0xfff1d6, alpha: 0.16 });
      g.poly(hexPoints(x, y, S * 0.96), true).stroke({ width: 2.8, color: 0x0a0609, alpha: 0.5 });
    }
  }

  private syncWalls(): void {
    const s = this.state!;
    const zone = s.settings.zone;
    const seen = new Set<string>();
    for (const t of s.tiles) {
      if (!t.wall) continue;
      const k = key(t);
      seen.add(k);
      const variant = Math.floor(hash(t.c * 37 + t.r * 101) * 3);
      const path = `props/${zone}_${variant}`;
      const tx = this.tex.get(path, () => null);
      const look = tx ? path : 'fallback';
      let w = this.walls.get(k);
      if (!w || w.look !== look) {
        w?.spr.destroy();
        const { x, y } = worldCenter(t);
        let spr: Sprite | Graphics | Container;
        if (tx) {
          // the prop stands on the tile: its base sits just in front of the hex centre, it fits the hex
          // footprint, and a soft contact shadow grounds it
          const holder = new Container();
          const sc = Math.min((S * 1.8) / tx.height, (S * 1.62) / tx.width);
          const shadow = new Graphics().ellipse(0, 0, Math.min(S * 0.85, (tx.width * sc) / 2 + S * 0.12), S * 0.36).fill({ color: 0x050307, alpha: 0.45 });
          shadow.scale.y = TILT;
          const sp = new Sprite(tx);
          sp.anchor.set(0.5, 0.97);
          sp.scale.set(hash(t.c + t.r * 7) > 0.5 ? -sc : sc, sc);
          sp.y = S * 0.32 * TILT;
          holder.addChild(shadow, sp);
          spr = holder;
        } else {
          spr = this.fallbackWall(zone);
        }
        spr.position.set(x, y);
        spr.zIndex = y + S * 0.32 * TILT;
        this.entities.addChild(spr);
        w = { spr, look };
        this.walls.set(k, w);
      }
      const pct = t.wall.hp / t.wall.maxHp;
      const body = w.spr instanceof Container && !(w.spr instanceof Graphics) ? (w.spr.children[1] as Sprite | undefined) : undefined;
      if (body) {
        body.tint = pct > 0.66 ? 0xffffff : pct > 0.33 ? 0xc8bcb4 : 0x958780;
        body.rotation = pct > 0.33 ? 0 : 0.06;
      }
    }
    for (const [k, w] of this.walls) {
      if (!seen.has(k)) {
        w.spr.destroy();
        this.walls.delete(k);
        const [c, r] = k.split(',').map(Number);
        this.burst(worldCenter({ c: c!, r: r! }), 0xb8a890, 18);
      }
    }
  }

  private fallbackWall(zone: Zone): Graphics {
    const g = new Graphics();
    const pal = ZONE_GROUND[zone] ?? ZONE_GROUND.laboratory;
    g.ellipse(4, 2, S * 0.62, S * 0.26).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(-S * 0.55, -S * 1.05, S * 1.1, S * 1.1, S * 0.18).fill(pal.light).stroke({ width: 5, color: 0x0e0a12 });
    g.roundRect(-S * 0.55, -S * 0.25, S * 1.1, S * 0.3, S * 0.1).fill(pal.dark).stroke({ width: 5, color: 0x0e0a12 });
    g.moveTo(-S * 0.2, -S * 0.9).lineTo(0, -S * 0.6).lineTo(-S * 0.1, -S * 0.4).stroke({ width: 3, color: 0x0e0a12, alpha: 0.6 });
    return g;
  }

  private unitTexture(u: Unit): { tex: Texture; look: string } {
    const lk = lookKey(u.defId, u.form);
    const tex = this.tex.get(`tokens/${lk}`, () => figureTex(lk))!;
    return { tex, look: tex === figTexCache.get(lk) ? `fig:${lk}` : `gen:${lk}` };
  }

  private unitHeight(u: Unit): number {
    if (u.tier === 'boss') return S * 2.5;
    if (u.form === 'brute' || u.defId === 'werewolf' || u.form === 'wolf') return S * 2.05;
    if (u.isObject) return S * 1.15;
    if (u.tier === 'swarm' || ['shrink_head', 'mini_arachnia', 'candle', 'zombie_limb'].includes(u.defId)) return S * 1.3;
    return S * 1.8;
  }

  private syncUnits(): void {
    const s = this.state!;
    const ov = this.ov;
    const now = performance.now();
    const alive = new Set<string>();
    for (const u of s.units) {
      if (ov.gone?.has(u.uid)) continue;
      alive.add(u.uid);
      const pos = ov.pos?.get(u.uid) ?? u.pos;
      const w = worldCenter(pos);
      const k = key(pos);
      let v = this.units.get(u.uid);
      const { tex, look } = this.unitTexture(u);
      if (!v) {
        const root = new Container();
        const shadow = new Graphics();
        const spr = new Sprite(tex);
        spr.anchor.set(0.5, 0.94);
        root.addChild(shadow, spr);
        v = { uid: u.uid, root, shadow, spr, label: null, labelText: '', look: '', x: w.x, y: w.y, target: k, move: null, phase: hash(u.uid.length * 97 + u.pos.c * 13 + u.pos.r) * 6.28, dying: null, bornAt: this.firstSyncDone && !this.reduce ? now : null, height: 0, hpShown: null, hpTrail: null };
        this.units.set(u.uid, v);
        this.entities.addChild(root);
      }
      if (v.dying !== null) {
        v.dying = null;
        v.root.alpha = 1;
      }
      if (v.look !== look) {
        v.spr.texture = tex;
        v.look = look;
      }
      v.height = this.unitHeight(u);
      if (v.target !== k) {
        const dist = Math.hypot(w.x - v.x, (w.y - v.y) / TILT) / (S * SQ3);
        v.move = { fx: v.x, fy: v.y, tx: w.x, ty: w.y, t0: now, dur: this.reduce ? 1 : Math.min(700, 220 + dist * 150) };
        v.target = k;
      }
      // status icons and counters above the HP bar
      const icons = u.statuses.filter((st) => st.id !== 'hidden').slice(0, 5).map((st) => `status/${st.id}`);
      const counters = Object.entries(u.counters).filter(([, n]) => n > 0).map(([c, n]) => `${c[0]!.toUpperCase()}${n}`).join(' ');
      const textures = icons.map((n) => this.tex.icon(n));
      const labelText = `${icons.join(',')}|${counters}|${textures.filter(Boolean).length}`;
      if (labelText !== v.labelText) {
        v.labelText = labelText;
        v.label?.destroy({ children: true });
        v.label = null;
        if (icons.length || counters) {
          const box = new Container();
          const sz = 30;
          let x = 0;
          for (const tx of textures) {
            if (!tx) continue;
            const sp = new Sprite(tx);
            sp.width = sz;
            sp.height = sz;
            sp.position.set(x, -sz);
            box.addChild(sp);
            x += sz + 1;
          }
          if (counters) {
            const tt = new Text({ text: counters, style: { fontFamily: '"Barlow Semi Condensed", sans-serif', fontSize: 22, fill: 0xf2e6c8, fontWeight: '700', stroke: { color: 0x0e0a12, width: 5 } }, resolution: 2 });
            tt.anchor.set(0, 1);
            tt.position.set(x + 2, -3);
            box.addChild(tt);
            x += tt.width + 4;
          }
          box.pivot.set(x / 2, 0);
          v.label = box;
          this.textLayer.addChild(box);
        }
      }
    }
    this.firstSyncDone = true;
    for (const [uid, v] of this.units) {
      if (!alive.has(uid) && v.dying === null) {
        v.dying = now;
        this.burst({ x: v.x, y: v.y - v.height * 0.4 }, 0x9cff6a, 26);
      }
    }
  }

  private syncObjectives(): void {
    const s = this.state!;
    const seen = new Set<string>();
    for (const t of s.tiles) {
      if (!t.objective) continue;
      const k = `${key(t)}:${t.objective}`;
      seen.add(k);
      if (this.objSprites.has(k)) continue;
      const { x, y } = worldCenter(t);
      const tx = this.tex.get(`objectives/${t.objective}`, () => null);
      let d: Sprite;
      if (tx) {
        d = new Sprite(tx);
        d.anchor.set(0.5, 0.9);
        d.scale.set((S * 1.15) / tx.height);
      } else {
        const ic = this.tex.icon(t.objective === 'control' ? 'ui/flag' : t.objective === 'terminal' ? 'ui/terminal' : 'ui/flask');
        if (!ic) {
          seen.delete(k);
          continue;
        }
        d = new Sprite(ic);
        d.anchor.set(0.5, 0.85);
        d.scale.set((S * 0.9) / ic.height);
      }
      d.position.set(x, y);
      d.zIndex = y - 1;
      this.entities.addChild(d);
      this.objSprites.set(k, d);
    }
    for (const [k, d] of this.objSprites) if (!seen.has(k)) (d.destroy(), this.objSprites.delete(k));
  }

  private syncTraps(): void {
    const s = this.state!;
    const seen = new Set<string>();
    for (const tr of s.traps) {
      seen.add(tr.uid);
      let d = this.trapSprites.get(tr.uid);
      if (!d) {
        const tx = this.tex.get(`items/${tr.itemId}`, () => null);
        if (tx) {
          d = new Sprite(tx);
          d.anchor.set(0.5, 0.6);
          d.scale.set((S * 0.62) / Math.max(tx.width, tx.height), (S * 0.62 * 0.8) / Math.max(tx.width, tx.height));
        } else {
          const ic = this.tex.icon('ui/trap');
          if (!ic) {
            seen.delete(tr.uid);
            continue;
          }
          d = new Sprite(ic);
          d.anchor.set(0.5);
          d.scale.set((S * 0.6) / ic.height);
        }
        this.entities.addChild(d);
        this.trapSprites.set(tr.uid, d);
      }
      const { x, y } = worldCenter(tr.pos);
      d.position.set(x, y);
      d.zIndex = y - 2;
      d.alpha = tr.owner === this.me ? 0.85 : 0.7;
    }
    for (const [k, d] of this.trapSprites) if (!seen.has(k)) (d.destroy(), this.trapSprites.delete(k));
  }

  private syncTombs(): void {
    const tombs = this.ov.tombs ?? [];
    while (this.tombSprites.length > tombs.length) this.tombSprites.pop()!.destroy();
    tombs.forEach((h, i) => {
      let d = this.tombSprites[i];
      if (!d) {
        const tx = this.tex.get('props/graveyard_0', () => null);
        if (tx) {
          d = new Sprite(tx);
          d.anchor.set(0.5, 0.9);
          d.scale.set((S * 0.8) / tx.height);
        } else {
          const ic = this.tex.icon('ui/tombstone');
          if (!ic) return;
          d = new Sprite(ic);
          d.anchor.set(0.5, 0.8);
          d.scale.set((S * 0.7) / ic.height);
        }
        this.entities.addChild(d);
        this.tombSprites[i] = d;
      }
      const { x, y } = worldCenter(h);
      d.position.set(x, y);
      d.zIndex = y;
      d.alpha = 0.85;
    });
  }

  // ---------------------------------------------------------------- per-frame drawing

  private frame(now: number): void {
    if (!this.state || this.destroyed) return;
    if (this.tex.version !== this.texVersion) this.sync();
    else if (this.tex.iconVersion !== this.iconSeen) {
      this.iconSeen = this.tex.iconVersion;
      this.syncUnits();
      this.syncObjectives();
      this.syncTraps();
      this.syncTombs();
    }
    this.layout();
    const t = now / 1000;
    if (this.godray) this.godray.time = t * 0.12;
    this.drawFields(now);
    this.drawHighlights(now);
    this.drawUnits(now);
    this.drawGhosts(now);
    this.drawFx(now);
  }

  private drawFields(now: number): void {
    const s = this.state!;
    const g = this.fieldsG.clear();
    const t = this.reduce ? 0 : now / 1000;
    for (const tile of s.tiles) {
      if (!tile.fields.length) continue;
      const { x, y } = worldCenter(tile);
      for (const f of tile.fields) {
        const def = FIELDS[f.id];
        if (!def) continue;
        const col = def.color;
        if (f.id === 'crystal_bomb') {
          g.circle(x, y - S * 0.25, S * 0.24).fill({ color: 0xb48cff, alpha: 0.8 }).stroke({ width: 3, color: 0x0e0a12 });
          g.circle(x - S * 0.07, y - S * 0.32, S * 0.06).fill({ color: 0xffffff, alpha: 0.7 });
          continue;
        }
        const strong = f.id === 'darkness' ? 0.7 : ['fog', 'steam', 'toxic_smoke'].includes(f.id) ? 0.42 : 0.34;
        g.poly(hexPoints(x, y, S * 0.9), true).fill({ color: col, alpha: strong });
        g.poly(hexPoints(x, y, S * 0.9), true).stroke({ width: 2, color: col, alpha: 0.65 });
        switch (f.id) {
          case 'water':
          case 'electrified_water':
          case 'contaminated_water':
          case 'diluted_acid':
          case 'frozen_water':
            for (let i = 0; i < 2; i++) {
              const r = S * (0.18 + 0.06 * Math.sin(t * 2 + i * 2));
              g.ellipse(x + (i ? S * 0.25 : -S * 0.2), y + (i ? -S * 0.08 : S * 0.1), r, r * TILT).stroke({ width: 2, color: f.id === 'electrified_water' ? 0xffffff : 0xbfe4ff, alpha: 0.7 });
            }
            break;
          case 'fire':
          case 'wildfire':
          case 'scalded':
            for (let i = 0; i < 3; i++) {
              const fx = x + (i - 1) * S * 0.28;
              const fh = S * (0.4 + 0.14 * Math.sin(t * 7 + i * 2));
              g.moveTo(fx - S * 0.12, y + S * 0.1).quadraticCurveTo(fx, y + S * 0.1 - fh * 2, fx + S * 0.12, y + S * 0.1).fill({ color: 0xffb43a, alpha: 0.9 });
              g.moveTo(fx - S * 0.06, y + S * 0.1).quadraticCurveTo(fx, y + S * 0.1 - fh * 1.1, fx + S * 0.06, y + S * 0.1).fill({ color: 0xfff0a0, alpha: 0.9 });
            }
            break;
          case 'toxic':
          case 'swamp':
          case 'acid':
            for (let i = 0; i < 4; i++) {
              const k = (t * 0.5 + i / 4) % 1;
              g.circle(x + (i - 1.5) * S * 0.22, y + S * 0.1 - k * S * 0.55, S * 0.07 * (1 - k * 0.5)).fill({ color: f.id === 'swamp' ? 0x8a7a4a : 0xc8ff9a, alpha: 1 - k });
            }
            break;
          case 'electric':
          case 'portal':
          case 'shock_storm': {
            const ph = Math.floor(t * 10) % 3;
            g.moveTo(x - S * 0.5, y - S * 0.1 + ph * 3).lineTo(x - S * 0.15, y + S * 0.12).lineTo(x + S * 0.05, y - S * 0.18).lineTo(x + S * 0.5, y + S * 0.08 - ph * 3).stroke({ width: 3, color: 0xe8ffff, alpha: 0.9 });
            break;
          }
          case 'fog':
          case 'steam':
          case 'toxic_smoke':
            for (let i = 0; i < 3; i++) g.circle(x + Math.sin(t + i) * S * 0.3, y - S * 0.15 + (i - 1) * S * 0.18, S * 0.36).fill({ color: f.id === 'toxic_smoke' ? 0x9ab07a : 0xe8e8e8, alpha: 0.22 });
            break;
          case 'darkness':
            for (const dx of [-0.08, 0.08]) g.circle(x + dx * S, y - S * 0.1, S * 0.035).fill({ color: 0xffcf3a, alpha: 0.6 + 0.3 * Math.sin(t * 2) });
            break;
          case 'overgrowth':
          case 'mutation':
            for (let i = 0; i < 3; i++)
              g.moveTo(x - S * 0.45 + i * S * 0.32, y + S * 0.2)
                .quadraticCurveTo(x - S * 0.3 + i * S * 0.3, y - S * 0.25, x - S * 0.1 + i * S * 0.3, y - S * 0.45)
                .stroke({ width: 4, color: f.id === 'mutation' ? 0xd6ff3a : 0x3f7a2a });
            break;
          case 'chrono':
          case 'resonance':
            for (let i = 1; i <= 2; i++) {
              const r = S * 0.2 * i + 3 * Math.sin(t * 3 + i);
              g.ellipse(x, y, r, r * TILT).stroke({ width: 2.5, color: f.id === 'chrono' ? 0xe3c66a : 0xb48cff, alpha: 0.85 });
            }
            break;
          case 'marigold':
            for (let i = 0; i < 6; i++) g.circle(x + Math.cos(i * 1.2) * S * 0.36, y + Math.sin(i * 1.2) * S * 0.22, S * 0.08).fill(0xffb347);
            break;
          case 'ant_trail':
            for (let i = 0; i < 7; i++) {
              const k = (t * 0.3 + i / 7) % 1;
              g.circle(x - S * 0.5 + k * S, y + Math.sin(k * 8) * S * 0.08, S * 0.035).fill(0x1a0f05);
            }
            break;
          case 'snare':
            for (let i = -2; i <= 2; i++) g.moveTo(x - S * 0.5, y + i * S * 0.1).lineTo(x + S * 0.5, y + i * S * 0.1 + S * 0.05).stroke({ width: 2, color: 0xd07a4a });
            break;
          case 'corrupted':
            g.poly(hexPoints(x, y, S * 0.7), true).fill({ color: 0xff2bd6, alpha: 0.25 + 0.15 * Math.sin(t * 8) });
            break;
          default:
            break;
        }
      }
    }
  }

  private drawHighlights(now: number): void {
    const s = this.state!;
    const ov = this.ov;
    const glow = this.glowG.clear();
    const crisp = this.crispG.clear();
    const t = this.reduce ? 0 : now / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    // objectives: glowing rune rings
    for (const tile of s.tiles) {
      if (!tile.objective) continue;
      const { x, y } = worldCenter(tile);
      const col = tile.objective === 'control' ? 0xd9a93a : tile.objective === 'terminal' ? 0x8cff5a : 0x4fe3ff;
      glow.poly(hexPoints(x, y, S * 0.86), true).stroke({ width: 8, color: col, alpha: 0.55 });
      crisp.poly(hexPoints(x, y, S * 0.86), true).stroke({ width: 3, color: col, alpha: 0.9 });
      this.runeRing(crisp, x, y, S * 0.66, col, t * 0.4, 0.7);
    }

    // planning highlights
    for (const [k, kind] of ov.highlights) {
      const [c, r] = k.split(',').map(Number);
      const { x, y } = worldCenter({ c: c!, r: r! });
      const col = HL[kind];
      crisp.poly(hexPoints(x, y, S * 0.9), true).fill({ color: col, alpha: kind === 'invalid' ? 0.18 : 0.16 + 0.08 * pulse });
      crisp.poly(hexPoints(x, y, S * 0.9), true).stroke({ width: 2.5, color: col, alpha: 0.85 });
      if (kind !== 'invalid') glow.poly(hexPoints(x, y, S * 0.9), true).stroke({ width: 7, color: col, alpha: 0.35 + 0.2 * pulse });
    }

    // team hexes under every unit (blue = you, orange = enemy) with turning runes
    for (const v of this.units.values()) {
      if (v.dying !== null) continue;
      const u = s.units.find((x) => x.uid === v.uid);
      if (!u) continue;
      const mine = u.owner === this.me;
      const col = mine ? TEAM_MINE : TEAM_ENEMY;
      const hidden = u.statuses.some((st) => st.id === 'hidden');
      crisp.poly(hexPoints(v.x, v.y, S * 0.92), true).fill({ color: col, alpha: hidden ? 0.08 : 0.2 });
      crisp.poly(hexPoints(v.x, v.y, S * 0.92), true).stroke({ width: 3, color: col, alpha: hidden ? 0.4 : 0.95 });
      glow.poly(hexPoints(v.x, v.y, S * 0.92), true).stroke({ width: 10, color: col, alpha: 0.6 });
      this.runeRing(crisp, v.x, v.y, S * 0.7, col, (mine ? 1 : -1) * t * 0.25 + v.phase, 0.55);
      if (ov.selected === u.uid) {
        crisp.poly(hexPoints(v.x, v.y, S * 1.02), true).stroke({ width: 4, color: 0xfff3d6, alpha: 0.95 });
        glow.poly(hexPoints(v.x, v.y, S * 1.02), true).stroke({ width: 12, color: 0xfff3d6, alpha: 0.5 + 0.3 * pulse });
      }
    }

    // planned paths: glowing footprints
    for (const path of ov.paths) {
      const unit = s.units.find((u) => u.uid === path.unit);
      if (!unit) continue;
      let prev = worldCenter(ov.pos?.get(unit.uid) ?? unit.pos);
      path.tiles.forEach((h, i) => {
        const c = worldCenter(h);
        this.dashed(crisp, prev.x, prev.y, c.x, c.y, path.color, 4, 14, 10, t * 30);
        const ang = Math.atan2((c.y - prev.y) / TILT, c.x - prev.x);
        for (const side of [-1, 1]) {
          const ox = Math.cos(ang + Math.PI / 2) * side * S * 0.1;
          const oy = Math.sin(ang + Math.PI / 2) * side * S * 0.1 * TILT;
          crisp.ellipse(c.x + ox + (side > 0 ? 6 : -6) * Math.cos(ang), c.y + oy, S * 0.07, S * 0.07 * TILT * 1.3).fill({ color: path.color, alpha: 0.9 });
        }
        if (i === path.tiles.length - 1) glow.circle(c.x, c.y, S * 0.25).fill({ color: path.color, alpha: 0.5 });
        prev = c;
      });
    }

    // attack targets: arcing line + reticle
    for (const tg of ov.targets) {
      const a = worldCenter(tg.from);
      const b = worldCenter(tg.to);
      for (const h of tg.area ?? []) {
        const c = worldCenter(h);
        crisp.poly(hexPoints(c.x, c.y, S * 0.86), true).fill({ color: 0xff4a4a, alpha: 0.22 });
      }
      const mx = (a.x + b.x) / 2;
      const my = Math.min(a.y, b.y) - S * 0.9;
      crisp.moveTo(a.x, a.y - S * 0.6).quadraticCurveTo(mx, my, b.x, b.y - S * 0.2).stroke({ width: 3.5, color: tg.color, alpha: 0.9 });
      glow.moveTo(a.x, a.y - S * 0.6).quadraticCurveTo(mx, my, b.x, b.y - S * 0.2).stroke({ width: 9, color: tg.color, alpha: 0.5 });
      const rr = S * (0.48 + 0.05 * pulse);
      crisp.ellipse(b.x, b.y, rr, rr * TILT).stroke({ width: 3, color: tg.color, alpha: 0.95 });
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2 + t * 0.8;
        crisp
          .moveTo(b.x + Math.cos(ang) * rr * 0.55, b.y + Math.sin(ang) * rr * 0.55 * TILT)
          .lineTo(b.x + Math.cos(ang) * rr * 1.25, b.y + Math.sin(ang) * rr * 1.25 * TILT)
          .stroke({ width: 3, color: tg.color, alpha: 0.95 });
      }
    }

    // hover
    if (ov.hover) {
      const { x, y } = worldCenter(ov.hover);
      crisp.poly(hexPoints(x, y, S * 0.94), true).stroke({ width: 2.5, color: 0xfff3d6, alpha: 0.75 });
    }
  }

  private runeRing(g: Graphics, x: number, y: number, r: number, col: number, rot: number, alpha: number): void {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / n * (i % 3 === 0 ? 0.5 : 0.25);
      g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r * TILT)
        .lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r * TILT)
        .stroke({ width: i % 3 === 0 ? 3 : 2, color: col, alpha });
      if (i % 3 === 0) {
        const am = (a0 + a1) / 2;
        g.moveTo(x + Math.cos(am) * r * 0.86, y + Math.sin(am) * r * 0.86 * TILT)
          .lineTo(x + Math.cos(am) * r * 1.1, y + Math.sin(am) * r * 1.1 * TILT)
          .stroke({ width: 2, color: col, alpha });
      }
    }
  }

  private dashed(g: Graphics, x0: number, y0: number, x1: number, y1: number, color: string, w: number, dash: number, gap: number, offset: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    let d = -(offset % (dash + gap));
    while (d < len) {
      const a = Math.max(0, d);
      const b = Math.min(len, d + dash);
      if (b > a) g.moveTo(x0 + dx * a, y0 + dy * a).lineTo(x0 + dx * b, y0 + dy * b).stroke({ width: w, color, alpha: 0.85, cap: 'round' });
      d += dash + gap;
    }
  }

  private pulsesFor(uid: string, now: number): Pulse[] {
    return (this.ov.pulses ?? []).filter((p) => p.uid === uid && now - p.t0 < 900 && now >= p.t0);
  }

  private drawUnits(now: number): void {
    const s = this.state!;
    const bars = this.barsG.clear();
    const t = now / 1000;
    for (const [uid, v] of this.units) {
      // dissolve
      if (v.dying !== null) {
        const k = (now - v.dying) / 650;
        if (k >= 1) {
          v.root.destroy({ children: true });
          v.label?.destroy();
          this.units.delete(uid);
          continue;
        }
        v.root.alpha = 1 - k;
        v.spr.scale.set(v.spr.scale.x * (1 + 0.01), v.spr.scale.y * (1 - 0.02));
        v.spr.tint = 0x9cff6a;
        if (v.label) v.label.visible = false;
        continue;
      }
      const u = s.units.find((x) => x.uid === uid);
      if (!u) continue;
      // movement tween with little hops
      let hop = 0;
      if (v.move) {
        const k = clamp01((now - v.move.t0) / v.move.dur);
        const e = ease(k);
        v.x = v.move.fx + (v.move.tx - v.move.fx) * e;
        v.y = v.move.fy + (v.move.ty - v.move.fy) * e;
        const tiles = Math.max(1, Math.round(Math.hypot(v.move.tx - v.move.fx, (v.move.ty - v.move.fy) / TILT) / (S * SQ3)));
        hop = Math.abs(Math.sin(k * Math.PI * tiles)) * S * 0.28;
        if (k >= 1) v.move = null;
      }
      let ox = 0;
      let oy = -hop;
      let tint = 0xffffff;
      let flash = 0;
      for (const p of this.pulsesFor(uid, now)) {
        const k = (now - p.t0) / (p.kind === 'deploy' ? 600 : 380);
        if (k > 1) continue;
        if (!this.seenPulses.has(p)) {
          this.seenPulses.add(p);
          if (p.kind === 'hit' || p.kind === 'crit') this.burst({ x: v.x, y: v.y - v.height * 0.45 }, p.kind === 'crit' ? 0xffcf3a : 0xff5a5a, p.kind === 'crit' ? 22 : 12);
          if (p.kind === 'heal') this.burst({ x: v.x, y: v.y - v.height * 0.3 }, 0x8cff5a, 12, -1);
          if (p.kind === 'deploy') this.burst({ x: v.x, y: v.y }, 0xd8cbb0, 16, 0);
        }
        if (p.kind === 'lunge' && p.to) {
          const to = worldCenter(p.to);
          const d = Math.sin(k * Math.PI) * S * 0.45;
          const len = Math.hypot(to.x - v.x, to.y - v.y) || 1;
          ox += ((to.x - v.x) / len) * d;
          oy += ((to.y - v.y) / len) * d;
        } else if (p.kind === 'hit' || p.kind === 'crit') {
          ox += Math.sin(k * 40) * (1 - k) * (p.kind === 'crit' ? 10 : 6);
          tint = 0xff7070;
          flash = 1 - k;
        } else if (p.kind === 'heal') {
          tint = 0xa8ff9a;
        } else if (p.kind === 'deploy') {
          oy -= Math.pow(1 - k, 2) * S * 2.4;
        }
      }
      if (v.bornAt !== null) {
        const k = (now - v.bornAt) / 650;
        if (k >= 1) {
          v.bornAt = null;
          this.burst({ x: v.x, y: v.y }, 0xd8cbb0, 16, 0);
        } else oy -= Math.pow(1 - k, 2) * S * 2.6;
      }
      const breathe = this.reduce ? 0 : Math.sin(t * 2.2 + v.phase) * 0.025;
      const tex = v.spr.texture;
      const base = v.height / Math.max(1, tex.height);
      const maxW = S * 1.9;
      const sc = Math.min(base, maxW / Math.max(1, tex.width));
      v.spr.scale.set(sc * (1 - breathe * 0.6), sc * (1 + breathe));
      v.spr.position.set(ox, oy);
      if (tint === 0xffffff) tint = statusTint(u.statuses.map((st) => st.id));
      v.spr.tint = tint;
      if (!this.reduce) this.emitStatus(u.statuses.map((st) => st.id), v.x + ox, v.y + oy, v.height);
      const hidden = u.statuses.some((st) => st.id === 'hidden');
      v.spr.alpha = hidden ? 0.45 + 0.15 * Math.sin(t * 5) : 1;
      v.root.position.set(v.x, v.y);
      v.root.zIndex = v.y + 0.5;
      const sw = Math.min(tex.width * sc, S * 1.3);
      v.shadow.clear().ellipse(4, 3, sw * 0.42 * (1 - hop / (S * 1.2)), sw * 0.16).fill({ color: 0x050307, alpha: 0.42 });
      if (flash > 0) v.shadow.ellipse(0, 0, S * 0.7 * flash, S * 0.7 * flash * TILT).stroke({ width: 3, color: 0xffffff, alpha: flash * 0.6 });

      // HP bar: chunky rounded bar in the team colour
      const hpTarget = this.ov.hp?.get(uid) ?? u.hp;
      // the bar drains smoothly; a pale trail lingers where the lost HP was
      v.hpShown = v.hpShown === null || this.reduce ? hpTarget : v.hpShown + (hpTarget - v.hpShown) * 0.2;
      v.hpTrail = v.hpTrail === null || this.reduce || hpTarget > v.hpTrail ? hpTarget : v.hpTrail + (hpTarget - v.hpTrail) * 0.035;
      const hp = v.hpShown;
      const pct = clamp01(hp / u.maxHp);
      const trailPct = clamp01(v.hpTrail / u.maxHp);
      const bw = S * 1.05;
      const bh = 11;
      const visualTop = v.y + oy - v.spr.height * 0.94;
      const bx = v.x - bw / 2;
      const by = Math.min(visualTop - 14, v.y - S * 0.9);
      const col = u.owner === this.me ? TEAM_MINE : TEAM_ENEMY;
      bars.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 7).fill({ color: 0x0e0a12, alpha: 0.92 });
      bars.roundRect(bx, by, bw, bh, 5).fill({ color: 0x2a1d22 });
      if (trailPct > pct + 0.003) bars.roundRect(bx, by, Math.max(bh, bw * trailPct), bh, 5).fill({ color: 0xffe9c8, alpha: 0.85 });
      if (pct > 0) bars.roundRect(bx, by, Math.max(bh, bw * pct), bh, 5).fill({ color: pct > 0.3 ? col : 0xff4040 });
      bars.roundRect(bx + 2, by + 1.5, Math.max(0, bw * pct - 4), 3, 2).fill({ color: 0xffffff, alpha: 0.28 });
      if (u.shield) bars.roundRect(bx, by - 6, Math.min(bw, bw * (u.shield.amount / u.maxHp)), 5, 2).fill({ color: 0x9fe8ff, alpha: 0.95 });
      if (v.label) {
        v.label.visible = true;
        v.label.position.set(v.x, by - 4);
        v.label.scale.set(0.9);
      }
    }
  }

  private drawGhosts(now: number): void {
    const ghosts = this.ov.ghosts;
    const t = now / 1000;
    while (this.ghostSprites.length > ghosts.length) this.ghostSprites.pop()!.destroy();
    while (this.badgeTexts.length > ghosts.length) this.badgeTexts.pop()!.destroy();
    ghosts.forEach((gh, i) => {
      const { tex } = this.unitTexture(gh.unit);
      let sp = this.ghostSprites[i];
      if (!sp) {
        sp = new Sprite(tex);
        sp.anchor.set(0.5, 0.94);
        sp.blendMode = 'add';
        this.entities.addChild(sp);
        this.ghostSprites[i] = sp;
      }
      if (sp.texture !== tex) sp.texture = tex;
      const { x, y } = worldCenter(gh.pos);
      const sc = Math.min(this.unitHeight(gh.unit) / tex.height, (S * 1.9) / tex.width);
      sp.scale.set(sc);
      sp.position.set(x, y - (this.reduce ? 0 : Math.sin(t * 2 + i) * 3));
      sp.zIndex = y + 0.4;
      sp.tint = 0x58c8ff;
      sp.alpha = 0.42 + (this.reduce ? 0 : 0.08 * Math.sin(t * 9 + i * 2));
      this.crispG.poly(hexPoints(x, y, S * 0.8), true).stroke({ width: 2.5, color: 0x58c8ff, alpha: 0.8 });
      if (gh.order > 0) {
        let b = this.badgeTexts[i];
        if (!b) {
          b = new Text({ text: '', style: { fontFamily: '"Grenze Gotisch", serif', fontSize: 30, fill: 0xe8fbff, fontWeight: '700', stroke: { color: 0x0b2a3a, width: 6 } }, resolution: 2 });
          b.anchor.set(0.5);
          this.textLayer.addChild(b);
          this.badgeTexts[i] = b;
        }
        b.text = String(gh.order);
        b.position.set(x + S * 0.55, y - S * 1.1);
        this.crispG.circle(x + S * 0.55, y - S * 1.1, 17).fill({ color: 0x0b2a3a, alpha: 0.9 }).stroke({ width: 3, color: 0x58c8ff });
      } else if (this.badgeTexts[i]) {
        this.badgeTexts[i]!.text = '';
      }
    });
  }

  /** Little particles that make statuses visible on the creature itself. */
  private emitStatus(ids: string[], x: number, y: number, h: number): void {
    const now = performance.now();
    const spawn = (chance: number, color: number, vy: number, grav: number, r: number, life: number) => {
      if (Math.random() > chance) return;
      this.particles.push({ x: x + (Math.random() - 0.5) * S * 0.7, y: y - Math.random() * h * 0.8, vx: (Math.random() - 0.5) * 12, vy, life, t0: now, color, r, grav });
    };
    if (ids.includes('poison') || ids.includes('infection')) spawn(0.07, 0x9cff6a, -30, -10, 3, 1100);
    if (ids.includes('burn')) spawn(0.14, 0xffa43a, -60, -30, 2.5, 800);
    if (ids.includes('bleeding')) spawn(0.05, 0xd0202a, 10, 420, 2.5, 700);
    if (ids.includes('frozen')) spawn(0.04, 0xe8f8ff, -8, 6, 2, 1400);
    if (ids.includes('shock')) spawn(0.06, 0xe8ffff, -20, 0, 1.8, 300);
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private burst(at: { x: number; y: number }, color: number, n: number, dir = 1): void {
    if (this.reduce) return;
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * sp,
        vy: dir === 0 ? Math.sin(a) * sp * TILT : dir < 0 ? -40 - Math.random() * 80 : Math.sin(a) * sp - 60,
        life: 500 + Math.random() * 500,
        t0: now,
        color,
        r: 2 + Math.random() * 4,
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  private drawFx(now: number): void {
    const g = this.fxG.clear();
    const ov = this.ov;
    // drifting dust and spores, brighter where the light falls
    const t = now / 1000;
    for (const m of this.motes) {
      const y = ((((m.y - t * m.speed) % (this.moteBox.h + S * 2)) + this.moteBox.h + S * 2) % (this.moteBox.h + S * 2)) - S;
      const x = m.x + Math.sin(t * 0.35 + m.phase) * S * 0.4;
      g.circle(x, y, m.r).fill({ color: m.color, alpha: 0.16 + 0.14 * Math.sin(t * 1.3 + m.phase) });
    }
    // flashes
    for (const f of ov.flashes ?? []) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      for (const h of f.tiles) {
        const { x, y } = worldCenter(h);
        g.poly(hexPoints(x, y, S * (0.85 + k * 0.25)), true).fill({ color: f.color, alpha: (1 - k) * 0.55 });
        g.poly(hexPoints(x, y, S * (0.9 + k * 0.4)), true).stroke({ width: 4, color: f.color, alpha: (1 - k) * 0.8 });
      }
    }
    // attack visuals: projectiles arc to the target, melee slashes, beams, bursts
    for (const fx of ov.vfx ?? []) {
      const k = (now - fx.t0) / fx.dur;
      if (k < 0 || k > 1.15) continue;
      const a = worldCenter(fx.from);
      const b = worldCenter(fx.to);
      const ay = a.y - S * 0.85;
      const by2 = b.y - S * 0.6;
      if (fx.kind === 'projectile') {
        const kk = Math.min(1, k);
        for (let i = 0; i < 6; i++) {
          const t = Math.max(0, kk - i * 0.04);
          const x = a.x + (b.x - a.x) * t;
          const y = ay + (by2 - ay) * t - Math.sin(Math.PI * t) * S * 1.1;
          g.circle(x, y, (9 - i * 1.2) * (i === 0 ? 1.2 : 1)).fill({ color: fx.color, alpha: (1 - i / 6) * (k > 1 ? 1.15 - k : 1) });
        }
        if (k >= 0.95) g.circle(b.x, by2, S * 0.45 * (k - 0.95) * 8).stroke({ width: 4, color: fx.color, alpha: Math.max(0, 1.15 - k) });
      } else if (fx.kind === 'beam') {
        const w = 10 * (1 - Math.abs(k - 0.5));
        g.moveTo(a.x, ay).lineTo(b.x, by2).stroke({ width: w + 6, color: fx.color, alpha: 0.35 * (1 - k) });
        g.moveTo(a.x, ay).lineTo(b.x, by2).stroke({ width: w, color: 0xffffff, alpha: 0.9 * (1 - k) });
      } else if (fx.kind === 'slash') {
        const r = S * (0.55 + 0.35 * k);
        for (let i = -1; i <= 1; i++) {
          const rot = -0.9 + i * 0.35 + k * 0.6;
          g.arc(b.x + i * 6, by2 - i * 6, r, rot, rot + 1.7).stroke({ width: 6 - Math.abs(i) * 2, color: i === 0 ? 0xffffff : fx.color, alpha: Math.max(0, 1 - k) });
        }
      } else {
        const r = S * (0.3 + 0.9 * k);
        g.ellipse(b.x, b.y - S * 0.3, r, r * 0.7).stroke({ width: 5, color: fx.color, alpha: Math.max(0, 1 - k) });
      }
    }
    // particles
    const dt = 1 / 60;
    this.particles = this.particles.filter((p) => {
      const k = (now - p.t0) / p.life;
      if (k >= 1) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav ?? 260) * dt;
      p.vx *= 0.97;
      g.circle(p.x, p.y, p.r * (1 - k * 0.6)).fill({ color: p.color, alpha: 1 - k });
      return true;
    });
    // floating numbers
    const live = new Set<Floater>();
    for (const fl of ov.floaters ?? []) {
      const k = (now - fl.t0) / 1400;
      if (k < 0 || k > 1) continue;
      live.add(fl);
      let tx = this.floaterTexts.get(fl);
      if (!tx) {
        tx = new Text({
          text: fl.text,
          style: { fontFamily: '"Grenze Gotisch", serif', fontSize: fl.big ? 64 : 46, fill: fl.color, fontWeight: '700', stroke: { color: 0x0e0a12, width: 9 }, dropShadow: { color: 0x000000, alpha: 0.6, distance: 4, blur: 2, angle: Math.PI / 3 } },
          resolution: 2,
        });
        tx.anchor.set(0.5, 1);
        this.textLayer.addChild(tx);
        this.floaterTexts.set(fl, tx);
      }
      const base = fl.h ? worldCenter(fl.h) : { x: ((fl.x ?? 0) - this.world.x) / this.scale, y: ((fl.y ?? 0) - this.world.y) / this.scale };
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      tx.scale.set(pop);
      tx.position.set(base.x, base.y - S * 1.5 - ease(k) * S * 0.9);
      tx.alpha = 1 - k * k;
    }
    for (const [fl, tx] of this.floaterTexts) {
      if (!live.has(fl)) {
        tx.destroy();
        this.floaterTexts.delete(fl);
      }
    }
  }
}
