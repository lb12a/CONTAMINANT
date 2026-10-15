// Plays several rounds of a bot match like a phone user and checks that the board keeps rendering.
//   node tools/qa/rounds.ts [baseUrl] [rounds] [--phone]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const rounds = Number(process.argv[3] ?? 6);
const phone = process.argv.includes('--phone');

const browser = await chromium.launch(process.argv.includes('--gpu') ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false'] } : {});
const ctx = await browser.newContext({ viewport: phone ? { width: 360, height: 760 } : { width: 1400, height: 860 }, isMobile: phone, hasTouch: phone, locale: 'en-US' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => {
  console.log('PAGEERROR', e.message, (e.stack ?? '').split(/\r?\n/).slice(0, 8).join(' <- '));
  errors.push(e.message);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  console.log('CONSOLE', m.text());
  errors.push(m.text());
});
await page.addInitScript(() => {
  localStorage.setItem('contaminant.profile.v1', JSON.stringify({ name: 'Tester', settings: { lang: 'en', planningSeconds: 0, animSpeed: 1 }, onboarded: true, trainingDone: true }));
});
await page.goto(base, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Play vs Bot' }).click();
await page.waitForTimeout(2500);

// frames drawn by the board's ticker since the last call
const frames = () =>
  page.evaluate(async () => {
    const b = (window as unknown as { __board: { app: { ticker: { lastTime: number; started: boolean } } } }).__board;
    const t0 = b.app.ticker.lastTime;
    await new Promise((r) => setTimeout(r, 600));
    return { started: b.app.ticker.started, advanced: b.app.ticker.lastTime - t0 };
  });

const tapTile = async (c: number, r: number) => {
  const p = await page.evaluate(
    ([c, r]) => {
      const b = (window as unknown as { __board: { screenOf(h: { c: number; r: number }): { x: number; y: number } } }).__board;
      const host = document.querySelector('.board-host')!.getBoundingClientRect();
      const q = b.screenOf({ c, r });
      return { x: host.left + q.x, y: host.top + q.y };
    },
    [c, r],
  );
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
};
const highlighted = (kind: string) =>
  page.evaluate((kind) => [...(window as unknown as { __board: { ov: { highlights: Map<string, string> } } }).__board.ov.highlights].filter(([, k]) => k === kind).map(([k]) => k.split(',').map(Number)), kind);
const myUnits = () =>
  page.evaluate(() => {
    const b = (window as unknown as { __board: { me: number; state: { units: { owner: number; isObject?: boolean; pos: { c: number; r: number } }[] } } }).__board;
    return b.state.units.filter((u) => u.owner === b.me && !u.isObject).map((u) => [u.pos.c, u.pos.r]);
  });

for (let r = 1; r <= rounds; r++) {
  // deploy one creature, then give every creature a move
  const lockers = page.locator('.locker');
  if ((await lockers.count()) > 0) {
    if (phone) await page.locator('.dock-switch button').first().click().catch(() => undefined);
    await lockers.first().click().catch(() => undefined);
    const dep = await highlighted('deploy');
    if (dep.length) await tapTile(dep[Math.floor(dep.length / 2)]![0]!, dep[Math.floor(dep.length / 2)]![1]!);
  }
  for (const [c, rr] of (await myUnits()).slice(0, 2)) {
    await tapTile(c!, rr!);
    const move = page.locator('.up-cmds .cmd, .left .cmd').first();
    if (await move.isEnabled().catch(() => false)) {
      await move.click().catch(() => undefined);
      const mv = await highlighted('move');
      if (mv.length) await tapTile(mv[0]![0]!, mv[0]![1]!);
    }
    await page.locator('.up-close').click().catch(() => undefined);
  }
  if (process.argv.includes('--trace')) {
    // seal without waiting, then pause the page if it hangs and print where it is stuck
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Debugger.enable');
    cdp.on('Debugger.paused', (e: { callFrames: { functionName: string; url: string; location: { lineNumber: number; columnNumber: number } }[] }) => {
      console.log('STUCK IN:');
      for (const fr of e.callFrames.slice(0, 14)) console.log(`  ${fr.functionName || '(anon)'} ${fr.url.split('/').slice(-2).join('/')}:${fr.location.lineNumber + 1}:${fr.location.columnNumber + 1}`);
      void cdp.send('Debugger.resume').catch(() => undefined);
    });
    await page.evaluate(() => (document.querySelector('.btn.seal') as HTMLButtonElement).click()).catch(() => undefined);
    await cdp.send('Performance.enable');
    for (let k = 0; k < 6; k++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pm = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
      const g = (n: string) => Math.round(pm.metrics.find((x) => x.name === n)?.value ?? -1);
      console.log(`metrics layouts=${g('LayoutCount')} styles=${g('RecalcStyleCount')} heapMB=${Math.round(g('JSHeapUsedSize') / 1e6)} nodes=${g('Nodes')} listeners=${g('JSEventListeners')} taskSec=${(pm.metrics.find((x) => x.name === 'TaskDuration')?.value ?? 0).toFixed(1)} scriptSec=${(pm.metrics.find((x) => x.name === 'ScriptDuration')?.value ?? 0).toFixed(1)}`);
      const m = await Promise.race([page.evaluate(() => { const w = window as unknown as { __renders?: number; __board: { cam: unknown } }; const bb = (name: string) => { const g = (w.__board as unknown as Record<string, { getLocalBounds(): { width: number; height: number; x: number; y: number } }>)[name]; if (!g) return '-'; const r = g.getLocalBounds(); return `${name}:${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; }; return `${['glowG','crispG','fxG','fieldsG','barsG','gridG','entities','textLayer'].map(bb).join(' | ')} renders ${w.__renders} reorients ${(w as unknown as { __reorients?: number }).__reorients} grounds ${(w as unknown as { __grounds?: number }).__grounds}`; }), new Promise((r) => setTimeout(() => r('busy'), 4000))]);
      console.log('mounts', m);
    }
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await new Promise((r) => setTimeout(r, 2500));
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; hitCount?: number; callFrame: { functionName: string; url: string; lineNumber: number } }[] } };
    const by = new Map<string, number>();
    for (const n of profile.nodes) {
      const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]?.split('?')[0]}:${n.callFrame.lineNumber + 1}`;
      by.set(k, (by.get(k) ?? 0) + (n.hitCount ?? 0));
    }
    console.log('HOT:');
    for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${v}  ${k}`);
    process.exit(0);
  } else await page.locator('.btn.seal').click();
  // wait for the resolution to finish (seal button returns)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (await page.locator('.btn.seal:not(.active)').count()) break;
  }
  const f = await frames();
  const mem = await page.evaluate(() => {
    const p = performance as unknown as { memory?: { usedJSHeapSize: number } };
    const b = (window as unknown as { __board: { app: { stage: { children: unknown[] } }; world?: { children: unknown[] } } }).__board;
    const count = (o: { children?: unknown[] }): number => (o.children ?? []).reduce((n: number, c) => n + 1 + count(c as { children?: unknown[] }), 0);
    return { mounts: (window as unknown as { __boardMounts?: number }).__boardMounts, heapMB: Math.round((p.memory?.usedJSHeapSize ?? 0) / 1e6), nodes: count(b.app.stage as { children?: unknown[] }), dom: document.getElementsByTagName('*').length };
  });
  const round = await page.locator('.score-row .round').textContent();
  console.log(`after round ${r}: ${round} · ticker started=${f.started} advanced=${Math.round(f.advanced)}ms · board mounts ${mem.mounts} · heap ${mem.heapMB} MB · pixi nodes ${mem.nodes} · dom ${mem.dom} · errors so far ${errors.length}`);
  if (await page.locator('.modal').count()) break;
}
for (const e of errors) console.log(e);
await browser.close();
