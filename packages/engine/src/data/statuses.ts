import type { StatusId } from '../types.ts';

export interface StatusDef {
  id: StatusId;
  name: string;
  /** default duration in rounds; -1 = until removed / rest of match; 0 = rest of round */
  duration: number;
  maxStacks: number;
  kind: 'buff' | 'debuff' | 'neutral';
  text: string;
  icon: string;
  /** removed by Antidote */
  antidote?: boolean;
  /** removed by Smelling Salts */
  salts?: boolean;
  /** not removable by any cleanse */
  uncleansable?: boolean;
  /** engine-internal marker, hidden in the regular status bar */
  internal?: boolean;
  isNew?: boolean;
}

const S = (d: StatusDef) => d;

export const STATUSES: Record<StatusId, StatusDef> = Object.fromEntries(
  [
    // core statuses (section 4)
    S({ id: 'poison', name: 'Poison', duration: 3, maxStacks: 2, kind: 'debuff', text: '5% max HP per stack at round end', icon: 'Green drop with skull', antidote: true }),
    S({ id: 'bleeding', name: 'Bleeding', duration: 3, maxStacks: 2, kind: 'debuff', text: '4% max HP per field the unit moves, per stack. A second application doubles the bleed and resets the timer', icon: 'Blood thread on a footprint' }),
    S({ id: 'burn', name: 'Burn', duration: 3, maxStacks: 2, kind: 'debuff', text: '4% max HP per stack at round end. Water Field or Soaked removes it', icon: 'Small orange flame', isNew: true }),
    S({ id: 'slow', name: 'Slow', duration: 2, maxStacks: 1, kind: 'debuff', text: 'Speed ×0.8', icon: 'Snail with a gear shell', salts: true }),
    S({ id: 'haste', name: 'Haste', duration: 2, maxStacks: 1, kind: 'buff', text: 'Speed ×1.25', icon: 'Winged shoe', isNew: true }),
    S({ id: 'blind', name: 'Blind', duration: 2, maxStacks: 1, kind: 'debuff', text: '−30 Accuracy', icon: 'Bandaged eye', salts: true }),
    S({ id: 'shock', name: 'Shock', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Each action has a 35% chance to be interrupted (AP lost)', icon: 'Cyan bolt on bone', salts: true }),
    S({ id: 'corrosion', name: 'Corrosion', duration: 2, maxStacks: 3, kind: 'debuff', text: '−15% PDef per stack. Robust units are immune', icon: 'Acid drop eating metal' }),
    S({ id: 'fear', name: 'Fear', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Cannot move closer to the source; attacks against the source get −20 Accuracy', icon: 'Trembling hands before a face', salts: true }),
    S({ id: 'marked', name: 'Marked', duration: 2, maxStacks: 1, kind: 'debuff', text: 'Attacks against it get +15 Accuracy and ignore Hidden and Fog', icon: 'Crosshair seal' }),
    S({ id: 'vulnerable', name: 'Vulnerable', duration: 2, maxStacks: 1, kind: 'debuff', text: '+20% damage taken', icon: 'Broken shield' }),
    S({ id: 'silence', name: 'Silence', duration: 2, maxStacks: 1, kind: 'debuff', text: 'Cannot use Ability commands or Ability item cards', icon: 'Sewn-shut mouth', salts: true }),
    // roster statuses
    S({ id: 'infection', name: 'Infection', duration: 3, maxStacks: 1, kind: 'debuff', text: '3% max HP per round. Spreads at round end with 25% to each adjacent unit (Viral 40%)', icon: 'Fungal spores on skin', antidote: true }),
    S({ id: 'corruption', name: 'Corruption', duration: -1, maxStacks: 1, kind: 'neutral', text: 'Current and max HP halved, damage +60%, Speed +40%. Ends if a teammate stops on the origin tile', icon: 'Glitch hexagon with pixel cracks', uncleansable: true }),
    S({ id: 'echo', name: 'Echo', duration: 2, maxStacks: 1, kind: 'debuff', text: 'Loses 3% max HP for every AP spent on its actions', icon: 'Sound wave returning twice' }),
    S({ id: 'spotlight', name: 'Spotlight', duration: 0, maxStacks: 1, kind: 'debuff', text: '+25% damage taken for the rest of the round', icon: 'Spotlight cone on a figure' }),
    S({ id: 'depressed', name: 'Depressed', duration: 0, maxStacks: 1, kind: 'debuff', text: '−25% damage dealt for the rest of the round', icon: 'Rain cloud over a mask' }),
    S({ id: 'egg', name: 'Egg', duration: 3, maxStacks: 1, kind: 'debuff', text: 'Hatching deals 10% max HP to the host and spawns a Mini Arachnia', icon: 'Speckled egg in flesh', antidote: true }),
    S({ id: 'leeched', name: 'Leeched', duration: 3, maxStacks: 1, kind: 'debuff', text: 'Drains 4% max HP at round end. Every 20 HP drained adds 1 Broth to the Pot', icon: 'Leech latching on', antidote: true }),
    S({ id: 'patient', name: 'Patient', duration: 2, maxStacks: 1, kind: 'neutral', text: "Takes ×1.35 from the Lab Assistant's Scalpel", icon: 'Medical chart with wristband' }),
    S({ id: 'jinx', name: 'Jinx', duration: 2, maxStacks: 1, kind: 'debuff', text: '−10 Accuracy and −10% damage dealt', icon: 'Broken mirror', salts: true, isNew: true }),
    S({ id: 'gilded', name: 'Gilded', duration: -1, maxStacks: 1, kind: 'buff', text: 'Speed −35%, Max Move −1, PDef/SDef +40%, damage +30%, regenerates 5% max HP per round, immune to Poison, Bleeding, Burn and Corrosion. If KO\'d the enemy gets +5 VP and +3 AP', icon: 'Gold-plated hand', uncleansable: true }),
    S({ id: 'garland', name: 'Garland', duration: 3, maxStacks: 1, kind: 'buff', text: "If KO'd, returns next round on the same tile with 30% max HP (once)", icon: 'Ring of marigold flowers', uncleansable: true }),
    S({ id: 'starving_mark', name: 'Starving Mark', duration: 2, maxStacks: 1, kind: 'debuff', text: 'Each time a friendly non-Wendigo unit damages it, the Wendigo team banks +1 Feast AP (max +2 per round)', icon: 'Empty bowl with a cross' }),
    S({ id: 'snared', name: 'Snared', duration: 1, maxStacks: 1, kind: 'debuff', text: 'May move only 1 more tile this round', icon: 'Trap jaw around a foot' }),
    S({ id: 'dazed', name: 'Dazed', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Speed −20', icon: 'Circling stars', salts: true }),
    S({ id: 'mired', name: 'Mired', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Speed −15', icon: 'Foot stuck in mud' }),
    S({ id: 'soaked', name: 'Soaked', duration: 1, maxStacks: 1, kind: 'neutral', text: 'Electric ×1.25, Fire ×0.75, removes Burn', icon: 'Water drop on a spark' }),
    S({ id: 'frozen', name: 'Frozen', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Cannot move. Fire damage ×1.25', icon: 'Ice crystal encasing a foot' }),
    S({ id: 'well_fed', name: 'Well Fed', duration: 2, maxStacks: 1, kind: 'buff', text: '+10% damage', icon: 'Steaming spoon' }),
    S({ id: 'exhausted', name: 'Exhausted', duration: 1, maxStacks: 1, kind: 'debuff', text: 'Speed −15%', icon: 'Hanging tongue', isNew: true }),
    // generic buffs / debuffs used by items
    S({ id: 'empowered', name: 'Empowered', duration: 2, maxStacks: 1, kind: 'buff', text: '+25% damage dealt', icon: 'Clenched fist with embers' }),
    S({ id: 'weakened', name: 'Weakened', duration: 2, maxStacks: 1, kind: 'debuff', text: '−20% damage dealt', icon: 'Limp hand' }),
    S({ id: 'fortified', name: 'Fortified', duration: 2, maxStacks: 1, kind: 'buff', text: 'PDef and SDef +20%', icon: 'Reinforced shield' }),
    S({ id: 'brittle', name: 'Brittle', duration: 2, maxStacks: 1, kind: 'debuff', text: 'PDef and SDef −20%. Robust units are immune', icon: 'Shield with cracks' }),
    S({ id: 'regeneration', name: 'Regeneration', duration: 3, maxStacks: 1, kind: 'buff', text: 'Heals 5% max HP at the start of each round', icon: 'Heart with green plus' }),
    S({ id: 'hidden', name: 'Hidden', duration: -1, maxStacks: 1, kind: 'buff', text: 'Not shown to the enemy. Revealed when damaged, when attacking, after 2 rounds, or after moving more than 2 fields in one round', icon: 'Eye behind a curtain', uncleansable: true }),
    S({ id: 'entranced', name: 'Entranced', duration: -1, maxStacks: 1, kind: 'neutral', text: 'While the Voodoo copy lives Mambo cannot move, attack or use abilities', icon: 'Spiral eyes', uncleansable: true }),
    // internal helpers
    S({ id: 'hex', name: 'Hex', duration: 2, maxStacks: 1, kind: 'debuff', text: 'The next Spirit Link on this unit deals +25% damage', icon: 'Voodoo pin', internal: false }),
    S({ id: 'overclock', name: 'Overclock', duration: 2, maxStacks: 1, kind: 'buff', text: 'Next damaging action deals ×1.5 damage', icon: 'Overclocked chip' }),
    S({ id: 'cleanse_immune', name: 'Antidote Immunity', duration: 1, maxStacks: 1, kind: 'buff', text: 'Immune to Poison, Infection, Egg and Leeched', icon: 'Green ampoule', internal: true }),
    S({ id: 'regen_paused', name: 'Regeneration paused', duration: 1, maxStacks: 1, kind: 'neutral', text: 'Regenerative is paused after Fire or Acid damage', icon: 'Wilted sprout', internal: true }),
    S({ id: 'mirror_charm', name: 'Mirror Charm', duration: 2, maxStacks: 1, kind: 'buff', text: 'The next Special hit is reduced by 40% and reflected to the attacker', icon: 'Broken hand mirror' }),
    S({ id: 'blood_pact', name: 'Blood Pact', duration: 2, maxStacks: 1, kind: 'buff', text: 'Next attack costs 1 AP less and deals +20% damage', icon: 'Blood seal', internal: false }),
    S({ id: 'phoenix', name: 'Phoenix Feather', duration: 3, maxStacks: 1, kind: 'buff', text: "If KO'd, returns next round with 40% max HP (once)", icon: 'Burning feather', uncleansable: true }),
    S({ id: 'silence_immune', name: 'Vocal Tonic', duration: 0, maxStacks: 1, kind: 'buff', text: 'Immune to Silence this round', icon: 'Cough syrup', internal: true }),
  ].map((d) => [d.id, d]),
) as Record<StatusId, StatusDef>;

/** End-phase tick order (section 4): Burn → Poison → Infection spread → Leeched → Echo → Regeneration. */
export const TICK_ORDER: StatusId[] = ['burn', 'poison', 'infection', 'leeched', 'echo', 'regeneration'];

export const ANTIDOTE_REMOVES: StatusId[] = ['poison', 'infection', 'egg', 'leeched'];
export const SALTS_REMOVES: StatusId[] = ['shock', 'fear', 'blind', 'slow', 'dazed', 'silence', 'jinx'];
export const NEGATIVE_STATUSES: StatusId[] = (Object.values(STATUSES) as StatusDef[])
  .filter((s) => s.kind === 'debuff')
  .map((s) => s.id);
