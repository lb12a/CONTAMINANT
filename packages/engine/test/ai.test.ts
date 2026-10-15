// Bot behaviour: walks around walls instead of into dead ends, avoids harmful fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox, findTagged, playRound, botPlan, distance, emptyPlan } from '../src/index.ts';

test('bots walk around a wall instead of getting stuck behind it', () => {
  // a wall from r=0 to r=7 at column 6: the only way through is at r=8
  const walls = Array.from({ length: 8 }, (_, r) => ({ c: 6, r }));
  const s = createSandbox({
    units: [
      { owner: 1, defId: 'vile', pos: { c: 4, r: 3 }, tag: 'bot' },
      { owner: 0, defId: 'piggybank', pos: { c: 8, r: 3 }, tag: 'target' },
    ],
    walls,
    ap: [10, 20],
  });
  const start = distance(findTagged(s, 'bot')!.pos, findTagged(s, 'target')!.pos);
  let attacked = false;
  for (let i = 0; i < 6 && !attacked; i++) {
    s.players[1].ap = 20;
    const plan = botPlan(s, 1, { difficulty: 'normal', seed: i });
    const { events } = playRound(s, [emptyPlan(0), plan]);
    attacked = events.some((e) => (e.kind === 'attack' || e.kind === 'damage') && e.actor === findTagged(s, 'bot')?.uid);
  }
  assert.ok(attacked, `Vile never reached the target around the wall (start distance ${start})`);
});
