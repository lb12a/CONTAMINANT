// Procedural character art: an "Among Us"-like bean silhouette per character with horror accessories,
// thick dark outline (#0E0A12), light from the top left and a soft shadow to the bottom right
// (UI-Assets document, technical rules). Generated ComfyUI images replace these when available.

import { CHARACTERS, SUMMONS } from '@contaminant/engine';
import { assetImage } from './assets.ts';

type Acc =
  | 'legs8' | 'eggs' | 'screen' | 'hood' | 'skull' | 'scythe' | 'ghost' | 'vines' | 'mushroom' | 'spores' | 'ears' | 'button' | 'knife'
  | 'pumpkin' | 'candy' | 'teeth' | 'fork' | 'tutu' | 'key' | 'snout' | 'coin' | 'strawhat' | 'crow' | 'bolts' | 'stitches' | 'cap'
  | 'palmeyes' | 'mask' | 'jackbox' | 'heads' | 'reeds' | 'flame' | 'bottle' | 'orbeye' | 'hands' | 'mound' | 'cymbals' | 'gears'
  | 'feathers' | 'doll' | 'marigold' | 'dress' | 'shirt' | 'fur' | 'bandage' | 'goldcoins' | 'clock' | 'bird' | 'hand' | 'pacifier'
  | 'antlers' | 'bowl' | 'coat' | 'scalpel' | 'chefhat' | 'ladle' | 'horns' | 'crown' | 'straw' | 'lid' | 'pot' | 'candle';

export interface Look {
  body: string;
  accent: string;
  visor: string;
  shape: 'bean' | 'blob' | 'tall' | 'small' | 'square' | 'orb' | 'mound' | 'flame' | 'ghost' | 'spider' | 'pot' | 'candle';
  acc: Acc[];
}

export const LOOKS: Record<string, Look> = {
  arachnia: { body: '#4a6b2a', accent: '#7a4a2a', visor: '#c8ff7a', shape: 'spider', acc: ['legs8', 'eggs'] },
  nexus: { body: '#3a3a48', accent: '#ff2bd6', visor: '#4FE3FF', shape: 'square', acc: ['screen'] },
  vile: { body: '#5a9a3a', accent: '#1F2A22', visor: '#e8dfc8', shape: 'tall', acc: ['hood', 'skull', 'scythe'] },
  cruorina: { body: '#3a0a10', accent: '#8B1A1F', visor: '#ff5a64', shape: 'ghost', acc: ['vines'] },
  mycel: { body: '#8a6bb0', accent: '#e8dfc8', visor: '#e8dfc8', shape: 'blob', acc: ['mushroom', 'spores'] },
  lullabun: { body: '#d97aa0', accent: '#2a1a24', visor: '#111111', shape: 'bean', acc: ['ears', 'button', 'knife'] },
  pumpkin: { body: '#ff8a1f', accent: '#3a6a2a', visor: '#ffe27a', shape: 'blob', acc: ['pumpkin', 'candy'] },
  steak: { body: '#b5626f', accent: '#6b3a2a', visor: '#f5d0a0', shape: 'blob', acc: ['teeth', 'fork'] },
  ballerina: { body: '#a0582f', accent: '#c0c0c8', visor: '#e8dfc8', shape: 'tall', acc: ['tutu', 'key'] },
  piggybank: { body: '#f0ece0', accent: '#D9A93A', visor: '#7a9ad0', shape: 'blob', acc: ['snout', 'coin'] },
  scarecrow: { body: '#8a6a3a', accent: '#2a1a0a', visor: '#1a1a1a', shape: 'bean', acc: ['strawhat', 'straw', 'crow'] },
  frankenstein: { body: '#6f8a70', accent: '#4FE3FF', visor: '#c8f5ff', shape: 'square', acc: ['bolts', 'stitches'] },
  ghost_train: { body: '#2f4a8a', accent: '#e3d34a', visor: '#fff6a0', shape: 'bean', acc: ['cap', 'palmeyes'] },
  pokerface: { body: '#c83a3a', accent: '#3a5aa0', visor: '#f5f0ff', shape: 'bean', acc: ['mask', 'jackbox'] },
  shrink_heads: { body: '#6b4a2a', accent: '#4a7a2a', visor: '#e8dfc8', shape: 'bean', acc: ['heads'] },
  swamp_siren: { body: '#2f5a3a', accent: '#6a8a3a', visor: '#9fffd0', shape: 'tall', acc: ['reeds'] },
  wisp: { body: '#e3d34a', accent: '#7a7a80', visor: '#ffffff', shape: 'flame', acc: ['flame', 'bottle'] },
  crystal_eye: { body: '#e8e4ff', accent: '#9FB7FF', visor: '#6B3FA0', shape: 'orb', acc: ['orbeye', 'hands'] },
  termite_mound: { body: '#7a5a3a', accent: '#3a2a1a', visor: '#e8dfc8', shape: 'mound', acc: ['mound'] },
  cymbal_chimp: { body: '#9a3a2a', accent: '#c9a24a', visor: '#ffe9a8', shape: 'bean', acc: ['cymbals', 'gears'] },
  mambo: { body: '#5a3a8a', accent: '#D9A93A', visor: '#ffe9a8', shape: 'tall', acc: ['feathers', 'doll'] },
  calaca: { body: '#ece4cf', accent: '#FF9A1F', visor: '#111111', shape: 'tall', acc: ['skull', 'marigold', 'dress'] },
  werewolf: { body: '#8a8a90', accent: '#c0c0c8', visor: '#ffe27a', shape: 'bean', acc: ['shirt'] },
  midas_mummy: { body: '#d9c27a', accent: '#D9A93A', visor: '#ffe27a', shape: 'bean', acc: ['bandage', 'goldcoins'] },
  cog_cuckoo: { body: '#7a5a2a', accent: '#c9a24a', visor: '#f5e6c8', shape: 'square', acc: ['clock', 'bird'] },
  zombie_limb: { body: '#8aa07a', accent: '#4a5a3a', visor: '#d0e0b0', shape: 'small', acc: ['hand', 'stitches'] },
  baby_mummy: { body: '#e3d6b1', accent: '#8B1A1F', visor: '#1a1a1a', shape: 'small', acc: ['bandage', 'pacifier'] },
  little_wendigo: { body: '#bfe6ff', accent: '#1a1a24', visor: '#111111', shape: 'small', acc: ['antlers', 'bowl'] },
  lab_assistant: { body: '#f0ece0', accent: '#8CFF5A', visor: '#9fd0ff', shape: 'bean', acc: ['coat', 'scalpel'] },
  leech_cook: { body: '#6b4a2a', accent: '#4a7a2a', visor: '#e8dfc8', shape: 'bean', acc: ['chefhat', 'ladle'] },
  // forms & summons
  werewolf_wolf: { body: '#5a5a62', accent: '#c0c0c8', visor: '#ffcf3a', shape: 'blob', acc: ['ears', 'fur', 'teeth'] },
  zombie_patchwork: { body: '#7a9a6a', accent: '#3a4a2a', visor: '#d0e0b0', shape: 'bean', acc: ['stitches', 'hand'] },
  zombie_brute: { body: '#6a8a5a', accent: '#2a3a1a', visor: '#d0e0b0', shape: 'square', acc: ['stitches', 'bolts'] },
  pokerface_happy: { body: '#d0a020', accent: '#3a5aa0', visor: '#fff6c0', shape: 'bean', acc: ['mask', 'jackbox'] },
  pokerface_sad: { body: '#3a5aa0', accent: '#1a2a5a', visor: '#c0d0ff', shape: 'bean', acc: ['mask', 'jackbox'] },
  pokerface_angry: { body: '#c83a3a', accent: '#5a1a1a', visor: '#ffc0c0', shape: 'bean', acc: ['mask', 'jackbox'] },
  shrink_head: { body: '#7a5a3a', accent: '#3a2a1a', visor: '#e8dfc8', shape: 'small', acc: ['stitches'] },
  mini_arachnia: { body: '#5a7a3a', accent: '#7a4a2a', visor: '#c8ff7a', shape: 'spider', acc: ['legs8'] },
  candle: { body: '#efe2bd', accent: '#FF9A1F', visor: '#ffe27a', shape: 'candle', acc: ['candle'] },
  mud_decoy: { body: '#4a3a1f', accent: '#2a1f10', visor: '#8a7a50', shape: 'blob', acc: [] },
  cooking_pot: { body: '#4a4a52', accent: '#4a7a2a', visor: '#8CFF5A', shape: 'pot', acc: ['pot'] },
  training_dummy: { body: '#c9a86a', accent: '#6b4a2a', visor: '#2a2116', shape: 'bean', acc: ['straw'] },
  training_walker: { body: '#b8985a', accent: '#6b4a2a', visor: '#2a2116', shape: 'bean', acc: ['straw'] },
};

export function lookKey(defId: string, form: string | null | undefined): string {
  if (defId === 'werewolf' && form === 'wolf') return 'werewolf_wolf';
  if (defId === 'zombie_limb' && form === 'patchwork') return 'zombie_patchwork';
  if (defId === 'zombie_limb' && form === 'brute') return 'zombie_brute';
  if (defId === 'pokerface' && form && ['happy', 'sad', 'angry'].includes(form)) return `pokerface_${form}`;
  return defId;
}

const OUT = '#0E0A12';

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function stroke(ctx: CanvasRenderingContext2D, w: number) {
  ctx.lineWidth = w;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function bodyPath(ctx: CanvasRenderingContext2D, shape: Look['shape'], S: number) {
  const p = new Path2D();
  const cx = S / 2;
  switch (shape) {
    case 'orb':
      p.arc(cx, S * 0.5, S * 0.3, 0, Math.PI * 2);
      break;
    case 'ghost': {
      p.moveTo(S * 0.25, S * 0.82);
      p.lineTo(S * 0.25, S * 0.42);
      p.bezierCurveTo(S * 0.25, S * 0.12, S * 0.75, S * 0.12, S * 0.75, S * 0.42);
      p.lineTo(S * 0.75, S * 0.82);
      for (let i = 0; i < 4; i++) p.quadraticCurveTo(S * (0.75 - i * 0.125 - 0.06), S * (i % 2 ? 0.74 : 0.9), S * (0.75 - (i + 1) * 0.125), S * 0.82);
      p.closePath();
      break;
    }
    case 'flame': {
      p.moveTo(cx, S * 0.12);
      p.bezierCurveTo(S * 0.8, S * 0.42, S * 0.78, S * 0.85, cx, S * 0.86);
      p.bezierCurveTo(S * 0.22, S * 0.85, S * 0.2, S * 0.42, cx, S * 0.12);
      break;
    }
    case 'mound': {
      p.moveTo(S * 0.15, S * 0.86);
      p.quadraticCurveTo(S * 0.3, S * 0.2, cx, S * 0.14);
      p.quadraticCurveTo(S * 0.7, S * 0.2, S * 0.85, S * 0.86);
      p.closePath();
      break;
    }
    case 'pot':
      p.roundRect(S * 0.2, S * 0.38, S * 0.6, S * 0.46, S * 0.12);
      break;
    case 'candle':
      p.roundRect(S * 0.38, S * 0.36, S * 0.24, S * 0.5, S * 0.04);
      break;
    case 'spider':
      p.ellipse(cx, S * 0.56, S * 0.24, S * 0.2, 0, 0, Math.PI * 2);
      p.moveTo(cx + S * 0.13, S * 0.34);
      p.arc(cx, S * 0.34, S * 0.13, 0, Math.PI * 2);
      break;
    default: {
      const w = shape === 'tall' ? 0.42 : shape === 'small' ? 0.4 : shape === 'blob' ? 0.56 : shape === 'square' ? 0.5 : 0.48;
      const top = shape === 'tall' ? 0.14 : shape === 'small' ? 0.36 : shape === 'blob' ? 0.26 : 0.2;
      const x0 = cx - (S * w) / 2;
      const x1 = cx + (S * w) / 2;
      const r = shape === 'square' ? S * 0.08 : (S * w) / 2;
      p.moveTo(x0, S * 0.84);
      p.lineTo(x0, S * top + r);
      p.arcTo(x0, S * top, x0 + r, S * top, r);
      p.lineTo(x1 - r, S * top);
      p.arcTo(x1, S * top, x1, S * top + r, r);
      p.lineTo(x1, S * 0.84);
      // two stubby legs like a crewmate
      p.lineTo(cx + S * 0.05, S * 0.84);
      p.lineTo(cx + S * 0.05, S * 0.78);
      p.lineTo(cx - S * 0.05, S * 0.78);
      p.lineTo(cx - S * 0.05, S * 0.84);
      p.closePath();
    }
  }
  return p;
}

/** Draw a character figure into ctx at size S (square). */
export function drawFigure(ctx: CanvasRenderingContext2D, key: string, S: number, opts: { silhouette?: boolean; tint?: string } = {}) {
  const look = LOOKS[key] ?? LOOKS[key.split('_')[0]!] ?? { body: '#777', accent: '#444', visor: '#ccc', shape: 'bean', acc: [] };
  const lw = Math.max(1.5, S * 0.035);
  ctx.save();
  // soft shadow bottom-right
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(S * 0.54, S * 0.9, S * 0.26, S * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  const sil = !!opts.silhouette;
  const body = sil ? '#050307' : opts.tint ?? look.body;
  const accent = sil ? '#050307' : look.accent;
  // backpack (crewmate silhouette) for bean shapes
  if (['bean', 'tall', 'square'].includes(look.shape)) {
    const bp = new Path2D();
    bp.roundRect(S * 0.17, S * 0.42, S * 0.12, S * 0.3, S * 0.04);
    ctx.fillStyle = sil ? body : shade(look.body, 0.75);
    ctx.fill(bp);
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUT;
    ctx.stroke(bp);
  }
  // behind-body accessories
  for (const a of look.acc) behind(ctx, a, S, accent, lw, sil);
  const p = bodyPath(ctx, look.shape, S);
  const grad = ctx.createLinearGradient(S * 0.2, S * 0.15, S * 0.8, S * 0.9);
  grad.addColorStop(0, sil ? body : shade(body.startsWith('#') ? body : '#777777', 1.18));
  grad.addColorStop(1, sil ? body : shade(body.startsWith('#') ? body : '#777777', 0.72));
  ctx.fillStyle = grad;
  ctx.fill(p);
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  if (!sil) {
    // visor (glass) with highlight from the top left
    if (!['orb', 'flame', 'mound', 'pot', 'candle', 'ghost'].includes(look.shape)) {
      const vy = look.shape === 'small' ? 0.46 : look.shape === 'tall' ? 0.3 : look.shape === 'blob' ? 0.38 : 0.34;
      const v = new Path2D();
      v.roundRect(S * 0.44, S * vy, S * 0.3, S * 0.13, S * 0.065);
      ctx.fillStyle = look.visor;
      ctx.fill(v);
      ctx.lineWidth = lw;
      ctx.stroke(v);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.roundRect(S * 0.48, S * (vy + 0.025), S * 0.1, S * 0.035, S * 0.02);
      ctx.fill();
    }
    // stitches / grime: hand-drawn feel
    ctx.strokeStyle = 'rgba(14,10,18,0.35)';
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath();
    ctx.moveTo(S * 0.3, S * 0.7);
    ctx.lineTo(S * 0.36, S * 0.68);
    ctx.stroke();
  }
  for (const a of look.acc) front(ctx, a, S, accent, look, lw, sil);
  ctx.restore();
}

function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, lw);
}

function behind(ctx: CanvasRenderingContext2D, a: Acc, S: number, accent: string, lw: number, sil: boolean) {
  const c = sil ? '#050307' : accent;
  switch (a) {
    case 'legs8':
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          const y = S * (0.46 + i * 0.07);
          ctx.moveTo(S / 2 + side * S * 0.15, y);
          ctx.quadraticCurveTo(S / 2 + side * S * 0.38, y - S * 0.14, S / 2 + side * S * (0.44 - i * 0.02), y + S * 0.12);
          ctx.lineWidth = lw * 1.4;
          ctx.strokeStyle = sil ? '#050307' : '#2a1a10';
          ctx.stroke();
        }
      }
      break;
    case 'scythe':
      ctx.beginPath();
      ctx.moveTo(S * 0.82, S * 0.88);
      ctx.lineTo(S * 0.78, S * 0.14);
      ctx.lineWidth = lw * 1.3;
      ctx.strokeStyle = sil ? '#050307' : '#4a3a2a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(S * 0.78, S * 0.14);
      ctx.quadraticCurveTo(S * 0.6, S * 0.06, S * 0.48, S * 0.2);
      ctx.quadraticCurveTo(S * 0.62, S * 0.14, S * 0.78, S * 0.2);
      ctx.fillStyle = sil ? '#050307' : '#c0c0c8';
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'reeds':
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(S * (0.3 + i * 0.1), S * 0.3);
        ctx.quadraticCurveTo(S * (0.25 + i * 0.12), S * 0.08, S * (0.2 + i * 0.14), S * 0.05);
        ctx.lineWidth = lw;
        ctx.strokeStyle = sil ? '#050307' : '#6a8a3a';
        ctx.stroke();
      }
      break;
    case 'feathers':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(S * (0.42 + i * 0.08), S * 0.1, S * 0.03, S * 0.1, (i - 1) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = sil ? '#050307' : ['#D9A93A', '#8B1A1F', '#6B3FA0'][i]!;
        ctx.fill();
        stroke(ctx, lw * 0.7);
      }
      break;
    case 'antlers':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(S / 2 + side * S * 0.08, S * 0.4);
        ctx.lineTo(S / 2 + side * S * 0.2, S * 0.14);
        ctx.moveTo(S / 2 + side * S * 0.15, S * 0.24);
        ctx.lineTo(S / 2 + side * S * 0.28, S * 0.2);
        ctx.moveTo(S / 2 + side * S * 0.18, S * 0.18);
        ctx.lineTo(S / 2 + side * S * 0.14, S * 0.06);
        ctx.lineWidth = lw * 1.2;
        ctx.strokeStyle = sil ? '#050307' : '#d8ccab';
        ctx.stroke();
      }
      break;
    case 'ears':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(S / 2 + side * S * 0.12, S * 0.14, S * 0.06, S * 0.14, side * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = sil ? '#050307' : c;
        ctx.fill();
        stroke(ctx, lw);
      }
      break;
    case 'hands':
      for (const side of [-1, 1]) circ(ctx, S / 2 + side * S * 0.38, S * 0.62, S * 0.07, sil ? '#050307' : '#e8e4ff', lw);
      break;
    case 'cymbals':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(S / 2 + side * S * 0.36, S * 0.56, S * 0.1, S * 0.04, side * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = sil ? '#050307' : '#c9a24a';
        ctx.fill();
        stroke(ctx, lw);
      }
      break;
    case 'fork':
      ctx.beginPath();
      ctx.moveTo(S * 0.85, S * 0.86);
      ctx.lineTo(S * 0.8, S * 0.22);
      ctx.moveTo(S * 0.76, S * 0.22);
      ctx.lineTo(S * 0.76, S * 0.12);
      ctx.moveTo(S * 0.8, S * 0.22);
      ctx.lineTo(S * 0.8, S * 0.1);
      ctx.moveTo(S * 0.84, S * 0.22);
      ctx.lineTo(S * 0.84, S * 0.12);
      ctx.lineWidth = lw;
      ctx.strokeStyle = sil ? '#050307' : '#c0c0c8';
      ctx.stroke();
      break;
    default:
      break;
  }
}

function front(ctx: CanvasRenderingContext2D, a: Acc, S: number, accent: string, look: Look, lw: number, sil: boolean) {
  const c = sil ? '#050307' : accent;
  const k = (fill: string) => (sil ? '#050307' : fill);
  switch (a) {
    case 'eggs':
      for (const [x, y] of [[0.44, 0.66], [0.54, 0.7], [0.6, 0.62]] as const) circ(ctx, S * x, S * y, S * 0.035, k('#e8dfc8'), lw * 0.7);
      for (const ex of [-0.05, 0, 0.05]) circ(ctx, S / 2 + ex * S, S * 0.32, S * 0.018, k('#c8ff7a'), lw * 0.5);
      break;
    case 'screen': {
      ctx.beginPath();
      ctx.roundRect(S * 0.32, S * 0.3, S * 0.36, S * 0.24, S * 0.03);
      ctx.fillStyle = k('#102028');
      ctx.fill();
      stroke(ctx, lw);
      if (!sil) {
        ctx.fillStyle = '#ff2bd6';
        ctx.font = `bold ${S * 0.12}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('ʘ‿ʘ', S / 2, S * 0.46);
      }
      break;
    }
    case 'hood':
      ctx.beginPath();
      ctx.moveTo(S * 0.28, S * 0.5);
      ctx.quadraticCurveTo(S * 0.3, S * 0.08, S / 2, S * 0.08);
      ctx.quadraticCurveTo(S * 0.7, S * 0.08, S * 0.72, S * 0.5);
      ctx.fillStyle = k('#1F2A22');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'skull':
      circ(ctx, S / 2, S * (look.shape === 'tall' ? 0.27 : 0.32), S * 0.1, k('#ece4cf'), lw);
      if (!sil) {
        ctx.fillStyle = OUT;
        for (const dx of [-0.035, 0.035]) {
          ctx.beginPath();
          ctx.arc(S / 2 + dx * S, S * (look.shape === 'tall' ? 0.26 : 0.31), S * 0.022, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'vines':
      ctx.beginPath();
      ctx.moveTo(S * 0.3, S * 0.2);
      ctx.bezierCurveTo(S * 0.2, S * 0.4, S * 0.4, S * 0.5, S * 0.3, S * 0.7);
      ctx.lineWidth = lw;
      ctx.strokeStyle = k('#6a2a1a');
      ctx.stroke();
      for (const dx of [-0.07, 0.07]) circ(ctx, S / 2 + dx * S, S * 0.38, S * 0.03, k('#ff5a64'), lw * 0.6);
      break;
    case 'mushroom':
      ctx.beginPath();
      ctx.ellipse(S / 2, S * 0.26, S * 0.32, S * 0.13, 0, Math.PI, 0);
      ctx.fillStyle = k('#6B3FA0');
      ctx.fill();
      stroke(ctx, lw);
      for (const [x, y] of [[0.38, 0.2], [0.55, 0.17], [0.66, 0.23]] as const) circ(ctx, S * x, S * y, S * 0.025, k('#e8dfc8'), lw * 0.4);
      break;
    case 'spores':
      if (!sil) for (let i = 0; i < 6; i++) circ(ctx, S * (0.2 + ((i * 37) % 60) / 100), S * (0.06 + ((i * 23) % 14) / 100), S * 0.012, '#e8dfc8aa', 0.5);
      break;
    case 'button':
      circ(ctx, S * 0.5, S * 0.62, S * 0.035, k('#111'), lw * 0.5);
      break;
    case 'knife':
      ctx.beginPath();
      ctx.moveTo(S * 0.22, S * 0.66);
      ctx.lineTo(S * 0.08, S * 0.5);
      ctx.lineTo(S * 0.14, S * 0.48);
      ctx.closePath();
      ctx.fillStyle = k('#c0c0c8');
      ctx.fill();
      stroke(ctx, lw * 0.7);
      break;
    case 'pumpkin':
      ctx.beginPath();
      ctx.moveTo(S * 0.5, S * 0.26);
      ctx.lineTo(S * 0.52, S * 0.14);
      ctx.lineWidth = lw * 1.4;
      ctx.strokeStyle = k('#3a6a2a');
      ctx.stroke();
      if (!sil) {
        ctx.fillStyle = '#2a1405';
        ctx.beginPath();
        ctx.moveTo(S * 0.38, S * 0.42);
        ctx.lineTo(S * 0.44, S * 0.36);
        ctx.lineTo(S * 0.46, S * 0.44);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(S * 0.56, S * 0.44);
        ctx.lineTo(S * 0.6, S * 0.36);
        ctx.lineTo(S * 0.64, S * 0.42);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(S * 0.36, S * 0.56);
        for (let i = 0; i <= 6; i++) ctx.lineTo(S * (0.36 + i * 0.047), S * (i % 2 ? 0.62 : 0.56));
        ctx.lineTo(S * 0.64, S * 0.64);
        ctx.lineTo(S * 0.36, S * 0.64);
        ctx.fill();
      }
      break;
    case 'candy':
      for (const [x, col] of [[0.42, '#ff4ad0'], [0.55, '#4FE3FF']] as const) circ(ctx, S * x, S * 0.72, S * 0.03, k(col), lw * 0.5);
      break;
    case 'teeth':
      if (!sil) {
        ctx.fillStyle = '#f5f0e0';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(S * (0.32 + i * 0.06), S * 0.56);
          ctx.lineTo(S * (0.35 + i * 0.06), S * 0.63);
          ctx.lineTo(S * (0.38 + i * 0.06), S * 0.56);
          ctx.fill();
        }
      }
      break;
    case 'tutu':
      ctx.beginPath();
      ctx.ellipse(S / 2, S * 0.62, S * 0.3, S * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = k('#c0c0c8');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'key':
      ctx.beginPath();
      ctx.moveTo(S * 0.2, S * 0.5);
      ctx.lineTo(S * 0.08, S * 0.5);
      ctx.lineWidth = lw * 1.4;
      ctx.strokeStyle = k('#c9a24a');
      ctx.stroke();
      circ(ctx, S * 0.07, S * 0.5, S * 0.04, k('#c9a24a'), lw * 0.7);
      break;
    case 'snout':
      ctx.beginPath();
      ctx.ellipse(S * 0.76, S * 0.48, S * 0.07, S * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = k('#f0b0b8');
      ctx.fill();
      stroke(ctx, lw);
      if (!sil) for (const dy of [-0.015, 0.015]) circ(ctx, S * 0.77, S * (0.48 + dy), S * 0.01, '#5a2a30', 0.1);
      ctx.beginPath();
      ctx.moveTo(S * 0.44, S * 0.22);
      ctx.lineTo(S * 0.56, S * 0.22);
      ctx.lineWidth = lw * 1.5;
      ctx.strokeStyle = k('#111');
      ctx.stroke();
      break;
    case 'coin':
      circ(ctx, S * 0.5, S * 0.1, S * 0.06, k('#D9A93A'), lw);
      break;
    case 'strawhat':
      ctx.beginPath();
      ctx.ellipse(S / 2, S * 0.2, S * 0.34, S * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = k('#d8b45a');
      ctx.fill();
      stroke(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(S * 0.36, S * 0.2);
      ctx.lineTo(S * 0.42, S * 0.06);
      ctx.lineTo(S * 0.58, S * 0.06);
      ctx.lineTo(S * 0.64, S * 0.2);
      ctx.fillStyle = k('#c9a24a');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'straw':
      if (!sil) {
        ctx.strokeStyle = '#e3c66a';
        ctx.lineWidth = lw * 0.6;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(S * (0.3 + i * 0.1), S * 0.82);
          ctx.lineTo(S * (0.28 + i * 0.11), S * 0.92);
          ctx.stroke();
        }
      }
      break;
    case 'crow':
      ctx.beginPath();
      ctx.ellipse(S * 0.78, S * 0.3, S * 0.07, S * 0.05, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = k('#111');
      ctx.fill();
      stroke(ctx, lw * 0.6);
      break;
    case 'bolts':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(S / 2 + side * S * 0.27 - S * 0.04, S * 0.36, S * 0.08, S * 0.06, S * 0.01);
        ctx.fillStyle = k('#9aa0a8');
        ctx.fill();
        stroke(ctx, lw * 0.7);
      }
      if (!sil) {
        ctx.strokeStyle = '#4FE3FF';
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(S * 0.18, S * 0.36);
        ctx.lineTo(S * 0.12, S * 0.3);
        ctx.lineTo(S * 0.16, S * 0.28);
        ctx.lineTo(S * 0.1, S * 0.22);
        ctx.stroke();
      }
      break;
    case 'stitches':
      if (!sil) {
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = lw * 0.5;
        ctx.beginPath();
        ctx.moveTo(S * 0.36, S * 0.58);
        ctx.lineTo(S * 0.62, S * 0.62);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(S * (0.38 + i * 0.055), S * 0.56);
          ctx.lineTo(S * (0.39 + i * 0.055), S * 0.64);
          ctx.stroke();
        }
      }
      break;
    case 'cap':
      ctx.beginPath();
      ctx.roundRect(S * 0.3, S * 0.1, S * 0.4, S * 0.1, S * 0.03);
      ctx.fillStyle = k('#1a2a5a');
      ctx.fill();
      stroke(ctx, lw);
      ctx.beginPath();
      ctx.roundRect(S * 0.5, S * 0.18, S * 0.26, S * 0.04, S * 0.02);
      ctx.fillStyle = k('#111');
      ctx.fill();
      stroke(ctx, lw * 0.7);
      circ(ctx, S / 2, S * 0.15, S * 0.025, k('#e3d34a'), lw * 0.4);
      break;
    case 'palmeyes':
      circ(ctx, S * 0.2, S * 0.6, S * 0.06, k('#f5e6c8'), lw * 0.7);
      if (!sil) circ(ctx, S * 0.2, S * 0.6, S * 0.025, '#2f4a8a', 0.1);
      break;
    case 'mask':
      if (!sil) {
        ctx.fillStyle = '#f5f0ff';
        ctx.beginPath();
        ctx.roundRect(S * 0.42, S * 0.3, S * 0.34, S * 0.2, S * 0.08);
        ctx.fill();
        stroke(ctx, lw * 0.8);
        ctx.fillStyle = OUT;
        for (const dx of [0.5, 0.66]) {
          ctx.beginPath();
          ctx.arc(S * dx, S * 0.38, S * 0.02, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(S * 0.58, S * 0.43, S * 0.05, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.lineWidth = lw * 0.6;
        ctx.strokeStyle = OUT;
        ctx.stroke();
      }
      break;
    case 'jackbox':
      ctx.beginPath();
      ctx.rect(S * 0.3, S * 0.78, S * 0.4, S * 0.12);
      ctx.fillStyle = k('#3a5aa0');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'heads':
      for (const [x, y] of [[0.24, 0.24], [0.76, 0.24], [0.2, 0.72], [0.8, 0.72]] as const) {
        circ(ctx, S * x, S * y, S * 0.065, k('#7a5a3a'), lw * 0.8);
        if (!sil) {
          ctx.strokeStyle = '#111';
          ctx.lineWidth = lw * 0.4;
          ctx.beginPath();
          ctx.moveTo(S * (x - 0.03), S * (y + 0.02));
          ctx.lineTo(S * (x + 0.03), S * (y + 0.02));
          ctx.stroke();
        }
      }
      break;
    case 'flame':
      if (!sil) {
        ctx.beginPath();
        ctx.moveTo(S / 2, S * 0.24);
        ctx.bezierCurveTo(S * 0.66, S * 0.44, S * 0.62, S * 0.66, S / 2, S * 0.68);
        ctx.bezierCurveTo(S * 0.38, S * 0.66, S * 0.34, S * 0.44, S / 2, S * 0.24);
        ctx.fillStyle = '#fff6c0';
        ctx.fill();
        for (const dx of [-0.05, 0.05]) circ(ctx, S / 2 + dx * S, S * 0.5, S * 0.018, OUT, 0.1);
      }
      break;
    case 'bottle':
      ctx.beginPath();
      ctx.roundRect(S * 0.4, S * 0.74, S * 0.2, S * 0.14, S * 0.03);
      ctx.fillStyle = k('#7a7a80');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'orbeye':
      circ(ctx, S / 2, S * 0.5, S * 0.14, k('#f5f0ff'), lw);
      if (!sil) {
        circ(ctx, S / 2, S * 0.5, S * 0.07, '#6B3FA0', lw * 0.4);
        circ(ctx, S / 2, S * 0.5, S * 0.03, OUT, 0.1);
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath();
        ctx.arc(S * 0.4, S * 0.36, S * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'mound':
      if (!sil) {
        ctx.fillStyle = OUT;
        for (const [x, y] of [[0.42, 0.42], [0.58, 0.52], [0.46, 0.66], [0.62, 0.72]] as const) {
          ctx.beginPath();
          ctx.ellipse(S * x, S * y, S * 0.03, S * 0.045, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'gears':
      if (!sil) {
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = lw * 0.8;
        ctx.beginPath();
        ctx.arc(S * 0.24, S * 0.52, S * 0.05, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'doll':
      ctx.beginPath();
      ctx.ellipse(S * 0.2, S * 0.64, S * 0.05, S * 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = k('#c9a86a');
      ctx.fill();
      stroke(ctx, lw * 0.7);
      break;
    case 'marigold':
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        circ(ctx, S / 2 + Math.cos(ang) * S * 0.2, S * 0.24 + Math.sin(ang) * S * 0.08, S * 0.035, k('#FF9A1F'), lw * 0.4);
      }
      break;
    case 'dress':
      ctx.beginPath();
      ctx.moveTo(S * 0.3, S * 0.56);
      ctx.lineTo(S * 0.18, S * 0.86);
      ctx.lineTo(S * 0.82, S * 0.86);
      ctx.lineTo(S * 0.7, S * 0.56);
      ctx.closePath();
      ctx.fillStyle = k('#8B1A1F');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'shirt':
      if (!sil) {
        ctx.strokeStyle = '#e8dfc8';
        ctx.lineWidth = lw * 0.7;
        ctx.beginPath();
        ctx.moveTo(S * 0.36, S * 0.6);
        ctx.lineTo(S * 0.42, S * 0.7);
        ctx.lineTo(S * 0.38, S * 0.78);
        ctx.stroke();
        circ(ctx, S * 0.8, S * 0.14, S * 0.06, '#f5f0d0', lw * 0.5);
      }
      break;
    case 'fur':
      if (!sil) {
        ctx.strokeStyle = '#3a3a40';
        ctx.lineWidth = lw * 0.6;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(S * (0.26 + i * 0.09), S * 0.3);
          ctx.lineTo(S * (0.28 + i * 0.09), S * 0.22);
          ctx.stroke();
        }
      }
      break;
    case 'bandage':
      if (!sil) {
        ctx.strokeStyle = '#f5ecd2';
        ctx.lineWidth = lw * 0.9;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(S * 0.27, S * (0.32 + i * 0.12));
          ctx.lineTo(S * 0.73, S * (0.28 + i * 0.12));
          ctx.stroke();
        }
      }
      break;
    case 'goldcoins':
      for (const [x, y] of [[0.36, 0.7], [0.62, 0.64]] as const) circ(ctx, S * x, S * y, S * 0.035, k('#D9A93A'), lw * 0.5);
      break;
    case 'clock':
      circ(ctx, S / 2, S * 0.56, S * 0.12, k('#f5e6c8'), lw);
      if (!sil) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(S / 2, S * 0.56);
        ctx.lineTo(S / 2, S * 0.47);
        ctx.moveTo(S / 2, S * 0.56);
        ctx.lineTo(S * 0.57, S * 0.58);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(S * 0.22, S * 0.22);
      ctx.lineTo(S / 2, S * 0.04);
      ctx.lineTo(S * 0.78, S * 0.22);
      ctx.fillStyle = k('#5a3a1a');
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'bird':
      ctx.beginPath();
      ctx.ellipse(S * 0.5, S * 0.3, S * 0.06, S * 0.045, 0, 0, Math.PI * 2);
      ctx.fillStyle = k('#e3d34a');
      ctx.fill();
      stroke(ctx, lw * 0.6);
      break;
    case 'hand':
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.roundRect(S * (0.34 + i * 0.085), S * (0.24 - (i === 1 || i === 2 ? 0.04 : 0)), S * 0.06, S * 0.16, S * 0.03);
        ctx.fillStyle = k('#8aa07a');
        ctx.fill();
        stroke(ctx, lw * 0.6);
      }
      break;
    case 'pacifier':
      circ(ctx, S * 0.6, S * 0.56, S * 0.05, k('#8B1A1F'), lw * 0.7);
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.ellipse(S * 0.2, S * 0.7, S * 0.08, S * 0.04, 0, 0, Math.PI);
      ctx.fillStyle = k('#d8ccab');
      ctx.fill();
      stroke(ctx, lw * 0.7);
      break;
    case 'coat':
      if (!sil) {
        ctx.strokeStyle = '#c9c3b4';
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.moveTo(S / 2, S * 0.52);
        ctx.lineTo(S / 2, S * 0.82);
        ctx.stroke();
        circ(ctx, S * 0.46, S * 0.62, S * 0.015, '#8CFF5A', 0.1);
        circ(ctx, S * 0.46, S * 0.72, S * 0.015, '#8CFF5A', 0.1);
      }
      break;
    case 'scalpel':
      ctx.beginPath();
      ctx.moveTo(S * 0.86, S * 0.7);
      ctx.lineTo(S * 0.94, S * 0.5);
      ctx.lineTo(S * 0.9, S * 0.5);
      ctx.closePath();
      ctx.fillStyle = k('#d8e0e8');
      ctx.fill();
      stroke(ctx, lw * 0.6);
      break;
    case 'chefhat':
      ctx.beginPath();
      ctx.arc(S * 0.42, S * 0.14, S * 0.08, 0, Math.PI * 2);
      ctx.arc(S * 0.58, S * 0.14, S * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = k('#f5f0e8');
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(S * 0.34, S * 0.14, S * 0.32, S * 0.1, S * 0.02);
      ctx.fill();
      stroke(ctx, lw);
      break;
    case 'ladle':
      ctx.beginPath();
      ctx.moveTo(S * 0.86, S * 0.84);
      ctx.lineTo(S * 0.84, S * 0.38);
      ctx.lineWidth = lw;
      ctx.strokeStyle = k('#9aa0a8');
      ctx.stroke();
      circ(ctx, S * 0.84, S * 0.36, S * 0.05, k('#9aa0a8'), lw * 0.6);
      break;
    case 'pot':
      if (!sil) {
        ctx.fillStyle = '#4a7a2a';
        ctx.beginPath();
        ctx.ellipse(S / 2, S * 0.4, S * 0.27, S * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const x of [0.36, 0.5, 0.62]) circ(ctx, S * x, S * 0.34, S * 0.03, '#2a1a10', 0.5);
      }
      break;
    case 'candle':
      if (!sil) {
        ctx.beginPath();
        ctx.moveTo(S / 2, S * 0.14);
        ctx.quadraticCurveTo(S * 0.6, S * 0.28, S / 2, S * 0.34);
        ctx.quadraticCurveTo(S * 0.4, S * 0.28, S / 2, S * 0.14);
        ctx.fillStyle = '#FF9A1F';
        ctx.fill();
      }
      break;
    default:
      void c;
      break;
  }
}

// ---------------------------------------------------------------- caches

const figureCache = new Map<string, HTMLCanvasElement>();

export function figureCanvas(key: string, size: number, opts: { silhouette?: boolean } = {}): HTMLCanvasElement {
  const ck = `${key}|${size}|${opts.silhouette ? 1 : 0}`;
  let c = figureCache.get(ck);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  drawFigure(c.getContext('2d')!, key, size, opts);
  figureCache.set(ck, c);
  return c;
}

/** Draws a generated sprite fitted into a box, optionally as a flat silhouette. */
function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, silhouette: boolean): void {
  const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * sc;
  const dh = img.naturalHeight * sc;
  const dx = x + (w - dw) / 2;
  const dy = y + h - dh;
  if (!silhouette) {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(dw);
  tmp.height = Math.ceil(dh);
  const t = tmp.getContext('2d')!;
  t.drawImage(img, 0, 0, dw, dh);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = '#050307';
  t.fillRect(0, 0, dw, dh);
  ctx.drawImage(tmp, dx, dy);
}

/** Portrait (card art): the creature over a vignette in the character's colours. Uses the generated sprite when loaded. */
export function portraitUrl(defId: string, form?: string | null, opts: { silhouette?: boolean; size?: number } = {}): string {
  const key = lookKey(defId, form);
  const sprite = assetImage(`tokens/${key}`);
  const size = opts.size ?? 260;
  const ck = `portrait|${key}|${size}|${opts.silhouette ? 1 : 0}|${sprite ? 'gen' : 'fig'}`;
  const cached = urlCache.get(ck);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const def = CHARACTERS[defId];
  const [p1, p2] = def?.palette ?? ['#3a3a48', '#0E0A12'];
  const g = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, opts.silhouette ? '#2a2530' : p1);
  g.addColorStop(1, '#0E0A12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // damp archive grime + spores
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(232,223,200,0.05)' : 'rgba(140,255,90,0.12)';
    ctx.beginPath();
    ctx.arc(((i * 97) % size), ((i * 53) % size), (i % 4) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = p2 + '55';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, size * (0.2 + i * 0.22));
    ctx.lineTo(size, size * (0.15 + i * 0.22));
    ctx.stroke();
  }
  if (sprite) {
    // floor shadow, then the creature standing on the bottom edge
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.93, size * 0.32, size * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSprite(ctx, sprite, size * 0.06, size * 0.05, size * 0.88, size * 0.9, !!opts.silhouette);
  } else drawFigure(ctx, key, size, { silhouette: opts.silhouette });
  const url = c.toDataURL();
  urlCache.set(ck, url);
  return url;
}

const urlCache = new Map<string, string>();

/** Item art: a simple emblem in the item type colour (replaced by generated art when available). */
export function itemArtUrl(itemId: string, typeColor: string): string {
  const icon = assetImage(`items/${itemId}`);
  const ck = `item|${itemId}|${icon ? 'gen' : 'fig'}`;
  const cached = urlCache.get(ck);
  if (cached) return cached;
  const W = 200;
  const H = 150;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(W * 0.35, H * 0.3, 4, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, typeColor);
  g.addColorStop(1, '#0E0A12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(W * 0.55, H * 0.82, W * 0.22, H * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // until the generated item art has loaded the card shows only its type colour
  if (icon) drawSprite(ctx, icon, W * 0.18, H * 0.06, W * 0.64, H * 0.84, false);
  const url = c.toDataURL();
  urlCache.set(ck, url);
  return url;
}

export function summonName(defId: string): string {
  return CHARACTERS[defId]?.name ?? SUMMONS[defId]?.name ?? defId;
}
