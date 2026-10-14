// Canvas hex-board renderer (UI-Assets document section 6: floor tiles, obstacles, field overlays, markers).

import { FIELDS, fromPixel, key, toPixel, type FieldInst, type GameState, type Hex, type PlayerId, type Unit, type Zone } from '@contaminant/engine';
import { figureCanvas, lookKey } from './art.ts';
import { assetImage } from './assets.ts';
import { STATUS_GLYPH, statusKind } from '../ui/glyphs.ts';

export const ZONE_FLOOR: Record<Zone, [string, string, string]> = {
  laboratory: ['#3a423e', '#424b46', '#353c38'],
  graveyard: ['#2a2130', '#30263a', '#251d2b'],
  bog: ['#1f2f22', '#253828', '#1b291e'],
  toyroom: ['#4a3426', '#53392a', '#432f22'],
  forest: ['#1e3330', '#233b37', '#1a2d2a'],
  tomb: ['#5a4a30', '#655336', '#51432b'],
};

export type HighlightKind = 'move' | 'attack' | 'deploy' | 'target' | 'invalid' | 'area' | 'ally' | 'path';

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
  big?: boolean;
}

export interface Flash {
  tiles: Hex[];
  color: string;
  t0: number;
  dur: number;
}

export interface Overlay {
  highlights: Map<string, HighlightKind>;
  paths: { unit: string; tiles: Hex[]; color: string }[];
  targets: { from: Hex; to: Hex; color: string; area?: Hex[] }[];
  ghosts: { unit: Unit; pos: Hex; order: number }[];
  selected?: string;
  hover?: Hex | null;
  /** playback overrides */
  pos?: Map<string, Hex>;
  hp?: Map<string, number>;
  gone?: Set<string>;
  floaters?: Floater[];
  flashes?: Flash[];
  tombs?: Hex[];
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

export class BoardRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  size = 30;
  ox = 0;
  oy = 0;
  dpr = 1;
  cam: Camera = { zoom: 1, panX: 0, panY: 0 };
  private cols = 15;
  private rows = 9;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  layout(state: GameState): void {
    const b = state.settings.bounds;
    this.cols = b.cols;
    this.rows = b.rows;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(50, rect.width);
    const H = Math.max(50, rect.height);
    if (this.canvas.width !== Math.round(W * this.dpr) || this.canvas.height !== Math.round(H * this.dpr)) {
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
    }
    const base = Math.min(W / (Math.sqrt(3) * (b.cols + 0.5)), H / (1.5 * b.rows + 0.5)) * 0.98;
    this.size = base * this.cam.zoom;
    const bw = Math.sqrt(3) * this.size * (b.cols + 0.5);
    const bh = this.size * (1.5 * b.rows + 0.5);
    this.ox = (W - bw) / 2 + (Math.sqrt(3) / 2) * this.size + this.cam.panX;
    this.oy = (H - bh) / 2 + this.size + this.cam.panY;
  }

  center(h: Hex): { x: number; y: number } {
    const p = toPixel(h, this.size);
    return { x: p.x + this.ox, y: p.y + this.oy };
  }

  hexAt(x: number, y: number): Hex | null {
    const h = fromPixel(x - this.ox, y - this.oy, this.size);
    if (h.c < 0 || h.r < 0 || h.c >= this.cols || h.r >= this.rows) return null;
    return h;
  }

  private hexPath(cx: number, cy: number, s: number): Path2D {
    const p = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const x = cx + s * Math.cos(a);
      const y = cy + s * Math.sin(a);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  draw(state: GameState, me: PlayerId, ov: Overlay, now: number): boolean {
    this.layout(state);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    ctx.clearRect(0, 0, W, H);
    const s = this.size;
    const zone = state.settings.zone;
    const floor = ZONE_FLOOR[zone] ?? ZONE_FLOOR.laboratory;
    let animating = false;

    // ---- floor
    for (const t of state.tiles) {
      const { x, y } = this.center(t);
      const p = this.hexPath(x, y, s * 0.985);
      const img = assetImage(`tiles/${zone}_floor_${(t.c * 7 + t.r * 13) % 3}.png`);
      if (img) {
        ctx.save();
        ctx.clip(p);
        ctx.drawImage(img, x - s, y - s * 1.16, s * 2, s * 2.32);
        ctx.restore();
      } else {
        ctx.fillStyle = floor[(t.c * 7 + t.r * 13) % 3]!;
        ctx.fill(p);
        // grout, cracks and stains: hand-drawn grime
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke(p);
        if ((t.c * 31 + t.r * 17) % 7 === 0) {
          ctx.strokeStyle = 'rgba(232,223,200,0.06)';
          ctx.beginPath();
          ctx.moveTo(x - s * 0.4, y - s * 0.1);
          ctx.lineTo(x - s * 0.1, y + s * 0.05);
          ctx.lineTo(x + s * 0.2, y - s * 0.15);
          ctx.stroke();
        }
      }
    }
    // deployment zones: faint green / red tint at the edges
    for (const t of state.tiles) {
      const third = Math.floor(state.settings.bounds.cols / 3);
      const mySide = state.players[me].side;
      const inLeft = t.c < third;
      const inRight = t.c >= state.settings.bounds.cols - third;
      if (!inLeft && !inRight) continue;
      const mine = (inLeft && mySide === 'left') || (inRight && mySide === 'right');
      const { x, y } = this.center(t);
      ctx.fillStyle = mine ? 'rgba(140,255,90,0.035)' : 'rgba(139,26,31,0.05)';
      ctx.fill(this.hexPath(x, y, s * 0.98));
    }

    // ---- fields
    for (const t of state.tiles) {
      if (!t.fields.length) continue;
      const { x, y } = this.center(t);
      for (const f of t.fields) this.drawField(f, x, y, s, now, me);
    }

    // ---- objectives
    for (const t of state.tiles) {
      if (!t.objective) continue;
      const { x, y } = this.center(t);
      ctx.save();
      const p = this.hexPath(x, y, s * 0.82);
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.strokeStyle = t.objective === 'control' ? '#D9A93A' : t.objective === 'terminal' ? '#8CFF5A' : '#4FE3FF';
      ctx.setLineDash([s * 0.18, s * 0.1]);
      ctx.stroke(p);
      ctx.setLineDash([]);
      ctx.font = `${s * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText(t.objective === 'control' ? '⚑' : t.objective === 'terminal' ? '🖥' : '⚗', x, y);
      ctx.restore();
    }

    // ---- walls
    for (const t of state.tiles) {
      if (!t.wall) continue;
      const { x, y } = this.center(t);
      this.drawWall(zone, x, y, s, t.wall.hp / t.wall.maxHp);
    }

    // ---- traps (own, or revealed)
    for (const tr of state.traps) {
      const { x, y } = this.center(tr.pos);
      ctx.save();
      ctx.globalAlpha = tr.owner === me ? 0.85 : 0.65;
      ctx.font = `${s * 0.55}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪤', x, y + s * 0.15);
      ctx.restore();
    }

    // ---- highlights
    for (const [k, kind] of ov.highlights) {
      const [c, r] = k.split(',').map(Number);
      const { x, y } = this.center({ c: c!, r: r! });
      const p = this.hexPath(x, y, s * 0.9);
      const col =
        kind === 'move' ? 'rgba(79,227,255,0.22)' : kind === 'attack' ? 'rgba(194,43,51,0.22)' : kind === 'deploy' ? 'rgba(140,255,90,0.22)' : kind === 'target' ? 'rgba(255,154,31,0.35)' : kind === 'area' ? 'rgba(255,90,90,0.3)' : kind === 'ally' ? 'rgba(140,255,90,0.3)' : kind === 'path' ? 'rgba(79,227,255,0.35)' : 'rgba(80,80,80,0.3)';
      ctx.fillStyle = col;
      ctx.fill(p);
      ctx.strokeStyle = kind === 'move' || kind === 'path' ? '#4FE3FF88' : kind === 'deploy' || kind === 'ally' ? '#8CFF5A88' : '#ff5a5a88';
      ctx.lineWidth = 1.5;
      ctx.stroke(p);
    }

    // ---- planned paths (footprints) and target lines
    for (const path of ov.paths) {
      const unit = state.units.find((u) => u.uid === path.unit);
      if (!unit) continue;
      let prev = this.center(ov.pos?.get(unit.uid) ?? unit.pos);
      ctx.strokeStyle = path.color;
      ctx.fillStyle = path.color;
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      for (const h of path.tiles) {
        const c = this.center(h);
        ctx.setLineDash([s * 0.12, s * 0.12]);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(c.x - s * 0.08, c.y, s * 0.06, s * 0.1, -0.3, 0, Math.PI * 2);
        ctx.ellipse(c.x + s * 0.08, c.y - s * 0.06, s * 0.06, s * 0.1, -0.3, 0, Math.PI * 2);
        ctx.fill();
        prev = c;
      }
    }
    for (const tg of ov.targets) {
      const a = this.center(tg.from);
      const b = this.center(tg.to);
      ctx.strokeStyle = tg.color;
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.setLineDash([s * 0.2, s * 0.1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const h of tg.area ?? []) {
        const c = this.center(h);
        ctx.fillStyle = 'rgba(255,90,90,0.18)';
        ctx.fill(this.hexPath(c.x, c.y, s * 0.88));
      }
      // crosshair of needles
      ctx.beginPath();
      ctx.arc(b.x, b.y, s * 0.42, 0, Math.PI * 2);
      ctx.moveTo(b.x - s * 0.6, b.y);
      ctx.lineTo(b.x - s * 0.2, b.y);
      ctx.moveTo(b.x + s * 0.2, b.y);
      ctx.lineTo(b.x + s * 0.6, b.y);
      ctx.moveTo(b.x, b.y - s * 0.6);
      ctx.lineTo(b.x, b.y - s * 0.2);
      ctx.moveTo(b.x, b.y + s * 0.2);
      ctx.lineTo(b.x, b.y + s * 0.6);
      ctx.stroke();
    }

    // ---- tombstones of this round's KOs
    for (const h of ov.tombs ?? []) {
      const { x, y } = this.center(h);
      ctx.font = `${s * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.8;
      ctx.fillText('🪦', x, y);
      ctx.globalAlpha = 1;
    }

    // ---- units (sorted for depth)
    const units = state.units
      .filter((u) => !ov.gone?.has(u.uid))
      .map((u) => ({ u, pos: ov.pos?.get(u.uid) ?? u.pos }))
      .sort((a, b) => a.pos.r - b.pos.r || a.pos.c - b.pos.c);
    for (const { u, pos } of units) this.drawUnit(u, pos, me, ov, now);

    // ---- ghosts of planned positions with order badges
    for (const g of ov.ghosts) {
      const { x, y } = this.center(g.pos);
      ctx.save();
      ctx.globalAlpha = 0.38;
      const fig = figureCanvas(lookKey(g.unit.defId, g.unit.form), 128);
      ctx.drawImage(fig, x - s * 0.85, y - s * 1.2, s * 1.7, s * 1.7);
      ctx.restore();
      if (g.order > 0) this.badge(x + s * 0.5, y - s * 0.6, String(g.order), '#4FE3FF');
    }

    // ---- hover
    if (ov.hover) {
      const { x, y } = this.center(ov.hover);
      ctx.strokeStyle = '#e8dfc8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke(this.hexPath(x, y, s * 0.92));
      ctx.setLineDash([]);
    }

    // ---- flashes and floating numbers
    for (const f of ov.flashes ?? []) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      animating = true;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.7;
      for (const h of f.tiles) {
        const { x, y } = this.center(h);
        ctx.fillStyle = f.color;
        ctx.fill(this.hexPath(x, y, s * (0.9 + k * 0.2)));
      }
      ctx.restore();
    }
    for (const fl of ov.floaters ?? []) {
      const k = (now - fl.t0) / 1400;
      if (k < 0 || k > 1) continue;
      animating = true;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `bold ${Math.max(12, s * (fl.big ? 0.75 : 0.55))}px "Special Elite", monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0E0A12';
      const yy = fl.y - k * s * 1.2;
      ctx.strokeText(fl.text, fl.x, yy);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, yy);
      ctx.restore();
    }
    return animating;
  }

  private badge(x: number, y: number, text: string, color: string): void {
    const ctx = this.ctx;
    const r = Math.max(8, this.size * 0.26);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = '#0E0A12';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${r}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  private drawUnit(u: Unit, pos: Hex, me: PlayerId, ov: Overlay, now: number): void {
    const ctx = this.ctx;
    const s = this.size;
    const { x, y } = this.center(pos);
    const mine = u.owner === me;
    const hidden = u.statuses.some((st) => st.id === 'hidden');
    // base socket under the token: green for you, red for the enemy
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 0.55, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = mine ? 'rgba(140,255,90,0.25)' : 'rgba(194,43,51,0.3)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = mine ? '#8CFF5A' : '#c22b33';
    if (hidden) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ov.selected === u.uid) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e8dfc8';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.42, s * 0.68, s * 0.27, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    const scale = u.isObject ? 1.1 : u.defId === 'shrink_head' ? 0.9 : u.tier === 'boss' ? 2.1 : u.form === 'brute' ? 1.85 : 1.65;
    const lk = lookKey(u.defId, u.form);
    const token = assetImage(`tokens/${lk}.png`) ?? figureCanvas(lk, 128);
    ctx.save();
    if (hidden) ctx.globalAlpha = 0.45 + 0.15 * Math.sin(now / 200);
    const bob = Math.sin(now / 600 + u.pos.c) * s * 0.02;
    ctx.drawImage(token, x - (s * scale) / 2, y - s * scale * 0.78 + bob, s * scale, s * scale);
    if (u.statuses.some((st) => st.id === 'gilded')) {
      ctx.globalCompositeOperation = 'source-atop';
    }
    ctx.restore();
    // overlays: gilded, frozen, corrupted, shield
    const has = (id: string) => u.statuses.some((st) => st.id === id);
    if (has('gilded')) this.ring(x, y - s * 0.2, s * 0.62, '#D9A93A');
    if (has('corruption')) this.ring(x, y - s * 0.2, s * 0.6, '#ff2bd6');
    if (has('frozen')) this.ring(x, y - s * 0.2, s * 0.58, '#bfe6ff');
    if (u.shield) this.ring(x, y - s * 0.2, s * 0.66, '#4FE3FF');
    // HP bar (bone with blood fill)
    const hp = ov.hp?.get(u.uid) ?? u.hp;
    const pct = Math.max(0, Math.min(1, hp / u.maxHp));
    const bw = s * 1.1;
    const bh = Math.max(4, s * 0.13);
    const bx = x - bw / 2;
    const by = y - s * 1.12;
    ctx.fillStyle = '#e8dfc8';
    ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
    ctx.fillStyle = '#1a0d10';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = mine ? '#c22b33' : '#8B1A1F';
    ctx.fillRect(bx, by, bw * pct, bh);
    if (u.shield) {
      ctx.fillStyle = 'rgba(79,227,255,0.6)';
      ctx.fillRect(bx, by, Math.min(bw, bw * (u.shield.amount / u.maxHp)), bh * 0.5);
    }
    // status pips (max 5)
    const sts = u.statuses.filter((st) => STATUS_GLYPH[st.id] && st.id !== 'hidden').slice(0, 5);
    sts.forEach((st, i) => {
      const px = x - s * 0.55 + i * s * 0.28;
      const py = y + s * 0.62;
      ctx.beginPath();
      ctx.arc(px, py, s * 0.13, 0, Math.PI * 2);
      const kind = statusKind(st.id);
      ctx.fillStyle = kind === 'buff' ? '#1f3a14' : kind === 'debuff' ? '#3a0d10' : '#2a2530';
      ctx.fill();
      ctx.strokeStyle = kind === 'buff' ? '#8CFF5A' : kind === 'debuff' ? '#c22b33' : '#e8dfc8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = `${s * 0.16}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(STATUS_GLYPH[st.id]!, px, py + 1);
    });
    // counters (coins, souls, broth, charges, tokens)
    const counters = Object.entries(u.counters).filter(([, v]) => v > 0);
    if (counters.length) {
      ctx.font = `bold ${Math.max(9, s * 0.22)}px monospace`;
      ctx.fillStyle = '#D9A93A';
      ctx.textAlign = 'left';
      ctx.fillText(counters.map(([k, v]) => `${k[0]!.toUpperCase()}${v}`).join(' '), x + s * 0.45, y - s * 0.75);
    }
  }

  private ring(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, this.size * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawWall(zone: Zone, x: number, y: number, s: number, hpPct: number): void {
    const ctx = this.ctx;
    const img = assetImage(`tiles/${zone}_wall_${hpPct > 0.66 ? 0 : hpPct > 0.33 ? 1 : 2}.png`);
    if (img) {
      ctx.drawImage(img, x - s, y - s * 1.3, s * 2, s * 2.2);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    const dark = '#0E0A12';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.strokeStyle = dark;
    switch (zone) {
      case 'graveyard': {
        ctx.fillStyle = '#6a6474';
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.5);
        ctx.lineTo(-s * 0.4, -s * 0.3);
        ctx.quadraticCurveTo(0, -s * 0.85, s * 0.4, -s * 0.3);
        ctx.lineTo(s * 0.4, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4);
        ctx.lineTo(0, s * 0.1);
        ctx.moveTo(-s * 0.18, -s * 0.22);
        ctx.lineTo(s * 0.18, -s * 0.22);
        ctx.stroke();
        break;
      }
      case 'bog':
        ctx.fillStyle = '#4a3a24';
        ctx.beginPath();
        ctx.roundRect(-s * 0.45, -s * 0.35, s * 0.9, s * 0.85, s * 0.1);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8a6bb0';
        ctx.beginPath();
        ctx.ellipse(-s * 0.15, -s * 0.38, s * 0.2, s * 0.1, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        break;
      case 'toyroom':
        for (const [bx, by, col] of [[-0.42, 0.05, '#c83a3a'], [0.02, 0.05, '#3a5aa0'], [-0.2, -0.38, '#e3d34a']] as const) {
          ctx.fillStyle = col;
          ctx.fillRect(bx * s, by * s, s * 0.4, s * 0.42);
          ctx.strokeRect(bx * s, by * s, s * 0.4, s * 0.42);
        }
        break;
      case 'forest':
        for (const dx of [-0.25, 0.2]) {
          ctx.fillStyle = '#3a2a1f';
          ctx.fillRect((dx - 0.13) * s, -s * 0.75, s * 0.26, s * 1.25);
          ctx.strokeRect((dx - 0.13) * s, -s * 0.75, s * 0.26, s * 1.25);
        }
        break;
      case 'tomb':
        ctx.fillStyle = '#b89a5a';
        ctx.fillRect(-s * 0.5, -s * 0.45, s, s * 0.95);
        ctx.strokeRect(-s * 0.5, -s * 0.45, s, s * 0.95);
        ctx.strokeStyle = '#6b5530';
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s * 0.15);
        ctx.lineTo(s * 0.5, -s * 0.15);
        ctx.stroke();
        break;
      default:
        // laboratory: steel cabinet with broken glass doors
        ctx.fillStyle = '#5a6068';
        ctx.fillRect(-s * 0.48, -s * 0.7, s * 0.96, s * 1.2);
        ctx.strokeRect(-s * 0.48, -s * 0.7, s * 0.96, s * 1.2);
        ctx.fillStyle = 'rgba(159,183,255,0.35)';
        ctx.fillRect(-s * 0.38, -s * 0.6, s * 0.34, s * 0.5);
        ctx.fillRect(s * 0.04, -s * 0.6, s * 0.34, s * 0.5);
        ctx.strokeRect(-s * 0.38, -s * 0.6, s * 0.34, s * 0.5);
        ctx.strokeRect(s * 0.04, -s * 0.6, s * 0.34, s * 0.5);
    }
    // damage cracks
    if (hpPct < 0.66) {
      ctx.strokeStyle = '#0E0A12';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.5);
      ctx.lineTo(0, -s * 0.2);
      ctx.lineTo(-s * 0.1, s * 0.1);
      if (hpPct < 0.33) {
        ctx.moveTo(s * 0.25, -s * 0.4);
        ctx.lineTo(s * 0.05, 0);
        ctx.lineTo(s * 0.3, s * 0.3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Returns true if the field is animated. */
  private drawField(f: FieldInst, x: number, y: number, s: number, now: number, me: PlayerId): boolean {
    const ctx = this.ctx;
    const def = FIELDS[f.id];
    if (!def) return false;
    if (f.id === 'crystal_bomb') {
      ctx.save();
      ctx.font = `${s * 0.6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = f.owner === me ? 0.95 : 0.8;
      ctx.fillText('🔮', x, y);
      ctx.restore();
      return false;
    }
    if (f.id === 'corrupted') {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 120);
      ctx.fillStyle = '#ff2bd6';
      ctx.fill(this.hexPath(x, y, s * 0.7));
      ctx.restore();
      return true;
    }
    ctx.save();
    const p = this.hexPath(x, y, s * 0.96);
    ctx.clip(p);
    const alpha = ['darkness'].includes(f.id) ? 0.72 : ['fog', 'steam', 'toxic_smoke'].includes(f.id) ? 0.45 : 0.36;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = def.color;
    ctx.fill(p);
    ctx.globalAlpha = 0.8;
    const t = now / 1000;
    let anim = false;
    switch (f.id) {
      case 'water':
      case 'electrified_water':
      case 'contaminated_water':
      case 'diluted_acid':
      case 'frozen_water':
        ctx.strokeStyle = f.id === 'electrified_water' ? '#ffffff' : '#9fd0ff88';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(x + (i ? s * 0.25 : -s * 0.2), y + (i ? -s * 0.1 : s * 0.2), s * (0.2 + 0.05 * Math.sin(t * 2 + i)), 0, Math.PI * 2);
          ctx.stroke();
        }
        anim = true;
        break;
      case 'fire':
      case 'wildfire':
      case 'scalded':
        ctx.fillStyle = '#ffcf6a';
        for (let i = 0; i < 3; i++) {
          const fx = x + (i - 1) * s * 0.3;
          const fh = s * (0.35 + 0.12 * Math.sin(t * 6 + i * 2));
          ctx.beginPath();
          ctx.moveTo(fx - s * 0.12, y + s * 0.3);
          ctx.quadraticCurveTo(fx, y + s * 0.3 - fh * 2, fx + s * 0.12, y + s * 0.3);
          ctx.fill();
        }
        anim = true;
        break;
      case 'toxic':
      case 'swamp':
      case 'acid':
        ctx.fillStyle = f.id === 'swamp' ? '#7a6a3a' : '#c8ff9a';
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.6 + i / 3) % 1;
          ctx.beginPath();
          ctx.arc(x + (i - 1) * s * 0.28, y + s * 0.25 - k * s * 0.5, s * 0.07 * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        anim = true;
        break;
      case 'electric':
      case 'portal':
      case 'shock_storm':
        ctx.strokeStyle = '#e8ffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const ph = Math.floor(t * 8) % 3;
        ctx.moveTo(x - s * 0.5, y - s * 0.1 + ph * 3);
        ctx.lineTo(x - s * 0.15, y + s * 0.15);
        ctx.lineTo(x + s * 0.05, y - s * 0.2);
        ctx.lineTo(x + s * 0.5, y + s * 0.1 - ph * 3);
        ctx.stroke();
        anim = true;
        break;
      case 'overgrowth':
      case 'mutation':
        ctx.strokeStyle = f.id === 'mutation' ? '#d6ff3a' : '#3f7a2a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.5 + i * s * 0.35, y + s * 0.5);
          ctx.quadraticCurveTo(x - s * 0.3 + i * s * 0.3, y - s * 0.2, x - s * 0.1 + i * s * 0.3, y - s * 0.4);
          ctx.stroke();
        }
        break;
      case 'ice':
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.4, y);
        ctx.lineTo(x, y - s * 0.2);
        ctx.lineTo(x + s * 0.3, y + s * 0.3);
        ctx.stroke();
        break;
      case 'darkness':
        ctx.fillStyle = '#ffcf3a';
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 2);
        for (const dx of [-0.08, 0.08]) {
          ctx.beginPath();
          ctx.arc(x + dx * s, y, s * 0.04, 0, Math.PI * 2);
          ctx.fill();
        }
        anim = true;
        break;
      case 'fog':
      case 'steam':
      case 'toxic_smoke':
        ctx.fillStyle = f.id === 'toxic_smoke' ? '#9ab07a' : '#e8e8e8';
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x + Math.sin(t + i) * s * 0.3, y + (i - 1) * s * 0.25, s * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        anim = true;
        break;
      case 'gas':
        ctx.strokeStyle = '#fff6a0';
        ctx.beginPath();
        ctx.arc(x, y, s * (0.4 + 0.04 * Math.sin(t * 3)), 0, Math.PI * 2);
        ctx.stroke();
        anim = true;
        break;
      case 'snare':
        ctx.strokeStyle = '#d07a4a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) {
          ctx.moveTo(x - s * 0.5, y + i * s * 0.15);
          ctx.lineTo(x + s * 0.5, y + i * s * 0.15 + s * 0.08);
        }
        ctx.stroke();
        break;
      case 'chrono':
      case 'resonance':
        ctx.strokeStyle = f.id === 'chrono' ? '#e3c66a' : '#b48cff';
        ctx.lineWidth = 1.5;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.18 * i + (anim ? 0 : 2 * Math.sin(t * 3)), 0, Math.PI * 2);
          ctx.stroke();
        }
        anim = true;
        break;
      case 'marigold':
        ctx.fillStyle = '#ffb347';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(x + Math.cos(i * 1.3) * s * 0.35, y + Math.sin(i * 1.3) * s * 0.3, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'ant_trail':
        ctx.fillStyle = '#1a0f05';
        for (let i = 0; i < 6; i++) {
          const k = (t * 0.3 + i / 6) % 1;
          ctx.beginPath();
          ctx.arc(x - s * 0.5 + k * s, y + Math.sin(k * 8) * s * 0.1, s * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
        anim = true;
        break;
      case 'radiation':
        ctx.fillStyle = '#1a1a05';
        ctx.font = `${s * 0.5}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☢', x, y);
        break;
      case 'sterile':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.6);
        ctx.fillRect(x - s * 0.3, y - s * 0.06, s * 0.6, s * 0.12);
        break;
      case 'moonlit':
        ctx.fillStyle = '#f5f0ff';
        ctx.beginPath();
        ctx.arc(x + s * 0.2, y - s * 0.2, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bandage':
        ctx.strokeStyle = '#f5ecd2';
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.5, y + i * s * 0.25);
          ctx.lineTo(x + s * 0.5, y + i * s * 0.25 - s * 0.1);
          ctx.stroke();
        }
        break;
      case 'contamination':
        ctx.fillStyle = '#c22b33';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(x + s * 0.2, y + s * 0.1, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ash':
        ctx.fillStyle = '#ff9a1f';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(x + ((i * 17) % 10 - 5) * s * 0.07, y + ((i * 23) % 10 - 5) * s * 0.07, s * 0.03, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default:
        break;
    }
    ctx.restore();
    return anim;
  }
}

export function tileKey(h: Hex): string {
  return key(h);
}
