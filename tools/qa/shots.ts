// Visual QA: screenshots of every main screen at desktop and phone size.
//   node tools/qa/shots.ts [baseUrl] [outDir] [--only=menu,match]
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/qa/shots';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
// --online=<file.json> with { server, token, playerId, name }: screenshots of the online screens
const onlineFile = process.argv.find((a) => a.startsWith('--online='))?.slice(9);
const online = onlineFile ? JSON.parse((await import('node:fs')).readFileSync(onlineFile, 'utf8')) : null;
mkdirSync(out, { recursive: true });

const sizes = [
  { name: 'desktop', width: 1600, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

/** Opens a page through the section navigation (group tab, then the page's sub-tab). */
const SECTION: Record<string, string> = {
  'Testing Chambers': 'Play',
  Missions: 'Play',
  Collection: 'Collection',
  'Deck Builder': 'Collection',
  Shop: 'Collection',
  Online: 'Compete',
  Tournaments: 'Compete',
  'World Cup': 'Compete',
  Ladder: 'Compete',
  Teams: 'Compete',
  Replays: 'Watch',
  Spectate: 'Watch',
  Meta: 'Watch',
  History: 'Watch',
};
async function navTo(page: Page, label: string) {
  if (label === 'Settings') {
    await page.locator('.settings-btn').click();
    await page.waitForTimeout(500);
    return;
  }
  const group = SECTION[label];
  if (group) {
    const tabbar = page.locator('.tabbar');
    const bar = (await tabbar.isVisible().catch(() => false)) ? tabbar : page.locator('.groups');
    await bar.getByRole('button', { name: group }).click();
    await page.waitForTimeout(300);
  }
  const sub = page.locator('.subnav').getByRole('button', { name: label, exact: true });
  if (await sub.isVisible().catch(() => false)) await sub.click();
  await page.waitForTimeout(500);
}

const screens: { id: string; run: (p: Page) => Promise<void> }[] = [
  { id: 'menu', run: async () => undefined },
  { id: 'collection', run: (p) => navTo(p, 'Collection') },
  { id: 'deck', run: (p) => navTo(p, 'Deck Builder') },
  { id: 'chambers', run: (p) => navTo(p, 'Testing Chambers') },
  { id: 'shop', run: (p) => navTo(p, 'Shop') },
  { id: 'missions', run: (p) => navTo(p, 'Missions') },
  { id: 'online', run: (p) => navTo(p, 'Online') },
  { id: 'settings', run: (p) => navTo(p, 'Settings') },
  { id: 'worldcup', run: (p) => navTo(p, 'World Cup') },
  { id: 'teams', run: (p) => navTo(p, 'Teams') },
  { id: 'replays', run: (p) => navTo(p, 'Replays') },
  { id: 'ladder', run: (p) => navTo(p, 'Ladder') },
  { id: 'tournaments', run: (p) => navTo(p, 'Tournaments') },
  { id: 'meta', run: (p) => navTo(p, 'Meta') },
  {
    id: 'replay',
    run: async (p) => {
      await navTo(p, 'Replays');
      await p.locator('button.replay-item').first().click();
      await p.waitForTimeout(2500);
      await p.getByRole('button', { name: 'Next round' }).click();
      await p.getByRole('button', { name: 'Next round' }).click();
      await p.waitForTimeout(900);
    },
  },
  {
    id: 'chamber',
    run: async (p) => {
      await navTo(p, 'Testing Chambers');
      await p.locator('button.btn.tutorial:not([disabled])').first().click();
      await p.waitForTimeout(1500);
    },
  },
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
    await page.addInitScript((acc) => {
      // one QA profile in the profile index, English, past the welcome steps
      const idx = JSON.parse(localStorage.getItem('contaminant.profiles.v1') ?? 'null') ?? { active: 'qa', list: [{ id: 'qa', name: 'Tester', created: 0 }] };
      const key = `contaminant.profile.${idx.active}`;
      const p = JSON.parse(localStorage.getItem(key) ?? '{"name":"Tester","settings":{}}');
      p.settings = { ...p.settings, lang: 'en' };
      p.onboarded = true;
      p.trainingDone = true;
      if (acc) p.online = acc;
      localStorage.setItem(key, JSON.stringify(p));
      localStorage.setItem('contaminant.profiles.v1', JSON.stringify(idx));
      if (acc) localStorage.setItem('contaminant.server', acc.server);
    }, online);
    await page.goto(base, { waitUntil: 'networkidle' });
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
