import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedOrder,
  singleElimination,
  doubleElimination,
  swiss,
  swissNextRound,
  swissStandings,
  roundRobinGroups,
  groupStandings,
  report,
  playable,
  champion,
  placements,
  type Bracket,
  type Entrant,
} from '../src/brackets.ts';
import { divisionFor, expected, rate, softReset, DIVISIONS } from '../src/rating.ts';
import { classifyDeck, wilson } from '../src/meta.ts';

const players = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1, mmr: 2000 - i * 10 }));

/** Plays the bracket to the end: the better seed always wins (or a custom rule). */
function playOut(b: Bracket, pick?: (a: string, b: string) => string): number {
  let n = 0;
  for (let guard = 0; guard < 500; guard++) {
    const ready = playable(b);
    if (!ready.length) {
      if (b.format === 'swiss' && (b.current ?? 0) < b.rounds) {
        swissNextRound(b);
        continue;
      }
      break;
    }
    for (const m of ready) {
      const seed = (id: string) => b.entrants.find((e) => e.id === id)!.seed;
      const w = pick ? pick(m.a!, m.b!) : seed(m.a!) < seed(m.b!) ? m.a! : m.b!;
      report(b, m.id, w, 50, 30);
      n++;
    }
  }
  return n;
}

test('standard seed order', () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
});

test('single elimination with byes: top seeds get byes, favourite wins, 3rd place match', () => {
  const b = singleElimination(players(6), { thirdPlace: true });
  assert.equal(b.matches.filter((m) => m.round === 1).length, 4);
  assert.equal(b.matches.filter((m) => m.bye).length, 2, 'seeds 1 and 2 get a bye');
  const played = playOut(b);
  assert.equal(played, 2 + 2 + 1 + 1, '2 real first-round matches, 2 semis, final, 3rd place');
  assert.equal(champion(b), 'p1');
  const pl = placements(b);
  assert.equal(pl[0]!.id, 'p1');
  assert.equal(pl.find((x) => x.id === 'p2')!.place, 2);
  assert.ok(pl.some((x) => x.place === 3));
});

test('double elimination: losers bracket champion can force a grand final reset', () => {
  for (const n of [4, 6, 8, 13, 16]) {
    const b = doubleElimination(players(n));
    playOut(b);
    assert.equal(champion(b), 'p1', `${n} players`);
  }
  // p2 beats p1 in the grand final from the losers bracket → reset match decides
  const b = doubleElimination(players(8));
  let gfPlayed = false;
  playOut(b, (a, c) => {
    const isGf = [a, c].includes('p1') && [a, c].includes('p2');
    if (isGf && !gfPlayed && b.matches.find((m) => m.id === 'GF')!.status === 'ready') {
      gfPlayed = true;
      return 'p2';
    }
    return Number(a.slice(1)) < Number(c.slice(1)) ? a : c;
  });
  assert.equal(b.matches.find((m) => m.id === 'GF2')!.status, 'done');
});

test('swiss: no rematches, everyone plays every round, byes rotate', () => {
  const b = swiss(players(9), 4);
  playOut(b);
  const seen = new Set<string>();
  for (const m of b.matches.filter((x) => x.a && x.b)) {
    const k = [m.a, m.b].sort().join('|');
    assert.ok(!seen.has(k), `rematch ${k}`);
    seen.add(k);
  }
  const st = swissStandings(b);
  assert.equal(st[0]!.id, 'p1');
  assert.equal(st[0]!.points, 12);
  assert.ok(st.every((s) => s.byes <= 1));
  assert.equal(champion(b), 'p1');
});

test('round robin groups: snake seeding, everyone meets everyone in the group', () => {
  const b = roundRobinGroups(players(16), 4);
  assert.deepEqual(Object.values(b.groups!).map((g) => g.length), [4, 4, 4, 4]);
  assert.deepEqual(b.groups!.A, ['p1', 'p8', 'p9', 'p16']);
  assert.equal(b.matches.length, 4 * 6);
  playOut(b);
  assert.equal(groupStandings(b, 'A')[0]!.id, 'p1');
  assert.equal(groupStandings(b, 'A')[0]!.points, 9);
});

test('Elo: expected scores, provisional K, soft reset', () => {
  assert.equal(expected(1000, 1000), 0.5);
  const r = rate(1000, 1000, 0, 0, 1);
  assert.ok(r.deltaA > 20 && r.deltaB < -20);
  assert.ok(Math.abs(r.deltaA + r.deltaB) < 1e-9, 'zero-sum for equal K');
  assert.equal(softReset(1600), 1300);
  assert.equal(softReset(800), 900);
});

test('divisions Bronze → Grandmaster/Contaminant Elite with sub-tiers', () => {
  assert.equal(DIVISIONS.length, 7);
  assert.equal(divisionFor(500).division.id, 'bronze');
  assert.equal(divisionFor(1000).label, 'Silver IV');
  assert.equal(divisionFor(1199).label, 'Silver I');
  assert.equal(divisionFor(2050).division.id, 'grandmaster');
  assert.equal(divisionFor(2050).label, 'Grandmaster · Contaminant Elite');
});

test('meta helpers: Wilson interval and archetype classification', () => {
  const [lo, hi] = wilson(60, 100);
  assert.ok(lo > 0.5 && lo < 0.6 && hi > 0.65);
  assert.equal(classifyDeck(['arachnia', 'vile', 'mycel', 'swamp_siren', 'leech_cook', 'termite_mound', 'pumpkin', 'lab_assistant', 'zombie_limb', 'zombie_limb']).archetype, 'plague_garden');
  assert.equal(classifyDeck(['nexus', 'frankenstein', 'crystal_eye', 'scarecrow', 'ghost_train', 'lullabun', 'cymbal_chimp', 'piggybank', 'ballerina', 'pokerface']).archetype, 'clockwork_circuit');
});
