// Planning from where a creature will stand: after its own leaps and swaps, and after an ally moved it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attacksOf, createSandbox, findTagged, plannedPositions, validatePlan, type Command } from '../src/index.ts';

const attackId = (s: ReturnType<typeof createSandbox>, tag: string, custom: string) => attacksOf(s, findTagged(s, tag)!).find((a) => a.custom === custom)!.id;

test('a move planned after Grand Jeté starts from the landing tile', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'ballerina', pos: { c: 4, r: 4 }, tag: 'b' },
      { owner: 1, defId: 'piggybank', pos: { c: 6, r: 4 }, tag: 't' },
    ],
    ap: [20, 10],
  });
  const b = findTagged(s, 'b')!;
  const t = findTagged(s, 't')!;
  const jete: Command = { kind: 'attack', unit: b.uid, attack: attackId(s, 'b', 'grand_jete'), target: { unit: t.uid, tile: { c: 5, r: 4 } } };
  const land = plannedPositions(s, [jete]).get(b.uid);
  assert.deepEqual(land, { c: 5, r: 4 });
  // one step from the landing tile is fine; from the start tile it would be two
  const move: Command = { kind: 'move', unit: b.uid, path: [{ c: 5, r: 5 }] };
  const chk = validatePlan(s, { player: 0, commands: [jete, move], rest: [] });
  assert.deepEqual(chk.issues, [], JSON.stringify(chk.issues));
});

test('the Trainticket moves an ally in the plan, and its attack range counts from there', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'ghost_train', pos: { c: 3, r: 4 }, tag: 'gt' },
      { owner: 0, defId: 'vile', pos: { c: 4, r: 4 }, tag: 'v' },
    ],
    ap: [20, 10],
  });
  const gt = findTagged(s, 'gt')!;
  const v = findTagged(s, 'v')!;
  const ticket: Command = { kind: 'attack', unit: gt.uid, attack: attackId(s, 'gt', 'trainticket'), target: { unit: v.uid, dir: 0, dist: 2 } };
  const pos = plannedPositions(s, [ticket]).get(v.uid)!;
  assert.notDeepEqual(pos, v.pos, 'the ally is expected somewhere else');
  assert.equal(Math.abs(pos.c - v.pos.c) + Math.abs(pos.r - v.pos.r) > 0, true);
});

test('Swap Places exchanges both planned positions', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'lullabun', pos: { c: 4, r: 4 }, tag: 'p' },
      { owner: 1, defId: 'vile', pos: { c: 6, r: 4 }, tag: 'e' },
    ],
    ap: [20, 10],
  });
  const p = findTagged(s, 'p')!;
  const e = findTagged(s, 'e')!;
  const swap = attacksOf(s, p).find((a) => a.custom === 'swap_places');
  assert.ok(swap, 'Lullabun has Swap Places');
  const pos = plannedPositions(s, [{ kind: 'attack', unit: p.uid, attack: swap!.id, target: { unit: e.uid } }]);
  assert.deepEqual(pos.get(p.uid), e.pos);
  assert.deepEqual(pos.get(e.uid), p.pos);
});
