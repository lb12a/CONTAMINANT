// Finds a game server without anyone typing an address. Candidates, best first:
//   1. the public server in ./server.json (one line in the deployed site, see docs/DEPLOY.md)
//   2. the server this page was loaded from (the server also serves the web client)
//   3. the last server this device played on
//   4. desktop app: servers on the same Wi-Fi announcing themselves over UDP
//   5. this computer (localhost)
// If nothing answers, the desktop app hosts its own server; phones and browsers can scan the Wi-Fi.

export interface FoundServer {
  url: string;
  name: string;
  players: number;
  ping: number;
  source: 'config' | 'page' | 'saved' | 'lan' | 'local' | 'scan' | 'own';
}

export interface DesktopBridge {
  platform: string;
  server(action: 'start' | 'stop' | 'status'): Promise<{ running: boolean; port: number; lan: string[] }>;
  /** servers on the local network heard in the last few seconds */
  lan?(): Promise<{ url: string; name: string; players: number }[]>;
}

export const desktop = (window as unknown as { contaminantDesktop?: DesktopBridge }).contaminantDesktop;

const RANK: Record<FoundServer['source'], number> = { config: 0, page: 1, saved: 2, lan: 3, own: 4, local: 5, scan: 6 };

/** "192.168.1.20" → "http://192.168.1.20:8787"; full addresses stay as they are. */
export function cleanUrl(u: string): string {
  let s = u.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(s)) s = `http://${s}`;
  const host = s.replace(/^https?:\/\//, '');
  if (/^(\d+\.\d+\.\d+\.\d+|localhost)$/.test(host)) s += ':8787';
  return s;
}

export async function probe(url: string, source: FoundServer['source'], timeoutMs = 2000): Promise<FoundServer | null> {
  const base = cleanUrl(url);
  const t0 = performance.now();
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!r.ok) return null;
    const h = (await r.json()) as { ok?: boolean; game?: string; name?: string; players?: number };
    if (!h.ok || (h.game && h.game !== 'contaminant')) return null;
    return { url: base, name: h.name ?? new URL(base).hostname, players: h.players ?? 0, ping: Math.round(performance.now() - t0), source };
  } catch {
    return null;
  }
}

/** Servers listed by whoever deployed the web client: ./server.json → {"servers": ["https://…"]}. */
async function configured(): Promise<string[]> {
  try {
    const r = await fetch('./server.json', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { server?: string; servers?: string[] };
    return [...(j.servers ?? []), ...(j.server ? [j.server] : [])].filter((x) => typeof x === 'string' && x.length > 3);
  } catch {
    return [];
  }
}

function pageOrigin(): string | null {
  if (!location.protocol.startsWith('http')) return null;
  if (location.port === '5173' || location.port === '4173') return null; // the Vite dev/preview server
  return location.origin;
}

export async function findServers(): Promise<FoundServer[]> {
  const tasks: Promise<FoundServer | null>[] = [];
  for (const u of await configured()) tasks.push(probe(u, 'config', 4000));
  const page = pageOrigin();
  if (page) tasks.push(probe(page, 'page'));
  const saved = localStorage.getItem('contaminant.server');
  if (saved) tasks.push(probe(saved, 'saved'));
  if (desktop?.lan) {
    const heard = await desktop.lan().catch(() => []);
    for (const s of heard) tasks.push(probe(s.url, 'lan'));
  }
  tasks.push(probe('http://localhost:8787', 'local', 1200));
  const found = (await Promise.all(tasks)).filter((x): x is FoundServer => !!x);
  const byUrl = new Map<string, FoundServer>();
  for (const f of found.sort((a, b) => RANK[a.source] - RANK[b.source])) {
    const key = f.url.replace('127.0.0.1', 'localhost');
    if (!byUrl.has(key)) byUrl.set(key, f);
  }
  return [...byUrl.values()];
}

/** Desktop app: start the built-in server on this PC and wait until it answers. */
export async function hostOwnServer(onStatus?: (s: string) => void): Promise<FoundServer | null> {
  if (!desktop) return null;
  onStatus?.('Starting a server on this PC…');
  const st = await desktop.server('start');
  for (let i = 0; i < 40; i++) {
    const f = await probe(`http://localhost:${st.port}`, 'own', 800);
    if (f) return f;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** Phones and browsers: try the usual home-network ranges on the game port (takes ~10 s). */
export async function scanWifi(onProgress?: (done: number, total: number) => void): Promise<FoundServer[]> {
  if (location.protocol === 'https:') return []; // a secure page may not call plain-http addresses
  const nets = ['192.168.178', '192.168.0', '192.168.1', '192.168.2', '10.0.0'];
  const hosts = nets.flatMap((n) => Array.from({ length: 254 }, (_, i) => `http://${n}.${i + 1}:8787`));
  const out: FoundServer[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const h = hosts[next++]!;
      const f = await probe(h, 'scan', 900);
      if (f) out.push(f);
      onProgress?.(++done, hosts.length);
    }
  };
  await Promise.all(Array.from({ length: 96 }, worker));
  return out;
}
