// Small glyphs for icons until the ComfyUI icon sheets (149 icons in hexagon rings) are generated.
import { CATEGORY_COLORS, CHARACTERISTICS, STATUSES, FIELDS, ITEM_TYPE_INFO, type DamageTag, type StatusId, type FieldId, type ItemType } from '@contaminant/engine';

export const TAG_GLYPH: Record<DamageTag, string> = {
  blunt: '🔨',
  slash: '🗡',
  pierce: '📌',
  fire: '🔥',
  electric: '⚡',
  toxic: '☣',
  acid: '💧',
  sonic: '〰',
  psychic: '🌀',
  soul: '👻',
  radiant: '✷',
};

export const TAG_COLOR: Record<DamageTag, string> = {
  blunt: '#c9c3b4',
  slash: '#e8dfc8',
  pierce: '#9FB7FF',
  fire: '#FF9A1F',
  electric: '#4FE3FF',
  toxic: '#8CFF5A',
  acid: '#c8e04a',
  sonic: '#b48cff',
  psychic: '#ff7ad6',
  soul: '#9FB7FF',
  radiant: '#fff6a0',
};

export const STATUS_GLYPH: Partial<Record<StatusId, string>> = {
  poison: '☠',
  bleeding: '🩸',
  burn: '🔥',
  slow: '🐌',
  haste: '👟',
  blind: '🙈',
  shock: '⚡',
  corrosion: '🧪',
  fear: '😱',
  marked: '🎯',
  vulnerable: '💔',
  silence: '🤐',
  infection: '🦠',
  corruption: '👾',
  echo: '〰',
  spotlight: '🔦',
  depressed: '🌧',
  egg: '🥚',
  leeched: '🪱',
  patient: '📋',
  jinx: '🪞',
  gilded: '🥇',
  garland: '🌼',
  starving_mark: '🍽',
  snared: '🪤',
  dazed: '💫',
  mired: '🟫',
  soaked: '💦',
  frozen: '🧊',
  well_fed: '🍲',
  exhausted: '😮‍💨',
  empowered: '✊',
  weakened: '🫳',
  fortified: '🛡',
  brittle: '🧱',
  regeneration: '💚',
  hidden: '👁',
  entranced: '🌀',
  hex: '📍',
  overclock: '⏫',
  mirror_charm: '🪞',
  blood_pact: '🩸',
  phoenix: '🪶',
};

export const ITEM_GLYPH: Record<string, string> = {
  field_medkit: '🩹', antidote: '💉', adrenaline_shot: '💉', iron_tonic: '🧴', rage_pill: '💊', smelling_salts: '🧂', blood_pact: '📜', mirror_charm: '🪞', second_wind: '🫁', phoenix_feather: '🪶',
  contamination_burst: '☣', rain_barrel: '🛢', smoke_candle: '🕯', molotov: '🍾', emergency_sterilization: '🧴', tesla_coil: '⚡', seed_bomb: '🌱', tuning_fork: '🎼', blackout_lantern: '🏮', moon_charm: '🌙',
  amplifier_coil: '🌀', spare_battery: '🔋', vocal_tonic: '🍯', quick_fuse: '🧨', mind_link: '🔗', hex_scroll: '📜', skeleton_key: '🗝', overcharge_valve: '♨', echo_crystal: '💎', time_dilation_bottle: '⏳',
  whetstone: '🪨', scope: '🔭', poison_coating: '🧪', flame_oil: '🛢', heavy_gloves: '🥊', piercing_rounds: '📍', chain_link: '⛓', lifesteal_fang: '🦷', silencer: '🔇', executioners_ledger: '📕',
  bone_charm: '🦴', lead_boots: '🥾', running_shoes: '👟', insulated_gloves: '🧤', lucky_coin: '🪙', night_goggles: '🥽', prism_visor: '🔷', ghost_shroud: '👻', wolf_pelt: '🐺', aegis_plate: '🛡',
  spike_pit: '🕳', bear_snare: '🪤', alarm_bell: '🔔', frost_mine: '❄', shock_plate: '🔌', gas_leak: '💨', acid_mine: '🧪', rad_capsule: '☢', gag_order: '🤐', switchback_rune: '🔄',
  scout_card: '🔭', reroll_ticket: '🎲', ration_pack: '🥫', overtime: '⏰', spy_drone: '🛸', black_market: '💼', evacuation_order: '🚪', false_alarm: '🚨', customs_inspector: '🛂', backwards_clock: '🕰',
  midas_touch_card: '👑',
};

export function statusKind(id: StatusId): 'buff' | 'debuff' | 'neutral' {
  return STATUSES[id]?.kind ?? 'neutral';
}

export function charRing(id: string): string {
  const c = CHARACTERISTICS[id];
  return c ? CATEGORY_COLORS[c.category] : '#e8dfc8';
}

export function fieldColor(id: FieldId): string {
  return FIELDS[id]?.color ?? '#888';
}

export function itemTypeColor(t: ItemType): string {
  return ITEM_TYPE_INFO[t].color;
}

export const TIER_GLYPH: Record<string, string> = { swarm: '🦴', standard: '☠︎', elite: '👑', boss: '👁', summon: '•', object: '◇' };
