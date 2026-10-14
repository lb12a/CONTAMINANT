// WebSocket client with automatic reconnect, hello/auth and typed message dispatch.
import type { ClientMsg, ServerMsg } from '@contaminant/engine';

type Handler = (m: ServerMsg) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: ClientMsg[] = [];
  private closed = false;
  private retry = 0;
  connected = false;
  latency = 0;
  serverOffset = 0;
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
    this.open();
    setInterval(() => this.send({ t: 'ping', at: Date.now() }), 10_000);
  }

  private open(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', token: this.token } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === 'welcome') {
        this.connected = true;
        this.serverOffset = m.serverTime - Date.now();
        for (const q of this.queue.splice(0)) ws.send(JSON.stringify(q));
      }
      if (m.t === 'pong') {
        this.latency = Date.now() - m.at;
        this.serverOffset = m.serverTime + this.latency / 2 - Date.now();
      }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  /** Server time → local time for deadlines. */
  localTime(serverTs: number): number {
    return serverTs - this.serverOffset;
  }

  send(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && (this.connected || m.t === 'hello')) this.ws.send(JSON.stringify(m));
    else if (m.t !== 'ping') this.queue.push(m);
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
