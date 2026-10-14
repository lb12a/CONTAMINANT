// Verifies every formula of section 1 & 2 against the numbers printed in the Game Plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseAp,
  capAp,
  computeDamage,
  duplicatesForLevel,
  expectedDamagePerAp,
  goldForLevel,
  hitChance,
  levelMult,
  nextIdleBonus,
  randomApTable,
  statusChance,
  totalDuplicatesTo,
  trophyDelta,
  validateTuning,
  vacancyTax,
  moveCost,
} from '../src/index.ts';

test('Base AP(R) = min(16, 10 + floor((R−1)/2))', () => {
  assert.deepEqual([1, 2, 3, 4, 9, 10, 11, 12, 13, 20].map(baseAp), [10, 10, 11, 11, 14, 14, 15, 15, 16, 16]);
});

test('Random AP tables sum to 100% with the documented values', () => {
  const early = randomApTable(3);
  const late = randomApTable(6);
  assert.deepEqual(early, [[0, 0.3], [1, 0.4], [2, 0.3]]);
  assert.deepEqual(late, [[0, 0.2], [1, 0.35], [2, 0.3], [3, 0.15]]);
  for (const t of [early, late]) assert.ok(Math.abs(t.reduce((s, [, p]) => s + p, 0) - 1) < 1e-9);
});

test('Idle Bonus stacks +3 up to +12 and vanishes at ≥50% spend', () => {
  let b = 0;
  const seq: number[] = [];
  for (let i = 0; i < 6; i++) {
    b = nextIdleBonus(b, 4, 10);
    seq.push(b);
  }
  assert.deepEqual(seq, [3, 6, 9, 12, 12, 12]);
  assert.equal(nextIdleBonus(12, 5, 10), 0, 'exactly 50% spent resets');
  assert.equal(nextIdleBonus(9, 4.9, 10), 12);
});

test('AP hard cap 30 per round', () => {
  assert.equal(capAp(44), 30);
  assert.equal(capAp(-3), 0);
});

test('Damage example: Poison Bite (Power 60, PAtk 85) vs PDef 70 = 73, vs Steel = 58', () => {
  const plain = computeDamage({ power: 60, atk: 85, def: 70, tagProduct: 1, crit: false, modSum: 0, level: 1 });
  assert.equal(plain.final, 73);
  assert.ok(Math.abs(plain.ratio - 85 / 70) < 1e-9);
  const steel = computeDamage({ power: 60, atk: 85, def: 70, tagProduct: 0.8, crit: false, modSum: 0, level: 1 });
  assert.equal(steel.final, 58);
});

test('Atk/Def ratio is clamped to 0.5–2.0', () => {
  assert.equal(computeDamage({ power: 100, atk: 500, def: 10, tagProduct: 1, crit: false, modSum: 0, level: 1 }).ratio, 2);
  assert.equal(computeDamage({ power: 100, atk: 10, def: 500, tagProduct: 1, crit: false, modSum: 0, level: 1 }).ratio, 0.5);
});

test('Crit is ×1.5 and ignores 25% of Defense', () => {
  const c = computeDamage({ power: 60, atk: 85, def: 70, tagProduct: 1, crit: true, modSum: 0, level: 1 });
  assert.equal(c.C, 1.5);
  assert.equal(c.final, Math.round(60 * (85 / 52.5) * 1.5));
});

test('T is clamped to 0.5–1.75, immune overrides with 0', () => {
  assert.equal(computeDamage({ power: 50, atk: 50, def: 50, tagProduct: 1.5 * 1.25, crit: false, modSum: 0, level: 1 }).T, 1.75);
  assert.equal(computeDamage({ power: 50, atk: 50, def: 50, tagProduct: 0.3, crit: false, modSum: 0, level: 1 }).T, 0.5);
  const imm = computeDamage({ power: 50, atk: 50, def: 50, tagProduct: 1, immune: true, crit: false, modSum: 0, level: 1 });
  assert.equal(imm.final, 0);
});

test('M = 1 + sum of modifiers, clamped 0.4–2.5', () => {
  assert.equal(computeDamage({ power: 10, atk: 1, def: 1, tagProduct: 1, crit: false, modSum: 0.2 + 0.25, level: 1 }).M, 1.45);
  assert.equal(computeDamage({ power: 10, atk: 1, def: 1, tagProduct: 1, crit: false, modSum: -0.9, level: 1 }).M, 0.4);
  assert.equal(computeDamage({ power: 10, atk: 1, def: 1, tagProduct: 1, crit: false, modSum: 3, level: 1 }).M, 2.5);
});

test('L = 1 + 0.10 × (Level − 1); damage minimum 1', () => {
  assert.equal(levelMult(1), 1);
  assert.ok(Math.abs(levelMult(10) - 1.9) < 1e-9);
  assert.equal(computeDamage({ power: 1, atk: 1, def: 100, tagProduct: 0.5, crit: false, modSum: -0.6, level: 1 }).final, 1);
});

test('Hit% = clamp(5, 100, Acc + mods); "—" cannot miss', () => {
  assert.equal(hitChance(95, -30 - 10 - 15 - 10 - 20 - 10 - 10), 5);
  assert.equal(hitChance(90, 15 + 10), 100);
  assert.equal(hitChance(null, -100), 100);
  assert.equal(hitChance(85, -30), 55);
});

test('Status chance = listed × (1 − resist)', () => {
  assert.ok(Math.abs(statusChance(0.35, 0.2) - 0.28) < 1e-9);
  assert.ok(Math.abs(statusChance(0.4, 0, 1.5) - 0.6) < 1e-9, 'Emotional fear ×1.5');
});

test('AP budget rule examples: Toxic Needle 28.5, Unstable Mutation 25.7', () => {
  assert.equal(expectedDamagePerAp(60, 95, 0, 2), 28.5);
  assert.equal(Math.round(expectedDamagePerAp(110, 70, 0, 3) * 10) / 10, 25.7);
});

test('Card levels: Duplicates(L)=2(L−1), Gold(L)=75(L−1)²; L10 step = 18 dups, 6075 gold; total 90 dups', () => {
  assert.equal(duplicatesForLevel(10), 18);
  assert.equal(goldForLevel(10), 6075);
  assert.equal(totalDuplicatesTo(10), 90);
});

test('Tuning: 8 steps, max 5 per stat, up to 3 refunds; documented example is valid', () => {
  assert.ok(validateTuning({ hp: 5, patk: 2, sdef: 1, speed: -1 }).ok);
  assert.ok(!validateTuning({ hp: 6 }).ok);
  assert.ok(!validateTuning({ hp: 5, patk: 4 }).ok);
  assert.ok(validateTuning({ hp: 5, patk: 5, speed: -2 }).ok);
  assert.ok(!validateTuning({ speed: -2, pdef: -2 }).ok);
});

test('Trophies: win 25 + 1 per 5 VP margin, loss −15', () => {
  assert.equal(trophyDelta(true, 23), 29);
  assert.equal(trophyDelta(false, 40), -15);
});

test('Vacancy tax: +3, then +1 per further empty round, max +8', () => {
  assert.deepEqual([1, 2, 3, 6, 7, 10].map(vacancyTax), [3, 4, 5, 8, 8, 8]);
});

test('Move cost: ceil(fields × AP per field) per Move command', () => {
  assert.equal(moveCost(3, 0.75), 3);
  assert.equal(moveCost(2, 0.75), 2);
  assert.equal(moveCost(4, 0.5), 2);
  assert.equal(moveCost(3, 1.25), 4);
  assert.equal(moveCost(3, 1, 0, 0.75), 3);
  assert.equal(moveCost(1, 1, 0, 0.75), 1);
});
