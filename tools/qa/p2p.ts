// Two browsers play a peer-to-peer friendly through the real client: WebRTC via the server relay,
// commit–reveal rounds, and the same state hash on both sides afterwards.
//   node tools/qa/p2p.ts [clientUrl] [serverUrl] [outDir]
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const client = process.argv[2] ?? 'http://localhost:5173';
const server = process.argv[3] ?? 'http://localhost:8787';
const out = process.argv[4] ?? 'tools/qa/shots/p2p';
mkdirSync(out, { recursive: true });

async function account(name: string) {
  const r = (await (await fetch(`${server}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json()) as { token: string; player: { id: string; name: string } };
  return { server, token: r.token, playerId: r.player.id, name: r.player.name };
}

const browser = await chromium.launch();
async function open(acc: Awaited<ReturnType<typeof account>>): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${acc.name}] page error: ${e.message}`));
  await page.addInitScript((a) => {
    localStorage.setItem('contaminant.profile.v1', JSON.stringify({ settings: { lang: 'en' }, onboarded: true, trainingDone: true, online: a }));
    localStorage.setItem('contaminant.server', a.server);
  }, acc);
  await page.goto(client, { waitUntil: 'networkidle' });
  await page.locator('.groups').getByRole('button', { name: 'Compete' }).click();
  await page.waitForTimeout(800);
  await page.locator('details.more-ways > summary').click();
  return page;
}

const hashOf = (p: Page) => p.evaluate(() => (window as unknown as { __p2p: { lastHash(): string; desync: number | null } }).__p2p.lastHash());
const desyncOf = (p: Page) => p.evaluate(() => (window as unknown as { __p2p: { desync: number | null } }).__p2p.desync);
const round = (p: Page) => p.locator('.score-row .round').textContent();

const a = await open(await account('Peer Alice'));
const b = await open(await account('Peer Bob'));
const code = (await a.locator('.p2p-code').textContent())!.trim();
await a.getByRole('button', { name: 'Wait for a friend' }).click();
await b.getByLabel('Friend’s P2P code').fill(code);
await b.getByRole('button', { name: 'Connect', exact: true }).click();
await a.locator('.match').waitFor({ timeout: 20000 });
await b.locator('.match').waitFor({ timeout: 20000 });
console.log('both peers are in the match');
console.log('opening hashes equal:', (await hashOf(a)) === (await hashOf(b)));

for (let r = 1; r <= 3; r++) {
  // round 1: Alice deploys her first offered character in her zone
  if (r === 1) {
    await a.locator('.locker').first().click();
    const tile = await a.evaluate(() => {
      const b = (window as unknown as { __board: { screenOf(h: { c: number; r: number }): { x: number; y: number } } }).__board;
      const host = document.querySelector('.board-host')!.getBoundingClientRect();
      const p = b.screenOf({ c: 2, r: 4 });
      return { x: host.left + p.x, y: host.top + p.y };
    });
    await a.mouse.click(tile.x, tile.y);
    await a.waitForTimeout(300);
  }
  await a.locator('.btn.seal').click();
  await b.locator('.btn.seal').click();
  await a.waitForTimeout(r === 1 ? 6000 : 3500);
  const [ha, hb] = [await hashOf(a), await hashOf(b)];
  console.log(`after round ${r}: ${await round(a)} / ${await round(b)} · hashes equal: ${ha === hb} · desync: ${await desyncOf(a)} / ${await desyncOf(b)}`);
}
await a.screenshot({ path: `${out}/alice.png` });
await b.screenshot({ path: `${out}/bob.png` });
await browser.close();
