// Bot-vs-bot simulation runner: `node packages/engine/scripts/simulate.ts [games] [mode]`
// Used for balance testing and to seed meta-analysis telemetry.

import { botPlan, deckToCards, EXAMPLE_DECKS, newMatch, playRound, stateHash, type GameState, type ModeId } from '../src/index.ts';

const games = Number(process.argv[2] ?? 20);
const mode = (process.argv[3] ?? 'contamination') as ModeId;
const verbose = process.argv.includes('--verbose');

export interface SimResult {
  seed: number;
  winner: 0 | 1 | 'draw' | null;
  rounds: number;
  vp: [number, number];
  decks: [string, string];
  reason: string | null;
  hash: string;
}

export function simulate(seed: number, d0 = seed % 3, d1 = (seed >> 2) % 3, m: ModeId = mode): { s: GameState; res: SimResult } {
  const A = EXAMPLE_DECKS[d0]!;
  const B = EXAMPLE_DECKS[d1]!;
  const s = newMatch({
    seed,
    settings: { mode: m, friendly: true, maxRounds: 30 },
    players: [
      { name: `Bot ${A.name}`, cards: deckToCards(A, 10, 'a'), items: A.items, isBot: true },
      { name: `Bot ${B.name}`, cards: deckToCards(B, 10, 'b'), items: B.items, isBot: true },
    ],
  });
  while (s.phase !== 'over') {
    const plans = [botPlan(s, 0), botPlan(s, 1)] as const;
    playRound(s, [plans[0], plans[1]]);
    if (s.round > 60) break;
  }
  return {
    s,
    res: {
      seed,
      winner: s.winner,
      rounds: s.round,
      vp: [s.players[0].vp, s.players[1].vp],
      decks: [A.name, B.name],
      reason: s.winReason,
      hash: stateHash(s),
    },
  };
}

if (import.meta.url === `file:///${process.argv[1]!.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('simulate.ts')) {
  const t0 = Date.now();
  const wins: Record<string, number> = {};
  let rounds = 0;
  for (let i = 1; i <= games; i++) {
    const { res } = simulate(1000 + i);
    rounds += res.rounds;
    const w = res.winner === 'draw' || res.winner === null ? 'draw' : res.decks[res.winner];
    wins[w] = (wins[w] ?? 0) + 1;
    if (verbose) console.log(`#${i} ${res.decks.join(' vs ')} → ${w} in ${res.rounds} rounds (${res.vp.join(':')}) ${res.reason}`);
  }
  console.log(`${games} games, avg ${(rounds / games).toFixed(1)} rounds, ${((Date.now() - t0) / games).toFixed(0)} ms/game`);
  console.log(wins);
}
