// Server entry point.
//   node packages/server/src/main.ts [--port 8787] [--data ./data/x.sqlite] [--seed-telemetry 200] [--static ../client/dist]

import { resolve } from 'node:path';
import { GameServer } from './server.ts';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : process.env[name.toUpperCase().replace(/-/g, '_')] ?? fallback;
}

const here = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const server = new GameServer({
  port: Number(arg('port', '8787')),
  dataFile: arg('data', resolve(here, '../data/contaminant.sqlite'))!,
  staticDir: arg('static', resolve(here, '../../client/dist')),
  adminToken: arg('admin-token', 'dev-admin')!,
  planningSeconds: Number(arg('planning-seconds', '30')),
  log: (m) => console.log(new Date().toISOString(), m),
});

const seed = Number(arg('seed-telemetry', '0'));
if (seed > 0) {
  const r = server.simulate(seed);
  console.log(`seeded telemetry with ${r.matches} bot matches in ${r.ms} ms`);
}

const port = await server.listen();
console.log(`Contaminant server listening on http://localhost:${port}  (WebSocket: ws://localhost:${port}/ws)`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
