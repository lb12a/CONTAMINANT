// Every Testing Chamber can be completed: the walkthroughs found by tools/qa/chambers.ts are replayed act by act
// (each round must pass its tasks) up to the passed final test. Regenerate them after changing a chamber:
//   node tools/qa/chambers.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUTORIALS, beginActs, createTutorial, playTutorialRound, type Plan } from '../src/index.ts';

const walkthroughs = JSON.parse(readFileSync(new URL('./fixtures/chambers.json', import.meta.url), 'utf8')) as Record<string, Plan[]>;

test('every Testing Chamber has a recorded walkthrough', () => {
  assert.deepEqual(TUTORIALS.map((t) => t.id).filter((id) => !walkthroughs[id]), []);
});

for (const t of TUTORIALS) {
  test(`Testing Chamber ${t.id} can be completed`, () => {
    const plans = walkthroughs[t.id];
    if (!plans) return;
    const sess = createTutorial(t.id);
    beginActs(sess);
    for (const [i, p] of plans.entries()) {
      const stage = sess.stage;
      const r = playTutorialRound(sess, p);
      assert.ok(r.passed, `${t.id}: round ${i + 1} (stage ${stage}) did not pass: ${JSON.stringify(r.tasks)}`);
    }
    assert.ok(sess.passed, `${t.id}: the final test was not passed`);
  });
}
