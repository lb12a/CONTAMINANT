// Section 1 (AP economy) and Section 2 (core math) of the Complete Game Plan.
// Every number in the game flows through these functions.

import type { DamageCalc, Tuning } from './types.ts';

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------- AP economy

export const AP_HARD_CAP = 30;
export const IDLE_STEP = 3;
export const IDLE_MAX = 12;

/** Base AP(R) = min(16, 10 + floor((R−1)/2)) */
export function baseAp(round: number): number {
  return Math.min(16, 10 + Math.floor((round - 1) / 2));
}

/** Random AP table: rounds 1–5: +0/+1/+2 (30/40/30), round 6+: +0/+1/+2/+3 (20/35/30/15). */
export function randomApTable(round: number): [number, number][] {
  return round <= 5
    ? [
        [0, 0.3],
        [1, 0.4],
        [2, 0.3],
      ]
    : [
        [0, 0.2],
        [1, 0.35],
        [2, 0.3],
        [3, 0.15],
      ];
}

/** Sample random AP from a uniform roll u in [0,1). */
export function randomApFromRoll(round: number, u: number): number {
  let x = u;
  for (const [v, p] of randomApTable(round)) {
    x -= p;
    if (x < 0) return v;
  }
  return randomApTable(round).at(-1)![0];
}

/**
 * Idle bonus for the next round. Spend less than 50% of the round's AP → +3, stacking +3 per
 * round up to +12. Spend 50% or more and the whole bonus disappears.
 */
export function nextIdleBonus(currentBonus: number, spent: number, total: number): number {
  if (total <= 0) return currentBonus;
  if (spent < total * 0.5) return Math.min(IDLE_MAX, currentBonus + IDLE_STEP);
  return 0;
}

export function capAp(ap: number): number {
  return Math.max(0, Math.min(AP_HARD_CAP, ap));
}

/** Move cost: ceil(fields × Move AP per field) per Move command, plus terrain extras. */
export function moveCost(fields: number, apPerField: number, extra = 0, multiplier = 1): number {
  if (fields <= 0) return 0;
  const base = Math.ceil(fields * apPerField * multiplier - 1e-9);
  return Math.max(multiplier < 1 && base > 0 ? 1 : 0, base) + extra;
}

export const KO_VP: Record<string, number> = { swarm: 4, standard: 10, elite: 12, boss: 15, patchwork: 8, brute: 10 };
export const KO_AP: Record<string, number> = { swarm: 4, standard: 10, elite: 12, boss: 15, patchwork: 8, brute: 10 };

export const CONTROL_FIELD_VP = 3;
export const TERMINAL_VP = 5;
export const LAB_OBJECTIVE_VP = 15;

/** Vacancy tax: opponent +3, then +1 for each further empty round, max +8. */
export function vacancyTax(emptyRounds: number): number {
  if (emptyRounds <= 0) return 0;
  return Math.min(8, 3 + (emptyRounds - 1));
}

// ---------------------------------------------------------------- damage

export const TAG_CLAMP: [number, number] = [0.5, 1.75];
export const MOD_CLAMP: [number, number] = [0.4, 2.5];
export const CRIT_MULT = 1.5;
export const CRIT_DEF_IGNORE = 0.25;

/** L (level): 1 + 0.10 × (Level − 1). Scales HP and Power only. */
export function levelMult(level: number): number {
  return 1 + 0.1 * (level - 1);
}

export interface DamageInput {
  power: number;
  atk: number;
  def: number;
  /** product of characteristic multipliers; pass `immune: true` to override */
  tagProduct: number;
  immune?: boolean;
  crit: boolean;
  /** sum of +/- modifiers (Vulnerable +0.20, Weakened −0.20 ...) */
  modSum: number;
  level: number;
  /** extra fraction of defense ignored (Heavy Gloves 0.15, Backstab 0.30) */
  defIgnore?: number;
  /** multiplicative post factors that are not part of M (Colony etc. are already in T) */
  extraMult?: number;
}

/**
 * Damage = Power × clamp(Atk/Def, 0.5, 2.0) × T × C × M × L, rounded, minimum 1.
 * A crit is ×1.5 and ignores 25% of the target's Defense.
 */
export function computeDamage(inp: DamageInput): DamageCalc {
  const ignore = clamp((inp.crit ? CRIT_DEF_IGNORE : 0) + (inp.defIgnore ?? 0), 0, 0.9);
  const def = Math.max(1, inp.def * (1 - ignore));
  const ratio = clamp(inp.atk / def, 0.5, 2.0);
  const T = inp.immune ? 0 : clamp(inp.tagProduct, TAG_CLAMP[0], TAG_CLAMP[1]);
  const C = inp.crit ? CRIT_MULT : 1;
  const M = clamp(1 + inp.modSum, MOD_CLAMP[0], MOD_CLAMP[1]);
  const L = levelMult(inp.level);
  const raw = inp.power * ratio * T * C * M * L * (inp.extraMult ?? 1);
  const final = T === 0 ? 0 : Math.max(1, Math.round(raw));
  return { power: inp.power, atk: inp.atk, def: Math.round(def * 100) / 100, ratio, T, C, M, L, raw, final };
}

/** Hit% = clamp(5, 100, Acc + mods). Acc null (—) cannot miss. */
export function hitChance(acc: number | null, mods: number): number {
  if (acc === null) return 100;
  return clamp(acc + mods, 5, 100);
}

/** Status chance = listed chance × (1 − target resist), scaled by chance multipliers. */
export function statusChance(base: number, resist: number, mult = 1): number {
  return clamp(base * mult * (1 - resist), 0, 1);
}

/** AP budget design rule: Power × Acc ÷ 100 × (1 + 0.5 × Crit) ÷ AP. Target 24–34. */
export function expectedDamagePerAp(power: number, acc: number | null, crit: number, ap: number): number {
  const a = acc === null ? 100 : acc;
  return (power * (a / 100) * (1 + 0.5 * (crit / 100))) / ap;
}

// ---------------------------------------------------------------- progression math

/** Duplicates(L) = 2(L−1) for the step to level L. */
export function duplicatesForLevel(level: number): number {
  return 2 * (level - 1);
}

/** Gold(L) = 75 (L−1)² for the step to level L. */
export function goldForLevel(level: number): number {
  return 75 * (level - 1) ** 2;
}

export function totalDuplicatesTo(level: number): number {
  let s = 0;
  for (let l = 2; l <= level; l++) s += duplicatesForLevel(l);
  return s;
}

export const TUNE_STEPS = 8;
export const TUNE_MAX_PER_STAT = 5;
export const TUNE_MAX_REFUNDS = 3;
export const TUNE_STEP_PCT = 0.02;

export function validateTuning(t: Tuning): { ok: boolean; error?: string } {
  let pos = 0;
  let neg = 0;
  for (const [stat, v] of Object.entries(t)) {
    if (v === undefined) continue;
    if (!Number.isInteger(v)) return { ok: false, error: `${stat}: steps must be whole numbers` };
    if (v > TUNE_MAX_PER_STAT) return { ok: false, error: `${stat}: max ${TUNE_MAX_PER_STAT} steps (+10%)` };
    if (v > 0) pos += v;
    else neg += -v;
  }
  if (neg > TUNE_MAX_REFUNDS) return { ok: false, error: `at most ${TUNE_MAX_REFUNDS} refund steps` };
  if (pos > TUNE_STEPS + neg) return { ok: false, error: `too many steps: ${pos} > ${TUNE_STEPS} + ${neg} refunds` };
  return { ok: true };
}

export function tuned(base: number, steps: number | undefined): number {
  return Math.round(base * (1 + TUNE_STEP_PCT * (steps ?? 0)));
}

/** Match rewards: a win gives 25 trophies plus 1 per 5 VP of winning margin; a loss costs 15. */
export function trophyDelta(won: boolean, margin: number): number {
  return won ? 25 + Math.floor(Math.max(0, margin) / 5) : -15;
}
