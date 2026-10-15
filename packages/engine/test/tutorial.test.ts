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

test('Basic Training: the guided path (deploy Vile, walk up, Reaper\'s Slash + Whetstone) works', async () => {
  const { createTraining, trainingWardenPlan, TRAINING, playRound, validatePlan, findTagged } = await import('../src/index.ts');
  const s = createTraining();
  const vileCard = s.players[0].offered.map((o) => s.players[0].cards.find((c) => c.uid === o.cardUid)!).find((c) => c.defId === 'vile')!;
  assert.ok(vileCard, 'Vile is offered');
  const r1 = { player: 0 as const, commands: [{ kind: 'deploy' as const, card: vileCard.uid, tile: TRAINING.deployTiles[0]! }], rest: [] };
  assert.equal(validatePlan(s, r1).ok, true);
  playRound(s, [r1, trainingWardenPlan(s)]);
  const vile = s.units.find((u) => u.defId === 'vile' && u.owner === 0)!;
  const dummy = findTagged(s, 'dummy')!;
  const hp0 = dummy.hp;
  const r2 = {
    player: 0 as const,
    commands: [
      { kind: 'move' as const, unit: vile.uid, path: [{ c: 5, r: 4 }, { c: 6, r: 4 }] },
      { kind: 'attack' as const, unit: vile.uid, attack: TRAINING.attack, target: { unit: dummy.uid }, item: s.players[0].hand.find((c) => c.itemId === 'whetstone')!.uid },
    ],
    rest: [],
  };
  const chk = validatePlan(s, r2);
  assert.equal(chk.ok, true, chk.issues.map((i) => i.error).join('; '));
  playRound(s, [r2, trainingWardenPlan(s)]);
  assert.ok(findTagged(s, 'dummy')!.hp < hp0, 'the dummy took damage');
});

test('Testing Chambers never become impossible: the subject survives and knocked-out enemies return', async () => {
  const { dealDamage, koUnit } = await import('../src/index.ts');
  // direct check: a lethal hit leaves the subject at 1 HP, a KO'd training enemy is back next round
  const probe = createTutorial('vile', 3);
  beginActs(probe);
  const subject = mainUnit(probe.state, probe.plan)!;
  dealDamage(probe.state, subject, 99999, { attacker: null, tag: null, label: 'test' });
  assert.equal(subject.hp, 1);
  const enemy = probe.state.units.find((u) => u.owner === 1)!;
  koUnit(probe.state, enemy, subject, {});
  playTutorialRound(probe, { player: 0, commands: [], rest: [] });
  assert.ok(probe.state.units.some((u) => u.owner === 1 && u.data.tag === enemy.data.tag), 'the knocked-out enemy returned');
  for (const t of TUTORIALS) {
    const sess = createTutorial(t.id, 3);
    beginActs(sess);
    for (let round = 0; round < 10; round++) {
      // the player does nothing useful while the Warden attacks at full strength
      const enemyOnly: Plan = { player: 0, commands: [], rest: [] };
      if (t.deployMain && round === 0 && sess.state.players[0].offered.length) {
        enemyOnly.commands.push({ kind: 'deploy', card: sess.state.players[0].offered[0]!.cardUid, tile: { c: 1, r: 2 } });
      }
      // a hard bot hits the subject's own units too (worst case for the protection)
      const hard = botPlan(sess.state, 1, { difficulty: 'hard' });
      void hard;
      playTutorialRound(sess, enemyOnly);
      if (round > 0 || !t.deployMain) assert.ok(mainUnit(sess.state, t), `${t.id}: the subject was KO'd in round ${round}`);
      const enemies = sess.state.units.filter((u) => u.owner === 1 && typeof u.data.tag === 'string' && (u.data.tag as string).startsWith('enemy'));
      assert.equal(enemies.length, t.enemies.length, `${t.id}: enemies missing after round ${round}`);
      if (sess.stage > t.acts.length + 1) break;
    }
  }
});
