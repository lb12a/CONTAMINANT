// Section 8/9: playing item cards (Character, Field, Gear, Trap, Intel) at Priority +3,
// plus the planning-time Intel cards that change this round's AP or offer.

import { CHARACTERS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { ANTIDOTE_REMOVES, NEGATIVE_STATUSES, SALTS_REMOVES } from './data/statuses.ts';
import { burst, distance, eq, neighbors, ring, straight, type Hex } from './hex.ts';
import { pick, shuffle } from './rng.ts';
import { addEvent, bounds, charactersOnBoard, drawItem, getUnit, inZone, other, tileAt } from './state.ts';
import { gearStrength, hasChar, hasStatus } from './stats.ts';
import { applyStatus, cleanse, removeStatus } from './status.ts';
import { addField, connectedWater, removeField } from './fields.ts';
import { dealDamage, healUnit } from './combat.ts';
import { affinity, MAX_TRAPS, trapAt } from './traps.ts';
import type { CharCategory, GameState, ItemCard, ItemCmd, ItemType, PlayerId, Unit } from './types.ts';

export function fieldTileAllowed(s: GameState, p: PlayerId, h: Hex): boolean {
  if (!tileAt(s, h)) return false;
  if (inZone(s, p, h)) return true;
  return s.units.some((u) => u.owner === p && !u.isObject && distance(u.pos, h) <= 6);
}

export function trapTileAllowed(s: GameState, p: PlayerId, h: Hex): boolean {
  const t = tileAt(s, h);
  if (!t || t.wall) return false;
  if (trapAt(s, h)) return false;
  if (inZone(s, p, h)) return true;
  return s.units.some((u) => u.owner === p && !u.isObject && distance(u.pos, h) <= 1);
}

// ---------------------------------------------------------------- gear

const SWAP_GEAR: Record<string, [CharCategory, string]> = {
  prism_visor: ['material', 'crystal'],
  ghost_shroud: ['movement', 'phasing'],
  wolf_pelt: ['mind', 'feral'],
};

export function unequip(s: GameState, u: Unit): void {
  if (!u.gear) return;
  const g = u.gear;
  if (SWAP_GEAR[g]) {
    const [cat] = SWAP_GEAR[g]!;
    u.chars[cat] = u.baseChars[cat];
  }
  if (g === 'bone_charm') {
    const bonus = u.data.boneCharmBonus ?? 50;
    u.maxHp = Math.max(1, u.maxHp - bonus);
    u.baseMaxHp = Math.max(1, u.baseMaxHp - bonus);
    u.hp = Math.min(u.hp, u.maxHp);
  }
  addEvent(s, { kind: 'item', text: `${u.name} drops ${ITEMS[g]?.name}`, target: u.uid });
  u.gear = null;
}

export function equip(s: GameState, u: Unit, itemId: string): void {
  unequip(s, u);
  u.gear = itemId;
  const aff = affinity(u, itemId);
  if (SWAP_GEAR[itemId]) {
    const [cat, val] = SWAP_GEAR[itemId]!;
    u.chars[cat] = val;
  }
  if (itemId === 'bone_charm') {
    const bonus = Math.round(50 * aff * gearStrength(u));
    u.data.boneCharmBonus = bonus;
    u.maxHp += bonus;
    u.baseMaxHp += bonus;
    u.hp += bonus;
  }
  if (itemId === 'aegis_plate') u.data.aegisAffinity = aff;
  addEvent(s, { kind: 'item', text: `${u.name} equips ${ITEMS[itemId]?.name}`, target: u.uid });
}

// ---------------------------------------------------------------- resolution of item cards

export function resolveItem(s: GameState, p: PlayerId, card: ItemCard, cmd: ItemCmd): boolean {
  const it = ITEMS[card.itemId];
  if (!it) return false;
  const pl = s.players[p];
  const target = getUnit(s, cmd.target.unit);
  const tile = cmd.target.tile;
  const fz = (why: string) => {
    addEvent(s, { kind: 'fizzle', text: `${it.name} fizzles: ${why}`, owner: p });
    return false;
  };
  const aff = target ? affinity(target, it.id) : 1;
  const unitNeeded = () => {
    if (!target || !s.units.includes(target)) return 'target is gone';
    return null;
  };
  addEvent(s, { kind: 'item', text: `${pl.name} plays ${it.name}`, owner: p, target: target?.uid, to: tile ?? target?.pos });
  s.stats.itemsPlayed[it.id] = (s.stats.itemsPlayed[it.id] ?? 0) + 1;
  switch (it.id) {
    // ---------------- Character
    case 'field_medkit': {
      const e = unitNeeded();
      if (e) return fz(e);
      healUnit(s, target!, target!.maxHp * 0.25 * aff, 'item', it.name);
      return true;
    }
    case 'antidote': {
      const e = unitNeeded();
      if (e) return fz(e);
      cleanse(s, target!, ANTIDOTE_REMOVES);
      applyStatus(s, target!, 'cleanse_immune', { duration: 1, silent: true });
      return true;
    }
    case 'adrenaline_shot': {
      const e = unitNeeded();
      if (e) return fz(e);
      applyStatus(s, target!, 'haste', { duration: 2 });
      target!.rt.maxMoveBonus += 1;
      dealDamage(s, target!, Math.round(target!.maxHp * 0.05), { attacker: null, tag: null, isRecoil: true, label: 'Adrenaline' });
      return true;
    }
    case 'iron_tonic': {
      const e = unitNeeded();
      if (e) return fz(e);
      applyStatus(s, target!, 'fortified', { duration: 2 });
      giveShield(target!, Math.round(40 * aff), s.round + 1);
      addEvent(s, { kind: 'item', text: `${target!.name} gains a Shield of ${Math.round(40 * aff)}`, target: target!.uid });
      return true;
    }
    case 'rage_pill': {
      const e = unitNeeded();
      if (e) return fz(e);
      applyStatus(s, target!, 'empowered', { duration: 2 });
      target!.data.accPenaltyUntil = s.round + 1;
      return true;
    }
    case 'smelling_salts': {
      const e = unitNeeded();
      if (e) return fz(e);
      cleanse(s, target!, SALTS_REMOVES);
      return true;
    }
    case 'blood_pact': {
      const e = unitNeeded();
      if (e) return fz(e);
      dealDamage(s, target!, Math.max(1, Math.round(target!.hp * 0.15)), { attacker: null, tag: null, isRecoil: true, label: 'Blood Pact' });
      if (s.units.includes(target!)) applyStatus(s, target!, 'blood_pact', { duration: 2, value: aff });
      return true;
    }
    case 'mirror_charm': {
      const e = unitNeeded();
      if (e) return fz(e);
      applyStatus(s, target!, 'mirror_charm', { duration: 2 });
      target!.data.mirrorAffinity = aff > 1;
      return true;
    }
    case 'second_wind': {
      const e = unitNeeded();
      if (e) return fz(e);
      healUnit(s, target!, target!.maxHp * 0.35 * aff, 'item', it.name);
      applyStatus(s, target!, 'regeneration', { duration: 3 });
      cleanse(s, target!, NEGATIVE_STATUSES.filter((x) => x !== 'corruption'));
      return true;
    }
    case 'phoenix_feather': {
      const e = unitNeeded();
      if (e) return fz(e);
      if (target!.tier === 'boss') return fz('not on Bosses');
      applyStatus(s, target!, 'phoenix', { duration: 3 });
      return true;
    }
    case 'midas_touch_card': {
      const e = unitNeeded();
      if (e) return fz(e);
      if (target!.owner !== p) return fz('needs a friendly unit');
      applyStatus(s, target!, 'gilded', { duration: -1 });
      return true;
    }
    // ---------------- Field
    case 'contamination_burst':
    case 'rain_barrel':
    case 'smoke_candle':
    case 'molotov':
    case 'emergency_sterilization':
    case 'tesla_coil':
    case 'seed_bomb':
    case 'tuning_fork':
    case 'blackout_lantern':
    case 'moon_charm': {
      if (!tile || !fieldTileAllowed(s, p, tile)) return fz('tile not allowed');
      playFieldCard(s, p, it.id, tile, cmd);
      return true;
    }
    // ---------------- Gear
    case 'bone_charm':
    case 'lead_boots':
    case 'running_shoes':
    case 'insulated_gloves':
    case 'lucky_coin':
    case 'night_goggles':
    case 'prism_visor':
    case 'ghost_shroud':
    case 'wolf_pelt':
    case 'aegis_plate': {
      const e = unitNeeded();
      if (e) return fz(e);
      if (target!.isObject) return fz('objects cannot wear Gear');
      equip(s, target!, it.id);
      return true;
    }
    // ---------------- Trap
    case 'spike_pit':
    case 'bear_snare':
    case 'alarm_bell':
    case 'frost_mine':
    case 'shock_plate':
    case 'gas_leak':
    case 'acid_mine':
    case 'rad_capsule':
    case 'gag_order':
    case 'switchback_rune': {
      if (!tile || !trapTileAllowed(s, p, tile)) return fz('trap tile not allowed');
      if (s.traps.filter((t) => t.owner === p).length >= MAX_TRAPS) return fz('max 3 traps');
      s.traps.push({ uid: `t${++s.uidCounter}`, itemId: it.id, owner: p, pos: { ...tile }, placedRound: s.round, revealedTo: [], swapWith: cmd.target.unit });
      addEvent(s, { kind: 'trap', text: `${it.name} is hidden`, owner: p, tiles: [tile], privateTo: p });
      return true;
    }
    // ---------------- Intel (resolution)
    case 'scout_card': {
      const enemy = s.players[other(p)];
      const unknown = enemy.hand.filter((c) => !enemy.revealedToEnemy.includes(c.uid));
      if (!unknown.length) return fz('no unknown card');
      const c = pick(s.rng, unknown);
      enemy.revealedToEnemy.push(c.uid);
      addEvent(s, { kind: 'item', text: `Scout Card reveals: ${ITEMS[c.itemId]?.name}`, owner: p, privateTo: p });
      addEvent(s, { kind: 'item', text: 'The enemy scouted one of your cards', owner: p, privateTo: other(p) });
      return true;
    }
    case 'spy_drone':
      pl.spyDroneUntil = s.round + 1;
      for (const t of s.traps) if (t.owner !== p && s.units.some((u) => u.owner === p && distance(u.pos, t.pos) <= 4)) t.revealedTo.push(p);
      return true;
    case 'evacuation_order': {
      const e = unitNeeded();
      if (e) return fz(e);
      if (target!.owner !== p || target!.isSummon || target!.isObject || !target!.cardUid) return fz('needs one of your characters');
      const def = CHARACTERS[target!.defId]!;
      s.units.splice(s.units.indexOf(target!), 1);
      unequip(s, target!);
      const cardUids: string[] = target!.data.cardUids ?? [target!.cardUid];
      for (const cu of cardUids) if (!pl.undeployed.includes(cu)) pl.undeployed.push(cu);
      const unlocked = pl.offered.filter((o) => !o.locked);
      if (unlocked.length) {
        const slot = pick(s.rng, unlocked);
        slot.cardUid = target!.cardUid!;
      } else pl.offered.push({ cardUid: target!.cardUid!, locked: false });
      const back = Math.ceil(def.deploy / 2);
      pl.queuedAp += back;
      pl.queuedApNotes.push('Evacuation');
      addEvent(s, { kind: 'item', text: `${target!.name} is evacuated (+${back} AP)`, target: target!.uid, owner: p });
      return true;
    }
    case 'false_alarm':
      pl.falseAlarmRound = s.round;
      return true;
    case 'customs_inspector': {
      const type = (cmd.target.choice ?? 'field') as ItemType;
      const enemy = s.players[other(p)];
      enemy.customsTaxType = type;
      enemy.customsTaxRound = s.round + 1;
      addEvent(s, { kind: 'item', text: `Customs Inspector: enemy ${type} cards cost +1 AP next round`, owner: p });
      return true;
    }
    case 'backwards_clock':
      s.backwardsClockRound = s.round + 1;
      addEvent(s, { kind: 'item', text: 'Next round the Speed order is reversed', owner: p });
      return true;
    // planning-time intel cards already applied
    case 'reroll_ticket':
    case 'ration_pack':
    case 'overtime':
    case 'black_market':
      return true;
    default:
      return fz('not playable this way');
  }
}

export function giveShield(u: Unit, amount: number, untilRound: number): void {
  // the highest shield counts, shields do not add up
  if (!u.shield || u.shield.amount < amount) u.shield = { amount, untilRound };
  else u.shield.untilRound = Math.max(u.shield.untilRound, untilRound);
}

function playFieldCard(s: GameState, p: PlayerId, id: string, tile: Hex, cmd: ItemCmd): void {
  const b = bounds(s);
  const owner = p;
  switch (id) {
    case 'contamination_burst':
      addField(s, tile, 'toxic', { duration: 3, owner });
      for (const h of ring(tile, 1, b)) addField(s, h, 'contamination', { duration: 2, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Contamination spreads', tiles: ring(tile, 1, b), field: 'contamination' });
      break;
    case 'rain_barrel': {
      const tiles = (cmd.target.tiles?.length ? cmd.target.tiles : [tile]).slice(0, 3);
      let cur = tiles[tiles.length - 1]!;
      while (tiles.length < 3) {
        const n = shuffle(s.rng, neighbors(cur, b).filter((x) => !tileAt(s, x)?.wall && !tiles.some((t) => eq(t, x))))[0];
        if (!n) break;
        tiles.push(n);
        cur = n;
      }
      for (const h of tiles) {
        removeField(s, h, ['fire', 'wildfire']);
        addField(s, h, 'water', { duration: 3, owner, noCombo: true, silent: true });
      }
      addEvent(s, { kind: 'field', text: 'Rain Barrel floods 3 tiles', tiles, field: 'water' });
      break;
    }
    case 'smoke_candle':
      for (const h of burst(tile, 1, b)) addField(s, h, 'fog', { duration: 2, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Smoke billows', tiles: burst(tile, 1, b), field: 'fog' });
      break;
    case 'molotov':
      addField(s, tile, 'fire', { duration: 2, owner });
      for (const h of ring(tile, 1, b)) for (const u of s.units.filter((x) => eq(x.pos, h))) applyStatus(s, u, 'burn', { chance: 0.5 });
      break;
    case 'emergency_sterilization': {
      const tiles = burst(tile, 2, b);
      for (const h of tiles) {
        removeField(s, h, ['toxic', 'contamination', 'contaminated_water']);
        for (const u of s.units.filter((x) => eq(x.pos, h))) cleanse(s, u, ANTIDOTE_REMOVES);
      }
      addField(s, tile, 'sterile', { duration: 2, owner });
      addEvent(s, { kind: 'field', text: 'Emergency Sterilization', tiles, field: 'sterile' });
      break;
    }
    case 'tesla_coil': {
      const dir = cmd.target.dir ?? 0;
      const tiles = [tile, ...straight(tile, dir, 2, b)];
      for (const h of tiles) addField(s, h, 'electric', { duration: 3, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Tesla Coil electrifies a line', tiles, field: 'electric' });
      break;
    }
    case 'seed_bomb':
      for (const h of burst(tile, 1, b)) addField(s, h, 'overgrowth', { duration: null, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Overgrowth erupts', tiles: burst(tile, 1, b), field: 'overgrowth' });
      break;
    case 'tuning_fork':
      for (const h of burst(tile, 1, b)) addField(s, h, 'resonance', { duration: 2, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'The air resonates', tiles: burst(tile, 1, b), field: 'resonance' });
      break;
    case 'blackout_lantern':
      for (const h of burst(tile, 2, b)) addField(s, h, 'darkness', { duration: 3, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Darkness falls', tiles: burst(tile, 2, b), field: 'darkness' });
      break;
    case 'moon_charm':
      for (const h of burst(tile, 2, b)) addField(s, h, 'moonlit', { duration: 3, owner, silent: true });
      addEvent(s, { kind: 'field', text: 'Moonlight floods the lab', tiles: burst(tile, 2, b), field: 'moonlit' });
      break;
  }
  void connectedWater;
}

// ---------------------------------------------------------------- planning-time intel cards

export interface ImmediateResult {
  ok: boolean;
  error?: string;
}

/** Re-Roll Ticket, Ration Pack, Overtime, Black Market apply immediately during planning. */
export function isImmediateItem(itemId: string): boolean {
  return ['reroll_ticket', 'ration_pack', 'overtime', 'black_market'].includes(itemId);
}

export function itemCost(s: GameState, p: PlayerId, itemId: string): number {
  const it = ITEMS[itemId];
  if (!it) return 0;
  const pl = s.players[p];
  let c = it.cost;
  if (pl.customsTaxType === it.type && pl.customsTaxRound === s.round) c += 1;
  return c;
}

export function freeRequirementMet(s: GameState, p: PlayerId, itemId: string, cmd: ItemCmd, planned: { cards: number; others: string[] }): string | null {
  const pl = s.players[p];
  const target = getUnit(s, cmd.target.unit);
  switch (itemId) {
    case 'antidote':
      if (!target || !target.statuses.some((x) => ANTIDOTE_REMOVES.includes(x.id))) return 'target needs Poison, Infection, Egg or Leeched';
      return null;
    case 'mirror_charm':
    case 'reroll_ticket': {
      const d = cmd.target.choice;
      if (!d || !pl.hand.some((c) => c.uid === d) || d === (cmd as ItemCmd).card || planned.others.includes(d)) return 'discard another card';
      return null;
    }
    case 'alarm_bell':
      if (charactersOnBoard(s, p).length >= charactersOnBoard(s, other(p)).length) return 'you need fewer characters on the board than the enemy';
      return null;
    case 'ration_pack':
      if (!(pl.lastRoundApTotal > 0 && pl.lastRoundApSpent < pl.lastRoundApTotal * 0.5)) return "you must have spent less than 50% of last round's AP";
      return null;
    case 'overtime':
      if (planned.cards > 0) return 'it must be the only card you play this round';
      return null;
    default:
      return null;
  }
}

export function applyImmediateItem(s: GameState, p: PlayerId, card: ItemCard, cmd: ItemCmd): ImmediateResult {
  const pl = s.players[p];
  const it = ITEMS[card.itemId]!;
  switch (it.id) {
    case 'reroll_ticket': {
      discardFromHand(s, p, cmd.target.choice!);
      rerollOffer(s, p, true);
      break;
    }
    case 'ration_pack':
      pl.ap += 2;
      pl.apThisRound += 2;
      break;
    case 'overtime':
      pl.ap += 4;
      pl.apThisRound += 4;
      pl.apPenaltyNext += 3;
      pl.data_overtime = s.round;
      break;
    case 'black_market': {
      const top = pl.itemDeck.splice(0, 3);
      if (!top.length) break;
      const rarityRank = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 } as const;
      const wanted = cmd.target.choice ? top.find((c) => c.uid === cmd.target.choice) : undefined;
      const best = wanted ?? top.slice().sort((a, b) => rarityRank[ITEMS[b.itemId]!.rarity] - rarityRank[ITEMS[a.itemId]!.rarity])[0]!;
      pl.hand.push(best);
      for (const c of top) if (c !== best) pl.itemDeck.push(c);
      break;
    }
    default:
      return { ok: false, error: 'not an immediate card' };
  }
  addEvent(s, { kind: 'item', text: `${pl.name} plays ${it.name}`, owner: p, privateTo: p });
  return { ok: true };
}

export function discardFromHand(s: GameState, p: PlayerId, cardUid: string): ItemCard | undefined {
  const pl = s.players[p];
  const i = pl.hand.findIndex((c) => c.uid === cardUid);
  if (i < 0) return undefined;
  const [c] = pl.hand.splice(i, 1);
  pl.discard.push(c!);
  pl.revealedToEnemy = pl.revealedToEnemy.filter((u) => u !== cardUid);
  return c;
}

// ---------------------------------------------------------------- offered characters

/** Free re-roll at round start / Re-Roll Ticket / paid re-roll. Locked cards are never re-rolled. */
export function rerollOffer(s: GameState, p: PlayerId, all: boolean, only?: string): void {
  const pl = s.players[p];
  const deployedOrKo = new Set([...pl.koCards, ...s.units.filter((u) => u.owner === p && u.cardUid).flatMap((u) => u.data.cardUids ?? [u.cardUid!])]);
  const pool = pl.undeployed.filter((c) => !deployedOrKo.has(c));
  const keep = pl.offered.filter((o) => o.locked || (!all && only !== undefined && o.cardUid !== only));
  const keepSet = new Set(keep.map((k) => k.cardUid));
  const candidates = shuffle(s.rngP[p], pool.filter((c) => !keepSet.has(c)));
  const out = [...keep];
  while (out.length < 4 && candidates.length) out.push({ cardUid: candidates.shift()!, locked: false });
  pl.offered = out.filter((o) => pool.includes(o.cardUid));
}

export function lockOffer(s: GameState, p: PlayerId, cardUid: string, locked: boolean): boolean {
  const slot = s.players[p].offered.find((o) => o.cardUid === cardUid);
  if (!slot) return false;
  slot.locked = locked;
  return true;
}

/** Paid re-roll: 1 AP for one card, 3 AP for all unlocked cards. */
export function paidReroll(s: GameState, p: PlayerId, cardUid: string | 'all'): ImmediateResult {
  const pl = s.players[p];
  const cost = cardUid === 'all' ? 3 : 1;
  if (pl.ap < cost) return { ok: false, error: 'not enough AP' };
  if (cardUid !== 'all') {
    const slot = pl.offered.find((o) => o.cardUid === cardUid);
    if (!slot || slot.locked) return { ok: false, error: 'card not re-rollable' };
  }
  pl.ap -= cost;
  pl.apSpentThisRound += cost;
  rerollOffer(s, p, cardUid === 'all', cardUid === 'all' ? undefined : cardUid);
  return { ok: true };
}

export function drawCards(s: GameState, p: PlayerId, n: number): void {
  for (let i = 0; i < n; i++) drawItem(s, p);
}

export { hasChar, hasStatus, removeStatus };

declare module './types.ts' {
  interface PlayerState {
    data_overtime?: number;
  }
}
