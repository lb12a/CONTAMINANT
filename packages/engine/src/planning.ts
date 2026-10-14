// Planning phase: validating a player's secret plan, computing AP costs and the own action order.
// The server runs exactly this validation on every submitted plan (anti-cheat).

import { CHARACTERS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { distance, eq, neighbors, type Hex } from './hex.ts';
import { activeAbilities, attackDefFor } from './actions.ts';
import { bounds, charactersOnBoard, getUnit, inZone, isFree, tileAt } from './state.ts';
import { effectiveSpeed, hasChar, hasStatus, maxMove } from './stats.ts';
import { canMoveVoluntarily, pathCost, validatePath } from './movement.ts';
import { fieldTileAllowed, freeRequirementMet, isImmediateItem, itemCost, trapTileAllowed } from './itemfx.ts';
import type { AttackCmd, Command, GameState, ItemCmd, Plan, PlayerId, Unit } from './types.ts';

export const MAX_COMMANDS_PER_UNIT = 4;
export const MAX_MOVES_PER_UNIT = 2;
export const MAX_ACTIONS_PER_UNIT = 3;
export const MAX_ON_BOARD = 5;
export const MAX_CARDS_PER_ROUND = 3;
export const MAX_FREE_PER_ROUND = 2;

export interface PlanIssue {
  index: number;
  error: string;
}

export interface PlanCheck {
  ok: boolean;
  issues: PlanIssue[];
  /** gross AP cost of the kept commands */
  cost: number;
  /** AP refunds the plan earns during resolution (Evacuation Order, Spare Battery) */
  credit: number;
  /** part of the cost that exceeds the player's AP and is paid back by those refunds */
  borrowed: number;
  costs: number[];
  /** the plan with invalid commands removed */
  plan: Plan;
}

/** Deploy AP after the Piggybank Savings discount (−1 per 2 Coins, max −3). */
export function deployCost(s: GameState, p: PlayerId, defId: string, tile: Hex): { cost: number; pig?: Unit; coinsSpent: number } {
  const def = CHARACTERS[defId];
  if (!def) return { cost: 99, coinsSpent: 0 };
  const pig = s.units.find((u) => u.owner === p && u.defId === 'piggybank' && distance(u.pos, tile) === 1 && (u.counters.coins ?? 0) >= 2);
  if (!pig) return { cost: def.deploy, coinsSpent: 0 };
  const disc = Math.min(3, Math.floor((pig.counters.coins ?? 0) / 2), def.deploy - 0);
  return { cost: Math.max(0, def.deploy - disc), pig, coinsSpent: disc * 2 };
}

function isAbilityLike(s: GameState, u: Unit, cmd: Command): boolean {
  if (cmd.kind === 'ability') return true;
  if (cmd.kind === 'attack') {
    const a = attackDefFor(s, u, cmd.attack);
    return !!a && (a.category === 'support' || a.category === 'utility');
  }
  return false;
}

/** AP cost of a single command given the plan context (blood pact, famine, quick fuse...). */
export function commandCost(s: GameState, p: PlayerId, cmd: Command, ctx: { firstAttackSeen: Set<string>; pacts: Set<string>; plan: Plan; startPos: Map<string, Hex> }): number {
  switch (cmd.kind) {
    case 'move': {
      const u = getUnit(s, cmd.unit);
      if (!u) return 0;
      return pathCost(s, u, cmd.path);
    }
    case 'attack': {
      const u = getUnit(s, cmd.unit);
      if (!u) return 0;
      const a = attackDefFor(s, u, cmd.attack);
      if (!a) return 0;
      let c = a.ap;
      if (u.rt.famine && !ctx.firstAttackSeen.has(u.uid)) c += 1;
      if (ctx.pacts.has(u.uid) && !ctx.firstAttackSeen.has(u.uid)) c = Math.max(1, c - 1);
      ctx.firstAttackSeen.add(u.uid);
      if (cmd.hourShift) c += 1;
      if (cmd.item) {
        const card = s.players[p].hand.find((x) => x.uid === cmd.item);
        if (card) {
          c += itemCost(s, p, card.itemId);
          if (card.itemId === 'quick_fuse' && a.ap >= 2) c -= 1;
        }
      }
      return c;
    }
    case 'ability': {
      const u = getUnit(s, cmd.unit);
      if (!u) return 0;
      const ab = activeAbilities(s, u).find((x) => x.id === cmd.ability);
      let c = ab?.ap ?? 0;
      if (cmd.item) {
        const card = s.players[p].hand.find((x) => x.uid === cmd.item);
        if (card) {
          c += itemCost(s, p, card.itemId);
          if (card.itemId === 'quick_fuse' && (ab?.ap ?? 0) >= 2) c -= 1;
        }
      }
      return c;
    }
    case 'deploy': {
      const card = s.players[p].cards.find((c) => c.uid === cmd.card);
      if (!card) return 0;
      return deployCost(s, p, card.defId, cmd.tile).cost;
    }
    case 'item': {
      const card = s.players[p].hand.find((x) => x.uid === cmd.card);
      if (!card) return 0;
      return itemCost(s, p, card.itemId);
    }
    default:
      return 0;
  }
}

export function validatePlan(s: GameState, plan: Plan): PlanCheck {
  const p = plan.player;
  const pl = s.players[p];
  const issues: PlanIssue[] = [];
  const kept: Command[] = [];
  const costs: number[] = [];
  let total = 0;
  /** refunds earned by earlier commands of this plan (usable by the commands after them) */
  let credit = 0;
  const perUnit = new Map<string, { cmds: number; moves: number; moveDist: number; actions: number; uses: Record<string, number>; pos: Hex; hold: boolean; abilityUses: Record<string, number> }>();
  const usedCards = new Set<string>();
  const itemNames = new Set<string>(pl.itemNamesThisRound);
  let cards = pl.cardsPlayedThisRound;
  let free = pl.freeCardsThisRound;
  const deployTiles: Hex[] = [];
  let deploys = 0;
  const pacts = new Set<string>();
  const adrenaline = new Set<string>();
  for (const c of plan.commands) {
    if (c.kind === 'item') {
      const card = pl.hand.find((x) => x.uid === c.card);
      if (card?.itemId === 'blood_pact' && c.target.unit) pacts.add(c.target.unit);
      if (card?.itemId === 'adrenaline_shot' && c.target.unit) adrenaline.add(c.target.unit);
    }
  }
  const ctx = { firstAttackSeen: new Set<string>(), pacts, plan, startPos: new Map<string, Hex>() };
  const fail = (i: number, error: string) => issues.push({ index: i, error });

  const useCard = (i: number, cardUid: string, attachedTo?: { u: Unit; cmd: Command }): boolean => {
    const card = pl.hand.find((x) => x.uid === cardUid);
    if (!card) return !!fail(i, 'card not in hand');
    if (card.tarnished) return !!fail(i, 'card is Tarnished');
    if (usedCards.has(cardUid)) return !!fail(i, 'card already used');
    const it = ITEMS[card.itemId]!;
    if (itemNames.has(it.name)) return !!fail(i, 'the same card name can be played once per round');
    if (cards >= MAX_CARDS_PER_ROUND) return !!fail(i, 'at most 3 cards per round');
    const isFreeCard = it.cost === 0;
    if (isFreeCard && free >= MAX_FREE_PER_ROUND) return !!fail(i, 'at most 2 Free cards per round');
    if (pl.data_overtime === s.round) return !!fail(i, 'Overtime must be the only card this round');
    if (attachedTo) {
      const isAttackItem = it.type === 'attack';
      const isAbilityItem = it.type === 'ability' && it.id !== 'time_dilation_bottle';
      if (!isAttackItem && !isAbilityItem) return !!fail(i, `${it.name} cannot be attached to a command`);
      const abilityLike = isAbilityLike(s, attachedTo.u, attachedTo.cmd);
      if (isAttackItem && (attachedTo.cmd.kind !== 'attack' || abilityLike)) return !!fail(i, `${it.name} needs an Attack command`);
      if (isAbilityItem && !abilityLike) return !!fail(i, `${it.name} needs an Ability command`);
      if (isAbilityItem && hasStatus(attachedTo.u, 'silence') && it.id !== 'vocal_tonic') return !!fail(i, 'Silenced: no Ability item cards');
      if (it.id === 'quick_fuse') {
        const base = attachedTo.cmd.kind === 'attack' ? attackDefFor(s, attachedTo.u, (attachedTo.cmd as AttackCmd).attack)?.ap ?? 0 : activeAbilities(s, attachedTo.u).find((a) => a.id === (attachedTo.cmd as any).ability)?.ap ?? 0;
        if (base < 2) return !!fail(i, 'Quick Fuse: the ability must cost 2 AP or more');
      }
      if (it.id === 'echo_crystal' && attachedTo.cmd.kind === 'ability') {
        const def = CHARACTERS[attachedTo.u.defId];
        if (def?.ability.oncePerGame) return !!fail(i, 'Echo Crystal: not on once-per-game abilities');
      }
    }
    usedCards.add(cardUid);
    itemNames.add(it.name);
    cards++;
    if (isFreeCard) free++;
    return true;
  };

  plan.commands.forEach((cmd, i) => {
    let cost = 0;
    let refund = 0;
    if (cmd.kind === 'deploy') {
      const card = pl.cards.find((c) => c.uid === cmd.card);
      if (!card) return fail(i, 'unknown card');
      if (!pl.offered.some((o) => o.cardUid === cmd.card)) return fail(i, 'card is not offered');
      if (pl.koCards.includes(cmd.card)) return fail(i, "card is KO'd");
      if (!inZone(s, p, cmd.tile)) return fail(i, 'deploy only in your zone');
      if (!isFree(s, cmd.tile) || deployTiles.some((t) => eq(t, cmd.tile))) return fail(i, 'tile not free');
      if (charactersOnBoard(s, p).length + deploys + 1 > MAX_ON_BOARD) return fail(i, 'at most 5 characters on the board');
      if (kept.some((k) => k.kind === 'deploy' && k.card === cmd.card)) return fail(i, 'card already deployed');
      deployTiles.push(cmd.tile);
      deploys++;
      cost = commandCost(s, p, cmd, ctx);
    } else if (cmd.kind === 'item') {
      const card = pl.hand.find((x) => x.uid === cmd.card);
      if (!card) return fail(i, 'card not in hand');
      const it = ITEMS[card.itemId]!;
      if (isImmediateItem(it.id)) return fail(i, `${it.name} is played instantly during planning`);
      if (it.type === 'attack' || (it.type === 'ability' && it.id !== 'time_dilation_bottle')) return fail(i, `${it.name} must be attached to a command`);
      const target = getUnit(s, cmd.target.unit);
      if (['unit', 'ally', 'enemy'].includes(it.targeting) && (!target || target.owner !== p && hasStatus(target, 'hidden'))) return fail(i, 'needs a visible unit');
      if (it.targeting === 'ally' && target && target.owner !== p) return fail(i, 'needs a friendly unit');
      if (it.targeting === 'tile' && (!cmd.target.tile || !fieldTileAllowed(s, p, cmd.target.tile))) return fail(i, 'tile must be within 6 of your units or in your zone');
      if (it.targeting === 'trap-tile' && (!cmd.target.tile || !trapTileAllowed(s, p, cmd.target.tile))) return fail(i, 'trap tile must be in your zone or next to one of your units');
      if (it.cost === 0 && it.free) {
        const err = freeRequirementMet(s, p, it.id, cmd, { cards: cards - pl.cardsPlayedThisRound, others: [...usedCards] });
        if (err) return fail(i, `Free card requirement: ${err}`);
      }
      if (it.id === 'time_dilation_bottle' && (!target || target.owner !== p || !target.once.some((o) => o !== 'midas_mummy.midas_touch'))) return fail(i, 'needs a friendly unit with a used once-per-game ability');
      if (!useCard(i, cmd.card)) return;
      if ((it.id === 'mirror_charm' || it.id === 'reroll_ticket') && cmd.target.choice) usedCards.add(cmd.target.choice);
      cost = commandCost(s, p, cmd, ctx);
      if (it.id === 'evacuation_order' && target && target.owner === p && !target.isSummon && !target.isObject && target.cardUid) {
        refund = Math.ceil((CHARACTERS[target.defId]?.deploy ?? 0) / 2);
      }
    } else {
      const u = getUnit(s, cmd.unit);
      if (!u || u.owner !== p) return fail(i, 'not your unit');
      if (u.isObject) return fail(i, 'objects cannot act');
      if (u.deployedRound === s.round) return fail(i, 'cannot act in the round it is deployed');
      let st = perUnit.get(u.uid);
      if (!st) {
        st = { cmds: 0, moves: 0, moveDist: 0, actions: 0, uses: {}, pos: { ...u.pos }, hold: false, abilityUses: {} };
        perUnit.set(u.uid, st);
      }
      if (st.cmds >= MAX_COMMANDS_PER_UNIT) return fail(i, 'at most 4 commands per character');
      if (hasStatus(u, 'entranced') && !(cmd.kind === 'ability' && cmd.ability === 'mambo.wake')) return fail(i, 'Entranced');
      if (cmd.kind === 'move') {
        if (st.hold) return fail(i, 'Hold Position: no voluntary movement');
        const why = canMoveVoluntarily(s, u);
        if (why && u.defId !== 'shrink_head') return fail(i, why);
        if (st.moves >= MAX_MOVES_PER_UNIT) return fail(i, 'at most 2 Move commands');
        const mm = u.defId === 'shrink_head' ? headBudget(s, u, plan) : maxMove(s, u) + (adrenaline.has(u.uid) ? 1 : 0);
        const budget = mm - st.moveDist;
        const fake = { ...u, pos: st.pos } as Unit;
        const chk = validatePath(s, fake, cmd.path, budget);
        if (!chk.ok) return fail(i, chk.error!);
        cost = pathCost(s, fake, cmd.path);
        st.moves++;
        st.moveDist += cmd.path.length;
        st.pos = { ...cmd.path[cmd.path.length - 1]! };
      } else if (cmd.kind === 'attack') {
        const a = attackDefFor(s, u, cmd.attack);
        if (!a) return fail(i, 'unknown attack');
        if (st.actions >= MAX_ACTIONS_PER_UNIT) return fail(i, 'at most 3 Attack/Ability commands');
        const used = (st.uses[a.id] ?? 0) + (u.rt.attacksUsed[a.id] ?? 0);
        if (used >= a.maxUses) return fail(i, `${a.name}: max ${a.maxUses} per round`);
        if (a.targeting === 'character' || a.targeting === 'ally') {
          const t = getUnit(s, cmd.target.unit);
          if (!t && !cmd.target.tile) return fail(i, 'needs a target');
          if (t && t.owner !== p && hasStatus(t, 'hidden')) return fail(i, 'target not visible');
        }
        if (a.targeting === 'field' && a.custom !== 'lance' && a.custom !== 'moonlit_charge' && a.custom !== 'flaming_skull' && a.custom !== 'sporecloud' && a.custom !== 'mire_song') {
          if (!cmd.target.tile) return fail(i, 'needs a target tile');
          if (!tileAt(s, cmd.target.tile)) return fail(i, 'tile out of bounds');
          const bonus = cmd.item && ITEMS[pl.hand.find((x) => x.uid === cmd.item)?.itemId ?? '']?.id === 'amplifier_coil' ? 1 : 0;
          if (distance(st.pos, cmd.target.tile) > a.range + bonus + (u.defId === 'frankenstein' && (u.counters.charges ?? 0) >= 3 ? 1 : 0)) return fail(i, 'tile out of range');
        }
        if (a.targeting === 'multi-field' && !(cmd.target.tiles?.length || cmd.target.tile)) return fail(i, 'needs target tiles');
        if (a.targeting === 'vector' && (cmd.target.dir === undefined || !cmd.target.unit)) return fail(i, 'needs a unit and a vector');
        if (cmd.item && !useCard(i, cmd.item, { u, cmd })) return;
        cost = commandCost(s, p, cmd, ctx);
        st.uses[a.id] = (st.uses[a.id] ?? 0) + 1;
        st.actions++;
      } else if (cmd.kind === 'ability') {
        if (st.actions >= MAX_ACTIONS_PER_UNIT) return fail(i, 'at most 3 Attack/Ability commands');
        if (hasStatus(u, 'silence') && !(cmd.item && pl.hand.find((x) => x.uid === cmd.item)?.itemId === 'vocal_tonic')) return fail(i, 'Silenced');
        const ab = activeAbilities(s, u).find((x) => x.id === cmd.ability);
        if (!ab) return fail(i, 'ability not available');
        const def = CHARACTERS[u.defId];
        const maxPer = def?.ability.id === cmd.ability ? def.ability.maxPerRound ?? 1 : 1;
        if ((st.abilityUses[cmd.ability] ?? 0) >= maxPer) return fail(i, 'ability already planned this round');
        if (cmd.item && !useCard(i, cmd.item, { u, cmd })) return;
        cost = commandCost(s, p, cmd, ctx);
        if (cmd.item && pl.hand.find((x) => x.uid === cmd.item)?.itemId === 'spare_battery') refund = 1;
        st.abilityUses[cmd.ability] = (st.abilityUses[cmd.ability] ?? 0) + 1;
        st.actions++;
      } else if (cmd.kind === 'hold') {
        if (st.moves > 0) return fail(i, 'Hold Position cannot follow a move');
        st.hold = true;
      }
      st.cmds++;
    }
    if (total + cost > pl.ap + credit) return fail(i, `not enough AP (${pl.ap + credit - total} left, needs ${cost})`);
    total += cost;
    credit += refund;
    costs.push(cost);
    kept.push(cmd);
  });
  // only the part of the credit that was actually spent is borrowed
  const borrowed = Math.max(0, total - pl.ap);
  const rest = (plan.rest ?? []).filter((uid) => getUnit(s, uid)?.owner === p);
  const speedShift: Record<string, number> = {};
  for (const [uid, v] of Object.entries(plan.speedShift ?? {})) {
    const u = getUnit(s, uid);
    if (u?.owner === p && u.defId === 'ghost_train') speedShift[uid] = Math.max(-15, Math.min(15, Math.round(v)));
  }
  const mindsEye: Record<string, { after: string; action: number }> = {};
  for (const [uid, v] of Object.entries(plan.mindsEye ?? {})) {
    const u = getUnit(s, uid);
    const friend = getUnit(s, v.after);
    if (u?.owner === p && u.defId === 'ghost_train' && friend && friend.owner === p && friend.uid !== uid) mindsEye[uid] = { after: friend.uid, action: Math.max(0, Math.min(4, Math.round(v.action ?? 1))) };
  }
  return { ok: issues.length === 0, issues, cost: total, credit, borrowed, costs, plan: { player: p, commands: kept, rest, speedShift, mindsEye, watch: plan.watch } };
}

/** Shrink Heads share 5 free tiles of movement per round. */
function headBudget(s: GameState, head: Unit, plan: Plan): number {
  const master = getUnit(s, head.master);
  if (!master) return 0;
  let used = 0;
  for (const c of plan.commands) {
    if (c.kind !== 'move' || c.unit === head.uid) continue;
    const u = getUnit(s, c.unit);
    if (u?.defId === 'shrink_head' && u.master === master.uid) used += c.path.length;
  }
  return Math.max(0, 5 - used);
}

export function emptyPlan(p: PlayerId): Plan {
  return { player: p, commands: [], rest: [] };
}

export interface OrderEntry {
  unit?: string;
  label: string;
  priority: number;
  speed: number;
  commandIndex: number;
}

/** Priority of a command (section 1 priority table). */
export function commandPriority(s: GameState, p: PlayerId, cmd: Command): number {
  switch (cmd.kind) {
    case 'deploy':
      return 4;
    case 'item':
      return 3;
    case 'attack': {
      const u = getUnit(s, cmd.unit);
      const a = u ? attackDefFor(s, u, cmd.attack) : undefined;
      let pr = a?.priority ?? 0;
      if (cmd.item && s.players[p].hand.find((x) => x.uid === cmd.item)?.itemId === 'quick_fuse') pr += 1;
      return pr;
    }
    case 'ability': {
      const u = getUnit(s, cmd.unit);
      const ab = u ? activeAbilities(s, u).find((x) => x.id === cmd.ability) : undefined;
      let pr = ab?.priority ?? 0;
      if (cmd.item && s.players[p].hand.find((x) => x.uid === cmd.item)?.itemId === 'quick_fuse') pr += 1;
      return pr;
    }
    default:
      return 0;
  }
}

/** The resulting action order of your own team (always visible to the planning player). */
export function previewOrder(s: GameState, plan: Plan): OrderEntry[] {
  const out: OrderEntry[] = [];
  const restSet = new Set(plan.rest);
  plan.commands.forEach((cmd, i) => {
    const unitUid = 'unit' in cmd ? cmd.unit : undefined;
    const u = getUnit(s, unitUid);
    let speed = 0;
    if (u) {
      const saved = u.rt.rest;
      const savedShift = u.speedShift;
      u.rt.rest = restSet.has(u.uid);
      u.speedShift = plan.speedShift?.[u.uid] ?? u.speedShift;
      speed = effectiveSpeed(s, u);
      u.rt.rest = saved;
      u.speedShift = savedShift;
    }
    out.push({ unit: unitUid, label: describe(s, cmd), priority: commandPriority(s, plan.player, cmd), speed, commandIndex: i });
  });
  // stable: per-unit order kept, others by priority then speed
  return out.sort((a, b) => b.priority - a.priority || b.speed - a.speed || a.commandIndex - b.commandIndex);
}

export function describe(s: GameState, cmd: Command): string {
  switch (cmd.kind) {
    case 'move':
      return `${getUnit(s, cmd.unit)?.name ?? '?'} moves ${cmd.path.length}`;
    case 'attack': {
      const u = getUnit(s, cmd.unit);
      return `${u?.name ?? '?'}: ${u ? attackDefFor(s, u, cmd.attack)?.name : cmd.attack}`;
    }
    case 'ability': {
      const u = getUnit(s, cmd.unit);
      return `${u?.name ?? '?'}: ${u ? activeAbilities(s, u).find((a) => a.id === cmd.ability)?.name ?? cmd.ability : cmd.ability}`;
    }
    case 'wait':
      return `${getUnit(s, cmd.unit)?.name ?? '?'} waits`;
    case 'hold':
      return `${getUnit(s, cmd.unit)?.name ?? '?'} holds position`;
    case 'deploy': {
      const card = s.players[0].cards.concat(s.players[1].cards).find((c) => c.uid === cmd.card);
      return `Deploy ${CHARACTERS[card?.defId ?? '']?.name ?? '?'}`;
    }
    case 'item': {
      const card = s.players[0].hand.concat(s.players[1].hand).find((c) => c.uid === cmd.card);
      return `Play ${ITEMS[card?.itemId ?? '']?.name ?? 'card'}`;
    }
  }
}

/** Free tiles in a player's zone for deployment. */
export function deployTiles(s: GameState, p: PlayerId): Hex[] {
  return s.tiles.filter((t) => inZone(s, p, t) && isFree(s, t)).map((t) => ({ c: t.c, r: t.r }));
}

export function isItemCmd(c: Command): c is ItemCmd {
  return c.kind === 'item';
}

export { hasChar, neighbors, bounds };
