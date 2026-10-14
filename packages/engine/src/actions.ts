// Execution of Attack and Ability commands, including every character's custom attack logic
// (section 7) and attached Attack/Ability item cards (section 9, AT and AB).

import { CHARACTERS, PAIN_LINK, SUMMONS, attacksFor } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { NEGATIVE_STATUSES } from './data/statuses.ts';
import {
  burst,
  clockTile,
  cone,
  coneWedgeToward,
  directionTo,
  distance,
  eq,
  line,
  neighbors,
  ray,
  ring,
  step,
  type Hex,
} from './hex.ts';
import {
  addEvent,
  applyWerewolfForm,
  applyZombieForm,
  blockerAt,
  bounds,
  createSummon,
  getUnit,
  isFree,
  tileAt,
  unitAt,
  unitsAt,
} from './state.ts';
import { canSee, effectiveSpeed, getStatus, hasChar, hasLos, hasStatus, hpPct, onMoonlit } from './stats.ts';
import { applyStatus, removeStatus } from './status.ts';
import { addField, detonateGas, detonateGasOnPath, getField } from './fields.ts';
import {
  areaDamage,
  awardVp,
  dealDamage,
  destroyWall,
  healUnit,
  koUnit,
  resolveHit,
  revealHidden,
  rollPct,
  swapUnits,
  teleportUnit,
  forcedMove,
  type HitResult,
} from './combat.ts';
import { executeMove } from './movement.ts';
import { affinity } from './traps.ts';
import type { AbilityCmd, AttackCmd, AttackDef, DamageTag, GameState, ItemDef, StatusApply, Unit } from './types.ts';

export const COMMON_ABILITIES = {
  hack: { id: 'common.hack', name: 'Hack Terminal', ap: 1, text: 'Adjacent unit pays 1 AP to hack a Research Terminal: +5 VP (once every 2nd round per terminal).' },
  portal: { id: 'common.portal', name: 'Use Portal', ap: 1, text: 'A friendly unit on a Portal pays 1 AP to appear on a free tile next to Crystal Eye.' },
  wake: { id: 'mambo.wake', name: 'Wake Mambo', ap: 1, text: 'Pay 1 AP to end the Voodoo trance (the copy dissolves without backlash).' },
  push_pot: { id: 'leech_cook.push_pot', name: 'Push Pot', ap: 1, text: 'Push the Cooking Pot 1 tile (max once per round).' },
  head_move: { id: 'shrink_head.move', name: 'Head Move', ap: 0, text: 'Shrink Heads move for free (5 tiles per round shared).' },
} as const;

/** Resolution-level hooks provided by the scheduler (Skybolt teammate trigger, Replay). */
export interface SchedulerHooks {
  executeNextAttackNow?: (unitUid: string) => void;
}

export interface ActCtx {
  s: GameState;
  actor: Unit;
  attack: AttackDef;
  cmd: AttackCmd;
  item?: ItemDef;
  aff: number;
  mods: [string, number][];
  mult: number;
  powerMult: number;
  critBonus: number;
  accBonus: number;
  rangeBonus: number;
  areaBonus: number;
  silencer: boolean;
  hexScroll: boolean;
  extraStatuses: StatusApply[];
  tag: DamageTag;
  defIgnore: number;
  knockback: number;
  lifesteal: number;
  noMiss: boolean;
  ledger: boolean;
  piercing: boolean;
  chain: boolean;
  scope: boolean;
  ignoreLos: boolean;
  hooks: SchedulerHooks;
  /** total damage dealt by this action (Encore, Replay) */
  dealt: number;
  firstTarget?: Unit;
  replay?: boolean;
}

// ---------------------------------------------------------------- lookups

export function attackDefFor(s: GameState, u: Unit, attackId: string): AttackDef | undefined {
  if (u.data.voodoo) {
    const orig = attacksFor(u.defId, u.form)[0];
    if (orig && orig.id === attackId) return orig;
    if (attackId === PAIN_LINK.id) return PAIN_LINK;
    return undefined;
  }
  const list = CHARACTERS[u.defId] ? attacksFor(u.defId, u.form) : SUMMONS[u.defId]?.attacks ?? [];
  return list.find((a) => a.id === attackId);
}

export function attacksOf(s: GameState, u: Unit): AttackDef[] {
  if (u.data.voodoo) {
    const first = attacksFor(u.defId, u.form)[0];
    return first ? [first, PAIN_LINK] : [PAIN_LINK];
  }
  if (CHARACTERS[u.defId]) return attacksFor(u.defId, u.form);
  return SUMMONS[u.defId]?.attacks ?? [];
}

export interface AbilityInfo {
  id: string;
  name: string;
  ap: number;
  priority: number;
  range: number;
  text: string;
  targeting: string;
}

/** Active ability commands available to a unit right now. */
export function activeAbilities(s: GameState, u: Unit): AbilityInfo[] {
  const out: AbilityInfo[] = [];
  const def = CHARACTERS[u.defId];
  if (def && !def.ability.passive && !u.data.voodoo) {
    let ap = def.ability.ap ?? 0;
    if (def.id === 'werewolf' && (onMoonlit(s, u.pos) || hasChar(u, 'mythic') && onMoonlit(s, u.pos))) ap = 0;
    const once = def.ability.oncePerGame && u.once.includes(def.ability.id);
    const available =
      !once &&
      !(def.id === 'werewolf' && (u.form === 'wolf' || (u.data.wolfCooldownUntil ?? 0) >= s.round)) &&
      !(def.id === 'zombie_limb' && u.form === 'brute');
    if (available)
      out.push({ id: def.ability.id, name: def.ability.name, ap, priority: def.ability.priority ?? 0, range: def.ability.range ?? 0, text: def.ability.text, targeting: def.ability.targeting ?? 'none' });
  }
  if (u.defId === 'mambo' && hasStatus(u, 'entranced')) out.push({ ...COMMON_ABILITIES.wake, priority: 0, range: 0, targeting: 'self' });
  if (u.defId === 'leech_cook' && u.data.pot && getUnit(s, u.data.pot))
    out.push({ ...COMMON_ABILITIES.push_pot, priority: 0, range: 1, targeting: 'field' });
  if (!u.isObject && !u.isSummon) {
    const adjTerminal = neighbors(u.pos, bounds(s)).some((h) => tileAt(s, h)?.objective === 'terminal') || tileAt(s, u.pos)?.objective === 'terminal';
    if (adjTerminal) out.push({ ...COMMON_ABILITIES.hack, priority: 0, range: 1, targeting: 'field' });
    const portal = getField(s, u.pos, 'portal');
    if (portal && portal.owner === u.owner) out.push({ ...COMMON_ABILITIES.portal, priority: 0, range: 0, targeting: 'self' });
  }
  return out;
}

// ---------------------------------------------------------------- context

export function buildCtx(s: GameState, actor: Unit, attack: AttackDef, cmd: AttackCmd, hooks: SchedulerHooks): ActCtx {
  const item = cmd.item ? ITEMS[findItemId(s, actor.owner, cmd.item) ?? ''] : undefined;
  const ctx: ActCtx = {
    s,
    actor,
    attack,
    cmd,
    item,
    aff: item ? affinity(actor, item.id) : 1,
    mods: [],
    mult: 1,
    powerMult: 1,
    critBonus: 0,
    accBonus: 0,
    rangeBonus: 0,
    areaBonus: 0,
    silencer: false,
    hexScroll: false,
    extraStatuses: [],
    tag: attack.tag ?? 'blunt',
    defIgnore: 0,
    knockback: attack.knockback ?? 0,
    lifesteal: 0,
    noMiss: false,
    ledger: false,
    piercing: false,
    chain: false,
    scope: false,
    ignoreLos: !!attack.ignoresLos,
    hooks,
    dealt: 0,
  };
  // action-level buffs
  if (hasStatus(actor, 'overclock') && attack.category !== 'support' && attack.category !== 'utility' && attack.power) {
    ctx.mult *= 1.5;
    removeStatus(s, actor, 'overclock', true);
    addEvent(s, { kind: 'ability', text: `Overclock: ×1.5 damage`, actor: actor.uid });
  }
  const pact = getStatus(actor, 'blood_pact');
  if (pact && attack.power) {
    ctx.mods.push(['Blood Pact', 0.2 * (pact.value ?? 1)]);
    removeStatus(s, actor, 'blood_pact', true);
  }
  if (actor.defId === 'frankenstein' && (actor.counters.charges ?? 0) >= 3 && attack.power) {
    ctx.rangeBonus += 1;
    ctx.mods.push(['Static Charge', 0.6]);
    actor.counters.charges = 0;
    addEvent(s, { kind: 'ability', text: `${actor.name} unleashes 3 Static Charges (+1 Range, +60%)`, actor: actor.uid });
  }
  if (item) applyItemToCtx(ctx, item);
  return ctx;
}

function findItemId(s: GameState, p: 0 | 1, cardUid: string): string | undefined {
  const pl = s.players[p];
  const c = [...pl.hand, ...pl.discard].find((x) => x.uid === cardUid);
  return c?.itemId;
}

function applyItemToCtx(ctx: ActCtx, item: ItemDef): void {
  const a = ctx.aff;
  switch (item.id) {
    // ---- attack items
    case 'whetstone':
      ctx.powerMult *= 1 + 0.15 * a;
      ctx.critBonus += 5 * a;
      break;
    case 'scope':
      if (ctx.attack.targeting === 'character') {
        ctx.rangeBonus += 2;
        ctx.accBonus += 10 * a;
        ctx.scope = true;
      }
      break;
    case 'poison_coating':
      ctx.extraStatuses.push({ id: 'poison', chance: Math.min(1, 0.6) });
      break;
    case 'flame_oil':
      ctx.tag = 'fire';
      ctx.extraStatuses.push({ id: 'burn', chance: 0.4 });
      break;
    case 'heavy_gloves':
      ctx.knockback += 1;
      ctx.defIgnore += 0.15 * a;
      break;
    case 'piercing_rounds':
      ctx.piercing = true;
      break;
    case 'chain_link':
      ctx.chain = true;
      break;
    case 'lifesteal_fang':
      ctx.lifesteal += 0.3 * a;
      break;
    case 'silencer':
      ctx.silencer = true;
      break;
    case 'executioners_ledger':
      ctx.noMiss = true;
      ctx.ledger = true;
      break;
    // ---- ability items attached to support / utility attacks
    case 'amplifier_coil':
      ctx.rangeBonus += 1;
      ctx.areaBonus += 1;
      break;
    case 'hex_scroll':
      ctx.hexScroll = true;
      break;
    case 'skeleton_key':
      ctx.ignoreLos = true;
      break;
    case 'overcharge_valve':
      ctx.powerMult *= 1 + 0.3 * a;
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- helpers

function power(ctx: ActCtx, base: number): number {
  return base * ctx.powerMult;
}

function category(ctx: ActCtx): 'physical' | 'special' {
  return ctx.attack.category === 'physical' ? 'physical' : 'special';
}

function statusesOf(ctx: ActCtx, extra: StatusApply[] = []): StatusApply[] {
  return [...(ctx.attack.statuses ?? []), ...extra, ...ctx.extraStatuses];
}

function ledgerMult(ctx: ActCtx, target: Unit): number {
  return ctx.ledger && hpPct(target) <= 0.35 ? 1.75 : 1;
}

/** Single Character-Target hit with all item riders (piercing rounds, chain link). */
export function hitUnit(ctx: ActCtx, target: Unit, o: { power?: number; acc?: number | null; crit?: number; forceCrit?: boolean; extraStatuses?: StatusApply[]; mult?: number; mods?: [string, number][]; defIgnore?: number; knockback?: number; pull?: number; area?: boolean; lifestealAlways?: boolean; label?: string; noRiders?: boolean } = {}): HitResult {
  const { s, actor } = ctx;
  const res = resolveHit(s, {
    attacker: actor,
    target,
    attack: ctx.attack,
    label: o.label ?? ctx.attack.name,
    power: power(ctx, o.power ?? ctx.attack.power ?? 0),
    tag: ctx.tag,
    category: category(ctx),
    area: o.area,
    acc: ctx.noMiss ? null : o.acc === undefined ? ctx.attack.acc : o.acc,
    accBonus: ctx.accBonus,
    crit: (o.crit ?? ctx.attack.crit) + ctx.critBonus,
    forceCrit: o.forceCrit,
    defIgnore: ctx.defIgnore + (o.defIgnore ?? 0),
    mods: [...ctx.mods, ...(o.mods ?? [])],
    mult: ctx.mult * (o.mult ?? 1) * ledgerMult(ctx, target) * (ctx.replay ? 0.5 : 1),
    statuses: statusesOf(ctx, o.extraStatuses),
    hexScroll: ctx.hexScroll,
    knockback: (o.knockback ?? ctx.knockback) || undefined,
    pull: o.pull ?? ctx.attack.pull,
    silencer: ctx.silencer,
    lifesteal: ctx.lifesteal,
    lifestealAlways: o.lifestealAlways,
    bonusVpOnKo: ctx.ledger ? 3 : undefined,
    scope: ctx.scope,
    noMiss: ctx.noMiss,
  });
  if (res.hit) {
    ctx.dealt += res.damage;
    ctx.firstTarget ??= target;
  }
  if (res.hit && !o.noRiders) {
    if (ctx.piercing) {
      const dir = directionTo(actor.pos, target.pos);
      const behind = ray(actor.pos, target.pos, distance(actor.pos, target.pos) + 6, bounds(s))
        .filter((h) => distance(actor.pos, h) > distance(actor.pos, target.pos));
      let n = 0;
      for (const h of behind) {
        if (tileAt(s, h)?.wall) break;
        const u = unitAt(s, h);
        if (u && u !== target) {
          resolveHit(s, { attacker: actor, target: u, label: `${ctx.attack.name} (pierce)`, power: power(ctx, o.power ?? ctx.attack.power ?? 0), tag: ctx.tag, category: category(ctx), acc: null, mult: 0.6 * ctx.mult, silencer: ctx.silencer });
          if (++n >= 2) break;
        }
      }
      void dir;
    }
    if (ctx.chain) {
      const others = s.units
        .filter((u) => u.owner !== actor.owner && u !== target && distance(u.pos, target.pos) <= 2 && !u.isObject)
        .sort((a, b) => distance(a.pos, target.pos) - distance(b.pos, target.pos));
      if (others[0]) resolveHit(s, { attacker: actor, target: others[0], label: 'Chain Link arc', power: power(ctx, o.power ?? ctx.attack.power ?? 0), tag: 'electric', category: category(ctx), acc: null, mult: 0.5 * ctx.mult, silencer: ctx.silencer });
    }
  }
  return res;
}

function area(ctx: ActCtx, tiles: Hex[], o: { power?: number; friendly?: boolean; enemiesOnly?: boolean; extraStatuses?: StatusApply[]; mult?: number; crit?: number; exclude?: string[]; label?: string; powerFor?: (u: Unit) => number; knockback?: number; from?: Hex } = {}): HitResult[] {
  const { s, actor } = ctx;
  const res = areaDamage(s, actor, tiles, {
    power: power(ctx, o.power ?? ctx.attack.power ?? 0),
    powerFor: o.powerFor ? (u) => power(ctx, o.powerFor!(u)) : undefined,
    tag: ctx.tag,
    category: category(ctx),
    label: o.label ?? ctx.attack.name,
    friendly: o.friendly ?? true,
    enemiesOnly: o.enemiesOnly ?? ctx.attack.enemiesOnly,
    crit: (o.crit ?? ctx.attack.crit) + ctx.critBonus,
    statuses: statusesOf(ctx, o.extraStatuses),
    mods: ctx.mods,
    mult: ctx.mult * (o.mult ?? 1) * (ctx.replay ? 0.5 : 1),
    hexScroll: ctx.hexScroll,
    knockback: o.knockback,
    from: o.from,
    silencer: ctx.silencer,
    exclude: o.exclude,
    attack: ctx.attack,
  });
  for (const r of res) if (r.hit) ctx.dealt += r.damage;
  if (['fire', 'electric'].includes(ctx.tag)) detonateGasOnPath(s, tiles, actor.uid);
  return res;
}

function fizzle(s: GameState, actor: Unit, why: string): false {
  addEvent(s, { kind: 'fizzle', text: `${actor.name}'s action fizzles: ${why}`, actor: actor.uid, to: actor.pos });
  return false;
}

function targetUnit(ctx: ActCtx): Unit | undefined {
  return getUnit(ctx.s, ctx.cmd.target.unit);
}

/** Validates range + LOS + visibility for a Character-Target attack at execution time. */
export function checkCharacterTarget(ctx: ActCtx, t: Unit | undefined, range: number): string | null {
  const { s, actor } = ctx;
  if (!t || !s.units.includes(t)) return 'target is gone';
  if (!canSee(s, actor.owner, t) && !ctx.ignoreLos) return 'target is hidden';
  if (distance(actor.pos, t.pos) > range) return 'target out of range';
  if (!ctx.ignoreLos && !hasLos(s, actor.pos, t.pos, actor)) return 'no line of sight';
  return null;
}

function freeAdjacent(s: GameState, h: Hex): Hex[] {
  return neighbors(h, bounds(s)).filter((n) => isFree(s, n));
}

// ---------------------------------------------------------------- attack execution

/** Executes an attack. Returns false if it fizzled (use-limit not consumed). */
export function executeAttack(ctx: ActCtx): boolean {
  const { s, actor, attack } = ctx;
  const range = attack.range + ctx.rangeBonus;
  // Resonant Rest (Cymbal Chimp): shockwave before his first action when set to Rest
  const custom = attack.custom ? CUSTOM_ATTACKS[attack.custom] : undefined;
  addEvent(s, { kind: 'attack', text: `${actor.name} uses ${attack.name}${ctx.replay ? ' (Replay)' : ''}`, actor: actor.uid, from: actor.pos, to: ctx.cmd.target.tile ?? getUnit(s, ctx.cmd.target.unit)?.pos });
  let ok: boolean;
  if (custom) ok = custom(ctx, range);
  else ok = genericAttack(ctx, range);
  if (!ok) return false;
  // attacking reveals Hidden (Silencer: does not break Hidden)
  if (hasStatus(actor, 'hidden') && !ctx.silencer && attack.category !== 'support' && attack.category !== 'utility') revealHidden(s, actor, 'attacked');
  // Encore tokens (Ballerina)
  if (actor.defId === 'ballerina' && ctx.dealt > 0 && (actor.counters.tokens ?? 0) > 0 && ctx.firstTarget && s.units.includes(ctx.firstTarget)) {
    const n = actor.counters.tokens!;
    actor.counters.tokens = 0;
    for (let i = 0; i < n; i++) {
      if (!s.units.includes(ctx.firstTarget)) break;
      addEvent(s, { kind: 'ability', text: `Encore! Extra hit ${i + 1}/${n}`, actor: actor.uid });
      dealDamage(s, ctx.firstTarget, Math.max(1, Math.round(ctx.dealt * 0.25)), { attacker: actor, tag: ctx.tag, label: 'Encore' });
    }
  }
  if (!ctx.replay) actor.data.lastAttack = { cmd: ctx.cmd, round: s.round };
  return true;
}

function genericAttack(ctx: ActCtx, range: number): boolean {
  const { s, actor, attack } = ctx;
  if (attack.targeting === 'self') {
    const shape = attack.shape ?? 'ring1';
    const radius = (shape === 'burst2' ? 2 : 1) + ctx.areaBonus;
    const tiles = shape === 'burst2' ? burst(actor.pos, radius, bounds(s)).filter((h) => !eq(h, actor.pos)) : ring(actor.pos, radius, bounds(s));
    area(ctx, tiles, { friendly: attack.friendlyFire ?? true });
    return true;
  }
  if (attack.targeting === 'field') {
    const tile = ctx.cmd.target.tile;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    area(ctx, [tile]);
    return true;
  }
  const t = targetUnit(ctx);
  const err = checkCharacterTarget(ctx, t, range);
  if (err) return fizzle(s, actor, err);
  if (!attack.power) {
    // pure status attack (Spotlight, Dirge)
    const res = resolveHit(s, { attacker: actor, target: t!, attack, label: attack.name, power: 0, tag: 'psychic', category: 'special', acc: attack.acc, accBonus: ctx.accBonus, mult: 0 });
    void res;
    return statusOnly(ctx, t!);
  }
  hitUnit(ctx, t!);
  if (['fire', 'electric'].includes(ctx.tag)) detonateGasOnPath(s, line(actor.pos, t!.pos), actor.uid);
  return true;
}

function statusOnly(ctx: ActCtx, t: Unit): boolean {
  // resolveHit with mult 0 already rolled hit/miss and produced events; apply statuses on success
  const last = ctx.s.events.at(-1);
  if (last?.kind === 'miss') return true;
  for (const st of statusesOf(ctx)) applyStatus(ctx.s, t, st.id, { chance: st.chance, duration: st.duration, source: ctx.actor, hexScroll: ctx.hexScroll });
  return true;
}

type CustomFn = (ctx: ActCtx, range: number) => boolean;

const CUSTOM_ATTACKS: Record<string, CustomFn> = {
  lay_eggs(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const res = hitUnit(ctx, t!);
    const already = s.units.some((u) => u.statuses.some((x) => x.id === 'egg' && x.source === actor.uid));
    if (res.hit && s.units.includes(t!) && t!.chars.existence === 'living' && !already) {
      applyStatus(s, t!, 'egg', { source: actor, duration: 3 });
    }
    return true;
  },
  overclock(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if (!t || t.owner !== actor.owner) return fizzle(s, actor, 'needs a friendly unit');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'out of range');
    if (!hasStatus(t, 'corruption')) return fizzle(s, actor, 'target is not Corrupted');
    const used: string[] = (actor.data.overclocked ??= []);
    if (used.includes(t.uid)) return fizzle(s, actor, 'max 1 per target');
    used.push(t.uid);
    applyStatus(s, t, 'overclock', { duration: 2, source: actor });
    return true;
  },
  miasma_rot(ctx, range) {
    const { s, actor } = ctx;
    const tile = ctx.cmd.target.tile;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    addField(s, tile, 'toxic', { duration: 2, owner: actor.owner, source: actor.uid });
    const victims = unitsAt(s, tile);
    area(ctx, [tile], { extraStatuses: [] });
    for (const v of victims) if (s.units.includes(v) && hasStatus(v, 'poison')) v.data.miasmaBy = actor.uid;
    return true;
  },
  lance(ctx, range) {
    const { s, actor } = ctx;
    const tile = getUnit(s, ctx.cmd.target.unit)?.pos ?? ctx.cmd.target.tile;
    if (!tile || eq(tile, actor.pos)) return fizzle(s, actor, 'no direction');
    const path = ray(actor.pos, tile, range, bounds(s));
    for (const h of path) {
      if (tileAt(s, h)?.wall) break;
      for (const u of unitsAt(s, h)) hitUnit(ctx, u, { area: true, noRiders: true });
    }
    return true;
  },
  hemorrhage(ctx) {
    const { s, actor } = ctx;
    area(ctx, ring(actor.pos, 1 + ctx.areaBonus, bounds(s)), { friendly: true });
    applyStatus(s, actor, 'bleeding', { duration: 3, value: 3, source: actor });
    return true;
  },
  sporecloud(ctx, range) {
    const { s, actor } = ctx;
    const tile = getUnit(s, ctx.cmd.target.unit)?.pos ?? ctx.cmd.target.tile;
    if (!tile) return fizzle(s, actor, 'no direction');
    const tiles = cone(actor.pos, coneWedgeToward(actor.pos, tile), 3 + ctx.areaBonus, bounds(s));
    void range;
    for (const h of tiles) {
      for (const u of unitsAt(s, h)) {
        const statused = u.statuses.some((x) => !['hidden'].includes(x.id));
        hitUnit(ctx, u, { power: statused ? 60 : 40, area: true, noRiders: true });
      }
    }
    return true;
  },
  mind_root(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx) ?? getUnit(s, actor.data.symbiosisPartner);
    if (!t || t.data.symbiosisWith !== actor.uid) return fizzle(s, actor, 'target is not the Symbiosis unit');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'out of range');
    healUnit(s, t, t.maxHp * 0.2 * ctx.powerMult, 'generic', 'Mind Root');
    const neg = t.statuses.find((x) => NEGATIVE_STATUSES.includes(x.id) && x.id !== 'corruption');
    if (neg) removeStatus(s, t, neg.id);
    return true;
  },
  stuffing_slash(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const ambush = hasStatus(actor, 'hidden') && !actor.rt.firstAttackDone && !actor.data.hasAttacked;
    hitUnit(ctx, t!, { forceCrit: ambush });
    actor.data.hasAttacked = true;
    return true;
  },
  swap_places(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const res = hitUnit(ctx, t!);
    if (res.hit && s.units.includes(t!) && s.units.includes(actor)) swapUnits(s, actor, t!, actor);
    return true;
  },
  teleport_trick(ctx, range) {
    const { s, actor } = ctx;
    const dest = ctx.cmd.target.tile;
    if (dest && distance(actor.pos, dest) <= range && isFree(s, dest)) teleportUnit(s, actor, dest, null, 'teleports (Trick)');
    const victims = s.units
      .filter((u) => u.owner !== actor.owner && distance(u.pos, actor.pos) <= 1 && !u.isObject)
      .sort((a, b) => a.hp - b.hp);
    if (!victims[0]) return true;
    hitUnit(ctx, victims[0]);
    return true;
  },
  candy_rain(ctx, range) {
    const { s, actor } = ctx;
    const tiles = (ctx.cmd.target.tiles ?? []).filter((h) => distance(actor.pos, h) <= range).slice(0, 3);
    if (!tiles.length) return fizzle(s, actor, 'no tiles in range');
    addEvent(s, { kind: 'attack', text: `${actor.name}: Candy Rain!`, actor: actor.uid, tiles });
    for (const h of tiles) area(ctx, [h]);
    return true;
  },
  lifesteal15(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    hitUnit(ctx, t!, { lifestealAlways: true });
    return true;
  },
  order_up(ctx, range) {
    const { s, actor } = ctx;
    const dest = ctx.cmd.target.tile;
    if (!dest || distance(actor.pos, dest) > range || !isFree(s, dest)) return fizzle(s, actor, 'landing tile not free');
    teleportUnit(s, actor, dest, null, 'jumps (Order Up)');
    const tiles = ring(actor.pos, 1 + ctx.areaBonus, bounds(s));
    const victims = tiles.flatMap((h) => unitsAt(s, h));
    area(ctx, tiles);
    for (const v of victims) {
      if (s.units.includes(v) && v.owner !== actor.owner && v.maxHp <= 350) forcedMove(s, v, directionTo(actor.pos, v.pos), 1, 'knockback', actor);
    }
    return true;
  },
  pirouette(ctx) {
    const { s, actor } = ctx;
    const crit = 5 + 8 * Math.min(3, actor.rt.moved);
    area(ctx, ring(actor.pos, 1 + ctx.areaBonus, bounds(s)), { crit });
    return true;
  },
  grand_jete(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if (!t || !s.units.includes(t)) return fizzle(s, actor, 'target is gone');
    if (!canSee(s, actor.owner, t)) return fizzle(s, actor, 'target is hidden');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'target out of range');
    if (distance(actor.pos, t.pos) > 1) {
      const wanted = ctx.cmd.target.tile;
      const options = freeAdjacent(s, actor.pos).filter((h) => distance(h, t.pos) <= 1);
      const land = wanted && options.some((o) => eq(o, wanted)) ? wanted : options[0];
      if (!land) return fizzle(s, actor, 'no landing tile');
      teleportUnit(s, actor, land, null, 'leaps (Grand Jeté)');
    }
    hitUnit(ctx, t);
    return true;
  },
  penny_shot(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const coins = Math.min(6, actor.counters.coins ?? 0);
    hitUnit(ctx, t!, { power: 50 * (1 + 0.1 * coins) });
    return true;
  },
  shake_down(ctx) {
    const { s, actor } = ctx;
    const loss = Math.min(actor.hp - 1, Math.round(actor.maxHp * 0.1));
    if (loss > 0) dealDamage(s, actor, loss, { attacker: null, tag: null, isRecoil: true, label: 'Shake Down' });
    actor.counters.coins = Math.min(6, (actor.counters.coins ?? 0) + 2);
    addEvent(s, { kind: 'ability', text: `${actor.name} shakes out 2 Coins (${actor.counters.coins}/6)`, actor: actor.uid });
    return true;
  },
  barbed_fence(ctx, range) {
    const { s, actor } = ctx;
    const tiles = (ctx.cmd.target.tiles ?? (ctx.cmd.target.tile ? [ctx.cmd.target.tile] : [])).slice(0, 2);
    if (!tiles.length || distance(actor.pos, tiles[0]!) > range) return fizzle(s, actor, 'out of range');
    if (tiles.length === 1) {
      const n = neighbors(tiles[0]!, bounds(s)).find((h) => !tileAt(s, h)?.wall);
      if (n) tiles.push(n);
    }
    if (tiles.length === 2 && distance(tiles[0]!, tiles[1]!) !== 1) tiles.pop();
    for (const h of tiles) addField(s, h, 'snare', { duration: 3 + (ctx.hexScroll ? 1 : 0), owner: actor.owner });
    return true;
  },
  galvanic_fist(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const res = hitUnit(ctx, t!);
    const onElectric = getField(s, actor.pos, 'electric') || getField(s, actor.pos, 'electrified_water') || getField(s, actor.pos, 'portal') || getField(s, actor.pos, 'shock_storm');
    if (res.hit && onElectric) {
      const others = s.units
        .filter((u) => u.owner !== actor.owner && u !== t && !u.isObject && distance(u.pos, t!.pos) <= 2)
        .sort((a, b) => distance(a.pos, t!.pos) - distance(b.pos, t!.pos));
      if (others[0]) hitUnit(ctx, others[0], { acc: null, mult: 0.5, label: 'Galvanic arc', noRiders: true });
    }
    return true;
  },
  skybolt(ctx, range) {
    const { s, actor } = ctx;
    const tile = ctx.cmd.target.tile ?? getUnit(s, ctx.cmd.target.unit)?.pos;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    const victims = unitsAt(s, tile);
    detonateGasOnPath(s, [tile], actor.uid);
    if (!victims.length) {
      area(ctx, [tile]);
      return true;
    }
    for (const v of victims) {
      const shocked = hasStatus(v, 'shock');
      areaDamage(s, actor, [v.pos], {
        power: power(ctx, 80),
        tag: ctx.tag,
        category: 'special',
        label: 'Skybolt',
        onlyUnit: v.uid,
        mods: [...ctx.mods, ...(shocked ? ([['Shocked target', 0.3]] as [string, number][]) : [])],
        mult: ctx.mult * (ctx.replay ? 0.5 : 1),
        crit: 5 + ctx.critBonus,
        area: false,
      });
      if (s.units.includes(v) && v.owner === actor.owner && v !== actor) ctx.hooks.executeNextAttackNow?.(v.uid);
    }
    return true;
  },
  seers_glance(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const res = hitUnit(ctx, t!);
    if (res.hit && s.units.includes(t!) && t!.rt.plannedMove) applyStatus(s, t!, 'marked', { duration: 2, source: actor });
    return true;
  },
  trainticket(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if (!t || !s.units.includes(t)) return fizzle(s, actor, 'target is gone');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'target out of range');
    const dir = ctx.cmd.target.dir ?? 0;
    const dist = Math.max(1, Math.min(3 + ctx.rangeBonus, ctx.cmd.target.dist ?? 1));
    const dest = step(t.pos, dir, dist);
    if (!tileAt(s, dest) || !isFree(s, dest)) return fizzle(s, actor, 'destination cannot be entered');
    if (!teleportUnit(s, t, dest, t.owner === actor.owner ? null : actor, 'rides the Trainticket')) return fizzle(s, actor, 'target cannot be moved');
    return true;
  },
  replay(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const res = resolveHit(s, { attacker: actor, target: t!, attack: ctx.attack, label: 'Replay', power: 0, tag: 'psychic', category: 'special', acc: ctx.attack.acc, accBonus: ctx.accBonus, mult: 0 });
    void res;
    if (s.events.at(-1)?.kind === 'miss') return true;
    const last = t!.data.lastAttack as { cmd: AttackCmd } | undefined;
    if (!last) {
      addEvent(s, { kind: 'info', text: `${t!.name} has no attack to replay`, target: t!.uid });
      return true;
    }
    const def = attackDefFor(s, t!, last.cmd.attack);
    if (!def) return true;
    addEvent(s, { kind: 'ability', text: `Replay: ${t!.name} repeats ${def.name} at 50%`, actor: actor.uid, target: t!.uid });
    const rctx = buildCtx(s, t!, def, { ...last.cmd, item: undefined }, ctx.hooks);
    rctx.replay = true;
    executeAttack(rctx);
    return true;
  },
  box_leap(ctx, range) {
    const { s, actor } = ctx;
    const [a, b] = ctx.cmd.target.tiles ?? [];
    if (!a || !b || distance(actor.pos, a) > range || distance(a, b) !== 3) return fizzle(s, actor, 'invalid leap tiles');
    for (const [i, tile] of [a, b].entries()) {
      const occupant = blockerAt(s, tile);
      if (occupant && occupant !== actor) {
        hitUnit(ctx, occupant, { power: 85, acc: null, area: true, noRiders: true });
        if (s.units.includes(occupant)) forcedMove(s, occupant, directionTo(actor.pos, tile), 1, 'knockback', actor);
      }
      const land = isFree(s, tile) ? tile : freeAdjacent(s, tile)[0];
      if (land) teleportUnit(s, actor, land, null, i === 0 ? 'leaps' : 'leaps again');
      area(ctx, ring(tile, 1, bounds(s)).filter((h) => !eq(h, actor.pos)), { power: 45, exclude: occupant ? [occupant.uid, actor.uid] : [actor.uid] });
    }
    return true;
  },
  shrunken_strike(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const heads = s.units.filter(
      (u) => u.defId === 'shrink_head' && u.master === actor.uid && (distance(u.pos, actor.pos) === 1 || distance(u.pos, t!.pos) === 1),
    ).length;
    hitUnit(ctx, t!, { power: 45 * (1 + Math.min(0.6, 0.15 * heads)) });
    return true;
  },
  head_swap(ctx, range) {
    const { s, actor } = ctx;
    const head = targetUnit(ctx);
    if (!head || head.defId !== 'shrink_head' || head.master !== actor.uid) return fizzle(s, actor, 'needs one of his Shrink Heads');
    if (distance(actor.pos, head.pos) > range) return fizzle(s, actor, 'head out of range');
    const from = { ...actor.pos };
    actor.pos = { ...head.pos };
    head.pos = from;
    addEvent(s, { kind: 'move', text: `${actor.name} swaps with a Shrink Head`, actor: actor.uid, from, to: { ...actor.pos } });
    const heads = s.units.filter((u) => u.master === actor.uid).map((u) => u.uid);
    area(ctx, ring(actor.pos, 1 + ctx.areaBonus, bounds(s)), { exclude: heads });
    return true;
  },
  mire_song(ctx) {
    const { s, actor } = ctx;
    const tile = getUnit(s, ctx.cmd.target.unit)?.pos ?? ctx.cmd.target.tile;
    if (!tile) return fizzle(s, actor, 'no direction');
    const tiles = cone(actor.pos, coneWedgeToward(actor.pos, tile), 3 + ctx.areaBonus, bounds(s));
    for (const h of tiles) {
      const onSwamp = !!getField(s, h, 'swamp');
      for (const u of unitsAt(s, h)) hitUnit(ctx, u, { area: true, noRiders: true, extraStatuses: onSwamp ? [{ id: 'blind', chance: 1, duration: 2 }] : [] });
    }
    return true;
  },
  mud_double(ctx, range) {
    const { s, actor } = ctx;
    const dest = ctx.cmd.target.tile ?? freeAdjacent(s, actor.pos)[0];
    if (!dest || distance(actor.pos, dest) > range || !isFree(s, dest)) return fizzle(s, actor, 'no free tile');
    const old = { ...actor.pos };
    teleportUnit(s, actor, dest, null, 'slips away (Mud Double)');
    const decoy = createSummon(s, actor.owner, 'mud_decoy', old, actor);
    decoy.expiresRound = s.round + 3;
    s.units.push(decoy);
    addEvent(s, { kind: 'summon', text: 'A Mud Decoy remains', actor: decoy.uid, to: old });
    return true;
  },
  marsh_gas(ctx, range) {
    const { s, actor } = ctx;
    const tile = ctx.cmd.target.tile;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    if (getField(s, tile, 'gas')) {
      addEvent(s, { kind: 'attack', text: `${actor.name} ignites the Marsh Gas`, actor: actor.uid, tiles: [tile] });
      removeGasAndExplode(ctx, tile);
    } else {
      addField(s, tile, 'gas', { duration: 3, owner: actor.owner, source: actor.uid });
    }
    return true;
  },
  flicker(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    hitUnit(ctx, t!);
    detonateGasOnPath(s, line(actor.pos, t!.pos), actor.uid);
    const candle = getUnit(s, actor.data.candle);
    if (candle && s.units.includes(actor)) {
      const land = freeAdjacent(s, candle.pos)[0];
      if (land) teleportUnit(s, actor, land, null, 'flickers back to her Candle');
    }
    return true;
  },
  prismatic_beam(ctx) {
    const { s, actor } = ctx;
    const tiles = ctx.cmd.target.tiles ?? (ctx.cmd.target.tile ? [ctx.cmd.target.tile] : []);
    if (!tiles.length) return fizzle(s, actor, 'no target tile');
    const seg1 = line(actor.pos, tiles[0]!).slice(1);
    const seg2 = tiles[1] ? line(tiles[0]!, tiles[1]).slice(1) : [];
    const path = [...seg1, ...seg2].slice(0, 8 + ctx.rangeBonus);
    const hit = new Set<string>();
    addEvent(s, { kind: 'attack', text: `${actor.name} fires the Prismatic Beam`, actor: actor.uid, tiles: path });
    for (const h of path) {
      if (tileAt(s, h)?.wall) break;
      for (const u of unitsAt(s, h)) {
        if (hit.has(u.uid) || u === actor) continue;
        hit.add(u.uid);
        hitUnit(ctx, u, { area: true, noRiders: true });
      }
    }
    return true;
  },
  orb_bomb(ctx, range) {
    const { s, actor } = ctx;
    const tile = ctx.cmd.target.tile;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    const existing = getField(s, tile, 'crystal_bomb');
    if (existing && existing.owner === actor.owner) {
      const ups = Number(existing.data?.upgrades ?? 0);
      if (ups >= 3) return fizzle(s, actor, 'bomb fully upgraded');
      existing.data = { ...existing.data, upgrades: ups + 1, arm: Number(existing.data?.arm ?? 2) + 1, power: Math.round((70 + 70 * 0.15 * (ups + 1)) * ctx.powerMult) };
      addEvent(s, { kind: 'field', text: `Crystal Bomb upgraded (arm ${existing.data.arm}, Power ${existing.data.power})`, tiles: [tile], field: 'crystal_bomb', privateTo: actor.owner });
      return true;
    }
    if (!isFree(s, tile)) return fizzle(s, actor, 'tile not free');
    const own = s.tiles.filter((t) => t.fields.some((f) => f.id === 'crystal_bomb' && f.owner === actor.owner));
    if (own.length >= 2) return fizzle(s, actor, 'max 2 bombs');
    addField(s, tile, 'crystal_bomb', { owner: actor.owner, duration: null, data: { eye: actor.uid, arm: 2, power: Math.round(70 * ctx.powerMult), upgrades: 0 }, silent: true });
    addEvent(s, { kind: 'field', text: 'A Crystal Bomb is placed', tiles: [tile], field: 'crystal_bomb', privateTo: actor.owner });
    return true;
  },
  gnaw_swarm(ctx, range) {
    const { s, actor } = ctx;
    const tile = ctx.cmd.target.tile;
    if (!tile || distance(actor.pos, tile) > range) return fizzle(s, actor, 'tile out of range');
    if (tileAt(s, tile)?.wall) {
      addEvent(s, { kind: 'attack', text: `${actor.name}'s swarm devours a wall`, actor: actor.uid, tiles: [tile] });
      destroyWall(s, tile, actor);
      return true;
    }
    area(ctx, [tile]);
    return true;
  },
  ant_trail(ctx, range) {
    const { s, actor } = ctx;
    const endUnit = getUnit(s, ctx.cmd.target.unit);
    const endTile = endUnit?.pos ?? ctx.cmd.target.tile;
    if (!endTile || distance(actor.pos, endTile) > range) return fizzle(s, actor, 'end point out of range');
    const wallEnd = !!tileAt(s, endTile)?.wall;
    const okUnit = endUnit && endUnit.owner === actor.owner && (hasChar(endUnit, 'organic') || hasChar(endUnit, 'colony'));
    if (!wallEnd && !okUnit) return fizzle(s, actor, 'needs a wall or a friendly Organic/Colony unit');
    const tiles = line(actor.pos, endTile).slice(1).filter((h) => !tileAt(s, h)?.wall);
    const trailId = `${actor.uid}-${s.round}`;
    for (const h of tiles) addField(s, h, 'ant_trail', { duration: 3, owner: actor.owner, data: { trail: trailId, source: actor.uid, endUnit: endUnit?.uid ?? '', endC: endTile.c, endR: endTile.r }, silent: true });
    addEvent(s, { kind: 'field', text: 'An Ant Trail forms', tiles, field: 'ant_trail' });
    const victims = tiles.flatMap((h) => unitsAt(s, h)).filter((u) => u.owner !== actor.owner);
    for (const v of victims) {
      v.data[`trail_${trailId}_${s.round}`] = true;
      areaDamage(s, actor, [v.pos], { power: power(ctx, 40), tag: 'pierce', category: 'physical', label: 'Ant Trail', onlyUnit: v.uid, mods: ctx.mods });
    }
    return true;
  },
  crash(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const missing = 1 - hpPct(actor);
    hitUnit(ctx, t!, { power: 40 * (1 + Math.max(0, Math.min(1, missing))) });
    return true;
  },
  spirit_link(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if (!t || !s.units.includes(t)) return fizzle(s, actor, 'target is gone');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'target out of range');
    const hex = hasStatus(t, 'hex');
    const res = hitUnit(ctx, t, { mods: hex ? [['Hex', 0.25]] : [] });
    if (hex) removeStatus(s, t, 'hex', true);
    if (!res.hit || res.damage <= 0) return true;
    const team = s.units.filter((u) => u.owner === t.owner && u !== t && !u.isObject && !u.isSummon && distance(u.pos, t.pos) <= 3);
    if (!team.length) return true;
    const share = res.damage / team.length;
    for (const u of team) {
      const healed = Math.min(u.maxHp - u.hp, Math.round(share));
      if (healed > 0) {
        u.hp += healed;
        addEvent(s, { kind: 'heal', text: `${u.name} heals ${healed} (Spirit Link)`, target: u.uid, amount: healed });
      }
    }
    return true;
  },
  flaming_skull(ctx, range) {
    const { s, actor } = ctx;
    const tile = getUnit(s, ctx.cmd.target.unit)?.pos ?? ctx.cmd.target.tile;
    if (!tile || eq(tile, actor.pos)) return fizzle(s, actor, 'no direction');
    const path = ray(actor.pos, tile, range, bounds(s));
    let victim: Unit | undefined;
    const travelled: Hex[] = [];
    for (const h of path) {
      if (tileAt(s, h)?.wall) break;
      travelled.push(h);
      const u = unitAt(s, h);
      if (u) {
        victim = u;
        break;
      }
    }
    detonateGasOnPath(s, travelled, actor.uid);
    if (!victim || !s.units.includes(victim)) {
      addEvent(s, { kind: 'miss', text: 'The Flaming Skull flies into the dark', actor: actor.uid, tiles: travelled });
      return true;
    }
    const res = hitUnit(ctx, victim, { extraStatuses: [{ id: 'burn', chance: 0.3 }] });
    if (res.hit) {
      const centre = victim.pos;
      area(ctx, ring(centre, 1, bounds(s)), { mult: 0.5, label: 'Skull splash', exclude: [actor.uid] });
    }
    return true;
  },
  marigold_garland(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if ((actor.counters.souls ?? 0) < 3) return fizzle(s, actor, 'needs 3 Souls');
    if (!t || t.owner !== actor.owner || t.revived || t.tier === 'boss') return fizzle(s, actor, 'invalid target');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'out of range');
    actor.counters.souls = (actor.counters.souls ?? 0) - 3;
    applyStatus(s, t, 'garland', { duration: 3, source: actor });
    addField(s, t.pos, 'marigold', { duration: 2, owner: actor.owner });
    return true;
  },
  claw_rake(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const wolf = actor.form === 'wolf';
    hitUnit(ctx, t!, { power: wolf ? 85 : 60, extraStatuses: wolf ? [{ id: 'bleeding', chance: 1, duration: 3 }] : [] });
    return true;
  },
  moonlit_charge(ctx, range) {
    const { s, actor } = ctx;
    const tile = getUnit(s, ctx.cmd.target.unit)?.pos ?? ctx.cmd.target.tile;
    if (!tile || eq(tile, actor.pos)) return fizzle(s, actor, 'no direction');
    const dir = directionTo(actor.pos, tile);
    const wolf = actor.form === 'wolf';
    const from = { ...actor.pos };
    for (let i = 0; i < range; i++) {
      const next = step(actor.pos, dir);
      const t = tileAt(s, next);
      if (!t || t.wall) break;
      const u = blockerAt(s, next);
      if (u) {
        if (from.c !== actor.pos.c || from.r !== actor.pos.r) addEvent(s, { kind: 'move', text: `${actor.name} charges`, actor: actor.uid, from, to: { ...actor.pos } });
        hitUnit(ctx, u, { power: wolf ? 95 : 70, knockback: 1 + (ctx.knockback - 1 > 0 ? ctx.knockback - 1 : 0) });
        return true;
      }
      actor.pos = next;
    }
    addEvent(s, { kind: 'move', text: `${actor.name} charges into empty air`, actor: actor.uid, from, to: { ...actor.pos } });
    return true;
  },
  strike_the_hour(ctx, range) {
    const { s, actor } = ctx;
    const centre = ctx.cmd.target.tile;
    if (!centre || distance(actor.pos, centre) > range) return fizzle(s, actor, 'centre out of range');
    const hour = ((s.round - 1) % 12) + 1 + (ctx.cmd.hourShift ?? 0);
    const hourTile = clockTile(centre, hour);
    const minuteTile = clockTile(centre, hour + 6);
    addEvent(s, { kind: 'attack', text: `${actor.name} strikes the hour (${((hour - 1 + 12) % 12) + 1} o'clock)`, actor: actor.uid, tiles: [hourTile, minuteTile, centre] });
    if (tileAt(s, hourTile)) area(ctx, [hourTile], { power: 85, label: 'Hour hand' });
    if (tileAt(s, minuteTile)) area(ctx, [minuteTile], { power: 55, label: 'Minute hand' });
    area(ctx, [centre], { power: 30, label: 'Clock centre' });
    for (const h of [hourTile, minuteTile, centre]) if (tileAt(s, h)) addField(s, h, 'chrono', { duration: 1, owner: actor.owner, silent: true });
    return true;
  },
  wail(ctx) {
    const { s, actor } = ctx;
    const tiles = burst(actor.pos, 2 + ctx.areaBonus, bounds(s)).filter((h) => !eq(h, actor.pos));
    for (const u of s.units) if (u.owner !== actor.owner && distance(u.pos, actor.pos) <= 2 && hasStatus(u, 'hidden')) revealHidden(s, u, 'Wail');
    area(ctx, tiles, { enemiesOnly: true });
    return true;
  },
  bedside_manner(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    if (!t || !s.units.includes(t)) return fizzle(s, actor, 'target is gone');
    if (distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'out of range');
    healUnit(s, t, t.maxHp * 0.12 * ctx.powerMult, 'generic', 'Bedside Manner');
    applyStatus(s, t, 'patient', { duration: 2 + (ctx.hexScroll ? 1 : 0), source: actor });
    return true;
  },
  scalpel_backstab(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const patient = hasStatus(t!, 'patient');
    const turned = t!.rt.finished || t!.rt.plannedActions === 0;
    const both = patient && turned;
    const mult = both ? 1.8 : patient || turned ? 1.35 : 1;
    const mods: [string, number][] = [];
    hitUnit(ctx, t!, { mult, defIgnore: both ? 0.3 : 0, mods });
    if (patient || turned) addEvent(s, { kind: 'info', text: `Backstab ×${mult}${both ? ' (ignores 30% PDef)' : ''}`, actor: actor.uid });
    // Quiet Professional: free retreat up to 2 tiles
    const retreat = ctx.cmd.target.tiles;
    if (retreat?.length && s.units.includes(actor)) {
      const saved = actor.rt.moved;
      executeMove(s, actor, retreat.slice(0, 2));
      actor.rt.moved = saved;
    }
    return true;
  },
  serve_stew(ctx, range) {
    const { s, actor } = ctx;
    const pot = getUnit(s, actor.data.pot);
    if (!pot || distance(actor.pos, pot.pos) > 2) return fizzle(s, actor, 'the Pot is not within 2 tiles');
    const t = targetUnit(ctx);
    if (!t || !s.units.includes(t) || distance(actor.pos, t.pos) > range) return fizzle(s, actor, 'target out of range');
    const broth = Math.min(3, actor.counters.broth ?? 0);
    actor.counters.broth = (actor.counters.broth ?? 0) - broth;
    if (t.owner === actor.owner) {
      healUnit(s, t, t.maxHp * (broth ? 0.08 * broth : 0.05) * ctx.powerMult, 'generic', `Stew (${broth} Broth)`);
      if (broth >= 3) applyStatus(s, t, 'well_fed', { duration: 2, source: actor });
    } else {
      area(ctx, [t.pos], { power: broth ? 25 * broth : 15, extraStatuses: [{ id: 'burn', chance: 0.4 }], label: `Hot Stew (${broth} Broth)` });
    }
    return true;
  },
  pain_link(ctx, range) {
    const { s, actor } = ctx;
    const t = targetUnit(ctx);
    const err = checkCharacterTarget(ctx, t, range);
    if (err) return fizzle(s, actor, err);
    const mambo = getUnit(s, actor.master);
    const pw = Math.max(30, 150 * hpPct(actor));
    resolveHit(s, { attacker: actor, target: t!, attack: ctx.attack, label: 'Pain Link', power: power(ctx, pw), tag: 'soul', category: 'special', acc: 95, atkOverride: mambo?.stats.satk ?? actor.stats.satk, mods: ctx.mods });
    actor.data.painLinked = true;
    koUnit(s, actor, null, { noReward: true });
    if (mambo) removeStatus(s, mambo, 'entranced');
    return true;
  },
};

function removeGasAndExplode(ctx: ActCtx, tile: Hex): void {
  const { s, actor } = ctx;
  // Marsh Gas detonation: Power 80 on the tile and Ring-1, uses the Wisp's SAtk
  if (!getField(s, tile, 'gas')) return;
  s.tiles.find((t) => t.c === tile.c && t.r === tile.r)!.fields = tileAt(s, tile)!.fields.filter((f) => f.id !== 'gas');
  area(ctx, [tile, ...ring(tile, 1, bounds(s))], { power: 80, label: 'Gas explosion' });
  for (const n of ring(tile, 1, bounds(s))) if (getField(s, n, 'gas')) detonateGas(s, n, actor.uid);
}

// ---------------------------------------------------------------- abilities

export function executeAbility(s: GameState, actor: Unit, cmd: AbilityCmd, hooks: SchedulerHooks, itemId?: string): boolean {
  const def = CHARACTERS[actor.defId];
  const id = cmd.ability;
  const fz = (why: string) => fizzle(s, actor, why);
  const target = getUnit(s, cmd.target.unit);
  void hooks;
  switch (id) {
    case 'common.hack': {
      const tile = cmd.target.tile ?? neighbors(actor.pos, bounds(s)).find((h) => tileAt(s, h)?.objective === 'terminal');
      const t = tile ? tileAt(s, tile) : undefined;
      if (!tile || !t || t.objective !== 'terminal' || distance(actor.pos, tile) > 1) return fz('no adjacent terminal');
      if ((t.terminalReadyRound ?? 0) > s.round) return fz('terminal is cooling down');
      t.terminalReadyRound = s.round + 2;
      addEvent(s, { kind: 'ability', text: `${actor.name} hacks a Research Terminal`, actor: actor.uid, tiles: [tile] });
      awardVp(s, actor.owner, 5, 'Research Terminal');
      return true;
    }
    case 'common.portal': {
      const portal = getField(s, actor.pos, 'portal');
      const eye = getUnit(s, portal?.data?.eye as string | undefined) ?? s.units.find((u) => u.defId === 'crystal_eye' && u.owner === actor.owner);
      if (!portal || !eye) return fz('no Portal or Crystal Eye');
      const land = freeAdjacent(s, eye.pos)[0];
      if (!land) return fz('no free tile next to the Eye');
      return teleportUnit(s, actor, land, null, 'steps through the Portal');
    }
    case 'mambo.wake': {
      if (!hasStatus(actor, 'entranced')) return fz('not entranced');
      const copy = s.units.find((u) => u.data.voodoo && u.master === actor.uid);
      if (copy) {
        copy.data.painLinked = true;
        koUnit(s, copy, null, { noReward: true });
      }
      removeStatus(s, actor, 'entranced');
      return true;
    }
    case 'leech_cook.push_pot': {
      const pot = getUnit(s, actor.data.pot);
      if (!pot) return fz('no Pot');
      if (distance(actor.pos, pot.pos) > 1) return fz('Pot not adjacent');
      if (actor.data.potPushRound === s.round) return fz('max once per round');
      const dest = cmd.target.tile ?? step(pot.pos, directionTo(actor.pos, pot.pos));
      if (distance(dest, pot.pos) !== 1 || !isFree(s, dest)) return fz('cannot push there');
      actor.data.potPushRound = s.round;
      return teleportUnit(s, pot, dest, null, 'is pushed');
    }
  }
  if (!def || def.ability.id !== id) return fz('unknown ability');
  if (def.ability.oncePerGame && actor.once.includes(id)) return fz('already used');
  const ab = itemId ? ITEMS[itemId] : undefined;
  const echo = ab?.id === 'echo_crystal' && !def.ability.oncePerGame;
  const run = (strength: number): boolean => {
    switch (id) {
      case 'termite_mound.hive_shift': {
        if (!target || target.owner !== actor.owner || target === actor) return fz('needs a friendly character');
        if (!(hasChar(target, 'organic') || hasChar(target, 'colony')) || target.isObject) return fz('needs an Organic or Colony character');
        if (distance(actor.pos, target.pos) > 6 + (ab?.id === 'amplifier_coil' ? 1 : 0)) return fz('out of range');
        const a = { ...actor.pos };
        actor.pos = { ...target.pos };
        target.pos = a;
        addEvent(s, { kind: 'move', text: `${actor.name} Hive-Shifts with ${target.name}`, actor: actor.uid, from: a, to: { ...actor.pos } });
        return true;
      }
      case 'mambo.voodoo_doll': {
        if (!target || target.owner !== actor.owner || target.isSummon || target.defId === 'mambo' || target.tier === 'boss') return fz('invalid copy target');
        if (distance(actor.pos, target.pos) > 1) return fz('target not adjacent');
        const land = (cmd.target.tile && isFree(s, cmd.target.tile) && distance(cmd.target.tile, actor.pos) === 1 ? cmd.target.tile : undefined) ?? freeAdjacent(s, actor.pos)[0];
        if (!land) return fz('no free tile');
        const copy = structuredClone(target);
        copy.uid = `v${++s.uidCounter}`;
        copy.pos = { ...land };
        copy.isSummon = true;
        copy.tier = 'summon';
        copy.master = actor.uid;
        copy.cardUid = undefined;
        copy.data = { ...copy.data, voodoo: true, cardUids: [] };
        copy.maxHp = Math.max(1, Math.round(target.maxHp / 2));
        copy.baseMaxHp = copy.maxHp;
        copy.hp = Math.max(1, Math.round(target.hp / 2));
        copy.name = `Voodoo ${target.name}`;
        copy.stats = { ...copy.stats, speed: actor.stats.speed };
        copy.statuses = [];
        copy.gear = null;
        copy.deployedRound = s.round;
        s.units.push(copy);
        applyStatus(s, actor, 'entranced', { duration: -1 });
        addEvent(s, { kind: 'summon', text: `${actor.name} sews a Voodoo copy of ${target.name}`, actor: actor.uid, to: land });
        return true;
      }
      case 'werewolf.moon_pull': {
        if (actor.form === 'wolf') return fz('already a Wolf');
        if ((actor.data.wolfCooldownUntil ?? 0) >= s.round) return fz('cannot transform yet');
        transformWolf(s, actor, 'Moon Pull');
        return true;
      }
      case 'midas_mummy.midas_touch': {
        const pl = s.players[actor.owner];
        const card = pl.hand.find((c) => c.uid === cmd.target.choice) ?? pl.hand.find((c) => !c.tarnished);
        if (!card || pl.midasUsed) return fz('no card to gild');
        const type = ITEMS[card.itemId]!.type;
        pl.midasUsed = true;
        pl.tarnishedType = type;
        card.midas = true;
        card.tarnished = false;
        (card as any).origItem = card.itemId;
        card.itemId = 'midas_touch_card';
        for (const c of [...pl.hand, ...pl.itemDeck, ...pl.discard]) {
          if (c !== card && ITEMS[c.itemId]?.type === type) c.tarnished = true;
        }
        addEvent(s, { kind: 'ability', text: `Midas Touch: every ${type} card is Tarnished. The Midas Touch card shines.`, actor: actor.uid, privateTo: actor.owner });
        addEvent(s, { kind: 'ability', text: `Midas Touch: the enemy locks the ${type} item type`, actor: actor.uid, privateTo: actor.owner === 0 ? 1 : 0 });
        return true;
      }
      case 'cog_cuckoo.turn_back_time': {
        if (!target || target.owner !== actor.owner) return fz('needs a friendly unit');
        if (distance(actor.pos, target.pos) > 5) return fz('out of range');
        s.turnBackQueue.push(target.uid);
        addEvent(s, { kind: 'ability', text: `${actor.name} winds back time for ${target.name}`, actor: actor.uid, target: target.uid });
        return true;
      }
      case 'zombie_limb.fuse': {
        if (!target || target.owner !== actor.owner || target.defId !== 'zombie_limb' || target === actor) return fz('needs an adjacent Zombie Limb');
        if (distance(actor.pos, target.pos) !== 1) return fz('not adjacent');
        const parts = (actor.data.parts ?? 1) + (target.data.parts ?? 1);
        if (parts > 3) return fz('a Brute cannot fuse further');
        const hpSum = actor.hp + target.hp;
        const cards = [...(actor.data.cardUids ?? (actor.cardUid ? [actor.cardUid] : [])), ...(target.data.cardUids ?? (target.cardUid ? [target.cardUid] : []))];
        // keep the longer duration of each status
        for (const st of target.statuses) {
          const mine = actor.statuses.find((x) => x.id === st.id);
          if (!mine) actor.statuses.push({ ...st });
          else if (st.duration > mine.duration || st.duration < 0) mine.duration = st.duration;
        }
        s.units.splice(s.units.indexOf(target), 1);
        applyZombieForm(actor, parts === 2 ? 'patchwork' : 'brute');
        actor.hp = Math.min(actor.maxHp, hpSum);
        actor.data.parts = parts;
        actor.data.cardUids = cards;
        addEvent(s, { kind: 'ability', text: `Fuse! The limbs become a ${actor.name} (${actor.hp}/${actor.maxHp})`, actor: actor.uid, to: actor.pos });
        return true;
      }
      default:
        void strength;
        return fz('ability has no active effect');
    }
  };
  const ok = run(1);
  if (!ok) return false;
  if (def.ability.oncePerGame) actor.once.push(id);
  if (echo && ok && !def.ability.oncePerGame && id !== 'zombie_limb.fuse') run(0.5);
  return true;
}

let wolfImpl: ((s: GameState, u: Unit, why: string) => void) | null = null;
export function transformWolf(s: GameState, u: Unit, why: string): void {
  if (u.defId !== 'werewolf' || u.form === 'wolf') return;
  if ((u.data.wolfCooldownUntil ?? 0) >= s.round && why === 'auto') return;
  applyWerewolfForm(u, 'wolf');
  u.data.wolfUntil = s.round + 2; // lasts 3 rounds: this one and two more
  addEvent(s, { kind: 'ability', text: `${u.name} becomes a Wolf (${why})!`, actor: u.uid, to: u.pos });
  void wolfImpl;
}

export function revertWolf(s: GameState, u: Unit): void {
  if (u.form !== 'wolf') return;
  applyWerewolfForm(u, 'human');
  u.data.wolfCooldownUntil = s.round + 2;
  applyStatus(s, u, 'exhausted', { duration: 1 });
  addEvent(s, { kind: 'ability', text: `${u.name} returns to Human form, Exhausted`, actor: u.uid });
}

export function speedOf(s: GameState, u: Unit): number {
  return effectiveSpeed(s, u);
}

export { rollPct };
