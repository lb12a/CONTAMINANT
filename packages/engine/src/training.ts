// Basic Training: the guided first match. A quiet lab, a training dummy and a walking dummy for the
// Warden; the player deploys Vile, walks up, attacks with a Whetstone attached and learns how a round
// resolves. The Warden stays passive while the coach is talking and plays an easy bot afterwards.

import { botPlan } from './ai.ts';
import { emptyPlan } from './planning.ts';
import { createSandbox } from './sandbox.ts';
import type { Hex } from './hex.ts';
import type { GameState, Plan } from './types.ts';

export const TRAINING = {
  /** where the coach asks the player to deploy (in reach of the dummy one round later) */
  deployTiles: [
    { c: 4, r: 4 },
    { c: 4, r: 3 },
    { c: 4, r: 5 },
  ] as Hex[],
  dummy: { c: 7, r: 4 } as Hex,
  control: { c: 7, r: 1 } as Hex,
  main: 'vile',
  attack: 'vile.reapers_slash',
  card: 'whetstone',
  /** the Warden starts acting in this round */
  wardenWakes: 4,
};

export function createTraining(seed = 11): GameState {
  return createSandbox({
    seed,
    zone: 'laboratory',
    names: ['You', 'Warden'],
    walls: [
      { c: 6, r: 6 },
      { c: 6, r: 7 },
      { c: 9, r: 2 },
      { c: 10, r: 5 },
      { c: 2, r: 7 },
      { c: 3, r: 1 },
    ],
    objectives: [{ pos: TRAINING.control, kind: 'control' }],
    units: [
      { owner: 1, defId: 'training_dummy', pos: TRAINING.dummy, summon: true, tag: 'dummy' },
      { owner: 1, defId: 'training_walker', pos: { c: 12, r: 6 }, summon: true, tag: 'walker' },
    ],
    decks: [[TRAINING.main, 'arachnia', 'lab_assistant'], []],
    hands: [[TRAINING.card, 'field_medkit', 'smoke_candle'], []],
    ap: [10, 10],
    fixedRandom: true,
  });
}

/** The Warden waits while the coach explains, then plays like an easy bot (no cards, no deployments). */
export function trainingWardenPlan(s: GameState): Plan {
  if (s.round < TRAINING.wardenWakes) return emptyPlan(1);
  const p = botPlan(s, 1, { difficulty: 'easy' });
  p.commands = p.commands.filter((c) => c.kind !== 'item' && c.kind !== 'deploy');
  return p;
}
