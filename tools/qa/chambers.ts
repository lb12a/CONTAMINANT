// Testing Chamber solver: proves that every chamber can be completed and records one walkthrough per chamber
// (packages/engine/test/fixtures/chambers.json), which the engine tests replay. For each act and the final test
// it searches legal plans (deploys, single actions with every target, two actions on one target, resting, a
// move first, item cards, the bots' own plans), backtracking when an act leaves the next one impossible.
//   node tools/qa/chambers.ts            (all 30, rewrites the fixture)
//   ONLY=wisp,calaca node tools/qa/chambers.ts   (just these, merged into the fixture)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  TUTORIALS,
  activeAbilities,
  attacksOf,
  beginActs,
  botPlan,
  createTutorial,
  deployTiles,
  isProbe,
  neighbors,
  distance,
  plannedPositions,
  playTutorialRound,
  reachable,
  validatePlan,
  type Command,
  type GameState,
  type Plan,
  type Target,
  type TutorialSession,
} from '../../packages/engine/src/index.ts';

const FIXTURE = 'packages/engine/test/fixtures/chambers.json';

const plan = (commands: Command[], rest: string[] = []): Plan => ({ player: 0, commands, rest });

function tiles(s: GameState) {
  const out: { c: number; r: number }[] = [];
  for (let c = 0; c < s.settings.bounds.cols; c++) for (let r = 0; r < s.settings.bounds.rows; r++) out.push({ c, r });
  return out;
}

function targets(s: GameState): Target[] {
  const list: Target[] = [{}];
  for (const u of s.units) list.push({ unit: u.uid });
  for (const h of tiles(s)) list.push({ tile: h });
  for (let dir = 0; dir < 6; dir++) list.push({ dir }, { dir, dist: 1 }, { dir, dist: 2 }, { dir, dist: 3 });
  for (const u of s.units) for (let dir = 0; dir < 6; dir++) list.push({ unit: u.uid, dir, dist: 1 });
  // two adjacent tiles (Barbed Fence, Box Leap …)
  for (const h of tiles(s)) for (const n of neighbors(h, s.settings.bounds)) list.push({ tiles: [h, n] });
  return list;
}

/** Every single action of the player's units (attacks, abilities, item cards) that validates on its own and
 * can reach its target from where the unit will stand (out-of-range orders are legal but only fizzle). */
function actions(s: GameState, prefix: Command[] = []): Command[] {
  const out: Command[] = [];
  const tg = targets(s);
  const ok = (c: Command) => validatePlan(s, plan([...prefix, c])).ok;
  const at = plannedPositions(s, prefix);
  const reach = (u: { uid: string; pos: { c: number; r: number } }, range: number, t: Target) => {
    const from = at.get(u.uid) ?? u.pos;
    const pts = [t.unit ? (at.get(t.unit) ?? s.units.find((x) => x.uid === t.unit)?.pos) : undefined, t.tile, ...(t.tiles ?? [])].filter((h): h is { c: number; r: number } => !!h);
    return pts.every((h) => distance(from, h) <= Math.max(1, range) + 1);
  };
  for (const u of s.units.filter((x) => x.owner === 0)) {
    for (const a of attacksOf(s, u)) {
      for (const target of tg) {
        if (!reach(u, a.range ?? 1, target)) continue;
        const c: Command = { kind: 'attack', unit: u.uid, attack: a.id, target };
        if (ok(c)) out.push(c);
        for (const card of s.players[0].hand) {
          const ci: Command = { kind: 'attack', unit: u.uid, attack: a.id, target, item: card.uid };
          if (ok(ci)) out.push(ci);
        }
      }
    }
    for (const ab of activeAbilities(s, u)) {
      for (const target of tg) {
        if (ab.range > 0 && !reach(u, ab.range, target)) continue;
        const c: Command = { kind: 'ability', unit: u.uid, ability: ab.id, target };
        if (ok(c)) out.push(c);
      }
    }
  }
  for (const card of s.players[0].hand) {
    for (const target of tg) {
      const c: Command = { kind: 'item', card: card.uid, target };
      if (ok(c)) out.push(c);
    }
  }
  return out;
}

function tryPlan(sess: TutorialSession, p: Plan): TutorialSession | null {
  if (!validatePlan(sess.state, p).ok) return null;
  const copy = structuredClone(sess);
  const before = copy.stage;
  const r = playTutorialRound(copy, p);
  return r.passed && copy.stage > before ? copy : null;
}

/** Moves of the player's units, the ones that end closest to an enemy first. */
function* moves(s: GameState): Generator<Command> {
  const foes = s.units.filter((x) => x.owner === 1);
  const near = (h: { c: number; r: number }) => Math.min(99, ...foes.map((f) => distance(h, f.pos)));
  const list: { mv: Command; d: number }[] = [];
  for (const u of s.units.filter((x) => x.owner === 0)) {
    for (const r of reachable(s, u, u.move)) {
      if (!r.path.length) continue;
      const mv: Command = { kind: 'move', unit: u.uid, path: r.path };
      if (validatePlan(s, plan([mv])).ok) list.push({ mv, d: near(r.pos) });
    }
  }
  for (const x of list.sort((a, b) => a.d - b.d)) yield x.mv;
}

function* candidates(sess: TutorialSession): Generator<Plan> {
  const s = sess.state;
  yield plan([]);
  // deploy the main character first when it waits in the dock
  const deploys: Command[][] = [[]];
  for (const o of s.players[0].offered) for (const tile of deployTiles(s, 0)) deploys.push([{ kind: 'deploy', card: o.cardUid, tile }]);
  for (const d of deploys) if (d.length) yield plan(d);
  const pre = deploys.slice(0, 3);
  // set to Rest (acts later, Resonant Rest …)
  const own = s.units.filter((x) => x.owner === 0).map((u) => u.uid);
  const rests = own.map((uid) => [uid]);
  for (const r of rests) yield plan([], r);
  // one action, the same action twice, and both while resting
  for (const d of pre) {
    const one = actions(s, d);
    for (const c of one) yield plan([...d, c]);
    for (const c of one) yield plan([...d, c, c]);
    for (const r of rests) for (const c of one) yield plan([...d, c], r);
  }
  // what a bot would do
  for (const diff of ['hard', 'normal', 'easy'] as const) for (let seed = 1; seed <= 4; seed++) yield botPlan(s, 0, { difficulty: diff, seed });
  // two different actions of one unit on the same target (heal then stab, bite then lay eggs …), also resting
  const key = (c: Command) => ('attack' in c ? c.attack : 'ability' in c ? c.ability : c.kind) + JSON.stringify('target' in c ? c.target : {});
  const combos = (one: Command[]) => {
    const out: [Command, Command][] = [];
    for (const c of one) for (const c2 of one) if (c !== c2 && 'unit' in c && 'unit' in c2 && c.unit === c2.unit && key(c) !== key(c2) && JSON.stringify((c as { target?: unknown }).target) === JSON.stringify((c2 as { target?: unknown }).target)) out.push([c, c2]);
    return out;
  };
  for (const d of pre) {
    for (const [c, c2] of combos(actions(s, d))) {
      yield plan([...d, c, c2]);
      yield plan([...d, c, c2], [c.kind === 'deploy' ? '' : (c as { unit: string }).unit]);
    }
  }
  // walk first, then act from the new tile
  const mvs = [...moves(s)];
  for (const mv of mvs) {
    yield plan([mv]);
    const one = actions(s, [mv]);
    for (const c of one) yield plan([mv, c]);
    for (const c of one) yield plan([mv, c, c]);
    for (const [c, c2] of combos(one)) {
      yield plan([mv, c, c2]);
      yield plan([mv, c, c2], [(c as { unit: string }).unit]);
    }
  }
  // any two different actions, with and without a move
  for (const d of pre) {
    const one = actions(s, d);
    for (const c of one) for (const c2 of one) if (c !== c2) yield plan([...d, c, c2]);
  }
  for (const mv of mvs) {
    const one = actions(s, [mv]);
    for (const c of one) for (const c2 of one) if (c !== c2) yield plan([mv, c, c2]);
  }
}

/**
 * Depth-first through the acts: at every act the first few plans that pass are tried in turn, so a lesson
 * that needs the right set-up from the act before (fused limbs, a weakened enemy …) is still found. The
 * deepest act reached is reported when a chamber cannot be finished.
 */
function solve(sess: TutorialSession, budget: { plays: number; deepest: TutorialSession }, branch = 4, perAct = 5000): Plan[] | null {
  if (sess.passed) return [];
  if (sess.stage > budget.deepest.stage) budget.deepest = sess;
  let passing = 0;
  const seen = new Set<string>();
  let tried = 0;
  for (const p of candidates(sess)) {
    // a dead end: go back and set the previous act up differently
    if (budget.plays-- <= 0 || tried++ > perAct) return null;
    const next = tryPlan(sess, p);
    if (!next) continue;
    // different plans that leave the same board behind are one branch
    const key = JSON.stringify(next.state.units.map((u) => [u.uid, u.pos, u.hp, u.form, u.counters]));
    if (seen.has(key)) continue;
    seen.add(key);
    const rest = solve(next, budget, branch, perAct);
    if (rest) return [p, ...rest];
    if (++passing >= branch) return null;
  }
  return null;
}

const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
let walkthroughs: Record<string, Plan[]> = {};
try {
  walkthroughs = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Plan[]>;
} catch {
  /* first run */
}
const stuck: string[] = [];
for (const t of TUTORIALS.filter((x) => !only.length || only.includes(x.id))) {
  const t0 = Date.now();
  const start = createTutorial(t.id);
  beginActs(start);
  const budget = { plays: 90000, deepest: start };
  const path = solve(start, budget);
  if (!path) {
    const d = budget.deepest;
    stuck.push(`${t.id}: ${isProbe(d) ? 'final test' : `act ${d.stage}`} (${JSON.stringify(d.plan.acts[d.stage - 1]?.tasks.map((x) => x.check) ?? d.plan.probe.check)})`);
    console.log(`${t.id}: STUCK`);
    continue;
  }
  walkthroughs[t.id] = path;
  console.log(`${t.id}: ${path.length} rounds, ${Date.now() - t0} ms`);
}
writeFileSync(FIXTURE, JSON.stringify(walkthroughs, null, 1) + '\n');
if (stuck.length) {
  console.log('stuck:\n' + stuck.join('\n'));
  process.exit(1);
}
console.log(`all chambers solved, walkthroughs in ${FIXTURE}`);
