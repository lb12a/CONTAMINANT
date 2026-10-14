// Desktop smoke test: starts the Electron app (dev layout: built client + bundled server), hosts the
// LAN server, screenshots the window and checks the server answers.
//   node tools/qa/desktop.ts [outDir]
import { _electron as electron } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = process.argv[2] ?? 'tools/qa/shots/desktop';
mkdirSync(out, { recursive: true });
const port = 8799;
const app = await electron.launch({
  args: [resolve('apps/desktop/main.cjs')],
  env: { ...process.env, CONTAMINANT_PORT: String(port), CONTAMINANT_HOST: '1' } as Record<string, string>,
});
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(3500);
await win.screenshot({ path: `${out}/desktop-menu.png` });
const title = await win.title();
let health = 'down';
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://localhost:${port}/api/health`);
    if (r.ok) {
      health = JSON.stringify(await r.json());
      break;
    }
  } catch {
    /* starting */
  }
  await new Promise((r) => setTimeout(r, 250));
}
const bridge = await win.evaluate(() => typeof (window as unknown as { contaminantDesktop?: unknown }).contaminantDesktop);
console.log(`window title: ${title}`);
console.log(`desktop bridge: ${bridge}`);
console.log(`embedded server: ${health}`);
await app.close();
