import type { Hex, Bounds } from './hex.ts';
import type { RngState } from './rng.ts';

export type PlayerId = 0 | 1;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Tier = 'swarm' | 'standard' | 'elite' | 'boss';
export type DamageTag =
  | 'blunt'
  | 'slash'
  | 'pierce'
  | 'fire'
  | 'electric'
  | 'toxic'
  | 'acid'
  | 'sonic'
  | 'psychic'
  | 'soul'
  | 'radiant';
export type DamageCategory = 'physical' | 'special';
export type CharCategory = 'material' | 'existence' | 'movement' | 'trait' | 'mind';
export type Zone = 'laboratory' | 'graveyard' | 'bog' | 'toyroom' | 'forest' | 'tomb';
export type ItemType = 'character' | 'field' | 'ability' | 'attack' | 'gear' | 'trap' | 'intel';
export type ModeId = 'contamination' | 'elimination' | 'domination' | 'research' | 'escape' | 'anomaly';

export type StatusId =
  | 'poison'
  | 'bleeding'
  | 'burn'
  | 'slow'
  | 'haste'
  | 'blind'
  | 'shock'
  | 'corrosion'
  | 'fear'
  | 'marked'
  | 'vulnerable'
  | 'silence'
  | 'infection'
  | 'corruption'
  | 'echo'
  | 'spotlight'
  | 'depressed'
  | 'egg'
  | 'leeched'
  | 'patient'
  | 'jinx'
  | 'gilded'
  | 'garland'
  | 'starving_mark'
  | 'snared'
  | 'dazed'
  | 'mired'
  | 'soaked'
  | 'frozen'
  | 'well_fed'
  | 'exhausted'
  | 'empowered'
  | 'weakened'
  | 'fortified'
  | 'brittle'
  | 'regeneration'
  | 'hidden'
  | 'entranced'
  // engine-internal helper statuses (not in the design tables, shown as small markers)
  | 'hex'
  | 'overclock'
  | 'cleanse_immune'
  | 'regen_paused'
  | 'mirror_charm'
  | 'blood_pact'
  | 'phoenix'
  | 'silence_immune';

export type FieldId =
  | 'water'
  | 'overgrowth'
  | 'ice'
  | 'fire'
  | 'toxic'
  | 'electric'
  | 'acid'
  | 'radiation'
  | 'sterile'
  | 'resonance'
  | 'darkness'
  | 'contamination'
  | 'fog'
  | 'ash'
  | 'moonlit'
  | 'swamp'
  | 'gas'
  | 'snare'
  | 'chrono'
  | 'marigold'
  | 'bandage'
  | 'scalded'
  | 'ant_trail'
  | 'portal'
  | 'corrupted'
  | 'crystal_bomb'
  // combination results
  | 'electrified_water'
  | 'contaminated_water'
  | 'steam'
  | 'toxic_smoke'
  | 'frozen_water'
  | 'wildfire'
  | 'diluted_acid'
  | 'shock_storm'
  | 'mutation';

export type ObjectiveKind = 'control' | 'terminal' | 'lab';

export interface StatusInst {
  id: StatusId;
  /** Remaining rounds. -1 = until removed / rest of match. */
  duration: number;
  stacks: number;
  /** uid of the unit that applied it (fear source, egg owner, mark owner...) */
  source?: string;
  sourceOwner?: PlayerId;
  /** extra payload, e.g. stored egg owner, shield amount */
  value?: number;
  /** status applied in the current round (used by Turn Back Time) */
  appliedRound?: number;
}

export interface FieldInst {
  id: FieldId;
  owner?: PlayerId;
  /** last round in which the field still exists (removed in that round's end phase). null = permanent */
  until: number | null;
  createdRound: number;
  /** generic payload: bomb power/arm, trail id, corrupted tile owner nexus uid ... */
  data?: Record<string, number | string | boolean>;
}

export interface Tile {
  c: number;
  r: number;
  wall: { hp: number; maxHp: number } | null;
  fields: FieldInst[];
  objective?: ObjectiveKind;
  /** research terminal cooldown: round from which it can be hacked again */
  terminalReadyRound?: number;
}

export interface Trap {
  uid: string;
  itemId: string;
  owner: PlayerId;
  pos: Hex;
  placedRound: number;
  revealedTo: PlayerId[];
  /** Switchback Rune: preferred own unit to swap with */
  swapWith?: string;
}

export interface Stats {
  hp: number;
  patk: number;
  pdef: number;
  satk: number;
  sdef: number;
  speed: number;
}

export type Tuning = Partial<Record<'hp' | 'patk' | 'pdef' | 'satk' | 'sdef' | 'speed', number>>;

export interface UnitRoundState {
  moved: number;
  rest: boolean;
  hold: boolean;
  firstHitTaken: boolean;
  attacksUsed: Record<string, number>;
  actionsTaken: number;
  apSpent: number;
  /** all planned actions of this unit for the round are done (Lab Assistant's "Turned Back") */
  finished: boolean;
  plannedMove: boolean;
  plannedActions: number;
  /** Famine Aura: first attack +1 AP */
  famine: boolean;
  firstAttackDone: boolean;
  snaredLeft: number | null;
  damagedByFireOrAcid: boolean;
  feastBanked: number;
  waited: boolean;
  startPos: Hex | null;
  startHp: number;
  maxMoveBonus: number;
  forcedMoveIgnored: boolean;
}

export interface Unit {
  uid: string;
  owner: PlayerId;
  defId: string;
  cardUid?: string;
  name: string;
  tier: Tier | 'summon' | 'object';
  isSummon: boolean;
  isObject: boolean;
  level: number;
  pos: Hex;
  hp: number;
  maxHp: number;
  /** max HP before temporary modifiers (Corruption halves, Vile siphon raises) */
  baseMaxHp: number;
  stats: Omit<Stats, 'hp'>;
  move: number;
  apPerField: number;
  chars: Record<CharCategory, string>;
  baseChars: Record<CharCategory, string>;
  statuses: StatusInst[];
  shield: { amount: number; untilRound: number } | null;
  gear: string | null;
  counters: Record<string, number>;
  form: string | null;
  deployedRound: number;
  speedRoll: number;
  speedShift: number;
  once: string[];
  data: Record<string, any>;
  rt: UnitRoundState;
  /** summons that expire */
  expiresRound?: number;
  /** summoner uid */
  master?: string;
  /** units revived by Garland/Phoenix can't be revived again */
  revived?: boolean;
  /** blocks movement (object / normal unit). Shrink heads don't block. */
  blocks: boolean;
  /** tutorial dummies etc. */
  dummy?: boolean;
  koAt?: number;
}

export interface CharCard {
  uid: string;
  defId: string;
  level: number;
  tuning: Tuning;
}

export interface ItemCard {
  uid: string;
  itemId: string;
  tarnished?: boolean;
  midas?: boolean;
}

export interface OfferSlot {
  cardUid: string;
  locked: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  side: 'left' | 'right';
  isBot: boolean;
  ap: number;
  apThisRound: number;
  apSpentThisRound: number;
  idleBonus: number;
  idleStreak: number;
  /** AP paid at the start of next round (KO rewards, Trade, Feast, Greedy, Lucky Coin...) */
  queuedAp: number;
  queuedApNotes: string[];
  vp: number;
  cards: CharCard[];
  undeployed: string[];
  offered: OfferSlot[];
  koCount: number;
  koCards: string[];
  itemDeck: ItemCard[];
  hand: ItemCard[];
  discard: ItemCard[];
  tarnishedType: ItemType | null;
  midasUsed: boolean;
  /** item uids in this player's hand known to the opponent (Scout Card) */
  revealedToEnemy: string[];
  emptyRounds: number;
  labStreak: number;
  labAwarded: boolean;
  customsTaxType: ItemType | null;
  customsTaxRound: number;
  apPenaltyNext: number;
  /** AP borrowed this round against planned refunds (Evacuation Order, Spare Battery); unpaid rest becomes next round's penalty */
  apBorrowed: number;
  falseAlarmRound: number;
  spyDroneUntil: number;
  feastThisRound: number;
  cardsPlayedThisRound: number;
  freeCardsThisRound: number;
  itemNamesThisRound: string[];
  lastRoundApTotal: number;
  lastRoundApSpent: number;
  allyKoLastRound: boolean;
  allyKoThisRound: boolean;
  watchTarget: string | null;
  bansAgainst: string[];
  hatchedArachnia: number;
  pumpkinTrade?: boolean;
}

export type LogKind =
  | 'round'
  | 'deploy'
  | 'move'
  | 'attack'
  | 'damage'
  | 'heal'
  | 'miss'
  | 'crit'
  | 'status'
  | 'field'
  | 'ko'
  | 'fizzle'
  | 'item'
  | 'vp'
  | 'ap'
  | 'ability'
  | 'trap'
  | 'win'
  | 'info'
  | 'summon'
  | 'revive';

export interface DamageCalc {
  power: number;
  atk: number;
  def: number;
  ratio: number;
  T: number;
  C: number;
  M: number;
  L: number;
  raw: number;
  final: number;
}

/** Resolution events. They drive client animation and are filtered per player by visibility. */
export interface GameEvent {
  kind: LogKind;
  round: number;
  seq: number;
  text: string;
  actor?: string;
  target?: string;
  owner?: PlayerId;
  from?: Hex;
  to?: Hex;
  tiles?: Hex[];
  amount?: number;
  tag?: DamageTag;
  crit?: boolean;
  calc?: DamageCalc;
  status?: StatusId;
  field?: FieldId;
  priority?: number;
  speed?: number;
  /** only visible to this player */
  privateTo?: PlayerId;
  /** hidden from this player (e.g. hidden unit moved) */
  hiddenFrom?: PlayerId;
  ref?: string;
}

export interface MatchSettings {
  mode: ModeId;
  planningSeconds: number;
  friendly: boolean;
  zone: Zone;
  maxRounds: number;
  bounds: Bounds;
  tutorial?: boolean;
  /** Testing Chambers: this player's characters cannot be KO'd (they stay at 1 HP) */
  protectOwner?: PlayerId;
  /** fixed randomness for tutorials: hits always land, crits only when scripted */
  fixedRandom?: boolean;
  bossId?: string;
  banPhase?: boolean;
}

export interface GameState {
  v: 1;
  id: string;
  seed: number;
  rng: RngState;
  rngP: [RngState, RngState];
  settings: MatchSettings;
  round: number;
  phase: 'planning' | 'resolution' | 'over';
  tiles: Tile[];
  units: Unit[];
  graveyard: Unit[];
  players: [PlayerState, PlayerState];
  traps: Trap[];
  events: GameEvent[];
  seq: number;
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  uidCounter: number;
  koThisRound: { uid: string; owner: PlayerId; pos: Hex; tier: string; defId: string }[];
  koLastRound: number;
  /** pending revivals (Garland / Phoenix Feather) */
  pendingRevives: { unit: Unit; round: number; hpPct: number }[];
  backwardsClockRound: number;
  /** snapshot of units at round start for Turn Back Time */
  roundStart: Record<string, { pos: Hex; hp: number; statuses: string[] }>;
  turnBackQueue: string[];
  history: { round: number; vp: [number, number]; ap: [number, number] }[];
  stats: MatchStats;
}

export interface MatchStats {
  damageDealt: [number, number];
  kos: [number, number];
  itemsPlayed: Record<string, number>;
  deployed: Record<string, number>;
  /** defId -> damage dealt */
  damageByChar: Record<string, number>;
}

// ---------------------------------------------------------------- commands

export interface Target {
  unit?: string;
  tile?: Hex;
  tiles?: Hex[];
  dir?: number;
  dist?: number;
  /** generic choice (Pokerface mood, item type for Customs Inspector, ...) */
  choice?: string;
}

export interface MoveCmd {
  kind: 'move';
  unit: string;
  path: Hex[];
}
export interface AttackCmd {
  kind: 'attack';
  unit: string;
  attack: string;
  target: Target;
  /** attached Attack-type item card uid */
  item?: string;
  /** Cog Cuckoo: shift hour hand -1/+1 for 1 AP */
  hourShift?: number;
}
export interface AbilityCmd {
  kind: 'ability';
  unit: string;
  ability: string;
  target: Target;
  /** attached Ability-type item card uid */
  item?: string;
}
export interface WaitCmd {
  kind: 'wait';
  unit: string;
}
export interface HoldCmd {
  kind: 'hold';
  unit: string;
}
export interface DeployCmd {
  kind: 'deploy';
  card: string;
  tile: Hex;
  /** On-Deploy choices: pokerface mood, candle tile, swamp heart tile, corrupted tiles (rerolled) */
  choice?: { mood?: string; tile?: Hex; tiles?: Hex[] };
}
export interface ItemCmd {
  kind: 'item';
  card: string;
  target: Target;
}

export type Command = MoveCmd | AttackCmd | AbilityCmd | WaitCmd | HoldCmd | DeployCmd | ItemCmd;

export interface Plan {
  player: PlayerId;
  commands: Command[];
  rest: string[];
  /** Ghost Train Mind's Eye speed shift, −15..+15 (percent) */
  speedShift?: Record<string, number>;
  /** Ghost Train Mind's Eye tie order: in a Speed tie with friendly `after`, she acts right after
   * that character's `action`-th action (0 = before all of them, default 1) */
  mindsEye?: Record<string, { after: string; action?: number }>;
  /** Scarecrow Watchful Eye target */
  watch?: string;
}

// ---------------------------------------------------------------- definitions

export interface StatusApply {
  id: StatusId;
  chance: number;
  duration?: number;
  stacks?: number;
}

export type Shape =
  | 'single'
  | 'ring1'
  | 'burst1'
  | 'ring2'
  | 'burst2'
  | 'burst3'
  | 'cone3'
  | 'star2'
  | 'line'
  | 'self';

export interface AttackDef {
  id: string;
  name: string;
  /** physical/special for damage; 'support' and 'utility' deal no direct stat damage */
  category: DamageCategory | 'support' | 'utility';
  tag?: DamageTag;
  power?: number;
  range: number;
  ap: number;
  /** null = cannot miss */
  acc: number | null;
  crit: number;
  maxUses: number;
  priority?: number;
  targeting: 'character' | 'field' | 'self' | 'none' | 'multi-field' | 'ally' | 'vector';
  shape?: Shape;
  ignoresLos?: boolean;
  statuses?: StatusApply[];
  knockback?: number;
  pull?: number;
  /** marked "slow heavy attack" etc. */
  heavy?: boolean;
  /** custom handler key in the character hooks */
  custom?: string;
  text: string;
  /** shown on cards (German translation) */
  textDe?: string;
  /** attack slot: 1 or 2 (ability uses 0) */
  slot?: number;
  friendlyFire?: boolean;
  enemiesOnly?: boolean;
  requires?: string;
}

export interface AbilityDef {
  id: string;
  name: string;
  /** passive abilities are never commanded */
  passive: boolean;
  ap?: number;
  range?: number;
  priority?: number;
  oncePerGame?: boolean;
  maxPerRound?: number;
  onDeploy?: boolean;
  targeting?: AttackDef['targeting'] | 'choice';
  text: string;
  textDe?: string;
}

export interface CharacterDef {
  id: string;
  num: number;
  name: string;
  title: string;
  rarity: Rarity;
  tier: Tier;
  deploy: number;
  stats: Stats;
  move: number;
  apPerField: number;
  chars: Record<CharCategory, string>;
  attacks: AttackDef[];
  ability: AbilityDef;
  /** alternative attacks (Pokerface moods, Werewolf forms, Zombie fusions) */
  altAttacks?: Record<string, AttackDef[]>;
  zone: Zone;
  maxCopies: number;
  portrait: string;
  palette: [string, string];
  role: string;
  isSummon?: boolean;
  noVp?: boolean;
}

export interface ItemDef {
  id: string;
  code: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  /** AP cost; 0 with `free` requirement */
  cost: number;
  free?: string;
  trait: string;
  text: string;
  motif: string;
  targeting: 'unit' | 'ally' | 'enemy' | 'tile' | 'none' | 'command' | 'trap-tile' | 'choice';
  zone: Zone;
}
