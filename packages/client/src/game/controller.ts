// Match controllers: the same interface for offline (local engine vs bot), online (authoritative server)
// and tutorial (scripted chamber) matches, so the match screen does not care where the game runs.

import {
  applyImmediateItem,
  botPlan,
  discardFromHand,
  emptyPlan,
  eventsFor,
  freeRequirementMet,
  isImmediateItem,
  ITEMS,
  lockOffer,
  newMatch,
  paidReroll,
  playRound,
  validatePlan,
  viewFor,
  type BotOptions,
  type CharCard,
  type CreateMatchOptions,
  type GameEvent,
  type GameState,
  type MatchInfo,
  type Plan,
  type PlanningOp,
  type PlayerId,
  type ServerMsg,
} from '@contaminant/engine';
import type { GameSocket } from '../net/socket.ts';

export interface MatchEnd {
  winner: PlayerId | 'draw' | null;
  reason: string | null;
  rewards?: unknown;
  mmr?: { before: number; after: number; division: string };
}

export interface MatchSnapshot {
  info: MatchInfo;
  view: GameState;
  prevView: GameState | null;
  roundEvents: GameEvent[];
  deadline: number;
  opponentReady: boolean;
  ended: MatchEnd | null;
  ack: { issues: { index: number; error: string }[]; cost: number } | null;
  watch: { unit: string; commands: unknown[] } | null;
  /** increments on every resolved round */
  roundSerial: number;
}

export interface MatchController {
  snapshot(): MatchSnapshot;
  subscribe(fn: (s: MatchSnapshot) => void): () => void;
  submit(plan: Plan, final: boolean): void;
  op(op: PlanningOp): { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>;
  surrender(): void;
  dispose(): void;
  readonly kind: 'local' | 'online' | 'tutorial' | 'p2p';
}

abstract class Base implements MatchController {
  abstract kind: 'local' | 'online' | 'tutorial';
  protected subs = new Set<(s: MatchSnapshot) => void>();
  protected snap!: MatchSnapshot;
  snapshot() {
    return this.snap;
  }
  subscribe(fn: (s: MatchSnapshot) => void) {
    this.subs.add(fn);
    fn(this.snap);
    return () => this.subs.delete(fn);
  }
  protected emit(patch: Partial<MatchSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const f of this.subs) f(this.snap);
  }
  abstract submit(plan: Plan, final: boolean): void;
  abstract op(op: PlanningOp): { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>;
  abstract surrender(): void;
  dispose() {
    this.subs.clear();
  }
}

/** Offline: the engine runs in the browser, the opponent is a bot that plans on its own fog-of-war view. */
export class LocalMatch extends Base {
  kind: 'local' | 'tutorial' = 'local';
  readonly state: GameState;
  private plan: Plan | null = null;
  private timer: number | null = null;
  private planningSeconds: number;
  private bot: BotOptions;
  private serial = 0;
  /** scripted opponent (Basic Training); defaults to the bot */
  private opponent?: (s: GameState) => Plan;

  constructor(opts: CreateMatchOptions & { bot?: BotOptions; planningSeconds?: number; existing?: GameState; opponent?: (s: GameState) => Plan }) {
    super();
    this.state = opts.existing ?? newMatch(opts);
    this.bot = opts.bot ?? { difficulty: 'normal' };
    this.opponent = opts.opponent;
    this.planningSeconds = opts.planningSeconds ?? this.state.settings.planningSeconds;
    const info: MatchInfo = { match: this.state.id, kind: 'bot', you: 0, names: [this.state.players[0].name, this.state.players[1].name], planningSeconds: this.planningSeconds };
    this.snap = { info, view: viewFor(this.state, 0), prevView: null, roundEvents: [], deadline: this.deadline(), opponentReady: true, ended: null, ack: null, watch: null, roundSerial: 0 };
    this.arm();
  }

  private deadline(): number {
    return this.planningSeconds > 0 ? Date.now() + this.planningSeconds * 1000 : 0;
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.planningSeconds > 0 && this.state.phase === 'planning') this.timer = window.setTimeout(() => this.resolve(), this.planningSeconds * 1000 + 300);
  }

  submit(plan: Plan, final: boolean): void {
    this.plan = plan;
    const chk = validatePlan(this.state, { ...plan, player: 0 });
    this.emit({ ack: { issues: chk.issues, cost: chk.cost } });
    if (final) this.resolve();
  }

  op(op: PlanningOp): { ok: boolean; error?: string } {
    const r = applyLocalOp(this.state, 0, op, this.plan);
    if (r.ok) this.emit({ view: viewFor(this.state, 0) });
    return r;
  }

  surrender(): void {
    this.state.winner = 1;
    this.state.winReason = 'You surrendered';
    this.state.phase = 'over';
    this.emit({ ended: { winner: 1, reason: 'You surrendered' } });
  }

  resolve(): void {
    if (this.state.phase !== 'planning') return;
    if (this.timer) clearTimeout(this.timer);
    const prev = viewFor(this.state, 0);
    const p1 = this.opponent ? this.opponent(this.state) : botPlan(this.state, 1, this.bot);
    const before = this.state.events.length;
    playRound(this.state, [this.plan ? { ...this.plan, player: 0 } : emptyPlan(0), p1]);
    this.plan = null;
    const events = eventsFor(this.state.events.slice(before), 0);
    this.serial++;
    const over = (this.state.phase as string) === 'over';
    this.emit({
      view: viewFor(this.state, 0),
      prevView: prev,
      roundEvents: events,
      deadline: over ? 0 : this.deadline(),
      ack: null,
      roundSerial: this.serial,
      ended: over ? { winner: this.state.winner, reason: this.state.winReason } : null,
    });
    if (!over) this.arm();
  }

  override dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    super.dispose();
  }
}

export function applyLocalOp(state: GameState, p: PlayerId, op: PlanningOp, plan: Plan | null): { ok: boolean; error?: string } {
  const pl = state.players[p];
  switch (op.kind) {
    case 'lock':
      return lockOffer(state, p, op.card, op.locked) ? { ok: true } : { ok: false, error: 'card not offered' };
    case 'reroll':
      return paidReroll(state, p, op.card);
    case 'watch':
      return { ok: true };
    case 'immediate': {
      const card = pl.hand.find((c) => c.uid === op.card);
      const it = card ? ITEMS[card.itemId] : undefined;
      if (!card || !it || card.tarnished || !isImmediateItem(it.id)) return { ok: false, error: 'not an instant card' };
      if (pl.cardsPlayedThisRound >= 3) return { ok: false, error: 'at most 3 cards per round' };
      if (pl.itemNamesThisRound.includes(it.name)) return { ok: false, error: 'same card name once per round' };
      if (it.cost === 0 && pl.freeCardsThisRound >= 2) return { ok: false, error: 'at most 2 Free cards per round' };
      const cmd = { kind: 'item' as const, card: card.uid, target: { choice: op.choice } };
      const planned = plan?.commands.filter((c) => c.kind === 'item' || ((c.kind === 'attack' || c.kind === 'ability') && c.item)).length ?? 0;
      const req = it.cost === 0 ? freeRequirementMet(state, p, it.id, cmd, { cards: pl.cardsPlayedThisRound + planned, others: [] }) : null;
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

/** Online: everything is decided by the server; this only mirrors the messages. */
export class OnlineMatch extends Base {
  kind = 'online' as const;
  private off: () => void;
  private socket: GameSocket;
  private serial = 0;

  constructor(socket: GameSocket, start: Extract<ServerMsg, { t: 'match_start' }>) {
    super();
    this.socket = socket;
    this.snap = { info: start.info, view: start.view, prevView: null, roundEvents: [], deadline: socket.localTime(start.deadline), opponentReady: false, ended: null, ack: null, watch: null, roundSerial: 0 };
    this.off = socket.on((m) => this.onMsg(m));
  }

  private onMsg(m: ServerMsg): void {
    if ('match' in m && m.match !== this.snap.info.match) return;
    switch (m.t) {
      case 'match_start':
        this.emit({ view: m.view, deadline: this.socket.localTime(m.deadline) });
        break;
      case 'state':
        this.emit({ view: m.view, deadline: this.socket.localTime(m.deadline) });
        break;
      case 'round':
        this.serial++;
        this.emit({ prevView: this.snap.view, view: m.view, roundEvents: m.events, deadline: m.deadline ? this.socket.localTime(m.deadline) : 0, opponentReady: false, ack: null, watch: null, roundSerial: this.serial });
        break;
      case 'plan_ack':
        this.emit({ ack: { issues: m.issues, cost: m.cost } });
        break;
      case 'opponent_ready':
        this.emit({ opponentReady: true });
        break;
      case 'watch_reveal':
        this.emit({ watch: { unit: m.unit, commands: m.commands } });
        break;
      case 'match_end':
        this.emit({ ended: { winner: m.winner, reason: m.reason, rewards: m.rewards, mmr: m.mmr } });
        break;
      default:
        break;
    }
  }

  submit(plan: Plan, final: boolean): void {
    this.socket.send({ t: 'plan', match: this.snap.info.match, plan, final, round: this.snap.view.round });
  }

  op(op: PlanningOp): Promise<{ ok: boolean; error?: string }> {
    this.socket.send({ t: 'op', match: this.snap.info.match, op });
    return Promise.resolve({ ok: true });
  }

  surrender(): void {
    this.socket.send({ t: 'surrender', match: this.snap.info.match });
  }

  override dispose(): void {
    this.off();
    super.dispose();
  }
}

export function cardsFor(defIds: { defId: string; level?: number }[], prefix: string): CharCard[] {
  return defIds.map((c, i) => ({ uid: `${prefix}${i + 1}`, defId: c.defId, level: c.level ?? 1, tuning: {} }));
}
