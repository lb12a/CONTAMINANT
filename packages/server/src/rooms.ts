// Authoritative match rooms: the server owns the GameState, collects secret plans with a deadline,
// validates everything (anti-cheat), resolves rounds and sends each player only their fog-of-war view.

import {
  applyImmediateItem,
  botPlan,
  emptyPlan,
  eventsFor,
  freeRequirementMet,
  isImmediateItem,
  ITEMS,
  lockOffer,
  newMatch,
  paidReroll,
  planCommit,
  playRound,
  spectatorView,
  stateHash,
  validatePlan,
  viewFor,
  discardFromHand,
  type BotOptions,
  type DeckCardInput,
  type GameEvent,
  type GameState,
  type MatchInfo,
  type ModeId,
  type Plan,
  type PlanningOp,
  type PlayerId,
  type ServerMsg,
  type Zone,
} from '@contaminant/engine';

export interface Conn {
  id: string;
  playerId?: string;
  send(m: ServerMsg): void;
  close(): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

export interface SeatSpec {
  playerId: string;
  name: string;
  deck: { characters: DeckCardInput[]; items: string[] };
  bot?: BotOptions;
  mmr?: number;
}

export type RoomKind = 'ranked' | 'casual' | 'friendly' | 'tournament' | 'wm' | 'bot' | 'team';

export interface RoomOptions {
  kind: RoomKind;
  mode?: ModeId;
  planningSeconds?: number;
  friendly?: boolean;
  seed?: number;
  zone?: Zone;
  tournamentId?: string;
  tournamentMatchId?: string;
  featured?: boolean;
  spectatorDelayRounds?: number;
  /** grace period after the deadline for network latency */
  graceMs?: number;
  maxMissedRounds?: number;
}

export interface RoomResult {
  winner: PlayerId | 'draw' | null;
  reason: string | null;
  vp: [number, number];
  rounds: number;
  margin: number;
}

interface Seat extends SeatSpec {
  index: PlayerId;
  plan: Plan | null;
  ready: boolean;
  missed: number;
  commit?: string;
  watch?: string;
  invalidRatio: number[];
}

interface Frame {
  round: number;
  view: GameState;
  events: GameEvent[];
}

export interface ReplayRound {
  ops: { seat: PlayerId; op: PlanningOp }[];
  plans: [Plan, Plan];
  hash: string;
}

export interface ReplayLog {
  seed: number;
  settings: { mode: ModeId; planningSeconds: number; friendly: boolean; zone: Zone };
  seats: { name: string; deck: { characters: DeckCardInput[]; items: string[] }; bot?: boolean }[];
  rounds: ReplayRound[];
  finalHash?: string;
}

export interface RoomHost {
  clock: Clock;
  connsOf(playerId: string): Conn[];
  onEnd(room: MatchRoom, result: RoomResult): unknown;
  weights?(): Record<string, number>;
  log?(msg: string): void;
}

let roomCounter = 0;

export class MatchRoom {
  readonly id: string;
  readonly kind: RoomKind;
  readonly state: GameState;
  readonly seats: [Seat, Seat];
  readonly opts: RoomOptions;
  readonly spectators = new Set<Conn>();
  readonly casters = new Set<Conn>();
  readonly frames: Frame[] = [];
  readonly replay: ReplayLog;
  readonly createdAt: number;
  deadline = 0;
  ended = false;
  result: RoomResult | null = null;
  private timer: unknown = null;
  private watchTimer: unknown = null;
  private pendingOps: { seat: PlayerId; op: PlanningOp }[] = [];

  private host: RoomHost;

  constructor(host: RoomHost, seats: [SeatSpec, SeatSpec], opts: RoomOptions) {
    this.host = host;
    this.id = `r${Date.now().toString(36)}${(++roomCounter).toString(36)}`;
    this.kind = opts.kind;
    this.opts = { planningSeconds: 30, spectatorDelayRounds: opts.featured ? 2 : 1, graceMs: 1500, maxMissedRounds: 3, ...opts };
    this.createdAt = host.clock.now();
    const seed = opts.seed ?? (Math.floor(Math.random() * 2 ** 31) ^ host.clock.now());
    const friendly = opts.friendly ?? opts.kind === 'friendly';
    const settings = { mode: opts.mode ?? 'contamination', planningSeconds: this.opts.planningSeconds!, friendly, zone: opts.zone ?? 'laboratory' } as ReplayLog['settings'];
    this.state = buildMatchState(this.id, seed, settings, seats);
    this.seats = seats.map((s, i): Seat => ({ ...s, index: i as PlayerId, plan: null, ready: false, missed: 0, invalidRatio: [] })) as [Seat, Seat];
    this.replay = { seed, settings, seats: seats.map((s) => ({ name: s.name, deck: s.deck, bot: !!s.bot })), rounds: [] };
  }

  get allBots(): boolean {
    return this.seats.every((s) => !!s.bot);
  }

  info(seat: PlayerId): MatchInfo {
    return {
      match: this.id,
      kind: this.kind,
      you: seat,
      names: [this.seats[0].name, this.seats[1].name],
      mmr: [this.seats[0].mmr ?? 0, this.seats[1].mmr ?? 0],
      planningSeconds: this.opts.planningSeconds!,
      tournament: this.opts.tournamentId,
    };
  }

  private send(seat: Seat, m: ServerMsg): void {
    if (seat.bot) return;
    for (const c of this.host.connsOf(seat.playerId)) c.send(m);
  }

  start(): void {
    if (this.allBots) {
      this.autoplay();
      return;
    }
    this.beginPlanning(true);
  }

  /** Bot vs bot: resolve instantly (tournament fillers, simulations). */
  autoplay(): void {
    let guard = 0;
    while (!this.ended && guard++ < 80) {
      for (const s of this.seats) s.plan = botPlan(this.state, s.index, { ...s.bot, weights: this.host.weights?.() });
      this.resolve();
    }
  }

  private beginPlanning(first = false): void {
    const now = this.host.clock.now();
    this.deadline = now + this.opts.planningSeconds! * 1000;
    for (const s of this.seats) {
      s.plan = null;
      s.ready = false;
      s.commit = undefined;
      if (s.bot) {
        s.plan = botPlan(this.state, s.index, { ...s.bot, weights: this.host.weights?.() });
        s.ready = true;
      }
    }
    for (const s of this.seats) {
      const view = viewFor(this.state, s.index);
      if (first) this.send(s, { t: 'match_start', info: this.info(s.index), view, deadline: this.deadline });
    }
    this.host.clock.clearTimeout(this.timer);
    this.timer = this.host.clock.setTimeout(() => this.resolve(), this.opts.planningSeconds! * 1000 + this.opts.graceMs!);
    this.host.clock.clearTimeout(this.watchTimer);
    if (this.opts.planningSeconds! > 10) {
      this.watchTimer = this.host.clock.setTimeout(() => this.revealWatches(), (this.opts.planningSeconds! - 10) * 1000);
    }
    this.maybeResolveEarly();
  }

  /** Scarecrow – Watchful Eye: in the last 10 s the watcher sees the watched unit's full plan (Lab Assistant immune). */
  revealWatches(): void {
    for (const s of this.seats) {
      if (!s.watch || s.bot) continue;
      const hasScarecrow = this.state.units.some((u) => u.owner === s.index && u.defId === 'scarecrow');
      if (!hasScarecrow) continue;
      const enemy = this.seats[s.index === 0 ? 1 : 0];
      const unit = this.state.units.find((u) => u.uid === s.watch);
      if (!unit || unit.owner === s.index || unit.defId === 'lab_assistant') continue;
      const cmds = (enemy.plan?.commands ?? []).filter((c) => 'unit' in c && c.unit === unit.uid);
      this.send(s, { t: 'watch_reveal', match: this.id, unit: unit.uid, commands: cmds });
    }
  }

  submitPlan(playerId: string, plan: Plan, opts: { commit?: string; final?: boolean; round?: number } = {}): { ok: boolean; error?: string } {
    const seat = this.seats.find((s) => s.playerId === playerId && !s.bot);
    if (!seat) return { ok: false, error: 'not a player in this match' };
    if (this.ended || this.state.phase !== 'planning') return { ok: false, error: 'not in planning phase' };
    if (opts.round !== undefined && opts.round !== this.state.round) return { ok: false, error: 'stale plan for an old round' };
    if (this.host.clock.now() > this.deadline + this.opts.graceMs!) return { ok: false, error: 'planning time is over' };
    if (JSON.stringify(plan).length > 64_000) return { ok: false, error: 'plan too large' };
    const normalized: Plan = { player: seat.index, commands: Array.isArray(plan.commands) ? plan.commands.slice(0, 40) : [], rest: Array.isArray(plan.rest) ? plan.rest.slice(0, 10) : [], speedShift: plan.speedShift, watch: plan.watch };
    const check = validatePlan(this.state, normalized);
    seat.invalidRatio.push(normalized.commands.length ? check.issues.length / normalized.commands.length : 0);
    seat.plan = normalized;
    seat.commit = opts.commit ?? planCommit(normalized, `${this.id}:${this.state.round}`);
    if (normalized.watch) seat.watch = normalized.watch;
    seat.ready = !!opts.final;
    seat.missed = 0;
    this.send(seat, { t: 'plan_ack', match: this.id, issues: check.issues, cost: check.cost, commit: seat.commit });
    const other = this.seats[seat.index === 0 ? 1 : 0];
    if (seat.ready) this.send(other, { t: 'opponent_ready', match: this.id });
    // a late plan after the reveal: update the watcher immediately
    if (this.host.clock.now() >= this.deadline - 10_000) this.revealWatches();
    this.maybeResolveEarly();
    return { ok: true };
  }

  applyOp(playerId: string, op: PlanningOp): { ok: boolean; error?: string } {
    const seat = this.seats.find((s) => s.playerId === playerId && !s.bot);
    if (!seat) return { ok: false, error: 'not a player in this match' };
    if (this.ended || this.state.phase !== 'planning') return { ok: false, error: 'not in planning phase' };
    const p = seat.index;
    let res: { ok: boolean; error?: string } = { ok: false, error: 'unknown op' };
    switch (op.kind) {
      case 'lock':
      case 'reroll':
        res = applyPlanningOp(this.state, p, op, 0);
        break;
      case 'watch':
        seat.watch = op.unit;
        res = { ok: true };
        break;
      case 'immediate': {
        const plannedCards = seat.plan?.commands.filter((c) => c.kind === 'item' || ((c.kind === 'attack' || c.kind === 'ability') && c.item)).length ?? 0;
        res = applyPlanningOp(this.state, p, op, plannedCards);
        break;
      }
    }
    if (res.ok) {
      this.pendingOps.push({ seat: p, op });
      this.send(seat, { t: 'state', match: this.id, view: viewFor(this.state, p), deadline: this.deadline });
    }
    return res;
  }

  surrender(playerId: string): void {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat || this.ended) return;
    this.state.winner = seat.index === 0 ? 1 : 0;
    this.state.winReason = `${seat.name} surrendered`;
    this.state.phase = 'over';
    this.finish();
  }

  private maybeResolveEarly(): void {
    if (this.seats.every((s) => s.ready)) {
      this.host.clock.clearTimeout(this.timer);
      // resolve on the next tick so plan_ack messages go out first
      this.timer = this.host.clock.setTimeout(() => this.resolve(), 0);
    }
  }

  resolve(): void {
    if (this.ended || this.state.phase !== 'planning') return;
    this.host.clock.clearTimeout(this.timer);
    this.host.clock.clearTimeout(this.watchTimer);
    const plans = this.seats.map((s) => {
      if (!s.plan) {
        s.missed++;
        return emptyPlan(s.index);
      }
      return s.plan;
    }) as [Plan, Plan];
    const before = this.state.events.length;
    playRound(this.state, plans);
    const roundEvents = this.state.events.slice(before);
    this.replay.rounds.push({ ops: this.pendingOps, plans, hash: stateHash(this.state) });
    this.pendingOps = [];
    // spectators: full information, delayed
    this.frames.push({ round: this.state.round, view: spectatorView(this.state), events: roundEvents });
    this.pushSpectatorFrames();
    // forfeit after too many missed rounds without a connection
    for (const s of this.seats) {
      if (!s.bot && s.missed >= this.opts.maxMissedRounds! && this.host.connsOf(s.playerId).length === 0 && this.state.phase !== 'over') {
        this.state.winner = s.index === 0 ? 1 : 0;
        this.state.winReason = `${s.name} abandoned the match`;
        this.state.phase = 'over';
      }
    }
    if (this.state.phase === 'over') {
      for (const s of this.seats) this.send(s, { t: 'round', match: this.id, view: viewFor(this.state, s.index), events: eventsFor(roundEvents, s.index), deadline: 0 });
      this.finish();
      return;
    }
    if (this.allBots) return;
    this.beginPlanning();
    for (const s of this.seats) this.send(s, { t: 'round', match: this.id, view: viewFor(this.state, s.index), events: eventsFor(roundEvents, s.index), deadline: this.deadline });
  }

  private pushSpectatorFrames(final = false): void {
    const delay = final ? 0 : this.opts.spectatorDelayRounds!;
    const idx = this.frames.length - 1 - delay;
    const send = (f: Frame) => {
      const m: ServerMsg = { t: 'spectate_frame', match: this.id, round: f.round, view: f.view, events: f.events, delayRounds: delay, names: [this.seats[0].name, this.seats[1].name] };
      for (const c of this.spectators) c.send(m);
      for (const c of this.casters) c.send(m);
    };
    if (final) {
      for (let i = Math.max(0, this.frames.length - 1 - this.opts.spectatorDelayRounds!); i < this.frames.length; i++) send(this.frames[i]!);
      return;
    }
    if (idx >= 0) send(this.frames[idx]!);
  }

  addSpectator(c: Conn, caster = false): void {
    (caster ? this.casters : this.spectators).add(c);
    const delay = this.ended ? 0 : this.opts.spectatorDelayRounds!;
    const f = this.frames[this.frames.length - 1 - delay];
    if (f) c.send({ t: 'spectate_frame', match: this.id, round: f.round, view: f.view, events: f.events, delayRounds: delay, names: [this.seats[0].name, this.seats[1].name] });
  }

  removeSpectator(c: Conn): void {
    this.spectators.delete(c);
    this.casters.delete(c);
  }

  /** Re-sends the current state to a reconnecting player. */
  resume(playerId: string): void {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat) return;
    this.send(seat, { t: 'match_start', info: this.info(seat.index), view: viewFor(this.state, seat.index), deadline: this.deadline });
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.host.clock.clearTimeout(this.timer);
    this.host.clock.clearTimeout(this.watchTimer);
    const vp: [number, number] = [this.state.players[0].vp, this.state.players[1].vp];
    this.result = {
      winner: this.state.winner,
      reason: this.state.winReason,
      vp,
      rounds: this.state.round,
      margin: Math.abs(vp[0] - vp[1]),
    };
    this.replay.finalHash = stateHash(this.state);
    const extra = this.host.onEnd(this, this.result) as Record<string, unknown> | undefined;
    for (const s of this.seats) {
      const mine = (extra?.[s.playerId] ?? undefined) as { rewards?: unknown; mmr?: { before: number; after: number; division: string } } | undefined;
      this.send(s, { t: 'match_end', match: this.id, winner: this.result.winner, reason: this.result.reason, rewards: mine?.rewards, mmr: mine?.mmr });
    }
    this.pushSpectatorFrames(true);
  }

  /** Anti-cheat signal: share of invalid commands a seat submitted. */
  suspicion(seat: PlayerId): number {
    const r = this.seats[seat].invalidRatio;
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  }
}

export class RoomManager {
  readonly rooms = new Map<string, MatchRoom>();
  private host: RoomHost;
  constructor(host: RoomHost) {
    this.host = host;
  }

  create(seats: [SeatSpec, SeatSpec], opts: RoomOptions): MatchRoom {
    const room = new MatchRoom(this.host, seats, opts);
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): MatchRoom | undefined {
    return this.rooms.get(id);
  }

  forPlayer(playerId: string): MatchRoom | undefined {
    for (const r of this.rooms.values()) if (!r.ended && r.seats.some((s) => s.playerId === playerId)) return r;
    return undefined;
  }

  live(): { id: string; kind: string; names: [string, string]; round: number; vp: [number, number]; featured: boolean; tournament?: string; delayRounds: number }[] {
    return [...this.rooms.values()]
      .filter((r) => !r.ended && !r.allBots)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        names: [r.seats[0].name, r.seats[1].name] as [string, string],
        round: r.state.round,
        vp: [r.state.players[0].vp, r.state.players[1].vp] as [number, number],
        featured: !!r.opts.featured,
        tournament: r.opts.tournamentId,
        delayRounds: r.opts.spectatorDelayRounds!,
      }));
  }

  /** Drop finished rooms after a while (spectators keep them alive for 10 minutes). */
  sweep(now: number): void {
    for (const [id, r] of this.rooms) if (r.ended && now - r.createdAt > 10 * 60_000) this.rooms.delete(id);
  }
}

// ---------------------------------------------------------------- shared helpers (rooms + replay verification)

export function buildMatchState(id: string, seed: number, settings: ReplayLog['settings'], seats: { name: string; deck: { characters: DeckCardInput[]; items: string[] }; bot?: unknown }[]): GameState {
  return newMatch({
    id,
    seed,
    settings: { mode: settings.mode, planningSeconds: settings.planningSeconds, friendly: settings.friendly, zone: settings.zone, maxRounds: 40 },
    players: seats.map((s) => ({
      name: s.name,
      cards: s.deck.characters.map((c, i) => ({ uid: `c${i + 1}`, defId: c.defId, level: c.level ?? 1, tuning: c.tuning ?? {} })),
      items: s.deck.items,
      isBot: !!s.bot,
    })) as [never, never],
  });
}

/** Planning-phase operations that change state immediately (offer locks, paid re-rolls, instant Intel cards). */
export function applyPlanningOp(state: GameState, p: PlayerId, op: PlanningOp, plannedCards: number): { ok: boolean; error?: string } {
  const pl = state.players[p];
  switch (op.kind) {
    case 'lock':
      return lockOffer(state, p, op.card, !!op.locked) ? { ok: true } : { ok: false, error: 'card not offered' };
    case 'reroll':
      return paidReroll(state, p, op.card);
    case 'watch':
      return { ok: true };
    case 'immediate': {
      const card = pl.hand.find((c) => c.uid === op.card);
      const it = card ? ITEMS[card.itemId] : undefined;
      if (!card || !it || card.tarnished) return { ok: false, error: 'card not playable' };
      if (!isImmediateItem(it.id)) return { ok: false, error: 'not an instant card' };
      if (pl.cardsPlayedThisRound >= 3) return { ok: false, error: 'at most 3 cards per round' };
      if (it.cost === 0 && pl.freeCardsThisRound >= 2) return { ok: false, error: 'at most 2 Free cards per round' };
      if (pl.itemNamesThisRound.includes(it.name)) return { ok: false, error: 'same card name once per round' };
      const cmd = { kind: 'item' as const, card: card.uid, target: { choice: op.choice } };
      const req = it.cost === 0 ? freeRequirementMet(state, p, it.id, cmd, { cards: pl.cardsPlayedThisRound + plannedCards, others: [] }) : null;
      if (req) return { ok: false, error: req };
      if (it.cost > pl.ap) return { ok: false, error: 'not enough AP' };
      pl.ap -= it.cost;
      pl.apSpentThisRound += it.cost;
      discardFromHand(state, p, card.uid);
      pl.cardsPlayedThisRound++;
      if (it.cost === 0) pl.freeCardsThisRound++;
      pl.itemNamesThisRound.push(it.name);
      return applyImmediateItem(state, p, card, cmd);
    }
  }
}

/** Re-simulates a stored match from seed + ops + plans and compares the per-round state hashes. */
export function verifyReplay(id: string, log: ReplayLog): { ok: boolean; rounds: number; mismatchAt?: number; finalHash: string } {
  const s = buildMatchState(id, log.seed, log.settings, log.seats);
  for (const [i, r] of log.rounds.entries()) {
    for (const o of r.ops) applyPlanningOp(s, o.seat, o.op, 0);
    playRound(s, r.plans);
    if (stateHash(s) !== r.hash) return { ok: false, rounds: i + 1, mismatchAt: i + 1, finalHash: stateHash(s) };
  }
  const finalHash = stateHash(s);
  return { ok: !log.finalHash || finalHash === log.finalHash, rounds: log.rounds.length, finalHash };
}
