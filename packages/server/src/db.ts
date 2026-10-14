// Persistence on Node's built-in SQLite (node:sqlite). One file, no native dependencies.
// Small relational tables for hot paths (players, matches, telemetry) and JSON documents for
// tournaments, World Cup editions, seasons and the halls of fame.

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PlayerRow {
  id: string;
  name: string;
  token: string;
  mmr: number;
  peak_mmr: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  team_mmr: number;
  team_id: string | null;
  collection: string;
  decks: string;
  flags: string;
  created: number;
  last_seen: number;
  season_games: number;
  is_bot: number;
}

export interface MatchRow {
  id: string;
  kind: string;
  mode: string;
  zone: string;
  p0: string;
  p1: string;
  p0_name: string;
  p1_name: string;
  winner: number | null;
  vp0: number;
  vp1: number;
  rounds: number;
  seed: number;
  started: number;
  ended: number | null;
  tournament_id: string | null;
  replay: string;
  hash: string | null;
  mmr0: number;
  mmr1: number;
  featured: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  mmr REAL NOT NULL DEFAULT 1000, peak_mmr REAL NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
  team_mmr REAL NOT NULL DEFAULT 1000, team_id TEXT,
  collection TEXT NOT NULL DEFAULT '{}', decks TEXT NOT NULL DEFAULT '[]', flags TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL, last_seen INTEGER NOT NULL, season_games INTEGER NOT NULL DEFAULT 0, is_bot INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS players_mmr ON players(mmr DESC);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, mode TEXT NOT NULL, zone TEXT NOT NULL DEFAULT 'laboratory',
  p0 TEXT NOT NULL, p1 TEXT NOT NULL, p0_name TEXT NOT NULL DEFAULT '', p1_name TEXT NOT NULL DEFAULT '',
  winner INTEGER, vp0 INTEGER NOT NULL DEFAULT 0, vp1 INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL, started INTEGER NOT NULL, ended INTEGER, tournament_id TEXT,
  replay TEXT NOT NULL DEFAULT '{}', hash TEXT, mmr0 REAL NOT NULL DEFAULT 0, mmr1 REAL NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS matches_ended ON matches(ended DESC);
CREATE TABLE IF NOT EXISTS tel_match (
  match_id TEXT PRIMARY KEY, kind TEXT, mode TEXT, zone TEXT, winner INTEGER, rounds INTEGER, mmr_avg REAL, created INTEGER
);
CREATE TABLE IF NOT EXISTS tel_pick (
  match_id TEXT, side INTEGER, def_id TEXT, in_deck INTEGER, deployed INTEGER, banned INTEGER, won INTEGER, damage INTEGER
);
CREATE INDEX IF NOT EXISTS tel_pick_def ON tel_pick(def_id);
CREATE TABLE IF NOT EXISTS tel_item (
  match_id TEXT, side INTEGER, item_id TEXT, in_deck INTEGER, played INTEGER, won INTEGER
);
CREATE INDEX IF NOT EXISTS tel_item_id ON tel_item(item_id);
CREATE TABLE IF NOT EXISTS tel_deck (
  match_id TEXT, side INTEGER, archetype TEXT, signature TEXT, won INTEGER
);
CREATE TABLE IF NOT EXISTS docs (
  kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS hall (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, player_id TEXT, player_name TEXT,
  season TEXT, created INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, reason TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL
);
`;

export class Db {
  readonly sql: DatabaseSync;
  private stmts = new Map<string, StatementSync>();

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.sql = new DatabaseSync(file);
    this.sql.exec('PRAGMA journal_mode = WAL;');
    this.sql.exec(SCHEMA);
  }

  prep(q: string): StatementSync {
    let s = this.stmts.get(q);
    if (!s) {
      s = this.sql.prepare(q);
      this.stmts.set(q, s);
    }
    return s;
  }

  run(q: string, ...args: (string | number | null)[]) {
    return this.prep(q).run(...args);
  }

  get<T>(q: string, ...args: (string | number | null)[]): T | undefined {
    return this.prep(q).get(...args) as T | undefined;
  }

  all<T>(q: string, ...args: (string | number | null)[]): T[] {
    return this.prep(q).all(...args) as T[];
  }

  tx<T>(fn: () => T): T {
    this.sql.exec('BEGIN');
    try {
      const r = fn();
      this.sql.exec('COMMIT');
      return r;
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------------- documents
  putDoc<T>(kind: string, id: string, data: T): void {
    this.run('INSERT INTO docs(kind,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, updated=excluded.updated', kind, id, JSON.stringify(data), Date.now());
  }

  getDoc<T>(kind: string, id: string): T | undefined {
    const r = this.get<{ data: string }>('SELECT data FROM docs WHERE kind=? AND id=?', kind, id);
    return r ? (JSON.parse(r.data) as T) : undefined;
  }

  listDocs<T>(kind: string): T[] {
    return this.all<{ data: string }>('SELECT data FROM docs WHERE kind=? ORDER BY updated DESC', kind).map((r) => JSON.parse(r.data) as T);
  }

  deleteDoc(kind: string, id: string): void {
    this.run('DELETE FROM docs WHERE kind=? AND id=?', kind, id);
  }

  close(): void {
    this.sql.close();
  }
}
