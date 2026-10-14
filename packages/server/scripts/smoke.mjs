// Smoke test for the bundled server (dist/server.mjs): boots it on a free port with a throwaway
// database, exercises the main HTTP endpoints and a WebSocket handshake, then shuts it down.
//   npm run build -w @contaminant/server && npm run smoke -w @contaminant/server

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '../dist/server.mjs');
if (!existsSync(bundle)) {
  console.error('dist/server.mjs is missing: run `npm run build -w @contaminant/server` first');
  process.exit(1);
}

const port = await new Promise((res) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const dir = mkdtempSync(join(tmpdir(), 'contaminant-smoke-'));
const proc = spawn(process.execPath, [bundle, '--port', String(port), '--data', join(dir, 'smoke.sqlite'), '--seed-telemetry', '6'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
proc.stdout.on('data', (d) => (output += d));
proc.stderr.on('data', (d) => (output += d));

const base = `http://localhost:${port}`;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start:\n${output}`);
}

try {
  const health = await waitUp();
  check('health', health.ok === true, `version ${health.version}`);
  const reg = await (await fetch(`${base}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke Tester' }) })).json();
  check('register', !!reg.token && reg.player?.name === 'Smoke Tester');
  const auth = { Authorization: `Bearer ${reg.token}` };
  const me = await (await fetch(`${base}/api/me`, { headers: auth })).json();
  check('me', me.player?.id === reg.player.id && Array.isArray(me.decks) && me.decks.length > 0, `${me.decks.length} deck(s)`);
  for (const path of ['/api/ladder', '/api/season', '/api/tournaments', '/api/worldcup', '/api/circuit', '/api/champions', '/api/teams', '/api/meta', '/api/live', '/api/matches']) {
    const r = await fetch(base + path, { headers: auth });
    check(`GET ${path}`, r.ok, String(r.status));
  }
  const team = await (await fetch(`${base}/api/teams`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke Squad', tag: 'SMK' }) })).json();
  check('found a team', team.ok === true);
  const matches = await (await fetch(`${base}/api/matches?limit=1`)).json();
  if (matches.matches?.length) {
    const v = await (await fetch(`${base}/api/matches/${matches.matches[0].id}/verify`)).json();
    check('replay verification', v.ok === true, `${v.rounds} rounds`);
  }
  const hello = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const t = setTimeout(() => reject(new Error('no WebSocket reply')), 5000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: reg.token })));
    ws.on('message', (m) => {
      clearTimeout(t);
      ws.close();
      resolve(JSON.parse(String(m)));
    });
    ws.on('error', reject);
  });
  check('WebSocket hello', typeof hello.t === 'string', hello.t);
} catch (e) {
  check('smoke run', false, e.message);
} finally {
  proc.kill();
  await new Promise((r) => proc.once('exit', r));
  rmSync(dir, { recursive: true, force: true });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed` : `\nall ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
