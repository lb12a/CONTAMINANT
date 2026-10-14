// App store: local profile (offline progression), settings and the optional online account.
import { useSyncExternalStore } from 'react';
import { EXAMPLE_DECKS, starterCollection, type Collection, type DeckCardInput, type Difficulty, type ModeId } from '@contaminant/engine';
import { Api, defaultServerUrl } from './net/api.ts';
import { GameSocket } from './net/socket.ts';

export interface Settings {
  lang: 'en' | 'de';
  planningSeconds: number;
  animSpeed: number;
  volume: number;
  showCoords: boolean;
  difficulty: Difficulty;
  mode: ModeId;
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
    settings: { lang: navigator.language?.startsWith('de') ? 'de' : 'en', planningSeconds: 30, animSpeed: 1, volume: 0.6, showCoords: false, difficulty: 'normal', mode: 'contamination' },
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
      return { ...d, ...p, settings: { ...d.settings, ...p.settings } };
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
  profile = fn(profile);
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

export async function connectOnline(server: string, name: string): Promise<OnlineAccount> {
  api = new Api(server, null);
  const r = await api.post<{ token: string; player: { id: string; name: string } }>('/api/register', { name });
  const acc: OnlineAccount = { server, token: r.token, playerId: r.player.id, name: r.player.name };
  api = new Api(server, r.token);
  localStorage.setItem('contaminant.server', server);
  setProfile((p) => ({ ...p, online: acc }));
  socket?.close();
  socket = null;
  return acc;
}

export function disconnectOnline(): void {
  socket?.close();
  socket = null;
  api = null;
  setProfile((p) => ({ ...p, online: null }));
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
