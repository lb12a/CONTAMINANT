// Friends, short friend codes, public profile cards, "players nearby" and daily rewards.
// A friend request becomes a friendship when the other side accepts (or sends a request back).
// "Nearby" means connected from the same network: the same public address (one Wi-Fi behind a router)
// or, on a server inside the home network, any private address.

import { randomInt } from 'node:crypto';
import { claimDaily, claimFreeChest, dailyStatus, type DailyState } from '@contaminant/engine';
import type { Db, PlayerRow } from './db.ts';
import type { PlayerService } from './players.ts';
import { divisionFor } from './rating.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#8CFF5A', '#FF9A1F', '#4FE3FF', '#ff7ad6', '#b48cff', '#e8dfc8', '#ff4d4d', '#fff6a0'];

export interface PublicProfile {
  /** character id shown as the avatar */
  avatar?: string;
  /** equipped title (must be owned) */
  title?: string;
  motto?: string;
  color?: string;
}

export interface FriendCard {
  id: string;
  name: string;
  code: string;
  division: string;
  online: boolean;
  inMatch: boolean;
  profile: PublicProfile;
}

export interface Presence {
  online(id: string): boolean;
  inMatch(id: string): boolean;
}

function cleanText(raw: unknown, max: number): string {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\p{P} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1');
}

export class SocialService {
  private db: Db;
  private players: PlayerService;
  private presence: Presence;
  constructor(db: Db, players: PlayerService, presence: Presence) {
    this.db = db;
    this.players = players;
    this.presence = presence;
  }

  private row(id: string): { code: string; profile: string; daily: string } {
    let r = this.db.get<{ code: string; profile: string; daily: string }>('SELECT code,profile,daily FROM social WHERE player_id=?', id);
    if (r) return r;
    for (;;) {
      const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (this.db.get('SELECT 1 AS x FROM social WHERE code=?', code)) continue;
      this.db.run('INSERT INTO social(player_id,code,profile,daily) VALUES(?,?,?,?)', id, code, '{}', '{}');
      r = { code, profile: '{}', daily: '{}' };
      return r;
    }
  }

  /** Short code friends type in to add each other (6 characters, no look-alike letters). */
  codeOf(id: string): string {
    return this.row(id).code;
  }

  byCode(code: string): PlayerRow | undefined {
    const c = normalizeCode(code);
    const r = this.db.get<{ player_id: string }>('SELECT player_id FROM social WHERE code=?', c);
    return r ? this.players.byId(r.player_id) : undefined;
  }

  profile(id: string): PublicProfile {
    return JSON.parse(this.row(id).profile) as PublicProfile;
  }

  setProfile(p: PlayerRow, input: Record<string, unknown>): PublicProfile {
    const cur = this.profile(p.id);
    const col = this.players.collection(p.id);
    const next: PublicProfile = { ...cur };
    if ('avatar' in input) {
      const a = String(input.avatar ?? '');
      if (!a || col.chars[a]) next.avatar = a || undefined;
    }
    if ('title' in input) {
      const t = String(input.title ?? '');
      if (!t || col.titles.includes(t)) next.title = t || undefined;
    }
    if ('motto' in input) next.motto = cleanText(input.motto, 80) || undefined;
    if ('color' in input) {
      const c = String(input.color ?? '');
      if (!c || COLORS.includes(c) || /^#[0-9a-fA-F]{6}$/.test(c)) next.color = c || undefined;
    }
    this.row(p.id);
    this.db.run('UPDATE social SET profile=? WHERE player_id=?', JSON.stringify(next), p.id);
    return next;
  }

  card(p: PlayerRow): FriendCard {
    return {
      id: p.id,
      name: p.name,
      code: this.codeOf(p.id),
      division: divisionFor(p.mmr).label,
      online: this.presence.online(p.id),
      inMatch: this.presence.inMatch(p.id),
      profile: this.profile(p.id),
    };
  }

  areFriends(a: string, b: string): boolean {
    return !!this.db.get("SELECT 1 AS x FROM friends WHERE a=? AND b=? AND status='friends'", a, b);
  }

  list(id: string): { code: string; friends: FriendCard[]; incoming: FriendCard[]; outgoing: FriendCard[] } {
    const rows = this.db.all<{ a: string; b: string; status: string }>('SELECT a,b,status FROM friends WHERE a=? OR b=?', id, id);
    const cards = (ids: string[]) =>
      ids
        .map((x) => this.players.byId(x))
        .filter((x): x is PlayerRow => !!x)
        .map((x) => this.card(x));
    const friends = cards(rows.filter((r) => r.status === 'friends' && r.a === id).map((r) => r.b)).sort((x, y) => Number(y.online) - Number(x.online) || x.name.localeCompare(y.name));
    const incoming = cards(rows.filter((r) => r.status === 'pending' && r.b === id).map((r) => r.a));
    const outgoing = cards(rows.filter((r) => r.status === 'pending' && r.a === id).map((r) => r.b));
    return { code: this.codeOf(id), friends, incoming, outgoing };
  }

  /** Finds a player by friend code (or exact name) and sends a request; a mutual request makes them friends. */
  request(me: PlayerRow, target: { code?: unknown; name?: unknown; id?: unknown }): { ok: boolean; error?: string; status?: 'sent' | 'friends'; other?: PlayerRow } {
    let other: PlayerRow | undefined;
    if (target.id) other = this.players.byId(String(target.id));
    if (!other && target.code) other = this.byCode(String(target.code));
    if (!other && target.name) {
      const n = String(target.name).trim().toLowerCase();
      other = this.db.get<PlayerRow>('SELECT * FROM players WHERE is_bot=0 AND lower(name)=? ORDER BY last_seen DESC LIMIT 1', n);
    }
    if (!other) return { ok: false, error: 'No player with that code' };
    if (other.id === me.id) return { ok: false, error: 'That is your own code' };
    if (other.is_bot) return { ok: false, error: 'Bots cannot be friends' };
    if (this.areFriends(me.id, other.id)) return { ok: true, status: 'friends', other };
    const count = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM friends WHERE a=? AND status='friends'", me.id)?.n ?? 0;
    if (count >= 200) return { ok: false, error: 'Friend list is full (200)' };
    const back = this.db.get("SELECT 1 AS x FROM friends WHERE a=? AND b=? AND status='pending'", other.id, me.id);
    if (back) {
      this.makeFriends(me.id, other.id);
      return { ok: true, status: 'friends', other };
    }
    this.db.run("INSERT INTO friends(a,b,status,created) VALUES(?,?,'pending',?) ON CONFLICT(a,b) DO NOTHING", me.id, other.id, Date.now());
    return { ok: true, status: 'sent', other };
  }

  accept(me: PlayerRow, otherId: string): { ok: boolean; error?: string } {
    const pending = this.db.get("SELECT 1 AS x FROM friends WHERE a=? AND b=? AND status='pending'", otherId, me.id);
    if (!pending) return { ok: false, error: 'No request from that player' };
    this.makeFriends(me.id, otherId);
    return { ok: true };
  }

  /** Removes a friend, declines a request or withdraws one. */
  remove(me: PlayerRow, otherId: string): { ok: boolean } {
    this.db.run('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', me.id, otherId, otherId, me.id);
    return { ok: true };
  }

  private makeFriends(a: string, b: string): void {
    const now = Date.now();
    this.db.tx(() => {
      this.db.run('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', a, b, b, a);
      this.db.run("INSERT INTO friends(a,b,status,created) VALUES(?,?,'friends',?)", a, b, now);
      this.db.run("INSERT INTO friends(a,b,status,created) VALUES(?,?,'friends',?)", b, a, now);
    });
  }

  friendIds(id: string): string[] {
    return this.db.all<{ b: string }>("SELECT b FROM friends WHERE a=? AND status='friends'", id).map((r) => r.b);
  }

  // ---------------------------------------------------------------- daily rewards

  daily(id: string): DailyState {
    return JSON.parse(this.row(id).daily) as DailyState;
  }

  saveDaily(id: string, state: DailyState): void {
    this.row(id);
    this.db.run('UPDATE social SET daily=? WHERE player_id=?', JSON.stringify(state), id);
  }

  dailyStatus(id: string, now: number) {
    return dailyStatus(this.daily(id), now);
  }

  /** Pays today's login reward (once per day, streak bonus) into the server collection. */
  claimDaily(p: PlayerRow, now: number): { ok: boolean; error?: string; reward?: ReturnType<typeof claimDaily>['reward']; state?: DailyState } {
    const r = claimDaily(this.daily(p.id), now);
    if (!r.reward) return { ok: false, error: 'Already claimed today' };
    this.saveDaily(p.id, r.state);
    this.players.grant(p.id, { gold: r.reward.gold, chest: r.reward.chest }, 'daily');
    return { ok: true, reward: r.reward, state: r.state };
  }

  /** The free small chest of the day (shop offer). */
  freeChest(p: PlayerRow, now: number): { ok: boolean; error?: string } {
    const r = claimFreeChest(this.daily(p.id), now);
    if (!r.chest) return { ok: false, error: 'The free chest of the day is already taken' };
    this.saveDaily(p.id, r.state);
    this.players.grant(p.id, { chest: r.chest }, 'free-chest');
    return { ok: true };
  }
}

/** Is this an address inside a home/office network (or this machine)? */
export function isPrivateAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const a = ip.replace(/^::ffff:/, '');
  if (a === '::1' || a === '127.0.0.1' || a.startsWith('127.')) return true;
  if (a.startsWith('10.') || a.startsWith('192.168.') || a.startsWith('169.254.')) return true;
  const m = a.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a)) return true;
  return false;
}

/** Same Wi-Fi / same network: same public address, or both inside the server's own private network. */
export function sameNetwork(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = a.replace(/^::ffff:/, '');
  const y = b.replace(/^::ffff:/, '');
  if (isPrivateAddress(x) && isPrivateAddress(y)) return true;
  return x === y;
}
