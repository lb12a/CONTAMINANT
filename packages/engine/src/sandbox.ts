// Scenario builder for tests, tutorials (Testing Chambers) and the in-game Sandbox.

import { CHARACTERS } from './data/characters.ts';
import { STANDARD_BOUNDS, type Bounds, type Hex } from './hex.ts';
import { testChamber } from './map.ts';
import { applyWerewolfForm, applyZombieForm, createMatch, createSummon, createUnitFromCard, freshRound } from './state.ts';
import { startRound } from './resolve.ts';
import type { FieldId, GameState, ItemType, MatchSettings, ModeId, PlayerId, StatusId, Unit, Zone } from './types.ts';

export interface SandboxUnit {
  owner: PlayerId;
  defId: string;
  pos: Hex;
  hp?: number;
  /** HP as a fraction of max */
  hpPct?: number;
  level?: number;
  form?: string;
  statuses?: { id: StatusId; duration?: number; stacks?: number }[];
  counters?: Record<string, number>;
  gear?: string;
  /** a summon/object id from SUMMONS (training_dummy, shrink_head ...) */
  summon?: boolean;
  /** placed this round (cannot act yet) */
  fresh?: boolean;
  tag?: string;
}

export interface SandboxOptions {
  seed?: number;
  bounds?: Bounds;
  walls?: Hex[];
  fields?: { pos: Hex; id: FieldId; duration?: number | null; owner?: PlayerId }[];
  units: SandboxUnit[];
  /** undeployed character cards (offered characters) */
  decks?: [string[], string[]];
  /** item ids in the draw pile */
  items?: [string[], string[]];
  /** item ids in hand at round start (after the round-start draw) */
  hands?: [string[], string[]];
  ap?: [number, number];
  fixedRandom?: boolean;
  mode?: ModeId;
  zone?: Zone;
  round?: number;
  names?: [string, string];
  friendly?: boolean;
  settings?: Partial<MatchSettings>;
  objectives?: { pos: Hex; kind: 'control' | 'terminal' | 'lab' }[];
  tarnished?: [ItemType | null, ItemType | null];
}

export function createSandbox(o: SandboxOptions): GameState {
  const bounds = o.bounds ?? STANDARD_BOUNDS;
  const tiles = testChamber(o.walls ?? [], bounds);
  for (const ob of o.objectives ?? []) {
    const t = tiles.find((x) => x.c === ob.pos.c && x.r === ob.pos.r);
    if (t) {
      t.objective = ob.kind;
      t.terminalReadyRound = 1;
    }
  }
  const mk = (p: 0 | 1) => ({
    name: o.names?.[p] ?? (p === 0 ? 'You' : 'Opponent'),
    cards: (o.decks?.[p] ?? []).map((defId, i) => ({ uid: `d${p}-${i}`, defId, level: 1, tuning: {} })),
    items: o.items?.[p] ?? [],
  });
  const s = createMatch({
    seed: o.seed ?? 7,
    settings: {
      mode: o.mode ?? 'contamination',
      bounds,
      fixedRandom: o.fixedRandom ?? true,
      zone: o.zone ?? 'laboratory',
      friendly: o.friendly ?? false,
      maxRounds: 60,
      ...o.settings,
    },
    players: [mk(0), mk(1)],
    tiles,
    firstSide: 'left',
  });
  // opening hands are replaced by explicit hands below
  for (const pl of s.players) {
    pl.itemDeck.unshift(...pl.hand);
    pl.hand = [];
  }
  for (const f of o.fields ?? []) {
    const t = s.tiles.find((x) => x.c === f.pos.c && x.r === f.pos.r);
    if (t) t.fields.push({ id: f.id, owner: f.owner, until: f.duration === undefined || f.duration === null ? null : (o.round ?? 1) + f.duration - 1, createdRound: 0 });
  }
  let i = 0;
  for (const su of o.units) {
    let u: Unit;
    if (su.summon || !CHARACTERS[su.defId]) {
      u = createSummon(s, su.owner, su.defId, su.pos);
      if (su.level) u.level = su.level;
    } else {
      const card = { uid: `sb${su.owner}-${i++}`, defId: su.defId, level: su.level ?? 1, tuning: {} };
      s.players[su.owner].cards.push(card);
      u = createUnitFromCard(s, su.owner, card, su.pos);
      if (su.form === 'wolf') applyWerewolfForm(u, 'wolf');
      else if (su.form === 'patchwork' || su.form === 'brute') {
        applyZombieForm(u, su.form);
        u.hp = u.maxHp;
        u.data.parts = su.form === 'brute' ? 3 : 2;
      } else if (su.form) u.form = su.form;
      if (su.defId === 'pokerface') u.data.moodRevealed = true;
    }
    if (su.tag) u.data.tag = su.tag;
    u.deployedRound = su.fresh ? (o.round ?? 1) : 0;
    if (su.hpPct !== undefined) u.hp = Math.max(1, Math.round(u.maxHp * su.hpPct));
    if (su.hp !== undefined) u.hp = su.hp;
    for (const st of su.statuses ?? []) u.statuses.push({ id: st.id, duration: st.duration ?? 2, stacks: st.stacks ?? 1, appliedRound: 0 });
    Object.assign(u.counters, su.counters ?? {});
    if (su.gear) u.gear = su.gear;
    u.rt = freshRound(u);
    s.units.push(u);
    if (u.defId === 'leech_cook' && !u.data.pot) u.counters.broth ??= 0;
  }
  s.round = (o.round ?? 1) - 1;
  startRound(s);
  for (const p of [0, 1] as const) {
    const pl = s.players[p];
    if (o.hands?.[p]) {
      pl.itemDeck.unshift(...pl.hand);
      pl.hand = o.hands[p]!.map((itemId, k) => ({ uid: `h${p}-${k}`, itemId }));
    }
    if (o.ap) {
      pl.ap = o.ap[p];
      pl.apThisRound = o.ap[p];
    }
    if (o.tarnished?.[p]) pl.tarnishedType = o.tarnished[p]!;
  }
  // Mycel links etc. ran in startRound; sandbox units start the round fresh
  return s;
}

export function findTagged(s: GameState, tag: string): Unit | undefined {
  return s.units.find((u) => u.data.tag === tag);
}
