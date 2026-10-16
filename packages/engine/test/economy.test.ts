// Collection economy: small start, 4–10 character decks, trophy-gated areas and fair bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fairBotDeck, makeRng, MILESTONES, openChest, starterCollection, STARTER_DECK, validateCharDeck, validateItemDeck, zonesForTrophies } from '../src/index.ts';

test('a new subject starts with the four lab residents and a few cards', () => {
  const col = starterCollection();
  assert.deepEqual(Object.keys(col.chars).sort(), [...STARTER_DECK.characters].sort());
  assert.equal(Object.values(col.items).reduce((a, b) => a + b, 0), STARTER_DECK.items.length);
  assert.ok(validateCharDeck(STARTER_DECK.characters.map((defId) => ({ defId }))).ok);
  assert.ok(validateItemDeck(STARTER_DECK.items).ok);
});

test('character decks hold 4 to 10 characters', () => {
  const four = STARTER_DECK.characters.map((defId) => ({ defId }));
  assert.ok(validateCharDeck(four).ok);
  assert.ok(!validateCharDeck(four.slice(0, 3)).ok);
  const eleven = [...four, ...four, { defId: 'vile' }, { defId: 'calaca' }, { defId: 'mambo' }];
  assert.ok(!validateCharDeck(eleven).ok);
});

test('chests only drop characters from areas the trophies have unlocked', () => {
  const col = starterCollection();
  const open = new Set(MILESTONES.filter((m) => zonesForTrophies(0).includes(m.zone)).flatMap((m) => m.cards));
  assert.ok(open.size > STARTER_DECK.characters.length, 'some characters can be found in chests right away');
  for (let i = 0; i < 40; i++) {
    const r = openChest(col, 'large', makeRng(i + 1));
    for (const d of r.drops) if (d.kind === 'character') assert.ok(open.has(d.id), `${d.id} dropped at 0 trophies`);
  }
});

test('the first chest of a new subject always holds a new character', () => {
  for (let i = 0; i < 25; i++) {
    const col = starterCollection();
    const r = openChest(col, 'small', makeRng(500 + i));
    assert.ok(r.drops.some((d) => d.kind === 'character' && !d.duplicate), `seed ${i}`);
    assert.equal(r.drops.length, 3);
  }
});

test('bots bring only unlockable characters, as many as the player, never above the player level', () => {
  const player = { characters: STARTER_DECK.characters.map((defId) => ({ defId, level: 3 })), items: STARTER_DECK.items };
  const atZero = new Set(MILESTONES.filter((m) => zonesForTrophies(0).includes(m.zone)).flatMap((m) => m.cards));
  for (let i = 0; i < 20; i++) {
    const bot = fairBotDeck(makeRng(100 + i), player, 0);
    assert.equal(bot.characters.length, 4);
    for (const c of bot.characters) {
      assert.ok(atZero.has(c.defId), `${c.defId} is not available at 0 trophies`);
      assert.ok(c.level <= 3);
    }
  }
  const wider = fairBotDeck(makeRng(7), { characters: [...player.characters, ...player.characters, { defId: 'vile', level: 1 }, { defId: 'calaca', level: 1 }], items: player.items }, 200);
  assert.equal(wider.characters.length, 10);
  const upToBog = new Set(MILESTONES.filter((m) => zonesForTrophies(200).includes(m.zone)).flatMap((m) => m.cards));
  for (const c of wider.characters) assert.ok(upToBog.has(c.defId));
  assert.ok(wider.characters.every((c) => c.level <= 2), 'average level of 3,3,3,3,3,3,3,3,1,1 rounds down to 2');
});
