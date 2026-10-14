// Wires storage, accounts, matchmaking, rooms, tournaments, World Cup, seasons and meta analysis
// behind an HTTP API and a WebSocket endpoint. Also serves the built web client if present.

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CHARACTER_LIST,
  ITEM_LIST,
  canLevelUp,
  CHESTS,
  dailyMissions,
  levelUp,
  makeRng,
  matchReward,
  applyMatchReward,
  openChest,
  randomDeck,
  validateCharDeck,
  validateItemDeck,
  hashString,
  type ChestSize,
  type ClientMsg,
  type DeckPayload,
  type ServerMsg,
} from '@contaminant/engine';
import { Db, type MatchRow, type PlayerRow } from './db.ts';
import { PlayerService } from './players.ts';
import { realClock, RoomManager, verifyReplay, type Clock, type Conn, type MatchRoom, type ReplayLog, type RoomResult } from './rooms.ts';
import { Matchmaker } from './matchmaking.ts';
import { TournamentService } from './tournaments.ts';
import { WorldCupService } from './worldcup.ts';
import { SeasonService } from './seasons.ts';
import { botWeights, classifyDeck, detectAnomalies, metaSnapshot, recordTelemetry } from './meta.ts';
import { DIVISIONS, divisionFor } from './rating.ts';
import { overlayHtml } from './overlay.ts';

export interface ServerConfig {
  dataFile: string;
  port: number;
  adminToken: string;
  planningSeconds: number;
  botFillSeconds: number;
  rankedBotFill: boolean;
  fillTournamentsWithBots: boolean;
  staticDir?: string;
  clock?: Clock;
  autoTick?: boolean;
  log?: (msg: string) => void;
}

export const DEFAULT_CONFIG: ServerConfig = {
  dataFile: './data/contaminant.sqlite',
  port: 8787,
  adminToken: process.env.ADMIN_TOKEN ?? 'dev-admin',
  planningSeconds: 30,
  botFillSeconds: 20,
  rankedBotFill: false,
  fillTournamentsWithBots: true,
  autoTick: true,
};

interface FriendLobby {
  code: string;
  host: string;
  deckId?: string;
  planningSeconds: number;
  mode: string;
  created: number;
}

export class GameServer {
  readonly cfg: ServerConfig;
  readonly db: Db;
  readonly clock: Clock;
  readonly players: PlayerService;
  readonly rooms: RoomManager;
  readonly mm: Matchmaker;
  readonly tournaments: TournamentService;
  readonly worldcup: WorldCupService;
  readonly seasons: SeasonService;
  readonly conns = new Map<string, Set<Conn>>();
  readonly lobbies = new Map<string, FriendLobby>();
  http?: Server;
  wss?: WebSocketServer;
  private intervals: NodeJS.Timeout[] = [];
  private weightCache: { at: number; w: Record<string, number> } = { at: 0, w: {} };

  constructor(cfg: Partial<ServerConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.clock = this.cfg.clock ?? realClock;
    this.db = new Db(this.cfg.dataFile);
    this.players = new PlayerService(this.db);
    this.rooms = new RoomManager({
      clock: this.clock,
      connsOf: (pid) => [...(this.conns.get(pid) ?? [])],
      onEnd: (room, result) => this.onRoomEnd(room, result),
      weights: () => this.weights(),
      log: this.cfg.log,
    });
    const notify = (pid: string, m: ServerMsg) => this.notify(pid, m);
    this.mm = new Matchmaker(this.clock, this.rooms, this.players, notify, { botFillSeconds: this.cfg.botFillSeconds, rankedBotFill: this.cfg.rankedBotFill, planningSeconds: this.cfg.planningSeconds });
    this.tournaments = new TournamentService({ db: this.db, players: this.players, rooms: this.rooms, clock: this.clock, notify, planningSeconds: this.cfg.planningSeconds, fillWithBots: this.cfg.fillTournamentsWithBots });
    this.worldcup = new WorldCupService({ db: this.db, players: this.players, rooms: this.rooms, clock: this.clock, notify, fillWithBots: this.cfg.fillTournamentsWithBots });
    this.seasons = new SeasonService(this.db, this.players, this.clock);
    this.seasons.current();
  }

  log(msg: string): void {
    this.cfg.log?.(msg);
  }

  weights(): Record<string, number> {
    if (this.clock.now() - this.weightCache.at > 60_000) this.weightCache = { at: this.clock.now(), w: botWeights(this.db) };
    return this.weightCache.w;
  }

  notify(pid: string, m: ServerMsg): void {
    for (const c of this.conns.get(pid) ?? []) c.send(m);
  }

  // ---------------------------------------------------------------- match end: ratings, rewards, telemetry, persistence

  onRoomEnd(room: MatchRoom, result: RoomResult): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const [a, b] = room.seats;
    const score = result.winner === 'draw' || result.winner === null ? 0.5 : result.winner === 0 ? 1 : 0;
    const humans = room.seats.filter((s) => !s.bot);
    if (room.kind === 'ranked' && humans.length) {
      const pa = this.players.byId(a.playerId)!;
      const pb = this.players.byId(b.playerId)!;
      const before = [pa.mmr, pb.mmr];
      const r = this.players.applyRanked(a.playerId, b.playerId, score, result.margin);
      [r.a, r.b].forEach((after, i) => {
        const s = room.seats[i]!;
        out[s.playerId] = { ...(out[s.playerId] as object), mmr: { before: Math.round(before[i]!), after: Math.round(after), division: divisionFor(after).label } };
      });
    } else {
      for (const s of humans) this.players.recordUnranked(s.playerId, s.index === 0 ? score : 1 - score);
    }
    // collection rewards (trophies, gold, chests)
    for (const s of humans) {
      const won = result.winner === s.index;
      const reward = matchReward(won, result.margin, { ranked: room.kind === 'ranked', friendly: room.kind === 'friendly', draw: result.winner === 'draw' });
      const col = this.players.collection(s.playerId);
      const unlocked = applyMatchReward(col, reward);
      this.updateMissions(col, room, s.index, won);
      this.players.saveCollection(s.playerId, col);
      out[s.playerId] = { ...(out[s.playerId] as object), rewards: { ...reward, unlockedZones: unlocked } };
    }
    if (room.kind === 'tournament') this.tournaments.onRoomEnd(room, result);
    if (room.kind === 'wm') this.worldcup.onRoomEnd(room, result);
    if (room.kind === 'team') {
      const team = this.mm.teamRoomEnded(room, result);
      if (team) for (const [ti, ids] of team.teams.entries()) for (const pid of ids) this.notify(pid, { t: 'tournament', id: 'team-battle', event: 'team_result', data: { won: team.winnerTeam === ti, draw: team.winnerTeam === null } });
    }
    // telemetry
    recordTelemetry(this.db, {
      matchId: room.id,
      kind: room.kind,
      mode: room.state.settings.mode,
      zone: room.state.settings.zone,
      winner: result.winner,
      rounds: result.rounds,
      mmrAvg: ((a.mmr ?? 1000) + (b.mmr ?? 1000)) / 2,
      decks: [a.deck.characters.map((c) => c.defId), b.deck.characters.map((c) => c.defId)],
      itemDecks: [a.deck.items, b.deck.items],
      state: room.state,
    });
    // anti-cheat audit trail
    for (const s of room.seats) {
      if (!s.bot && room.suspicion(s.index) > 0.5) {
        const p = this.players.byId(s.playerId);
        if (p) {
          const flags = JSON.parse(p.flags) as Record<string, number>;
          flags.invalidPlans = (flags.invalidPlans ?? 0) + 1;
          this.db.run('UPDATE players SET flags=? WHERE id=?', JSON.stringify(flags), p.id);
        }
      }
    }
    this.db.run(
      'INSERT OR REPLACE INTO matches(id,kind,mode,zone,p0,p1,p0_name,p1_name,winner,vp0,vp1,rounds,seed,started,ended,tournament_id,replay,hash,mmr0,mmr1,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      room.id,
      room.kind,
      room.state.settings.mode,
      room.state.settings.zone,
      a.playerId,
      b.playerId,
      a.name,
      b.name,
      result.winner === 'draw' || result.winner === null ? -1 : result.winner,
      result.vp[0],
      result.vp[1],
      result.rounds,
      room.replay.seed,
      room.createdAt,
      this.clock.now(),
      room.opts.tournamentId ?? null,
      JSON.stringify(room.replay),
      room.replay.finalHash ?? null,
      a.mmr ?? 0,
      b.mmr ?? 0,
      room.opts.featured ? 1 : 0,
    );
    return out;
  }

  private updateMissions(col: ReturnType<PlayerService['collection']>, room: MatchRoom, seat: 0 | 1, won: boolean): void {
    const day = new Date(this.clock.now()).toISOString().slice(0, 10);
    const c = col as typeof col & { missions?: { day: string; progress: Record<string, number>; claimed: string[] } };
    if (!c.missions || c.missions.day !== day) c.missions = { day, progress: {}, claimed: [] };
    const st = room.state;
    const add = (k: string, n: number) => (c.missions!.progress[k] = (c.missions!.progress[k] ?? 0) + n);
    add('played', 1);
    if (won) add('won', 1);
    add('kos', st.stats.kos[seat]);
    add('damage', st.stats.damageDealt[seat]);
    add('items', st.players[seat].discard.length);
    add('deploys', st.units.concat(st.graveyard).filter((u) => u.owner === seat && u.cardUid).length);
    add('vp', st.players[seat].vp);
    for (const m of dailyMissions(day)) {
      if (!c.missions.claimed.includes(m.id) && (c.missions.progress[m.stat] ?? 0) >= m.target) {
        c.missions.claimed.push(m.id);
        col.gold += m.reward.gold;
        if (m.reward.chest) col.chests.push(m.reward.chest);
      }
    }
  }

  // ---------------------------------------------------------------- simulations (meta seeding, balance testing)

  simulate(count: number, opts: { mode?: string; random?: boolean } = {}): { matches: number; ms: number } {
    const t0 = Date.now();
    const bots = this.players.ensureBots(16);
    const rng = makeRng(hashString(`sim:${this.clock.now()}:${count}`));
    for (let i = 0; i < count; i++) {
      const A = bots[i % bots.length]!;
      const B = bots[(i * 7 + 3) % bots.length]!;
      const deckFor = (p: PlayerRow) => {
        if (opts.random !== false && i % 2 === 0) {
          const d = randomDeck(rng);
          return { characters: d.characters.map((defId) => ({ defId, level: 1 })), items: d.items };
        }
        const d = this.players.deck(p.id)!;
        return { characters: d.characters, items: d.items };
      };
      const room = this.rooms.create(
        [
          { playerId: A.id, name: A.name, deck: deckFor(A), bot: { difficulty: 'normal' }, mmr: A.mmr },
          { playerId: B.id === A.id ? bots[(i + 1) % bots.length]!.id : B.id, name: B.name, deck: deckFor(B), bot: { difficulty: 'normal' }, mmr: B.mmr },
        ],
        { kind: 'bot', mode: (opts.mode as never) ?? 'contamination', planningSeconds: 30 },
      );
      room.start();
      this.rooms.rooms.delete(room.id);
    }
    return { matches: count, ms: Date.now() - t0 };
  }

  // ---------------------------------------------------------------- ticking

  tick(): void {
    this.mm.tick();
  }

  slowTick(): void {
    const now = this.clock.now();
    this.tournaments.scheduleTick(now);
    this.tournaments.lifecycleTick(now);
    this.worldcup.tick(now);
    this.seasons.tick(now);
    this.rooms.sweep(now);
    for (const [code, l] of this.lobbies) if (now - l.created > 30 * 60_000) this.lobbies.delete(code);
  }

  // ---------------------------------------------------------------- HTTP

  listen(port = this.cfg.port): Promise<number> {
    this.http = createHttpServer((req, res) => {
      this.handleHttp(req, res).catch((e) => {
        this.log(`http error: ${(e as Error).stack}`);
        json(res, 500, { error: 'internal error' });
      });
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws, req) => this.onSocket(ws, req));
    if (this.cfg.autoTick) {
      this.intervals.push(setInterval(() => this.tick(), 1000));
      this.intervals.push(setInterval(() => this.slowTick(), 30_000));
      this.slowTick();
    }
    return new Promise((resolveP) => {
      this.http!.listen(port, () => {
        const addr = this.http!.address();
        resolveP(typeof addr === 'object' && addr ? addr.port : port);
      });
    });
  }

  close(): void {
    for (const i of this.intervals) clearInterval(i);
    this.wss?.close();
    this.http?.close();
    this.db.close();
  }

  private auth(req: IncomingMessage): PlayerRow | undefined {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url ?? '/', 'http://x').searchParams.get('token') ?? '';
    return this.players.byToken(token);
  }

  private isAdmin(req: IncomingMessage): boolean {
    return (req.headers.authorization ?? '') === `Bearer ${this.cfg.adminToken}` || req.headers['x-admin-token'] === this.cfg.adminToken;
  }

  private rate = new Map<string, { tokens: number; at: number }>();
  private allow(key: string, perSec = 20, burst = 60): boolean {
    const now = Date.now();
    const b = this.rate.get(key) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
    b.at = now;
    if (b.tokens < 1) {
      this.rate.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.rate.set(key, b);
    return true;
  }

  async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (!this.allow(req.socket.remoteAddress ?? 'x')) return json(res, 429, { error: 'too many requests' });
    const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
    const me = this.auth(req);
    const need = () => {
      if (!me) json(res, 401, { error: 'unauthorized' });
      return me;
    };
    const q = (k: string) => url.searchParams.get(k) ?? undefined;
    let m: RegExpMatchArray | null;

    if (path === '/api/health') return json(res, 200, { ok: true, time: this.clock.now(), rooms: this.rooms.rooms.size, version: '0.1.0' });
    if (path === '/api/catalog') return json(res, 200, { characters: CHARACTER_LIST.length, items: ITEM_LIST.length });
    if (path === '/api/register' && req.method === 'POST') {
      const p = this.players.register(String(body.name ?? 'Subject'), { starter: Number(body.starter ?? 2) % 3 });
      return json(res, 200, { player: this.players.public(p), token: p.token });
    }
    if (path === '/api/me') {
      const p = need();
      if (!p) return;
      return json(res, 200, { player: this.players.public(p), collection: this.players.collection(p.id), decks: this.players.decks(p.id), season: this.seasons.current(), division: divisionFor(p.mmr), missions: dailyMissions(new Date(this.clock.now()).toISOString().slice(0, 10)), room: this.rooms.forPlayer(p.id)?.id ?? null, queue: this.mm.inQueue(p.id) });
    }
    if (path === '/api/me/name' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      this.players.rename(p.id, String(body.name ?? ''));
      return json(res, 200, { ok: true });
    }
    if (path === '/api/collection/chest' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      const col = this.players.collection(p.id);
      const idx = Number(body.index ?? 0);
      const size = col.chests[idx];
      if (!size) return json(res, 400, { error: 'no such chest' });
      col.chests.splice(idx, 1);
      const result = openChest(col, size, makeRng(hashString(`${p.id}:${this.clock.now()}:${randomBytes(4).toString('hex')}`)));
      this.players.saveCollection(p.id, col);
      return json(res, 200, { chest: size, ...result, collection: col });
    }
    if (path === '/api/collection/buy' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      const size = String(body.chest ?? 'small') as ChestSize;
      const col = this.players.collection(p.id);
      const price = CHESTS[size]?.price;
      if (!price || col.gold < price) return json(res, 400, { error: 'not enough gold' });
      col.gold -= price;
      col.chests.push(size);
      this.players.saveCollection(p.id, col);
      return json(res, 200, { collection: col });
    }
    if (path === '/api/collection/levelup' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      const col = this.players.collection(p.id);
      const chk = canLevelUp(col, String(body.defId));
      if (!chk.ok || !levelUp(col, String(body.defId))) return json(res, 400, { error: chk.reason ?? 'cannot level up' });
      this.players.saveCollection(p.id, col);
      return json(res, 200, { collection: col });
    }
    if (path === '/api/collection/tutorial' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      const col = this.players.collection(p.id);
      const c = col.chars[String(body.defId)];
      if (!c) return json(res, 400, { error: 'not owned' });
      let reward = 0;
      if (!c.tutorialDone) {
        c.tutorialDone = true;
        c.isNew = false;
        col.gold += 100;
        reward = 100;
      }
      this.players.saveCollection(p.id, col);
      return json(res, 200, { reward, collection: col });
    }
    if (path === '/api/decks' && req.method === 'GET') {
      const p = need();
      if (!p) return;
      return json(res, 200, { decks: this.players.decks(p.id) });
    }
    if (path === '/api/decks' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      const r = this.players.saveDeck(p.id, { id: String(body.id ?? `d${Date.now().toString(36)}`), name: String(body.name ?? 'Deck'), characters: (body.characters as never) ?? [], items: (body.items as never) ?? [] });
      return json(res, r.ok ? 200 : 400, r);
    }
    if (path === '/api/ladder') return json(res, 200, { season: this.seasons.current(), players: this.players.leaderboard(Number(q('limit') ?? 100), Number(q('offset') ?? 0), q('bots') === '1') });
    if (path === '/api/divisions') return json(res, 200, { divisions: DIVISIONS });
    if (path === '/api/season') return json(res, 200, { season: this.seasons.current() });
    if (path === '/api/tournaments' && req.method === 'GET') return json(res, 200, { tournaments: this.tournaments.list().slice(0, 50).map((t) => ({ ...t, bracket: undefined, players: t.registrations.length })) });
    if ((m = path.match(/^\/api\/tournaments\/([\w-]+)$/))) {
      const t = this.tournaments.get(m[1]!);
      return t ? json(res, 200, { tournament: t, standings: this.tournaments.standings(t.id) }) : json(res, 404, { error: 'not found' });
    }
    if ((m = path.match(/^\/api\/tournaments\/([\w-]+)\/(register|unregister|checkin)$/)) && req.method === 'POST') {
      const p = need();
      if (!p) return;
      if (m[2] === 'register') return json(res, 200, this.tournaments.register(m[1]!, p, body.deckId as string | undefined));
      if (m[2] === 'unregister') {
        this.tournaments.unregister(m[1]!, p.id);
        return json(res, 200, { ok: true });
      }
      return json(res, 200, this.tournaments.checkin(m[1]!, p.id));
    }
    if (path === '/api/trophy-hall') return json(res, 200, { entries: this.tournaments.trophyHall() });
    if (path === '/api/worldcup') return json(res, 200, { worldcup: this.worldcup.current() ?? null, editions: this.worldcup.all().map((w) => ({ id: w.id, name: w.name, status: w.status, champion: w.champion })) });
    if (path === '/api/worldcup/leaderboard') return json(res, 200, { leaderboard: this.worldcup.leaderboard() });
    if (path === '/api/worldcup/register' && req.method === 'POST') {
      const p = need();
      if (!p) return;
      return json(res, 200, this.worldcup.register(p, body.deckId as string | undefined));
    }
    if (path === '/api/hall-of-fame') return json(res, 200, { entries: this.worldcup.hallOfFame() });
    if (path === '/api/meta') return json(res, 200, metaSnapshot(this.db, { mode: q('mode'), zone: q('zone'), kind: q('kind'), minMmr: q('minMmr') ? Number(q('minMmr')) : undefined }));
    if (path === '/api/meta/anomalies') return json(res, 200, { anomalies: detectAnomalies(this.db, { minGames: Number(q('minGames') ?? 20) }) });
    if (path === '/api/meta/classify' && req.method === 'POST') return json(res, 200, classifyDeck((body.characters as string[]) ?? []));
    if (path === '/api/live') return json(res, 200, { matches: this.rooms.live() });
    if (path === '/api/matches') {
      const rows = this.db.all<MatchRow>('SELECT id,kind,mode,zone,p0,p1,p0_name,p1_name,winner,vp0,vp1,rounds,started,ended,tournament_id,featured FROM matches ORDER BY ended DESC LIMIT ?', Number(q('limit') ?? 50));
      const mine = me ? rows.filter((r) => r.p0 === me.id || r.p1 === me.id) : rows;
      return json(res, 200, { matches: q('mine') ? mine : rows });
    }
    if ((m = path.match(/^\/api\/matches\/([\w-]+)$/))) {
      const row = this.db.get<MatchRow>('SELECT * FROM matches WHERE id=?', m[1]!);
      return row ? json(res, 200, { match: { ...row, replay: JSON.parse(row.replay) } }) : json(res, 404, { error: 'not found' });
    }
    if ((m = path.match(/^\/api\/matches\/([\w-]+)\/verify$/))) {
      const row = this.db.get<MatchRow>('SELECT * FROM matches WHERE id=?', m[1]!);
      if (!row) return json(res, 404, { error: 'not found' });
      return json(res, 200, verifyReplay(row.id, JSON.parse(row.replay) as ReplayLog));
    }
    if ((m = path.match(/^\/overlay\/([\w-]+)$/))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return void res.end(overlayHtml(m[1]!));
    }
    // ---------------- admin
    if (path.startsWith('/api/admin/')) {
      if (!this.isAdmin(req)) return json(res, 403, { error: 'admin only' });
      if (path === '/api/admin/simulate' && req.method === 'POST') return json(res, 200, this.simulate(Math.min(2000, Number(body.count ?? 50)), { mode: body.mode as string | undefined }));
      if (path === '/api/admin/tournaments' && req.method === 'POST') {
        const t = this.tournaments.create({ name: String(body.name ?? 'Custom Cup'), format: (body.format as never) ?? 'single', startsAt: Number(body.startsAt ?? this.clock.now() + 60_000), maxPlayers: Number(body.maxPlayers ?? 64), minPlayers: Number(body.minPlayers ?? 4) });
        return json(res, 200, { tournament: t });
      }
      if ((m = path.match(/^\/api\/admin\/tournaments\/([\w-]+)\/start$/))) return json(res, 200, { tournament: this.tournaments.start(m[1]!, { force: true }) });
      if (path === '/api/admin/worldcup/open' && req.method === 'POST') return json(res, 200, { worldcup: this.worldcup.open({ qualifiersAt: body.qualifiersAt ? Number(body.qualifiersAt) : undefined }) });
      if (path === '/api/admin/worldcup/start' && req.method === 'POST') {
        const w = this.worldcup.current() ?? this.worldcup.open();
        this.worldcup.startQualifiers(w.id);
        return json(res, 200, { worldcup: this.worldcup.current(), leaderboard: this.worldcup.leaderboard() });
      }
      if (path === '/api/admin/season/rollover' && req.method === 'POST') return json(res, 200, { season: this.seasons.rollover() });
      if (path === '/api/admin/flags') return json(res, 200, { players: this.db.all<PlayerRow>("SELECT id,name,flags FROM players WHERE flags != '{}'") });
      return json(res, 404, { error: 'unknown admin route' });
    }
    if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    return this.serveStatic(path, res);
  }

  private serveStatic(path: string, res: ServerResponse): void {
    const dir = this.cfg.staticDir;
    if (!dir || !existsSync(dir)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('Contaminant server is running. Build the client (npm run build:client) to serve it here.');
    }
    const root = resolve(dir);
    let file = normalize(join(root, decodeURIComponent(path)));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  }

  // ---------------------------------------------------------------- WebSocket

  private onSocket(ws: WebSocket, _req: IncomingMessage): void {
    const conn: Conn = {
      id: randomBytes(6).toString('hex'),
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
    };
    ws.on('message', (raw) => {
      if (!this.allow(`ws:${conn.id}`, 30, 60)) return conn.send({ t: 'error', msg: 'slow down', code: 'rate' });
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return conn.send({ t: 'error', msg: 'bad json' });
      }
      try {
        this.handleMessage(conn, msg);
      } catch (e) {
        this.log(`ws error: ${(e as Error).stack}`);
        conn.send({ t: 'error', msg: 'server error' });
      }
    });
    ws.on('close', () => this.dropConn(conn));
  }

  dropConn(conn: Conn): void {
    if (conn.playerId) {
      const set = this.conns.get(conn.playerId);
      set?.delete(conn);
      if (set && !set.size) {
        this.conns.delete(conn.playerId);
        this.mm.leave(conn.playerId, true);
      }
    }
    for (const r of this.rooms.rooms.values()) r.removeSpectator(conn);
  }

  private resolveDeck(p: PlayerRow, deckId?: string, payload?: DeckPayload): { characters: { defId: string; level?: number }[]; items: string[] } | string {
    if (payload) {
      const c = validateCharDeck(payload.characters);
      const i = validateItemDeck(payload.items);
      if (!c.ok || !i.ok) return [...c.errors, ...i.errors].join('; ');
      const col = this.players.collection(p.id);
      for (const ch of payload.characters) if (!col.chars[ch.defId]) return `you do not own ${ch.defId}`;
      return { characters: payload.characters.map((ch) => ({ ...ch, level: col.chars[ch.defId]?.level ?? 1 })), items: payload.items };
    }
    const d = this.players.deck(p.id, deckId);
    if (!d) return 'no deck';
    return { characters: d.characters, items: d.items };
  }

  handleMessage(conn: Conn, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      const p = this.players.byToken(msg.token);
      if (!p) return conn.send({ t: 'error', msg: 'unknown token', code: 'auth' });
      conn.playerId = p.id;
      if (!this.conns.has(p.id)) this.conns.set(p.id, new Set());
      this.conns.get(p.id)!.add(conn);
      conn.send({ t: 'welcome', player: { id: p.id, name: p.name, mmr: Math.round(p.mmr), division: divisionFor(p.mmr).label }, serverTime: this.clock.now() });
      this.rooms.forPlayer(p.id)?.resume(p.id);
      return;
    }
    if (msg.t === 'ping') return conn.send({ t: 'pong', at: msg.at, serverTime: this.clock.now() });
    if (msg.t === 'spectate') {
      const room = this.rooms.get(msg.match);
      if (!room) return conn.send({ t: 'error', msg: 'match not found' });
      room.addSpectator(conn, !!msg.caster && !!room.opts.featured);
      return;
    }
    if (msg.t === 'unspectate') return this.rooms.get(msg.match)?.removeSpectator(conn);
    const p = conn.playerId ? this.players.byId(conn.playerId) : undefined;
    if (!p) return conn.send({ t: 'error', msg: 'say hello first', code: 'auth' });
    switch (msg.t) {
      case 'queue': {
        if (this.rooms.forPlayer(p.id)) return conn.send({ t: 'error', msg: 'already in a match' });
        const deck = this.resolveDeck(p, msg.deckId, msg.deck);
        if (typeof deck === 'string') return conn.send({ t: 'error', msg: deck, code: 'deck' });
        const party = msg.queue === 'team' ? this.mm.partyOf(p.id) : undefined;
        this.mm.join({ playerId: p.id, name: p.name, mmr: p.mmr, teamMmr: p.team_mmr, games: p.games, deck, joinedAt: this.clock.now(), queue: msg.queue, partyId: party?.code, mode: msg.mode });
        return;
      }
      case 'leave_queue':
        return this.mm.leave(p.id);
      case 'plan': {
        const room = this.rooms.get(msg.match);
        if (!room) return conn.send({ t: 'error', msg: 'match not found' });
        const r = room.submitPlan(p.id, msg.plan, { commit: msg.commit, final: msg.final, round: msg.round });
        if (!r.ok) conn.send({ t: 'error', msg: r.error ?? 'plan rejected', code: 'plan' });
        return;
      }
      case 'op': {
        const room = this.rooms.get(msg.match);
        if (!room) return conn.send({ t: 'error', msg: 'match not found' });
        const r = room.applyOp(p.id, msg.op);
        if (!r.ok) conn.send({ t: 'error', msg: r.error ?? 'operation rejected', code: 'op' });
        return;
      }
      case 'surrender':
        return this.rooms.get(msg.match)?.surrender(p.id);
      case 'resume':
        return this.rooms.get(msg.match)?.resume(p.id);
      case 'friend_create': {
        const code = randomBytes(3).toString('hex').toUpperCase();
        this.lobbies.set(code, { code, host: p.id, deckId: msg.deckId, planningSeconds: Math.max(15, Math.min(90, Math.round(msg.planningSeconds ?? 30))), mode: msg.mode ?? 'contamination', created: this.clock.now() });
        return conn.send({ t: 'friend_code', code });
      }
      case 'friend_join': {
        const lobby = this.lobbies.get(String(msg.code).toUpperCase());
        if (!lobby || lobby.host === p.id) return conn.send({ t: 'error', msg: 'lobby not found' });
        this.lobbies.delete(lobby.code);
        const host = this.players.byId(lobby.host)!;
        const d0 = this.resolveDeck(host, lobby.deckId);
        const d1 = this.resolveDeck(p, msg.deckId);
        if (typeof d0 === 'string' || typeof d1 === 'string') return conn.send({ t: 'error', msg: 'deck problem' });
        const room = this.rooms.create(
          [
            { playerId: host.id, name: host.name, deck: d0, mmr: host.mmr },
            { playerId: p.id, name: p.name, deck: d1, mmr: p.mmr },
          ],
          { kind: 'friendly', friendly: true, planningSeconds: lobby.planningSeconds, mode: lobby.mode as never },
        );
        room.start();
        return;
      }
      case 'party_create': {
        const party = this.mm.createParty(p.id);
        return conn.send({ t: 'party', code: party.code, members: party.members });
      }
      case 'party_join': {
        const party = this.mm.joinParty(msg.code, p.id);
        if (!party) return conn.send({ t: 'error', msg: 'party not found or full' });
        for (const mid of party.members) this.notify(mid, { t: 'party', code: party.code, members: party.members });
        return;
      }
      case 'rtc_signal': {
        // WebRTC signaling relay for peer-to-peer friendly matches (lockstep + commit–reveal on the clients)
        if (typeof msg.to !== 'string' || JSON.stringify(msg.data ?? null).length > 16_000) return;
        return this.notify(msg.to, { t: 'rtc_signal', from: p.id, data: msg.data });
      }
      default:
        return conn.send({ t: 'error', msg: 'unknown message' });
    }
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveP) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 256 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveP(chunks.length ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>) : {});
      } catch {
        resolveP({});
      }
    });
    req.on('error', () => resolveP({}));
  });
}
