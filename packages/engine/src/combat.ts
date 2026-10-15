// Section 2 damage pipeline + KO handling, reactions, forced movement.

import { KO_AP, KO_VP, computeDamage, hitChance } from './formulas.ts';
import { directionTo, distance, eq, ring, step, type Hex } from './hex.ts';
import { chance } from './rng.ts';
import {
  addEvent,
  blockerAt,
  bounds,
  charactersOnBoard,
  getUnit,
  isFree,
  other,
  tileAt,
  unitsAt,
} from './state.ts';
import {
  accuracyMods,
  damageMods,
  effectiveAtk,
  effectiveDef,
  getStatus,
  hasChar,
  hasStatus,
  healMult,
  tagMultiplier,
  type HealSource,
} from './stats.ts';
import { applyStatus, removeStatus } from './status.ts';
import { addField, gainSoul, onEnterTile } from './fields.ts';
import type { AttackDef, DamageCalc, DamageTag, GameState, PlayerId, StatusApply, Unit } from './types.ts';
import { triggerTrapsAt } from './traps.ts';

export interface HitOpts {
  attacker: Unit | null;
  target: Unit;
  attack?: AttackDef;
  label: string;
  power: number;
  tag: DamageTag;
  category: 'physical' | 'special';
  area?: boolean;
  /** null/undefined = cannot miss */
  acc?: number | null;
  accBonus?: number;
  crit?: number;
  forceCrit?: boolean;
  defIgnore?: number;
  mods?: [string, number][];
  mult?: number;
  statuses?: StatusApply[];
  hexScroll?: boolean;
  knockback?: number;
  pull?: number;
  /** origin for knockback/pull direction (defaults to attacker position) */
  from?: Hex;
  silencer?: boolean;
  lifesteal?: number;
  /** heal regardless of target type (Snap, Gnaw) */
  lifestealAlways?: boolean;
  atkOverride?: number;
  isRecoil?: boolean;
  /** Executioner's Ledger bonus VP on KO */
  bonusVpOnKo?: number;
  scope?: boolean;
  /** never roll hit (Executioner's Ledger, cannot-miss) */
  noMiss?: boolean;
}

export interface HitResult {
  hit: boolean;
  crit: boolean;
  damage: number;
  ko: boolean;
  calc?: DamageCalc;
}

export function rollPct(s: GameState, pct: number): boolean {
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  if (s.settings.fixedRandom) return pct >= 50;
  return chance(s.rng, pct / 100);
}

export function rollCrit(s: GameState, pct: number, force?: boolean): boolean {
  if (force) return true;
  if (s.settings.fixedRandom) return pct >= 100;
  return pct > 0 && chance(s.rng, Math.min(1, pct / 100));
}

/** Resolve a single damaging hit against one unit (Character-Target or each unit of an area). */
export function resolveHit(s: GameState, o: HitOpts): HitResult {
  const { attacker: att, target } = o;
  if (!s.units.includes(target)) return { hit: false, crit: false, damage: 0, ko: false };
  // hit roll
  if (o.acc !== null && o.acc !== undefined && !o.noMiss) {
    const mods = att ? accuracyMods(s, att, target, { attack: o.attack, scope: o.scope }) : { total: 0, parts: [] };
    const pct = hitChance(o.acc, mods.total + (o.accBonus ?? 0));
    if (!rollPct(s, pct)) {
      addEvent(s, {
        kind: 'miss',
        text: `${att?.name ?? 'Effect'}'s ${o.label} misses ${target.name} (${Math.round(pct)}%)`,
        actor: att?.uid,
        target: target.uid,
        from: att?.pos,
        to: target.pos,
      });
      return { hit: false, crit: false, damage: 0, ko: false };
    }
  }
  const crit = rollCrit(s, o.crit ?? 0, o.forceCrit);
  const tm = tagMultiplier(s, target, { tag: o.tag, category: o.category, area: !!o.area, attack: o.attack });
  const dm = damageMods(s, att, target, { tag: o.tag, category: o.category, area: !!o.area, attack: o.attack, extra: o.mods });
  const atkStat = o.atkOverride ?? (att ? effectiveAtk(att, o.category) : effectiveDef(s, target, o.category));
  const calc = computeDamage({
    power: o.power,
    atk: atkStat,
    def: effectiveDef(s, target, o.category),
    tagProduct: tm.product,
    crit,
    modSum: dm.sum,
    level: att?.level ?? 1,
    defIgnore: o.defIgnore,
    extraMult: o.mult,
  });
  addEvent(s, {
    kind: crit ? 'crit' : 'attack',
    text: `${att?.name ?? 'Effect'} → ${target.name}: ${o.label}${crit ? ' (CRIT)' : ''}`,
    actor: att?.uid,
    target: target.uid,
    from: att?.pos,
    to: target.pos,
    tag: o.tag,
    crit,
    calc,
  });
  const dealt = dealDamage(s, target, calc.final, {
    attacker: att,
    tag: o.tag,
    category: o.category,
    silencer: o.silencer,
    isRecoil: o.isRecoil,
    bonusVpOnKo: o.bonusVpOnKo,
    label: o.label,
    calc,
  });
  // lifesteal
  if (att && dealt.damage > 0 && s.units.includes(att)) {
    let ls = o.lifesteal ?? 0;
    if (o.lifestealAlways) ls += 0.15;
    else if (hasChar(att, 'parasitic') && (target.chars.material === 'organic' || target.chars.existence === 'living')) ls += 0.15;
    if (ls > 0) healUnit(s, att, dealt.damage * ls, 'generic', 'Lifesteal');
  }
  if (!dealt.ko && s.units.includes(target)) {
    for (const st of o.statuses ?? []) {
      applyStatus(s, target, st.id, { chance: st.chance, duration: st.duration, stacks: st.stacks, source: att, hexScroll: o.hexScroll });
    }
    if (o.knockback && att) {
      const from = o.from ?? att.pos;
      forcedMove(s, target, directionTo(from, target.pos), o.knockback, 'knockback', att);
    }
    if (o.pull && att) {
      const from = o.from ?? att.pos;
      forcedMove(s, target, directionTo(target.pos, from), o.pull, 'pull', att);
    }
  }
  return { hit: true, crit, damage: dealt.damage, ko: dealt.ko, calc };
}

export interface DealInfo {
  attacker: Unit | null;
  tag: DamageTag | null;
  category?: 'physical' | 'special';
  silencer?: boolean;
  isRecoil?: boolean;
  bonusVpOnKo?: number;
  label?: string;
  calc?: DamageCalc;
  /** symbiosis share: ignore defenses, no further reactions */
  symbiosis?: boolean;
}

export function dealDamage(s: GameState, target: Unit, amount: number, info: DealInfo): { damage: number; ko: boolean } {
  if (!s.units.includes(target) || amount <= 0) return { damage: 0, ko: false };
  const att = info.attacker;
  let dmg = Math.round(amount);

  // Mirror Charm: next Special hit reduced by 40%, the attacker takes that same amount
  if (info.category === 'special' && att && !info.isRecoil && hasStatus(target, 'mirror_charm')) {
    const reduced = Math.round(dmg * 0.4 * (target.data.mirrorAffinity ? 1.25 : 1));
    dmg -= reduced;
    removeStatus(s, target, 'mirror_charm', true);
    addEvent(s, { kind: 'item', text: `Mirror Charm reflects ${reduced} to ${att.name}`, target: att.uid, amount: reduced });
    dealDamage(s, att, reduced, { attacker: target, tag: null, isRecoil: true, label: 'Mirror Charm' });
  }
  // Telepathic Symbiosis: linked unit takes 25% less, Mycel takes the removed 25% ignoring defenses
  if (!info.symbiosis && !info.silencer && target.data.symbiosisWith) {
    const mycel = getUnit(s, target.data.symbiosisWith);
    if (mycel && mycel.uid !== target.uid) {
      const share = Math.round(dmg * 0.25);
      if (share > 0) {
        dmg -= share;
        addEvent(s, { kind: 'ability', text: `Symbiosis: ${mycel.name} takes ${share} for ${target.name}`, actor: mycel.uid, target: target.uid });
        dealDamage(s, mycel, share, { attacker: att, tag: null, symbiosis: true, label: 'Symbiosis' });
      }
    }
  }
  // Shield absorbs first
  if (target.shield && target.shield.amount > 0) {
    const absorbed = Math.min(target.shield.amount, dmg);
    target.shield.amount -= absorbed;
    dmg -= absorbed;
    addEvent(s, { kind: 'damage', text: `${target.name}'s Shield absorbs ${absorbed}`, target: target.uid, amount: absorbed });
    if (target.shield.amount <= 0) target.shield = null;
  }
  if (target.rt.hold) target.rt.firstHitTaken = true;
  target.rt.firstHitTaken = true;
  if (dmg <= 0) return { damage: 0, ko: false };

  target.hp -= dmg;
  if (att && att.owner !== target.owner) {
    s.stats.damageDealt[att.owner] += dmg;
    s.stats.damageByChar[att.defId] = (s.stats.damageByChar[att.defId] ?? 0) + dmg;
  }
  addEvent(s, {
    kind: 'damage',
    text: `${target.name} takes ${dmg}${info.label ? ` (${info.label})` : ''}`,
    target: target.uid,
    actor: att?.uid,
    amount: dmg,
    tag: info.tag ?? undefined,
    calc: info.calc,
  });
  if (hasStatus(target, 'hidden')) revealHidden(s, target, 'took damage');

  // reactions (not for recoil/symbiosis, Silencer suppresses them)
  if (att && att !== target && !info.isRecoil && !info.symbiosis && !info.silencer && s.units.includes(att)) {
    const d = distance(att.pos, target.pos);
    if (target.defId === 'steak' && (d === 1 || d === 2) && att.owner !== target.owner) {
      const recoil = Math.min(60, Math.round(dmg * (d === 1 ? 0.3 : 0.2)));
      if (recoil > 0) {
        addEvent(s, { kind: 'ability', text: `Fake Steak recoil: ${att.name} takes ${recoil}`, actor: target.uid, target: att.uid });
        dealDamage(s, att, recoil, { attacker: target, tag: null, isRecoil: true, label: 'Fake Steak' });
      }
    }
    if (target.defId === 'arachnia' && target.rt.moved < 2 && att.owner !== target.owner && d <= 4 && s.units.includes(att)) {
      applyStatus(s, att, 'poison', { chance: 1 / (1 + target.rt.moved), source: target });
    }
  }
  if (att && !info.isRecoil) {
    const mark = getStatus(target, 'starving_mark');
    if (mark && mark.sourceOwner === att.owner && att.defId !== 'little_wendigo' && !att.isSummon) {
      const pl = s.players[att.owner];
      if (pl.feastThisRound < 2) {
        pl.feastThisRound++;
        pl.queuedAp += 1;
        pl.queuedApNotes.push('Feast AP');
        addEvent(s, { kind: 'ap', text: `Starving Mark: +1 Feast AP banked for ${pl.name}`, owner: att.owner });
      }
    }
  }
  if (info.tag === 'electric' && target.defId === 'frankenstein') {
    import_gainCharge(s, target);
  }
  if ((info.tag === 'fire' || info.tag === 'acid') && hasChar(target, 'regenerative')) {
    applyStatus(s, target, 'regen_paused', { duration: 1, silent: true });
  }
  if (info.tag === 'fire') target.rt.damagedByFireOrAcid = true;
  if (info.tag === 'fire' && target.chars.material === 'gas') applyStatus(s, target, 'burn');

  if (target.hp <= 0 && s.settings.protectOwner === target.owner && !target.isSummon && !target.isObject) {
    // Testing Chambers: the Warden never lets the subject die, so every lesson stays possible
    target.hp = 1;
    addEvent(s, { kind: 'info', text: `The Warden pulls ${target.name} back from the brink (1 HP)`, target: target.uid });
  }
  if (target.hp <= 0) {
    koUnit(s, target, att, { bonusVp: info.bonusVpOnKo });
    return { damage: dmg, ko: true };
  }
  // Werewolf: automatic transformation at 40% HP or lower
  if (target.defId === 'werewolf' && target.form === 'human' && target.hp <= target.maxHp * 0.4) {
    import_wolf(s, target, 'auto');
  }
  return { damage: dmg, ko: false };
}

// small indirections to avoid import cycles at module-evaluation time
function import_gainCharge(s: GameState, u: Unit) {
  const key = `charge_hit_${s.round}`;
  if (u.data[key]) return;
  u.data[key] = true;
  u.counters.charges = Math.min(3, (u.counters.charges ?? 0) + 1);
  addEvent(s, { kind: 'ability', text: `${u.name} gains a Static Charge (${u.counters.charges}/3)`, actor: u.uid });
}

let wolfHook: ((s: GameState, u: Unit, why: string) => void) | null = null;
export function registerWolfHook(fn: (s: GameState, u: Unit, why: string) => void) {
  wolfHook = fn;
}
function import_wolf(s: GameState, u: Unit, why: string) {
  wolfHook?.(s, u, why);
}

export interface AreaOpts {
  power: number;
  tag: DamageTag;
  category: 'physical' | 'special';
  label: string;
  /** hits friends too (default true – "friend and foe") */
  friendly?: boolean;
  enemiesOnly?: boolean;
  crit?: number;
  statuses?: StatusApply[];
  mods?: [string, number][];
  mult?: number;
  hexScroll?: boolean;
  knockback?: number;
  from?: Hex;
  silencer?: boolean;
  exclude?: string[];
  onlyUnit?: string;
  atkOverride?: number;
  attack?: AttackDef;
  /** damage walls on the tiles */
  hitsWalls?: boolean;
  /** per-unit power override */
  powerFor?: (u: Unit) => number;
  area?: boolean;
}

/** Area/Field damage: cannot miss, hits every unit on the tiles. */
export function areaDamage(s: GameState, att: Unit | null, tiles: Hex[], o: AreaOpts): HitResult[] {
  const out: HitResult[] = [];
  const seen = new Set<string>();
  for (const h of tiles) {
    // a field attack on a trap tile destroys the trap without effect
    const trapIdx = s.traps.findIndex((t) => eq(t.pos, h) && (!att || t.owner !== att.owner));
    if (trapIdx >= 0) {
      const tr = s.traps[trapIdx]!;
      s.traps.splice(trapIdx, 1);
      addEvent(s, { kind: 'trap', text: 'A hidden trap is destroyed', tiles: [h], privateTo: tr.owner });
    }
    if (o.hitsWalls !== false) {
      const t = tileAt(s, h);
      if (t?.wall && att) damageWall(s, h, att, o.power, o.category, o.tag);
    }
    for (const u of unitsAt(s, h)) {
      if (seen.has(u.uid)) continue;
      seen.add(u.uid);
      if (o.onlyUnit && u.uid !== o.onlyUnit) continue;
      if (o.exclude?.includes(u.uid)) continue;
      if (att && o.enemiesOnly && u.owner === att.owner) continue;
      if (att && o.friendly === false && u.owner === att.owner) continue;
      out.push(
        resolveHit(s, {
          attacker: att,
          target: u,
          label: o.label,
          power: o.powerFor ? o.powerFor(u) : o.power,
          tag: o.tag,
          category: o.category,
          area: o.area ?? true,
          acc: null,
          crit: o.crit,
          statuses: o.statuses,
          mods: o.mods,
          mult: o.mult,
          hexScroll: o.hexScroll,
          knockback: o.knockback,
          from: o.from,
          silencer: o.silencer,
          atkOverride: o.atkOverride,
          attack: o.attack,
        }),
      );
    }
  }
  return out;
}

export function damageWall(s: GameState, h: Hex, att: Unit, power: number, category: 'physical' | 'special', tag: DamageTag): void {
  const t = tileAt(s, h);
  if (!t?.wall) return;
  const calc = computeDamage({ power, atk: effectiveAtk(att, category), def: 60, tagProduct: 1, crit: false, modSum: 0, level: att.level });
  t.wall.hp -= calc.final;
  addEvent(s, { kind: 'damage', text: `Wall takes ${calc.final}`, tiles: [h], amount: calc.final, tag });
  if (t.wall.hp <= 0) destroyWall(s, h);
}

export function destroyWall(s: GameState, h: Hex, source?: Unit): void {
  const t = tileAt(s, h);
  if (!t?.wall) return;
  t.wall = null;
  addEvent(s, { kind: 'field', text: 'A wall collapses into an Acid Field', tiles: [h], field: 'acid' });
  addField(s, h, 'acid', { duration: 3, owner: source?.owner, silent: true, noCombo: true });
}

/** Percentage-of-max-HP damage from fields, statuses, collisions. Tag multipliers apply; tag null = true damage. */
export function fieldTickDamage(s: GameState, u: Unit, pct: number, tag: DamageTag | null, label: string, attacker: Unit | null = null): number {
  if (!s.units.includes(u)) return 0;
  let amount = u.maxHp * pct;
  if (tag) amount *= tagMultiplier(s, u, { tag, category: 'special', area: false, fieldDamage: true }).product;
  amount = Math.max(1, Math.round(amount));
  return dealDamage(s, u, amount, { attacker, tag, label, isRecoil: true }).damage;
}

export function healUnit(s: GameState, u: Unit, amount: number, source: HealSource, label: string): number {
  if (!s.units.includes(u) || u.isObject) return 0;
  const mult = healMult(u, source);
  const missing = u.maxHp - u.hp;
  const healed = Math.max(0, Math.min(missing, Math.round(amount * mult)));
  if (healed <= 0) return 0;
  u.hp += healed;
  addEvent(s, { kind: 'heal', text: `${u.name} heals ${healed} (${label})`, target: u.uid, amount: healed });
  return healed;
}

export function revealHidden(s: GameState, u: Unit, why: string): void {
  if (removeStatus(s, u, 'hidden', true)) {
    addEvent(s, { kind: 'info', text: `${u.name} is revealed (${why})`, target: u.uid, to: u.pos });
  }
}

// ---------------------------------------------------------------- KO

export interface KoOpts {
  bonusVp?: number;
  silent?: boolean;
  /** removal without rewards (Evacuation, vanished heads, copy dispelled) */
  noReward?: boolean;
}

function koTierKey(u: Unit): string {
  if (u.defId === 'zombie_limb') return u.form === 'brute' ? 'brute' : u.form === 'patchwork' ? 'patchwork' : 'swarm';
  return u.tier;
}

export function awardVp(s: GameState, p: PlayerId, vp: number, why: string): void {
  if (!vp) return;
  s.players[p].vp += vp;
  addEvent(s, { kind: 'vp', text: `${s.players[p].name} +${vp} VP (${why})`, owner: p, amount: vp });
}

export function koUnit(s: GameState, u: Unit, killer: Unit | null, opts: KoOpts = {}): void {
  const idx = s.units.indexOf(u);
  if (idx < 0) return;
  // Volatile: explode before removal (uses its own SAtk)
  const volatile = hasChar(u, 'volatile') && !u.isObject;
  const pos = { ...u.pos };
  s.units.splice(idx, 1);
  u.koAt = s.round;
  u.hp = 0;
  const enemy = other(u.owner);
  if (!opts.silent) addEvent(s, { kind: 'ko', text: `${u.name} is KO'd${killer ? ` by ${killer.name}` : ''}`, target: u.uid, actor: killer?.uid, to: pos, owner: u.owner });

  const isChar = !u.isSummon && !u.isObject && !u.dummy;
  if (isChar && !opts.noReward) {
    s.koThisRound.push({ uid: u.uid, owner: u.owner, pos, tier: koTierKey(u), defId: u.defId });
    s.graveyard.push(u);
    const pl = s.players[u.owner];
    pl.allyKoThisRound = true;
    const cards: string[] = u.data.cardUids ?? (u.cardUid ? [u.cardUid] : []);
    for (const c of cards) if (!pl.koCards.includes(c)) pl.koCards.push(c);
    pl.koCount = pl.koCards.length;
    s.stats.kos[enemy]++;
    if (!u.data.hatched) {
      const tk = koTierKey(u);
      awardVp(s, enemy, KO_VP[tk] ?? 10, `KO ${u.name}`);
      s.players[enemy].queuedAp += KO_AP[tk] ?? 10;
      s.players[enemy].queuedApNotes.push(`KO ${u.name}`);
    }
    if (hasChar(u, 'greedy')) awardVp(s, enemy, 3, 'Greedy');
    if (hasStatus(u, 'gilded')) {
      awardVp(s, enemy, 5, 'Gilded bounty');
      s.players[enemy].queuedAp += 3;
    }
    if (u.gear === 'lucky_coin') awardVp(s, enemy, 2, 'Lucky Coin');
    if (opts.bonusVp) awardVp(s, enemy, opts.bonusVp, "Executioner's Ledger");
    if (killer && hasChar(killer, 'greedy') && killer.owner !== u.owner) {
      s.players[killer.owner].queuedAp += 1;
      s.players[killer.owner].queuedApNotes.push('Greedy');
    }
    // Pumpkin Trade
    if (u.defId === 'pumpkin' && s.round - u.deployedRound >= 2) {
      s.players[u.owner].queuedAp += 2;
      s.players[enemy].apPenaltyNext += 2;
      addEvent(s, { kind: 'ability', text: 'Trade: +2 AP for the owner, −2 AP for the enemy next round', owner: u.owner });
    }
    // Revival (Garland / Phoenix Feather) – the enemy keeps the KO reward
    const garland = hasStatus(u, 'garland');
    const phoenix = hasStatus(u, 'phoenix');
    if ((garland || phoenix) && !u.revived && u.tier !== 'boss') {
      s.pendingRevives.push({ unit: u, round: s.round + 1, hpPct: garland ? 0.3 : 0.4 });
      addEvent(s, { kind: 'revive', text: `${u.name} will return next round (${garland ? 'Garland' : 'Phoenix Feather'})`, target: u.uid, to: pos });
    }
  } else if (u.isSummon || u.isObject) {
    s.koThisRound.push({ uid: u.uid, owner: u.owner, pos, tier: 'summon', defId: u.defId });
  }

  // ---- character specific KO effects
  if (u.defId === 'baby_mummy' && killer && s.units.includes(killer)) {
    applyStatus(s, killer, 'jinx', { duration: 2, source: u });
  }
  if (u.defId === 'baby_mummy') addField(s, pos, 'bandage', { duration: 2, owner: u.owner });
  if (u.defId === 'nexus') {
    for (const t of s.tiles) t.fields = t.fields.filter((f) => !(f.id === 'corrupted' && f.data?.nexus === u.uid));
    for (const o of s.units) {
      const c = getStatus(o, 'corruption');
      if (c && c.source === u.uid) removeStatus(s, o, 'corruption');
    }
  }
  if (u.defId === 'shrink_heads' || u.defId === 'mambo' || u.defId === 'wisp') {
    for (const o of [...s.units]) {
      if (o.master === u.uid && (o.defId === 'shrink_head' || o.data.voodoo || o.defId === 'candle')) {
        koUnit(s, o, null, { noReward: true, silent: false });
      }
    }
  }
  if (u.data.voodoo) {
    const mambo = getUnit(s, u.master);
    if (mambo) {
      removeStatus(s, mambo, 'entranced');
      if (killer && killer.owner !== u.owner && !u.data.painLinked) {
        addEvent(s, { kind: 'ability', text: `Voodoo backlash: ${mambo.name} takes 20% max HP`, target: mambo.uid });
        dealDamage(s, mambo, Math.round(mambo.maxHp * 0.2), { attacker: null, tag: null, isRecoil: true, label: 'Backlash' });
      }
    }
  }
  if (u.defId === 'mud_decoy') {
    addEvent(s, { kind: 'ability', text: 'The Mud Decoy bursts', tiles: ring(pos, 1, bounds(s)) });
    const siren = getUnit(s, u.master);
    areaDamage(s, siren ?? null, ring(pos, 1, bounds(s)), { power: 55, tag: 'blunt', category: 'physical', label: 'Mud burst', atkOverride: siren ? undefined : 50 });
  }
  if (u.defId === 'cooking_pot') {
    const cook = getUnit(s, u.master);
    if (cook) cook.counters.broth = 0;
    for (const h of ring(pos, 1, bounds(s))) addField(s, h, 'scalded', { duration: 2, owner: u.owner, silent: true });
    addEvent(s, { kind: 'field', text: 'The Cooking Pot spills: Scalded Fields', tiles: ring(pos, 1, bounds(s)), field: 'scalded' });
  }
  if (killer && killer.defId === 'crystal_eye' && killer.owner !== u.owner && isChar) {
    addField(s, pos, 'portal', { duration: 3, owner: killer.owner, data: { eye: killer.uid } });
  }
  if (u.data.miasmaBy && hasStatus(u, 'poison')) {
    const vile = getUnit(s, u.data.miasmaBy);
    if (vile && isFree(s, pos)) {
      vile.pos = { ...pos };
      addEvent(s, { kind: 'ability', text: `${vile.name} teleports onto the corpse and erupts`, actor: vile.uid, to: pos });
      areaDamage(s, vile, ring(pos, 1, bounds(s)), { power: 35, tag: 'toxic', category: 'special', label: 'Miasma eruption' });
    }
  }
  // Calaca Soul Collector / Marigold / Cruorina Blood Drain / Wendigo Insatiable / Hive Mind dazed
  const onMarigold = tileAt(s, pos)?.fields.some((f) => f.id === 'marigold');
  for (const o of [...s.units]) {
    if (!s.units.includes(o)) continue;
    const d = distance(o.pos, pos);
    if (o.defId === 'calaca' && isChar) {
      if (d <= 4) gainSoul(s, o, `${u.name} fell nearby`);
      if (killer === o && hasStatus(u, 'burn')) gainSoul(s, o, 'burning KO');
      if (onMarigold) gainSoul(s, o, 'KO on Marigold');
    }
    if (o.defId === 'cruorina' && d <= 1 && o.owner !== u.owner && !u.isObject) {
      healUnit(s, o, u.maxHp * 0.15, 'generic', 'Blood Drain');
    }
    if (hasChar(o, 'insatiable') && d <= 3) healUnit(s, o, o.maxHp * 0.1, 'generic', 'Insatiable');
    if (hasChar(u, 'hive_mind') && hasChar(o, 'hive_mind') && o.owner === u.owner && !u.isSummon) {
      applyStatus(s, o, 'dazed', { duration: 1 });
    }
  }
  if (volatile) {
    addEvent(s, { kind: 'ability', text: `${u.name} explodes (Volatile)!`, tiles: ring(pos, 1, bounds(s)) });
    const ghost = { ...u, pos } as Unit;
    areaDamage(s, ghost, ring(pos, 1, bounds(s)), { power: 60, tag: 'fire', category: 'special', label: 'Volatile explosion' });
  }
  u.gear = null;
  void charactersOnBoard;
}

// ---------------------------------------------------------------- forced movement

function immuneToForced(u: Unit, by: Unit | null): boolean {
  if (!by || by.owner === u.owner) return false;
  return hasChar(u, 'rooted') || u.gear === 'lead_boots' || u.isObject;
}

/** Knockback / Pull along a direction. Blocked: moved unit takes 8% max HP (Blunt), blocker 4%. */
export function forcedMove(s: GameState, u: Unit, dir: number, dist: number, kind: 'knockback' | 'pull', by: Unit | null): void {
  if (!s.units.includes(u)) return;
  if (immuneToForced(u, by)) {
    addEvent(s, { kind: 'info', text: `${u.name} resists the ${kind}`, target: u.uid });
    return;
  }
  let n = dist;
  if (hasChar(u, 'gas')) n -= 1;
  if (kind === 'knockback' && hasChar(u, 'airborne')) n += 1;
  if (u.rt.hold && !u.rt.forcedMoveIgnored) {
    u.rt.forcedMoveIgnored = true;
    n -= 1;
  }
  if (n <= 0) return;
  const from = { ...u.pos };
  for (let i = 0; i < n; i++) {
    const next = step(u.pos, dir);
    const t = tileAt(s, next);
    const blocker = t ? blockerAt(s, next) : undefined;
    if (!t || t.wall || (blocker && blocker !== u)) {
      const noCollision = hasChar(u, 'spectral') || hasChar(u, 'phasing');
      addEvent(s, { kind: 'info', text: `${u.name} is slammed into ${blocker ? blocker.name : 'an obstacle'}`, target: u.uid, to: u.pos });
      if (!noCollision) fieldTickDamage(s, u, 0.08, 'blunt', 'Collision', by);
      if (blocker && !hasChar(blocker, 'spectral')) fieldTickDamage(s, blocker, 0.04, 'blunt', 'Collision', by);
      else if (t?.wall && by) {
        t.wall.hp -= Math.round(t.wall.maxHp * 0.04);
        if (t.wall.hp <= 0) destroyWall(s, next);
      }
      break;
    }
    u.pos = next;
    onEnterTile(s, u, next);
    triggerTrapsAt(s, u, next);
    triggerBombAt(s, u, next);
    if (!s.units.includes(u)) return;
  }
  if (!eq(from, u.pos)) addEvent(s, { kind: 'move', text: `${u.name} is ${kind === 'pull' ? 'pulled' : 'knocked back'}`, target: u.uid, from, to: { ...u.pos } });
}

export function canBeRelocatedBy(u: Unit, by: Unit | null): boolean {
  return !immuneToForced(u, by);
}

export function teleportUnit(s: GameState, u: Unit, dest: Hex, by: Unit | null, label = 'teleports'): boolean {
  if (!s.units.includes(u)) return false;
  if (by && by !== u && immuneToForced(u, by)) return false;
  const t = tileAt(s, dest);
  if (!t || t.wall) return false;
  const bl = blockerAt(s, dest);
  if (bl && bl !== u && u.blocks) return false;
  const from = { ...u.pos };
  u.pos = { ...dest };
  addEvent(s, { kind: 'move', text: `${u.name} ${label}`, target: u.uid, from, to: { ...dest } });
  onEnterTile(s, u, dest);
  triggerTrapsAt(s, u, dest);
  triggerBombAt(s, u, dest);
  return true;
}

export function swapUnits(s: GameState, a: Unit, b: Unit, by: Unit | null): boolean {
  if (by && (immuneToForced(a, by) || immuneToForced(b, by))) return false;
  const pa = { ...a.pos };
  const pb = { ...b.pos };
  a.pos = pb;
  b.pos = pa;
  addEvent(s, { kind: 'move', text: `${a.name} and ${b.name} swap places`, target: a.uid, from: pa, to: pb });
  return true;
}

/** Crystal Bomb detonates when an enemy enters its tile: Star-2 (or upgraded), Radiant. */
export function triggerBombAt(s: GameState, u: Unit, h: Hex): void {
  const t = tileAt(s, h);
  if (!t) return;
  const bomb = t.fields.find((f) => f.id === 'crystal_bomb');
  if (!bomb || bomb.owner === u.owner) return;
  t.fields = t.fields.filter((f) => f !== bomb);
  const eye = getUnit(s, bomb.data?.eye as string | undefined);
  const arm = Number(bomb.data?.arm ?? 2);
  const power = Number(bomb.data?.power ?? 70);
  const tiles = starTiles(s, h, arm);
  addEvent(s, { kind: 'field', text: 'A Crystal Bomb detonates!', tiles, field: 'crystal_bomb' });
  areaDamage(s, eye ?? null, tiles, { power, tag: 'radiant', category: 'special', label: 'Crystal Bomb', atkOverride: eye ? undefined : 100 });
}

function starTiles(s: GameState, h: Hex, arm: number): Hex[] {
  const out: Hex[] = [h];
  for (let d = 0; d < 6; d++) {
    for (let i = 1; i <= arm; i++) {
      const x = step(h, d, i);
      if (tileAt(s, x)) out.push(x);
    }
  }
  return out;
}

export { starTiles };
