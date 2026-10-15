// The drawn icon set: every interface symbol as a small SVG in the game's ink style (thick dark outline,
// flat colour, a pale highlight stroke, a slight hand-drawn wobble and a hard drop shadow).
// Generated icons in assets/gen/icons/<name>.webp take precedence when they exist.

const INK = '#0e0a12';
const P = {
  bone: '#e8dfc8',
  boneShade: '#b9b09a',
  spore: '#8cff5a',
  toxic: '#4fae2c',
  blood: '#c22b33',
  bloodDark: '#8b1a1f',
  orange: '#ff9a1f',
  yellow: '#ffd25a',
  cyan: '#4fe3ff',
  ghost: '#9fb7ff',
  violet: '#9a5ad6',
  violetDark: '#5b2f86',
  gold: '#e9b949',
  goldDark: '#a8781f',
  rust: '#b5562b',
  iron: '#8e8796',
  ironDark: '#4d4655',
  pink: '#ff7ad6',
  mud: '#7a5a3a',
  ice: '#bfefff',
  wood: '#8a5a38',
  night: '#2a2232',
  acid: '#c8e04a',
};

// ---------------------------------------------------------------- primitives

const S = (d: string, fill: string, w = 2.2) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const C = (cx: number, cy: number, r: number, fill: string, w = 2.2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, w = 2.2) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, sw = 2.2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const L = (d: string, color = INK, w = 2.2) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** a coloured line with an ink outline */
const T = (d: string, color: string, w = 2.6) => L(d, INK, w + 2.6) + L(d, color, w);
const D = (cx: number, cy: number, r: number, fill = INK) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
/** pale highlight stroke */
const H = (d: string, w = 1.4) => L(d, 'rgba(255,255,255,0.6)', w);

function polygon(cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

function star(cx: number, cy: number, r1: number, r2: number, n = 5): string {
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    return `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

function gearPath(cx: number, cy: number, ro: number, ri: number, teeth: number): string {
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const seq: [number, number][] = [
      [a0 - step * 0.22, ri],
      [a0 - step * 0.14, ro],
      [a0 + step * 0.14, ro],
      [a0 + step * 0.22, ri],
    ];
    for (const [a, r] of seq) pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

// ---------------------------------------------------------------- shared drawings

const drop = (fill: string, x = 16, y = 3.5, s = 1) =>
  S(`M${x} ${y}C${x} ${y} ${x - 9 * s} ${y + 11 * s} ${x - 9 * s} ${y + 17 * s}a${9 * s} ${9 * s} 0 0 0 ${18 * s} 0C${x + 9 * s} ${y + 11 * s} ${x} ${y} ${x} ${y}Z`, fill) + H(`M${x - 5 * s} ${y + 16 * s}a${4.5 * s} ${4.5 * s} 0 0 0 ${2.4 * s} ${4.6 * s}`);

const skull = (fill = P.bone, eye = INK) =>
  S('M16 3.5C9.2 3.5 5 8.3 5 14c0 3.6 1.7 6.3 4.3 7.7V26a2 2 0 0 0 2 2h9.4a2 2 0 0 0 2-2v-4.3C25.3 20.3 27 17.6 27 14c0-5.7-4.2-10.5-11-10.5Z', fill) +
  E(11.4, 14.6, 2.8, 3.2, eye, 0) +
  E(20.6, 14.6, 2.8, 3.2, eye, 0) +
  S('M16 18.4l-1.5 2.7h3Z', INK, 1) +
  L('M13.2 24.4v3.2M16 24.4v3.2M18.8 24.4v3.2', INK, 1.6) +
  H('M9 10.5c1.2-2.4 3.4-3.8 6-4.1');

const flame = (outer = P.orange, inner = P.yellow) =>
  S('M16 2.8c1.2 5 7.6 7.8 7.6 15.6a7.6 7.6 0 0 1-15.2 0c0-4.2 2.3-6.6 3.8-8.8.5 2.6.9 4.6 2.6 5.4C14.6 10.4 15 6.2 16 2.8Z', outer) +
  S('M16 15.4c.7 2.6 3.6 3.7 3.6 7a3.6 3.6 0 0 1-7.2 0c0-2.6 2.6-4 3.6-7Z', inner, 1.6);

const bolt = (fill = P.cyan) => S('M19 2.8 7.2 18.2h7.4l-2.8 11 12.6-16.2h-7.6L19 2.8Z', fill) + H('M17 6.5l-5.6 7.6', 1.2);

const eye = (iris = P.spore, open = true) =>
  open
    ? S('M2.8 16c3.7-5.8 8.2-8.7 13.2-8.7s9.5 2.9 13.2 8.7c-3.7 5.8-8.2 8.7-13.2 8.7S6.5 21.8 2.8 16Z', P.bone) + C(16, 16, 5.4, iris, 1.8) + D(16, 16, 2.4) + D(14.2, 14.2, 1.1, '#fff') + L('M5.6 16h2.2M24.2 16h2.2', P.blood, 1.1)
    : S('M2.8 15c3.7 5.4 8.2 8.1 13.2 8.1s9.5-2.7 13.2-8.1', P.bone) + L('M6 18.5 4 21.5M11 21.2l-1.2 3.4M16 22l0 3.6M21 21.2l1.2 3.4M26 18.5l2 3', INK, 1.8);

const heart = (fill = P.blood) => S('M16 27.6S3.8 20.2 3.8 11.8A6.3 6.3 0 0 1 16 9.3a6.3 6.3 0 0 1 12.2 2.5C28.2 20.2 16 27.6 16 27.6Z', fill) + H('M7.4 11.4a3.2 3.2 0 0 1 3.2-3');

const shield = (fill = P.iron, rim = P.ironDark) => S('M16 3.4 26.4 7v8.4c0 6.5-4.3 10.8-10.4 13.4C9.9 26.2 5.6 21.9 5.6 15.4V7L16 3.4Z', fill) + L('M16 7.6v17.2M9.4 10.2v5.4c0 4 2.4 6.8 6.6 8.8', rim, 1.4);

const coin = (cx = 16, cy = 16, r = 11) => C(cx, cy, r, P.gold) + `<circle cx="${cx}" cy="${cy}" r="${r * 0.68}" fill="none" stroke="${P.goldDark}" stroke-width="1.6"/>` + S(polygon(cx, cy, r * 0.36, 6), P.goldDark, 1.2) + H(`M${cx - r * 0.62} ${cy - r * 0.2}a${r * 0.64} ${r * 0.64} 0 0 1 ${r * 0.42} ${-r * 0.44}`);

const ghostShape = (fill = P.ghost) => S('M7 28V14a9 9 0 0 1 18 0v14l-3-2.6-3 2.6-3-2.6-3 2.6-3-2.6L7 28Z', fill) + E(12.6, 14.6, 2, 2.6, INK, 0) + E(19.4, 14.6, 2, 2.6, INK, 0) + E(16, 20.6, 1.6, 2.2, INK, 0) + H('M10 11a6 6 0 0 1 4-3.6');

const flask = (liquid = P.spore) => S('M12.5 3.5h7M13.6 3.8v8.2L6.4 24.6A2.6 2.6 0 0 0 8.6 28.4h14.8a2.6 2.6 0 0 0 2.2-3.8l-7.2-12.6V3.8', P.bone) + S('M9.8 19h12.4l3.4 5.8a2.4 2.4 0 0 1-2.1 3.5H8.5a2.4 2.4 0 0 1-2.1-3.5L9.8 19Z', liquid, 1.6) + D(13.5, 23.5, 1.2, 'rgba(255,255,255,0.7)') + D(18, 25.4, 0.9, 'rgba(255,255,255,0.6)');

const boot = (fill = P.mud) => S('M10 3.6h8.4v12.2l7.6 3.6c1.5.7 2.4 2 2.4 3.6v4.4H5.6v-5.2l4.4-3V3.6Z', fill) + L('M5.8 24.2h22.4', INK, 1.8) + L('M11.4 8.4h4.6M11.4 12h4.6', P.boneShade, 1.4);

const wing = (x: number, y: number, flip = false) => {
  const s = flip ? -1 : 1;
  return S(`M${x} ${y}c${s * -4} -1 ${s * -8} -4 ${s * -9} -8c${s * 2} 1 ${s * 4} 1 ${s * 5.4} 0 ${s * -1.2} 1.8 ${s * -.4} 3 ${s * 1} 3.6 ${s * -1} 1.4 ${s * -.8} 2.6 ${s * .6} 3.2Z`, P.bone, 1.8);
};

const face = (fill: string) => C(16, 16, 12, fill);

const person = (x: number, y: number, s: number, fill: string) => C(x, y - 6 * s, 3.6 * s, fill, 2) + S(`M${x - 6.4 * s} ${y + 7 * s}c0-5 2.8-8 6.4-8s6.4 3 6.4 8Z`, fill, 2);

const hex = (fill: string, r = 12.5) => S(polygon(16, 16, r, 6), fill);

const arrowUp = (x: number, y: number, color: string) => T(`M${x} ${y + 9}V${y}M${x - 4.4} ${y + 4.4}L${x} ${y}l4.4 4.4`, color, 2.6);

const cardShape = (x: number, y: number, rot: number, fill: string) => `<g transform="rotate(${rot} ${x + 7} ${y + 10})">${R(x, y, 14, 20, 2.4, fill)}${L(`M${x + 3} ${y + 4}h8M${x + 3} ${y + 16}h8`, 'rgba(14,10,18,0.45)', 1.4)}</g>`;

const trapJaws = () =>
  E(16, 23, 12, 4.2, P.ironDark) + S('M4.5 22c0-6 5-10.5 11.5-10.5S27.5 16 27.5 22', 'none', 2.4) + L('M6.4 19.2l2 1.4 1-3 1.8 2.2 1-3.2 1.8 2.6.9-3.2 1.6 3 1.2-3 1.6 2.8 1.2-3 1.4 2.8 1.6-2.4 1.4 2', P.bone, 1.4) + C(16, 23, 2.4, P.iron, 1.6);

const scroll = (fill = P.bone, seal = P.blood) => S('M8 5h14a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V8', fill) + S('M5 8a3 3 0 0 1 6 0v3H5V8Z', P.boneShade, 1.8) + L('M11.5 11h9M11.5 15h9M11.5 19h6', 'rgba(14,10,18,0.5)', 1.4) + C(20.5, 23, 3.2, seal, 1.8);

const mirror = (cracked: boolean) => E(16, 13, 8, 10, P.gold) + E(16, 13, 5.6, 7.6, '#9fc8d8', 1.4) + S('M14 23h4l1 6h-6l1-6Z', P.goldDark, 1.8) + (cracked ? L('M14 7.6l3 4.4-2.4 2.6 3.6 4.4M17 12l3-1', INK, 1.2) : H('M13 8.6a4 4 0 0 0-1.6 3.4'));

const biohazard = (fill = P.spore) => {
  const lobes = [0, 120, 240]
    .map((a) => {
      const r = (a - 90) * (Math.PI / 180);
      const x = 16 + Math.cos(r) * 7;
      const y = 17 + Math.sin(r) * 7;
      return C(+x.toFixed(2), +y.toFixed(2), 6.2, fill, 2.2);
    })
    .join('');
  return lobes + C(16, 17, 3.6, P.night, 2) + C(16, 17, 1.4, fill, 0);
};

const spiral = (color: string) => T('M16 16.4c0-1 1.6-1.2 2.2-.2.9 1.5-.6 3.4-2.4 3.4-2.6 0-4-2.6-3.2-5 1-3 4.8-4 7.6-2.6 3.4 1.8 4.2 6.4 2 9.4-2.6 3.6-8 4-11.2 1.2C7.4 19.8 7.4 13.4 11 10.2', color, 2.4);

const waves = (color: string) => T('M9 10c2.4 3.6 2.4 8.4 0 12M14.5 7c3.8 5.4 3.8 12.6 0 18M20 4c5 7.2 5 16.8 0 24', color, 2.4) + C(5.4, 16, 2.4, color, 2);

// ---------------------------------------------------------------- the set

export const ICONS: Record<string, string> = {
  // ---- statuses
  'status/poison': drop(P.spore) + D(13.2, 20, 1.6) + D(18.8, 20, 1.6) + L('M13.6 24.4c1.6 1 3.2 1 4.8 0', INK, 1.4),
  'status/bleeding': drop(P.blood, 10, 3, 0.62) + drop(P.blood, 22, 6, 0.62) + drop(P.bloodDark, 16, 13, 0.62),
  'status/burn': flame(),
  'status/slow':
    S('M4 25h21c2 0 3.2-1.4 3.2-3.2V18', P.boneShade) + C(14, 17, 7.6, P.rust) + T('M14 17.4c0-1 1.4-1.2 1.8-.2.6 1.4-.8 2.8-2.2 2.6-2-.2-2.8-2.4-2-4 1.2-2.4 4.6-2.6 6.2-.6', P.bone, 1.4) + L('M26.2 18 27.4 12M28.4 18.8l2.2-5', INK, 1.6) + D(27.4, 11.6, 1.2) + D(30.6, 13.4, 1.2),
  'status/haste': boot(P.mud) + wing(10, 16, false),
  'status/blind': eye(P.ghost) + T('M4 26 28 6', P.bone, 3.2),
  'status/shock': bolt(P.cyan),
  'status/corrosion': flask(P.acid) + drop(P.acid, 25, 1.5, 0.3),
  'status/fear':
    S('M8 27V14a8 8 0 0 1 16 0v13l-2.7-2.2-2.6 2.2-2.7-2.2-2.7 2.2-2.6-2.2L8 27Z', P.bone) + E(12.6, 13.4, 2.2, 3, INK, 0) + E(19.4, 13.4, 2.2, 3, INK, 0) + E(16, 21, 3, 4, P.bloodDark, 1.6) + L('M10.4 9.4l3.4 1.6M21.6 9.4l-3.4 1.6', INK, 1.4),
  'status/marked': C(16, 16, 10.5, 'none', 2.6) + `<circle cx="16" cy="16" r="10.5" fill="none" stroke="${P.blood}" stroke-width="1.4"/>` + T('M16 2.5v8M16 21.5v8M2.5 16h8M21.5 16h8', P.blood, 2) + C(16, 16, 2.4, P.blood, 1.6),
  'status/vulnerable': heart(P.blood) + L('M16 9.6l-2.4 4.4 3.2 3-2.6 4.4 1.8 2.6', INK, 1.8) + L('M16 9.6l-2.4 4.4 3.2 3-2.6 4.4 1.8 2.6', P.bone, 0.8),
  'status/silence': face(P.bone) + E(11.6, 13, 1.6, 2, INK, 0) + E(20.4, 13, 1.6, 2, INK, 0) + R(9, 18.4, 14, 4.6, 2.2, P.blood, 1.8) + L('M11.5 19v3.4M14 19v3.4M16.5 19v3.4M19 19v3.4M21.5 19v3.4', P.bone, 1),
  'status/infection':
    L('M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4M7.2 7.2l2.8 2.8M22 22l2.8 2.8M24.8 7.2 22 10M10 22l-2.8 2.8', INK, 2.6) + D(16, 3.5, 2, P.spore) + D(16, 28.5, 2, P.spore) + D(3.5, 16, 2, P.spore) + D(28.5, 16, 2, P.spore) + C(16, 16, 8.6, P.spore) + D(13, 14, 1.8, P.toxic) + D(18.6, 18, 2.2, P.toxic) + D(18.4, 12.6, 1.2, P.toxic),
  'status/corruption':
    S('M6 22c-2.4-4.4-1-10 3-12.6 2-6 11.6-7.4 15.2-1.4 4.2 1.6 5.6 7 3.4 11-1 4.6-5.2 7.6-10.6 7.4-4.8-.2-8.6-1.6-11-4.4Z', P.violet) + E(16, 16, 5, 3.6, P.bone, 1.6) + C(16, 16, 2.2, P.blood, 1.2) + D(16, 16, 0.9) + D(8, 26.5, 1.6, P.violetDark) + D(25, 27.5, 1.2, P.violetDark),
  'status/echo': waves(P.violet),
  'status/spotlight': S('M11 3.5h10l-2 5h-6Z', P.iron) + S('M13 8.5h6l9 19.5H4L13 8.5Z', 'rgba(255,240,170,0.85)', 1.8) + E(16, 28, 12, 2, P.yellow, 1.6),
  'status/depressed':
    S('M8.6 17.4a5 5 0 0 1 .6-9.9 7.2 7.2 0 0 1 13.4 1.8 4.2 4.2 0 0 1 1.2 8.1H8.6Z', P.iron) + L('M12.6 12.6l1.6 1M19.4 12.6l-1.6 1M13.6 16c1.4-1 3.4-1 4.8 0', INK, 1.4) + L('M9 21.4l-1.2 3.4M15 21.4l-1.2 3.4M21 21.4l-1.2 3.4M12 26l-.8 2M18 26l-.8 2', P.ghost, 1.8),
  'status/egg': S('M16 3.5c5.6 0 9.6 8 9.6 14.2 0 6-4.2 10.4-9.6 10.4S6.4 23.7 6.4 17.7C6.4 11.5 10.4 3.5 16 3.5Z', P.bone) + L('M7 16.4l3.4 2 2.4-3 3 3.4 2.8-3.2 2.6 3 2.8-2.2', INK, 1.6) + D(14, 22.6, 1.6, P.spore) + D(18.6, 23.6, 1.2, P.spore) + H('M10.4 10.2a7 7 0 0 1 2.8-3.6'),
  'status/leeched': S('M5 22c0-3 2-5 4.6-5s3.4 2.4 6.4 2.4 4-6.4 8.4-6.4c2.2 0 3.6 1.4 3.6 3.4 0 2.6-2.6 3.4-4 6.2-1.6 3.2-4 5.4-9.4 5.4-5.4 0-9.6-2-9.6-6Z', P.bloodDark) + L('M9 21.6l.8 3M13 22l.4 3.2M17 21.6l0 3.2M21 20.4l-.4 3', 'rgba(255,255,255,0.35)', 1.2) + C(25, 15.4, 2.4, P.blood, 1.6) + D(25, 15.4, 1),
  'status/patient': R(7, 5, 18, 23, 2.4, P.bone) + R(11.5, 3, 9, 4.4, 1.6, P.iron, 1.8) + L('M16 11.6v8M12 15.6h8', P.blood, 2.8) + L('M10.4 23.6h11.2', 'rgba(14,10,18,0.45)', 1.4),
  'status/jinx': mirror(true),
  'status/gilded': S('M4 22.4 8.4 13h15.2L28 22.4H4Z', P.gold) + S('M4 22.4h24v4.4H4Z', P.goldDark) + H('M10 15.6h7'),
  'status/garland':
    [0, 72, 144, 216, 288].map((a) => {
      const r = ((a - 90) * Math.PI) / 180;
      return C(+(16 + Math.cos(r) * 6.4).toFixed(2), +(14 + Math.sin(r) * 6.4).toFixed(2), 4.4, P.bone, 1.8);
    }).join('') + C(16, 14, 3.4, P.yellow, 1.8) + L('M16 21v8', P.toxic, 2.2),
  'status/starving_mark': E(16, 18, 12, 9, P.bone) + E(16, 18, 7.4, 5.4, P.boneShade, 1.4) + L('M7.4 4v8M5.4 4v5.4c0 1.4 1 2.4 2 2.6M9.4 4v5.4c0 1.4-1 2.4-2 2.6', INK, 1.6) + T('M23 18.4l3.6-3.6', P.blood, 1.6),
  'status/snared': trapJaws(),
  'status/dazed': E(16, 19, 11, 4.4, 'none', 2) + `<ellipse cx="16" cy="19" rx="11" ry="4.4" fill="none" stroke="${P.yellow}" stroke-width="1"/>` + S(star(7, 17, 4.4, 1.9), P.yellow, 1.6) + S(star(20, 23.4, 4, 1.7), P.yellow, 1.6) + S(star(25, 14, 3.6, 1.5), P.yellow, 1.6),
  'status/mired': E(16, 23, 13, 5, P.mud) + E(16, 22, 8.6, 2.6, '#5a4026', 1.4) + C(10, 14, 2.6, P.mud, 1.6) + C(20, 11, 3.2, P.mud, 1.6) + C(15, 7, 1.8, P.mud, 1.4),
  'status/soaked': drop('#4f9fff', 9.5, 4, 0.55) + drop('#4f9fff', 22, 2, 0.55) + drop('#7fc0ff', 16, 13, 0.7),
  'status/frozen': S('M6 11 16 5l10 6v11l-10 6-10-6V11Z', P.ice) + S('M6 11l10 6 10-6M16 17v11', 'none', 1.6) + H('M9 12.6l5 3M8.6 15.4v5', 1.2) + L('M20 8.2l2.4 1.4M23.4 15.4v3', 'rgba(255,255,255,0.8)', 1.2),
  'status/well_fed': S('M3.6 15h24.8c0 7-5.4 12.6-12.4 12.6S3.6 22 3.6 15Z', P.wood) + E(16, 15, 12.4, 3.4, P.orange, 2) + D(11, 14.6, 1.6, P.spore) + D(17, 15.4, 1.4, P.blood) + D(21, 14.2, 1.2, P.bone) + T('M12 10c-1-2 1-3 0-5M17 10c-1-2 1-3 0-5M22 10c-1-2 1-3 0-5', P.boneShade, 1.4),
  'status/exhausted': face(P.boneShade) + L('M9.6 14.4h4.4M18 14.4h4.4M12.4 21.4c2.2-1.4 5-1.4 7.2 0', INK, 1.8) + drop(P.cyan, 25.5, 4, 0.36) + L('M22 3.5h4l-4 4h4', INK, 1.4),
  'status/empowered': S('M9 28v-6.4L6.4 17V11.6a2.4 2.4 0 0 1 4.8 0V9.6a2.4 2.4 0 0 1 4.8 0V9a2.4 2.4 0 0 1 4.8 0v1.4a2.4 2.4 0 0 1 4.8 0v7.4c0 4-2.4 6-4.8 7.2V28H9Z', P.orange) + L('M11.2 11.6v4M16 9.6v5.4M20.8 10.4v4.8', INK, 1.4) + T('M3 6.5l2.6 2M7.4 2.6l1 3.2M24 3l-1 3.2M28.6 6.5l-2.6 2', P.yellow, 1.4),
  'status/weakened': T('M16 4v18.4', P.ghost, 3) + T('M9.4 16.4 16 23l6.6-6.6', P.ghost, 3) + L('M12.4 10.4l7.2 2.4', INK, 2) + E(16, 28, 7, 1.6, 'rgba(14,10,18,0.4)', 0),
  'status/fortified': shield(P.iron) + T('M16 11.4v9.6M11.2 16.2h9.6', P.spore, 2.6),
  'status/brittle': R(4, 9, 24, 15, 1.6, P.rust) + L('M4 16.5h24M12 9v7.5M20 16.5V24', INK, 1.6) + T('M17 9l-1.6 4 2.4 2.4-2 3.6 1.4 2.4', P.bone, 1.2),
  'status/regeneration': heart(P.toxic) + T('M16 11.4v9M11.6 15.9h8.8', P.bone, 2.2),
  'status/hidden': eye(P.ghost, false),
  'status/entranced': C(16, 16, 12, P.night) + spiral(P.pink),
  'status/hex': S(polygon(16, 14, 11.5, 6), P.violetDark) + S(star(16, 14, 7, 3, 5), P.pink, 1.6) + T('M16 25.5v4', P.pink, 1.6),
  'status/overclock': arrowUp(11, 12, P.orange) + arrowUp(21, 12, P.orange) + arrowUp(16, 3.5, P.yellow),
  'status/mirror_charm': mirror(false),
  'status/blood_pact': scroll(P.bone, P.blood),
  'status/phoenix': S('M24.8 4C17 5.4 10.4 12 8.2 20.6L6.6 27.4l2-1 1.6-5.4C17.6 19.6 25 12.6 24.8 4Z', P.orange) + L('M23 7.4 9.6 23.4', INK, 1.4) + L('M13.4 15.6l3 1M15.4 12.6l3.6.8M18 9.8l3.4.4', P.yellow, 1.2),

  // ---- damage tags
  'tag/blunt': S('M5 9.4 15.6 4l3.2 6.2-10.6 5.4L5 9.4Z', P.iron) + T('M14 12.4 22.4 28', P.wood, 3) + H('M7.4 9.2l6.6-3.4'),
  'tag/slash': S('M26.6 3.6 25.4 9.6 12.4 22.6 9.4 19.6 22.4 6.6l4.2-3Z', P.bone) + T('M7 17.6l7.4 7.4', P.ironDark, 2.6) + T('M10.4 23.4 5.2 28.6', P.wood, 2.8) + H('M23.6 6.4 12 18'),
  'tag/pierce': T('M5 27 23 9', P.wood, 2.4) + S('M27.6 4.4 25.8 13 19 6.2l8.6-1.8Z', P.iron, 2) + L('M5 27l-1.4-4M5 27l4 1.4M8.4 23.6 7 19.6M8.4 23.6l4 1.4', P.bone, 1.6),
  'tag/fire': flame(),
  'tag/electric': bolt(P.cyan),
  'tag/toxic': biohazard(P.spore),
  'tag/acid': drop(P.acid) + L('M12 26.6c1.4.8 3 1 4.6.6', 'rgba(14,10,18,0.4)', 1.2) + D(19.6, 17.6, 1.4, 'rgba(255,255,255,0.7)'),
  'tag/sonic': waves(P.violet),
  'tag/psychic': C(16, 16, 12, P.night) + spiral(P.pink),
  'tag/soul': ghostShape(P.ghost),
  'tag/radiant': S(star(16, 16, 13, 6.4, 8), P.yellow) + C(16, 16, 5, '#fff6c8', 1.8),

  // ---- tiers
  'tier/swarm': C(9, 12, 4.6, P.boneShade, 1.8) + C(23, 12, 4.6, P.boneShade, 1.8) + C(16, 21.6, 5.6, P.bone, 1.8) + D(7.6, 11.6, 1) + D(10.4, 11.6, 1) + D(21.6, 11.6, 1) + D(24.4, 11.6, 1) + D(14.2, 21, 1.3) + D(17.8, 21, 1.3),
  'tier/standard': skull(P.bone),
  'tier/elite': S('M5 23.4 3.4 9.4l6.6 5.4L16 5.4l6 9.4 6.6-5.4L27 23.4H5Z', P.gold) + R(5, 23.4, 22, 4.6, 1.2, P.goldDark, 2) + C(16, 17.6, 2, P.blood, 1.4) + H('M8 13.6l1.6 6'),
  'tier/boss': S('M7.4 9.6 3.4 2.6l8 4.4M24.6 9.6l4-7-8 4.4', P.bone, 2) + skull(P.boneShade, P.blood),
  'tier/summon': C(16, 16, 11, P.night) + S(star(16, 16, 9.6, 3, 4), P.ghost, 1.8) + D(16, 16, 1.6, '#fff'),
  'tier/object': R(5, 7, 22, 20, 2, P.wood) + L('M5 13.6h22M5 20.4h22M11 7v20M21 7v20', INK, 1.4),

  // ---- game modes
  'mode/contamination': biohazard(P.spore),
  'mode/elimination': T('M5 27 27 5M5 5l22 22', P.bone, 3) + skull(P.bone),
  'mode/domination': L('M8 29V3.6', INK, 3.6) + L('M8 29V3.6', P.iron, 1.6) + S('M9 4.4h17l-4 5.6 4 5.6H9V4.4Z', P.blood) + E(8, 29, 5, 1.6, P.ironDark, 1.6),
  'mode/research': flask(P.spore),
  'mode/escape': S('M7 28V9a9 6 0 0 1 18 0v19H7Z', P.night) + S('M10 28V10.6a6 4 0 0 1 12 0V28H10Z', P.spore, 1.8) + D(19.4, 19.4, 1.2) + L('M4 28h24', INK, 2.4),
  'mode/anomaly': S('M16 3 29.4 27.4H2.6L16 3Z', P.violetDark) + S('M8.6 19.6c2.2-3.4 4.6-5 7.4-5s5.2 1.6 7.4 5c-2.2 3.4-4.6 5-7.4 5s-5.2-1.6-7.4-5Z', P.bone, 1.8) + C(16, 19.6, 3, P.blood, 1.4) + D(16, 19.6, 1.2),

  // ---- interface
  'ui/gold': E(16, 23, 11, 4.6, P.goldDark) + E(16, 19, 11, 4.6, P.gold) + E(16, 13.4, 11, 4.6, P.goldDark) + E(16, 9.4, 11, 4.6, P.gold) + E(16, 9.4, 6, 2.2, 'none', 1.2) + H('M8.4 8.6a6 3 0 0 1 4-2'),
  'ui/coin': coin(),
  'ui/trophy': S('M9 4.4h14v6c0 4.4-3 7.8-7 7.8s-7-3.4-7-7.8v-6Z', P.gold) + L('M9 7.4H5.4c0 3.6 1.6 5.8 4.2 6.2M23 7.4h3.6c0 3.6-1.6 5.8-4.2 6.2', INK, 2) + R(14, 18, 4, 4.4, 0.6, P.goldDark, 1.8) + S('M10 22.4h12l1.2 5H8.8l1.2-5Z', P.wood) + S(star(16, 10.4, 3.6, 1.6), P.goldDark, 1) + H('M11.4 7v3.6'),
  'ui/ap': C(16, 16, 12.4, '#173a44') + bolt(P.cyan).replace(/2\.2"/, '2"'),
  'ui/vp': hex(P.gold) + S(star(16, 16.4, 7, 3), P.goldDark, 1.6) + H('M8.6 11.6l4.6-3'),
  'ui/dice': R(5, 5, 22, 22, 5, P.bone) + D(10.6, 10.6, 2.2) + D(16, 16, 2.2, P.blood) + D(21.4, 21.4, 2.2) + D(21.4, 10.6, 2.2) + D(10.6, 21.4, 2.2) + H('M8 8.4c.6-1 1.6-1.4 2.6-1.4'),
  'ui/lock': L('M10.4 14v-3.4a5.6 5.6 0 0 1 11.2 0V14', INK, 4.6) + L('M10.4 14v-3.4a5.6 5.6 0 0 1 11.2 0V14', P.iron, 2) + R(6.4, 13.6, 19.2, 14.4, 3, P.gold) + C(16, 19.4, 2.2, INK, 0) + L('M16 20v4', INK, 2.2),
  'ui/unlock': L('M10.4 14V9.6a5.6 5.6 0 0 1 11-1.6', INK, 4.6) + L('M10.4 14V9.6a5.6 5.6 0 0 1 11-1.6', P.iron, 2) + R(6.4, 13.6, 19.2, 14.4, 3, P.spore) + C(16, 19.4, 2.2, INK, 0) + L('M16 20v4', INK, 2.2),
  'ui/journal': S('M7 4h17a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H7V4Z', P.bloodDark) + R(4.6, 4, 4.4, 24, 1.4, P.wood, 2) + R(12, 9, 10, 6, 1, P.bone, 1.6) + S('M19 28v3.4l1.8-1.4 1.8 1.4V28', P.gold, 1.4),
  'ui/crown': S('M5 23.4 3.4 9.4l6.6 5.4L16 5.4l6 9.4 6.6-5.4L27 23.4H5Z', P.gold) + R(5, 23.4, 22, 4.6, 1.2, P.goldDark, 2) + C(16, 17.6, 2, P.blood, 1.4) + C(9.6, 19.4, 1.4, P.cyan, 1.2) + C(22.4, 19.4, 1.4, P.spore, 1.2),
  'ui/skull': skull(P.bone),
  'ui/hourglass': L('M7.4 4h17.2M7.4 28h17.2', INK, 3.6) + L('M7.4 4h17.2M7.4 28h17.2', P.wood, 1.8) + S('M10 5.4c0 6 6 7.6 6 10.6s-6 4.6-6 10.6h12c0-6-6-7.6-6-10.6s6-4.6 6-10.6H10Z', 'rgba(191,239,255,0.55)') + S('M12.4 25.6c.9-2.6 2.6-3.6 3.6-4 1 .4 2.7 1.4 3.6 4h-7.2Z', P.gold, 1.2) + S('M13 9h6c-.6 1.8-1.8 2.8-3 3.4-1.2-.6-2.4-1.6-3-3.4Z', P.gold, 1.2),
  'ui/anchor': C(16, 6.4, 2.8, 'none', 2.6) + T('M16 9.2V27.4M10.6 13h10.8', P.iron, 2.4) + T('M5.6 18.6c0 5.2 4.6 8.8 10.4 8.8s10.4-3.6 10.4-8.8', P.iron, 2.4) + S('M3.4 20.4l2.2-4 2.2 4Z', P.iron, 1.6) + S('M24.2 20.4l2.2-4 2.2 4Z', P.iron, 1.6),
  'ui/coffin': S('M12 3.4h8l5.2 7-3 18.6h-12.4l-3-18.6 5.2-7Z', P.wood) + T('M16 10v10M12.4 13.6h7.2', P.bone, 1.8),
  'ui/tombstone': S('M8 28V13.4a8 8 0 0 1 16 0V28H8Z', P.iron) + L('M16 10.6v9M12.4 13.8h7.2', P.ironDark, 2.2) + S('M4 28h24v2.6H4Z', P.mud, 1.8) + H('M10.6 12.6a5.4 5.4 0 0 1 3-4'),
  'ui/footprints': S('M10.6 6.4c2.6 0 3.8 2.6 3.6 6-.2 3-1.2 4.6-3.2 4.6s-3.2-1.6-3.4-4.6c-.2-3.4 .8-6 3-6Z', P.boneShade, 1.8) + E(11, 21, 2.6, 3.2, P.boneShade, 1.8) + S('M21.4 12.4c2.4 0 3.4 2.4 3.2 5.6-.2 2.8-1.2 4.4-3 4.4s-3-1.6-3.2-4.4c-.2-3.2.8-5.6 3-5.6Z', P.boneShade, 1.8) + E(21.6, 26.4, 2.4, 3, P.boneShade, 1.8),
  'ui/claw': T('M7.6 4.6c3.2 6.4 4 14.4 1.6 22.6M15 3.4c3.4 7 4.2 15.6 1.6 25M22.4 4.6c3.2 6.4 4 14.4 1.6 22.6', P.blood, 2.6),
  'ui/gear': S(gearPath(16, 16, 13, 10, 8), P.iron) + C(16, 16, 4.4, P.night, 2.2) + H('M9.4 11a7.6 7.6 0 0 1 4-3.6'),
  'ui/settings': S(gearPath(16, 16, 13, 10, 8), P.boneShade) + C(16, 16, 4.4, P.night, 2.2),
  'ui/warning': S('M16 3.6 29.4 27.4H2.6L16 3.6Z', P.orange) + L('M16 11.6v7.6', INK, 3) + D(16, 23.4, 1.9),
  'ui/eye': eye(P.spore),
  'ui/heart': heart(P.blood),
  'ui/sword': S('M26.6 3.6 25.4 9.6 12.4 22.6 9.4 19.6 22.4 6.6l4.2-3Z', P.bone) + T('M7 17.6l7.4 7.4', P.gold, 2.6) + T('M10.4 23.4 5.2 28.6', P.wood, 2.8) + H('M23.6 6.4 12 18'),
  'ui/shield': shield(P.iron),
  'ui/rune': hex(P.ironDark) + T('M12 9.4l4 4 4-4M16 13.4v9.2M12 18.4h8', P.spore, 1.8),
  'ui/boot': boot(P.mud),
  'ui/envelope': R(4, 8, 24, 17, 2, P.bone) + L('M4.6 9.2 16 18.4l11.4-9.2', INK, 2) + C(16, 18, 2.6, P.blood, 1.4),
  'ui/bell': S('M16 3.6a2 2 0 0 1 2 2v.6c4 1 6.4 4.6 6.4 9.4v5l2.6 3H5l2.6-3v-5c0-4.8 2.4-8.4 6.4-9.4v-.6a2 2 0 0 1 2-2Z', P.gold) + C(16, 26.4, 2.4, P.goldDark, 1.8) + H('M11.4 11.6a5 5 0 0 1 2.4-3'),
  'ui/calendar': R(5, 7, 22, 20, 2.4, P.bone) + S('M5 9.4a2.4 2.4 0 0 1 2.4-2.4h17.2A2.4 2.4 0 0 1 27 9.4V13H5V9.4Z', P.blood) + T('M11 4.4v5M21 4.4v5', P.iron, 1.6) + D(10.4, 17.4, 1.4) + D(16, 17.4, 1.4) + D(21.6, 17.4, 1.4) + D(10.4, 22.4, 1.4) + D(16, 22.4, 1.4, P.blood),
  'ui/medal': S('M9.6 3h4.6l3 9h-4.6l-3-9Z', P.blood, 1.8) + S('M22.4 3h-4.6l-3 9h4.6l3-9Z', P.ghost, 1.8) + coin(16, 20, 8),
  'ui/replay': T('M25 16a9 9 0 1 1-2.6-6.4', P.spore, 2.6) + S('M26.4 4.4v7.4h-7.4l7.4-7.4Z', P.spore, 1.8) + S('M13.6 12v8l6.4-4-6.4-4Z', P.bone, 1.6),
  'ui/team': person(9, 17, 0.8, P.ghost) + person(23, 17, 0.8, P.ghost) + person(16, 19, 1, P.bone),
  'ui/friends': person(11, 18, 0.95, P.ghost) + person(21, 18, 0.95, P.spore),
  'ui/person': person(16, 18, 1.15, P.bone),
  'ui/gift': R(5, 13.4, 22, 14.6, 1.6, P.wood) + R(4, 9.4, 24, 5, 1.4, P.rust, 2) + T('M16 9.6V28', P.blood, 2.4) + S('M16 9.4c-2-4.4-7-5.6-7.4-2.6-.4 2.4 3.8 2.8 7.4 2.6Zm0 0c2-4.4 7-5.6 7.4-2.6.4 2.4-3.8 2.8-7.4 2.6Z', P.blood, 1.8),
  'ui/target': C(16, 16, 12, P.bone) + C(16, 16, 7.8, P.blood) + C(16, 16, 3.6, P.bone),
  'ui/online': T('M9.6 22.4a9 9 0 0 1 12.8 0M5.6 17.6a14.6 14.6 0 0 1 20.8 0M1.8 12.8a20 20 0 0 1 28.4 0', P.spore, 2.2) + C(16, 26.4, 2.6, P.spore, 1.8),
  'ui/cards': cardShape(4, 6, -12, P.boneShade) + cardShape(13, 5, 10, P.bone) + S(star(20, 15.6, 3.6, 1.6), P.blood, 1.2),
  'ui/pouch': S('M11.6 10c-4.2 3-6.6 8-6.6 12.2 0 4 4.2 6 11 6s11-2 11-6c0-4.2-2.4-9.2-6.6-12.2H11.6Z', P.mud) + S('M12.4 10 10.4 4.6h11.2L19.6 10', P.wood, 1.8) + T('M11 10.4h10', P.gold, 1.6) + C(16, 20, 2.6, P.gold, 1.4),
  'ui/book': S('M5.6 6.4c3.2-1.6 7.4-1.6 10.4.6 3-2.2 7.2-2.2 10.4-.6v20c-3.2-1.6-7.4-1.6-10.4.6-3-2.2-7.2-2.2-10.4-.6v-20Z', P.bone) + L('M16 7v20', INK, 1.8) + L('M8.4 11.4c1.8-.6 3.6-.6 5 0M8.4 15.4c1.8-.6 3.6-.6 5 0M18.6 11.4c1.4-.6 3.2-.6 5 0', 'rgba(14,10,18,0.45)', 1.2),
  'ui/trap': trapJaws(),
  'ui/flame': flame(),
  'ui/close': T('M8 8l16 16M24 8 8 24', P.blood, 3),
  'ui/check': T('M6 16.6l6.4 6.4L26 9', P.spore, 3.2),
  'ui/plus': T('M16 6v20M6 16h20', P.spore, 3.2),
  'ui/star': S(star(16, 16.6, 13, 5.6), P.gold) + H('M11.6 13.4 14 8.6'),
  'ui/play': S('M10 6v20l16-10L10 6Z', P.spore),
  'ui/pause': R(8, 6, 6, 20, 1.4, P.bone) + R(18, 6, 6, 20, 1.4, P.bone),
  'ui/step_back': S('M22 6v20L8 16l14-10Z', P.bone),
  'ui/first': S('M26 6v20L13 16 26 6Z', P.bone) + R(6, 6, 4.6, 20, 1.2, P.bone),
  'ui/scales': T('M16 5v20M7 9.4h18', P.gold, 2) + S('M3 17.6h8l-4-8Zm18 0h8l-4-8Z', 'none', 1.6) + S('M3 17.6a4 3 0 0 0 8 0Zm18 0a4 3 0 0 0 8 0Z', P.gold, 1.8) + R(10, 25, 12, 3.4, 1, P.goldDark, 1.8),
  'ui/question': C(16, 16, 12.4, P.violet) + T('M11.6 12.4a4.4 4.4 0 1 1 6.4 3.8c-1.4.8-2 1.6-2 3.2', P.bone, 2.6) + D(16, 23.6, 1.9, P.bone),
  'ui/pawn': C(16, 8.4, 4.4, P.bone) + S('M12 13.4h8l-1.4 2.6c1.6 3 2.4 6.6 2.6 9.2H10.8c.2-2.6 1-6.2 2.6-9.2L12 13.4Z', P.bone) + R(7.6, 25.2, 16.8, 3.6, 1.4, P.boneShade, 2),
  'ui/flag': L('M8 29V3.6', INK, 3.6) + L('M8 29V3.6', P.iron, 1.6) + S('M9 4.4h17l-4 5.6 4 5.6H9V4.4Z', P.blood),
  'ui/flask': flask(P.spore),
  'ui/terminal': R(4, 5, 24, 17, 2, P.ironDark) + R(7, 8, 18, 11, 1, '#173a44', 1.6) + L('M10 12l2.4 2-2.4 2M14 16h4', P.spore, 1.6) + S('M12 22h8l1.4 5H10.6L12 22Z', P.iron, 1.8),
  'ui/door': S('M7 28V9a9 6 0 0 1 18 0v19H7Z', P.night) + S('M10 28V10.6a6 4 0 0 1 12 0V28H10Z', P.wood, 1.8) + D(19.4, 19.4, 1.2, P.gold) + L('M4 28h24', INK, 2.4),
  'ui/chest': R(4.6, 13.4, 22.8, 14.6, 1.6, P.wood) + S('M4.6 13.6v-2.6a6 6 0 0 1 6-6h10.8a6 6 0 0 1 6 6v2.6H4.6Z', P.rust) + L('M10 5.6v22.2M22 5.6v22.2', P.ironDark, 1.8) + R(13.4, 12, 5.2, 6, 1, P.gold, 1.6),
  'ui/mood_happy': face(P.yellow) + E(11.6, 13, 1.6, 2.2, INK, 0) + E(20.4, 13, 1.6, 2.2, INK, 0) + S('M9.6 18c1.6 3.6 4 5 6.4 5s4.8-1.4 6.4-5H9.6Z', P.bloodDark, 1.6),
  'mood/happy': face(P.yellow) + E(11.6, 13, 1.6, 2.2, INK, 0) + E(20.4, 13, 1.6, 2.2, INK, 0) + S('M9.6 18c1.6 3.6 4 5 6.4 5s4.8-1.4 6.4-5H9.6Z', P.bloodDark, 1.6),
  'mood/sad': face(P.ghost) + E(11.6, 13.6, 1.6, 2.2, INK, 0) + E(20.4, 13.6, 1.6, 2.2, INK, 0) + L('M11 22.4c3-2.6 7-2.6 10 0', INK, 2) + drop(P.cyan, 9, 15.6, 0.3),
  'mood/angry': face(P.orange) + L('M8.6 10.4l5 2.4M23.4 10.4l-5 2.4', INK, 2.2) + D(11.8, 14.6, 1.6) + D(20.2, 14.6, 1.6) + L('M11 22c3-2 7-2 10 0', INK, 2.2),
  'ui/featured': S(star(16, 16.6, 13, 5.6), P.gold) + H('M11.6 13.4 14 8.6'),
  'ui/podium_2': coin(16, 16, 11).replaceAll(P.gold, '#cfd6e0').replaceAll(P.goldDark, '#7d8796'),
  'ui/podium_3': coin(16, 16, 11).replaceAll(P.gold, '#d08a4a').replaceAll(P.goldDark, '#8a5226'),
  'ui/win': S(polygon(16, 16, 12.5, 6), P.spore) + T('M10 16.4l4 4 8-8.4', P.night, 2.6),
  'ui/loss': skull(P.boneShade),
};

// aliases: the same drawing under the names other screens use
const ALIAS: Record<string, string> = {
  'ui/medal_gold': 'ui/medal',
  'status/well-fed': 'status/well_fed',
};
for (const [a, b] of Object.entries(ALIAS)) ICONS[a] = ICONS[b]!;

const WOBBLE = `<filter id="w" x="-10%" y="-10%" width="120%" height="125%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="1" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow dx="0.5" dy="1.3" stdDeviation="0" flood-color="#000" flood-opacity="0.55"/></filter>`;

const cache = new Map<string, string>();

/** A data: URL of the drawn icon (or null when the name is unknown). */
export function svgIconUrl(name: string): string | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const body = ICONS[name];
  if (!body) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 34 34"><defs>${WOBBLE}</defs><g>${body}</g></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(name, url);
  return url;
}

export function hasIcon(name: string): boolean {
  return name in ICONS;
}
