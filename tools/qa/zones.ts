// Screenshots of Testing Chambers in different zones (each character's chamber uses its home zone).
//   node tools/qa/zones.ts [baseUrl] [outDir] Scarecrow Lullabun ...
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/qa/shots/zones';
const names = process.argv.slice(4).length ? process.argv.slice(4) : ['Scarecrow', 'Lullabun', 'Nexus'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'en-US' });
for (const name of names) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const raw = localStorage.getItem('contaminant.profile.v1');
    const p = raw ? JSON.parse(raw) : { settings: {} };
    p.settings.lang = 'en';
    p.onboarded = true;
    p.trainingDone = true;
    localStorage.setItem('contaminant.profile.v1', JSON.stringify(p));
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.navlink', { hasText: 'Testing Chambers' }).click();
  await page.waitForTimeout(500);
  const cell = page.locator('.grid-cards > div').filter({ has: page.locator(`.card[title^="${name}"]`) });
  await cell.locator('button.btn.tutorial').click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Start tutorial' }).click().catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name.toLowerCase()}.png` });
  console.log(`${out}/${name.toLowerCase()}.png`);
  await page.close();
}
await browser.close();
