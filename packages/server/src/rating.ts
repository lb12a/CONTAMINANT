// Elo-style MMR with provisional K, divisions with sub-tiers, seasonal soft resets and rewards.

export const START_MMR = 1000;

export function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** K-factor: provisional players move faster. */
export function kFactor(games: number, mmr: number): number {
  if (games < 10) return 48;
  if (games < 30) return 32;
  if (mmr >= 2000) return 16;
  return 24;
}

export interface RatingChange {
  a: number;
  b: number;
  deltaA: number;
  deltaB: number;
}

/** score: 1 = A won, 0 = B won, 0.5 = draw. A small VP-margin bonus rewards dominant wins (max +25%). */
export function rate(a: number, b: number, gamesA: number, gamesB: number, score: number, margin = 0): RatingChange {
  const ea = expected(a, b);
  const marginMult = 1 + Math.min(0.25, Math.max(0, margin) / 400);
  const da = kFactor(gamesA, a) * (score - ea) * (score === 0.5 ? 1 : marginMult);
  const db = kFactor(gamesB, b) * (1 - score - (1 - ea)) * (score === 0.5 ? 1 : marginMult);
  return { a: a + da, b: b + db, deltaA: da, deltaB: db };
}

export interface Division {
  id: string;
  name: string;
  min: number;
  color: string;
  reward: { gold: number; trophies: number; cardBack?: string; skin?: string; title?: string };
}

export const DIVISIONS: Division[] = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#B5562B', reward: { gold: 100, trophies: 0 } },
  { id: 'silver', name: 'Silver', min: 1000, color: '#c0c0c8', reward: { gold: 200, trophies: 20, cardBack: 'silver_seal' } },
  { id: 'gold', name: 'Gold', min: 1200, color: '#D9A93A', reward: { gold: 350, trophies: 40, cardBack: 'gold_seal' } },
  { id: 'platinum', name: 'Platinum', min: 1400, color: '#9FB7FF', reward: { gold: 500, trophies: 60, cardBack: 'platinum_file' } },
  { id: 'diamond', name: 'Diamond', min: 1600, color: '#4FE3FF', reward: { gold: 750, trophies: 90, cardBack: 'diamond_vial', skin: 'crystal_tokens' } },
  { id: 'master', name: 'Master', min: 1800, color: '#6B3FA0', reward: { gold: 1000, trophies: 120, cardBack: 'master_archive', skin: 'violet_bloodglass' } },
  { id: 'grandmaster', name: 'Grandmaster · Contaminant Elite', min: 2000, color: '#8CFF5A', reward: { gold: 1500, trophies: 200, cardBack: 'elite_biohazard', skin: 'spore_crown', title: 'Contaminant Elite' } },
];

export interface DivisionInfo {
  division: Division;
  tier: number; // 4..1 (I is best), 0 for Grandmaster
  label: string;
  progress: number; // 0..1 inside the tier
  next: number | null;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export function divisionFor(mmr: number): DivisionInfo {
  let d = DIVISIONS[0]!;
  for (const x of DIVISIONS) if (mmr >= x.min) d = x;
  const idx = DIVISIONS.indexOf(d);
  const next = DIVISIONS[idx + 1];
  if (!next) return { division: d, tier: 0, label: d.name, progress: 1, next: null };
  const lo = idx === 0 ? 600 : d.min;
  const span = (next.min - lo) / 4;
  const step = Math.max(0, Math.min(3, Math.floor((mmr - lo) / span)));
  const tier = 4 - step;
  const progress = Math.max(0, Math.min(1, (mmr - lo - step * span) / span));
  return { division: d, tier, label: `${d.name} ${ROMAN[tier]}`, progress, next: Math.round(lo + (step + 1) * span) };
}

/** Seasonal soft reset: pull everyone halfway back toward the starting MMR. */
export function softReset(mmr: number): number {
  return Math.round(START_MMR + (mmr - START_MMR) * 0.5);
}

export interface Season {
  id: string;
  name: string;
  number: number;
  start: number;
  end: number;
  status: 'active' | 'closed';
}

export const SEASON_LENGTH_MS = 28 * 24 * 3600 * 1000;

export function seasonName(n: number): string {
  const names = ['Spore Bloom', 'Rust Moon', 'Bone Harvest', 'Static Winter', 'Marigold Night', 'Tomb Dust'];
  return `Season ${n}: ${names[(n - 1) % names.length]}`;
}

/** Team MMR for team queues: mean of members with a small coordination bonus for premade parties. */
export function teamRating(mmrs: number[], premade: boolean): number {
  if (!mmrs.length) return START_MMR;
  const mean = mmrs.reduce((a, b) => a + b, 0) / mmrs.length;
  return mean + (premade ? 25 : 0);
}
