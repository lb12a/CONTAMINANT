// Shared board overlay types (planning highlights, playback overrides and effects).

import type { Hex, Unit, DamageTag } from '@contaminant/engine';

export type HighlightKind = 'move' | 'attack' | 'deploy' | 'target' | 'invalid' | 'area' | 'ally' | 'path' | 'corrupt';

export interface Floater {
  /** tile the number rises from (preferred) */
  h?: Hex;
  /** legacy pixel position */
  x?: number;
  y?: number;
  text: string;
  color: string;
  t0: number;
  big?: boolean;
}

export interface Flash {
  tiles: Hex[];
  color: string;
  t0: number;
  dur: number;
}

/** One-shot unit animations during playback. */
export interface Pulse {
  uid: string;
  kind: 'lunge' | 'hit' | 'heal' | 'deploy' | 'crit';
  to?: Hex;
  t0: number;
}

/** Attack visuals between two tiles: the wind-up at the attacker (charge), the flight (projectile, beam),
 * melee marks (slash), the hit at the target (impact) and plain bursts. The damage type picks the look. */
export interface Vfx {
  kind: 'projectile' | 'slash' | 'beam' | 'burst' | 'charge' | 'impact';
  tag?: DamageTag;
  /** the attack missed: no impact, only a puff */
  miss?: boolean;
  /** screen shake strength in pixels (crits, heavy hits) */
  shake?: number;
  from: Hex;
  to: Hex;
  color: string;
  t0: number;
  dur: number;
}

export interface Overlay {
  highlights: Map<string, HighlightKind>;
  paths: { unit: string; tiles: Hex[]; color: string }[];
  targets: { from: Hex; to: Hex; color: string; area?: Hex[] }[];
  ghosts: { unit: Unit; pos: Hex; order: number }[];
  selected?: string;
  hover?: Hex | null;
  /** playback overrides */
  pos?: Map<string, Hex>;
  hp?: Map<string, number>;
  gone?: Set<string>;
  floaters?: Floater[];
  flashes?: Flash[];
  pulses?: Pulse[];
  vfx?: Vfx[];
  tombs?: Hex[];
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

/** Screen area covered by floating HUD panels; the camera fits the board inside the rest. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
