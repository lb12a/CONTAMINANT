// Section 6 progression: collection, chests and drops, card levels, trophies, milestones, daily missions.

import { CHARACTER_LIST, CHARACTERS, MILESTONES } from './data/characters.ts';
import { ITEM_LIST, ITEMS } from './data/items.ts';
import { duplicatesForLevel, goldForLevel, trophyDelta } from './formulas.ts';
import { EXAMPLE_DECKS } from './deck.ts';
import { hashString, makeRng, rand, randInt, weighted, type RngState } from './rng.ts';
import type { Rarity, Zone } from './types.ts';

export const RARITY_DROP: [Rarity, number][] = [
  ['common', 0.45],
  ['uncommon', 0.28],
  ['rare', 0.16],
  ['epic', 0.08],
  ['legendary', 0.03],
];

/** Duplicates drop about 4 times as often as cards you do not own. */
export const DUPLICATE_WEIGHT = 4;

export type ChestSize = 'small' | 'medium' | 'large';

export const CHESTS: Record<ChestSize, { name: string; cards: number; gold: [number, number]; price: number; look: string }> = {
  small: { name: 'Wooden Chest', cards: 3, gold: [20, 40], price: 150, look: 'Holztruhe' },
  medium: { name: 'Iron-bound Chest', cards: 5, gold: [50, 90], price: 400, look: 'Eisenbeschlagene Truhe' },
  large: { name: 'Coffin Chest', cards: 8, gold: [120, 200], price: 900, look: 'Sarg-Truhe' },
};

export interface OwnedChar {
  level: number;
  dups: number;
  tutorialDone?: boolean;
  isNew?: boolean;
}

export interface Collection {
  gold: number;
  trophies: number;
  bestTrophies: number;
  chars: Record<string, OwnedChar>;
  /** item id → copies owned */
  items: Record<string, number>;
  chests: ChestSize[];
  cardBacks: string[];
  titles: string[];
}

export function zonesForTrophies(trophies: number): Zone[] {
  return MILESTONES.filter((m) => trophies >= m.trophies).map((m) => m.zone);
}

export function nextMilestone(trophies: number) {
  return MILESTONES.find((m) => m.trophies > trophies) ?? null;
}

/** New players pick one of the example decks as their starter archive. */
export function starterCollection(deckIndex = 2): Collection {
  const deck = EXAMPLE_DECKS[deckIndex] ?? EXAMPLE_DECKS[0]!;
  const chars: Record<string, OwnedChar> = {};
  for (const id of deck.characters) chars[id] = { level: 1, dups: 0, tutorialDone: false };
  // laboratory cards are always available
  for (const id of MILESTONES[0]!.cards) chars[id] ??= { level: 1, dups: 0, tutorialDone: false };
  const items: Record<string, number> = {};
  for (const id of deck.items) items[id] = (items[id] ?? 0) + 1;
  return { gold: 500, trophies: 0, bestTrophies: 0, chars, items, chests: ['small'], cardBacks: ['biohazard'], titles: [] };
}

export interface Drop {
  kind: 'character' | 'item';
  id: string;
  rarity: Rarity;
  duplicate: boolean;
}

export interface ChestResult {
  gold: number;
  drops: Drop[];
}

function poolFor(zones: Zone[], rarity: Rarity) {
  const chars = CHARACTER_LIST.filter((c) => c.rarity === rarity && zones.includes(c.zone));
  const items = ITEM_LIST.filter((i) => i.rarity === rarity && (zones.includes(i.zone) || i.zone === 'laboratory'));
  return { chars, items };
}

export function openChest(col: Collection, size: ChestSize, rng: RngState, zones = zonesForTrophies(col.bestTrophies)): ChestResult {
  const chest = CHESTS[size];
  const drops: Drop[] = [];
  for (let i = 0; i < chest.cards; i++) {
    let rarity = weighted(rng, RARITY_DROP);
    let pool = poolFor(zones, rarity);
    // fall back to a lower rarity if the unlocked pool is empty
    const order: Rarity[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    while (!pool.chars.length && !pool.items.length) {
      rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + 1)]!;
      pool = poolFor(zones, rarity);
      if (rarity === 'common') break;
    }
    const isChar = pool.chars.length > 0 && (pool.items.length === 0 || rand(rng) < 0.4);
    if (isChar) {
      const id = weighted(rng, pool.chars.map((c) => [c.id, col.chars[c.id] ? DUPLICATE_WEIGHT : 1] as const));
      const dup = !!col.chars[id];
      if (dup) col.chars[id]!.dups++;
      else col.chars[id] = { level: 1, dups: 0, tutorialDone: false, isNew: true };
      drops.push({ kind: 'character', id, rarity, duplicate: dup });
    } else if (pool.items.length) {
      const id = weighted(rng, pool.items.map((it) => [it.id, col.items[it.id] ? DUPLICATE_WEIGHT : 1] as const));
      const dup = !!col.items[id];
      col.items[id] = (col.items[id] ?? 0) + 1;
      drops.push({ kind: 'item', id, rarity, duplicate: dup });
    }
  }
  const gold = randInt(rng, chest.gold[0], chest.gold[1]);
  col.gold += gold;
  return { gold, drops };
}

export function canLevelUp(col: Collection, defId: string): { ok: boolean; dups: number; gold: number; reason?: string } {
  const c = col.chars[defId];
  if (!c) return { ok: false, dups: 0, gold: 0, reason: 'not owned' };
  if (c.level >= 10) return { ok: false, dups: 0, gold: 0, reason: 'max level' };
  const next = c.level + 1;
  const dups = duplicatesForLevel(next);
  const gold = goldForLevel(next);
  if (c.dups < dups) return { ok: false, dups, gold, reason: `needs ${dups} duplicates` };
  if (col.gold < gold) return { ok: false, dups, gold, reason: `needs ${gold} gold` };
  return { ok: true, dups, gold };
}

export function levelUp(col: Collection, defId: string): boolean {
  const chk = canLevelUp(col, defId);
  if (!chk.ok) return false;
  const c = col.chars[defId]!;
  c.dups -= chk.dups;
  col.gold -= chk.gold;
  c.level++;
  return true;
}

export interface MatchReward {
  trophies: number;
  gold: number;
  chest: ChestSize | null;
}

/** A win gives 25 trophies + 1 per 5 VP margin, a loss costs 15 (never below 0). Gold and chests after every match. */
export function matchReward(won: boolean, margin: number, opts: { ranked?: boolean; friendly?: boolean; draw?: boolean } = {}): MatchReward {
  if (opts.friendly) return { trophies: 0, gold: won ? 20 : 10, chest: null };
  if (opts.draw) return { trophies: 0, gold: 30, chest: 'small' };
  return {
    trophies: trophyDelta(won, margin),
    gold: won ? 60 + Math.floor(margin / 2) : 25,
    chest: won ? (margin >= 40 ? 'medium' : 'small') : null,
  };
}

export function applyMatchReward(col: Collection, r: MatchReward): string[] {
  const before = zonesForTrophies(col.bestTrophies);
  col.trophies = Math.max(0, col.trophies + r.trophies);
  col.bestTrophies = Math.max(col.bestTrophies, col.trophies);
  col.gold += r.gold;
  if (r.chest) col.chests.push(r.chest);
  const after = zonesForTrophies(col.bestTrophies);
  return after.filter((z) => !before.includes(z));
}

// ---------------------------------------------------------------- daily missions

export interface MissionDef {
  id: string;
  text: string;
  textDe: string;
  target: number;
  stat: 'played' | 'won' | 'kos' | 'damage' | 'items' | 'deploys' | 'vp' | 'tutorials';
  reward: { gold: number; chest?: ChestSize };
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'play3', text: 'Play 3 matches', textDe: 'Spiele 3 Matches', target: 3, stat: 'played', reward: { gold: 80 } },
  { id: 'win1', text: 'Win 1 match', textDe: 'Gewinne 1 Match', target: 1, stat: 'won', reward: { gold: 60, chest: 'small' } },
  { id: 'win3', text: 'Win 3 matches', textDe: 'Gewinne 3 Matches', target: 3, stat: 'won', reward: { gold: 150, chest: 'medium' } },
  { id: 'ko10', text: "KO 10 enemy characters", textDe: 'Besiege 10 gegnerische Charaktere', target: 10, stat: 'kos', reward: { gold: 100 } },
  { id: 'dmg2000', text: 'Deal 2,000 damage', textDe: 'Verursache 2.000 Schaden', target: 2000, stat: 'damage', reward: { gold: 90 } },
  { id: 'items8', text: 'Play 8 item cards', textDe: 'Spiele 8 Itemkarten', target: 8, stat: 'items', reward: { gold: 70 } },
  { id: 'deploy12', text: 'Deploy 12 characters', textDe: 'Setze 12 Charaktere ein', target: 12, stat: 'deploys', reward: { gold: 70 } },
  { id: 'vp250', text: 'Score 250 Victory Points', textDe: 'Erziele 250 Siegpunkte', target: 250, stat: 'vp', reward: { gold: 100 } },
  { id: 'tutorial1', text: 'Finish a Testing Chamber', textDe: 'Schließe einen Prüfstand ab', target: 1, stat: 'tutorials', reward: { gold: 50 } },
];

/** Three missions per day, deterministic for the date (same for everyone). */
export function dailyMissions(dateKey: string): MissionDef[] {
  const rng = makeRng(hashString(`missions:${dateKey}`));
  const pool = MISSION_POOL.slice();
  const out: MissionDef[] = [pool.splice(0, 1)[0]!]; // "play 3 matches" every day
  while (out.length < 3) out.push(pool.splice(Math.floor(rand(rng) * pool.length), 1)[0]!);
  return out;
}

export function itemCopiesAllowed(col: Collection, itemId: string): number {
  const it = ITEMS[itemId];
  if (!it) return 0;
  const max = { common: 3, uncommon: 2, rare: 2, epic: 1, legendary: 1 }[it.rarity];
  return Math.min(max, col.items[itemId] ?? 0);
}

export function ownsCharacter(col: Collection, defId: string): boolean {
  return !!col.chars[defId] && !!CHARACTERS[defId];
}

// ---------------------------------------------------------------- developer accounts

/** Developer accounts are names ending in '#': everything unlocked, unlimited gold, no competitive play. */
export const DEV_GOLD = 999_999;

export function isDevName(name: string | null | undefined): boolean {
  return !!name && name.trim().endsWith('#');
}

/** Every character at max level, every item card, all areas, unlimited gold (tutorial progress is kept). */
export function devCollection(base?: Collection): Collection {
  const chars: Record<string, OwnedChar> = {};
  for (const c of CHARACTER_LIST) chars[c.id] = { level: 10, dups: 0, tutorialDone: base?.chars[c.id]?.tutorialDone ?? false };
  const items: Record<string, number> = {};
  for (const it of ITEM_LIST) items[it.id] = 9;
  const top = MILESTONES[MILESTONES.length - 1]!.trophies;
  return {
    gold: DEV_GOLD,
    trophies: Math.max(base?.trophies ?? 0, top),
    bestTrophies: Math.max(base?.bestTrophies ?? 0, top),
    chars,
    items,
    chests: base?.chests ?? [],
    cardBacks: [...new Set([...(base?.cardBacks ?? []), 'biohazard'])],
    titles: [...new Set([...(base?.titles ?? []), 'Developer'])],
  };
}

// ---------------------------------------------------------------- daily rewards

/** Seven-day login calendar; the last day repeats while the streak holds. */
export const DAILY_CALENDAR: { gold: number; chest?: ChestSize }[] = [
  { gold: 40 },
  { gold: 60 },
  { gold: 40, chest: 'small' },
  { gold: 80 },
  { gold: 60, chest: 'small' },
  { gold: 100 },
  { gold: 120, chest: 'medium' },
];

/** Rewards for matches finished on the same day (paid automatically when a tier is reached). */
export const PLAY_TIERS: { games: number; gold: number; chest?: ChestSize }[] = [
  { games: 1, gold: 30 },
  { games: 3, gold: 50, chest: 'small' },
  { games: 5, gold: 80 },
  { games: 10, gold: 120, chest: 'medium' },
];

export interface DailyState {
  /** last day the login reward was claimed (YYYY-MM-DD) */
  last?: string;
  streak?: number;
  /** day the free chest of the day was taken */
  freeChest?: string;
  /** matches finished on playedDay and how many play tiers were paid */
  playedDay?: string;
  played?: number;
  playPaid?: number;
}

/** Calendar day for a timestamp; pass the client's `Date#getTimezoneOffset()` for local days. */
export function dayKey(now: number, tzOffsetMin = 0): string {
  return new Date(now - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

function prevDay(key: string): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export interface DailyStatus {
  today: string;
  canClaim: boolean;
  /** streak after claiming today (or the current one when already claimed) */
  streak: number;
  /** index into DAILY_CALENDAR of today's reward */
  slot: number;
  reward: { gold: number; chest?: ChestSize };
  freeChest: boolean;
  played: number;
  nextTier: (typeof PLAY_TIERS)[number] | null;
}

export function dailyStatus(s: DailyState, now: number, tzOffsetMin = 0): DailyStatus {
  const today = dayKey(now, tzOffsetMin);
  const canClaim = s.last !== today;
  const streak = canClaim ? (s.last === prevDay(today) ? (s.streak ?? 0) + 1 : 1) : (s.streak ?? 1);
  const slot = Math.min(streak, DAILY_CALENDAR.length) - 1;
  const played = s.playedDay === today ? (s.played ?? 0) : 0;
  const paid = s.playedDay === today ? (s.playPaid ?? 0) : 0;
  return { today, canClaim, streak, slot, reward: DAILY_CALENDAR[slot]!, freeChest: s.freeChest !== today, played, nextTier: PLAY_TIERS[paid] ?? null };
}

export function claimDaily(s: DailyState, now: number, tzOffsetMin = 0): { state: DailyState; reward: { gold: number; chest?: ChestSize } | null } {
  const st = dailyStatus(s, now, tzOffsetMin);
  if (!st.canClaim) return { state: s, reward: null };
  return { state: { ...s, last: st.today, streak: st.streak }, reward: st.reward };
}

export function claimFreeChest(s: DailyState, now: number, tzOffsetMin = 0): { state: DailyState; chest: ChestSize | null } {
  const today = dayKey(now, tzOffsetMin);
  if (s.freeChest === today) return { state: s, chest: null };
  return { state: { ...s, freeChest: today }, chest: 'small' };
}

/** Counts a finished match and returns the play tiers it unlocked. */
export function recordPlayed(s: DailyState, now: number, tzOffsetMin = 0): { state: DailyState; rewards: (typeof PLAY_TIERS)[number][] } {
  const today = dayKey(now, tzOffsetMin);
  const played = (s.playedDay === today ? (s.played ?? 0) : 0) + 1;
  let paid = s.playedDay === today ? (s.playPaid ?? 0) : 0;
  const rewards: (typeof PLAY_TIERS)[number][] = [];
  while (paid < PLAY_TIERS.length && played >= PLAY_TIERS[paid]!.games) rewards.push(PLAY_TIERS[paid++]!);
  return { state: { ...s, playedDay: today, played, playPaid: paid }, rewards };
}
