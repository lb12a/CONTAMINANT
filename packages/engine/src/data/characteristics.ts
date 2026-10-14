import type { CharCategory, DamageTag, StatusId } from '../types.ts';

export interface CharacteristicDef {
  id: string;
  name: string;
  category: CharCategory;
  isNew?: boolean;
  buff: string;
  weakness: string;
  /** unconditional incoming damage multipliers by tag (weak ×1.25, strong weak ×1.5, resist ×0.8 ...) */
  tagMult?: Partial<Record<DamageTag, number>>;
  /** statuses this characteristic is immune to */
  immune?: StatusId[];
  /** icon motif from the UI asset document (section 5A) */
  icon: string;
}

/** Ring colours per category (UI doc section 4/5). */
export const CATEGORY_COLORS: Record<CharCategory, string> = {
  material: '#B5562B',
  existence: '#9FB7FF',
  movement: '#4FE3FF',
  trait: '#8CFF5A',
  mind: '#6B3FA0',
};

const C = (d: CharacteristicDef) => d;

export const CHARACTERISTICS: Record<string, CharacteristicDef> = Object.fromEntries(
  [
    // ------------------------------------------------------------ Material
    C({ id: 'organic', name: 'Organic', category: 'material', buff: 'Healing received +20%', weakness: 'Toxic and Acid damage ×1.25', tagMult: { toxic: 1.25, acid: 1.25 }, icon: 'Pulsing heart with roots' }),
    C({ id: 'steel', name: 'Steel', category: 'material', buff: 'Slash and Pierce ×0.8', weakness: 'Electric ×1.25', tagMult: { slash: 0.8, pierce: 0.8, electric: 1.25 }, icon: 'Riveted steel plate' }),
    C({ id: 'crystal', name: 'Crystal', category: 'material', buff: 'Radiant ×0.6, Psychic ×0.8', weakness: 'Blunt ×1.25, Sonic ×1.5', tagMult: { radiant: 0.6, psychic: 0.8, blunt: 1.25, sonic: 1.5 }, icon: 'Shattered crystal' }),
    C({ id: 'liquid', name: 'Liquid', category: 'material', buff: 'Slash and Pierce ×0.8', weakness: 'Fire ×1.25, Frozen lasts +1 round', tagMult: { slash: 0.8, pierce: 0.8, fire: 1.25 }, icon: 'Drop in a test tube' }),
    C({ id: 'gas', name: 'Gas', category: 'material', buff: 'Blunt, Slash, Pierce ×0.7. Knockback and Pull distance −1', weakness: 'Fire ×1.5 (also ignites: Burn), Electric ×1.25', tagMult: { blunt: 0.7, slash: 0.7, pierce: 0.7, fire: 1.5, electric: 1.25 }, icon: 'Smoke rising from a bottle' }),
    C({ id: 'synthetic', name: 'Synthetic', category: 'material', buff: 'Immune to Poison and Infection', weakness: 'Acid ×1.25, Corrosion lasts +1 round', tagMult: { acid: 1.25 }, immune: ['poison', 'infection'], icon: 'Plastic cube with screws' }),
    C({ id: 'bone', name: 'Bone', category: 'material', isNew: true, buff: 'Slash and Pierce ×0.75, immune to Bleeding', weakness: 'Blunt ×1.25, Sonic ×1.25', tagMult: { slash: 0.75, pierce: 0.75, blunt: 1.25, sonic: 1.25 }, immune: ['bleeding'], icon: 'Crossed bones' }),
    C({ id: 'cloth', name: 'Cloth', category: 'material', isNew: true, buff: 'Blunt ×0.75', weakness: 'Fire ×1.5, Acid ×1.25', tagMult: { blunt: 0.75, fire: 1.5, acid: 1.25 }, icon: 'Cloth bale with thick seam' }),
    C({ id: 'wood', name: 'Wood', category: 'material', isNew: true, buff: 'Blunt ×0.8, Electric ×0.5', weakness: 'Fire ×1.5, Slash ×1.25', tagMult: { blunt: 0.8, electric: 0.5, fire: 1.5, slash: 1.25 }, icon: 'Log with growth rings' }),
    C({ id: 'ether', name: 'Ether', category: 'material', isNew: true, buff: 'Immune to Bleeding and Corrosion', weakness: 'Sonic ×1.25, Psychic ×1.25', tagMult: { sonic: 1.25, psychic: 1.25 }, immune: ['bleeding', 'corrosion'], icon: 'Translucent veil with handprint' }),
    // ------------------------------------------------------------ Existence
    C({ id: 'living', name: 'Living', category: 'existence', buff: 'Healing received +10%', weakness: 'Soul ×1.25, chance to be Infected +25%', tagMult: { soul: 1.25 }, icon: 'Heart with pulse line' }),
    C({ id: 'dead', name: 'Dead', category: 'existence', buff: 'Immune to Bleeding and Infection', weakness: 'Radiant ×1.25. Healing received −30%, except from Poison, Souls, Marigold and Bandage fields', tagMult: { radiant: 1.25 }, immune: ['bleeding', 'infection'], icon: 'Skull' }),
    C({ id: 'spectral', name: 'Spectral', category: 'existence', buff: 'Blunt, Slash, Pierce ×0.8. No collision damage', weakness: 'Radiant ×1.25, Soul ×1.25', tagMult: { blunt: 0.8, slash: 0.8, pierce: 0.8, radiant: 1.25, soul: 1.25 }, icon: 'Ghost with flowing cloth' }),
    C({ id: 'artificial', name: 'Artificial', category: 'existence', buff: 'Poison and Infection last 1 round shorter', weakness: 'Healing received −25% (Repair items excluded), Shock lasts +1 round', icon: 'Gear with an eye' }),
    C({ id: 'colony', name: 'Colony', category: 'existence', buff: 'Single-target attacks ×0.85', weakness: 'Area attacks (ring, burst, cone, line, star) ×1.25', icon: 'Swarm of small circles linked by threads' }),
    C({ id: 'cursed', name: 'Cursed', category: 'existence', isNew: true, buff: 'Soul and Psychic ×0.75', weakness: 'Radiant ×1.25. On Sterile Fields −5% max HP per round', tagMult: { soul: 0.75, psychic: 0.75, radiant: 1.25 }, icon: 'Eye in a chain with pentagram ring' }),
    C({ id: 'mythic', name: 'Mythic', category: 'existence', isNew: true, buff: 'Immune to Fear, status chances against it −20%', weakness: 'Radiant ×1.25, Fire ×1.25', tagMult: { radiant: 1.25, fire: 1.25 }, immune: ['fear'], icon: 'Horned skull before the moon' }),
    // ------------------------------------------------------------ Movement
    C({ id: 'grounded', name: 'Grounded', category: 'movement', buff: '+10% PDef and SDef if it did not move this round', weakness: 'Ground fields hit it fully. Cannot cross Obstacles', icon: 'Footprint' }),
    C({ id: 'amphibious', name: 'Amphibious', category: 'movement', buff: 'Water and Swamp tiles cost 0 AP. Heals 5% max HP at round end on Water or Swamp', weakness: 'Electric ×1.25 while on Water. Speed −10% on Fire, Ash and Sterile tiles', icon: 'Footprint with a wave' }),
    C({ id: 'airborne', name: 'Airborne', category: 'movement', buff: 'Ignores ground fields (Water, Ice, Toxic, Acid, Swamp, Overgrowth, Snare, Bandage, Scalded, Corrupted, ground Electric)', weakness: 'Pierce ×1.25, knockback +1 tile', tagMult: { pierce: 1.25 }, icon: 'Raven feather with wing' }),
    C({ id: 'rooted', name: 'Rooted', category: 'movement', isNew: true, buff: 'PDef and SDef +20%. Immune to enemy Knockback, Pull, Swap and Teleport', weakness: 'Max Move 0 (moves only through its own abilities). Fire ×1.25. Field damage ×1.25', tagMult: { fire: 1.25 }, icon: 'Roots gripping the ground' }),
    C({ id: 'burrowing', name: 'Burrowing', category: 'movement', isNew: true, buff: 'Moves through Obstacles for +1 AP per tile (cannot end inside). Ignores Snare and Swamp slow', weakness: 'Cannot burrow under Water, Swamp or Ice. Sonic ×1.25', tagMult: { sonic: 1.25 }, icon: 'Earth mound with a hand' }),
    C({ id: 'phasing', name: 'Phasing', category: 'movement', isNew: true, buff: 'Moves through units and Obstacles (cannot end inside). No collision damage', weakness: 'Solid on Resonance and Sterile tiles. Soul ×1.25', tagMult: { soul: 1.25 }, icon: 'Foot half inside a dashed wall' }),
    // ------------------------------------------------------------ Trait
    C({ id: 'toxic', name: 'Toxic', category: 'trait', buff: 'Poison ticks on it deal −50%. Toxic damage ×0.5', weakness: 'Sterile Fields −5% max HP per round. Acid ×1.25', tagMult: { toxic: 0.5, acid: 1.25 }, icon: 'Poison bottle with green drop' }),
    C({ id: 'viral', name: 'Viral', category: 'trait', buff: 'Infection it applies spreads at 40% instead of 25%', weakness: 'Fire ×1.25. Sterile Fields suppress its spread', tagMult: { fire: 1.25 }, icon: 'Studded virus sphere' }),
    C({ id: 'parasitic', name: 'Parasitic', category: 'trait', buff: 'Heals 15% of the damage it deals to Organic and Living targets', weakness: 'Deals −20% damage to Steel, Crystal, Synthetic and Gas targets', icon: 'Leech with sucker mouth' }),
    C({ id: 'regenerative', name: 'Regenerative', category: 'trait', buff: '+4% max HP at the start of each round', weakness: 'Regeneration pauses 1 round after Fire or Acid damage. Radiation Fields switch it off', icon: 'Sprout growing from a heart' }),
    C({ id: 'photosynthetic', name: 'Photosynthetic', category: 'trait', buff: '+5% max HP at round end (+8% on Overgrowth), not in Darkness', weakness: 'Darkness: −10% damage. Fire and Toxic ×1.25', tagMult: { fire: 1.25, toxic: 1.25 }, icon: 'Leaf with rays' }),
    C({ id: 'perceptive', name: 'Perceptive', category: 'trait', buff: '+10% Accuracy. Sees Hidden units and Traps within 3 tiles', weakness: 'Blind lasts +1 round, Sonic ×1.25', tagMult: { sonic: 1.25 }, icon: 'Wide open eye' }),
    C({ id: 'robust', name: 'Robust', category: 'trait', buff: 'Defense cannot be lowered (Corrosion, Brittle)', weakness: 'Speed −10%, Slow lasts +1 round', immune: ['corrosion', 'brittle'], icon: 'Heavy cracked shield' }),
    C({ id: 'volatile', name: 'Volatile', category: 'trait', isNew: true, buff: 'Fire damage +15%. On KO it explodes: Ring-1, Power 60 Fire, friend and foe', weakness: 'Soaked halves its Fire damage and blocks its Burn. Electric ×1.25', tagMult: { electric: 1.25 }, icon: 'Round bomb with burning fuse' }),
    C({ id: 'predatory', name: 'Predatory', category: 'trait', isNew: true, buff: '+25% damage against targets below 50% HP', weakness: '−15% damage against targets at full HP', icon: 'Fang' }),
    C({ id: 'chronal', name: 'Chronal', category: 'trait', isNew: true, buff: 'Wins all Speed ties. Slow effects on it −50%', weakness: 'Shock and Frozen last +1 round. Haste on it −50%', icon: 'Cracked pocket watch' }),
    C({ id: 'conductive', name: 'Conductive', category: 'trait', isNew: true, buff: 'Shock has no effect on it but still counts as "shocked". Its Electric attacks +15%', weakness: 'Electric ×1.25', tagMult: { electric: 1.25 }, icon: 'Copper coil with lightning' }),
    // ------------------------------------------------------------ Mind
    C({ id: 'emotional', name: 'Emotional', category: 'mind', buff: '+10% damage if an ally was KO\'d last round', weakness: 'Fear chance ×1.5, Psychic ×1.25', tagMult: { psychic: 1.25 }, icon: 'Mask with a tear' }),
    C({ id: 'emotionless', name: 'Emotionless', category: 'mind', buff: 'Immune to Fear, Depressed and Spotlight. Psychic ×0.5', weakness: 'Cannot benefit from Morale effects (Empowered and Well Fed from allies or items). Marked lasts +1 round', tagMult: { psychic: 0.5 }, immune: ['fear', 'depressed', 'spotlight'], icon: 'Blank smooth mask' }),
    C({ id: 'hive_mind', name: 'Hive Mind', category: 'mind', buff: '+5% Accuracy and +5% PDef/SDef per adjacent friendly Hive Mind unit (max +15%)', weakness: 'When a Hive Mind ally is KO\'d, all Hive Mind units are Dazed (−20 Speed, 1 round)', icon: 'Three heads joined by threads' }),
    C({ id: 'multi_minded', name: 'Multi-Minded', category: 'mind', buff: 'Fear, Silence, Depressed and Spotlight last 1 round shorter', weakness: 'First action of each round: −10% Accuracy', icon: 'Mask with three faces' }),
    C({ id: 'feral', name: 'Feral', category: 'mind', isNew: true, buff: 'Below 50% HP: +15% damage and +10 Speed. Immune to Fear', weakness: 'Gear items work at 50% strength', immune: ['fear'], icon: 'Triple claw marks' }),
    C({ id: 'greedy', name: 'Greedy', category: 'mind', isNew: true, buff: '+1 AP next round for each KO this unit makes', weakness: 'Enemy gets +3 VP when it is KO\'d', icon: 'Bulging coin sack' }),
    C({ id: 'devoted', name: 'Devoted', category: 'mind', isNew: true, buff: '+10% SDef per friendly unit within 2 tiles (max +20%)', weakness: 'No friend within 3 tiles: −10% Accuracy, Fear chance ×1.25', icon: 'Folded hands with a voodoo doll' }),
    C({ id: 'insatiable', name: 'Insatiable', category: 'mind', isNew: true, buff: 'Heals 10% max HP whenever any unit is KO\'d within 3 tiles', weakness: 'Loses 5% max HP at round end if no unit was KO\'d that round (never below 1 HP)', icon: 'Gaping maw' }),
  ].map((d) => [d.id, d]),
);

export const CATEGORY_ORDER: CharCategory[] = ['material', 'existence', 'movement', 'trait', 'mind'];

export function characteristicsOf(category: CharCategory): CharacteristicDef[] {
  return Object.values(CHARACTERISTICS).filter((c) => c.category === category);
}
