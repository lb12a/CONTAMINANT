// All six game modes play to a proper end with the decks players really have: the four-character starter
// deck, mid-sized decks and full ten-character decks, bot against bot, with every plan legal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botPlan, EXAMPLE_DECKS, makeRng, newMatch, playRound, STARTER_DECK, validatePlan, zoneDeck, type CharCard, type ModeId } from '../src/index.ts';

const MODES: ModeId[] = ['contamination', 'elimination', 'domination', 'research', 'escape', 'anomaly'];

const cards = (ids: string[], prefix: string): CharCard[] => ids.map((defId, i) => ({ uid: `${prefix}${i}`, defId, level: 1, tuning: {} }));

function decks(seed: number): { name: string; a: { characters: string[]; items: string[] }; b: { characters: string[]; items: string[] } }[] {
  const rng = makeRng(seed);
  return [
    { name: 'starter vs starter', a: STARTER_DECK, b: STARTER_DECK },
    { name: 'starter vs 6', a: STARTER_DECK, b: zoneDeck(rng, ['laboratory', 'graveyard'], 6, 10) },
    { name: '10 vs 10', a: EXAMPLE_DECKS[0]!, b: EXAMPLE_DECKS[1]! },
  ];
}

test('every mode ends with a winner or a draw for small and full decks, with legal plans only', () => {
  for (const mode of MODES) {
    for (const [k, d] of decks(11).entries()) {
      const s = newMatch({
        seed: 100 + k * 7 + MODES.indexOf(mode),
        settings: { mode, maxRounds: 40 },
        players: [
          { name: 'A', cards: cards(d.a.characters, 'a'), items: d.a.items, isBot: true },
          { name: 'B', cards: cards(d.b.characters, 'b'), items: d.b.items, isBot: true },
        ],
      });
      let rounds = 0;
      while (s.phase !== 'over' && rounds++ < 45) {
        const p0 = botPlan(s, 0, { difficulty: 'normal', seed: rounds });
        const p1 = botPlan(s, 1, { difficulty: 'hard', seed: rounds + 50 });
        for (const p of [p0, p1]) {
          const chk = validatePlan(s, p);
          assert.ok(chk.ok, `${mode} / ${d.name} round ${s.round}: bot plan invalid: ${chk.issues.map((i) => i.error).join('; ')}`);
        }
        playRound(s, [p0, p1]);
      }
      assert.equal(s.phase, 'over', `${mode} / ${d.name} did not end after ${rounds} rounds`);
      assert.ok(s.winner !== null, `${mode} / ${d.name}: no result`);
      assert.ok(s.winReason, `${mode} / ${d.name}: no reason`);
    }
  }
});
