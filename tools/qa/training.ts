// End-to-end check of Basic Training: plays it like a new player (clicks only) and screenshots each step.
//   node tools/qa/training.ts [baseUrl] [outDir] [--phone]
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/qa/shots/training';
const phone = process.argv.includes('--phone');
mkdirSync(out, { recursive: true });

async function tile(page: Page, c: number, r: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([c, r]) => {
      const b = (window as unknown as { __board: { screenOf(h: { c: number; r: number }): { x: number; y: number } } }).__board;
      const host = document.querySelector('.board-host')!.getBoundingClientRect();
      const p = b.screenOf({ c, r });
      return { x: host.left + p.x, y: host.top + p.y };
    },
    [c, r],
  );
}

async function clickTile(page: Page, c: number, r: number) {
  const p = await tile(page, c, r);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}

async function step(page: Page, n: number, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${name}.png` });
  const title = await page.locator('.coach .coach-head b').textContent().catch(() => '(no coach)');
  console.log(`${n}. ${name}: coach says "${title}"`);
}

const next = (page: Page) => page.locator('.coach').getByRole('button', { name: 'Next' }).click();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1600, height: 900 }, isMobile: phone, hasTouch: phone, locale: 'en-US' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.removeItem('contaminant.profile.v1'));
await page.goto(base, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start Basic Training' }).click();
await page.waitForTimeout(1500);
await step(page, 1, 'welcome');
await next(page);
await step(page, 2, 'ap');
await next(page);
await step(page, 3, 'pick');
await page.locator('.locker', { hasText: 'Vile' }).click();
await step(page, 4, 'deploy');
await clickTile(page, 4, 4);
await step(page, 5, 'seal');
await page.locator('.btn.seal').click();
await page.waitForTimeout(3500);
await step(page, 6, 'revealed');
await next(page);
await step(page, 7, 'select');
const vile = await page.evaluate(() => {
  const b = (window as unknown as { __board: { screenOf(h: { c: number; r: number }): { x: number; y: number } } }).__board;
  void b;
  return true;
});
void vile;
await clickTile(page, 4, 4);
await step(page, 8, 'move');
await page.locator('.left .cmd', { hasText: 'Move' }).click();
await clickTile(page, 6, 4);
await step(page, 9, 'attack');
await page.locator('.left .cmd', { hasText: 'Reaper' }).click();
await clickTile(page, 7, 4);
await step(page, 10, 'order');
await next(page);
await step(page, 11, 'card');
await page.locator('.hand .card', { hasText: 'Whetstone' }).click();
await step(page, 12, 'seal2');
await page.locator('.btn.seal').click();
await page.waitForTimeout(800);
await step(page, 13, 'resolving');
await page.waitForTimeout(4500);
await step(page, 14, 'vp');
await next(page);
await step(page, 15, 'ready');
console.log(errors.length ? `PAGE ERRORS: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
