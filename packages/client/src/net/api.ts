// REST client for the Contaminant server.

export function defaultServerUrl(): string {
  const saved = localStorage.getItem('contaminant.server');
  if (saved) return saved;
  if (location.protocol.startsWith('http') && location.port !== '5173') return location.origin;
  return 'http://localhost:8787';
}

export class Api {
  base: string;
  token: string | null;

  constructor(base: string, token: string | null) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
  }

  async req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const r = await fetch(this.base + path, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
    return data;
  }

  get<T>(path: string): Promise<T> {
    return this.req<T>(path);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.req<T>(path, { method: 'POST', body });
  }

  wsUrl(): string {
    return this.base.replace(/^http/, 'ws') + '/ws';
  }

  async health(): Promise<boolean> {
    try {
      const r = await fetch(this.base + '/api/health', { signal: AbortSignal.timeout(2500) });
      return r.ok;
    } catch {
      return false;
    }
  }
}
