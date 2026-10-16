// Section 9/10 of the UI-Assets document: the tutorial system ("Testing Chambers") and the
// tutorial plans for all 30 characters. Every chamber is a small scripted match on a 9×5 board,
// five acts: 1 Introduction, 2 Basic move, 3 Core mechanic, 4 Synergy & weakness, 5 Final test.

import type { FieldId, StatusId, Zone } from '../types.ts';
import type { Hex } from '../hex.ts';

export type Check =
  | { kind: 'deployed'; defId?: string }
  | { kind: 'status'; status: StatusId; count?: number; side?: 'enemy' | 'ally' | 'any' }
  | { kind: 'damaged'; count?: number }
  | { kind: 'ko'; count?: number }
  | { kind: 'used'; name: string }
  | { kind: 'moved_max'; fields: number }
  | { kind: 'field'; field: FieldId }
  | { kind: 'counter'; key: string; min: number }
  | { kind: 'event'; text: string }
  | { kind: 'heal'; count?: number }
  | { kind: 'form'; form: string }
  | { kind: 'alive' }
  | { kind: 'ap_spent_below'; pct: number }
  | { kind: 'all'; of: Check[] }
  | { kind: 'any'; of: Check[] };

export interface TutorialTask {
  de: string;
  en: string;
  check: Check;
}

export interface EnemyScript {
  /** behaviour of the opponent this round */
  mode: 'idle' | 'bot' | 'attack';
  /** item cards the warden plays for the opponent this round, aimed at the main character's tile */
  items?: string[];
}

export interface TutorialAct {
  act: 2 | 3 | 4;
  mark: string;
  title: string;
  de: string;
  en: string;
  hints: string[];
  tasks: TutorialTask[];
  enemy?: EnemyScript;
  /** rounds fast-forwarded after this act (time-lapse) */
  timelapse?: number;
  /** the Warden prepares the act when it begins: tops up the subject's counters (souls, broth …) and, for knock-out
   * lessons, leaves the enemies at a share of their HP, so the lesson is possible in one round */
  setup?: { counters?: Record<string, number>; enemyHp?: number; allyHp?: number; fieldUnderEnemies?: FieldId };
}

export interface TutorialPlan {
  id: string;
  title: string;
  titleDe: string;
  complexity: 'simple' | 'standard' | 'elite';
  rounds: 2 | 3 | 4;
  duration: string;
  zone: Zone;
  walls: Hex[];
  main: string;
  guests: string[];
  enemies: string[];
  items: string[];
  enemyItems?: string[];
  /** the main character starts on the offer and is deployed in round 1 */
  deployMain: boolean;
  startRound?: number;
  ap: number;
  intro: { de: string; en: string; quote?: string };
  acts: TutorialAct[];
  synergies: string;
  weakness: string;
  probe: { mark: string; de: string; en: string; check: Check; solution: string; setup?: { counters?: Record<string, number>; enemyHp?: number; allyHp?: number; fieldUnderEnemies?: FieldId } };
}

// chamber walls sit at the edges so they shape paths without blocking the main lines
const W1: Hex[] = [{ c: 4, r: 0 }];
const W2: Hex[] = [{ c: 4, r: 0 }, { c: 4, r: 4 }];
const W3: Hex[] = [{ c: 4, r: 0 }, { c: 4, r: 4 }, { c: 6, r: 0 }];
const W4: Hex[] = [{ c: 4, r: 0 }, { c: 4, r: 4 }, { c: 3, r: 0 }, { c: 7, r: 4 }];

const t = (de: string, en: string, check: Check): TutorialTask => ({ de, en, check });

export const TUTORIALS: TutorialPlan[] = [
  {
    id: 'arachnia', title: 'Stand still and poison', titleDe: 'Stillstehen und vergiften', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'bog', walls: W3,
    main: 'arachnia', guests: ['mycel'], enemies: ['ballerina', 'steak'], items: ['iron_tonic'], enemyItems: ['emergency_sterilization'], deployMain: true, ap: 12,
    intro: { de: 'Toxic, Organic, Grounded. Stärken: 520 HP und Poison.', en: 'Toxic, Organic, Grounded. Strengths: 520 HP and Poison.', quote: 'Sie ist am besten, wenn sie nicht läuft.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Stillstand', de: 'Setze Arachnia ein (6 AP). Wer sie angreift, wird vergiftet: 100% ÷ (1 + Felder).', en: 'Deploy Arachnia (6 AP). Attackers are poisoned: 100% ÷ (1 + fields moved).', hints: ['Deploy her next to the Ballerina.', 'Standing still means 100% poison.'], tasks: [t('Setze Arachnia ein', 'Deploy Arachnia', { kind: 'deployed', defId: 'arachnia' })], enemy: { mode: 'attack' } },
      { act: 3, mark: '1:25', title: 'Eier', de: 'Poison Bite auf das Steak, dann Lay Eggs (3 AP).', en: 'Poison Bite the Steak, then Lay Eggs (3 AP).', hints: ['Lay Eggs needs a Living target.', 'Eggs hatch after three rounds.'], tasks: [t('Nutze Poison Bite', 'Use Poison Bite', { kind: 'used', name: 'Poison Bite' }), t('Lege ein Ei', 'Lay an Egg', { kind: 'status', status: 'egg' })], enemy: { mode: 'idle' }, timelapse: 3 },
      { act: 4, mark: '2:30', title: 'Synergie und Schwäche', de: 'Mycels Sporecloud auf vergiftete Gegner: Power 60. Iron Tonic gibt Fortified und Shield 40.', en: "Mycel's Sporecloud on poisoned targets: Power 60. Iron Tonic gives Fortified and Shield 40.", hints: ['Sporecloud punishes every status.', 'Watch out: Sterile Fields hurt Toxic units.'], tasks: [t('Mycel nutzt Sporecloud', 'Mycel uses Sporecloud', { kind: 'used', name: 'Sporecloud' })], enemy: { mode: 'bot', items: ['emergency_sterilization'] } },
    ],
    synergies: 'Mycel (+50% gegen Status), Vile und Leech Cook, Iron Tonic.', weakness: 'Sterile Fields, Acid ×1.25, Steel (Pierce ×0.8). Läuft sie 2 Felder, ist Ambush Venom aus.',
    probe: { mark: '3:30', de: 'Vergifte 2 Gegner in einer Runde, ohne mehr als 1 Feld zu laufen.', en: 'Poison 2 enemies in one round while moving at most 1 field.', check: { kind: 'all', of: [{ kind: 'status', status: 'poison', count: 2, side: 'enemy' }, { kind: 'moved_max', fields: 1 }] }, solution: 'Hold position next to both enemies and Poison Bite each of them.' },
  },
  {
    id: 'nexus', title: 'Hidden Corrupted Tiles', titleDe: 'Versteckte Corrupted Tiles', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'laboratory', walls: W4,
    main: 'nexus', guests: ['frankenstein'], enemies: ['scarecrow', 'cymbal_chimp', 'wisp'], items: ['scope'], deployMain: true, ap: 12,
    intro: { de: 'Viral, Synthetic, Speed 160. Sehr schnell, aber nur 260 HP.', en: 'Viral, Synthetic, Speed 160. Very fast, but only 260 HP.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Corrupt', de: 'Setze Nexus ein (6 AP). Drei Felder werden heimlich verseucht.', en: 'Deploy Nexus (6 AP). Three tiles are secretly corrupted.', hints: ['Corrupted tiles are invisible to the enemy.', 'You may re-roll the tiles 3 times.'], tasks: [t('Setze Nexus ein', 'Deploy Nexus', { kind: 'deployed', defId: 'nexus' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Corruption', de: 'Frankenstein betritt ein Corrupted Tile: HP halbiert, Schaden +60%, Speed +40%.', en: 'Frankenstein steps on a Corrupted Tile: HP halved, damage +60%, Speed +40%.', hints: ['The purple flicker is a Corrupted Tile.', 'Corruption stays when the unit leaves.'], tasks: [t('Ein Verbündeter wird Corrupted', 'An ally becomes Corrupted', { kind: 'status', status: 'corruption', side: 'ally' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Overclock', de: 'Overclock auf den verseuchten Frankenstein: ×1.5 auf die nächste Aktion.', en: 'Overclock the corrupted Frankenstein: ×1.5 on the next action.', hints: ['Overclock only works on Corrupted allies.', 'Scope extends Long Shot to Range 9.'], tasks: [t('Nutze Overclock', 'Use Overclock', { kind: 'used', name: 'Overclock' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Frankenstein, Ballerina und andere Burst-Charaktere. Scope und Iron Tonic.', weakness: '260 HP und PDef 50. Fire ×1.25 wegen Viral. Fällt Nexus, verschwindet alle Corruption.',
    probe: { mark: '4:25', de: 'Nutze Corruption mit einem Verbündeten und besiege in derselben Runde einen Gegner.', en: 'Use Corruption on an ally and KO an enemy in the same round.', check: { kind: 'ko', count: 1 }, solution: 'Overclock the corrupted ally, then strike the weakest enemy.' },
  },
  {
    id: 'vile', title: 'Slow, but everywhere', titleDe: 'Langsam, aber überall', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'graveyard', walls: W3,
    main: 'vile', guests: ['arachnia'], enemies: ['pumpkin', 'ballerina'], items: ['contamination_burst'], deployMain: false, ap: 12,
    intro: { de: 'Dead, Toxic, Speed 40: Er handelt als Letzter. Stärken: Crit 25% und Poison heilt ihn.', en: 'Dead, Toxic, Speed 40: he acts last. Strengths: 25% crit and Poison heals him.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Geduld', de: 'Plane mit Rest und greife das Feld an, auf dem der Gegner landet.', en: 'Plan with Rest and attack the tile where the enemy will land.', hints: ['Vile acts after everyone else.', 'Aim at a tile, not a unit.'], tasks: [t("Nutze Reaper's Slash", "Use Reaper's Slash", { kind: 'used', name: "Reaper's Slash" })], enemy: { mode: 'bot' } },
      { act: 3, mark: '1:25', title: 'Miasma Rot', de: 'Miasma Rot (Range 4) vergiftet. Stirbt das Ziel, teleportiert Vile und explodiert.', en: 'Miasma Rot (Range 4) poisons. If the target dies, Vile teleports and erupts.', hints: ['Miasma Rot creates a Toxic Field.', 'Let Arachnia finish the poisoned target.'], tasks: [t('Nutze Miasma Rot', 'Use Miasma Rot', { kind: 'used', name: 'Miasma Rot' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Rot Siphon und Schwäche', de: 'Im Toxic Field heilt Vile 5% pro Tick. Der Gegner antwortet mit Sterile.', en: 'In a Toxic Field Vile heals 5% per tick. The enemy answers with Sterile.', hints: ['Stand in your own Toxic Field.', 'Sterile Fields stop the healing.'], tasks: [t('Spiele Contamination Burst', 'Play Contamination Burst', { kind: 'field', field: 'toxic' })], enemy: { mode: 'bot', items: ['emergency_sterilization'] } },
    ],
    synergies: 'Arachnia, Mycel, Leech Cook. Contamination Burst.', weakness: 'Sterile Fields, Radiant ×1.25, Healing −30% (außer Gift). Snare und Trainticket bremsen ihn.',
    probe: { mark: '3:30', de: 'Töte einen Gegner mit Miasma Rot und triff mit der Explosion einen zweiten.', en: 'KO an enemy with Miasma Rot and hit a second one with the eruption.', check: { kind: 'all', of: [{ kind: 'ko', count: 1 }, { kind: 'event', text: 'Miasma eruption' }] }, solution: 'Miasma Rot the weakened enemy standing next to another.', setup: { enemyHp: 0.3 } },
  },
  {
    id: 'cruorina', title: 'Line, burst and blood', titleDe: 'Linie, Burst und Blut', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'bog', walls: W2,
    main: 'cruorina', guests: ['steak'], enemies: ['mycel', 'scarecrow', 'termite_mound'], items: ['second_wind'], deployMain: false, ap: 12,
    intro: { de: 'Liquid, Spectral, Airborne. Elite für 8 AP, 300 HP, Speed 110.', en: 'Liquid, Spectral, Airborne. Elite for 8 AP, 300 HP, Speed 110.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Crimson Lance', de: 'Zwei Gegner in einer Linie: eine Lance trifft beide.', en: 'Two enemies in a line: one Lance hits both.', hints: ['The Lance pierces every unit in line.'], tasks: [t('Triff 2 Gegner mit einer Lance', 'Hit 2 enemies with one Lance', { kind: 'damaged', count: 2 })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Hemorrhage Burst', de: 'Power 95 auf Ring-1, auch auf Freunde. Danach blutet sie.', en: 'Power 95 on Ring-1, friends included. Afterwards she bleeds.', hints: ['Keep the Steak out of Ring-1.', 'Stand still afterwards: bleeding needs movement.'], tasks: [t('Nutze Hemorrhage Burst', 'Use Hemorrhage Burst', { kind: 'used', name: 'Hemorrhage Burst' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Blood Drain', de: 'Stirbt ein Gegner neben ihr, heilt sie 15% seiner Max-HP.', en: 'An enemy dying next to her heals her 15% of its max HP.', hints: ['Let the Steak finish an adjacent enemy.'], tasks: [t('Blood Drain heilt', 'Blood Drain heals', { kind: 'event', text: 'Blood Drain' })], enemy: { mode: 'bot', items: ['molotov'] } },
    ],
    synergies: 'Tanks, die Gegner in ihrer Nähe halten (Steak, Arachnia). Pokerface-Bleeding.', weakness: 'Fire, Radiant, eigene Burst-Treffer auf Freunde.',
    probe: { mark: '4:25', de: 'Triff mit einem Burst 2 Gegner, aber keinen eigenen Charakter.', en: 'Hit 2 enemies with one Burst but none of your own.', check: { kind: 'damaged', count: 2 }, solution: 'Fly between two enemies, away from the Steak, then Burst.' },
  },
  {
    id: 'mycel', title: 'Symbiosis and spore cloud', titleDe: 'Symbiose und Pilzwolke', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'bog', walls: W2,
    main: 'mycel', guests: ['arachnia'], enemies: ['lullabun', 'cymbal_chimp'], items: ['antidote'], deployMain: true, ap: 12,
    intro: { de: 'Hive Mind, Parasitic. Verbindet sich mit der Figur mit den meisten Max-HP.', en: 'Hive Mind, Parasitic. Links to the ally with the most max HP within 3.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Symbiose', de: 'Setze Mycel neben Arachnia. 75% des Schadens gehen auf Arachnia, 25% auf Mycel.', en: 'Deploy Mycel next to Arachnia. 75% of the damage hits Arachnia, 25% Mycel.', hints: ['The link forms at round start.'], tasks: [t('Setze Mycel ein', 'Deploy Mycel', { kind: 'deployed', defId: 'mycel' })], enemy: { mode: 'attack' } },
      { act: 3, mark: '1:25', title: 'Sporecloud', de: 'Erst vergiftet Arachnia, dann trifft die Wolke mit Power 60.', en: 'First Arachnia poisons, then the cloud hits with Power 60.', hints: ['Order matters: poison first.'], tasks: [t('Nutze Sporecloud', 'Use Sporecloud', { kind: 'used', name: 'Sporecloud' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Mind Root', de: 'Mind Root heilt den Symbiose-Partner um 20% und entfernt einen Status.', en: 'Mind Root heals the Symbiosis partner by 20% and removes one status.', hints: ['Mind Root only targets the linked ally.'], tasks: [t('Nutze Mind Root', 'Use Mind Root', { kind: 'used', name: 'Mind Root' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Arachnia und andere HP-starke Tanks, Vile (Status). Antidote.', weakness: 'Nur 300 HP, nimmt 25% fremden Schaden. Swap und Pull brechen die Verbindung.',
    probe: { mark: '3:30', de: 'Halte die Verbindung, obwohl Lullabun versucht, sie zu trennen.', en: 'Keep the link although Lullabun tries to break it.', check: { kind: 'alive' }, solution: 'Hold Position next to Arachnia and heal her with Mind Root.' },
  },
  {
    id: 'lullabun', title: 'Invisible first strike', titleDe: 'Unsichtbarer Erstschlag', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'toyroom', walls: W1,
    main: 'lullabun', guests: ['scarecrow'], enemies: ['crystal_eye', 'piggybank'], items: ['silencer'], deployMain: true, ap: 12,
    intro: { de: 'Cloth, Perceptive, Emotionless. Keine Pop-up-Meldung beim Einsetzen.', en: 'Cloth, Perceptive, Emotionless. No pop-up when deployed.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Peek-a-Boo', de: 'Der Gegner sieht nur ein leeres Feld. Bleib unter 2 Feldern Bewegung.', en: 'The enemy sees an empty tile. Stay under 2 fields of movement.', hints: ['Lullabun deploys Hidden.', 'Moving more than 2 fields reveals him.'], tasks: [t('Setze Lullabun ein', 'Deploy Lullabun', { kind: 'deployed', defId: 'lullabun' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Erstschlag', de: 'Stuffing Slash als erster Angriff aus dem Versteck: garantierter Crit.', en: 'Stuffing Slash as the first attack from hiding: a guaranteed crit.', hints: ['Strike before being seen.'], tasks: [t('Landen einen Crit', 'Land a critical hit', { kind: 'event', text: '(CRIT)' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Item und Schwäche', de: 'Silencer lässt ihn verborgen. Das Crystal Eye sieht ihn in 3 Feldern.', en: 'Silencer keeps him hidden. The Crystal Eye sees him within 3 tiles.', hints: ['Perceptive units see Hidden ones.'], tasks: [t('Greife erneut an', 'Attack again', { kind: 'damaged', count: 1 })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Scarecrow (zieht Gegner heran), Ghost Train, Swap Places.', weakness: 'Perceptive-Gegner sehen ihn bei 3 Feldern. Feld-Angriffe treffen sein Feld. Nur 250 HP.',
    probe: { mark: '3:30', de: 'Besiege einen Gegner mit dem ersten Angriff aus dem Versteck.', en: 'KO an enemy with the first attack from hiding.', check: { kind: 'ko', count: 1 }, solution: 'Sneak next to the Piggybank and slash it.', setup: { enemyHp: 0.3 } },
  },
  {
    id: 'pumpkin', title: 'Teleport and Candy Rain', titleDe: 'Teleport und Candy Rain', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'forest', walls: W2,
    main: 'pumpkin', guests: ['scarecrow'], enemies: ['ballerina', 'lullabun'], items: ['seed_bomb'], deployMain: false, ap: 12,
    intro: { de: 'Rooted, Photosynthetic. Kann nicht laufen, nutzt Teleport.', en: 'Rooted, Photosynthetic. Cannot walk, uses teleports.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Teleport Trick', de: 'Teleport bis 3 Felder, dann Treffer auf den Gegner mit den niedrigsten HP.', en: 'Teleport up to 3 tiles, then hit the enemy with the lowest HP.', hints: ['Land next to the Ballerina.'], tasks: [t('Nutze Teleport Trick', 'Use Teleport Trick', { kind: 'used', name: 'Teleport Trick' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Candy Rain', de: 'Markiere 3 Felder. Priority −1: die Treffer kommen spät.', en: 'Mark 3 tiles. Priority −1: the hits come late.', hints: ["Barbed Fence keeps enemies on the tiles."], tasks: [t('Nutze Candy Rain', 'Use Candy Rain', { kind: 'used', name: 'Candy Rain' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Trade und Schwäche', de: 'Fällt sie nach 2 Runden: +2 AP für dich, −2 für den Gegner. Feuer ist gefährlich.', en: 'If she falls after 2 rounds: +2 AP for you, −2 for the enemy. Fire is dangerous.', hints: ['Seed Bomb boosts Photosynthesis.'], tasks: [t('Spiele Seed Bomb', 'Play Seed Bomb', { kind: 'field', field: 'overgrowth' })], enemy: { mode: 'bot', items: ['molotov'] } },
    ],
    synergies: 'Scarecrow, Ghost Train. Seed Bomb.', weakness: 'Fire, Darkness (keine Heilung), Rooted: kann Feldeffekten nicht ausweichen.',
    probe: { mark: '3:30', de: 'Triff mit Candy Rain mindestens 2 Gegner.', en: 'Hit at least 2 enemies with Candy Rain.', check: { kind: 'damaged', count: 2 }, solution: "Place Candy Rain on both enemies' tiles." },
  },
  {
    id: 'steak', title: 'Recoil and leap', titleDe: 'Rückstoß und Sprung', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'laboratory', walls: W2,
    main: 'steak', guests: ['mycel'], enemies: ['ballerina', 'nexus'], items: ['iron_tonic'], deployMain: false, ap: 12,
    intro: { de: 'Parasitic, 560 HP, Speed 60. Schläge aus der Nähe tun den Angreifern weh.', en: 'Parasitic, 560 HP, Speed 60. Close attacks hurt the attacker.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Fake Steak', de: 'Die Ballerina greift aus Reichweite 1 an und erhält 30% Rückstoß.', en: 'The Ballerina attacks from range 1 and takes 30% recoil.', hints: ['Recoil is 30% at range 1, 20% at range 2.'], tasks: [t('Fake Steak Rückstoß', 'Fake Steak recoil', { kind: 'event', text: 'Fake Steak' })], enemy: { mode: 'attack' } },
      { act: 3, mark: '1:25', title: 'Order Up', de: 'Sprung bis 3 Felder, Ring-1 Power 70, leichte Gegner fliegen weg.', en: 'Jump up to 3 tiles, Ring-1 Power 70, light enemies are pushed away.', hints: ['Push Nexus into a wall for collision damage.'], tasks: [t('Nutze Order Up', 'Use Order Up', { kind: 'used', name: 'Order Up' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Snap und Schwäche', de: 'Snap heilt 15% des Schadens. Nexus schießt aus Range 7: kein Rückstoß.', en: 'Snap heals 15% of the damage. Nexus shoots from range 7: no recoil.', hints: ['Iron Tonic helps against ranged fire.'], tasks: [t('Nutze Snap', 'Use Snap', { kind: 'used', name: 'Snap' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Mycel (verteilt Schaden), Cruorina, Heavy Gloves.', weakness: 'Fernkämpfer ab Reichweite 3. Silencer verhindert den Rückstoß. Speed 60.',
    probe: { mark: '3:30', de: 'Lass einen Gegner sich durch den Rückstoß selbst besiegen.', en: 'Let an enemy KO itself through recoil.', check: { kind: 'ko', count: 1 }, solution: 'Hold Position next to the wounded Ballerina.', setup: { enemyHp: 0.1 } },
  },
  {
    id: 'ballerina', title: 'Tempo and crit', titleDe: 'Tempo und Crit', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'toyroom', walls: W1,
    main: 'ballerina', guests: ['ghost_train'], enemies: ['termite_mound', 'piggybank'], items: ['whetstone'], deployMain: false, ap: 12,
    intro: { de: 'Steel, Robust, Speed 135. Ihre Verteidigung kann nicht gesenkt werden.', en: 'Steel, Robust, Speed 135. Her defense cannot be lowered.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Pirouette', de: 'Crit 5% plus 8% pro bewegtem Feld. Lauf 3 Felder und dreh dich.', en: 'Crit 5% plus 8% per field moved. Walk 3 fields, then spin.', hints: ['The ring also hits friends.'], tasks: [t('Nutze Pirouette', 'Use Pirouette', { kind: 'used', name: 'Pirouette' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Grand Jeté', de: 'Teleport 1 Feld und Power 95. Triff die Piggybank.', en: 'Teleport 1 tile and Power 95. Hit the Piggybank.', hints: ['Grand Jeté reaches two tiles away.'], tasks: [t('Nutze Grand Jeté', 'Use Grand Jeté', { kind: 'used', name: 'Grand Jeté' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Encore und Schwäche', de: 'Verfehlt ein Angriff sie, weil sie auswich: 1 Token. Electric trifft Steel hart.', en: 'An attack missing because she moved away: 1 Token. Electric hits Steel hard.', hints: ['Tokens add 25% hits to the next damage.'], tasks: [t('Triff einen Gegner', 'Hit an enemy', { kind: 'damaged', count: 1 })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Ghost Train (Position), Scarecrow, Whetstone.', weakness: 'Electric ×1.25, Acid, nur 280 HP. Friendly Fire des Rings.',
    probe: { mark: '3:30', de: 'Triff zwei Gegner mit einer Pirouette.', en: 'Hit two enemies with one Pirouette.', check: { kind: 'damaged', count: 2 }, solution: 'Dance between both enemies, then spin.' },
  },
  {
    id: 'piggybank', title: 'Saving pays off', titleDe: 'Sparen zahlt sich aus', complexity: 'simple', rounds: 2, duration: '2:20', zone: 'laboratory', walls: W1,
    main: 'piggybank', guests: ['lullabun'], enemies: ['training_dummy'], items: ['lucky_coin'], deployMain: false, ap: 10,
    intro: { de: 'Synthetic, Robust. Sie belohnt Sparen.', en: 'Synthetic, Robust. She rewards saving.' },
    acts: [
      { act: 2, mark: '0:20', title: 'Sparen', de: 'Gib weniger als 50% der AP aus: 1 Coin und +3 Idle Bonus.', en: 'Spend less than 50% of your AP: 1 Coin and +3 Idle Bonus.', hints: ['Penny Shot grows +10% per Coin.'], tasks: [t('Gib unter 50% aus', 'Spend under 50%', { kind: 'ap_spent_below', pct: 0.5 })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:05', title: 'Ersparnis', de: 'Shake Down gibt 2 Coins. Setze Lullabun neben ihr günstiger ein.', en: 'Shake Down gives 2 Coins. Deploy next to her for less AP.', hints: ['Every 2 Coins save 1 Deploy AP.'], tasks: [t('Nutze Shake Down', 'Use Shake Down', { kind: 'used', name: 'Shake Down' })], enemy: { mode: 'idle' } },
    ],
    synergies: 'Lucky Coin (+1 AP), Little Wendigo, teure Charaktere wie Nexus.', weakness: 'Wenig Schaden, verliert beim Shake Down HP.',
    probe: { mark: '1:50', de: 'Sammle 4 Coins.', en: 'Collect 4 Coins.', check: { kind: 'counter', key: 'coins', min: 4 }, solution: 'Shake Down twice in one round.' },
  },
  {
    id: 'scarecrow', title: 'Read and hold the enemy', titleDe: 'Den Gegner lesen und festhalten', complexity: 'simple', rounds: 2, duration: '2:20', zone: 'forest', walls: W1,
    main: 'scarecrow', guests: ['ballerina'], enemies: ['lullabun', 'training_walker'], items: ['night_goggles'], deployMain: false, ap: 10,
    intro: { de: 'Wood, Perceptive. Er liest Pläne und hält Gegner fest.', en: 'Wood, Perceptive. He reads plans and holds enemies.' },
    acts: [
      { act: 2, mark: '0:20', title: 'Watchful Eye', de: 'Beobachte einen Gegner, lege Barbed Fence auf seinen Weg.', en: 'Watch an enemy and lay Barbed Fence on its path.', hints: ['Snare: only 1 more tile this round.'], tasks: [t('Lege Snare Fields', 'Lay Snare Fields', { kind: 'field', field: 'snare' })], enemy: { mode: 'bot' } },
      { act: 3, mark: '1:05', title: 'Haken', de: 'Harvest Hook zieht den Prüfling 1 Feld heran.', en: 'Harvest Hook pulls the dummy 1 tile closer.', hints: ['Pull it into the Ballerina’s ring.'], tasks: [t('Nutze Harvest Hook', 'Use Harvest Hook', { kind: 'used', name: 'Harvest Hook' })], enemy: { mode: 'bot', items: ['molotov'] } },
    ],
    synergies: 'Ballerina, Pumpkin (Candy Rain auf Snare-Felder), Lullabun enttarnen.', weakness: 'Fire und Slash. Lab Assistant ist gegen Watchful Eye immun.',
    probe: { mark: '1:50', de: 'Halte einen Gegner mit Barbed Fence fest.', en: 'Hold an enemy with Barbed Fence.', check: { kind: 'status', status: 'snared', side: 'enemy' }, solution: 'Fence the tiles right in front of the walker.' },
  },
  {
    id: 'frankenstein', title: 'Collect charges', titleDe: 'Ladungen sammeln', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'laboratory', walls: W2,
    main: 'frankenstein', guests: ['ballerina'], enemies: ['termite_mound', 'swamp_siren'], items: ['tesla_coil', 'insulated_gloves'], deployMain: false, ap: 12,
    intro: { de: 'Conductive, Organic. Elektrische Treffer machen Schock, sie selbst ist immun.', en: 'Conductive, Organic. Electric hits shock; she herself is immune.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Galvanic Fist', de: 'Power 55, Shock 30%. Jedes Schock-Ereignis gibt eine Ladung.', en: 'Power 55, Shock 30%. Each shock event gives a Charge.', hints: ['Charges glow next to her token.'], tasks: [t('Nutze Galvanic Fist', 'Use Galvanic Fist', { kind: 'used', name: 'Galvanic Fist' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Elektrisches Feld', de: 'Tesla Coil legt ein Electric Field. Darauf springt der Schlag weiter.', en: 'Tesla Coil lays an Electric Field. Standing on it, the punch arcs.', hints: ['End the round on Electric: +1 Charge.'], tasks: [t('Lege ein Electric Field', 'Lay an Electric Field', { kind: 'field', field: 'electric' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Skybolt', de: 'Skybolt (Power 80) +30% gegen geschockte Ziele. Bei 3 Ladungen +60%.', en: 'Skybolt (Power 80) +30% against shocked targets. At 3 Charges +60%.', hints: ['Skybolt ignores line of sight.'], tasks: [t('Nutze Skybolt', 'Use Skybolt', { kind: 'used', name: 'Skybolt' })], enemy: { mode: 'bot', items: ['rain_barrel'] } },
    ],
    synergies: 'Ballerina und andere schnelle Charaktere. Tesla Coil und Rain Barrel. Nexus.', weakness: 'Electric ×1.25, Wasser, Heilung −25% durch Artificial.',
    probe: { mark: '4:25', de: 'Sammle 3 Ladungen und triff mit dem verstärkten Schlag.', en: 'Collect 3 Charges and strike with the empowered hit.', check: { kind: 'event', text: 'unleashes 3 Static Charges' }, solution: 'Stand on the Electric Field and keep punching.' },
  },
  {
    id: 'ghost_train', title: 'Move positions', titleDe: 'Positionen verschieben', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'graveyard', walls: W3,
    main: 'ghost_train', guests: ['lab_assistant'], enemies: ['steak', 'cog_cuckoo'], items: ['scope'], deployMain: false, ap: 12,
    intro: { de: 'Ether, Perceptive. Sie liest Absichten und bewegt Gegner.', en: 'Ether, Perceptive. She reads intentions and moves enemies.' },
    acts: [
      { act: 2, mark: '0:25', title: "Seer's Glance", de: 'Wähle das Ziel, das einen Move geplant hat. Es wird Marked.', en: 'Pick the target that planned a Move. It becomes Marked.', hints: ['Marked: +15 Accuracy against it.'], tasks: [t('Markiere ein Ziel', 'Mark a target', { kind: 'status', status: 'marked', side: 'enemy' })], enemy: { mode: 'bot' } },
      { act: 3, mark: '1:25', title: 'Trainticket', de: 'Verschiebe einen Gegner um 2 Felder, auch durch Wände.', en: 'Move an enemy by 2 tiles, even through walls.', hints: ['Put him next to the Lab Assistant.'], tasks: [t('Nutze Trainticket', 'Use Trainticket', { kind: 'event', text: 'rides the Trainticket' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: "Mind's Eye", de: 'Speed ±15% verschiebt ihren Platz in der Reihenfolge.', en: 'Speed ±15% shifts her place in the order.', hints: ['Sonic and Pierce hurt her.'], tasks: [t('Triff einen Gegner', 'Hit an enemy', { kind: 'damaged', count: 1 })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Lab Assistant (Backstab nach Verschieben), Pumpkin, Crystal Eye.', weakness: 'Nur 240 HP. Ether: Sonic und Psychic ×1.25. Airborne: Pierce ×1.25.',
    probe: { mark: '3:30', de: 'Verschiebe einen Gegner zur Lab Assistant und lass sie treffen.', en: 'Move an enemy next to the Lab Assistant and let her strike.', check: { kind: 'used', name: 'Scalpel Backstab' }, solution: 'Trainticket first, then the Backstab with Rest.' },
  },
  {
    id: 'pokerface', title: 'Three moods', titleDe: 'Drei Stimmungen', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'toyroom', walls: W2,
    main: 'pokerface', guests: ['cruorina'], enemies: ['ballerina', 'cymbal_chimp'], items: ['heavy_gloves'], deployMain: true, ap: 12,
    intro: { de: 'Multi-Minded, Robust. Die Stimmung wird beim Einsetzen gewählt.', en: 'Multi-Minded, Robust. The mood is chosen when he is deployed.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Stimmung wählen', de: 'Setze Pokerface ein und wähle Froh, Traurig oder Wütend.', en: 'Deploy Pokerface and choose Happy, Sad or Angry.', hints: ['The enemy learns it at his first attack.'], tasks: [t('Setze Pokerface ein', 'Deploy Pokerface', { kind: 'deployed', defId: 'pokerface' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Stimmung nutzen', de: 'Nutze eine Attacke deiner Stimmung.', en: 'Use an attack of your mood.', hints: ['Happy buffs, Sad weakens, Angry hits.'], tasks: [t('Greife an', 'Attack', { kind: 'any', of: [{ kind: 'used', name: 'Spotlight' }, { kind: 'used', name: 'Dirge' }, { kind: 'used', name: 'Slap' }, { kind: 'used', name: 'Replay' }, { kind: 'used', name: 'Weeping Wound' }, { kind: 'used', name: 'Box Leap' }] })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Schwäche', de: 'Multi-Minded: −10 Accuracy auf die erste Aktion jeder Runde.', en: 'Multi-Minded: −10 Accuracy on the first action every round.', hints: ['Plan a cheap first action.'], tasks: [t('Triff einen Gegner', 'Hit an enemy', { kind: 'damaged', count: 1 })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Cruorina (Blutungen), Ballerina, Chimp als Replay-Ziel.', weakness: 'Feste Stimmung, die erste Aktion trifft schlechter, nur 330 HP.',
    probe: { mark: '4:25', de: 'Besiege einen Gegner in einer Runde.', en: 'KO an enemy in one round.', check: { kind: 'ko', count: 1 }, solution: 'Focus the weakened Chimp with everything.' },
  },
  {
    id: 'shrink_heads', title: 'Master and four heads', titleDe: 'Master und vier Köpfe', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'forest', walls: W1,
    main: 'shrink_heads', guests: ['zombie_limb'], enemies: ['cymbal_chimp', 'nexus'], items: ['iron_tonic'], deployMain: true, ap: 12,
    intro: { de: 'Colony, Hive Mind. Ein Master und 4 Köpfe zum Preis von 5 AP.', en: 'Colony, Hive Mind. A Master and 4 heads for 5 AP.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Aufstellung', de: 'Die vier Köpfe erscheinen auf den Diagonalfeldern.', en: 'The four heads appear on the diagonal tiles.', hints: ['Heads move for free, 5 tiles total.'], tasks: [t('Setze Shrink Heads ein', 'Deploy Shrink Heads', { kind: 'deployed', defId: 'shrink_heads' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Shrunken Strike', de: 'Power 45 plus 15% pro Kopf neben Master oder Ziel.', en: 'Power 45 plus 15% per head next to the Master or target.', hints: ['Four heads: +60%.'], tasks: [t('Nutze Shrunken Strike', 'Use Shrunken Strike', { kind: 'used', name: 'Shrunken Strike' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Head Count und Schwäche', de: 'Köpfe zählen für Hive Mind. Flächenschaden ×1.25 gegen Colony.', en: 'Heads count for Hive Mind. Area damage ×1.25 against Colony.', hints: ['If the Master falls, the heads vanish.'], tasks: [t('Nutze Head Swap', 'Use Head Swap', { kind: 'used', name: 'Head Swap' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Zombie Limb, Termite Mound (Hive Mind). Iron Tonic auf dem Master.', weakness: 'Flächenangriffe, Master-HP 260. Köpfe geben keine Belohnung.',
    probe: { mark: '3:30', de: 'Besiege einen Gegner mit Shrunken Strike.', en: 'KO an enemy with Shrunken Strike.', check: { kind: 'ko', count: 1 }, solution: 'Surround the target with heads first.', setup: { enemyHp: 0.3 } },
  },
  {
    id: 'swamp_siren', title: 'Own terrain', titleDe: 'Eigenes Gelände', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'bog', walls: W2,
    main: 'swamp_siren', guests: ['vile'], enemies: ['ballerina', 'wisp'], items: ['rain_barrel'], deployMain: true, ap: 12,
    intro: { de: 'Amphibious, Regenerative. Sie baut ihren Sumpf selbst.', en: 'Amphibious, Regenerative. She builds her own swamp.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Swamp Heart', de: 'Ein Feld innerhalb von 4 und 2 Nachbarn werden Swamp.', en: 'A tile within 4 and 2 neighbours become Swamp.', hints: ['Swamp and Water cost her 0 AP.'], tasks: [t('Setze die Sirene ein', 'Deploy the Siren', { kind: 'deployed', defId: 'swamp_siren' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Mire Song', de: 'Ein Kegel mit Power 50. Wer auf Sumpf steht, wird geblendet.', en: 'A cone with Power 50. Targets on Swamp are blinded.', hints: ['Lure the Ballerina onto the swamp.'], tasks: [t('Nutze Mire Song', 'Use Mire Song', { kind: 'used', name: 'Mire Song' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Mud Double und Schwäche', de: 'Mud Double lässt eine Decoy zurück. Feuer trocknet den Sumpf.', en: 'Mud Double leaves a decoy. Fire dries the swamp.', hints: ['The decoy bursts when destroyed.'], tasks: [t('Nutze Mud Double', 'Use Mud Double', { kind: 'event', text: 'Mud Decoy' })], enemy: { mode: 'bot', items: ['molotov'] } },
    ],
    synergies: 'Vile (Gift im Sumpf), Mycel, Rain Barrel.', weakness: 'Fire, Electric, trockene Felder.',
    probe: { mark: '3:30', de: 'Blende 2 Gegner mit einem Mire Song.', en: 'Blind 2 enemies with one Mire Song.', check: { kind: 'status', status: 'blind', count: 2, side: 'enemy' }, solution: 'Sing before they wade out of the swamp.', setup: { fieldUnderEnemies: 'swamp' } },
  },
  {
    id: 'wisp', title: 'Gas and candle', titleDe: 'Gas und Kerze', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'graveyard', walls: W1,
    main: 'wisp', guests: ['frankenstein'], enemies: ['cymbal_chimp', 'pumpkin'], items: ['smoke_candle'], deployMain: true, ap: 12,
    intro: { de: 'Gas, Spectral, Airborne. 230 HP. Eine Kerze heilt sie.', en: 'Gas, Spectral, Airborne. 230 HP. A candle heals her.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Candle', de: 'Sie setzt die Kerze neben sich: 20% Heilung in 3 Feldern.', en: 'She places the candle next to her: 20% healing within 3 tiles.', hints: ['The candle has only 60 HP.'], tasks: [t('Setze das Wisp ein', 'Deploy the Wisp', { kind: 'deployed', defId: 'wisp' })], enemy: { mode: 'idle' }, timelapse: 1 },
      { act: 3, mark: '1:25', title: 'Marsh Gas', de: 'Erst Gas legen, dann dasselbe Feld zünden: Power 80.', en: 'Lay gas first, then ignite the same tile: Power 80.', hints: ['Two casts on the same tile.'], tasks: [t('Zünde das Gas', 'Ignite the gas', { kind: 'event', text: 'ignites the Marsh Gas' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Zünder und Schwäche', de: 'Skybolt zündet Gas. Flicker blendet und teleportiert zur Kerze.', en: 'Skybolt ignites gas. Flicker blinds and teleports to the candle.', hints: ['Fire ×1.5 against Gas bodies.'], tasks: [t('Nutze Flicker', 'Use Flicker', { kind: 'used', name: 'Flicker' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Frankenstein, Calaca Flamenca (Fire), Nexus, Smoke Candle.', weakness: 'Kerze zerstörbar, Fire ×1.5, Electric ×1.25. Explosionen treffen Freunde.',
    probe: { mark: '3:30', de: 'Triff 2 Gegner mit einer Explosion und keinen Freund.', en: 'Hit 2 enemies with one explosion and no friend.', check: { kind: 'damaged', count: 2 }, solution: 'Gas between the two enemies, then ignite.' },
  },
  {
    id: 'crystal_eye', title: 'Beam and bombs', titleDe: 'Strahl und Bomben', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'laboratory', walls: W2,
    main: 'crystal_eye', guests: ['scarecrow'], enemies: ['ballerina', 'steak', 'cymbal_chimp'], items: ['iron_tonic'], enemyItems: ['tuning_fork'], deployMain: false, ap: 12,
    intro: { de: 'Crystal, Spectral, Airborne. Elite mit 270 HP und Radiant-Schaden.', en: 'Crystal, Spectral, Airborne. Elite with 270 HP and Radiant damage.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Prismatic Beam', de: 'Wähle 2 Felder. Der Strahl knickt und durchdringt alles.', en: 'Choose 2 tiles. The beam bends and pierces everything.', hints: ['At most 8 tiles long.'], tasks: [t('Triff 2 Gegner', 'Hit 2 enemies', { kind: 'damaged', count: 2 })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Orb Bomb', de: 'Lege die Bombe auf den Weg der Ballerina.', en: 'Place the bomb on the Ballerina’s path.', hints: ['It detonates in a Star-2 pattern.'], tasks: [t('Nutze Orb Bomb', 'Use Orb Bomb', { kind: 'event', text: 'Crystal Bomb' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Aufrüsten', de: 'Orb Bomb auf die eigene Bombe: +1 Arm und +15% Power.', en: 'Orb Bomb on your own bomb: +1 arm and +15% Power.', hints: ['Up to three upgrades.'], tasks: [t('Rüste die Bombe auf', 'Upgrade the bomb', { kind: 'event', text: 'upgraded' })], enemy: { mode: 'bot', items: ['tuning_fork'] } },
    ],
    synergies: 'Scarecrow (Snare), Ghost Train (Verschieben), Frankenstein.', weakness: 'Sonic, Blunt, Pierce. 270 HP.',
    probe: { mark: '4:25', de: 'Lass einen Gegner in eine Bombe laufen.', en: 'Let an enemy walk into a bomb.', check: { kind: 'event', text: 'Crystal Bomb detonates' }, solution: 'Bomb the tile in front of the advancing enemy.' },
  },
  {
    id: 'termite_mound', title: 'Eating walls', titleDe: 'Mauern fressen', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'laboratory', walls: W4,
    main: 'termite_mound', guests: ['zombie_limb'], enemies: ['scarecrow', 'frankenstein'], items: ['iron_tonic'], deployMain: false, ap: 12,
    intro: { de: 'Rooted, Colony, Hive Mind. Läuft nie, wirkt über Felder.', en: 'Rooted, Colony, Hive Mind. Never walks, works through fields.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Gnaw Swarm', de: 'Auf eine Wand gerichtet zerstört sie diese: ein Acid Field entsteht.', en: 'Aimed at a wall it destroys it: an Acid Field appears.', hints: ['Open a path through the walls.'], tasks: [t('Zerstöre eine Wand', 'Destroy a wall', { kind: 'event', text: 'devours a wall' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Ant Trail', de: 'Die Ameisenspur zu einer Wand oder einem Verbündeten.', en: 'The ant trail to a wall or an ally.', hints: ['Enemies crossing it take Power 25.'], tasks: [t('Lege eine Ameisenspur', 'Form an Ant Trail', { kind: 'field', field: 'ant_trail' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Hive Shift und Schwäche', de: 'Hive Shift tauscht mit dem Zombie Limb (6 Felder).', en: 'Hive Shift swaps with the Zombie Limb (6 tiles).', hints: ['Field damage hits Rooted ×1.25.'], tasks: [t('Nutze Hive Shift', 'Use Hive Shift', { kind: 'event', text: 'Hive-Shifts' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Zombie Limb (Burrowing), Shrink Heads, Mycel.', weakness: 'Fire, Feldschaden und Flächenangriffe. Parasitic −20% gegen Steel usw.',
    probe: { mark: '3:30', de: 'Zerstöre in einer Runde eine Wand und triff einen Gegner mit dem Schwarm.', en: 'In one round, destroy a wall and hit an enemy with the swarm.', check: { kind: 'all', of: [{ kind: 'event', text: 'devours a wall' }, { kind: 'damaged', count: 1 }] }, solution: 'Gnaw a wall open, then send the second swarm at the closest enemy.' },
  },
  {
    id: 'cymbal_chimp', title: 'Revenge and rest', titleDe: 'Rache und Rest', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'toyroom', walls: W1,
    main: 'cymbal_chimp', guests: ['lullabun'], enemies: ['nexus', 'ballerina'], items: ['iron_tonic'], deployMain: false, ap: 12,
    intro: { de: 'Robust, Emotionless. Je verletzter, desto gefährlicher.', en: 'Robust, Emotionless. The more hurt, the more dangerous.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Crash', de: 'Power 40 × (1 + fehlende HP). Knockback 1.', en: 'Power 40 × (1 + missing HP). Knockback 1.', hints: ['At 40% HP: Power 64.'], tasks: [t('Nutze Crash', 'Use Crash', { kind: 'used', name: 'Crash' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Echo Clap', de: 'Das Ziel verliert 3% Max-HP je ausgegebenem AP.', en: 'The target loses 3% max HP per AP it spends.', hints: ['Clap a busy enemy.'], tasks: [t('Lege Echo', 'Apply Echo', { kind: 'status', status: 'echo', side: 'enemy' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Resonant Rest', de: 'Rest-Haken: bei der ersten Aktion platzt Ring-1 mit Shock 60%.', en: 'Rest: at his first action Ring-1 bursts with Shock 60%.', hints: ['Tick Rest, then act.'], tasks: [t('Resonant Rest', 'Resonant Rest', { kind: 'event', text: 'Resonant Rest' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Lullabun (Swap), Ghost Train, Iron Tonic.', weakness: 'Langsam, Acid ×1.25, Fernkämpfer wie Nexus.',
    probe: { mark: '3:30', de: 'Nimm einem Gegner mit Echo mindestens 15% HP.', en: 'Make an enemy lose at least 15% HP to Echo.', check: { kind: 'event', text: '(Echo)' }, solution: 'Echo Clap the Ballerina before she moves and attacks.' },
  },
  {
    id: 'mambo', title: 'Link and doppelganger', titleDe: 'Link und Doppelgänger', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'graveyard', walls: W2,
    main: 'mambo', guests: ['ballerina', 'steak'], enemies: ['termite_mound', 'cymbal_chimp', 'scarecrow'], items: ['scope'], deployMain: false, ap: 12,
    intro: { de: 'Devoted, Perceptive, Legendary. Zwei Angriffe und eine einmalige Fähigkeit.', en: 'Devoted, Perceptive, Legendary. Two attacks and a one-time ability.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Hex Dart', de: 'Range 5, hinterlässt einen Hex: nächster Spirit Link +25%.', en: 'Range 5, leaves a Hex: next Spirit Link +25%.', hints: ['Hex the Chimp.'], tasks: [t('Lege einen Hex', 'Apply a Hex', { kind: 'status', status: 'hex', side: 'enemy' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Spirit Link', de: 'Der Schaden heilt die Nachbarn des Ziels, nicht das Ziel.', en: "The damage heals the target's neighbours, not the target.", hints: ['Aim at a lone enemy.', 'Aimed at an ally it moves HP.'], tasks: [t('Nutze Spirit Link', 'Use Spirit Link', { kind: 'used', name: 'Spirit Link' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Voodoo Doll', de: 'Eine Kopie mit halber HP erscheint. Mambo ist Entranced.', en: 'A copy with half HP appears. Mambo is Entranced.', hints: ['Pain Link destroys the copy safely.'], tasks: [t('Nähe eine Kopie', 'Sew a copy', { kind: 'event', text: 'Voodoo copy' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Starke Burst-Charaktere zum Kopieren, Mycel, Heilung der Gruppe.', weakness: 'Allein −10 Accuracy. Der Link heilt auch Gegner. Voodoo macht sie wehrlos.',
    probe: { mark: '4:25', de: 'Nutze Pain Link, ohne dass Mambo Rückschlag erhält.', en: 'Use Pain Link without Mambo taking backlash.', check: { kind: 'used', name: 'Pain Link' }, solution: 'Let the copy fire Pain Link right away.' },
  },
  {
    id: 'calaca', title: 'Souls and wreath', titleDe: 'Seelen und Blumenkranz', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'graveyard', walls: W1,
    main: 'calaca', guests: ['wisp'], enemies: ['lullabun', 'steak', 'training_dummy'], items: ['field_medkit'], enemyItems: ['rain_barrel'], deployMain: false, ap: 12,
    intro: { de: 'Bone, Dead, Volatile. Sie sammelt Seelen und bringt Tote zurück.', en: 'Bone, Dead, Volatile. She collects souls and brings the dead back.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Flaming Skull', de: 'Der Schädel stoppt am ersten Gegner, Ring-1 nimmt 50%. Burn 30%.', en: 'The skull stops at the first enemy, Ring-1 takes 50%. Burn 30%.', hints: ['Hit the Steak and the dummy behind it.'], tasks: [t('Nutze Flaming Skull', 'Use Flaming Skull', { kind: 'used', name: 'Flaming Skull' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Seelen', de: 'Jeder KO in 4 Feldern gibt eine Seele (+4% Fire, +3 Speed).', en: 'Every KO within 4 tiles gives a Soul (+4% Fire, +3 Speed).', hints: ['Burning KOs give one more.'], tasks: [t('Sammle eine Seele', 'Collect a Soul', { kind: 'counter', key: 'souls', min: 1 })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Marigold Garland', de: 'Für 3 Seelen: Kranz und Marigold Field. Der Freund kehrt zurück.', en: 'For 3 Souls: a wreath and a Marigold Field. The friend returns.', hints: ['Garland lasts 3 rounds.'], tasks: [t('Lege den Kranz', 'Give the Garland', { kind: 'status', status: 'garland', side: 'ally' })], enemy: { mode: 'bot', items: ['rain_barrel'] }, setup: { counters: { souls: 3 } } },
    ],
    synergies: 'Gas Will-o-Wisp (Explosion bringt Seelen), Vile und Leech Cook.', weakness: 'Wasser, Electric ×1.25, Blunt und Sonic.',
    probe: { mark: '4:25', de: 'Belebe einen Verbündeten mit dem Garland wieder.', en: 'Revive an ally with the Garland.', check: { kind: 'event', text: 'returns with' }, solution: 'Garland the Wisp before it charges in.', setup: { counters: { souls: 3 }, allyHp: 0.2 } },
  },
  {
    id: 'werewolf', title: 'Human and wolf', titleDe: 'Mensch und Wolf', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'forest', walls: W1,
    main: 'werewolf', guests: ['scarecrow'], enemies: ['mycel', 'nexus'], items: ['moon_charm'], deployMain: false, ap: 12,
    intro: { de: 'Mythic, Predatory, Feral. Physischer Tank in zwei Formen.', en: 'Mythic, Predatory, Feral. A physical tank with two forms.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Verwandlung', de: 'Verwandle ihn für 2 AP (Priority +1): 483 HP, Power 85.', en: 'Transform him for 2 AP (Priority +1): 483 HP, Power 85.', hints: ['Wolf form lasts 3 rounds.'], tasks: [t('Werde zum Wolf', 'Become the Wolf', { kind: 'form', form: 'wolf' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Moonlit Charge', de: 'Läuft bis 3 Felder und schlägt zu: Power 95 als Wolf.', en: 'Runs up to 3 tiles and strikes: Power 95 as a wolf.', hints: ['Bleeding: 4% per field moved.'], tasks: [t('Nutze Moonlit Charge', 'Use Moonlit Charge', { kind: 'used', name: 'Moonlit Charge' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Mond und Schwäche', de: 'Moon Charm: freie Verwandlung. Danach Exhausted.', en: 'Moon Charm: free transformation. Afterwards Exhausted.', hints: ['Fire and Radiant ×1.25.'], tasks: [t('Spiele Moon Charm', 'Play Moon Charm', { kind: 'field', field: 'moonlit' })], enemy: { mode: 'bot', items: ['molotov'] } },
    ],
    synergies: 'Scarecrow (Zug), Moon Charm, Cog Cuckoo, Calaca.', weakness: 'Fire, Radiant, halbe Heilung als Wolf. Feral: Gear nur halb wirksam.',
    probe: { mark: '3:30', de: 'Besiege einen Gegner mit Charge und Bleeding.', en: 'KO an enemy with Charge and Bleeding.', check: { kind: 'ko', count: 1 }, solution: 'Claw first for Bleeding, then charge.', setup: { enemyHp: 0.3 } },
  },
  {
    id: 'midas_mummy', title: 'Gold against cards', titleDe: 'Gold gegen Karten', complexity: 'elite', rounds: 4, duration: '4:50', zone: 'graveyard', walls: W1,
    main: 'midas_mummy', guests: ['arachnia'], enemies: ['cymbal_chimp', 'lullabun'], items: ['spy_drone', 'field_medkit', 'rain_barrel', 'whetstone'], deployMain: false, ap: 12,
    intro: { de: 'Cloth, Cursed, Greedy. Eine einmalige Entscheidung, die Karten kostet.', en: 'Cloth, Cursed, Greedy. A one-time decision that costs cards.' },
    acts: [
      { act: 2, mark: '0:30', title: 'Angriffe', de: 'Bandage Lash (Slow) und Curse of the Tomb (Vulnerable).', en: 'Bandage Lash (Slow) and Curse of the Tomb (Vulnerable).', hints: ['Curse the Chimp.'], tasks: [t('Lege Vulnerable', 'Apply Vulnerable', { kind: 'status', status: 'vulnerable', side: 'enemy' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Midas Touch', de: 'Wähle eine Karte. Alle anderen dieses Typs werden Tarnished.', en: 'Pick a card. All others of its Type become Tarnished.', hints: ['Spy Drone is a cheap sacrifice.'], tasks: [t('Nutze Midas Touch', 'Use Midas Touch', { kind: 'event', text: 'Midas Touch' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Gilded', de: 'Die Midas-Touch-Karte macht Arachnia Gilded.', en: 'The Midas Touch card makes Arachnia Gilded.', hints: ['Gilded: +40% defense, −35% Speed.'], tasks: [t('Mache einen Verbündeten Gilded', 'Gild an ally', { kind: 'status', status: 'gilded', side: 'ally' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Baby Mummy (Cloth und Cursed), Arachnia und andere Tanks.', weakness: 'Der Preis (ein ganzer Kartentyp), Langsamkeit, Bounty-Punkte.',
    probe: { mark: '4:25', de: 'Überlebe mit dem Gilded-Verbündeten.', en: 'Survive with the Gilded ally.', check: { kind: 'alive' }, solution: 'Hold Position with the Gilded tank.' },
  },
  {
    id: 'cog_cuckoo', title: 'Clock hands and time travel', titleDe: 'Uhrzeiger und Zeitreise', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'toyroom', walls: W1,
    main: 'cog_cuckoo', guests: ['ghost_train'], enemies: ['ballerina', 'piggybank'], items: ['iron_tonic'], deployMain: false, startRound: 5, ap: 12,
    intro: { de: 'Wood, Chronal, Emotionless. Sie gewinnt Gleichstände.', en: 'Wood, Chronal, Emotionless. She wins speed ties.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Strike the Hour', de: 'Runde 5: Stundenzeiger auf 5, Minutenzeiger auf 11.', en: 'Round 5: hour hand on 5, minute hand on 11.', hints: ['Pick the centre so 5 hits the Ballerina.'], tasks: [t('Nutze Strike the Hour', 'Use Strike the Hour', { kind: 'event', text: 'strikes the hour' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Trainticket', de: 'Ghost Train schiebt die Piggybank auf den Zeiger.', en: 'Ghost Train pushes the Piggybank onto the hand.', hints: ['Priority −1: the hands strike late.'], tasks: [t('Lege Chrono Fields', 'Create Chrono Fields', { kind: 'event', text: 'strikes the hour' })], enemy: { mode: 'idle' } },
      { act: 4, mark: '2:30', title: 'Turn Back Time', de: 'Einmal pro Match: Position und HP vom Rundenanfang.', en: 'Once per match: position and HP from the start of the round.', hints: ["A KO'd unit stays KO'd."], tasks: [t('Nutze Turn Back Time', 'Use Turn Back Time', { kind: 'event', text: 'turned back in time' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Ghost Train (verschiebt auf die Zeiger), Werewolf (Rettung).', weakness: 'Muster vorhersagbar. Wood: Fire ×1.5. Shock und Frozen +1 Runde.',
    probe: { mark: '3:30', de: 'Triff einen Gegner mit dem Stundenzeiger.', en: 'Hit an enemy with the hour hand.', check: { kind: 'event', text: 'Hour hand' }, solution: 'Count the round, then place the centre two tiles off.' },
  },
  {
    id: 'zombie_limb', title: 'Three parts, one colossus', titleDe: 'Drei Teile, ein Koloss', complexity: 'simple', rounds: 2, duration: '2:20', zone: 'graveyard', walls: W1,
    main: 'zombie_limb', guests: ['zombie_limb', 'zombie_limb'], enemies: ['training_dummy', 'lullabun'], items: [], deployMain: false, ap: 10,
    intro: { de: 'Dead, Burrowing, Viral, Hive Mind. Jedes Teil kostet 1 AP.', en: 'Dead, Burrowing, Viral, Hive Mind. Each part costs 1 AP.' },
    acts: [
      { act: 2, mark: '0:20', title: 'Aufstellung', de: 'Flail (Infection 25%) und Grab (Snare 60%).', en: 'Flail (Infection 25%) and Grab (Snare 60%).', hints: ['Limbs burrow through walls for +1 AP.'], tasks: [t('Nutze Flail', 'Use Flail', { kind: 'used', name: 'Flail' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:05', title: 'Fuse', de: 'Zwei Limbs verschmelzen für 1 AP zum Patchwork Zombie.', en: 'Two limbs fuse for 1 AP into a Patchwork Zombie.', hints: ['The third one makes a Brute.'], tasks: [t('Verschmelze', 'Fuse', { kind: 'event', text: 'Fuse!' })], enemy: { mode: 'idle' } },
    ],
    synergies: 'Termite Mound und Shrink Heads (Hive Mind), Midas Touch auf den Brute.', weakness: 'Einzeln fällt jeder Limb mit einem Treffer. Jeder Limb gibt 4 VP.',
    probe: { mark: '1:50', de: 'Bilde den Stitched Brute.', en: 'Form the Stitched Brute.', check: { kind: 'event', text: 'Stitched Brute' }, solution: 'Fuse the Patchwork with the last limb.' },
  },
  {
    id: 'baby_mummy', title: 'Fear and curse', titleDe: 'Furcht und Fluch', complexity: 'simple', rounds: 2, duration: '2:20', zone: 'tomb', walls: W1,
    main: 'baby_mummy', guests: ['midas_mummy'], enemies: ['lullabun', 'ballerina'], items: [], deployMain: false, ap: 10,
    intro: { de: 'Cloth, Cursed, Perceptive. Winzig, aber teuer zu töten.', en: 'Cloth, Cursed, Perceptive. Tiny, but expensive to kill.' },
    acts: [
      { act: 2, mark: '0:20', title: 'Wail', de: 'Wail wirkt auf Burst-2 nur gegen Gegner: Fear 40%.', en: 'Wail hits Burst-2, enemies only: Fear 40%.', hints: ['It also reveals hidden Lullabun.'], tasks: [t('Nutze Wail', 'Use Wail', { kind: 'used', name: 'Wail' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:05', title: 'Little Curse', de: 'Fällt sie, erhält der Mörder Jinx und ein Bandage Field entsteht.', en: 'If she falls, the killer gets Jinx and a Bandage Field appears.', hints: ['Midas Mummy heals 8% on Bandage.'], tasks: [t('Little Curse', 'Little Curse', { kind: 'status', status: 'jinx', side: 'enemy' })], enemy: { mode: 'attack' } },
    ],
    synergies: 'Midas Touch (Gilded Baby Mummy), Mummy-Decks, Wendigo.', weakness: '110 HP. Cloth: Fire ×1.5, Cursed: Radiant ×1.25.',
    probe: { mark: '1:50', de: 'Löse Little Curse aus.', en: 'Trigger Little Curse.', check: { kind: 'field', field: 'bandage' }, solution: 'Walk the Baby Mummy next to the Ballerina.' },
  },
  {
    id: 'little_wendigo', title: 'Hunger as a resource', titleDe: 'Hunger als Ressource', complexity: 'simple', rounds: 2, duration: '2:20', zone: 'forest', walls: W1,
    main: 'little_wendigo', guests: ['ballerina'], enemies: ['scarecrow', 'cymbal_chimp'], items: [], deployMain: false, ap: 10,
    intro: { de: 'Ether, Mythic, Phasing, Insatiable. Billig für 2 AP.', en: 'Ether, Mythic, Phasing, Insatiable. Cheap for 2 AP.' },
    acts: [
      { act: 2, mark: '0:20', title: 'Starving Mark', de: 'Markiere den Scarecrow. Jeder Treffer deines Teams gibt 1 Feast AP.', en: "Mark the Scarecrow. Each of your team's hits banks 1 Feast AP.", hints: ['Max +2 Feast AP per round.'], tasks: [t('Lege Starving Mark', 'Apply Starving Mark', { kind: 'status', status: 'starving_mark', side: 'enemy' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:05', title: 'Auszahlung', de: 'Zu Beginn der Runde erscheinen die Feast AP.', en: 'At the start of the round the Feast AP arrive.', hints: ['Famine Aura taxes nearby attackers.'], tasks: [t('Banke Feast AP', 'Bank Feast AP', { kind: 'event', text: 'Feast AP' })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Piggybank, Lucky Coin, Zombie Limb.', weakness: 'Hungert 5% pro Runde ohne KO. 120 HP.',
    probe: { mark: '1:50', de: 'Bringe 2 Feast AP in einer Runde ein.', en: 'Bank 2 Feast AP in one round.', check: { kind: 'event', text: 'Feast AP' }, solution: 'Mark, then hit the marked enemy twice with the Ballerina.' },
  },
  {
    id: 'lab_assistant', title: 'First heal, then stab', titleDe: 'Erst heilen, dann stechen', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'laboratory', walls: W1,
    main: 'lab_assistant', guests: ['scarecrow'], enemies: ['ballerina', 'steak'], items: ['whetstone'], deployMain: false, ap: 12,
    intro: { de: 'Predatory, Emotionless. Speed 125, 250 HP.', en: 'Predatory, Emotionless. Speed 125, 250 HP.', quote: 'Sie heilt auch Feinde.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Bedside Manner', de: 'Sie heilt die Ballerina um 12% und markiert sie als Patient.', en: 'She heals the Ballerina by 12% and marks her Patient.', hints: ['Patient: ×1.35 from the Scalpel.'], tasks: [t('Mache einen Patienten', 'Make a Patient', { kind: 'status', status: 'patient', side: 'enemy' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Backstab', de: 'Mit Rest handelt sie nach der Ballerina: ×1.8 und 30% PDef ignoriert.', en: 'With Rest she acts after the Ballerina: ×1.8 and 30% PDef ignored.', hints: ['Rest halves her Speed.'], tasks: [t('Nutze Scalpel Backstab', 'Use Scalpel Backstab', { kind: 'used', name: 'Scalpel Backstab' })], enemy: { mode: 'bot' } },
      { act: 4, mark: '2:30', title: 'Verdeckt und Schwäche', de: 'Watchful Eye kann ihren Plan nicht lesen. Das Steak gibt Rückstoß.', en: 'Watchful Eye cannot read her plan. The Steak recoils.', hints: ['Full HP targets take −15%.'], tasks: [t('Triff das Steak', 'Hit the Steak', { kind: 'damaged', count: 1 })], enemy: { mode: 'bot' } },
    ],
    synergies: 'Ghost Train (Position), Cymbal Chimp (Rest), Whetstone, Arachnia.', weakness: 'Nur 250 HP, Nahkampf, abhängig von Rest und Timing, Rückstoß-Gegner.',
    probe: { mark: '3:30', de: 'Triff einen Patienten mit dem vollen ×1.8-Backstab.', en: 'Hit a Patient with the full ×1.8 Backstab.', check: { kind: 'event', text: 'Backstab ×1.8' }, solution: 'Heal, Rest, and stab after the target acted.' },
  },
  {
    id: 'leech_cook', title: 'Broth from leeches', titleDe: 'Brühe aus Blutegeln', complexity: 'standard', rounds: 3, duration: '3:50', zone: 'bog', walls: W1,
    main: 'leech_cook', guests: ['steak'], enemies: ['cymbal_chimp', 'ghost_train'], items: ['field_medkit'], enemyItems: ['antidote'], deployMain: true, ap: 12,
    intro: { de: 'Parasitic, Emotional. Sie spawnt keine Einheiten. Das Gericht kommt aus dem Topf.', en: 'Parasitic, Emotional. She spawns no units. The meal comes from the pot.' },
    acts: [
      { act: 2, mark: '0:25', title: 'Pot Luck', de: 'Der Cooking Pot erscheint neben ihr. Leech Toss setzt Leeched.', en: 'The Cooking Pot appears next to her. Leech Toss applies Leeched.', hints: ['Every 20 HP drained: 1 Broth.'], tasks: [t('Setze die Köchin ein', 'Deploy the Cook', { kind: 'deployed', defId: 'leech_cook' })], enemy: { mode: 'idle' } },
      { act: 3, mark: '1:25', title: 'Leech Toss', de: 'Leeched: 4% Max-HP pro Runde fließen in den Topf.', en: 'Leeched: 4% max HP per round flows into the pot.', hints: ['Leech the tankiest enemy.'], tasks: [t('Lege Leeched', 'Apply Leeched', { kind: 'status', status: 'leeched', side: 'enemy' })], enemy: { mode: 'idle' }, timelapse: 2 },
      { act: 4, mark: '2:30', title: 'Serve Stew', de: 'Mit 3 Broth heilt das Steak 24% und wird Well Fed.', en: 'With 3 Broth the Steak heals 24% and becomes Well Fed.', hints: ['Stay within 2 tiles of the pot.'], tasks: [t('Serviere Stew', 'Serve Stew', { kind: 'event', text: 'Stew' })], enemy: { mode: 'bot', items: ['antidote'] } },
    ],
    synergies: 'Mycel und Arachnia (Status), Steak (Tank), Rain Barrel gegen Scalded.', weakness: 'Der Topf selbst, Antidote und Sterile Fields, Parasitic gegen Synthetic.',
    probe: { mark: '3:30', de: 'Serviere Stew mit 3 Broth.', en: 'Serve Stew with 3 Broth.', check: { kind: 'event', text: '(3 Broth)' }, solution: 'Let the leeches drain, then serve the Steak.', setup: { counters: { broth: 3 } } },
  },
];

export const TUTORIAL_BY_ID: Record<string, TutorialPlan> = Object.fromEntries(TUTORIALS.map((t) => [t.id, t]));

export const TUTORIAL_TOOLS = [
  { id: 'warden', name: 'Warden', de: 'Erzähler in der Testkammer, spricht über Klebezettel.', en: 'Narrator of the chamber, speaks on sticky notes.' },
  { id: 'spotlight', name: 'Spotlight', de: 'Verdunkelt alles außer dem erklärten Objekt.', en: 'Darkens everything but the explained object.' },
  { id: 'ghost', name: 'Ghost preview', de: 'Zeigt geplante Wege und Ziele als durchsichtige Pfeile.', en: 'Shows planned paths and targets as translucent arrows.' },
  { id: 'slowmo', name: 'Slow motion', de: 'Die Auflösung läuft Aktion für Aktion.', en: 'Resolution plays action by action.' },
  { id: 'calc', name: 'Calculation window', de: 'Power × Verhältnis × Multiplikator = Schaden.', en: 'Power × ratio × multipliers = damage.' },
  { id: 'rewind', name: 'Try another plan', de: 'Setzt die Runde zurück, höchstens 2 Mal je Runde.', en: 'Resets the round, at most twice per round.' },
  { id: 'weakness', name: 'Weakness pointer', de: 'Rotes Ausrufezeichen über der ausgenutzten Eigenschaft.', en: 'Red exclamation mark over the exploited characteristic.' },
  { id: 'tasks', name: 'Task list', de: '1–3 Aufgaben pro Runde.', en: '1–3 tasks per round.' },
  { id: 'progress', name: 'Progress bar', de: 'Fünf Stationen für die fünf Akte.', en: 'Five stations for the five acts.' },
  { id: 'fixed', name: 'Fixed randomness', de: 'Treffer und Crits sind festgelegt, nur die Probe ist echt.', en: 'Hits and crits are fixed; only the final test is real.' },
  { id: 'dummies', name: 'Test dummies', de: 'Strohpuppen: stehend und laufend.', en: 'Straw dummies: standing and walking.' },
];
