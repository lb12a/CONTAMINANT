import type { AbilityDef, AttackDef, CharacterDef, CharCategory, Rarity, Stats, Tier, Zone } from '../types.ts';

type AtkIn = Omit<AttackDef, 'id' | 'crit' | 'maxUses' | 'targeting'> &
  Partial<Pick<AttackDef, 'crit' | 'maxUses' | 'targeting'>> & { key: string };

function atk(owner: string, a: AtkIn): AttackDef {
  const { key, ...rest } = a;
  return {
    crit: 0,
    maxUses: 1,
    targeting: 'character',
    ...rest,
    id: `${owner}.${key}`,
  };
}

function abil(owner: string, a: Omit<AbilityDef, 'id'> & { key: string }): AbilityDef {
  const { key, ...rest } = a;
  return { ...rest, id: `${owner}.${key}` };
}

function chars(material: string, existence: string, movement: string, trait: string, mind: string): Record<CharCategory, string> {
  return { material, existence, movement, trait, mind };
}

function st(hp: number, patk: number, pdef: number, satk: number, sdef: number, speed: number): Stats {
  return { hp, patk, pdef, satk, sdef, speed };
}

interface CharIn {
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
  attacks: AtkIn[];
  ability: Omit<AbilityDef, 'id'> & { key: string };
  altAttacks?: Record<string, AtkIn[]>;
  zone: Zone;
  maxCopies?: number;
  portrait: string;
  palette: [string, string];
  role: string;
}

function def(c: CharIn): CharacterDef {
  return {
    ...c,
    maxCopies: c.maxCopies ?? 1,
    attacks: c.attacks.map((a, i) => ({ ...atk(c.id, a), slot: i + 1 })),
    ability: abil(c.id, c.ability),
    altAttacks: c.altAttacks
      ? Object.fromEntries(
          Object.entries(c.altAttacks).map(([k, list]) => [k, list.map((a, i) => ({ ...atk(c.id, a), slot: i + 1 }))]),
        )
      : undefined,
  };
}

export const CHARACTER_LIST: CharacterDef[] = [
  def({
    id: 'arachnia', num: 1, name: 'Arachnia', title: 'tank and poison zoner', rarity: 'rare', tier: 'standard', deploy: 6,
    stats: st(520, 85, 95, 60, 70, 65), move: 4, apPerField: 1,
    chars: chars('organic', 'living', 'grounded', 'toxic', 'emotional'),
    attacks: [
      { key: 'poison_bite', name: 'Poison Bite', category: 'physical', tag: 'pierce', power: 60, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, statuses: [{ id: 'poison', chance: 0.35 }], text: 'Poison 35%.' },
      { key: 'lay_eggs', name: 'Lay Eggs', category: 'physical', tag: 'pierce', power: 30, range: 1, ap: 3, acc: 90, maxUses: 1, custom: 'lay_eggs', text: 'The target must be Living and receives an Egg (one Egg per Arachnia at a time). If Arachnia is still alive 3 rounds later, the egg hatches: the host takes 10% max HP and a Mini Arachnia appears next to it on your side. If the Mini survives 3 more rounds it grows into a full Arachnia. Limit: 2 hatched per game, no KO reward.' },
    ],
    ability: { key: 'ambush_venom', name: 'Ambush Venom', passive: true, text: 'If she has moved fewer than 2 fields this round, every enemy within 4 tiles that damages her is Poisoned with a chance of 100% ÷ (1 + fields moved so far). Arachnophobia: Emotional enemies attacking her from range 1–2 get −10 Accuracy.' },
    zone: 'bog', portrait: 'Giant mutant spider with a fleshy torso and egg bulges on the belly', palette: ['#4a7a2a', '#6b4a2a'], role: 'Tank / poison zoner',
  }),
  def({
    id: 'nexus', num: 2, name: 'Nexus', title: 'fast artillery and corrupter', rarity: 'epic', tier: 'standard', deploy: 6,
    stats: st(260, 40, 50, 95, 60, 160), move: 5, apPerField: 1,
    chars: chars('synthetic', 'artificial', 'grounded', 'viral', 'emotional'),
    attacks: [
      { key: 'long_shot', name: 'Long Shot', category: 'special', tag: 'electric', power: 55, range: 7, ap: 2, acc: 85, crit: 8, maxUses: 2, text: 'Range 7 (High).' },
      { key: 'overclock', name: 'Overclock', category: 'support', range: 6, ap: 2, acc: null, maxUses: 1, targeting: 'ally', custom: 'overclock', text: 'Choose a Corrupted friendly unit: its next damaging action deals ×1.5 damage (lasts 2 rounds). Max 1 per target.' },
    ],
    ability: { key: 'corrupt', name: 'Corrupt', passive: true, onDeploy: true, text: 'On Deploy: 3 random tiles outside the enemy deployment zone are Corrupted and hidden from the enemy (re-roll all 3 up to 3 times in the deploy round). A unit that stops on or deploys onto a Corrupted Tile gets Corruption (current and max HP halved, damage +60%, Speed +40%). Each tile corrupts one unit. Corruption ends when another unit of the same player takes the tile over. If Nexus is KO\'d, all Corrupted Tiles and all Corruption disappear.' },
    zone: 'laboratory', portrait: 'An old handheld device whose screen shows a grinning virus face', palette: ['#ff2bd6', '#4FE3FF'], role: 'Artillery / corrupter',
  }),
  def({
    id: 'vile', num: 3, name: 'Vile', title: 'slow reaper and poison engine', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(340, 100, 55, 90, 75, 40), move: 3, apPerField: 1,
    chars: chars('organic', 'dead', 'grounded', 'toxic', 'emotional'),
    attacks: [
      { key: 'reapers_slash', name: "Reaper's Slash", category: 'physical', tag: 'slash', power: 70, range: 1, ap: 2, acc: 90, crit: 25, maxUses: 2, text: 'Crit 25%.' },
      { key: 'miasma_rot', name: 'Miasma Rot', category: 'special', tag: 'toxic', power: 40, range: 4, ap: 3, acc: null, maxUses: 1, targeting: 'field', custom: 'miasma_rot', text: 'Creates a Toxic Field on the tile for 2 rounds and hits the unit on it, which is Poisoned (100%). If a unit Poisoned by this attack dies, Vile teleports onto its tile and deals Power 35 Special / Toxic to every unit within 1 tile.' },
    ],
    ability: { key: 'rot_siphon', name: 'Rot Siphon', passive: true, text: 'Poison on Vile heals him 5% max HP per tick instead of damaging him, and each tick raises his max HP by +1% (up to +30%). A Toxic Field under him counts as one Poison tick.' },
    zone: 'graveyard', portrait: 'Grim reaper of tough slime with a human skull', palette: ['#8CFF5A', '#1F2A22'], role: 'Reaper / poison engine',
  }),
  def({
    id: 'cruorina', num: 4, name: 'Cruorina', title: 'blood ghost and area caster', rarity: 'legendary', tier: 'elite', deploy: 8,
    stats: st(300, 50, 40, 105, 70, 110), move: 5, apPerField: 1,
    chars: chars('liquid', 'spectral', 'airborne', 'regenerative', 'emotional'),
    attacks: [
      { key: 'crimson_lance', name: 'Crimson Lance', category: 'special', tag: 'pierce', power: 60, range: 4, ap: 2, acc: 90, crit: 10, maxUses: 2, targeting: 'field', shape: 'line', custom: 'lance', text: 'Pierces: hits every unit on the straight line up to its range.' },
      { key: 'hemorrhage_burst', name: 'Hemorrhage Burst', category: 'special', tag: 'toxic', power: 95, range: 0, ap: 3, acc: null, crit: 5, maxUses: 1, targeting: 'self', shape: 'ring1', friendlyFire: true, custom: 'hemorrhage', text: 'Ring-1 around her (friend and foe). Afterwards she bleeds for 3 rounds, losing 3% max HP for each field she moves.' },
    ],
    ability: { key: 'blood_drain', name: 'Blood Drain', passive: true, text: "When an enemy dies within 1 tile of her, she heals 15% of that unit's max HP." },
    zone: 'tomb', portrait: 'Elegant ghost girl of black and red blood, castor vines in her hair', palette: ['#8B1A1F', '#0E0A12'], role: 'Area caster',
  }),
  def({
    id: 'mycel', num: 5, name: 'Mycel', title: 'support and status punisher', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(300, 40, 60, 80, 90, 75), move: 3, apPerField: 1,
    chars: chars('organic', 'living', 'grounded', 'parasitic', 'hive_mind'),
    attacks: [
      { key: 'sporecloud', name: 'Sporecloud', category: 'special', tag: 'toxic', power: 40, range: 3, ap: 2, acc: 90, crit: 5, maxUses: 2, targeting: 'field', shape: 'cone3', custom: 'sporecloud', text: 'Cone-3. +50% damage (Power 60) against targets with any status effect.' },
      { key: 'mind_root', name: 'Mind Root', category: 'support', range: 3, ap: 3, acc: null, maxUses: 1, targeting: 'ally', custom: 'mind_root', text: 'Heals the Symbiosis unit for 20% max HP and removes 1 negative status.' },
    ],
    ability: { key: 'symbiosis', name: 'Telepathic Symbiosis', passive: true, text: 'At the start of each round Mycel links to the friendly unit with the highest max HP within 3 tiles. That unit takes 25% less damage and Mycel takes the removed 25% instead, ignoring her defenses. The link ends if Mycel is KO\'d.' },
    zone: 'bog', portrait: 'Alien fungus releasing spore clouds, mushrooms growing from a host', palette: ['#6B3FA0', '#E8DFC8'], role: 'Support / punisher',
  }),
  def({
    id: 'lullabun', num: 6, name: 'Lullabun', title: 'ambush assassin', rarity: 'rare', tier: 'standard', deploy: 4,
    stats: st(250, 95, 45, 40, 55, 120), move: 5, apPerField: 0.75,
    chars: chars('cloth', 'artificial', 'grounded', 'perceptive', 'emotionless'),
    attacks: [
      { key: 'stuffing_slash', name: 'Stuffing Slash', category: 'physical', tag: 'slash', power: 55, range: 1, ap: 2, acc: 95, crit: 10, maxUses: 2, custom: 'stuffing_slash', text: 'Always crits if he was Hidden until now and this is his first attack.' },
      { key: 'swap_places', name: 'Swap Places', category: 'physical', tag: 'blunt', power: 50, range: 4, ap: 3, acc: 85, maxUses: 1, custom: 'swap_places', text: 'After the hit he swaps tiles with the target.' },
    ],
    ability: { key: 'peek_a_boo', name: 'Peek-a-Boo', passive: true, onDeploy: true, text: 'When deployed he causes no pop-up and is Hidden until he takes damage, attacks, 2 rounds pass, or he moves more than 2 fields in one round. Perceptive units within 3 tiles see him.' },
    zone: 'toyroom', portrait: 'Plush bunny with button eyes, knife claw behind its back, lurking in shadow', palette: ['#d97aa0', '#0E0A12'], role: 'Assassin',
  }),
  def({
    id: 'pumpkin', num: 7, name: 'Trick or Trade Pumpkin', title: 'rooted bomber and economy bait', rarity: 'uncommon', tier: 'standard', deploy: 4,
    stats: st(320, 70, 70, 75, 60, 70), move: 0, apPerField: 1,
    chars: chars('organic', 'living', 'rooted', 'photosynthetic', 'emotional'),
    attacks: [
      { key: 'teleport_trick', name: 'Teleport Trick', category: 'physical', tag: 'blunt', power: 55, range: 3, ap: 3, acc: 100, crit: 5, maxUses: 1, targeting: 'field', custom: 'teleport_trick', text: 'Teleports up to 3 tiles to a free tile, then hits the enemy with the lowest current HP within 1 tile.' },
      { key: 'candy_rain', name: 'Candy Rain', category: 'physical', tag: 'blunt', power: 65, range: 4, ap: 3, acc: null, crit: 5, maxUses: 1, priority: -1, heavy: true, targeting: 'multi-field', custom: 'candy_rain', text: 'Choose 3 tiles. At execution all of them explode. Priority −1.' },
    ],
    ability: { key: 'trade', name: 'Trade', passive: true, text: "If it is KO'd after standing on the board for at least 2 rounds, its owner gets +2 AP and the enemy loses 2 AP in the next round." },
    zone: 'forest', portrait: 'Pumpkin plant with vines and candy spilling from its mouth', palette: ['#FF9A1F', '#3a6a2a'], role: 'Bomber / economy',
  }),
  def({
    id: 'steak', num: 8, name: 'Rotten Flesh Steak', title: 'tank that bites back', rarity: 'uncommon', tier: 'standard', deploy: 5,
    stats: st(560, 85, 80, 40, 55, 60), move: 3, apPerField: 1.25,
    chars: chars('organic', 'living', 'grounded', 'parasitic', 'emotional'),
    attacks: [
      { key: 'snap', name: 'Snap', category: 'physical', tag: 'pierce', power: 55, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, custom: 'lifesteal15', text: 'Parasitic: heals 15% of the damage dealt.' },
      { key: 'order_up', name: 'Order Up', category: 'physical', tag: 'blunt', power: 70, range: 3, ap: 3, acc: null, crit: 5, maxUses: 1, targeting: 'field', shape: 'ring1', custom: 'order_up', text: 'Jump to a free tile within 3, hits Ring-1 around the landing tile. Enemies with max HP of 350 or less are pushed 1 tile away.' },
    ],
    ability: { key: 'fake_steak', name: 'Fake Steak', passive: true, text: 'An attack made from 1–2 tiles away reflects recoil to the attacker: 30% of the damage taken at range 1, 20% at range 2 (max 60 per hit).' },
    zone: 'graveyard', portrait: 'Giant rotten steak with a row of teeth, flies and forks', palette: ['#b56a7a', '#6b4a2a'], role: 'Tank',
  }),
  def({
    id: 'ballerina', num: 9, name: 'Rusted Ballerina', title: 'high-crit dancer', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(280, 100, 60, 45, 50, 135), move: 5, apPerField: 0.75,
    chars: chars('steel', 'artificial', 'grounded', 'robust', 'emotional'),
    attacks: [
      { key: 'pirouette', name: 'Pirouette', category: 'physical', tag: 'slash', power: 55, range: 0, ap: 2, acc: null, crit: 5, maxUses: 2, targeting: 'self', shape: 'ring1', friendlyFire: true, custom: 'pirouette', text: 'Ring-1 around her (friends too). Crit 5% plus 8% for each field moved this round (max 3 fields, so 29%).' },
      { key: 'grand_jete', name: 'Grand Jeté', category: 'physical', tag: 'slash', power: 95, range: 2, ap: 3, acc: 85, crit: 10, maxUses: 1, custom: 'grand_jete', text: 'Teleports 1 tile, then strikes one target within 1 tile.' },
    ],
    ability: { key: 'encore', name: 'Encore', passive: true, text: 'If a Character-Target attack aimed at her misses because she moved out of range, or a field attack lands next to her instead of on her, she gains 1 Token (max 2). The next time she deals damage, that attack hits again once per Token for 25% of the original damage.' },
    zone: 'toyroom', portrait: 'Rusted metal ballerina in music-box pose with cracks', palette: ['#B5562B', '#c0c0c8'], role: 'Burst',
  }),
  def({
    id: 'piggybank', num: 10, name: 'Piggybank', title: 'economy support', rarity: 'common', tier: 'standard', deploy: 3,
    stats: st(280, 50, 80, 70, 80, 80), move: 3, apPerField: 1,
    chars: chars('synthetic', 'living', 'grounded', 'robust', 'emotional'),
    attacks: [
      { key: 'penny_shot', name: 'Penny Shot', category: 'physical', tag: 'pierce', power: 50, range: 5, ap: 2, acc: 90, crit: 5, maxUses: 2, custom: 'penny_shot', text: 'Power 50 +10% per Coin (max 6 Coins, so Power 80). Range 5.' },
      { key: 'shake_down', name: 'Shake Down', category: 'utility', range: 0, ap: 1, acc: null, maxUses: 2, targeting: 'self', custom: 'shake_down', text: 'Loses 10% max HP and gains 2 Coins.' },
    ],
    ability: { key: 'savings', name: 'Savings', passive: true, text: 'If you spent less than 50% of the round\'s AP, Piggybank gains 1 Coin at round end (max 6). Deploying a character onto a tile next to it lowers that character\'s Deploy AP by 1 for every 2 Coins (max −3), and those Coins are spent.' },
    zone: 'toyroom', portrait: 'White porcelain piggy bank with sadly painted eyes and cracks', palette: ['#f0ece0', '#D9A93A'], role: 'Economy',
  }),
  def({
    id: 'scarecrow', num: 11, name: 'Scarecrow', title: 'information and control', rarity: 'common', tier: 'standard', deploy: 4,
    stats: st(340, 75, 70, 55, 65, 70), move: 3, apPerField: 1,
    chars: chars('wood', 'artificial', 'grounded', 'perceptive', 'emotional'),
    attacks: [
      { key: 'harvest_hook', name: 'Harvest Hook', category: 'physical', tag: 'slash', power: 50, range: 2, ap: 2, acc: 90, crit: 5, maxUses: 2, pull: 1, text: 'Pulls the target 1 tile toward him.' },
      { key: 'barbed_fence', name: 'Barbed Fence', category: 'utility', range: 4, ap: 2, acc: null, maxUses: 1, targeting: 'multi-field', custom: 'barbed_fence', text: 'Two adjacent tiles. No damage. Creates Snare Fields for 3 rounds.' },
    ],
    ability: { key: 'watchful_eye', name: 'Watchful Eye', passive: true, text: 'Each round choose 1 enemy character to watch. In the last 10 seconds of planning you see its full plan: moves, attacks, targets and their order. If it is Hidden you also see its tile. The Lab Assistant is immune.' },
    zone: 'forest', portrait: 'Scarecrow of wood and straw with a harvest hook, ravens on its shoulders', palette: ['#7a5a2a', '#0E0A12'], role: 'Information / control',
  }),
  def({
    id: 'frankenstein', num: 12, name: 'Semi-Mechanical Frankenstein', title: 'electric bruiser', rarity: 'epic', tier: 'elite', deploy: 7,
    stats: st(420, 85, 65, 80, 50, 85), move: 3, apPerField: 1,
    chars: chars('organic', 'artificial', 'grounded', 'conductive', 'emotionless'),
    attacks: [
      { key: 'galvanic_fist', name: 'Galvanic Fist', category: 'physical', tag: 'electric', power: 55, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, statuses: [{ id: 'shock', chance: 0.3 }], custom: 'galvanic_fist', text: 'Shock 30%. If she stands on an Electric Field, the hit also arcs to the nearest other enemy within 2 tiles for 50% damage.' },
      { key: 'skybolt', name: 'Skybolt', category: 'special', tag: 'electric', power: 80, range: 4, ap: 3, acc: null, crit: 5, maxUses: 1, targeting: 'field', ignoresLos: true, custom: 'skybolt', text: '+30% damage against a Shocked target. If it hits a teammate, that teammate immediately executes its next queued attack out of order. Ignores LOS.' },
    ],
    ability: { key: 'static_charge', name: 'Static Charge', passive: true, text: 'Gains 1 Charge when she ends a round on an Electric Field, is Shocked, or is hit by an Electric attack (max 1 per source per round). At 3 Charges her next attack gets +1 Range and +60% damage, then Charges reset.' },
    zone: 'laboratory', portrait: 'Half-mechanical monster with electrodes, seams and coils', palette: ['#7a7a80', '#4FE3FF'], role: 'Bruiser',
  }),
  def({
    id: 'ghost_train', num: 13, name: 'Ghost Train Employee', title: 'seer and tempo mover', rarity: 'rare', tier: 'standard', deploy: 4,
    stats: st(240, 45, 40, 85, 80, 105), move: 4, apPerField: 1,
    chars: chars('ether', 'living', 'airborne', 'perceptive', 'emotional'),
    attacks: [
      { key: 'seers_glance', name: "Seer's Glance", category: 'special', tag: 'psychic', power: 50, range: 3, ap: 2, acc: 95, crit: 5, maxUses: 2, custom: 'seers_glance', text: 'Marks the target (2 rounds) if it has a Move command planned this round.' },
      { key: 'trainticket', name: 'Trainticket', category: 'utility', range: 3, ap: 3, acc: null, maxUses: 1, targeting: 'vector', custom: 'trainticket', text: 'Choose a unit and a vector (direction and distance up to 3). When executed, that unit moves by the vector from wherever it stands, ignoring units and obstacles in between. Fails if the destination cannot be entered. Works on allies.' },
    ],
    ability: { key: 'minds_eye', name: "Mind's Eye", passive: true, text: 'In planning you may shift her Speed by −15% to +15%. In a Speed tie with a friendly character you choose after which action of that character she acts.' },
    zone: 'forest', portrait: 'Conductor with eyes on the palms in front of a ghost train', palette: ['#3a5aa0', '#e3d34a'], role: 'Seer / mover',
  }),
  def({
    id: 'pokerface', num: 14, name: 'Pokerface', title: 'one body, three moods', rarity: 'epic', tier: 'standard', deploy: 5,
    stats: st(330, 70, 70, 70, 70, 95), move: 4, apPerField: 1,
    chars: chars('synthetic', 'artificial', 'grounded', 'robust', 'multi_minded'),
    attacks: [
      { key: 'spotlight', name: 'Spotlight', category: 'support', range: 4, ap: 2, acc: 95, maxUses: 2, statuses: [{ id: 'spotlight', chance: 1, duration: 0 }], text: 'Happy. The target takes +25% damage for the rest of the round.' },
      { key: 'replay', name: 'Replay', category: 'support', range: 4, ap: 3, acc: 90, maxUses: 1, custom: 'replay', text: 'Happy. The target repeats its last attack at 50% damage with the same target or vector, right after this action and at no AP cost for them.' },
    ],
    altAttacks: {
      happy: [
        { key: 'spotlight', name: 'Spotlight', category: 'support', range: 4, ap: 2, acc: 95, maxUses: 2, statuses: [{ id: 'spotlight', chance: 1, duration: 0 }], text: 'The target takes +25% damage for the rest of the round.' },
        { key: 'replay', name: 'Replay', category: 'support', range: 4, ap: 3, acc: 90, maxUses: 1, custom: 'replay', text: 'The target repeats its last attack at 50% damage with the same target or vector, right after this action and at no AP cost for them.' },
      ],
      sad: [
        { key: 'dirge', name: 'Dirge', category: 'support', range: 4, ap: 2, acc: 95, maxUses: 2, statuses: [{ id: 'depressed', chance: 1, duration: 0 }], text: 'The target deals −25% damage for the rest of the round.' },
        { key: 'weeping_wound', name: 'Weeping Wound', category: 'special', tag: 'soul', power: 35, range: 3, ap: 3, acc: 90, maxUses: 1, statuses: [{ id: 'bleeding', chance: 1, duration: 3 }], text: 'Bleeding for 3 rounds. Hitting an already bleeding target doubles the bleed and resets the timer.' },
      ],
      angry: [
        { key: 'slap', name: 'Slap', category: 'physical', tag: 'blunt', power: 60, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, knockback: 1, text: 'Pushes the target 1 tile.' },
        { key: 'box_leap', name: 'Box Leap', category: 'physical', tag: 'blunt', power: 85, range: 3, ap: 4, acc: null, maxUses: 1, targeting: 'multi-field', custom: 'box_leap', text: 'Choose tile A within 3 and tile B exactly 3 tiles from A. He jumps to A and deals Power 45 to Ring-1 and Power 85 to the unit on A, then does the same at B and ends there.' },
      ],
    },
    ability: { key: 'mood', name: 'Mood', passive: true, onDeploy: true, text: 'In the planning phase of the round he is deployed you choose Happy, Sad or Angry. It cannot change later. The enemy learns it when he first attacks.' },
    zone: 'toyroom', portrait: 'Music-box clown with a mask springing from a box, three faces (happy, sad, angry)', palette: ['#c83a3a', '#3a5aa0'], role: 'Flex',
  }),
  def({
    id: 'shrink_heads', num: 15, name: 'Shrink Heads', title: 'a master and four heads', rarity: 'uncommon', tier: 'standard', deploy: 5,
    stats: st(260, 60, 50, 70, 55, 100), move: 3, apPerField: 1,
    chars: chars('organic', 'colony', 'grounded', 'viral', 'hive_mind'),
    attacks: [
      { key: 'shrunken_strike', name: 'Shrunken Strike', category: 'physical', tag: 'blunt', power: 45, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, custom: 'shrunken_strike', text: 'Power 45 +15% per Shrink Head next to the Master or the target (max +60%).' },
      { key: 'head_swap', name: 'Head Swap', category: 'physical', tag: 'blunt', power: 55, range: 6, ap: 2, acc: null, maxUses: 1, targeting: 'ally', shape: 'ring1', custom: 'head_swap', text: 'Swaps tiles with any Shrink Head within 6 tiles, then damages Ring-1 around his new tile.' },
    ],
    ability: { key: 'head_count', name: 'Head Count', passive: true, onDeploy: true, text: 'The Master and 4 Shrink Heads deploy together on his upper-left, upper-right, lower-left and lower-right neighbours. Heads move for free (5 tiles total per round) and do not block tiles. Each adjacent Shrink Head counts as a Hive Mind neighbour (max +15%). If the Master is KO\'d, all heads vanish.' },
    zone: 'tomb', portrait: 'Master with a headdress of shrunken heads, four little heads floating around him', palette: ['#6b4a2a', '#4a7a2a'], role: 'Swarm controller',
  }),
  def({
    id: 'swamp_siren', num: 16, name: 'Swamp Siren', title: 'terrain healer and controller', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(290, 50, 55, 90, 75, 90), move: 4, apPerField: 1,
    chars: chars('organic', 'living', 'amphibious', 'regenerative', 'emotional'),
    attacks: [
      { key: 'mire_song', name: 'Mire Song', category: 'special', tag: 'sonic', power: 50, range: 3, ap: 2, acc: 90, crit: 5, maxUses: 2, targeting: 'field', shape: 'cone3', custom: 'mire_song', text: 'Cone-3. Targets standing on a Swamp tile are Blinded for 2 rounds (100%).' },
      { key: 'mud_double', name: 'Mud Double', category: 'utility', range: 1, ap: 2, acc: null, maxUses: 1, targeting: 'field', custom: 'mud_double', text: 'She moves 1 tile for free and leaves a Mud Decoy on her old tile. When the decoy is destroyed, or after 3 rounds, it bursts for Power 55 Physical / Blunt on Ring-1. At the end of every round the decoy turns its own tile into Swamp, then one random connected tile.' },
    ],
    ability: { key: 'swamp_heart', name: 'Swamp Heart', passive: true, onDeploy: true, text: 'On Deploy: choose a tile within 4. It and 2 random connected tiles become Swamp. She heals 5% max HP at round end on Swamp, and if she ends a round on Swamp, one random neighbour tile also becomes Swamp.' },
    zone: 'bog', portrait: 'Swamp siren with reeds and moss in her hair, singing, half in water', palette: ['#2a4a2a', '#4a6a3a'], role: 'Terrain controller',
  }),
  def({
    id: 'wisp', num: 17, name: 'Gas Will-o-Wisp', title: 'gas bomber', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(230, 30, 35, 95, 70, 115), move: 5, apPerField: 1,
    chars: chars('gas', 'spectral', 'airborne', 'regenerative', 'emotional'),
    attacks: [
      { key: 'marsh_gas', name: 'Marsh Gas', category: 'special', tag: 'fire', power: 80, range: 2, ap: 2, acc: null, maxUses: 2, targeting: 'field', custom: 'marsh_gas', text: 'On a tile without gas it creates a Gas Field (3 rounds). Used on a Gas Field it detonates it for Power 80 on the tile and Ring-1. Explosions hit friends.' },
      { key: 'flicker', name: 'Flicker', category: 'special', tag: 'fire', power: 35, range: 2, ap: 2, acc: 90, crit: 5, maxUses: 1, statuses: [{ id: 'blind', chance: 1, duration: 2 }], custom: 'flicker', text: 'Blinds the target for 2 rounds. Afterwards she teleports next to her Candle if it still exists.' },
    ],
    ability: { key: 'candle', name: 'Candle', passive: true, onDeploy: true, text: 'When deployed she places a Candle on a free tile next to her. At the start of each round it heals her 20% max HP if within 3 tiles, 15% at 4–6, 10% beyond. Does not stack with Regenerative (higher applies). Without a Candle she has no heal and no teleport.' },
    zone: 'bog', portrait: 'Flame of candle smoke with a gas bottle as its body', palette: ['#e3d34a', '#7a7a80'], role: 'Gas bomber',
  }),
  def({
    id: 'crystal_eye', num: 18, name: 'Crystal Eye', title: 'beam and bomb controller', rarity: 'epic', tier: 'elite', deploy: 7,
    stats: st(270, 40, 70, 100, 85, 85), move: 4, apPerField: 1,
    chars: chars('crystal', 'spectral', 'airborne', 'perceptive', 'emotionless'),
    attacks: [
      { key: 'prismatic_beam', name: 'Prismatic Beam', category: 'special', tag: 'radiant', power: 60, range: 8, ap: 3, acc: 85, crit: 8, maxUses: 1, targeting: 'multi-field', custom: 'prismatic_beam', text: 'Choose 1 or 2 target tiles. The beam fires to tile 1 and, with a second tile, from tile 1 to tile 2. It pierces every unit on the lines (segments together at most 8 tiles, a unit is hit once).' },
      { key: 'orb_bomb', name: 'Orb Bomb', category: 'special', tag: 'radiant', power: 70, range: 3, ap: 2, acc: null, maxUses: 1, targeting: 'field', custom: 'orb_bomb', text: 'Places a Crystal Bomb on a free tile. It detonates when an enemy enters it, Star-2. Casting it on your own bomb upgrades it by +1 arm length and +15% Power (up to 3 times). At most 2 bombs.' },
    ],
    ability: { key: 'portal_maker', name: 'Portal Maker', passive: true, text: 'When she KOs a unit, an Electric Field opens on its tile as a Portal for 3 rounds. A friendly unit on the Portal may pay 1 AP to appear on a free tile next to the Eye.' },
    zone: 'laboratory', portrait: 'Crystal ball with one eye and floating hands', palette: ['#f5f0ff', '#9FB7FF'], role: 'Controller',
  }),
  def({
    id: 'termite_mound', num: 19, name: 'Termite Mound', title: 'immobile wall breaker', rarity: 'uncommon', tier: 'standard', deploy: 5,
    stats: st(400, 60, 75, 70, 55, 50), move: 0, apPerField: 1,
    chars: chars('organic', 'colony', 'rooted', 'parasitic', 'hive_mind'),
    attacks: [
      { key: 'gnaw_swarm', name: 'Gnaw Swarm', category: 'physical', tag: 'pierce', power: 50, range: 4, ap: 2, acc: null, maxUses: 2, targeting: 'field', custom: 'gnaw_swarm', text: 'If the tile holds a Wall-Obstacle, the wall is destroyed and becomes an Acid Field for 3 rounds. Units crossing it get 1 Corrosion stack.' },
      { key: 'ant_trail', name: 'Ant Trail', category: 'physical', tag: 'pierce', power: 40, range: 6, ap: 3, acc: null, maxUses: 1, targeting: 'field', custom: 'ant_trail', text: 'End point: a Wall-Obstacle or friendly Organic/Colony unit. A trail forms along the line. Enemies on it take Power 40, and enemies crossing or ending on it take Power 25 once per round. Lasts 3 rounds or until the end point moves/breaks.' },
    ],
    ability: { key: 'hive_shift', name: 'Hive Shift', passive: false, ap: 1, range: 6, maxPerRound: 1, targeting: 'ally', text: '1 AP, max 1 per round. Swap tiles with another friendly Organic or Colony character within 6 tiles.' },
    zone: 'bog', portrait: 'Termite mound with faces in the tubes, ant trails running down', palette: ['#6b4a2a', '#3a2a1a'], role: 'Wall breaker',
  }),
  def({
    id: 'cymbal_chimp', num: 20, name: 'Cymbal Chimp', title: 'revenge brawler and AP punisher', rarity: 'uncommon', tier: 'standard', deploy: 4,
    stats: st(380, 80, 70, 45, 60, 80), move: 3, apPerField: 1,
    chars: chars('synthetic', 'artificial', 'grounded', 'robust', 'emotionless'),
    attacks: [
      { key: 'crash', name: 'Crash', category: 'physical', tag: 'blunt', power: 40, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, knockback: 1, custom: 'crash', text: 'Power 40 × (1 + his missing HP%), up to ×2 at 0 HP. Knockback 1.' },
      { key: 'echo_clap', name: 'Echo Clap', category: 'special', tag: 'sonic', power: 20, range: 4, ap: 3, acc: 85, maxUses: 1, statuses: [{ id: 'echo', chance: 1, duration: 2 }], text: 'Echo for 2 rounds: the target loses 3% max HP for every AP spent on its actions.' },
    ],
    ability: { key: 'resonant_rest', name: 'Resonant Rest', passive: true, text: 'If he is set to Rest, a shockwave bursts when he takes his first action: Power 40 Special / Sonic on Ring-1 with Shock 60%. It leaves a Resonance Field on his tile for 1 round.' },
    zone: 'toyroom', portrait: 'Broken toy monkey with cymbals, gears in its back', palette: ['#c83a3a', '#c9a24a'], role: 'Brawler',
  }),
  def({
    id: 'mambo', num: 21, name: 'Mambo, Voodoo Witch', title: 'healer, link caster, one-time copy', rarity: 'legendary', tier: 'elite', deploy: 7,
    stats: st(270, 40, 50, 95, 85, 85), move: 3, apPerField: 1,
    chars: chars('organic', 'living', 'grounded', 'perceptive', 'devoted'),
    attacks: [
      { key: 'hex_dart', name: 'Hex Dart', category: 'special', tag: 'soul', power: 55, range: 5, ap: 2, acc: 90, crit: 8, maxUses: 2, statuses: [{ id: 'hex', chance: 1, duration: 2 }], text: 'Leaves a Hex until the end of next round: the next Spirit Link on that unit deals +25% damage, and so heals 25% more.' },
      { key: 'spirit_link', name: 'Spirit Link', category: 'special', tag: 'soul', power: 70, range: 6, ap: 3, acc: 90, maxUses: 1, ignoresLos: true, custom: 'spirit_link', text: "Ignores walls and LOS. The target takes the damage; healing equal to the damage is split evenly between every other character of the target's team within 3 tiles of the target (not the target). Aimed at an ally it moves HP." },
    ],
    ability: { key: 'voodoo_doll', name: 'Voodoo Doll', passive: false, ap: 2, priority: 1, range: 1, oncePerGame: true, targeting: 'ally', text: 'Once per game, 2 AP, Priority +1. Choose a friendly non-summon character next to Mambo. A Voodoo copy appears next to her with half the original\'s HP, its first attack and ability, and Pain Link. While the copy lives, Mambo is Entranced. If an enemy destroys the copy, Mambo takes 20% max HP backlash. Pay 1 AP to wake her.' },
    zone: 'graveyard', portrait: 'Stylised fantasy priestess with feathers, bone staff and a small cloth doll', palette: ['#6B3FA0', '#D9A93A'], role: 'Healer / linker',
  }),
  def({
    id: 'calaca', num: 22, name: 'Calaca Flamenca', title: 'fire caster that collects souls', rarity: 'epic', tier: 'elite', deploy: 7,
    stats: st(290, 60, 55, 100, 65, 120), move: 5, apPerField: 1,
    chars: chars('bone', 'dead', 'grounded', 'volatile', 'emotional'),
    attacks: [
      { key: 'flaming_skull', name: 'Flaming Skull', category: 'special', tag: 'fire', power: 60, range: 5, ap: 2, acc: 90, crit: 8, maxUses: 2, targeting: 'field', custom: 'flaming_skull', text: 'Flies in a straight line and stops at the first unit (no pierce). That unit takes full damage and Ring-1 around it takes 50%. Burn 30%.' },
      { key: 'marigold_garland', name: 'Marigold Garland', category: 'support', tag: 'soul', range: 4, ap: 3, acc: null, maxUses: 1, targeting: 'ally', custom: 'marigold_garland', text: "Costs 3 Souls. A friendly unit gets Garland for 3 rounds and a Marigold Field under it for 2 rounds. If KO'd while the Garland lasts, it returns next round on the same tile with 30% max HP, once." },
    ],
    ability: { key: 'soul_collector', name: 'Soul Collector', passive: true, text: "Holds up to 5 Souls. Gains 1 whenever a non-summon unit is KO'd within 4 tiles (any team), and 1 more when she KOs a Burning unit. Each Soul gives +4% Fire damage and +3 Speed. Volatile: on KO she explodes (Ring-1, Power 60 Fire)." },
    zone: 'graveyard', portrait: 'Flaming skeleton in a flamenco dress with a cempasúchil wreath', palette: ['#FF9A1F', '#E8DFC8'], role: 'Fire caster',
  }),
  def({
    id: 'werewolf', num: 23, name: 'Moonbound Werewolf', title: 'physical tank with a wolf form', rarity: 'epic', tier: 'standard', deploy: 6,
    stats: st(420, 70, 85, 40, 55, 85), move: 3, apPerField: 1.25,
    chars: chars('organic', 'mythic', 'grounded', 'predatory', 'feral'),
    attacks: [
      { key: 'claw_rake', name: 'Claw Rake', category: 'physical', tag: 'slash', power: 60, range: 1, ap: 2, acc: 95, crit: 10, maxUses: 2, custom: 'claw_rake', text: 'Power 60 (Human) or 85 (Wolf). In Wolf form it causes Bleeding with 100% chance.' },
      { key: 'moonlit_charge', name: 'Moonlit Charge', category: 'physical', tag: 'blunt', power: 70, range: 3, ap: 3, acc: 90, crit: 5, maxUses: 1, targeting: 'field', knockback: 1, custom: 'moonlit_charge', text: 'Runs in a straight line up to 3 tiles (free) and strikes the first unit in his path with Power 70 (Human) or 95 (Wolf), knockback 1.' },
    ],
    ability: { key: 'moon_pull', name: 'Moon Pull', passive: false, ap: 2, priority: 1, targeting: 'self', text: 'Becomes a Wolf: pay 2 AP at Priority +1; free on Full Moon rounds (every 5th) or on a Moonlit Field; automatically at 40% HP or lower. Wolf form lasts 3 rounds, then Human and Exhausted for 1 round; no transform for 2 rounds.' },
    zone: 'forest', portrait: 'Muscular man in a torn shirt, the moon behind him', palette: ['#7a7a80', '#c0c0c8'], role: 'Tank',
  }),
  def({
    id: 'midas_mummy', num: 24, name: 'Midas Mummy', title: 'slow tank with a one-time golden gamble', rarity: 'legendary', tier: 'standard', deploy: 6,
    stats: st(380, 75, 90, 55, 80, 60), move: 3, apPerField: 1.25,
    chars: chars('cloth', 'cursed', 'grounded', 'robust', 'greedy'),
    attacks: [
      { key: 'bandage_lash', name: 'Bandage Lash', category: 'physical', tag: 'slash', power: 55, range: 2, ap: 2, acc: 90, crit: 5, maxUses: 2, statuses: [{ id: 'slow', chance: 0.25 }], text: 'Slow 25%.' },
      { key: 'curse_of_the_tomb', name: 'Curse of the Tomb', category: 'special', tag: 'soul', power: 60, range: 3, ap: 3, acc: 85, crit: 5, maxUses: 1, statuses: [{ id: 'vulnerable', chance: 0.7, duration: 2 }], text: 'Vulnerable 70% (+20% damage taken for 2 rounds).' },
    ],
    ability: { key: 'midas_touch', name: 'Midas Touch', passive: false, ap: 1, priority: 2, oncePerGame: true, targeting: 'choice', text: 'Once per game, 1 AP, Priority +2. Pick 1 item card in your hand: it becomes the Midas Touch card. Every other item card of the same Type is Tarnished for the rest of the match. The Midas Touch card (Free, once): a friendly unit becomes Gilded.' },
    zone: 'tomb', portrait: 'Golden mummy with glowing fingers and gold coins in the bandages', palette: ['#D9A93A', '#d8c8a0'], role: 'Tank / gamble',
  }),
  def({
    id: 'cog_cuckoo', num: 25, name: 'Cog Cuckoo', title: 'clock pattern attacker and one-time rewind', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(300, 55, 70, 80, 75, 90), move: 3, apPerField: 1,
    chars: chars('wood', 'artificial', 'grounded', 'chronal', 'emotionless'),
    attacks: [
      { key: 'cuckoo_peck', name: 'Cuckoo Peck', category: 'physical', tag: 'pierce', power: 55, range: 2, ap: 2, acc: 95, crit: 10, maxUses: 2, text: 'Range 2.' },
      { key: 'strike_the_hour', name: 'Strike the Hour', category: 'special', tag: 'sonic', power: 85, range: 3, ap: 3, acc: null, maxUses: 1, priority: -1, heavy: true, targeting: 'field', custom: 'strike_the_hour', text: 'Centre within 3. The Clock Ring (12 tiles at distance 2) is numbered clockwise with 12 at the top. Hour hand = current round, minute hand = opposite. Hour hand Power 85, minute hand 55, centre 30. All three become Chrono Fields for 1 round. Pay 1 AP to turn the hour hand one step.' },
    ],
    ability: { key: 'turn_back_time', name: 'Turn Back Time', passive: false, ap: 2, range: 5, priority: -2, oncePerGame: true, targeting: 'ally', text: 'Once per game, 2 AP, Range 5, Priority −2. A friendly unit returns at the end of Resolution to its tile and HP from the start of this round and loses all negative statuses gained this round. A KO\'d unit stays KO\'d.' },
    zone: 'toyroom', portrait: 'Cuckoo-clock robot with a wooden case, gears and a jumping bird', palette: ['#7a5a2a', '#c9a24a'], role: 'Pattern attacker',
  }),
  def({
    id: 'zombie_limb', num: 26, name: 'Zombie Limb', title: 'cheap blocker that fuses into a brute', rarity: 'common', tier: 'swarm', deploy: 1,
    stats: st(90, 40, 30, 20, 30, 90), move: 4, apPerField: 0.5,
    chars: chars('organic', 'dead', 'burrowing', 'viral', 'hive_mind'),
    attacks: [
      { key: 'flail', name: 'Flail', category: 'physical', tag: 'blunt', power: 30, range: 1, ap: 1, acc: 90, crit: 5, maxUses: 2, statuses: [{ id: 'infection', chance: 0.25 }], text: 'Infection 25%.' },
      { key: 'grab', name: 'Grab', category: 'physical', tag: 'blunt', power: 15, range: 1, ap: 1, acc: 90, maxUses: 1, statuses: [{ id: 'snared', chance: 0.6, duration: 1 }], text: 'Snared 60%.' },
    ],
    altAttacks: {
      patchwork: [
        { key: 'maul', name: 'Maul', category: 'physical', tag: 'blunt', power: 55, range: 1, ap: 2, acc: 90, maxUses: 2, text: 'Patchwork Zombie attack.' },
        { key: 'rend', name: 'Rend', category: 'physical', tag: 'slash', power: 70, range: 1, ap: 3, acc: 90, maxUses: 1, statuses: [{ id: 'bleeding', chance: 0.4 }], text: 'Bleeding 40%.' },
      ],
      brute: [
        { key: 'smash', name: 'Smash', category: 'physical', tag: 'blunt', power: 80, range: 1, ap: 3, acc: 90, maxUses: 1, knockback: 1, text: 'Knockback 1.' },
        { key: 'ground_slam', name: 'Ground Slam', category: 'physical', tag: 'blunt', power: 60, range: 0, ap: 3, acc: null, maxUses: 1, targeting: 'self', shape: 'ring1', friendlyFire: true, text: 'Ring-1.' },
      ],
    },
    ability: { key: 'fuse', name: 'Fuse', passive: false, ap: 1, priority: 1, range: 1, maxPerRound: 1, targeting: 'ally', text: '1 AP, Priority +1, Range 1. Merge with an adjacent Zombie Limb or Patchwork Zombie. Patchwork (2 parts): HP 260. Stitched Brute (3 parts): HP 480. Fused forms heal 5% max HP per round.' },
    zone: 'graveyard', maxCopies: 3, portrait: 'Severed stitched hand, a foot and a head (three variants)', palette: ['#8aa07a', '#4a5a3a'], role: 'Swarm blocker',
  }),
  def({
    id: 'baby_mummy', num: 27, name: 'Baby Mummy', title: 'cheap fear source with a curse', rarity: 'common', tier: 'swarm', deploy: 1,
    stats: st(110, 30, 35, 25, 40, 70), move: 3, apPerField: 0.75,
    chars: chars('cloth', 'cursed', 'grounded', 'perceptive', 'emotional'),
    attacks: [
      { key: 'pacifier_toss', name: 'Pacifier Toss', category: 'physical', tag: 'blunt', power: 25, range: 3, ap: 1, acc: 90, crit: 5, maxUses: 2, text: 'Range 3.' },
      { key: 'wail', name: 'Wail', category: 'special', tag: 'sonic', power: 20, range: 0, ap: 2, acc: null, maxUses: 1, targeting: 'self', shape: 'burst2', enemiesOnly: true, statuses: [{ id: 'fear', chance: 0.4, duration: 1 }], custom: 'wail', text: 'Burst-2 around her, enemies only. Fear 40% for 1 round, reveals Hidden units within 2 tiles.' },
    ],
    ability: { key: 'little_curse', name: 'Little Curse', passive: true, text: "When she is KO'd, the unit that dealt the final blow gets Jinx for 2 rounds, and her tile becomes a Bandage Field for 2 rounds." },
    zone: 'tomb', maxCopies: 3, portrait: 'Small baby in bandages with a pacifier, big eyes', palette: ['#d8c8a0', '#8B1A1F'], role: 'Swarm / fear',
  }),
  def({
    id: 'little_wendigo', num: 28, name: 'Little Wendigo', title: 'cheap AP engine and hunger aura', rarity: 'uncommon', tier: 'swarm', deploy: 2,
    stats: st(120, 35, 35, 50, 50, 105), move: 4, apPerField: 0.75,
    chars: chars('ether', 'mythic', 'phasing', 'parasitic', 'insatiable'),
    attacks: [
      { key: 'gnaw', name: 'Gnaw', category: 'physical', tag: 'pierce', power: 30, range: 1, ap: 1, acc: 95, crit: 5, maxUses: 2, custom: 'lifesteal15', text: 'Parasitic: heals 15% of the damage dealt.' },
      { key: 'starving_mark', name: 'Starving Mark', category: 'special', tag: 'psychic', power: 20, range: 4, ap: 2, acc: 90, maxUses: 1, statuses: [{ id: 'starving_mark', chance: 1, duration: 2 }], text: 'Marks the target for 2 rounds. Whenever a friendly non-Wendigo character damages it, your team banks +1 Feast AP (max +2 per round), paid next round.' },
    ],
    ability: { key: 'famine_aura', name: 'Famine Aura', passive: true, text: 'Enemy units within 2 tiles of him at the start of planning pay +1 AP for their first Attack command of the round.' },
    zone: 'forest', portrait: 'Small gaunt wendigo with antlers and an empty bowl, wisps of fog', palette: ['#bfe6ff', '#0E0A12'], role: 'AP engine',
  }),
  def({
    id: 'lab_assistant', num: 29, name: 'Backstabber Lab Assistant', title: 'patient healer who stabs later', rarity: 'rare', tier: 'standard', deploy: 5,
    stats: st(250, 95, 45, 70, 55, 125), move: 5, apPerField: 0.75,
    chars: chars('organic', 'living', 'grounded', 'predatory', 'emotionless'),
    attacks: [
      { key: 'bedside_manner', name: 'Bedside Manner', category: 'support', range: 2, ap: 2, acc: null, maxUses: 1, custom: 'bedside_manner', text: 'Heals the target, ally or enemy, for 12% max HP and marks it Patient for 2 rounds.' },
      { key: 'scalpel_backstab', name: 'Scalpel Backstab', category: 'physical', tag: 'pierce', power: 65, range: 1, ap: 3, acc: 90, crit: 15, maxUses: 1, custom: 'scalpel_backstab', text: '×1.35 against a Patient. ×1.35 if the target is Turned Back (finished all its planned actions). With both, ×1.8 total and she ignores 30% of its PDef.' },
    ],
    ability: { key: 'quiet_professional', name: 'Quiet Professional', passive: true, text: 'After Scalpel Backstab she may move up to 2 tiles for free. Her plans cannot be revealed by Watchful Eye or similar effects.' },
    zone: 'laboratory', portrait: 'Friendly smiling lab assistant in a coat, a scalpel behind her back', palette: ['#f0ece0', '#8CFF5A'], role: 'Healer / assassin',
  }),
  def({
    id: 'leech_cook', num: 30, name: 'Leech Cook', title: 'broth healer, spawns no units', rarity: 'uncommon', tier: 'standard', deploy: 5,
    stats: st(330, 60, 65, 85, 70, 75), move: 3, apPerField: 1,
    chars: chars('organic', 'living', 'grounded', 'parasitic', 'emotional'),
    attacks: [
      { key: 'leech_toss', name: 'Leech Toss', category: 'physical', tag: 'pierce', power: 35, range: 4, ap: 2, acc: 90, crit: 5, maxUses: 2, statuses: [{ id: 'leeched', chance: 1, duration: 3 }], text: 'The target is Leeched (3 rounds, one leech per unit): loses 4% max HP at round end, every 20 HP drained adds 1 Broth (max 6).' },
      { key: 'serve_stew', name: 'Serve Stew', category: 'special', tag: 'fire', power: 25, range: 3, ap: 3, acc: null, maxUses: 1, custom: 'serve_stew', text: 'Cook within 2 of the Pot, target within 3 of the Cook. Spends up to 3 Broth: on a friend heals 8% max HP per Broth (3 Broth: Well Fed). On an enemy Power 25 per Broth and Burn 40%. No Broth: heals 5% or Power 15.' },
    ],
    ability: { key: 'pot_luck', name: 'Pot Luck', passive: false, ap: 1, range: 1, maxPerRound: 1, targeting: 'field', onDeploy: true, text: 'Deploys with a Cooking Pot on an adjacent free tile (an object that blocks movement). For 1 AP she can push it 1 tile (max once per round). If destroyed, all Broth is lost and the tiles around it become Scalded Fields for 2 rounds.' },
    zone: 'bog', portrait: 'Cook with a chef hat, a giant pot of leeches, a ladle', palette: ['#6b4a2a', '#4a7a2a'], role: 'Healer',
  }),
];

export const CHARACTERS: Record<string, CharacterDef> = Object.fromEntries(CHARACTER_LIST.map((c) => [c.id, c]));

// ---------------------------------------------------------------- summons and objects

export interface SummonDef {
  id: string;
  name: string;
  hp: number;
  patk: number;
  pdef: number;
  satk: number;
  sdef: number;
  speed: number;
  move: number;
  apPerField: number;
  attacks: AttackDef[];
  object: boolean;
  blocks: boolean;
  chars: Record<CharCategory, string>;
  text: string;
}

const nibble = atk('shrink_head', { key: 'nibble', name: 'Nibble', category: 'physical', tag: 'blunt', power: 25, range: 1, ap: 1, acc: 90, maxUses: 2, text: 'Power 25, Range 1, 1 AP.' });

export const SUMMONS: Record<string, SummonDef> = {
  shrink_head: { id: 'shrink_head', name: 'Shrink Head', hp: 60, patk: 60, pdef: 25, satk: 30, sdef: 25, speed: 100, move: 5, apPerField: 0, attacks: [nibble], object: false, blocks: false, chars: chars('organic', 'colony', 'grounded', 'viral', 'hive_mind'), text: 'Moves for free (5 tiles per round shared between all heads). Does not block tiles.' },
  mini_arachnia: { id: 'mini_arachnia', name: 'Mini Arachnia', hp: 260, patk: 43, pdef: 95, satk: 30, sdef: 70, speed: 78, move: 4, apPerField: 1, attacks: [atk('mini_arachnia', { key: 'poison_bite', name: 'Poison Bite', category: 'physical', tag: 'pierce', power: 60, range: 1, ap: 2, acc: 95, crit: 5, maxUses: 2, statuses: [{ id: 'poison', chance: 0.35 }], text: 'Poison 35%.' })], object: false, blocks: true, chars: chars('organic', 'living', 'grounded', 'toxic', 'emotional'), text: 'No ability, no Lay Eggs. Grows into a full Arachnia after 3 rounds.' },
  candle: { id: 'candle', name: 'Candle', hp: 60, patk: 0, pdef: 20, satk: 0, sdef: 20, speed: 0, move: 0, apPerField: 0, attacks: [], object: true, blocks: true, chars: chars('wood', 'artificial', 'rooted', 'volatile', 'emotionless'), text: 'Heals the Wisp each round.' },
  mud_decoy: { id: 'mud_decoy', name: 'Mud Decoy', hp: 80, patk: 50, pdef: 40, satk: 0, sdef: 40, speed: 0, move: 0, apPerField: 0, attacks: [], object: true, blocks: true, chars: chars('liquid', 'artificial', 'rooted', 'regenerative', 'emotionless'), text: 'Bursts when destroyed or after 3 rounds (Power 55 Blunt, Ring-1). Spreads Swamp.' },
  cooking_pot: { id: 'cooking_pot', name: 'Cooking Pot', hp: 150, patk: 0, pdef: 60, satk: 0, sdef: 60, speed: 0, move: 0, apPerField: 0, attacks: [], object: true, blocks: true, chars: chars('steel', 'artificial', 'rooted', 'robust', 'emotionless'), text: 'An object, not a unit. Stores Broth.' },
  training_dummy: { id: 'training_dummy', name: 'Test Dummy', hp: 300, patk: 40, pdef: 60, satk: 40, sdef: 60, speed: 60, move: 0, apPerField: 1, attacks: [], object: false, blocks: true, chars: chars('wood', 'artificial', 'grounded', 'robust', 'emotionless'), text: 'Straw dummy (standing).' },
  training_walker: { id: 'training_walker', name: 'Walking Dummy', hp: 300, patk: 40, pdef: 60, satk: 40, sdef: 60, speed: 80, move: 3, apPerField: 1, attacks: [], object: false, blocks: true, chars: chars('wood', 'artificial', 'grounded', 'robust', 'emotionless'), text: 'Straw dummy (walking).' },
};

export const PAIN_LINK: AttackDef = atk('voodoo_copy', {
  key: 'pain_link', name: 'Pain Link', category: 'special', tag: 'soul', power: 150, range: 3, ap: 2, acc: 95, maxUses: 1, custom: 'pain_link',
  text: "Uses Mambo's SAtk. Power = 150 × the copy's current HP% (minimum 30). Destroys the copy.",
});

/** Fused Zombie Limb forms (section 7, character 26). */
export const ZOMBIE_FORMS = {
  limb: { hp: 90, patk: 40, pdef: 30, satk: 20, sdef: 30, speed: 90, move: 4, apPerField: 0.5, ko: 4 },
  patchwork: { hp: 260, patk: 65, pdef: 55, satk: 30, sdef: 50, speed: 75, move: 3, apPerField: 0.75, ko: 8 },
  brute: { hp: 480, patk: 95, pdef: 75, satk: 30, sdef: 65, speed: 60, move: 3, apPerField: 1, ko: 10 },
} as const;

/** Werewolf forms (section 7, character 23). */
export const WEREWOLF_FORMS = {
  human: { hpMult: 1, patk: 70, pdef: 85, satk: 40, sdef: 55, speed: 85, move: 3 },
  wolf: { hpMult: 1.15, patk: 95, pdef: 106, satk: 20, sdef: 55, speed: 106, move: 4 },
} as const;

/** Bosses for ANOMALY mode: buffed roster characters (new). */
export const BOSSES: Record<string, { id: string; base: string; name: string; hpMult: number; atkMult: number; defMult: number; speedMult: number; text: string }> = {
  matriarch: { id: 'matriarch', base: 'arachnia', name: 'The Brood Matriarch', hpMult: 3, atkMult: 1.3, defMult: 1.2, speedMult: 1.1, text: 'A swollen Arachnia queen. Eggs everywhere.' },
  overseer: { id: 'overseer', base: 'frankenstein', name: 'The Overseer', hpMult: 3, atkMult: 1.3, defMult: 1.2, speedMult: 1.1, text: 'The laboratory itself, stitched into one body.' },
  colossus: { id: 'colossus', base: 'midas_mummy', name: 'The Golden Colossus', hpMult: 3, atkMult: 1.25, defMult: 1.3, speedMult: 1, text: 'A tomb king wrapped in gold and debt.' },
};

export const KO_REWARD: Record<string, number> = { swarm: 4, standard: 10, elite: 12, boss: 15 };

export const MILESTONES: { zone: Zone; name: string; trophies: number; cards: string[] }[] = [
  { zone: 'laboratory', name: 'Laboratory', trophies: 0, cards: ['nexus', 'lab_assistant', 'frankenstein', 'crystal_eye'] },
  { zone: 'graveyard', name: 'Graveyard', trophies: 0, cards: ['vile', 'zombie_limb', 'calaca', 'steak', 'mambo'] },
  { zone: 'bog', name: 'Bog', trophies: 150, cards: ['arachnia', 'swamp_siren', 'mycel', 'termite_mound', 'wisp', 'leech_cook'] },
  { zone: 'toyroom', name: 'Toy Room', trophies: 400, cards: ['lullabun', 'pokerface', 'piggybank', 'cymbal_chimp', 'ballerina', 'cog_cuckoo'] },
  { zone: 'forest', name: 'Haunted Forest', trophies: 800, cards: ['werewolf', 'little_wendigo', 'scarecrow', 'pumpkin', 'ghost_train'] },
  { zone: 'tomb', name: 'Tomb', trophies: 1300, cards: ['midas_mummy', 'baby_mummy', 'shrink_heads', 'cruorina'] },
];

export function attacksFor(defId: string, form: string | null): AttackDef[] {
  const c = CHARACTERS[defId];
  if (!c) return SUMMONS[defId]?.attacks ?? [];
  if (form && c.altAttacks?.[form]) return c.altAttacks[form]!;
  return c.attacks;
}
