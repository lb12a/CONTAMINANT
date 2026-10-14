import { CHARACTERS, SUMMONS, WEREWOLF_FORMS, ZOMBIE_FORMS } from './data/characters.ts';
import { ITEMS } from './data/items.ts';
import { levelMult, tuned } from './formulas.ts';
import { eq, key, type Bounds, type Hex, STANDARD_BOUNDS } from './hex.ts';
import { generateMap, inDeployZone, tileIndex } from './map.ts';
import { makeRng, shuffle, hashString, chance } from './rng.ts';
import type {
  CharCard,
  GameEvent,
  GameState,
  ItemCard,
  MatchSettings,
  PlayerId,
  PlayerState,
  Tile,
  Unit,
  UnitRoundState,
} from './types.ts';

export function bounds(s: GameState): Bounds {
  return s.settings.bounds;
}

export function newUid(s: GameState, prefix: string): string {
  s.uidCounter++;
  return `${prefix}${s.uidCounter}`;
}

export function tileAt(s: GameState, h: Hex): Tile | undefined {
  const b = bounds(s);
  if (h.c < 0 || h.r < 0 || h.c >= b.cols || h.r >= b.rows) return undefined;
  return s.tiles[tileIndex(h, b)];
}

export function getUnit(s: GameState, uid: string | undefined): Unit | undefined {
  if (!uid) return undefined;
  return s.units.find((u) => u.uid === uid);
}

/** Units standing on a tile (including non-blocking heads). */
export function unitsAt(s: GameState, h: Hex): Unit[] {
  return s.units.filter((u) => eq(u.pos, h));
}

/** The blocking unit on a tile, if any. */
export function blockerAt(s: GameState, h: Hex): Unit | undefined {
  return s.units.find((u) => u.blocks && eq(u.pos, h));
}

/** The "main" unit on a tile for targeting (blocking unit first, else a head). */
export function unitAt(s: GameState, h: Hex): Unit | undefined {
  return blockerAt(s, h) ?? s.units.find((u) => eq(u.pos, h));
}

export function isFree(s: GameState, h: Hex): boolean {
  const t = tileAt(s, h);
  return !!t && !t.wall && !blockerAt(s, h);
}

export function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

export function freshRound(u: Unit): UnitRoundState {
  return {
    moved: 0,
    rest: false,
    hold: false,
    firstHitTaken: false,
    attacksUsed: {},
    actionsTaken: 0,
    apSpent: 0,
    finished: false,
    plannedMove: false,
    plannedActions: 0,
    famine: false,
    firstAttackDone: false,
    snaredLeft: null,
    damagedByFireOrAcid: false,
    feastBanked: 0,
    waited: false,
    startPos: { ...u.pos },
    startHp: u.hp,
    maxMoveBonus: 0,
    forcedMoveIgnored: false,
  };
}

/** Characters on the board (summons and objects excluded). */
export function charactersOnBoard(s: GameState, p: PlayerId): Unit[] {
  return s.units.filter((u) => u.owner === p && !u.isSummon && !u.isObject && !u.dummy);
}

export function addEvent(s: GameState, ev: Omit<GameEvent, 'round' | 'seq'>): GameEvent {
  s.seq++;
  const full: GameEvent = { round: s.round, seq: s.seq, ...ev };
  s.events.push(full);
  return full;
}

// ---------------------------------------------------------------- unit factory

export function createUnitFromCard(s: GameState, owner: PlayerId, card: CharCard, pos: Hex): Unit {
  const def = CHARACTERS[card.defId];
  if (!def) throw new Error(`unknown character ${card.defId}`);
  const level = s.settings.friendly ? 10 : card.level;
  const L = levelMult(level);
  const t = card.tuning ?? {};
  const maxHp = Math.round(tuned(def.stats.hp, t.hp) * L);
  const u: Unit = {
    uid: newUid(s, 'u'),
    owner,
    defId: def.id,
    cardUid: card.uid,
    name: def.name,
    tier: def.tier,
    isSummon: false,
    isObject: false,
    level,
    pos: { ...pos },
    hp: maxHp,
    maxHp,
    baseMaxHp: maxHp,
    stats: {
      patk: tuned(def.stats.patk, t.patk),
      pdef: tuned(def.stats.pdef, t.pdef),
      satk: tuned(def.stats.satk, t.satk),
      sdef: tuned(def.stats.sdef, t.sdef),
      speed: tuned(def.stats.speed, t.speed),
    },
    move: def.move,
    apPerField: def.apPerField,
    chars: { ...def.chars },
    baseChars: { ...def.chars },
    statuses: [],
    shield: null,
    gear: null,
    counters: {},
    form: null,
    deployedRound: s.round,
    speedRoll: 0,
    speedShift: 0,
    once: [],
    data: { tuning: t },
    rt: undefined as unknown as UnitRoundState,
    blocks: true,
  };
  if (def.id === 'werewolf') u.form = 'human';
  if (def.id === 'zombie_limb') {
    u.form = 'limb';
    u.data.parts = 1;
  }
  u.rt = freshRound(u);
  return u;
}

export function createSummon(s: GameState, owner: PlayerId, summonId: string, pos: Hex, master?: Unit): Unit {
  const d = SUMMONS[summonId];
  if (!d) throw new Error(`unknown summon ${summonId}`);
  const level = master?.level ?? 1;
  const hp = Math.round(d.hp * levelMult(level));
  const u: Unit = {
    uid: newUid(s, 's'),
    owner,
    defId: d.id,
    name: d.name,
    tier: d.object ? 'object' : 'summon',
    isSummon: true,
    isObject: d.object,
    level,
    pos: { ...pos },
    hp,
    maxHp: hp,
    baseMaxHp: hp,
    stats: { patk: d.patk, pdef: d.pdef, satk: d.satk, sdef: d.sdef, speed: master && d.speed === 0 ? 0 : d.speed },
    move: d.move,
    apPerField: d.apPerField,
    chars: { ...d.chars },
    baseChars: { ...d.chars },
    statuses: [],
    shield: null,
    gear: null,
    counters: {},
    form: null,
    deployedRound: s.round,
    speedRoll: 0,
    speedShift: 0,
    once: [],
    data: {},
    rt: undefined as unknown as UnitRoundState,
    master: master?.uid,
    blocks: d.blocks,
  };
  if (summonId === 'shrink_head' && master) u.stats.speed = master.stats.speed;
  u.rt = freshRound(u);
  return u;
}

/** Re-applies form stats for Werewolf / fused Zombie forms keeping HP percentage semantics where defined. */
export function applyWerewolfForm(u: Unit, form: 'human' | 'wolf'): void {
  const f = WEREWOLF_FORMS[form];
  const L = levelMult(u.level);
  const t = (u.data.tuning ?? {}) as Record<string, number>;
  const base = CHARACTERS.werewolf!.stats.hp;
  const newMax = Math.round(tuned(base, t.hp) * L * f.hpMult);
  const diff = newMax - u.maxHp;
  u.maxHp = newMax;
  u.baseMaxHp = newMax;
  u.hp = Math.max(1, Math.min(newMax, u.hp + Math.max(0, diff)));
  u.stats = {
    patk: tuned(f.patk, t.patk),
    pdef: tuned(f.pdef, t.pdef),
    satk: tuned(f.satk, t.satk),
    sdef: tuned(f.sdef, t.sdef),
    speed: tuned(f.speed, t.speed),
  };
  u.move = f.move;
  u.form = form;
}

export function applyZombieForm(u: Unit, form: 'limb' | 'patchwork' | 'brute'): void {
  const f = ZOMBIE_FORMS[form];
  const L = levelMult(u.level);
  u.maxHp = Math.round(f.hp * L);
  u.baseMaxHp = u.maxHp;
  u.stats = { patk: f.patk, pdef: f.pdef, satk: f.satk, sdef: f.sdef, speed: f.speed };
  u.move = f.move;
  u.apPerField = f.apPerField;
  u.form = form;
  u.name = form === 'patchwork' ? 'Patchwork Zombie' : form === 'brute' ? 'Stitched Brute' : 'Zombie Limb';
}

// ---------------------------------------------------------------- match factory

export interface PlayerSetup {
  name: string;
  cards: CharCard[];
  items: string[];
  isBot?: boolean;
}

export interface CreateMatchOptions {
  id?: string;
  seed: number;
  settings?: Partial<MatchSettings>;
  players: [PlayerSetup, PlayerSetup];
  tiles?: Tile[];
  /** force sides instead of the coin flip (tutorials) */
  firstSide?: 'left' | 'right';
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mode: 'contamination',
  planningSeconds: 30,
  friendly: false,
  zone: 'laboratory',
  maxRounds: 40,
  bounds: STANDARD_BOUNDS,
};

function makePlayer(s: GameState, id: PlayerId, setup: PlayerSetup, side: 'left' | 'right'): PlayerState {
  const itemDeck: ItemCard[] = setup.items.map((itemId) => {
    if (!ITEMS[itemId]) throw new Error(`unknown item ${itemId}`);
    return { uid: newUid(s, 'i'), itemId };
  });
  shuffle(s.rngP[id], itemDeck);
  const cards = setup.cards.map((c) => ({ ...c, uid: c.uid || newUid(s, 'c') }));
  return {
    id,
    name: setup.name,
    side,
    isBot: !!setup.isBot,
    ap: 0,
    apThisRound: 0,
    apSpentThisRound: 0,
    idleBonus: 0,
    idleStreak: 0,
    queuedAp: 0,
    queuedApNotes: [],
    vp: 0,
    cards,
    undeployed: cards.map((c) => c.uid),
    offered: [],
    koCount: 0,
    koCards: [],
    itemDeck,
    hand: [],
    discard: [],
    tarnishedType: null,
    midasUsed: false,
    revealedToEnemy: [],
    emptyRounds: 0,
    labStreak: 0,
    labAwarded: false,
    customsTaxType: null,
    customsTaxRound: -1,
    apPenaltyNext: 0,
    apBorrowed: 0,
    falseAlarmRound: -1,
    spyDroneUntil: -1,
    feastThisRound: 0,
    cardsPlayedThisRound: 0,
    freeCardsThisRound: 0,
    itemNamesThisRound: [],
    lastRoundApTotal: 0,
    lastRoundApSpent: 0,
    allyKoLastRound: false,
    allyKoThisRound: false,
    watchTarget: null,
    bansAgainst: [],
    hatchedArachnia: 0,
  };
}

export function createMatch(opts: CreateMatchOptions): GameState {
  const settings: MatchSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const seed = opts.seed >>> 0;
  const s: GameState = {
    v: 1,
    id: opts.id ?? `m${seed.toString(36)}`,
    seed,
    rng: makeRng(seed),
    rngP: [makeRng(hashString(`${seed}:p0`)), makeRng(hashString(`${seed}:p1`))],
    settings,
    round: 0,
    phase: 'planning',
    tiles: [],
    units: [],
    graveyard: [],
    players: undefined as unknown as [PlayerState, PlayerState],
    traps: [],
    events: [],
    seq: 0,
    winner: null,
    winReason: null,
    uidCounter: 0,
    koThisRound: [],
    koLastRound: 0,
    pendingRevives: [],
    backwardsClockRound: -1,
    roundStart: {},
    turnBackQueue: [],
    history: [],
    stats: { damageDealt: [0, 0], kos: [0, 0], itemsPlayed: {}, deployed: {}, damageByChar: {} },
  };
  const firstSide = opts.firstSide ?? (chance(s.rng, 0.5) ? 'left' : 'right');
  s.players = [
    makePlayer(s, 0, opts.players[0], firstSide),
    makePlayer(s, 1, opts.players[1], firstSide === 'left' ? 'right' : 'left'),
  ];
  s.tiles = opts.tiles ?? generateMap(s.rng, { mode: settings.mode, bounds: settings.bounds });
  // opening hand: 3 cards
  for (const p of s.players) for (let i = 0; i < 3; i++) drawItem(s, p.id);
  return s;
}

export function drawItem(s: GameState, p: PlayerId): ItemCard | null {
  const pl = s.players[p];
  const card = pl.itemDeck.shift();
  if (!card) return null;
  if (pl.tarnishedType && ITEMS[card.itemId]!.type === pl.tarnishedType && !card.midas) card.tarnished = true;
  pl.hand.push(card);
  return card;
}

export function deployZoneTiles(s: GameState, p: PlayerId): Hex[] {
  const side = s.players[p].side;
  return s.tiles.filter((t) => inDeployZone(t, side, bounds(s))).map((t) => ({ c: t.c, r: t.r }));
}

export function inZone(s: GameState, p: PlayerId, h: Hex): boolean {
  return inDeployZone(h, s.players[p].side, bounds(s));
}

export function cardOf(s: GameState, p: PlayerId, cardUid: string): CharCard | undefined {
  return s.players[p].cards.find((c) => c.uid === cardUid);
}

export function hasField(s: GameState, h: Hex, ids: string | string[]): boolean {
  const t = tileAt(s, h);
  if (!t) return false;
  const list = Array.isArray(ids) ? ids : [ids];
  return t.fields.some((f) => list.includes(f.id));
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export { key };

/** Refunds AP during resolution: first repays AP borrowed by the plan, the rest is usable this round only on paper
 * (unspent AP does not carry over) but lowers the AP counted as spent for the Idle Bonus. */
export function refundAp(s: GameState, p: PlayerId, amount: number, why: string): void {
  const pl = s.players[p];
  pl.ap += amount;
  pl.apSpentThisRound = Math.max(0, pl.apSpentThisRound - amount);
  pl.apBorrowed = Math.max(0, pl.apBorrowed - amount);
  addEvent(s, { kind: 'ap', text: `${why}: +${amount} AP`, owner: p, privateTo: p, amount });
}
