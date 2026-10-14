// Visual QA: screenshots of every main screen at desktop and phone size.
//   node tools/qa/shots.ts [baseUrl] [outDir] [--only=menu,match]
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/qa/shots';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
mkdirSync(out, { recursive: true });

const sizes = [
  { name: 'desktop', width: 1600, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

async function navTo(page: Page, label: string) {
  const burger = page.locator('.menu-burger').first();
  if (await burger.isVisible().catch(() => false)) await burger.click();
  await page.getByRole('button', { name: label, exact: false }).first().click();
  await page.waitForTimeout(500);
}

const screens: { id: string; run: (p: Page) => Promise<void> }[] = [
  { id: 'menu', run: async () => undefined },
  { id: 'collection', run: (p) => navTo(p, 'Collection') },
  { id: 'deck', run: (p) => navTo(p, 'Deck') },
  { id: 'chambers', run: (p) => navTo(p, 'Chambers') },
  { id: 'shop', run: (p) => navTo(p, 'Shop') },
  { id: 'missions', run: (p) => navTo(p, 'Missions') },
  { id: 'online', run: (p) => navTo(p, 'Online') },
  { id: 'settings', run: (p) => navTo(p, 'Settings') },
  {
    id: 'match',
    run: async (p) => {
      await p.getByRole('button', { name: /Contamination/ }).first().click();
      await p.waitForTimeout(1500);
    },
  },
];

const browser = await chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile, locale: 'en-US' });
  for (const sc of screens) {
    if (only && !only.includes(sc.id)) continue;
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(() => {
      const raw = localStorage.getItem('contaminant.profile.v1');
      const p = raw ? JSON.parse(raw) : null;
      if (!p) return;
      p.settings.lang = 'en';
      p.onboarded = true;
      localStorage.setItem('contaminant.profile.v1', JSON.stringify(p));
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    // a fresh profile is created on first load (German by default): patch it and reload once
    const patched = await page.evaluate(() => {
      const raw = localStorage.getItem('contaminant.profile.v1');
      if (!raw) return false;
      const p = JSON.parse(raw);
      if (p.settings.lang === 'en' && p.onboarded) return false;
      p.settings.lang = 'en';
      p.onboarded = true;
      localStorage.setItem('contaminant.profile.v1', JSON.stringify(p));
      return true;
    });
    if (patched) await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    try {
      await sc.run(page);
    } catch (e) {
      errors.push(`nav: ${(e as Error).message.split('\n')[0]}`);
    }
    await page.waitForTimeout(700);
    const file = `${out}/${s.name}-${sc.id}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(file, errors.length ? `ERRORS: ${errors.slice(0, 3).join(' | ')}` : 'ok');
    await page.close();
  }
  await ctx.close();
}
await browser.close();
