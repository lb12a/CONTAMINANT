// Catalog integrity: roster, characteristics, items, decks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_LIST,
  CHARACTERISTICS,
  ITEM_LIST,
  EXAMPLE_DECKS,
  validateCharDeck,
  validateItemDeck,
  STATUSES,
  FIELDS,
  MILESTONES,
  CATEGORY_ORDER,
} from '../src/index.ts';

test('30 characters with the documented rarity split', () => {
  assert.equal(CHARACTER_LIST.length, 30);
  const by = (r: string) => CHARACTER_LIST.filter((c) => c.rarity === r).length;
  assert.deepEqual([by('common'), by('uncommon'), by('rare'), by('epic'), by('legendary')], [4, 7, 10, 6, 3]);
  assert.deepEqual(CHARACTER_LIST.map((c) => c.num), Array.from({ length: 30 }, (_, i) => i + 1));
});

test('master stat table spot checks', () => {
  const get = (id: string) => CHARACTER_LIST.find((c) => c.id === id)!;
  assert.deepEqual(get('nexus').stats, { hp: 260, patk: 40, pdef: 50, satk: 95, sdef: 60, speed: 160 });
  assert.equal(get('cruorina').deploy, 8);
  assert.equal(get('vile').stats.speed, 40);
  assert.equal(get('arachnia').move, 4);
  assert.equal(get('steak').apPerField, 1.25);
  assert.equal(get('zombie_limb').maxCopies, 3);
  assert.equal(get('baby_mummy').maxCopies, 3);
  assert.equal(get('termite_mound').move, 0);
});

test('each character has one characteristic per category, all defined', () => {
  for (const c of CHARACTER_LIST) {
    for (const cat of CATEGORY_ORDER) {
      const ch = CHARACTERISTICS[c.chars[cat]];
      assert.ok(ch, `${c.id}.${cat} = ${c.chars[cat]}`);
      assert.equal(ch!.category, cat, `${c.id}: ${ch!.id} is ${ch!.category}, expected ${cat}`);
    }
  }
});

test('42 characteristics; every one is used by at least one character', () => {
  assert.equal(Object.keys(CHARACTERISTICS).length, 42);
  const used = new Set(CHARACTER_LIST.flatMap((c) => Object.values(c.chars)));
  // Feral, Crystal, Phasing etc. are also reachable through Gear; the roster covers all of them
  const unused = Object.keys(CHARACTERISTICS).filter((k) => !used.has(k));
  assert.deepEqual(unused, []);
});

test('two attacks + one ability per character, all attack ids unique', () => {
  const ids = new Set<string>();
  for (const c of CHARACTER_LIST) {
    assert.equal(c.attacks.length, 2, c.id);
    assert.ok(c.ability);
    for (const a of c.attacks) {
      assert.ok(!ids.has(a.id), a.id);
      ids.add(a.id);
      assert.ok(a.ap >= 0 && a.ap <= 4, `${a.id} AP 1–4`);
    }
  }
});

test('70 items: 10 per type, rarity split 21/18/18/8/5, 8 Free cards', () => {
  assert.equal(ITEM_LIST.length, 70);
  for (const t of ['character', 'field', 'ability', 'attack', 'gear', 'trap', 'intel']) assert.equal(ITEM_LIST.filter((i) => i.type === t).length, 10, t);
  const by = (r: string) => ITEM_LIST.filter((i) => i.rarity === r).length;
  assert.deepEqual([by('common'), by('uncommon'), by('rare'), by('epic'), by('legendary')], [21, 18, 18, 8, 5]);
  assert.equal(ITEM_LIST.filter((i) => i.cost === 0).length, 8);
  for (const i of ITEM_LIST) assert.ok(CHARACTERISTICS[i.trait], `${i.id} trait ${i.trait}`);
  for (const i of ITEM_LIST.filter((x) => x.rarity === 'legendary')) assert.ok(i.cost >= 3 && i.cost <= 4, `${i.id}: legendaries cost 3–4 AP`);
});

test('example decks are legal with the documented Deploy AP (42 / 45 / 49)', () => {
  const totals = EXAMPLE_DECKS.map((d) => {
    const c = validateCharDeck(d.characters.map((defId) => ({ defId })));
    assert.ok(c.ok, `${d.name}: ${c.errors.join('; ')}`);
    const i = validateItemDeck(d.items);
    assert.ok(i.ok, `${d.name} items: ${i.errors.join('; ')}`);
    return c.deployTotal;
  });
  assert.deepEqual(totals, [42, 45, 49]);
});

test('deck rules reject illegal decks', () => {
  const tooMany = validateCharDeck(['cruorina', 'mambo', 'midas_mummy', 'nexus', 'arachnia', 'vile', 'mycel', 'lullabun', 'pumpkin', 'steak'].map((defId) => ({ defId })));
  assert.ok(!tooMany.ok && tooMany.errors.some((e) => e.includes('Legendary')));
  const dupes = validateCharDeck(Array(10).fill({ defId: 'zombie_limb' }));
  assert.ok(!dupes.ok);
  const budget = validateCharDeck(['cruorina', 'mambo', 'frankenstein', 'crystal_eye', 'arachnia', 'nexus', 'werewolf', 'vile', 'mycel', 'steak'].map((defId) => ({ defId })));
  assert.ok(budget.errors.some((e) => e.includes('Deploy AP')));
  const items = validateItemDeck([...Array(4).fill('whetstone'), ...Array(16).fill('scope')]);
  assert.ok(!items.ok);
});

test('statuses and fields cover the design tables', () => {
  for (const id of ['poison', 'bleeding', 'burn', 'slow', 'haste', 'blind', 'shock', 'corrosion', 'fear', 'marked', 'vulnerable', 'silence', 'infection', 'corruption', 'echo', 'spotlight', 'depressed', 'egg', 'leeched', 'patient', 'jinx', 'gilded', 'garland', 'starving_mark', 'snared', 'dazed', 'mired', 'soaked', 'frozen', 'well_fed', 'exhausted', 'empowered', 'weakened', 'fortified', 'brittle', 'regeneration', 'hidden', 'entranced'])
    assert.ok((STATUSES as Record<string, unknown>)[id], id);
  assert.equal((STATUSES as any).poison.maxStacks, 2);
  assert.equal((STATUSES as any).corrosion.maxStacks, 3);
  assert.ok(Object.keys(FIELDS).length >= 29 + 6);
});

test('milestone areas unlock all 30 characters exactly once', () => {
  const all = MILESTONES.flatMap((m) => m.cards);
  assert.equal(all.length, 30);
  assert.equal(new Set(all).size, 30);
});
