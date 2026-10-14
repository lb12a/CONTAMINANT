// Peer-to-peer friendly matches over WebRTC.
//
// The game server only relays the WebRTC handshake (rtc_signal). After that both browsers talk directly
// over a data channel and each runs the deterministic engine:
//   1. handshake: names, decks and one random seed half from each side → the same opening state
//   2. every round: each side sends a hash of its sealed plan (commit), and only after both commits
//      have arrived the plan itself with its salt (reveal); a reveal that does not match its commit
//      ends the match, so nobody can wait for the other plan and react to it
//   3. both resolve the round locally and compare state hashes to detect desyncs
// Hidden information lives on both machines, so P2P is for friendlies; ranked play stays on the server.

import {
  applyPlanningOp,
  buildMatchState,
  eventsFor,
  hashString,
  planCommit,
  playRound,
  stateHash,
  validatePlan,
  viewFor,
  type DeckCardInput,
  type GameState,
  type MatchInfo,
  type Plan,
  type PlanningOp,
  type PlayerId,
  type ServerMsg,
  type Zone,
} from '@contaminant/engine';
import type { GameSocket } from '../net/socket.ts';
import type { MatchController, MatchSnapshot } from './controller.ts';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const ZONES: Zone[] = ['laboratory', 'graveyard', 'bog', 'toyroom', 'forest', 'tomb'];

type Wire =
  | { type: 'hello'; name: string; deck: { characters: DeckCardInput[]; items: string[] }; seed: number; version: string }
  | { type: 'commit'; round: number; hash: string }
  | { type: 'reveal'; round: number; plan: Plan; salt: string; ops: PlanningOp[] }
  | { type: 'hash'; round: number; hash: string }
  | { type: 'surrender' };

export interface PeerInfo {
  name: string;
  deck: { characters: DeckCardInput[]; items: string[] };
}

type Status = 'idle' | 'waiting' | 'connecting' | 'connected' | 'failed';

function randomSalt(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(36)).join('');
}

/**
 * Signalling + data channel. `host` waits for a friend (its player id is the P2P code);
 * the joiner calls `connect(hostId)`.
 */
export class PeerLink {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private socket: GameSocket;
  private off: () => void;
  private peerId: string | null = null;
  status: Status = 'idle';
  onStatus: (s: Status, detail?: string) => void = () => undefined;
  onMessage: (m: Wire) => void = () => undefined;
  onOpen: (role: 'host' | 'joiner', peerId: string) => void = () => undefined;
  private role: 'host' | 'joiner' = 'host';

  constructor(socket: GameSocket) {
    this.socket = socket;
    this.off = socket.on((m: ServerMsg) => {
      if (m.t !== 'rtc_signal') return;
      void this.signal(m.from, m.data as { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit });
    });
  }

  private set(s: Status, detail?: string) {
    this.status = s;
    this.onStatus(s, detail);
  }

  /** Wait for a friend who enters our code. */
  host(): void {
    this.role = 'host';
    this.set('waiting');
  }

  async connect(hostId: string): Promise<void> {
    this.role = 'joiner';
    this.peerId = hostId;
    const pc = this.makePc();
    this.attach(pc.createDataChannel('contaminant', { ordered: true }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.send({ t: 'rtc_signal', to: hostId, data: { kind: 'offer', sdp: pc.localDescription!.toJSON() } });
    this.set('connecting');
  }

  private makePc(): RTCPeerConnection {
    this.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate && this.peerId) this.socket.send({ t: 'rtc_signal', to: this.peerId, data: { kind: 'ice', candidate: e.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.set('failed', 'The direct connection failed (strict firewall or NAT). Play through the server instead.');
    };
    pc.ondatachannel = (e) => this.attach(e.channel);
    return pc;
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.set('connected');
      this.onOpen(this.role, this.peerId!);
    };
    dc.onclose = () => this.status === 'connected' && this.set('failed', 'Your friend disconnected.');
    dc.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as Wire);
  }

  private async signal(from: string, d: { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (d.kind === 'offer' && this.role === 'host' && (this.status === 'waiting' || this.peerId === from)) {
      this.peerId = from;
      const pc = this.makePc();
      await pc.setRemoteDescription(d.sdp!);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.send({ t: 'rtc_signal', to: from, data: { kind: 'answer', sdp: pc.localDescription!.toJSON() } });
      this.set('connecting');
    } else if (d.kind === 'answer' && from === this.peerId) {
      await this.pc?.setRemoteDescription(d.sdp!);
    } else if (d.kind === 'ice' && from === this.peerId && d.candidate) {
      await this.pc?.addIceCandidate(d.candidate).catch(() => undefined);
    }
  }

  send(m: Wire): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(m));
  }

  close(): void {
    this.off();
    this.dc?.close();
    this.pc?.close();
  }
}

/** Match controller for a P2P friendly: lockstep rounds with commit–reveal. */
export class P2PMatch implements MatchController {
  readonly kind = 'p2p' as const;
  private subs = new Set<(s: MatchSnapshot) => void>();
  private snap: MatchSnapshot;
  private state: GameState;
  /** my view while planning: the shared state plus my own planning ops */
  private preview: GameState;
  private me: PlayerId;
  private link: PeerLink;
  private draft: Plan | null = null;
  private ops: PlanningOp[] = [];
  private salt = '';
  private myCommit: string | null = null;
  private theirCommit: string | null = null;
  private myReveal: { plan: Plan; salt: string; ops: PlanningOp[] } | null = null;
  private theirReveal: { plan: Plan; salt: string; ops: PlanningOp[] } | null = null;
  private hashes = new Map<number, string>();
  private timer: number | null = null;
  private serial = 0;
  readonly planningSeconds: number;
  /** set when the peers disagree about the state after a round */
  desync: number | null = null;

  constructor(link: PeerLink, me: PlayerId, seats: [PeerInfo, PeerInfo], seed: number, planningSeconds = 45) {
    this.link = link;
    this.me = me;
    this.planningSeconds = planningSeconds;
    const id = `p2p-${seed.toString(36)}`;
    this.state = buildMatchState(id, seed, { mode: 'contamination', planningSeconds, friendly: true, zone: ZONES[seed % ZONES.length]! }, seats);
    this.preview = structuredClone(this.state);
    const info: MatchInfo = { match: id, kind: 'p2p', you: me, names: [seats[0].name, seats[1].name], planningSeconds };
    this.snap = { info, view: viewFor(this.preview, me), prevView: null, roundEvents: [], deadline: this.deadline(), opponentReady: false, ended: null, ack: null, watch: null, roundSerial: 0 };
    link.onMessage = (m) => this.receive(m);
    link.onStatus = (s, detail) => {
      if (s === 'failed' && !this.snap.ended) this.end(this.me, detail ?? 'Connection lost');
    };
    this.arm();
  }

  private deadline() {
    return Date.now() + this.planningSeconds * 1000;
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer);
    // when the fuse burns down the current draft is sealed automatically
    this.timer = window.setTimeout(() => this.seal(), this.planningSeconds * 1000 + 200);
  }

  snapshot() {
    return this.snap;
  }

  subscribe(fn: (s: MatchSnapshot) => void) {
    this.subs.add(fn);
    fn(this.snap);
    return () => this.subs.delete(fn);
  }

  private emit(patch: Partial<MatchSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const f of this.subs) f(this.snap);
  }

  submit(plan: Plan, final: boolean): void {
    this.draft = { ...plan, player: this.me };
    const chk = validatePlan(this.preview, this.draft);
    this.emit({ ack: { issues: chk.issues, cost: chk.cost } });
    if (final) this.seal();
  }

  op(op: PlanningOp) {
    if (this.myCommit) return { ok: false, error: 'plan already sealed' };
    const r = applyPlanningOp(this.preview, this.me, op, 0);
    if (r.ok) {
      this.ops.push(op);
      this.emit({ view: viewFor(this.preview, this.me) });
    }
    return r;
  }

  private seal() {
    if (this.myCommit || this.snap.ended) return;
    const plan = this.draft ?? { player: this.me, commands: [], rest: [] };
    this.salt = randomSalt();
    this.myCommit = planCommit(plan, this.salt);
    this.myReveal = { plan, salt: this.salt, ops: this.ops.slice() };
    this.link.send({ type: 'commit', round: this.state.round, hash: this.myCommit });
    this.tryReveal();
  }

  private tryReveal() {
    if (this.myCommit && this.theirCommit && this.myReveal) this.link.send({ type: 'reveal', round: this.state.round, ...this.myReveal });
    this.tryResolve();
  }

  private receive(m: Wire) {
    if (m.type === 'commit' && m.round === this.state.round) {
      this.theirCommit = m.hash;
      this.emit({ opponentReady: true });
      this.tryReveal();
    } else if (m.type === 'reveal' && m.round === this.state.round) {
      if (planCommit(m.plan, m.salt) !== this.theirCommit) return this.end(this.me, 'Your opponent changed their plan after sealing it');
      this.theirReveal = { plan: m.plan, salt: m.salt, ops: m.ops };
      this.tryResolve();
    } else if (m.type === 'hash') {
      const mine = this.hashes.get(m.round);
      if (mine && mine !== m.hash) this.desync = m.round;
      this.hashes.set(-m.round, m.hash);
    } else if (m.type === 'surrender') {
      this.end(this.me, 'Your opponent surrendered');
    }
  }

  private tryResolve() {
    if (!this.myReveal || !this.theirReveal || this.snap.ended) return;
    if (this.timer) clearTimeout(this.timer);
    const s = this.state;
    const prev = viewFor(this.preview, this.me);
    const reveals: Record<PlayerId, { plan: Plan; ops: PlanningOp[] }> = { [this.me]: this.myReveal, [1 - this.me]: this.theirReveal } as never;
    // both peers apply the planning ops seat by seat, then resolve the same plans
    for (const p of [0, 1] as PlayerId[]) for (const op of reveals[p].ops) applyPlanningOp(s, p, op, 0);
    const before = s.events.length;
    playRound(s, [{ ...reveals[0].plan, player: 0 }, { ...reveals[1].plan, player: 1 }]);
    const round = s.round - (s.phase === 'over' ? 0 : 1);
    const h = stateHash(s);
    this.hashes.set(round, h);
    const theirs = this.hashes.get(-round);
    if (theirs && theirs !== h) this.desync = round;
    this.link.send({ type: 'hash', round, hash: h });
    this.myCommit = this.theirCommit = null;
    this.myReveal = this.theirReveal = null;
    this.ops = [];
    this.draft = null;
    this.preview = structuredClone(s);
    this.serial++;
    const over = s.phase === 'over';
    this.emit({
      view: viewFor(s, this.me),
      prevView: prev,
      roundEvents: eventsFor(s.events.slice(before), this.me),
      deadline: over ? 0 : this.deadline(),
      opponentReady: false,
      ack: null,
      roundSerial: this.serial,
      ended: over ? { winner: s.winner, reason: s.winReason } : null,
    });
    if (!over) this.arm();
  }

  /** Debug/QA: the latest shared state hash. */
  lastHash(): string {
    return stateHash(this.state);
  }

  private end(winner: PlayerId | null, reason: string) {
    if (this.timer) clearTimeout(this.timer);
    this.emit({ ended: { winner, reason }, deadline: 0 });
  }

  surrender(): void {
    this.link.send({ type: 'surrender' });
    this.end((1 - this.me) as PlayerId, 'You surrendered');
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.subs.clear();
    this.link.close();
  }
}

/** Runs the hello exchange on an open link and builds the match (host = seat 0). */
export function startP2P(link: PeerLink, role: 'host' | 'joiner', mine: PeerInfo, onReady: (m: P2PMatch) => void): void {
  const myHalf = crypto.getRandomValues(new Uint32Array(1))[0]!;
  let started = false;
  const prev = link.onMessage;
  link.onMessage = (m) => {
    if (m.type !== 'hello' || started) return prev(m);
    started = true;
    const seed = hashString(`${role === 'host' ? myHalf : m.seed}:${role === 'host' ? m.seed : myHalf}`);
    const theirs: PeerInfo = { name: m.name, deck: m.deck };
    const seats: [PeerInfo, PeerInfo] = role === 'host' ? [mine, theirs] : [theirs, mine];
    onReady(new P2PMatch(link, role === 'host' ? 0 : 1, seats, seed));
  };
  link.send({ type: 'hello', name: mine.name, deck: mine.deck, seed: myHalf, version: '1' });
}
