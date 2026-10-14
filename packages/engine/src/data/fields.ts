import type { FieldId } from '../types.ts';

export interface FieldDef {
  id: FieldId;
  name: string;
  /** default duration when created by cards/attacks (rounds); null = permanent */
  duration: number | null;
  /** ground fields are ignored by Airborne units */
  ground: boolean;
  text: string;
  /** look + main colour from the UI asset document (section 6) */
  look: string;
  color: string;
  terrain?: boolean;
  combo?: boolean;
  isNew?: boolean;
  /** hidden from the enemy */
  hidden?: boolean;
}

const F = (d: FieldDef) => d;

export const FIELDS: Record<FieldId, FieldDef> = Object.fromEntries(
  [
    // terrain (map)
    F({ id: 'water', name: 'Water', duration: null, ground: true, terrain: true, text: 'Units on it are Soaked. Amphibious units move through it for free. Permanent', look: 'Black mirroring water with rings', color: '#1d3a5c' }),
    F({ id: 'overgrowth', name: 'Overgrowth', duration: null, ground: true, terrain: true, text: 'Photosynthetic units heal +8% instead of +5%. Other Grounded units pay +1 AP to enter. Fire here lasts +1 round and spreads. Permanent until burned', look: 'Rampant vines, thorns and small flowers', color: '#8CFF5A' }),
    F({ id: 'ice', name: 'Ice', duration: null, ground: true, terrain: true, text: 'Entering costs +1 AP. A unit ending its move here gets Slow for 1 round. Fire turns it into Water', look: 'Milky ice with cracks and frozen bones', color: '#bfe6ff' }),
    // hazard fields
    F({ id: 'fire', name: 'Fire', duration: 2, ground: false, text: 'Burn (1 stack), 100% chance. Ignites Gas. Leaves an Ash Field', look: 'Embers and tongues of flame', color: '#FF9A1F' }),
    F({ id: 'toxic', name: 'Toxic', duration: 3, ground: true, text: 'Poison (1 stack)', look: 'Bubbling poison puddle', color: '#8CFF5A' }),
    F({ id: 'electric', name: 'Electric', duration: 3, ground: true, text: "5% max HP Electric damage and 50% Shock. Counts for Frankenstein's Charge", look: 'Twitching arcs over a metal grate', color: '#4FE3FF' }),
    F({ id: 'acid', name: 'Acid', duration: 3, ground: true, text: '4% max HP Acid damage and 1 stack of Corrosion', look: 'Hissing acid eating the floor', color: '#c8e04a' }),
    F({ id: 'radiation', name: 'Radiation', duration: 3, ground: false, text: '5% max HP Radiant damage. Switches off Regenerative', look: 'Pulsing radiation trefoil, crystal shards', color: '#d6f542' }),
    F({ id: 'sterile', name: 'Sterile', duration: 3, ground: false, text: 'Removes Poison, Infection, Egg, Leeched. No Toxic or Contamination can be created here. Toxic and Cursed units lose 5% max HP', look: 'White disinfection pattern with a cross', color: '#e8f4ff' }),
    F({ id: 'resonance', name: 'Resonance', duration: 2, ground: false, text: 'Sonic damage dealt or taken here +30%. Shock lasts +1 round. Phasing units become solid', look: 'Concentric rings like a cymbal vibration', color: '#6B3FA0' }),
    F({ id: 'darkness', name: 'Darkness', duration: 3, ground: false, text: '−15 Accuracy for units without Perceptive that attack from, into or through it. Photosynthetic units do not heal. Hidden units stay hidden while inside', look: 'Black ink cloud with pairs of eyes', color: '#050307' }),
    F({ id: 'contamination', name: 'Contamination', duration: 3, ground: false, text: 'Status chances against units here +25% and status durations +1. Infection spreads here with 50%', look: 'Blotchy green-red mix with biohazard sign', color: '#8b5a1f' }),
    F({ id: 'fog', name: 'Fog', duration: 2, ground: false, isNew: true, text: 'Blocks Line of Sight for Character-Target attacks through it (adjacent targets excepted). −15 Accuracy. Perceptive units ignore it', look: 'White wisps of fog', color: '#9a9a9a' }),
    F({ id: 'ash', name: 'Ash', duration: 3, ground: false, isNew: true, text: 'Fire Fields cannot be created and Overgrowth cannot grow here. Dead and Bone units heal 4% max HP', look: 'Grey ash with glowing specks', color: '#6e6a66' }),
    F({ id: 'moonlit', name: 'Moonlit', duration: 3, ground: false, isNew: true, text: 'Mythic and Feral units may use Moon Pull for free. Predatory units +10% damage. Hidden units are visible. Every 5th round (Full Moon) all tiles count as Moonlit', look: 'Silvery moonlight with bat shadows', color: '#b8c6e8' }),
    // fields created by characters
    F({ id: 'corrupted', name: 'Corrupted Tile', duration: null, ground: true, hidden: true, text: 'Hidden from the enemy. The first unit to stop or deploy on it is Corrupted. Revealed when used', look: 'Flickering pixel hexagon', color: '#ff2bd6' }),
    F({ id: 'swamp', name: 'Swamp', duration: null, ground: true, text: 'Non-Amphibious units pay +1 AP to enter and get Mired. Amphibious units heal 5%', look: 'Thick mud with bubbles', color: '#4a4a1f' }),
    F({ id: 'gas', name: 'Gas Field', duration: 3, ground: false, text: 'Harmless alone. Explodes (Ring-1, Power 80 Fire) when Fire or Electric crosses it, or when the Wisp attacks it again', look: 'Yellowish cloud in a glass bubble', color: '#e3d34a' }),
    F({ id: 'crystal_bomb', name: 'Crystal Bomb', duration: null, ground: false, text: 'Detonates when an enemy enters it: Star-2, Power 70 Radiant', look: 'Floating crystal ball with X lines', color: '#f5f0ff' }),
    F({ id: 'portal', name: 'Portal', duration: 3, ground: true, text: 'Electric Field. A friendly unit on it may pay 1 AP to appear on a free tile next to Crystal Eye', look: 'Electric vortex in a crystal ring', color: '#4FE3FF' }),
    F({ id: 'ant_trail', name: 'Ant Trail', duration: 3, ground: true, text: 'An enemy crossing or ending on a trail tile takes Power 25 once per round', look: 'Path of ants and earth', color: '#5a3a1a' }),
    F({ id: 'snare', name: 'Snare Field', duration: 3, ground: true, isNew: true, text: 'Snared: the unit may only move 1 more tile this round', look: 'Barbed wire and trap teeth', color: '#B5562B' }),
    F({ id: 'chrono', name: 'Chrono Field', duration: 1, ground: false, isNew: true, text: 'Units ending the round here get Slow. Haste on them is removed', look: 'Gears and dial rings', color: '#c9a24a' }),
    F({ id: 'marigold', name: 'Marigold Field', duration: 2, ground: false, isNew: true, text: 'Dead, Bone and Spectral units heal 6% max HP, Living units 3%. Calaca gains a Soul whenever a unit is KO\'d on it', look: 'Carpet of cempasúchil flowers', color: '#FF9A1F' }),
    F({ id: 'bandage', name: 'Bandage Field', duration: 2, ground: true, isNew: true, text: 'Enemies pay +1 AP to enter. Friendly Cloth, Cursed and Dead units heal 8% max HP', look: 'Knotted bandage carpet', color: '#E8DFC8' }),
    F({ id: 'scalded', name: 'Scalded Field', duration: 2, ground: true, isNew: true, text: '5% max HP Fire damage and 50% Burn', look: 'Scalding broth with steam', color: '#a8582a' }),
    // combinations
    F({ id: 'electrified_water', name: 'Electrified Water', duration: 3, ground: true, combo: true, text: 'Electric effects spread over all connected Water tiles. Soaked units take Electric ×1.25', look: 'Water with white lightning veins', color: '#7fd4ff' }),
    F({ id: 'contaminated_water', name: 'Contaminated Water', duration: 3, ground: true, combo: true, text: 'Toxic spreads over connected Water tiles. Units get Poison and Soaked', look: 'Water with green veil and skull bubbles', color: '#3d6b3a' }),
    F({ id: 'steam', name: 'Steam', duration: 2, ground: false, combo: true, text: 'Fog plus 3% max HP Fire damage for 2 rounds', look: 'Hot white cloud with water beads', color: '#dddddd' }),
    F({ id: 'toxic_smoke', name: 'Toxic Smoke', duration: 2, ground: false, combo: true, text: 'Fog, Poison and Blind (50%) for 2 rounds', look: 'Grey-green smoke column', color: '#5d6e4a' }),
    F({ id: 'frozen_water', name: 'Frozen Water', duration: null, ground: true, combo: true, text: 'The first unit to enter becomes Frozen for 1 round. Then it turns into Ice', look: 'Mirror-smooth ice with frozen waves', color: '#a8d8ff' }),
    F({ id: 'wildfire', name: 'Wildfire', duration: 3, ground: false, combo: true, text: 'Spreads 1 tile per round for 3 rounds, Burn 100%', look: 'Running fire in vines', color: '#ff6a1f' }),
    F({ id: 'diluted_acid', name: 'Diluted Acid', duration: 3, ground: true, combo: true, text: 'Acid at half strength, spreads over connected Water', look: 'Pale green spreading puddle', color: '#b5d66a' }),
    F({ id: 'shock_storm', name: 'Shock Storm', duration: 2, ground: false, combo: true, text: 'Shock 100% and 5% max HP Electric damage', look: 'Circling lightning with sound rings', color: '#9b8cff' }),
    F({ id: 'mutation', name: 'Mutation', duration: 3, ground: true, combo: true, text: 'Overgrowth heals Photosynthetic units 12% but also grows 1 tile per round', look: 'Fluorescent vines with radiation trefoil', color: '#b4ff3a' }),
  ].map((d) => [d.id, d]),
) as Record<FieldId, FieldDef>;

/** Fields that count as "Fire" for combinations and Gas detonation. */
export const FIRE_LIKE: FieldId[] = ['fire', 'wildfire'];
export const WATER_LIKE: FieldId[] = ['water', 'electrified_water', 'contaminated_water', 'diluted_acid'];
export const ELECTRIC_LIKE: FieldId[] = ['electric', 'electrified_water', 'portal', 'shock_storm'];
export const FOG_LIKE: FieldId[] = ['fog', 'steam', 'toxic_smoke'];

export interface ComboRule {
  a: FieldId[];
  b: FieldId[];
  result: string;
  text: string;
}

/** Section 5 combination table (existing + new, checked symmetrically). */
export const COMBOS: ComboRule[] = [
  { a: ['water'], b: ['electric'], result: 'electrified_water', text: 'Electrified Water: Electric effects spread over all connected Water tiles. Soaked units take Electric ×1.25' },
  { a: ['water'], b: ['toxic'], result: 'contaminated_water', text: 'Contaminated Water: Toxic spreads over connected Water tiles. Units get Poison and Soaked' },
  { a: ['fire'], b: ['water'], result: 'steam', text: 'Steam: Fog plus 3% max HP Fire damage for 2 rounds. Both fields are consumed' },
  { a: ['fire'], b: ['toxic'], result: 'toxic_smoke', text: 'Toxic Smoke: Fog, Poison and Blind (50%) for 2 rounds' },
  { a: ['ice'], b: ['water'], result: 'frozen_water', text: 'Frozen Water: the first unit to enter becomes Frozen for 1 round. Then it turns into Ice' },
  { a: ['fire'], b: ['ice'], result: 'melt', text: 'Fire + Ice: the Ice melts into Water' },
  { a: ['fire'], b: ['overgrowth'], result: 'wildfire', text: 'Wildfire: spreads 1 tile per round for 3 rounds, Burn 100%' },
  { a: ['fire'], b: ['swamp'], result: 'swamp_gas', text: 'Swamp Gas: the tile becomes a Gas Field and the swamp dries out' },
  { a: ['fire', 'electric'], b: ['gas'], result: 'explosion', text: 'Explosion: Ring-1, Power 80 Fire. The gas is consumed' },
  { a: ['acid'], b: ['water'], result: 'diluted_acid', text: 'Diluted Acid: half strength, spreads over connected Water' },
  { a: ['electric'], b: ['resonance'], result: 'shock_storm', text: 'Shock Storm: Shock 100% and 5% max HP Electric damage' },
  { a: ['sterile'], b: ['toxic', 'contamination'], result: 'suppressed', text: 'Suppressed: Sterile wins and removes the other field' },
  { a: ['fire'], b: ['marigold'], result: 'marigold_burn', text: 'The Marigold burns away. Calaca gains 1 Soul. Burn applies to units on it' },
  { a: ['radiation'], b: ['overgrowth'], result: 'mutation', text: 'Mutation: Overgrowth heals Photosynthetic units 12% but also grows 1 tile per round' },
];
