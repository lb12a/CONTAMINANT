// Round loop (section 1): start of round → planning → resolution (Priority → Speed) → end phase → win check.

import { CHARACTERS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { STATUSES } from './data/statuses.ts';
import { baseAp, capAp, nextIdleBonus, randomApFromRoll, vacancyTax } from './formulas.ts';
import { distance, eq, neighbors, step, type Hex } from './hex.ts';
import { inDeployZone } from './map.ts';
import { hashString, makeRng, pick, rand, randInt, shuffle } from './rng.ts';
import {
  addEvent,
  bounds,
  charactersOnBoard,
  createSummon,
  createUnitFromCard,
  drawItem,
  freshRound,
  getUnit,
  isFree,
  other,
  tileAt,
} from './state.ts';
import { effectiveSpeed, getStatus, hasChar, hasStatus, hpPct, onMoonlit } from './stats.ts';
import { applyStatus, removeStatus, tickDurations } from './status.ts';
import { addField, fieldEffects, fieldHealing, fieldUpkeep, getField } from './fields.ts';
import { areaDamage, awardVp, dealDamage, fieldTickDamage, healUnit, koUnit, registerWolfHook, revealHidden, rollPct } from './combat.ts';
import { executeMove, afterMoveStop } from './movement.ts';
import { attackDefFor, buildCtx, executeAbility, executeAttack, revertWolf, transformWolf, type SchedulerHooks } from './actions.ts';
import { discardFromHand, giveShield, rerollOffer, resolveItem } from './itemfx.ts';
import { expireTraps } from './traps.ts';
import { commandPriority, validatePlan } from './planning.ts';
import type { Command, GameEvent, GameState, ItemCard, Plan, PlayerId, StatusId, Unit } from './types.ts';

registerWolfHook((s, u, why) => transformWolf(s, u, why));

// ---------------------------------------------------------------- start of round

export function startRound(s: GameState): void {
  s.round++;
  s.phase = 'planning';
  s.koLastRound = s.koThisRound.filter((k) => k.tier !== 'summon').length;
  s.koThisRound = [];
  addEvent(s, { kind: 'round', text: `Round ${s.round}${s.round % 5 === 0 ? ' — Full Moon' : ''}` });

  for (const pl of s.players) {
    pl.feastThisRound = 0;
    pl.cardsPlayedThisRound = 0;
    pl.freeCardsThisRound = 0;
    pl.itemNamesThisRound = [];
    pl.apSpentThisRound = 0;
    pl.allyKoLastRound = pl.allyKoThisRound;
    pl.allyKoThisRound = false;
    pl.watchTarget = null;
  }

  // Garland / Phoenix revivals return at the start of the next round on the same tile
  const due = s.pendingRevives.filter((r) => r.round <= s.round);
  s.pendingRevives = s.pendingRevives.filter((r) => r.round > s.round);
  for (const r of due) {
    const u = r.unit;
    let tile: Hex | undefined = isFree(s, u.pos) ? u.pos : neighbors(u.pos, bounds(s)).find((h) => isFree(s, h));
    if (!tile) continue;
    u.pos = { ...tile };
    u.hp = Math.max(1, Math.round(u.maxHp * r.hpPct));
    u.statuses = [];
    u.revived = true;
    u.rt = freshRound(u);
    s.units.push(u);
    s.graveyard = s.graveyard.filter((g) => g !== u);
    const pl = s.players[u.owner];
    const cards: string[] = u.data.cardUids ?? (u.cardUid ? [u.cardUid] : []);
    pl.koCards = pl.koCards.filter((c) => !cards.includes(c));
    pl.koCount = pl.koCards.length;
    addEvent(s, { kind: 'revive', text: `${u.name} returns with ${u.hp} HP`, target: u.uid, to: tile });
  }

  // AP: Base + Random + Idle Bonus + queued (KO/Trade/Feast/Greedy) + Lucky Coin − penalties, cap 30
  for (const pl of s.players) {
    const base = baseAp(s.round);
    const rnd = s.settings.fixedRandom ? 0 : randomApFromRoll(s.round, rand(s.rng));
    const lucky = s.units.filter((u) => u.owner === pl.id && u.gear === 'lucky_coin').length;
    const total = base + rnd + pl.idleBonus + pl.queuedAp + lucky - pl.apPenaltyNext;
    pl.ap = capAp(total);
    pl.apThisRound = pl.ap;
    addEvent(s, {
      kind: 'ap',
      text: `${pl.name}: ${pl.ap} AP (base ${base}, random +${rnd}, idle +${pl.idleBonus}, queued +${pl.queuedAp}${lucky ? `, Lucky Coin +${lucky}` : ''}${pl.apPenaltyNext ? `, −${pl.apPenaltyNext}` : ''})`,
      owner: pl.id,
      privateTo: pl.id,
      amount: pl.ap,
    });
    pl.queuedAp = 0;
    pl.queuedApNotes = [];
    pl.apPenaltyNext = 0;
    drawItem(s, pl.id);
    rerollOffer(s, pl.id, true);
  }

  // units: fresh round state, speed roll, start-of-round triggers
  for (const u of [...s.units]) {
    u.rt = freshRound(u);
    u.speedRoll = s.settings.fixedRandom ? 0 : randInt(s.rng, -6, 6) / 100;
    u.speedShift = 0;
    if (u.shield && u.shield.untilRound < s.round) u.shield = null;
    if (u.gear === 'aegis_plate') giveShield(u, Math.round(50 * (u.data.aegisAffinity ?? 1) * (hasChar(u, 'feral') ? 0.5 : 1)), s.round);
    // Regenerative +4% (paused after Fire/Acid, switched off by Radiation); Wisp Candle (higher applies)
    let regen = 0;
    if (hasChar(u, 'regenerative') && !hasStatus(u, 'regen_paused') && !getField(s, u.pos, 'radiation')) regen = 0.04;
    if (u.defId === 'wisp' && !u.data.voodoo) {
      const candle = getUnit(s, u.data.candle);
      if (candle) {
        const d = distance(candle.pos, u.pos);
        regen = Math.max(regen, d <= 3 ? 0.2 : d <= 6 ? 0.15 : 0.1);
      }
    }
    if (regen > 0) healUnit(s, u, u.maxHp * regen, 'generic', u.defId === 'wisp' ? 'Candle' : 'Regenerative');
    // hidden: revealed after 2 rounds (Darkness keeps them hidden)
    if (hasStatus(u, 'hidden') && u.data.hiddenSince !== undefined && s.round - u.data.hiddenSince >= 2 && !getField(s, u.pos, 'darkness')) {
      revealHidden(s, u, '2 rounds passed');
    }
    // Werewolf: wolf form lasts 3 rounds
    if (u.defId === 'werewolf' && u.form === 'wolf' && s.round > (u.data.wolfUntil ?? 0)) revertWolf(s, u);
    // Mini Arachnia grows into a full Arachnia after 3 rounds
    if (u.defId === 'mini_arachnia' && u.data.growAt !== undefined && s.round >= u.data.growAt) growMini(s, u);
  }
  // Telepathic Symbiosis
  for (const m of s.units.filter((u) => u.defId === 'mycel' && !u.data.voodoo)) linkSymbiosis(s, m);
  // Famine Aura: enemies within 2 of a Little Wendigo pay +1 AP for their first attack
  for (const w of s.units.filter((u) => u.defId === 'little_wendigo')) {
    for (const e of s.units) if (e.owner !== w.owner && distance(e.pos, w.pos) <= 2) e.rt.famine = true;
  }
  // snapshot for Turn Back Time
  s.roundStart = {};
  for (const u of s.units) s.roundStart[u.uid] = { pos: { ...u.pos }, hp: u.hp, statuses: u.statuses.map((x) => x.id) };
  s.turnBackQueue = [];
}

function linkSymbiosis(s: GameState, mycel: Unit): void {
  for (const u of s.units) if (u.data.symbiosisWith === mycel.uid) delete u.data.symbiosisWith;
  const cands = s.units
    .filter((u) => u.owner === mycel.owner && u !== mycel && !u.isObject && distance(u.pos, mycel.pos) <= 3)
    .sort((a, b) => b.maxHp - a.maxHp || a.deployedRound - b.deployedRound || a.uid.localeCompare(b.uid));
  const t = cands[0];
  mycel.data.symbiosisPartner = t?.uid;
  if (t) {
    t.data.symbiosisWith = mycel.uid;
    addEvent(s, { kind: 'ability', text: `Symbiosis: ${mycel.name} links to ${t.name}`, actor: mycel.uid, target: t.uid });
  }
}

function growMini(s: GameState, mini: Unit): void {
  const def = CHARACTERS.arachnia!;
  mini.defId = 'arachnia';
  mini.name = 'Arachnia (hatched)';
  mini.tier = 'standard';
  mini.isSummon = false;
  const pct = hpPct(mini);
  mini.maxHp = def.stats.hp;
  mini.baseMaxHp = def.stats.hp;
  mini.hp = Math.max(1, Math.round(def.stats.hp * pct));
  mini.stats = { patk: def.stats.patk, pdef: def.stats.pdef, satk: def.stats.satk, sdef: def.stats.sdef, speed: def.stats.speed };
  mini.chars = { ...def.chars };
  mini.baseChars = { ...def.chars };
  mini.data.hatched = true;
  addEvent(s, { kind: 'summon', text: 'The Mini Arachnia grows into a full Arachnia', actor: mini.uid, to: mini.pos });
}

/** Nexus Corrupt: deterministic candidate tiles for re-roll index 0..3 (client preview == server result). */
export function nexusCorruptTiles(s: GameState, p: PlayerId, cardUid: string, reroll: number): Hex[] {
  const rng = makeRng(hashString(`${s.seed}:${s.round}:${cardUid}:corrupt:${reroll}`));
  const enemySide = s.players[other(p)].side;
  const cands = s.tiles
    .filter((t) => !t.wall && !t.objective && !inDeployZone(t, enemySide, bounds(s)) && !t.fields.some((f) => f.id === 'corrupted'))
    .map((t) => ({ c: t.c, r: t.r }));
  return shuffle(rng, cands).slice(0, 3);
}

// ---------------------------------------------------------------- resolution

interface Action {
  cmd: Command;
  cost: number;
  player: PlayerId;
  unit?: string;
  priority: number;
  index: number;
}

interface Stream {
  key: string;
  player: PlayerId;
  unit?: string;
  actions: Action[];
  waited: boolean;
  firstDone: boolean;
}

export interface RoundResult {
  events: GameEvent[];
  winner: PlayerId | 'draw' | null;
}

export function resolveRound(s: GameState, rawPlans: [Plan, Plan]): RoundResult {
  const firstEvent = s.events.length;
  s.phase = 'resolution';
  addEvent(s, { kind: 'round', text: `Resolution of round ${s.round}` });
  const checks = rawPlans.map((p) => validatePlan(s, p));
  const plans = checks.map((c) => c.plan) as [Plan, Plan];
  checks.forEach((c, i) => {
    for (const iss of c.issues) addEvent(s, { kind: 'info', text: `Invalid command dropped: ${iss.error}`, privateTo: i as PlayerId });
  });

  // pay AP, move played cards to the discard pile, set round flags
  const pending: { p: PlayerId; card: ItemCard; cmd: Command }[] = [];
  for (const [i, plan] of plans.entries()) {
    const p = i as PlayerId;
    const pl = s.players[p];
    pl.ap -= checks[i]!.cost;
    pl.apSpentThisRound += checks[i]!.cost;
    for (const cmd of plan.commands) {
      const cardUid = cmd.kind === 'item' ? cmd.card : cmd.kind === 'attack' || cmd.kind === 'ability' ? cmd.item : undefined;
      if (!cardUid) continue;
      const card = discardFromHand(s, p, cardUid);
      if (!card) continue;
      if (card.itemId === 'midas_touch_card') card.tarnished = true;
      pl.cardsPlayedThisRound++;
      if (ITEMS[card.itemId]!.cost === 0) pl.freeCardsThisRound++;
      pl.itemNamesThisRound.push(ITEMS[card.itemId]!.name);
      pending.push({ p, card, cmd });
      if (cmd.kind === 'item' && (card.itemId === 'mirror_charm' || card.itemId === 'reroll_ticket') && cmd.target.choice) discardFromHand(s, p, cmd.target.choice);
    }
    for (const uid of plan.rest) {
      const u = getUnit(s, uid);
      if (u) u.rt.rest = true;
    }
    for (const [uid, v] of Object.entries(plan.speedShift ?? {})) {
      const u = getUnit(s, uid);
      if (u) u.speedShift = v;
    }
    if (plan.watch) pl.watchTarget = plan.watch;
    for (const cmd of plan.commands) {
      if (cmd.kind === 'hold') {
        const u = getUnit(s, cmd.unit);
        if (u) u.rt.hold = true;
      }
      if (cmd.kind === 'move') {
        const u = getUnit(s, cmd.unit);
        if (u) u.rt.plannedMove = true;
      }
      if ('unit' in cmd) {
        const u = getUnit(s, cmd.unit);
        if (u && cmd.kind !== 'hold' && cmd.kind !== 'wait') u.rt.plannedActions++;
      }
    }
  }

  // Priority +4: deployments of both players reveal together
  const deploys = plans.flatMap((plan, i) => plan.commands.filter((c) => c.kind === 'deploy').map((c) => ({ p: i as PlayerId, cmd: c })));
  for (const pl of s.players) {
    const mine = deploys.filter((d) => d.p === pl.id);
    const enemy = other(pl.id);
    const silentDeploys = mine.filter((d) => d.cmd.kind === 'deploy' && pl.cards.find((c) => c.uid === d.cmd.card)?.defId === 'lullabun').length;
    const shown = pl.falseAlarmRound === s.round ? 0 : mine.length - silentDeploys;
    for (let k = 0; k < shown; k++) addEvent(s, { kind: 'deploy', text: 'Enemy deploys a character!', privateTo: enemy, owner: pl.id });
  }
  for (const d of deploys) if (d.cmd.kind === 'deploy') executeDeploy(s, d.p, d.cmd);
  // False Alarm (planned at +3, but its pop-up belongs to the deployment reveal)
  for (const { p, card } of pending) {
    if (card.itemId === 'false_alarm') {
      s.players[p].falseAlarmRound = s.round;
      addEvent(s, { kind: 'deploy', text: 'Enemy deploys a character!', privateTo: other(p), owner: p });
    }
  }

  // build streams
  const streams: Stream[] = [];
  const byUnit = new Map<string, Stream>();
  plans.forEach((plan, i) => {
    const p = i as PlayerId;
    plan.commands.forEach((cmd, idx) => {
      if (cmd.kind === 'deploy') return;
      const a: Action = { cmd, cost: checks[i]!.costs[idx] ?? 0, player: p, priority: commandPriority(s, p, cmd), index: idx };
      if (cmd.kind === 'item') {
        streams.push({ key: `item:${cmd.card}`, player: p, actions: [a], waited: false, firstDone: false });
        return;
      }
      const uid = cmd.unit;
      a.unit = uid;
      let st = byUnit.get(uid);
      if (!st) {
        st = { key: `unit:${uid}`, player: p, unit: uid, actions: [], waited: false, firstDone: false };
        byUnit.set(uid, st);
        streams.push(st);
      }
      st.actions.push(a);
    });
  });

  // Ability/Attack item cards are re-attached by uid lookup in the discard pile during execution.
  const attached = new Map<string, ItemCard>();
  for (const pnd of pending) if (pnd.cmd.kind !== 'item') attached.set(pnd.card.uid, pnd.card);

  const hooks: SchedulerHooks = {
    executeNextAttackNow: (uid) => {
      const st = byUnit.get(uid);
      if (!st) return;
      const idx = st.actions.findIndex((a) => a.cmd.kind === 'attack');
      if (idx < 0) return;
      const [a] = st.actions.splice(idx, 1);
      addEvent(s, { kind: 'info', text: `${getUnit(s, uid)?.name} is jolted into action!`, actor: uid });
      runAction(s, a!, st, hooks, attached, pending);
    },
  };

  const reversed = s.backwardsClockRound === s.round;
  let guard = 0;
  while (guard++ < 500) {
    const live = streams.filter((st) => st.actions.length);
    if (!live.length) break;
    let best: Stream | null = null;
    let bestKey: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const st of live) {
      const a = st.actions[0]!;
      const u = getUnit(s, st.unit ?? (a.cmd.kind === 'item' ? a.cmd.target.unit : undefined));
      let sp = u ? effectiveSpeed(s, u) : 0;
      if (reversed && !(u && hasChar(u, 'chronal'))) sp = -sp;
      if (st.waited) sp -= 10000;
      const tie = (u && hasChar(u, 'chronal') ? 1 : 0) + rand(s.rng) * 0.5;
      const k: [number, number, number] = [a.priority, sp, tie];
      if (k[0] > bestKey[0] || (k[0] === bestKey[0] && (k[1] > bestKey[1] || (k[1] === bestKey[1] && k[2] > bestKey[2])))) {
        best = st;
        bestKey = k;
      }
    }
    if (!best) break;
    const a = best.actions.shift()!;
    runAction(s, a, best, hooks, attached, pending);
    if (!best.actions.length && best.unit) {
      const u = getUnit(s, best.unit);
      if (u) u.rt.finished = true;
    }
  }
  // units without any planned action count as "Turned Back" from the start
  for (const u of s.units) if (u.rt.plannedActions === 0) u.rt.finished = true;

  // Turn Back Time (Priority −2, end of Resolution)
  for (const uid of s.turnBackQueue) {
    const u = getUnit(s, uid);
    const snap = s.roundStart[uid];
    if (!u || !snap) continue;
    const from = { ...u.pos };
    if (eq(snap.pos, u.pos) || isFree(s, snap.pos)) u.pos = { ...snap.pos };
    u.hp = Math.max(1, Math.min(u.maxHp, snap.hp));
    u.statuses = u.statuses.filter((x) => !(x.appliedRound === s.round && STATUSES[x.id].kind === 'debuff' && !snap.statuses.includes(x.id)));
    addEvent(s, { kind: 'ability', text: `${u.name} is turned back in time`, target: u.uid, from, to: { ...u.pos } });
  }

  endPhase(s);
  const winner = checkWin(s);
  if (winner === null) startRound(s);
  return { events: s.events.slice(firstEvent), winner };
}

function runAction(s: GameState, a: Action, st: Stream, hooks: SchedulerHooks, attached: Map<string, ItemCard>, pending: { p: PlayerId; card: ItemCard; cmd: Command }[]): void {
  const cmd = a.cmd;
  if (cmd.kind === 'item') {
    const pnd = pending.find((x) => x.cmd === cmd);
    if (pnd) resolveItem(s, a.player, pnd.card, cmd);
    return;
  }
  if (cmd.kind === 'deploy') return;
  const u = getUnit(s, cmd.unit);
  if (!u || u.hp <= 0) {
    addEvent(s, { kind: 'fizzle', text: `An action fizzles: the actor is gone`, owner: a.player });
    returnAttachedCard(s, a, attached);
    return;
  }
  // Resonant Rest (Cymbal Chimp): shockwave on his first action while resting
  if (!st.firstDone && u.defId === 'cymbal_chimp' && u.rt.rest && !u.data.voodoo) {
    addEvent(s, { kind: 'ability', text: `${u.name}: Resonant Rest shockwave!`, actor: u.uid });
    areaDamage(s, u, neighbors(u.pos, bounds(s)), { power: 40, tag: 'sonic', category: 'special', label: 'Resonant Rest', statuses: [{ id: 'shock', chance: 0.6 }] });
    addField(s, u.pos, 'resonance', { duration: 1, owner: u.owner });
  }
  st.firstDone = true;
  if (cmd.kind === 'wait') {
    st.waited = true;
    addEvent(s, { kind: 'info', text: `${u.name} waits`, actor: u.uid });
    return;
  }
  if (cmd.kind === 'hold') {
    addEvent(s, { kind: 'info', text: `${u.name} holds position`, actor: u.uid });
    return;
  }
  // Shock: each action has a 35% chance to be interrupted (Conductive: no effect)
  if (hasStatus(u, 'shock') && !hasChar(u, 'conductive') && u.gear !== 'insulated_gloves' && rollPct(s, 35) && !s.settings.fixedRandom) {
    addEvent(s, { kind: 'fizzle', text: `${u.name} is Shocked — action interrupted (AP lost)`, actor: u.uid });
    returnAttachedCard(s, a, attached);
    u.rt.apSpent += a.cost;
    return;
  }
  u.rt.actionsTaken++;
  u.rt.apSpent += a.cost;
  if (cmd.kind === 'move') {
    if (u.rt.hold) return;
    executeMove(s, u, cmd.path);
    return;
  }
  if (cmd.kind === 'attack') {
    const def = attackDefFor(s, u, cmd.attack);
    if (!def) return;
    if ((u.rt.attacksUsed[def.id] ?? 0) >= def.maxUses) {
      addEvent(s, { kind: 'fizzle', text: `${u.name}: ${def.name} has no uses left`, actor: u.uid });
      return;
    }
    if (hasStatus(u, 'entranced')) {
      addEvent(s, { kind: 'fizzle', text: `${u.name} is Entranced`, actor: u.uid });
      return;
    }
    const ctx = buildCtx(s, u, def, cmd, hooks);
    if (u.defId === 'pokerface' && !u.data.moodRevealed) {
      u.data.moodRevealed = true;
      addEvent(s, { kind: 'ability', text: `${u.name} reveals the ${u.form} mood`, actor: u.uid });
    }
    const ok = executeAttack(ctx);
    if (ok) {
      u.rt.attacksUsed[def.id] = (u.rt.attacksUsed[def.id] ?? 0) + 1;
      u.rt.firstAttackDone = true;
    } else {
      // Ballerina Encore: a Character-Target attack aimed at her missed because she moved out of range
      const t = getUnit(s, cmd.target.unit);
      if (t?.defId === 'ballerina' && def.targeting === 'character' && t.rt.moved > 0) gainToken(s, t);
      returnAttachedCard(s, a, attached);
    }
    // field attacks that land next to the Ballerina instead of on her
    if (def.targeting === 'field' && cmd.target.tile) {
      for (const b of s.units.filter((x) => x.defId === 'ballerina' && x.owner !== u.owner)) {
        if (distance(b.pos, cmd.target.tile) === 1) gainToken(s, b);
      }
    }
    return;
  }
  if (cmd.kind === 'ability') {
    if (hasStatus(u, 'silence') && !hasStatus(u, 'silence_immune')) {
      const vt = cmd.item ? attached.get(cmd.item) : undefined;
      if (vt?.itemId === 'vocal_tonic') {
        removeStatus(s, u, 'silence');
        applyStatus(s, u, 'silence_immune', { duration: 0, silent: true });
      } else {
        addEvent(s, { kind: 'fizzle', text: `${u.name} is Silenced`, actor: u.uid });
        returnAttachedCard(s, a, attached);
        return;
      }
    }
    const card = cmd.item ? attached.get(cmd.item) : undefined;
    const ok = executeAbility(s, u, cmd, hooks, card?.itemId);
    if (!ok) returnAttachedCard(s, a, attached);
    else if (card?.itemId === 'spare_battery') {
      s.players[a.player].queuedAp += 1;
      s.players[a.player].queuedApNotes.push('Spare Battery');
    } else if (card?.itemId === 'overcharge_valve') {
      fieldTickDamage(s, u, 0.08, null, 'Overcharge Valve');
    }
  }
}

function gainToken(s: GameState, b: Unit): void {
  if ((b.counters.tokens ?? 0) >= 2) return;
  b.counters.tokens = (b.counters.tokens ?? 0) + 1;
  addEvent(s, { kind: 'ability', text: `Encore: ${b.name} gains a Token (${b.counters.tokens}/2)`, actor: b.uid });
}

/** If an Attack/Ability command fizzles, its attached card returns to the hand. */
function returnAttachedCard(s: GameState, a: Action, attached: Map<string, ItemCard>): void {
  const cmd = a.cmd;
  const uid = cmd.kind === 'attack' || cmd.kind === 'ability' ? cmd.item : undefined;
  if (!uid) return;
  const card = attached.get(uid);
  if (!card) return;
  const pl = s.players[a.player];
  pl.discard = pl.discard.filter((c) => c !== card);
  pl.hand.push(card);
  attached.delete(uid);
  addEvent(s, { kind: 'item', text: `${ITEMS[card.itemId]?.name} returns to the hand`, owner: a.player, privateTo: a.player });
}

// ---------------------------------------------------------------- deployment

export function executeDeploy(s: GameState, p: PlayerId, cmd: Extract<Command, { kind: 'deploy' }>): void {
  const pl = s.players[p];
  const card = pl.cards.find((c) => c.uid === cmd.card);
  if (!card) return;
  if (!isFree(s, cmd.tile)) {
    addEvent(s, { kind: 'fizzle', text: 'Deployment fizzles: tile occupied', owner: p, privateTo: p });
    return;
  }
  const discount = (() => {
    const pig = s.units.find((u) => u.owner === p && u.defId === 'piggybank' && distance(u.pos, cmd.tile) === 1 && (u.counters.coins ?? 0) >= 2);
    if (!pig) return;
    const def = CHARACTERS[card.defId]!;
    const disc = Math.min(3, Math.floor((pig.counters.coins ?? 0) / 2), def.deploy);
    pig.counters.coins = (pig.counters.coins ?? 0) - disc * 2;
    addEvent(s, { kind: 'ability', text: `Savings: ${def.name} deploys for ${disc} AP less`, actor: pig.uid });
  })();
  void discount;
  const u = createUnitFromCard(s, p, card, cmd.tile);
  u.deployedRound = s.round;
  s.units.push(u);
  pl.undeployed = pl.undeployed.filter((c) => c !== card.uid);
  // deploying replaces the offered card with a random remaining card
  const slot = pl.offered.find((o) => o.cardUid === card.uid);
  if (slot) {
    pl.offered = pl.offered.filter((o) => o !== slot);
    const pool = pl.undeployed.filter((c) => !pl.koCards.includes(c) && !pl.offered.some((o) => o.cardUid === c));
    if (pool.length) pl.offered.push({ cardUid: pick(s.rngP[p], pool), locked: false });
  }
  s.stats.deployed[u.defId] = (s.stats.deployed[u.defId] ?? 0) + 1;
  addEvent(s, {
    kind: 'deploy',
    text: `${pl.name} deploys ${u.name}`,
    actor: u.uid,
    owner: p,
    to: { ...u.pos },
    hiddenFrom: u.defId === 'lullabun' ? other(p) : undefined,
  });
  onDeploy(s, u, cmd);
  afterMoveStop(s, u);
}

function onDeploy(s: GameState, u: Unit, cmd: Extract<Command, { kind: 'deploy' }>): void {
  const b = bounds(s);
  const choice = cmd.choice ?? {};
  switch (u.defId) {
    case 'lullabun':
      applyStatus(s, u, 'hidden', { duration: -1, silent: true });
      u.data.hiddenSince = s.round;
      break;
    case 'pokerface':
      u.form = ['happy', 'sad', 'angry'].includes(choice.mood ?? '') ? choice.mood! : 'happy';
      addEvent(s, { kind: 'ability', text: `${u.name} chooses the ${u.form} mood`, actor: u.uid, privateTo: u.owner });
      break;
    case 'nexus': {
      if (s.units.some((o) => o !== u && o.defId === 'nexus' && o.owner === u.owner)) break; // does not stack with a second Nexus
      const rerolls = Math.max(0, Math.min(3, (choice as any).rerolls ?? 0));
      const tiles = nexusCorruptTiles(s, u.owner, cmd.card, rerolls);
      for (const h of tiles) addField(s, h, 'corrupted', { owner: u.owner, duration: null, data: { nexus: u.uid }, silent: true, noCombo: true });
      addEvent(s, { kind: 'field', text: `${u.name} corrupts 3 hidden tiles`, tiles, field: 'corrupted', privateTo: u.owner });
      break;
    }
    case 'shrink_heads': {
      // upper-left (NW), upper-right (NE), lower-left (SW), lower-right (SE)
      for (const dir of [2, 1, 4, 5]) {
        let h = step(u.pos, dir);
        if (!tileAt(s, h) || tileAt(s, h)!.wall) {
          const alt = neighbors(u.pos, b).find((n) => !tileAt(s, n)!.wall && !s.units.some((x) => x.defId === 'shrink_head' && eq(x.pos, n)));
          if (!alt) continue;
          h = alt;
        }
        const head = createSummon(s, u.owner, 'shrink_head', h, u);
        s.units.push(head);
      }
      addEvent(s, { kind: 'summon', text: 'Four Shrink Heads float into place', actor: u.uid });
      break;
    }
    case 'swamp_siren': {
      const centre = choice.tile && distance(choice.tile, u.pos) <= 4 && tileAt(s, choice.tile) && !tileAt(s, choice.tile)!.wall ? choice.tile : u.pos;
      const tiles = [centre];
      let cur = centre;
      for (let i = 0; i < 2; i++) {
        const n = shuffle(s.rng, neighbors(cur, b).filter((x) => !tileAt(s, x)!.wall && !tiles.some((t) => eq(t, x))))[0];
        if (!n) break;
        tiles.push(n);
        cur = n;
      }
      for (const h of tiles) addField(s, h, 'swamp', { owner: u.owner, duration: null, silent: true });
      addEvent(s, { kind: 'field', text: 'Swamp Heart: the ground turns to Swamp', tiles, field: 'swamp' });
      break;
    }
    case 'wisp': {
      const land = choice.tile && distance(choice.tile, u.pos) === 1 && isFree(s, choice.tile) ? choice.tile : neighbors(u.pos, b).find((h) => isFree(s, h));
      if (land) {
        const candle = createSummon(s, u.owner, 'candle', land, u);
        s.units.push(candle);
        u.data.candle = candle.uid;
        addEvent(s, { kind: 'summon', text: 'A Candle is lit', actor: candle.uid, to: land });
      }
      break;
    }
    case 'leech_cook': {
      const land = choice.tile && distance(choice.tile, u.pos) === 1 && isFree(s, choice.tile) ? choice.tile : neighbors(u.pos, b).find((h) => isFree(s, h));
      if (land) {
        const pot = createSummon(s, u.owner, 'cooking_pot', land, u);
        s.units.push(pot);
        u.data.pot = pot.uid;
        u.counters.broth = 0;
        addEvent(s, { kind: 'summon', text: 'The Cooking Pot is set down', actor: pot.uid, to: land });
      }
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- end phase

export function endPhase(s: GameState): void {
  addEvent(s, { kind: 'round', text: `End phase of round ${s.round}` });
  // 1. field effects
  fieldEffects(s);
  // 2. status ticks: Burn → Poison → Infection spread → Leeched → Echo → Regeneration → durations
  statusTicks(s);
  // 3. regeneration and healing triggers
  fieldHealing(s);
  for (const u of [...s.units]) {
    if (!s.units.includes(u)) continue;
    if (hasChar(u, 'photosynthetic') && !getField(s, u.pos, 'darkness')) {
      const pct = getField(s, u.pos, 'mutation') ? 0.12 : getField(s, u.pos, 'overgrowth') ? 0.08 : 0.05;
      healUnit(s, u, u.maxHp * pct, 'generic', 'Photosynthesis');
    }
    if (hasStatus(u, 'gilded')) healUnit(s, u, u.maxHp * 0.05, 'generic', 'Gilded');
    if (u.defId === 'zombie_limb' && (u.form === 'patchwork' || u.form === 'brute')) healUnit(s, u, u.maxHp * 0.05, 'generic', 'Fused');
    if (hasChar(u, 'insatiable') && s.koThisRound.length === 0) {
      const loss = Math.min(u.hp - 1, Math.round(u.maxHp * 0.05));
      if (loss > 0) dealDamage(s, u, loss, { attacker: null, tag: null, isRecoil: true, label: 'Insatiable hunger' });
    }
    if (u.defId === 'swamp_siren' && getField(s, u.pos, 'swamp')) {
      const n = shuffle(s.rng, neighbors(u.pos, bounds(s)).filter((h) => !tileAt(s, h)!.wall && !getField(s, h, 'swamp')))[0];
      if (n) addField(s, n, 'swamp', { owner: u.owner, duration: null, silent: true });
    }
    if (u.defId === 'mud_decoy') {
      addField(s, u.pos, 'swamp', { owner: u.owner, duration: null, silent: true });
      const n = shuffle(s.rng, neighbors(u.pos, bounds(s)).filter((h) => !tileAt(s, h)!.wall && !getField(s, h, 'swamp')))[0];
      if (n) addField(s, n, 'swamp', { owner: u.owner, duration: null, silent: true });
    }
    if (u.defId === 'piggybank') {
      const pl = s.players[u.owner];
      if (pl.apSpentThisRound < pl.apThisRound * 0.5) {
        u.counters.coins = Math.min(6, (u.counters.coins ?? 0) + 1);
        addEvent(s, { kind: 'ability', text: `Savings: ${u.name} gains a Coin (${u.counters.coins}/6)`, actor: u.uid });
      }
    }
  }
  // 4. summon expiry
  for (const u of [...s.units]) if (u.expiresRound !== undefined && u.expiresRound <= s.round) koUnit(s, u, null, { noReward: true });
  // Ant Trails end early if the end point moved/broke or the Mound is gone
  for (const t of s.tiles) {
    t.fields = t.fields.filter((f) => {
      if (f.id !== 'ant_trail') return true;
      const mound = getUnit(s, f.data?.source as string);
      if (!mound) return false;
      const endUid = f.data?.endUnit as string;
      if (endUid) {
        const end = getUnit(s, endUid);
        if (!end || end.pos.c !== Number(f.data?.endC) || end.pos.r !== Number(f.data?.endR)) return false;
      } else {
        const et = tileAt(s, { c: Number(f.data?.endC), r: Number(f.data?.endR) });
        if (!et?.wall) return false;
      }
      return true;
    });
  }
  // 5. objective VP
  objectiveVp(s);
  // housekeeping: field spread/expiry, traps, hand limit, idle bonus, history
  fieldUpkeep(s);
  expireTraps(s);
  for (const pl of s.players) {
    while (pl.hand.length > 6) pl.discard.push(pl.hand.pop()!);
    pl.lastRoundApTotal = pl.apThisRound;
    pl.lastRoundApSpent = pl.apSpentThisRound;
    pl.idleBonus = nextIdleBonus(pl.idleBonus, pl.apSpentThisRound, pl.apThisRound);
    if (pl.customsTaxRound === s.round) pl.customsTaxType = null;
  }
  // 6. KO rewards were queued when the KOs happened
  s.history.push({ round: s.round, vp: [s.players[0].vp, s.players[1].vp], ap: [s.players[0].apThisRound, s.players[1].apThisRound] });
}

function statusTicks(s: GameState): void {
  const tickDmg = (u: Unit, pct: number, label: string) => fieldTickDamage(s, u, pct, null, label);
  // Burn
  for (const u of [...s.units]) {
    const st = getStatus(u, 'burn');
    if (st && s.units.includes(u)) tickDmg(u, 0.04 * st.stacks, 'Burn');
  }
  // Poison (Vile: Rot Siphon heals; Toxic trait: −50%)
  for (const u of [...s.units]) {
    if (!s.units.includes(u)) continue;
    const st = getStatus(u, 'poison');
    let ticks = st?.stacks ?? 0;
    if (u.defId === 'vile' && u.data.toxicTick) ticks += 1;
    u.data.toxicTick = false;
    if (!ticks) continue;
    if (u.defId === 'vile' && !u.data.voodoo) {
      for (let i = 0; i < ticks; i++) {
        const cap = Math.round(CHARACTERS.vile!.stats.hp * (1 + 0.1 * (u.level - 1)) * 1.3);
        if (u.maxHp < cap) {
          const inc = Math.max(1, Math.round(u.baseMaxHp * 0.01));
          u.maxHp = Math.min(cap, u.maxHp + inc);
        }
        healUnit(s, u, u.maxHp * 0.05, 'poison', 'Rot Siphon');
      }
      continue;
    }
    if (!st) continue;
    tickDmg(u, 0.05 * st.stacks * (hasChar(u, 'toxic') ? 0.5 : 1), 'Poison');
  }
  // Infection: 3% max HP, then spreads 25% (Viral carrier 40%, Contamination 50%) to adjacent units
  const spread: { u: Unit; viral: boolean }[] = [];
  for (const u of [...s.units]) {
    if (!s.units.includes(u)) continue;
    const st = getStatus(u, 'infection');
    if (!st) continue;
    tickDmg(u, 0.03, 'Infection');
    if (!s.units.includes(u)) continue;
    const src = getUnit(s, st.source) ?? s.graveyard.find((g) => g.uid === st.source);
    const viral = !!src && hasChar(src, 'viral');
    if (viral && getField(s, u.pos, 'sterile')) continue;
    spread.push({ u, viral });
  }
  for (const { u, viral } of spread) {
    const base = getField(s, u.pos, 'contamination') ? 0.5 : viral ? 0.4 : 0.25;
    for (const n of s.units.filter((o) => o !== u && distance(o.pos, u.pos) === 1 && !hasStatus(o, 'infection'))) {
      applyStatus(s, n, 'infection', { chance: base, source: getUnit(s, getStatus(u, 'infection')?.source) ?? null });
    }
  }
  // Leeched: 4% drain; every 20 HP adds 1 Broth to the Pot (max 6)
  for (const u of [...s.units]) {
    const st = getStatus(u, 'leeched');
    if (!st || !s.units.includes(u)) continue;
    const drained = tickDmg(u, 0.04, 'Leeched');
    const cook = getUnit(s, st.source);
    if (cook && getUnit(s, cook.data.pot)) {
      cook.data.drained = (cook.data.drained ?? 0) + drained;
      while (cook.data.drained >= 20 && (cook.counters.broth ?? 0) < 6) {
        cook.data.drained -= 20;
        cook.counters.broth = (cook.counters.broth ?? 0) + 1;
        addEvent(s, { kind: 'ability', text: `+1 Broth in the Pot (${cook.counters.broth}/6)`, actor: cook.uid });
      }
    }
  }
  // Echo: 3% max HP per AP spent on its actions
  for (const u of [...s.units]) {
    if (hasStatus(u, 'echo') && u.rt.apSpent > 0 && s.units.includes(u)) tickDmg(u, 0.03 * u.rt.apSpent, 'Echo');
  }
  // Regeneration status: 5% max HP
  for (const u of s.units) if (hasStatus(u, 'regeneration')) healUnit(s, u, u.maxHp * 0.05, 'generic', 'Regeneration');
  // Egg hatching (3 rounds): host takes 10% max HP, a Mini Arachnia appears
  for (const u of [...s.units]) {
    const egg = getStatus(u, 'egg');
    if (!egg || !s.units.includes(u)) continue;
    const fresh = egg.appliedRound === s.round;
    if (fresh || egg.duration > 1) continue;
    const arachnia = getUnit(s, egg.source);
    removeStatus(s, u, 'egg', true);
    if (!arachnia) continue;
    const owner = s.players[arachnia.owner];
    tickDmg(u, 0.1, 'Egg hatches');
    if (owner.hatchedArachnia >= 2) continue;
    const land = neighbors(u.pos, bounds(s)).find((h) => isFree(s, h));
    if (!land) continue;
    const mini = createSummon(s, arachnia.owner, 'mini_arachnia', land, arachnia);
    mini.data.growAt = s.round + 3;
    mini.data.hatched = true;
    s.units.push(mini);
    owner.hatchedArachnia++;
    addEvent(s, { kind: 'summon', text: 'An egg hatches: a Mini Arachnia crawls out', actor: mini.uid, to: land });
  }
  // durations go down by 1
  for (const u of s.units) tickDurations(s, u);
}

function objectiveVp(s: GameState): void {
  for (const t of s.tiles) {
    if (!t.objective) continue;
    const here = s.units.filter((u) => u.pos.c === t.c && u.pos.r === t.r && !u.isObject);
    const owners = new Set(here.map((u) => u.owner));
    if (t.objective === 'control') {
      if (owners.size === 1) awardVp(s, [...owners][0]!, 3, 'Control Field');
    }
    if (t.objective === 'lab') {
      for (const pl of s.players) {
        if (owners.size === 1 && owners.has(pl.id)) pl.labStreak++;
        else pl.labStreak = 0;
        if (pl.labStreak >= 3 && !pl.labAwarded) {
          pl.labAwarded = true;
          awardVp(s, pl.id, 15, 'Lab Objective held 3 rounds');
        }
      }
    }
  }
  // Vacancy tax: no character on the board at round end → opponent +3, then +1 per further empty round (max +8)
  for (const pl of s.players) {
    if (charactersOnBoard(s, pl.id).length === 0) {
      pl.emptyRounds++;
      awardVp(s, other(pl.id), vacancyTax(pl.emptyRounds), 'Vacancy tax');
    } else pl.emptyRounds = 0;
  }
}

// ---------------------------------------------------------------- win check

export const MODE_TARGET: Record<string, number> = { contamination: 100, domination: 75, research: 90, anomaly: 150, elimination: Infinity, escape: Infinity };

function cardsLeft(s: GameState, p: PlayerId): number {
  const pl = s.players[p];
  return pl.cards.filter((c) => !pl.koCards.includes(c.uid) && pl.undeployed.includes(c.uid)).length;
}

export function checkWin(s: GameState): PlayerId | 'draw' | null {
  const target = MODE_TARGET[s.settings.mode] ?? 100;
  const reached = s.players.filter((p) => p.vp >= target).map((p) => p.id);
  const lost = (p: PlayerId) => charactersOnBoard(s, p).length === 0 && cardsLeft(s, p) === 0 && s.round > 1;
  let winner: PlayerId | 'draw' | null = null;
  let reason = '';
  if (reached.length === 2) {
    winner = s.players[0].vp === s.players[1].vp ? 'draw' : s.players[0].vp > s.players[1].vp ? 0 : 1;
    reason = 'both reached the VP target';
  } else if (reached.length === 1) {
    winner = reached[0]!;
    reason = `${target} VP reached`;
  }
  if (winner === null) {
    const l0 = lost(0);
    const l1 = lost(1);
    if (l0 && l1) {
      winner = 'draw';
      reason = 'both teams wiped out';
    } else if (l0 || l1) {
      winner = l0 ? 1 : 0;
      reason = 'the enemy team was wiped out';
    }
  }
  if (winner === null && s.settings.mode === 'elimination') {
    for (const pl of s.players) if (pl.koCards.length >= pl.cards.length) {
      winner = other(pl.id);
      reason = 'all enemy characters KO\'d';
    }
  }
  if (winner === null && s.settings.mode === 'escape') {
    for (const pl of s.players) {
      const enemySide = s.players[other(pl.id)].side;
      const escaped = charactersOnBoard(s, pl.id).some((u) => inDeployZone(u.pos, enemySide, bounds(s)));
      if (escaped && pl.ap >= 1) {
        winner = pl.id;
        reason = 'a character escaped with AP to spare';
      }
    }
  }
  if (winner === null && s.settings.mode === 'anomaly') {
    const bossDead = s.graveyard.some((u) => u.tier === 'boss');
    if (bossDead) {
      const boss = s.graveyard.find((u) => u.tier === 'boss')!;
      winner = other(boss.owner);
      reason = 'the Boss was defeated';
    }
  }
  if (winner === null && s.round >= s.settings.maxRounds) {
    winner = s.players[0].vp === s.players[1].vp ? 'draw' : s.players[0].vp > s.players[1].vp ? 0 : 1;
    reason = `round limit (${s.settings.maxRounds}) reached`;
  }
  if (winner !== null) {
    s.winner = winner;
    s.winReason = reason;
    s.phase = 'over';
    addEvent(s, { kind: 'win', text: winner === 'draw' ? `Draw — ${reason}` : `${s.players[winner].name} wins — ${reason}` });
  }
  return winner;
}

export { onMoonlit };
