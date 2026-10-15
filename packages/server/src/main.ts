// Server entry point.
//   node packages/server/src/main.ts [--port 8787] [--data ./data/x.sqlite] [--seed-telemetry 200] [--static ../client/dist]
//                                    [--name "Lab PC"] [--lan] [--trust-proxy]
// --lan announces the server to the desktop app on the same network; --trust-proxy reads client addresses
// from X-Forwarded-For (behind nginx/Caddy/a cloud load balancer).

import { resolve } from 'node:path';
import { hostname } from 'node:os';
import { GameServer } from './server.ts';
import { startLanAnnouncer } from './lan.ts';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : process.env[name.toUpperCase().replace(/-/g, '_')] ?? fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`) || process.env[name.toUpperCase().replace(/-/g, '_')] === '1';

const here = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const name = arg('name', hostname())!;
const server = new GameServer({
  port: Number(arg('port', '8787')),
  dataFile: arg('data', resolve(here, '../data/contaminant.sqlite'))!,
  staticDir: arg('static', resolve(here, '../../client/dist')),
  adminToken: arg('admin-token', 'dev-admin')!,
  planningSeconds: Number(arg('planning-seconds', '30')),
  name,
  trustProxy: flag('trust-proxy'),
  log: (m) => console.log(new Date().toISOString(), m),
});

const seed = Number(arg('seed-telemetry', '0'));
if (seed > 0) {
  const r = server.simulate(seed);
  console.log(`seeded telemetry with ${r.matches} bot matches in ${r.ms} ms`);
}

const port = await server.listen();
console.log(`Contaminant server "${name}" listening on http://localhost:${port}  (WebSocket: ws://localhost:${port}/ws)`);

const lan = flag('lan') ? startLanAnnouncer(() => ({ game: 'contaminant', name, port, version: '0.1.0', players: server.conns.size })) : null;
if (lan) console.log('announcing on the local network (UDP 8788)');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    lan?.stop();
    server.close();
    process.exit(0);
  });
}
