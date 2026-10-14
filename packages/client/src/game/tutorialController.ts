// Match controller for the Testing Chambers (scripted tutorial matches).
import {
  beginActs,
  createTutorial,
  playTutorialRound,
  rewindTutorial,
  skipAct,
  viewFor,
  type Plan,
  type PlanningOp,
  type TutorialRoundResult,
  type TutorialSession,
} from '@contaminant/engine';
import { applyLocalOp, type MatchController, type MatchSnapshot } from './controller.ts';

export class TutorialController implements MatchController {
  readonly kind = 'tutorial' as const;
  readonly sess: TutorialSession;
  private subs = new Set<(s: MatchSnapshot) => void>();
  private tutSubs = new Set<() => void>();
  private snap: MatchSnapshot;
  private plan: Plan | null = null;
  private serial = 0;
  last: TutorialRoundResult | null = null;

  constructor(defId: string) {
    this.sess = createTutorial(defId);
    this.snap = {
      info: { match: `tutorial-${defId}`, kind: 'tutorial', you: 0, names: ['You', 'Warden'], planningSeconds: 0 },
      view: viewFor(this.sess.state, 0),
      prevView: null,
      roundEvents: [],
      deadline: 0,
      opponentReady: true,
      ended: null,
      ack: null,
      watch: null,
      roundSerial: 0,
    };
  }

  snapshot() {
    return this.snap;
  }
  subscribe(fn: (s: MatchSnapshot) => void) {
    this.subs.add(fn);
    fn(this.snap);
    return () => this.subs.delete(fn);
  }
  onTutorial(fn: () => void) {
    this.tutSubs.add(fn);
    return () => {
      this.tutSubs.delete(fn);
    };
  }
  private emit(patch: Partial<MatchSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const f of this.subs) f(this.snap);
    for (const f of this.tutSubs) f();
  }

  start(): void {
    beginActs(this.sess);
    this.emit({ view: viewFor(this.sess.state, 0) });
  }

  submit(plan: Plan, final: boolean): void {
    this.plan = plan;
    if (!final) return;
    const prev = viewFor(this.sess.state, 0);
    this.last = playTutorialRound(this.sess, { ...plan, player: 0 });
    this.plan = null;
    this.serial++;
    const finished = this.sess.passed;
    this.emit({ view: viewFor(this.sess.state, 0), prevView: prev, roundEvents: this.last.events, roundSerial: this.serial, ended: finished ? { winner: 0, reason: 'Testing Chamber complete' } : null });
  }

  op(op: PlanningOp) {
    const r = applyLocalOp(this.sess.state, 0, op, this.plan);
    if (r.ok) this.emit({ view: viewFor(this.sess.state, 0) });
    return r;
  }

  rewind(): boolean {
    const ok = rewindTutorial(this.sess);
    if (ok) {
      this.serial++;
      this.emit({ view: viewFor(this.sess.state, 0), prevView: null, roundEvents: [], roundSerial: this.serial });
    }
    return ok;
  }

  skip(): void {
    skipAct(this.sess);
    this.emit({ view: viewFor(this.sess.state, 0) });
  }

  surrender(): void {
    this.emit({ ended: { winner: 1, reason: 'Left the chamber' } });
  }

  dispose(): void {
    this.subs.clear();
    this.tutSubs.clear();
  }
}
