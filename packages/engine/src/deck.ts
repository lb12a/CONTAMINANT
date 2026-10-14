// Section 6: Character Deck (10) and Item Deck (20) rules plus the three example decks.

import { CHARACTERS } from './data/characters.ts';
import { ITEMS, ITEM_LIST } from './data/items.ts';
import { validateTuning } from './formulas.ts';
import type { CharCard, Rarity, Tuning } from './types.ts';
import * as rngFns from './rng.ts';

export const CHAR_DECK_SIZE = 10;
export const ITEM_DECK_SIZE = 20;
export const DEPLOY_BUDGET = 58;
export const ITEM_COPIES: Record<Rarity, number> = { common: 3, uncommon: 2, rare: 2, epic: 1, legendary: 1 };

export interface DeckCheck {
  ok: boolean;
  errors: string[];
  deployTotal?: number;
}

export interface DeckCardInput {
  defId: string;
  level?: number;
  tuning?: Tuning;
}

export function validateCharDeck(cards: DeckCardInput[]): DeckCheck {
  const errors: string[] = [];
  if (cards.length !== CHAR_DECK_SIZE) errors.push(`Character Deck needs exactly ${CHAR_DECK_SIZE} characters (has ${cards.length})`);
  const counts: Record<string, number> = {};
  let legendary = 0;
  let epicPlus = 0;
  let deploy = 0;
  for (const c of cards) {
    const def = CHARACTERS[c.defId];
    if (!def) {
      errors.push(`unknown character ${c.defId}`);
      continue;
    }
    counts[c.defId] = (counts[c.defId] ?? 0) + 1;
    if (def.rarity === 'legendary') legendary++;
    if (def.rarity === 'legendary' || def.rarity === 'epic') epicPlus++;
    deploy += def.deploy;
    if (c.tuning) {
      const t = validateTuning(c.tuning);
      if (!t.ok) errors.push(`${def.name}: ${t.error}`);
    }
    if (c.level !== undefined && (c.level < 1 || c.level > 10)) errors.push(`${def.name}: level must be 1–10`);
  }
  for (const [id, n] of Object.entries(counts)) {
    const max = CHARACTERS[id]!.maxCopies;
    if (n > max) errors.push(`${CHARACTERS[id]!.name}: at most ${max} cop${max === 1 ? 'y' : 'ies'}`);
  }
  if (legendary > 2) errors.push('at most 2 Legendary characters');
  if (epicPlus > 4) errors.push('at most 4 Epic and Legendary characters together');
  if (deploy > DEPLOY_BUDGET) errors.push(`total Deploy AP ${deploy} exceeds ${DEPLOY_BUDGET}`);
  return { ok: errors.length === 0, errors, deployTotal: deploy };
}

export function validateItemDeck(items: string[]): DeckCheck {
  const errors: string[] = [];
  if (items.length !== ITEM_DECK_SIZE) errors.push(`Item Deck needs exactly ${ITEM_DECK_SIZE} cards (has ${items.length})`);
  const counts: Record<string, number> = {};
  let epicPlus = 0;
  for (const id of items) {
    const it = ITEMS[id];
    if (!it || id === 'midas_touch_card') {
      errors.push(`unknown item ${id}`);
      continue;
    }
    counts[id] = (counts[id] ?? 0) + 1;
    if (it.rarity === 'epic' || it.rarity === 'legendary') epicPlus++;
  }
  for (const [id, n] of Object.entries(counts)) {
    const it = ITEMS[id]!;
    if (n > ITEM_COPIES[it.rarity]) errors.push(`${it.name}: at most ${ITEM_COPIES[it.rarity]} copies (${it.rarity})`);
  }
  if (epicPlus > 3) errors.push('at most 3 Epic and Legendary item cards together');
  return { ok: errors.length === 0, errors };
}

export interface DeckDef {
  id: string;
  name: string;
  plan: string;
  characters: string[];
  items: string[];
}

export const EXAMPLE_DECKS: DeckDef[] = [
  {
    id: 'plague_garden',
    name: 'Plague Garden',
    plan: 'Poison and status attrition. Mycel and Vile punish statuses, Zombie Limbs are cheap blockers.',
    characters: ['arachnia', 'vile', 'mycel', 'swamp_siren', 'leech_cook', 'termite_mound', 'pumpkin', 'lab_assistant', 'zombie_limb', 'zombie_limb'],
    items: [
      'contamination_burst', 'contamination_burst', 'poison_coating', 'poison_coating', 'field_medkit', 'field_medkit',
      'antidote', 'iron_tonic', 'iron_tonic', 'smelling_salts', 'rain_barrel', 'seed_bomb', 'hex_scroll', 'spike_pit',
      'bear_snare', 'scout_card', 'ration_pack', 'second_wind', 'blackout_lantern', 'mind_link',
    ],
  },
  {
    id: 'tomb_and_ember',
    name: 'Tomb and Ember',
    plan: "Fire, souls and curses. Wisp gas plus Calaca's fire, Midas buffs a tank, Baby Mummies feed the Wendigo.",
    characters: ['calaca', 'midas_mummy', 'baby_mummy', 'baby_mummy', 'little_wendigo', 'werewolf', 'mambo', 'wisp', 'steak', 'cog_cuckoo'],
    items: [
      'molotov', 'molotov', 'flame_oil', 'flame_oil', 'whetstone', 'whetstone', 'field_medkit', 'adrenaline_shot',
      'bone_charm', 'bone_charm', 'gas_leak', 'smoke_candle', 'rage_pill', 'lucky_coin', 'spare_battery', 'overtime',
      'scope', 'phoenix_feather', 'wolf_pelt', 'gag_order',
    ],
  },
  {
    id: 'clockwork_circuit',
    name: 'Clockwork Circuit',
    plan: 'Information and tempo. Scarecrow and Ghost Train read and move the enemy, Nexus corrupts the middle.',
    characters: ['nexus', 'frankenstein', 'crystal_eye', 'scarecrow', 'ghost_train', 'lullabun', 'cymbal_chimp', 'piggybank', 'ballerina', 'pokerface'],
    items: [
      'tesla_coil', 'tesla_coil', 'scope', 'scope', 'whetstone', 'chain_link', 'insulated_gloves', 'night_goggles',
      'spy_drone', 'scout_card', 'scout_card', 'amplifier_coil', 'spare_battery', 'shock_plate', 'shock_plate',
      'iron_tonic', 'heavy_gloves', 'silencer', 'backwards_clock', 'executioners_ledger',
    ],
  },
];

export function deckToCards(deck: DeckDef | { characters: string[] }, level = 1, uidPrefix = 'c'): CharCard[] {
  return deck.characters.map((defId, i) => ({ uid: `${uidPrefix}${i + 1}`, defId, level, tuning: {} }));
}

/** All items of the catalog in deck-legal quantities (for sandbox/collection views). */
export function catalogItems(): string[] {
  return ITEM_LIST.map((i) => i.id);
}

/** Random legal decks (bots, simulations, meta seeding). */
export function randomDeck(rng: rngFns.RngState, owned?: { chars?: string[]; items?: string[] }): DeckDef {
  const { rand } = rngFns;
  const charPool = Object.values(CHARACTERS).filter((c) => !owned?.chars || owned.chars.includes(c.id));
  for (let attempt = 0; attempt < 200; attempt++) {
    const chars: string[] = [];
    const shuffled = rngFns.shuffle(rng, charPool.slice());
    for (const c of shuffled) {
      if (chars.length >= CHAR_DECK_SIZE) break;
      const copies = c.maxCopies > 1 && rand(rng) < 0.35 ? Math.min(c.maxCopies, 1 + Math.floor(rand(rng) * c.maxCopies)) : 1;
      for (let k = 0; k < copies && chars.length < CHAR_DECK_SIZE; k++) {
        const trial = [...chars, c.id];
        if (validateCharDeck(trial.map((defId) => ({ defId }))).errors.every((e) => e.startsWith('Character Deck needs'))) chars.push(c.id);
      }
    }
    if (!validateCharDeck(chars.map((defId) => ({ defId }))).ok) continue;
    const items: string[] = [];
    const itemPool = rngFns.shuffle(rng, ITEM_LIST.filter((i) => !owned?.items || owned.items.includes(i.id)));
    for (const it of itemPool) {
      if (items.length >= ITEM_DECK_SIZE) break;
      const max = ITEM_COPIES[it.rarity];
      const n = 1 + Math.floor(rand(rng) * max);
      for (let k = 0; k < n && items.length < ITEM_DECK_SIZE; k++) {
        if (validateItemDeck([...items, it.id]).errors.every((e) => e.startsWith('Item Deck needs'))) items.push(it.id);
      }
    }
    if (!validateItemDeck(items).ok) continue;
    return { id: `random-${attempt}`, name: 'Random Deck', plan: 'Random legal deck', characters: chars, items };
  }
  return EXAMPLE_DECKS[0]!;
}
