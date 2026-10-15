// Announces a server inside the home network: a small UDP broadcast every two seconds, which the desktop
// app listens for, so friends on the same Wi-Fi find the game without typing an address.

import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';

export const LAN_PORT = 8788;

export interface LanBeacon {
  game: 'contaminant';
  name: string;
  port: number;
  version: string;
  players: number;
}

/** Broadcast addresses of every IPv4 network this machine is in (plus the global one). */
export function broadcastAddresses(): string[] {
  const out = new Set<string>(['255.255.255.255']);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((n, i) => (n | (~mask[i]! & 255)) >>> 0).join('.'));
    }
  }
  return [...out];
}

export function startLanAnnouncer(beacon: () => LanBeacon, intervalMs = 2000): { stop(): void } {
  let sock: Socket | null = createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => undefined);
  sock.bind(() => sock?.setBroadcast(true));
  const send = () => {
    if (!sock) return;
    const msg = Buffer.from(JSON.stringify(beacon()));
    for (const addr of broadcastAddresses()) sock.send(msg, LAN_PORT, addr, () => undefined);
  };
  const timer = setInterval(send, intervalMs);
  setTimeout(send, 300);
  return {
    stop() {
      clearInterval(timer);
      sock?.close();
      sock = null;
    },
  };
}
