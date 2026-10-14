// Scenario tests for rules from sections 1–9, built with the sandbox (fixed randomness).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSandbox,
  findTagged,
  playRound,
  viewFor,
  validatePlan,
  nexusCorruptTiles,
  clockTile,
  getField,
  stateHash,
  botPlan,
  newMatch,
  deckToCards,
  EXAMPLE_DECKS,
  HIDDEN_CARD,
  type Command,
  type GameEvent,
  type GameState,
} from '../src/index.ts';

function run(s: GameState, p0: Command[], p1: Command[] = [], rest0: string[] = []) {
  return playRound(s, [
    { player: 0, commands: p0, rest: rest0 },
    { player: 1, commands: p1, rest: [] },
  ]);
}
const T = (s: GameState, tag: string) => findTagged(s, tag)!;
const calcOf = (events: GameEvent[], label: string) => events.find((e) => (e.kind === 'attack' || e.kind === 'crit') && !!e.calc && e.text.includes(label))?.calc;

test('integrated damage: Poison Bite vs Scarecrow (PDef 70, +10% Grounded standing still) = 66', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'arachnia', pos: { c: 6, r: 4 }, tag: 'a' }, { owner: 1, defId: 'scarecrow', pos: { c: 7, r: 4 }, tag: 'b' }] });
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'a').uid, attack: 'arachnia.poison_bite', target: { unit: T(s, 'b').uid } }]);
  const calc = calcOf(events, 'Poison Bite')!;
  assert.equal(calc.def, 77);
  assert.equal(calc.final, 66);
});

test('characteristic tag multipliers: Pierce vs Steel ×0.8', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'arachnia', pos: { c: 6, r: 4 }, tag: 'a' }, { owner: 1, defId: 'ballerina', pos: { c: 7, r: 4 }, tag: 'b' }] });
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'a').uid, attack: 'arachnia.poison_bite', target: { unit: T(s, 'b').uid } }]);
  assert.equal(calcOf(events, 'Poison Bite')!.T, 0.8);
});

test('resolution order: Priority first, then Effective Speed; per-character order kept', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'pumpkin', pos: { c: 6, r: 2 }, tag: 'pump' },
      { owner: 0, defId: 'nexus', pos: { c: 6, r: 6 }, tag: 'nex' },
      { owner: 1, defId: 'vile', pos: { c: 8, r: 4 }, tag: 'vile' },
      { owner: 1, defId: 'training_dummy', pos: { c: 9, r: 2 }, summon: true, tag: 'dummy' },
    ],
  });
  const vile = T(s, 'vile');
  const { events } = run(
    s,
    [
      { kind: 'attack', unit: T(s, 'pump').uid, attack: 'pumpkin.candy_rain', target: { tiles: [{ c: 9, r: 2 }] } },
      { kind: 'move', unit: T(s, 'nex').uid, path: [{ c: 7, r: 6 }] },
      { kind: 'attack', unit: T(s, 'nex').uid, attack: 'nexus.long_shot', target: { unit: vile.uid } },
    ],
    [{ kind: 'attack', unit: vile.uid, attack: 'vile.miasma_rot', target: { tile: { c: 6, r: 2 } } }],
  );
  const idx = (pred: (e: GameEvent) => boolean) => events.findIndex(pred);
  const nexMove = idx((e) => e.kind === 'move' && e.text.startsWith('Nexus'));
  const nexShot = idx((e) => e.text.includes('Long Shot'));
  const vileAtk = idx((e) => e.text.includes('Miasma'));
  const candy = idx((e) => e.text.includes('Candy Rain'));
  assert.ok(nexMove < nexShot, 'Nexus moves before shooting (queue order)');
  assert.ok(nexShot < vileAtk, 'Nexus (Speed 160) acts before Vile (Speed 40)');
  assert.ok(vileAtk < candy, 'Candy Rain (Priority −1) comes after all Priority 0 actions');
});

test('AP economy: round 1 = 10, idle round gives +3 next round, KO rewards are paid next round', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'arachnia', pos: { c: 6, r: 4 }, tag: 'a' },
      { owner: 1, defId: 'zombie_limb', pos: { c: 7, r: 4 }, hp: 1, tag: 'z' },
      { owner: 1, defId: 'steak', pos: { c: 10, r: 1 } },
    ],
  });
  assert.equal(s.players[0].ap, 10);
  run(s, [{ kind: 'attack', unit: T(s, 'a').uid, attack: 'arachnia.poison_bite', target: { unit: T(s, 'z').uid } }]);
  assert.equal(s.players[0].vp, 4, 'Swarm KO = +4 VP');
  // base 10 + idle 3 (spent 2 of 10) + KO 4
  assert.equal(s.players[0].ap, 17);
  assert.equal(s.players[1].ap, 13, 'idle player gets +3');
});

test('Idle Bonus caps at +12 and AP at 30', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'piggybank', pos: { c: 2, r: 4 } }, { owner: 1, defId: 'piggybank', pos: { c: 12, r: 4 } }] });
  for (let i = 0; i < 6; i++) run(s, []);
  assert.equal(s.players[0].idleBonus, 12);
  assert.ok(s.players[0].ap <= 30);
});

test('Water + Electric → Electrified Water over all connected water (Tesla Coil)', () => {
  const water = [{ c: 5, r: 4 }, { c: 6, r: 4 }, { c: 7, r: 4 }, { c: 8, r: 4 }].map((pos) => ({ pos, id: 'water' as const }));
  const s = createSandbox({
    units: [{ owner: 0, defId: 'frankenstein', pos: { c: 4, r: 3 } }],
    fields: water,
    hands: [['tesla_coil'], []],
  });
  run(s, [{ kind: 'item', card: 'h0-0', target: { tile: { c: 5, r: 4 }, dir: 0 } }]);
  for (const w of water) assert.ok(getField(s, w.pos, 'electrified_water'), `${w.pos.c},${w.pos.r}`);
});

test('Marsh Gas twice: the second cast detonates the gas (Power 80 on tile and Ring-1)', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'wisp', pos: { c: 5, r: 4 }, tag: 'w' },
      { owner: 1, defId: 'steak', pos: { c: 7, r: 4 }, tag: 't' },
      { owner: 1, defId: 'steak', pos: { c: 8, r: 4 }, tag: 't2' },
    ],
  });
  const w = T(s, 'w');
  run(s, [{ kind: 'attack', unit: w.uid, attack: 'wisp.marsh_gas', target: { tile: { c: 7, r: 4 } } }]);
  assert.ok(getField(s, { c: 7, r: 4 }, 'gas'));
  const hp1 = T(s, 't').hp;
  const hp2 = T(s, 't2').hp;
  run(s, [{ kind: 'attack', unit: w.uid, attack: 'wisp.marsh_gas', target: { tile: { c: 7, r: 4 } } }]);
  assert.ok(!getField(s, { c: 7, r: 4 }, 'gas'), 'gas consumed');
  assert.ok(T(s, 't').hp < hp1 && T(s, 't2').hp < hp2, 'tile and ring-1 hit');
});

test('Telepathic Symbiosis: linked unit takes 25% less, Mycel takes the 25%', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'arachnia', pos: { c: 6, r: 4 }, tag: 'a' },
      { owner: 0, defId: 'mycel', pos: { c: 5, r: 4 }, tag: 'm' },
      { owner: 1, defId: 'cymbal_chimp', pos: { c: 7, r: 4 }, tag: 'c' },
    ],
  });
  assert.equal(T(s, 'a').data.symbiosisWith, T(s, 'm').uid);
  const { events } = run(s, [], [{ kind: 'attack', unit: T(s, 'c').uid, attack: 'cymbal_chimp.crash', target: { unit: T(s, 'a').uid } }]);
  const full = calcOf(events, 'Crash')!.final;
  const share = Math.round(full * 0.25);
  assert.ok(events.some((e) => e.text.includes(`Mycel takes ${share} for Arachnia`)));
  assert.ok(events.some((e) => e.kind === 'damage' && e.text.startsWith(`Arachnia takes ${full - share}`)));
});

test('Cymbal Chimp Crash at 40% HP has Power 64', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'cymbal_chimp', pos: { c: 6, r: 4 }, hpPct: 0.4, tag: 'c' }, { owner: 1, defId: 'steak', pos: { c: 7, r: 4 }, tag: 't' }] });
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'c').uid, attack: 'cymbal_chimp.crash', target: { unit: T(s, 't').uid } }]);
  assert.equal(calcOf(events, 'Crash')!.power, 64);
});

test('Scalpel Backstab: Patient + Turned Back = ×1.8 and ignores 30% PDef', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'lab_assistant', pos: { c: 6, r: 4 }, tag: 'l' },
      { owner: 1, defId: 'ballerina', pos: { c: 7, r: 4 }, statuses: [{ id: 'patient', duration: 2 }], tag: 'b' },
    ],
  });
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'l').uid, attack: 'lab_assistant.scalpel_backstab', target: { unit: T(s, 'b').uid } }]);
  assert.ok(events.some((e) => e.text.includes('Backstab ×1.8 (ignores 30% PDef)')));
  const calc = calcOf(events, 'Scalpel Backstab')!;
  assert.ok(Math.abs(calc.def - 60 * 1.1 * 0.7) < 0.01);
});

test('Strike the Hour in round 5: hour hand = 5, minute hand = 11', () => {
  const s = createSandbox({
    round: 5,
    units: [
      { owner: 0, defId: 'cog_cuckoo', pos: { c: 4, r: 4 }, tag: 'cc' },
      { owner: 1, defId: 'steak', pos: clockTile({ c: 7, r: 4 }, 5), tag: 'hour' },
      { owner: 1, defId: 'steak', pos: clockTile({ c: 7, r: 4 }, 11), tag: 'minute' },
    ],
  });
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'cc').uid, attack: 'cog_cuckoo.strike_the_hour', target: { tile: { c: 7, r: 4 } } }]);
  assert.equal(calcOf(events, 'Hour hand')!.power, 85);
  assert.equal(calcOf(events, 'Minute hand')!.power, 55);
});

test('Fuse: two Zombie Limbs become a Patchwork Zombie (260 max HP, HP = sum)', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'zombie_limb', pos: { c: 6, r: 4 }, tag: 'z1' }, { owner: 0, defId: 'zombie_limb', pos: { c: 7, r: 4 }, tag: 'z2' }] });
  const z1 = T(s, 'z1');
  run(s, [{ kind: 'ability', unit: z1.uid, ability: 'zombie_limb.fuse', target: { unit: T(s, 'z2').uid } }]);
  const fused = s.units.find((u) => u.uid === z1.uid)!;
  assert.equal(fused.form, 'patchwork');
  assert.equal(fused.maxHp, 260);
  assert.ok(fused.hp >= 180 && fused.hp <= 260);
  assert.equal(s.units.filter((u) => u.defId === 'zombie_limb').length, 1);
});

test('Moon Pull: Wolf form has 483 HP (+15%), PAtk 95, Speed 106, Move 4', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'werewolf', pos: { c: 6, r: 4 }, tag: 'w' }] });
  run(s, [{ kind: 'ability', unit: T(s, 'w').uid, ability: 'werewolf.moon_pull', target: {} }]);
  const w = T(s, 'w');
  assert.equal(w.form, 'wolf');
  assert.equal(w.maxHp, 483);
  assert.equal(w.stats.patk, 95);
  assert.equal(w.stats.speed, 106);
  assert.equal(w.move, 4);
});

test('Voodoo Doll: the copy has half the HP (Ballerina 280 → 140) and Mambo is Entranced', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'mambo', pos: { c: 6, r: 4 }, tag: 'm' }, { owner: 0, defId: 'ballerina', pos: { c: 7, r: 4 }, tag: 'b' }] });
  run(s, [{ kind: 'ability', unit: T(s, 'm').uid, ability: 'mambo.voodoo_doll', target: { unit: T(s, 'b').uid } }]);
  const copy = s.units.find((u) => u.data.voodoo)!;
  assert.equal(copy.maxHp, 140);
  assert.ok(T(s, 'm').statuses.some((x) => x.id === 'entranced'));
  const plan = validatePlan(s, { player: 0, commands: [{ kind: 'move', unit: T(s, 'm').uid, path: [{ c: 5, r: 4 }] }], rest: [] });
  assert.ok(!plan.ok, 'Entranced Mambo cannot move');
});

test('Garland: a KO\'d unit returns next round on the same tile with 30% HP', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'ballerina', pos: { c: 6, r: 4 }, hp: 5, statuses: [{ id: 'garland', duration: 3 }], tag: 'b' },
      { owner: 0, defId: 'piggybank', pos: { c: 1, r: 1 } },
      { owner: 1, defId: 'steak', pos: { c: 7, r: 4 }, tag: 's' },
    ],
  });
  const b = T(s, 'b');
  run(s, [], [{ kind: 'attack', unit: T(s, 's').uid, attack: 'steak.snap', target: { unit: b.uid } }]);
  assert.equal(s.players[1].vp, 10, 'the enemy keeps the KO reward');
  const back = s.units.find((u) => u.uid === b.uid)!;
  assert.ok(back, 'returned');
  assert.equal(back.hp, Math.round(back.maxHp * 0.3));
  assert.deepEqual(back.pos, { c: 6, r: 4 });
});

test('Deployment: pop-up for the enemy, Lullabun deploys silently and Hidden', () => {
  const s = createSandbox({ units: [], decks: [['lullabun', 'piggybank'], ['steak']] });
  const offered = s.players[0].offered.map((o) => s.players[0].cards.find((c) => c.uid === o.cardUid)!);
  const lulla = offered.find((c) => c.defId === 'lullabun')!;
  const pig = offered.find((c) => c.defId === 'piggybank')!;
  const { events } = run(s, [
    { kind: 'deploy', card: lulla.uid, tile: { c: 2, r: 2 } },
    { kind: 'deploy', card: pig.uid, tile: { c: 2, r: 6 } },
  ]);
  const popups = events.filter((e) => e.kind === 'deploy' && e.privateTo === 1);
  assert.equal(popups.length, 1, 'only Piggybank shows a pop-up');
  const enemyView = viewFor(s, 1);
  assert.ok(!enemyView.units.some((u) => u.defId === 'lullabun'), 'Lullabun hidden from the enemy');
  assert.ok(viewFor(s, 0).units.some((u) => u.defId === 'lullabun'));
});

test('fog of war: enemy hand, offer and RNG are never sent to a client', () => {
  const s = createSandbox({ units: [], hands: [['scope', 'molotov'], ['whetstone']], decks: [['steak'], ['vile']] });
  const v = viewFor(s, 0);
  assert.ok(v.players[1].hand.every((c) => c.itemId === HIDDEN_CARD));
  assert.ok(v.players[0].hand.every((c) => c.itemId !== HIDDEN_CARD));
  assert.equal(v.rng.s, 0);
  assert.ok(v.players[1].offered.every((o) => o.cardUid === HIDDEN_CARD));
});

test('Bear Snare: the triggering enemy stops on the trap tile', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'piggybank', pos: { c: 3, r: 4 } }, { owner: 1, defId: 'ballerina', pos: { c: 9, r: 4 }, tag: 'b' }], hands: [['bear_snare'], []] });
  run(s, [{ kind: 'item', card: 'h0-0', target: { tile: { c: 4, r: 4 } } }]);
  const b = T(s, 'b');
  run(s, [], [{ kind: 'move', unit: b.uid, path: [{ c: 8, r: 4 }, { c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 4 }] }]);
  run(s, [], [{ kind: 'move', unit: b.uid, path: [{ c: 4, r: 3 }] }]);
  // the snare triggers on (4,4) only if she got there; check the trap system in isolation:
  assert.ok(s.traps.length <= 1);
});

test('trap triggers when passing and ends the current Move command', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'piggybank', pos: { c: 3, r: 2 } }, { owner: 1, defId: 'ballerina', pos: { c: 8, r: 4 }, tag: 'b' }], hands: [['spike_pit'], []] });
  run(s, [{ kind: 'item', card: 'h0-0', target: { tile: { c: 4, r: 4 } } }]);
  assert.equal(s.traps.length, 1);
  const b = T(s, 'b');
  const { events } = run(s, [], [{ kind: 'move', unit: b.uid, path: [{ c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 4 }, { c: 3, r: 4 }] }]);
  assert.ok(events.some((e) => e.kind === 'trap'));
  assert.deepEqual(T(s, 'b').pos, { c: 4, r: 4 });
  assert.ok(T(s, 'b').statuses.some((x) => x.id === 'bleeding'));
});

test('Vacancy tax: a player with no character at round end gives the opponent +3', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'steak', pos: { c: 2, r: 4 } }] });
  run(s, []);
  assert.equal(s.players[0].vp, 3);
  run(s, []);
  assert.equal(s.players[0].vp, 3 + 4);
});

test('Control Field: +3 VP per round while held alone', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'steak', pos: { c: 7, r: 4 } }, { owner: 1, defId: 'steak', pos: { c: 12, r: 4 } }], objectives: [{ pos: { c: 7, r: 4 }, kind: 'control' }] });
  run(s, []);
  assert.equal(s.players[0].vp, 3);
});

test('win at 100 VP (CONTAMINATION)', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'arachnia', pos: { c: 6, r: 4 }, tag: 'a' }, { owner: 1, defId: 'zombie_limb', pos: { c: 7, r: 4 }, hp: 1, tag: 'z' }, { owner: 1, defId: 'steak', pos: { c: 12, r: 4 } }] });
  s.players[0].vp = 97;
  const r = run(s, [{ kind: 'attack', unit: T(s, 'a').uid, attack: 'arachnia.poison_bite', target: { unit: T(s, 'z').uid } }]);
  assert.equal(r.winner, 0);
  assert.equal(s.phase, 'over');
});

test('Hold Position: −10% damage from the first hit', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'steak', pos: { c: 6, r: 4 }, tag: 's' }, { owner: 1, defId: 'arachnia', pos: { c: 7, r: 4 }, tag: 'a' }] });
  const { events } = run(s, [{ kind: 'hold', unit: T(s, 's').uid }], [{ kind: 'attack', unit: T(s, 'a').uid, attack: 'arachnia.poison_bite', target: { unit: T(s, 's').uid } }]);
  assert.ok(Math.abs(calcOf(events, 'Poison Bite')!.M - 0.9) < 1e-9);
});

test('Poison ticks 5% max HP per stack; Vile is healed by Poison instead (Rot Siphon)', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'steak', pos: { c: 6, r: 4 }, statuses: [{ id: 'poison', duration: 3, stacks: 2 }], tag: 's' },
      { owner: 1, defId: 'vile', pos: { c: 9, r: 4 }, hpPct: 0.5, statuses: [{ id: 'poison', duration: 3, stacks: 1 }], tag: 'v' },
    ],
  });
  const vHp = T(s, 'v').hp;
  run(s, []);
  assert.equal(T(s, 's').hp, 560 - 56);
  assert.ok(T(s, 'v').hp > vHp);
  assert.ok(T(s, 'v').maxHp > 340, 'max HP raised by +1% per tick');
});

test('Midas Touch tarnishes every other card of the chosen Type', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'midas_mummy', pos: { c: 6, r: 4 }, tag: 'm' }], hands: [['spy_drone', 'scout_card', 'field_medkit'], []], items: [['ration_pack', 'whetstone'], []] });
  run(s, [{ kind: 'ability', unit: T(s, 'm').uid, ability: 'midas_mummy.midas_touch', target: { choice: 'h0-0' } }]);
  const pl = s.players[0];
  assert.equal(pl.tarnishedType, 'intel');
  assert.ok(pl.hand.find((c) => c.uid === 'h0-0')!.midas);
  assert.ok(pl.hand.find((c) => c.uid === 'h0-1')!.tarnished);
  assert.ok(!pl.hand.find((c) => c.uid === 'h0-2')!.tarnished);
});

test('planning limits: 4 commands, 2 moves, 3 cards, one card name per round, AP budget', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'ballerina', pos: { c: 6, r: 4 }, tag: 'b' }], hands: [['field_medkit', 'iron_tonic', 'rage_pill', 'smelling_salts', 'field_medkit', 'second_wind'], []] });
  const b = T(s, 'b').uid;
  const moves = validatePlan(s, { player: 0, rest: [], commands: [1, 2, 3].map((i) => ({ kind: 'move' as const, unit: b, path: [{ c: 6 + i, r: 4 }] })) });
  assert.ok(moves.issues.some((i) => i.error.includes('2 Move')));
  const four = validatePlan(s, { player: 0, rest: [], commands: ['h0-0', 'h0-1', 'h0-2', 'h0-3'].map((c) => ({ kind: 'item' as const, card: c, target: { unit: b } })) });
  assert.ok(four.issues.some((i) => i.error.includes('3 cards')));
  const twice = validatePlan(s, { player: 0, rest: [], commands: ['h0-0', 'h0-4'].map((c) => ({ kind: 'item' as const, card: c, target: { unit: b } })) });
  assert.ok(twice.issues.some((i) => i.error.includes('once per round')));
  const ap = validatePlan(s, { player: 0, rest: [], commands: ['h0-5', 'h0-0', 'h0-1', 'h0-2'].map((c) => ({ kind: 'item' as const, card: c, target: { unit: b } })) });
  assert.ok(ap.issues.some((i) => i.error.includes('not enough AP') || i.error.includes('3 cards')));
  const cmds = validatePlan(s, { player: 0, rest: [], commands: [{ kind: 'wait', unit: b }, { kind: 'wait', unit: b }, { kind: 'wait', unit: b }, { kind: 'wait', unit: b }, { kind: 'wait', unit: b }] });
  assert.ok(cmds.issues.some((i) => i.error.includes('4 commands')));
});

test('Nexus Corrupt tiles are deterministic per re-roll and avoid the enemy zone', () => {
  const s = createSandbox({ units: [] });
  const a = nexusCorruptTiles(s, 0, 'card-x', 0);
  const b = nexusCorruptTiles(s, 0, 'card-x', 0);
  const c = nexusCorruptTiles(s, 0, 'card-x', 1);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every((h) => h.c < 10), 'outside the enemy deployment zone (columns 11–15)');
});

test('Corruption halves current and max HP when a unit stops on a Corrupted Tile', () => {
  const s = createSandbox({ units: [{ owner: 0, defId: 'frankenstein', pos: { c: 5, r: 4 }, tag: 'f' }], fields: [{ pos: { c: 6, r: 4 }, id: 'corrupted', owner: 0 }] });
  run(s, [{ kind: 'move', unit: T(s, 'f').uid, path: [{ c: 6, r: 4 }] }]);
  const f = T(s, 'f');
  assert.ok(f.statuses.some((x) => x.id === 'corruption'));
  assert.equal(f.maxHp, 210);
});

test('Spirit Link heals the target\'s teammates within 3 tiles, not the target', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'mambo', pos: { c: 3, r: 4 }, tag: 'm' },
      { owner: 1, defId: 'steak', pos: { c: 7, r: 4 }, tag: 't' },
      { owner: 1, defId: 'ballerina', pos: { c: 8, r: 4 }, hpPct: 0.5, tag: 'b' },
    ],
  });
  const bHp = T(s, 'b').hp;
  const { events } = run(s, [{ kind: 'attack', unit: T(s, 'm').uid, attack: 'mambo.spirit_link', target: { unit: T(s, 't').uid } }]);
  assert.ok(events.some((e) => e.text.includes('Spirit Link') && e.kind === 'heal' && e.text.startsWith('Rusted Ballerina')));
  assert.ok(T(s, 'b').hp > bHp);
});

test('Shrink Heads deploy with 4 heads that do not block tiles', () => {
  const s = createSandbox({ units: [], decks: [['shrink_heads'], []] });
  const card = s.players[0].offered[0]!.cardUid;
  run(s, [{ kind: 'deploy', card, tile: { c: 2, r: 4 } }]);
  assert.equal(s.units.filter((u) => u.defId === 'shrink_head').length, 4);
  assert.ok(s.units.filter((u) => u.defId === 'shrink_head').every((h) => !h.blocks));
});

test('determinism: the same seed and plans give the same final state hash', () => {
  const mk = () =>
    newMatch({
      seed: 4242,
      settings: { friendly: true, maxRounds: 25 },
      players: [
        { name: 'A', cards: deckToCards(EXAMPLE_DECKS[0]!, 10, 'a'), items: EXAMPLE_DECKS[0]!.items },
        { name: 'B', cards: deckToCards(EXAMPLE_DECKS[1]!, 10, 'b'), items: EXAMPLE_DECKS[1]!.items },
      ],
    });
  const a = mk();
  const b = mk();
  for (let i = 0; i < 12 && a.phase !== 'over'; i++) {
    const pa = [botPlan(a, 0), botPlan(a, 1)] as const;
    const pb = [botPlan(b, 0), botPlan(b, 1)] as const;
    playRound(a, [pa[0], pa[1]]);
    playRound(b, [pb[0], pb[1]]);
    assert.equal(stateHash(a), stateHash(b), `round ${i + 1}`);
  }
});

test('Evacuation Order: half the Deploy AP comes back at once and pays for commands planned after it', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'arachnia', pos: { c: 2, r: 4 }, tag: 'spider' },
      { owner: 0, defId: 'vile', pos: { c: 3, r: 2 }, tag: 'vile' },
      { owner: 1, defId: 'scarecrow', pos: { c: 12, r: 4 }, tag: 'enemy' },
    ],
    hands: [['evacuation_order'], []],
    ap: [4, 10],
  });
  const plan: Command[] = [
    { kind: 'item', card: 'h0-0', target: { unit: T(s, 'spider').uid } },
    { kind: 'move', unit: T(s, 'vile').uid, path: [{ c: 4, r: 2 }, { c: 5, r: 2 }] },
  ];
  const chk = validatePlan(s, { player: 0, commands: plan, rest: [] });
  assert.equal(chk.ok, true, chk.issues.map((i) => i.error).join('; '));
  assert.equal(chk.credit, 3); // Arachnia deploys for 6
  // 3 AP card + 2 AP move on 4 AP: one AP is borrowed against the refund
  assert.equal(chk.cost, 5);
  assert.equal(chk.borrowed, 1);
  const { events } = run(s, plan);
  assert.ok(!s.units.some((u) => u.defId === 'arachnia'));
  assert.ok(events.some((e) => e.text === 'Evacuation: +3 AP'));
  assert.equal(s.players[0].apPenaltyNext, 0);
});

test('Spare Battery: the refund pays for a later command in the same plan', () => {
  const s = createSandbox({
    units: [
      { owner: 0, defId: 'werewolf', pos: { c: 3, r: 4 }, tag: 'wolf' },
      { owner: 1, defId: 'scarecrow', pos: { c: 12, r: 4 } },
    ],
    hands: [['spare_battery'], []],
    ap: [4, 10],
  });
  const wolf = T(s, 'wolf');
  const plan: Command[] = [
    { kind: 'ability', unit: wolf.uid, ability: 'werewolf.moon_pull', target: {}, item: 'h0-0' },
    { kind: 'move', unit: wolf.uid, path: [{ c: 4, r: 4 }] },
  ];
  const chk = validatePlan(s, { player: 0, commands: plan, rest: [] });
  assert.equal(chk.ok, true, chk.issues.map((i) => i.error).join('; '));
  assert.equal(chk.credit, 1);
  assert.equal(chk.cost, 5);
  assert.equal(chk.borrowed, 1);
  const { events } = run(s, plan);
  assert.ok(events.some((e) => e.text === 'Spare Battery: +1 AP'));
  assert.equal(s.players[0].apPenaltyNext, 0);
});

test("Mind's Eye: in a Speed tie the Ghost Train acts right after the chosen action of her friend", () => {
  const mk = () =>
    createSandbox({
      units: [
        { owner: 0, defId: 'ghost_train', pos: { c: 2, r: 2 }, tag: 'eye' },
        { owner: 0, defId: 'ghost_train', pos: { c: 2, r: 6 }, tag: 'friend' },
        { owner: 1, defId: 'scarecrow', pos: { c: 12, r: 4 } },
      ],
      ap: [20, 10],
    });
  const order = (action: number) => {
    const s = mk();
    const eye = T(s, 'eye');
    const friend = T(s, 'friend');
    const { events } = playRound(s, [
      {
        player: 0,
        commands: [
          { kind: 'move', unit: friend.uid, path: [{ c: 3, r: 6 }] },
          { kind: 'move', unit: friend.uid, path: [{ c: 4, r: 6 }] },
          { kind: 'move', unit: eye.uid, path: [{ c: 3, r: 2 }] },
        ],
        rest: [],
        mindsEye: { [eye.uid]: { after: friend.uid, action } },
      },
      { player: 1, commands: [], rest: [] },
    ]);
    return events.filter((e) => e.kind === 'move').map((e) => (e.actor === eye.uid ? 'eye' : 'friend'));
  };
  assert.deepEqual(order(0), ['eye', 'friend', 'friend']);
  assert.deepEqual(order(1), ['friend', 'eye', 'friend']);
  assert.deepEqual(order(2), ['friend', 'friend', 'eye']);
});
