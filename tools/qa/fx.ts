// Attack effects by damage type: plays charge → flight → impact for every tag on a real board and saves a
// strip of frames per tag, so the look can be checked without waiting for a bot to attack.
//   node tools/qa/fx.ts [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/qa/out/fx';
mkdirSync(out, { recursive: true });

const TAGS: [string, string, string][] = [
  ['fire', '#FF9A1F', 'projectile'],
  ['electric', '#4FE3FF', 'beam'],
  ['toxic', '#8CFF5A', 'projectile'],
  ['acid', '#c8e04a', 'projectile'],
  ['sonic', '#b48cff', 'projectile'],
  ['psychic', '#ff7ad6', 'projectile'],
  ['soul', '#9FB7FF', 'projectile'],
  ['radiant', '#fff6a0', 'beam'],
  ['pierce', '#9FB7FF', 'projectile'],
  ['blunt', '#c9c3b4', 'projectile'],
  ['slash', '#e8dfc8', 'projectile'],
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.addInitScript(() => {
  localStorage.setItem('contaminant.profile.v1', JSON.stringify({ name: 'Tester', settings: { lang: 'en', planningSeconds: 0, animSpeed: 1 }, onboarded: true, trainingDone: true }));
});
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(4600);
await page.getByRole('button', { name: 'Play vs Bot' }).click();
await page.waitForTimeout(3000);
// zoom in so the effects show at a playing size
await page.evaluate(() => {
  const b = (window as unknown as { __board: { zoomAt?: (x: number, y: number, f: number) => void } }).__board;
  b.zoomAt?.(640, 400, 1.6);
});

// software rendering makes screenshots slow, so time is frozen: every effect runs SLOW times slower and each
// frame is taken at a fixed point of the sequence (charge, early and late flight, early and late impact)
const SLOW = 1000;
const SAMPLES = [380, 950, 1380, 1680, 1980];
for (const [tag, color, kind] of TAGS) {
  for (const [i, ms] of SAMPLES.entries()) {
    const at = await page.evaluate(
      ([tag, color, kind, ms, SLOW]) => {
        type B = { set: (s: unknown, me: unknown, ov: Record<string, unknown>) => void; state: unknown; me: unknown; ov: Record<string, unknown>; __wrapped?: boolean; screenOf(h: { c: number; r: number }): { x: number; y: number } };
        const w = window as unknown as { __board: B; fxList?: unknown[] };
        const b = w.__board;
        // the overlay is re-set by React on every render, so the effects are merged into each set() call
        if (!b.__wrapped) {
          const orig = b.set.bind(b);
          b.set = (s, me, ov) => orig(s, me, { ...ov, vfx: w.fxList ?? [] });
          b.__wrapped = true;
        }
        const start = performance.now() - (ms as number) * (SLOW as number);
        const from = { c: 5, r: 4 };
        const to = { c: 9, r: 4 };
        const x = SLOW as number;
        w.fxList = [
          { kind: 'charge', tag, from, to: from, color, t0: start, dur: 640 * x },
          { kind, tag, from, to, color, t0: start + 600 * x, dur: 1000 * x },
          { kind: 'impact', tag, from, to, color, t0: start + 1600 * x, dur: 760 * x },
        ];
        b.set(b.state, b.me, b.ov);
        const host = document.querySelector('.board-host')!.getBoundingClientRect();
        const p = b.screenOf(from);
        const q = b.screenOf(to);
        return { x: host.left + Math.min(p.x, q.x), y: host.top + Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
      },
      [tag, color, kind, ms, SLOW] as const,
    );
    const pad = 150;
    const clip = { x: Math.max(0, at.x - pad), y: Math.max(0, at.y - pad * 1.4), width: at.w + pad * 2, height: at.h + pad * 2.1 };
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${tag}-${i}.png`, clip });
  }
}
console.log('frame error:', await page.evaluate(() => (window as unknown as { __board: { frameError?: boolean } }).__board.frameError));
await browser.close();
console.log(`frames in ${out}`);
