// Tutorial runner for the Testing Chambers (UI-Assets document section 9).

import { CHARACTERS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { TUTORIAL_BY_ID, type Check, type TutorialPlan } from './data/tutorials.ts';
import { createSandbox, type SandboxUnit } from './sandbox.ts';
import { createSummon, createUnitFromCard, freshRound, isFree } from './state.ts';
import { neighbors } from './hex.ts';
import { addField } from './fields.ts';
import { botPlan } from './ai.ts';
import { playRound } from './match.ts';
import { eventsFor } from './visibility.ts';
import { emptyPlan } from './planning.ts';
import type { Command, GameEvent, GameState, Plan, Unit } from './types.ts';

export const CHAMBER = { cols: 9, rows: 5 };

/** Stage 0 = Act 1 (introduction), 1..n = acts 2–4, n+1 = Act 5 (final test), n+2 = finished. */
export interface TutorialSession {
  plan: TutorialPlan;
  state: GameState;
  stage: number;
  snapshot: GameState;
  rewindsLeft: number;
  probeTries: number;
  done: boolean[];
  passed: boolean;
  lastEvents: GameEvent[];
  showSolution: boolean;
}

const PLAYER_SLOTS = [
  { c: 1, r: 1 },
  { c: 1, r: 3 },
  { c: 2, r: 0 },
  { c: 2, r: 4 },
];
const ENEMY_SLOTS = [
  { c: 5, r: 2 },
  { c: 6, r: 1 },
  { c: 6, r: 3 },
  { c: 7, r: 2 },
];

export function createTutorial(id: string, seed = 7): TutorialSession {
  const plan = TUTORIAL_BY_ID[id];
  if (!plan) throw new Error(`no tutorial for ${id}`);
  const units: SandboxUnit[] = [];
  if (!plan.deployMain) units.push({ owner: 0, defId: plan.main, pos: { c: 2, r: 2 }, tag: 'main' });
  plan.guests.forEach((g, i) => units.push({ owner: 0, defId: g, pos: PLAYER_SLOTS[i]!, tag: `guest${i}` }));
  plan.enemies.forEach((e, i) => units.push({ owner: 1, defId: e, pos: ENEMY_SLOTS[i]!, summon: e.startsWith('training_'), tag: `enemy${i}` }));
  const state = createSandbox({
    seed,
    bounds: CHAMBER,
    walls: plan.walls,
    units,
    decks: [plan.deployMain ? [plan.main] : [], []],
    hands: [plan.items, plan.enemyItems ?? []],
    ap: [plan.ap, 10],
    fixedRandom: true,
    zone: plan.zone,
    round: plan.startRound ?? 1,
    names: ['You', 'Warden'],
  });
  state.settings.protectOwner = 0;
  return { plan, state, stage: 0, snapshot: structuredClone(state), rewindsLeft: 2, probeTries: 0, done: [], passed: false, lastEvents: [], showSolution: false };
}

/** Training enemies that were knocked out come back to their slot, so the next task always has a target. */
export function refillEnemies(sess: TutorialSession): void {
  const s = sess.state;
  sess.plan.enemies.forEach((defId, i) => {
    const tag = `enemy${i}`;
    if (s.units.some((u) => u.data.tag === tag)) return;
    const slot = ENEMY_SLOTS[i]!;
    const pos = isFree(s, slot) ? slot : neighbors(slot, s.settings.bounds).find((h) => isFree(s, h));
    if (!pos) return;
    const u = defId.startsWith('training_') ? createSummon(s, 1, defId, pos) : createUnitFromCard(s, 1, { uid: `refill-${i}-${s.round}`, defId, level: 1, tuning: {} }, pos);
    u.data.tag = tag;
    u.deployedRound = 0;
    u.rt = freshRound(u);
    s.units.push(u);
    s.graveyard = s.graveyard.filter((g) => g.data.tag !== tag);
  });
}

export function mainUnit(s: GameState, plan: TutorialPlan): Unit | undefined {
  return s.units.find((u) => u.owner === 0 && u.data.tag === 'main') ?? s.units.find((u) => u.owner === 0 && u.defId === plan.main);
}

export function isProbe(sess: TutorialSession): boolean {
  return sess.stage === sess.plan.acts.length + 1;
}

export function currentTasks(sess: TutorialSession) {
  if (sess.stage >= 1 && sess.stage <= sess.plan.acts.length) return sess.plan.acts[sess.stage - 1]!.tasks;
  if (isProbe(sess)) return [{ de: sess.plan.probe.de, en: sess.plan.probe.en, check: sess.plan.probe.check }];
  return [];
}

/** The Warden tops up the subject's counters for the act that begins now (souls for the Garland …). */
function prepareStage(sess: TutorialSession): void {
  const setup = isProbe(sess) ? sess.plan.probe.setup : sess.plan.acts[sess.stage - 1]?.setup;
  if (!setup) return;
  const main = mainUnit(sess.state, sess.plan);
  if (setup.counters && main) for (const [k, v] of Object.entries(setup.counters)) main.counters[k] = Math.max(main.counters[k] ?? 0, v);
  if (setup.enemyHp !== undefined) {
    for (const u of sess.state.units) if (u.owner === 1 && !u.isObject) u.hp = Math.max(1, Math.min(u.hp, Math.round(u.maxHp * setup.enemyHp)));
  }
  // the Warden floods the enemies' tiles (a swamp for the Mire Song …)
  if (setup.fieldUnderEnemies) {
    for (const u of sess.state.units) if (u.owner === 1 && !u.isObject) addField(sess.state, u.pos, setup.fieldUnderEnemies, { duration: 3, owner: 0, silent: true });
  }
  // the subject's friends at low HP (a Garland lesson needs a friend that can fall)
  if (setup.allyHp !== undefined) {
    for (const u of sess.state.units) if (u.owner === 0 && u !== main && !u.isObject && !u.isSummon) u.hp = Math.max(1, Math.min(u.hp, Math.round(u.maxHp * setup.allyHp)));
  }
}

/** Moves from the introduction to the first act. */
export function beginActs(sess: TutorialSession): void {
  if (sess.stage === 0) sess.stage = 1;
  prepareStage(sess);
  sess.snapshot = structuredClone(sess.state);
}

/** The Warden's plan for the opponent this round. */
export function wardenPlan(sess: TutorialSession): Plan {
  const s = sess.state;
  const probe = isProbe(sess);
  const act = probe ? undefined : sess.plan.acts[sess.stage - 1];
  const mode = probe ? 'bot' : act?.enemy?.mode ?? 'idle';
  let plan: Plan = emptyPlan(1);
  if (mode === 'bot' || mode === 'attack') {
    plan = botPlan(s, 1, { difficulty: mode === 'attack' ? 'normal' : 'easy' });
    plan.commands = plan.commands.filter((c) => c.kind !== 'item' && c.kind !== 'deploy');
  }
  const main = mainUnit(s, sess.plan);
  for (const itemId of act?.enemy?.items ?? []) {
    const card = s.players[1].hand.find((c) => c.itemId === itemId);
    if (!card) continue;
    const it = ITEMS[itemId]!;
    let cmd: Command | null = null;
    if (it.targeting === 'tile' && main) cmd = { kind: 'item', card: card.uid, target: { tile: main.pos, dir: 0 } };
    else if (it.type === 'character') {
      const own = s.units.find((u) => u.owner === 1 && u.statuses.some((x) => ['poison', 'leeched', 'infection', 'egg'].includes(x.id))) ?? s.units.find((u) => u.owner === 1);
      if (own) cmd = { kind: 'item', card: card.uid, target: { unit: own.uid } };
    }
    if (cmd) plan.commands.push(cmd);
  }
  return plan;
}

export interface CheckContext {
  s: GameState;
  events: GameEvent[];
  plan: TutorialPlan;
}

function ownerOf(s: GameState, uid?: string): number | undefined {
  if (!uid) return undefined;
  return (s.units.find((u) => u.uid === uid) ?? s.graveyard.find((u) => u.uid === uid))?.owner;
}

export function evaluate(check: Check, ctx: CheckContext): boolean {
  const { s, events, plan } = ctx;
  const main = mainUnit(s, plan);
  switch (check.kind) {
    case 'deployed': {
      const name = check.defId ? CHARACTERS[check.defId]?.name : undefined;
      return events.some((e) => e.kind === 'deploy' && e.owner === 0 && (!name || e.text.includes(name)));
    }
    case 'status': {
      const targets = new Set(
        events
          .filter((e) => e.kind === 'status' && e.status === check.status && !e.text.includes('loses') && !e.text.includes('immune'))
          .filter((e) => {
            const o = ownerOf(s, e.target);
            return check.side === 'any' || check.side === undefined ? true : check.side === 'enemy' ? o === 1 : o === 0;
          })
          .map((e) => e.target),
      );
      return targets.size >= (check.count ?? 1);
    }
    case 'damaged': {
      const targets = new Set(events.filter((e) => e.kind === 'damage' && ownerOf(s, e.target) === 1 && (e.actor === undefined || ownerOf(s, e.actor) === 0)).map((e) => e.target));
      return targets.size >= (check.count ?? 1);
    }
    case 'ko':
      return events.filter((e) => e.kind === 'ko' && e.owner === 1).length >= (check.count ?? 1);
    case 'used':
      return events.some((e) => (e.kind === 'attack' || e.kind === 'crit' || e.kind === 'miss') && ownerOf(s, e.actor) === 0 && e.text.includes(check.name));
    case 'moved_max': {
      const moved = events.filter((e) => e.kind === 'move' && e.actor === main?.uid).reduce((n, e) => n + Math.max(0, (e.tiles?.length ?? 1) - 1), 0);
      return moved <= check.fields;
    }
    case 'field':
      return events.some((e) => e.kind === 'field' && e.field === check.field);
    case 'counter':
      return !!main && (main.counters[check.key] ?? 0) >= check.min;
    case 'event':
      return events.some((e) => e.text.includes(check.text));
    case 'heal':
      return events.filter((e) => e.kind === 'heal' && ownerOf(s, e.target) === 0).length >= (check.count ?? 1);
    case 'form':
      return main?.form === check.form;
    case 'alive':
      return !!main;
    case 'ap_spent_below':
      return s.players[0].lastRoundApSpent < s.players[0].lastRoundApTotal * check.pct;
    case 'all':
      return check.of.every((c) => evaluate(c, ctx));
    case 'any':
      return check.of.some((c) => evaluate(c, ctx));
  }
}

export interface TutorialRoundResult {
  events: GameEvent[];
  tasks: boolean[];
  passed: boolean;
  /** the final test failed and no tries are left: show the solution */
  solution?: string;
}

/** Resolves one tutorial round with the player's plan; checks the act's tasks. */
export function playTutorialRound(sess: TutorialSession, playerPlan: Plan): TutorialRoundResult {
  const probe = isProbe(sess);
  sess.state.settings.fixedRandom = !probe;
  sess.snapshot = structuredClone(sess.state);
  const before = sess.state.events.length;
  const act = probe ? undefined : sess.plan.acts[sess.stage - 1];
  playRound(sess.state, [{ ...playerPlan, player: 0 }, wardenPlan(sess)]);
  const events = eventsFor(sess.state.events.slice(before), 0);
  // tutorial AP is fixed (10–12 per round)
  if (sess.state.phase !== 'over') {
    sess.state.players[0].ap = sess.plan.ap;
    sess.state.players[0].apThisRound = sess.plan.ap;
  }
  const tasks = currentTasks(sess).map((t) => evaluate(t.check, { s: sess.state, events, plan: sess.plan }));
  sess.lastEvents = events;
  sess.done = tasks;
  const passed = tasks.every(Boolean);
  // time-lapse: the warden fast-forwards a few rounds (eggs, candles, broth)
  if (passed && act?.timelapse && sess.state.phase !== 'over') {
    for (let i = 0; i < act.timelapse && (sess.state.phase as string) !== 'over'; i++) {
      const b2 = sess.state.events.length;
      playRound(sess.state, [emptyPlan(0), emptyPlan(1)]);
      events.push(...eventsFor(sess.state.events.slice(b2), 0));
      sess.state.players[0].ap = sess.plan.ap;
      sess.state.players[0].apThisRound = sess.plan.ap;
    }
  }
  if ((sess.state.phase as string) === 'over') {
    // keep the chamber running: tutorials are not won by VP
    sess.state.phase = 'planning';
    sess.state.winner = null;
  }
  refillEnemies(sess);
  if (probe) {
    if (passed) {
      sess.passed = true;
      sess.stage++;
    } else {
      sess.probeTries++;
      if (sess.probeTries >= 3) {
        sess.showSolution = true;
        return { events, tasks, passed, solution: sess.plan.probe.solution };
      }
      // retry: restore the start of the test round
      sess.state = structuredClone(sess.snapshot);
    }
    return { events, tasks, passed };
  }
  if (passed) {
    sess.stage++;
    sess.rewindsLeft = 2;
    prepareStage(sess);
  }
  return { events, tasks, passed };
}

/** "Try another plan": resets the round (max 2 times per round). */
export function rewindTutorial(sess: TutorialSession): boolean {
  if (sess.rewindsLeft <= 0) return false;
  sess.rewindsLeft--;
  sess.state = structuredClone(sess.snapshot);
  return true;
}

/** Skip a stuck act (accessibility: tutorials can never be forced). */
export function skipAct(sess: TutorialSession): void {
  sess.stage++;
  sess.rewindsLeft = 2;
  prepareStage(sess);
}

export function tutorialStations(sess: TutorialSession): boolean[] {
  const n = sess.plan.acts.length;
  return [sess.stage > 0, ...Array.from({ length: 3 }, (_, i) => sess.stage > Math.min(n, i + 1) || (i >= n && sess.stage > n)), sess.passed];
}
