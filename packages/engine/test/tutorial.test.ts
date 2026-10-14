// Testing Chambers: every one of the 30 tutorial plans builds and runs through all acts without errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIALS, CHARACTER_LIST, createTutorial, beginActs, playTutorialRound, rewindTutorial, mainUnit, botPlan, currentTasks, type Plan } from '../src/index.ts';

test('a tutorial plan exists for each of the 30 characters, 2–4 rounds, max 3 hints of ≤12 words', () => {
  assert.equal(TUTORIALS.length, 30);
  assert.deepEqual(new Set(TUTORIALS.map((t) => t.id)), new Set(CHARACTER_LIST.map((c) => c.id)));
  for (const t of TUTORIALS) {
    assert.ok(t.rounds >= 2 && t.rounds <= 4, t.id);
    assert.ok(t.acts.length >= 2 && t.acts.length <= 3, `${t.id}: ${t.acts.length} acts`);
    for (const a of t.acts) {
      assert.ok(a.hints.length <= 3, `${t.id}: max 3 hints`);
      for (const h of a.hints) assert.ok(h.split(/\s+/).length <= 12, `${t.id}: hint too long: ${h}`);
    }
  }
});

test('every chamber builds on a 9×5 board and plays all acts plus the final test', () => {
  for (const t of TUTORIALS) {
    const sess = createTutorial(t.id);
    assert.equal(sess.state.settings.bounds.cols, 9);
    assert.equal(sess.state.settings.bounds.rows, 5);
    beginActs(sess);
    let guard = 0;
    while (sess.stage <= t.acts.length + 1 && guard++ < 12) {
      const tasks = currentTasks(sess);
      assert.ok(tasks.length >= 1, `${t.id} stage ${sess.stage}`);
      const plan: Plan = botPlan(sess.state, 0, { difficulty: 'normal' });
      if (sess.state.players[0].offered.length && t.deployMain) {
        const card = sess.state.players[0].offered[0]!.cardUid;
        if (!plan.commands.some((c) => c.kind === 'deploy')) plan.commands.unshift({ kind: 'deploy', card, tile: { c: 1, r: 2 } });
      }
      const r = playTutorialRound(sess, plan);
      if (!r.passed && !r.solution) {
        if (!rewindTutorial(sess)) sess.stage++;
      }
      if (r.solution) break;
    }
    assert.ok(guard < 12, `${t.id} did not terminate`);
  }
});

test('Piggybank chamber: Shake Down twice reaches 4 Coins (final test check)', () => {
  const sess = createTutorial('piggybank');
  beginActs(sess);
  const pig = () => mainUnit(sess.state, sess.plan)!;
  // act 2: spend less than 50% → pass with an empty plan
  assert.ok(playTutorialRound(sess, { player: 0, commands: [], rest: [] }).passed);
  // act 3: Shake Down
  assert.ok(playTutorialRound(sess, { player: 0, commands: [{ kind: 'attack', unit: pig().uid, attack: 'piggybank.shake_down', target: {} }], rest: [] }).passed);
  // final test: two Shake Downs → 2 + 2 coins + savings coins
  const r = playTutorialRound(sess, { player: 0, commands: [{ kind: 'attack', unit: pig().uid, attack: 'piggybank.shake_down', target: {} }, { kind: 'attack', unit: pig().uid, attack: 'piggybank.shake_down', target: {} }], rest: [] });
  assert.ok(r.passed, JSON.stringify(r.tasks));
  assert.ok(sess.passed);
});
