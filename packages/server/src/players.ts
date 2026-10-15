// Accounts (guest tokens), collections, decks, ratings and the ladder.

import { randomBytes } from 'node:crypto';
import {
  devCollection,
  isDevName,
  EXAMPLE_DECKS,
  starterCollection,
  validateCharDeck,
  validateItemDeck,
  type Collection,
  type DeckCardInput,
} from '@contaminant/engine';
import type { Db, PlayerRow } from './db.ts';
import { divisionFor, rate, START_MMR } from './rating.ts';

export interface SavedDeck {
  id: string;
  name: string;
  characters: DeckCardInput[];
  items: string[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  mmr: number;
  peak: number;
  division: string;
  divisionId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  titles: string[];
  isBot: boolean;
  /** developer account (name ends in '#'): no ladder, tournaments or meta */
  dev: boolean;
}

export function sanitizeName(raw: unknown): string {
  const text = String(raw ?? '').trim();
  // a trailing '#' marks a developer account (everything unlocked, no competitive play)
  const dev = text.endsWith('#');
  const s = text.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, dev ? 19 : 20);
  const name = s.length >= 2 ? s : `Subject-${Math.floor(Math.random() * 9000 + 1000)}`;
  return dev ? `${name}#` : name;
}

export function isDevPlayer(p: { name: string } | null | undefined): boolean {
  return isDevName(p?.name);
}

export class PlayerService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  register(name: string, opts: { bot?: boolean; starter?: number; mmr?: number } = {}): PlayerRow {
    const id = `p_${randomBytes(6).toString('hex')}`;
    const token = randomBytes(24).toString('hex');
    const now = Date.now();
    const col = starterCollection(opts.starter ?? 2);
    const deck = EXAMPLE_DECKS[opts.starter ?? 2]!;
    const decks: SavedDeck[] = [{ id: 'starter', name: deck.name, characters: deck.characters.map((defId) => ({ defId, level: 1 })), items: deck.items }];
    const mmr = opts.mmr ?? START_MMR;
    this.db.run(
      'INSERT INTO players(id,name,token,mmr,peak_mmr,collection,decks,created,last_seen,is_bot) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,
      sanitizeName(name),
      token,
      mmr,
      mmr,
      JSON.stringify(col),
      JSON.stringify(decks),
      now,
      now,
      opts.bot ? 1 : 0,
    );
    return this.byId(id)!;
  }

  byId(id: string): PlayerRow | undefined {
    return this.db.get<PlayerRow>('SELECT * FROM players WHERE id=?', id);
  }

  byToken(token: string): PlayerRow | undefined {
    if (!token || token.length < 16) return undefined;
    const p = this.db.get<PlayerRow>('SELECT * FROM players WHERE token=?', token);
    if (p) this.db.run('UPDATE players SET last_seen=? WHERE id=?', Date.now(), p.id);
    return p;
  }

  rename(id: string, name: string): void {
    this.db.run('UPDATE players SET name=? WHERE id=?', sanitizeName(name), id);
  }

  collection(id: string): Collection {
    const p = this.byId(id);
    const col = p ? (JSON.parse(p.collection) as Collection) : starterCollection();
    return p && isDevName(p.name) ? devCollection(col) : col;
  }

  saveCollection(id: string, col: Collection): void {
    this.db.run('UPDATE players SET collection=? WHERE id=?', JSON.stringify(col), id);
  }

  decks(id: string): SavedDeck[] {
    const p = this.byId(id);
    return p ? (JSON.parse(p.decks) as SavedDeck[]) : [];
  }

  /** Validates deck rules and ownership, then stores. */
  saveDeck(id: string, deck: SavedDeck): { ok: boolean; errors: string[] } {
    const col = this.collection(id);
    const c = validateCharDeck(deck.characters);
    const i = validateItemDeck(deck.items);
    const errors = [...c.errors, ...i.errors];
    const owned = this.db.get<{ is_bot: number }>('SELECT is_bot FROM players WHERE id=?', id)?.is_bot;
    if (!owned) {
      for (const ch of deck.characters) if (!col.chars[ch.defId]) errors.push(`you do not own ${ch.defId}`);
      const counts: Record<string, number> = {};
      for (const it of deck.items) counts[it] = (counts[it] ?? 0) + 1;
      for (const [it, n] of Object.entries(counts)) if ((col.items[it] ?? 0) < n) errors.push(`you own only ${col.items[it] ?? 0}× ${it}`);
    }
    if (errors.length) return { ok: false, errors };
    const levels = deck.characters.map((ch) => ({ ...ch, level: col.chars[ch.defId]?.level ?? 1 }));
    const list = this.decks(id).filter((d) => d.id !== deck.id);
    list.unshift({ ...deck, characters: levels, name: sanitizeName(deck.name) });
    this.db.run('UPDATE players SET decks=? WHERE id=?', JSON.stringify(list.slice(0, 20)), id);
    return { ok: true, errors: [] };
  }

  deck(id: string, deckId?: string): SavedDeck | undefined {
    const list = this.decks(id);
    return list.find((d) => d.id === deckId) ?? list[0];
  }

  public(p: PlayerRow): PublicPlayer {
    const d = divisionFor(p.mmr);
    const col = JSON.parse(p.collection) as Collection;
    return {
      id: p.id,
      name: p.name,
      mmr: Math.round(p.mmr),
      peak: Math.round(p.peak_mmr),
      division: d.label,
      divisionId: d.division.id,
      games: p.games,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      titles: col.titles ?? [],
      isBot: !!p.is_bot,
      dev: isDevName(p.name),
    };
  }

  /** Ranked result → MMR update for both players. score 1 = a won. */
  applyRanked(aId: string, bId: string, score: number, margin: number): { a: number; b: number; deltaA: number; deltaB: number } {
    const a = this.byId(aId)!;
    const b = this.byId(bId)!;
    const r = rate(a.mmr, b.mmr, a.games, b.games, score, margin);
    this.applyResult(a, r.a, score);
    this.applyResult(b, r.b, 1 - score);
    return r;
  }

  applyResult(p: PlayerRow, newMmr: number, score: number): void {
    this.db.run(
      'UPDATE players SET mmr=?, peak_mmr=MAX(peak_mmr, ?), games=games+1, season_games=season_games+1, wins=wins+?, losses=losses+?, draws=draws+? WHERE id=?',
      newMmr,
      newMmr,
      score === 1 ? 1 : 0,
      score === 0 ? 1 : 0,
      score === 0.5 ? 1 : 0,
      p.id,
    );
  }

  recordUnranked(id: string, score: number): void {
    this.db.run('UPDATE players SET games=games+1, wins=wins+?, losses=losses+?, draws=draws+? WHERE id=?', score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0, id);
  }

  /** The ladder: humans only (bots and developer accounts never appear). */
  leaderboard(limit = 100, offset = 0): (PublicPlayer & { rank: number })[] {
    const rows = this.db.all<PlayerRow>("SELECT * FROM players WHERE is_bot=0 AND name NOT LIKE '%#' ORDER BY mmr DESC LIMIT ? OFFSET ?", limit, offset);
    return rows.map((r, i) => ({ ...this.public(r), rank: offset + i + 1 }));
  }

  ledger(id: string, reason: string, data: unknown): void {
    this.db.run('INSERT INTO ledger(player_id,reason,data,created) VALUES(?,?,?,?)', id, reason, JSON.stringify(data), Date.now());
  }

  grant(id: string, reward: { gold?: number; trophies?: number; title?: string; cardBack?: string; skin?: string; chest?: 'small' | 'medium' | 'large' }, reason: string): void {
    const col = this.collection(id);
    col.gold += reward.gold ?? 0;
    col.trophies = Math.max(0, col.trophies + (reward.trophies ?? 0));
    col.bestTrophies = Math.max(col.bestTrophies, col.trophies);
    if (reward.title && !col.titles.includes(reward.title)) col.titles.push(reward.title);
    if (reward.cardBack && !col.cardBacks.includes(reward.cardBack)) col.cardBacks.push(reward.cardBack);
    if (reward.skin) {
      const skins = ((col as Collection & { skins?: string[] }).skins ??= []);
      if (!skins.includes(reward.skin)) skins.push(reward.skin);
    }
    if (reward.chest) col.chests.push(reward.chest);
    this.saveCollection(id, col);
    this.ledger(id, reason, reward);
  }

  setTeamMmr(id: string, mmr: number): void {
    this.db.run('UPDATE players SET team_mmr=? WHERE id=?', mmr, id);
  }

  setMmr(id: string, mmr: number): void {
    this.db.run('UPDATE players SET mmr=?, season_games=0 WHERE id=?', mmr, id);
  }

  setTeam(id: string, teamId: string | null): void {
    this.db.run('UPDATE players SET team_id=? WHERE id=?', teamId, id);
  }

  allHumans(): PlayerRow[] {
    return this.db.all<PlayerRow>('SELECT * FROM players WHERE is_bot=0');
  }

  bots(): PlayerRow[] {
    return this.db.all<PlayerRow>('SELECT * FROM players WHERE is_bot=1');
  }

  ensureBots(n: number): PlayerRow[] {
    const have = this.bots();
    const names = ['Warden Bot', 'Specimen 7', 'Night Shift', 'Ward Nurse', 'Archivist', 'Old Janitor', 'Sterile Unit', 'Spore Choir', 'Rust Saint', 'Bone Clerk', 'Lamp Moth', 'Hollow Intern', 'Gutter Prince', 'Vial Keeper', 'Static Nun', 'Mold Baron'];
    const out = have.slice(0, n);
    for (let i = have.length; i < n; i++) out.push(this.register(names[i % names.length]! + (i >= names.length ? ` ${i}` : ''), { bot: true, starter: i % 3, mmr: 900 + ((i * 97) % 600) }));
    return out;
  }
}
