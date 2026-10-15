// App store: local profile (offline progression), settings and the optional online account.
import { useSyncExternalStore } from 'react';
import { EXAMPLE_DECKS, devCollection, isDevName, starterCollection, type Collection, type DeckCardInput, type Difficulty, type ModeId, type DailyState } from '@contaminant/engine';
import { Api, defaultServerUrl } from './net/api.ts';
import { GameSocket } from './net/socket.ts';
import { cleanUrl, desktop, findServers, hostOwnServer, type FoundServer } from './net/discovery.ts';
import { detectLanguage, type Lang } from './i18n/langs.ts';

export interface Settings {
  lang: Lang;
  planningSeconds: number;
  animSpeed: number;
  volume: number;
  showCoords: boolean;
  difficulty: Difficulty;
  mode: ModeId;
  /** system notifications for challenges, friend requests and daily rewards */
  notifications?: boolean;
}

/** How the player shows up for others: avatar creature, colour, equipped title and a motto. */
export interface Look {
  avatar?: string;
  color?: string;
  title?: string;
  motto?: string;
}

export interface SavedDeck {
  id: string;
  name: string;
  characters: DeckCardInput[];
  items: string[];
}

export interface MatchSummary {
  id: string;
  at: number;
  kind: string;
  mode: string;
  opponent: string;
  won: boolean | null;
  vp: [number, number];
  rounds: number;
  log: string[];
}

export interface OnlineAccount {
  server: string;
  token: string;
  playerId: string;
  name: string;
  /** server's display name (computer name or the deployed server's name) */
  serverName?: string;
}

export interface Profile {
  name: string;
  collection: Collection;
  decks: SavedDeck[];
  activeDeck: string;
  history: MatchSummary[];
  settings: Settings;
  online: OnlineAccount | null;
  onboarded: boolean;
  /** Basic Training finished (its reward is paid once) */
  trainingDone?: boolean;
  /** developer profile (name ends with '#'): everything unlocked, unlimited gold, no ranked/tournaments */
  dev?: boolean;
  /** the real collection, kept while the profile is in developer mode */
  normalCollection?: Collection;
  look?: Look;
  /** the player pressed Disconnect: no automatic sign-in until Play online */
  manualOffline?: boolean;
  /** daily login streak, free chest and play rewards (offline profile) */
  daily?: DailyState;
}

/** A name ending in '#' switches the profile into developer mode; removing it restores the real collection. */
function applyDev(p: Profile): Profile {
  const dev = isDevName(p.name) || isDevName(p.online?.name);
  if (dev) return { ...p, dev: true, normalCollection: p.normalCollection ?? (p.dev ? undefined : p.collection), collection: devCollection(p.collection) };
  if (p.dev) return { ...p, dev: false, collection: p.normalCollection ?? p.collection, normalCollection: undefined };
  return p;
}

export function isDevProfile(p: Profile = profile): boolean {
  return !!p.dev;
}

const KEY = 'contaminant.profile.v1';

function defaultProfile(): Profile {
  const deck = EXAMPLE_DECKS[2]!;
  return {
    name: 'Subject',
    collection: starterCollection(2),
    decks: EXAMPLE_DECKS.map((d) => ({ id: d.id, name: d.name, characters: d.characters.map((defId) => ({ defId, level: 1 })), items: d.items })),
    activeDeck: deck.id,
    history: [],
    settings: { lang: detectLanguage(), planningSeconds: 30, animSpeed: 1, volume: 0.6, showCoords: false, difficulty: 'normal', mode: 'contamination' },
    online: null,
    onboarded: false,
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      const d = defaultProfile();
      return applyDev({ ...d, ...p, settings: { ...d.settings, ...p.settings } });
    }
  } catch {
    /* corrupted storage: start fresh */
  }
  return defaultProfile();
}

let profile: Profile = load();
const listeners = new Set<() => void>();

export function getProfile(): Profile {
  return profile;
}

export function setProfile(fn: (p: Profile) => Profile): void {
  profile = applyDev(fn(profile));
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage full or blocked */
  }
  for (const l of listeners) l();
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => profile,
  );
}

export function activeDeck(p: Profile = profile): SavedDeck {
  return p.decks.find((d) => d.id === p.activeDeck) ?? p.decks[0]!;
}

// ---------------------------------------------------------------- online session

let api: Api | null = null;
let socket: GameSocket | null = null;

export function getApi(): Api {
  if (!api) api = new Api(profile.online?.server ?? defaultServerUrl(), profile.online?.token ?? null);
  return api;
}

export function getSocket(): GameSocket | null {
  if (!profile.online) return null;
  if (!socket) socket = new GameSocket(getApi().wsUrl(), profile.online.token);
  return socket;
}

const ACCOUNTS = 'contaminant.accounts';

/** Accounts per server, so reconnecting keeps the same name, friends and rating. */
function savedAccounts(): Record<string, OnlineAccount> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS) ?? '{}') as Record<string, OnlineAccount>;
  } catch {
    return {};
  }
}

export async function connectOnline(server: string, name: string, serverName?: string): Promise<OnlineAccount> {
  const url = cleanUrl(server);
  let acc: OnlineAccount | null = null;
  const known = savedAccounts()[url];
  if (known) {
    try {
      const a = new Api(url, known.token);
      let me = await a.get<{ player: { id: string; name: string } }>('/api/me');
      if (name && me.player.name !== name) {
        await a.post('/api/me/name', { name });
        me = await a.get<{ player: { id: string; name: string } }>('/api/me');
      }
      acc = { ...known, name: me.player.name };
    } catch {
      acc = null; // the server forgot us (new database): register again
    }
  }
  if (!acc) {
    const r = await new Api(url, null).post<{ token: string; player: { id: string; name: string } }>('/api/register', { name });
    acc = { server: url, token: r.token, playerId: r.player.id, name: r.player.name };
  }
  if (serverName) acc.serverName = serverName;
  try {
    localStorage.setItem(ACCOUNTS, JSON.stringify({ ...savedAccounts(), [url]: acc }));
  } catch {
    /* storage blocked */
  }
  api = new Api(url, acc.token);
  localStorage.setItem('contaminant.server', url);
  const done = acc;
  setProfile((p) => ({ ...p, online: done, manualOffline: false }));
  socket?.close();
  socket = null;
  return done;
}

/**
 * One button: find a server (deployed, this page's, last used, same Wi-Fi, this PC), or host one in the
 * desktop app, then sign in. Returns the servers seen when nothing could be reached.
 */
export async function connectAuto(name: string, onStatus: (s: string) => void): Promise<{ ok: true; server: FoundServer } | { ok: false; found: FoundServer[] }> {
  onStatus('Looking for servers…');
  const found = await findServers({ waitWifi: 2500 });
  let best: FoundServer | null = found[0] ?? null;
  if (!best && desktop) best = await hostOwnServer(onStatus);
  if (!best) return { ok: false, found };
  onStatus(`Connecting to ${best.name}…`);
  await connectOnline(best.url, name, best.name);
  return { ok: true, server: best };
}

let autoBusy = false;

/**
 * Goes online without asking: keeps the account on a server that still answers, otherwise signs in on the
 * best server it can find (deployed server, same Wi-Fi …). Never shows errors; returns whether it is online.
 */
export async function autoConnect(): Promise<boolean> {
  if (autoBusy || getProfile().manualOffline) return !!getProfile().online;
  autoBusy = true;
  try {
    const p = getProfile();
    if (p.online && (await new Api(p.online.server, null).health())) return true;
    const found = await findServers({ waitWifi: 2500 });
    const best = found[0];
    if (!best) return !!getProfile().online;
    if (p.online && cleanUrl(p.online.server) === best.url) return true;
    await connectOnline(best.url, p.online?.name ?? p.name, best.name);
    return true;
  } catch (e) {
    console.warn('automatic sign-in failed', e);
    return !!getProfile().online;
  } finally {
    autoBusy = false;
  }
}

export function disconnectOnline(): void {
  socket?.close();
  socket = null;
  api = null;
  // stay offline until the player presses Play online again
  setProfile((p) => ({ ...p, online: null, manualOffline: true }));
}

// ---------------------------------------------------------------- toasts

export interface Toast {
  id: number;
  text: string;
  kind: 'good' | 'bad' | 'info';
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const t = { id: ++toastId, text, kind };
  toasts = [...toasts, t].slice(-4);
  for (const l of toastListeners) l();
  setTimeout(() => {
    toasts = toasts.filter((x) => x !== t);
    for (const l of toastListeners) l();
  }, 3600);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
  );
}
