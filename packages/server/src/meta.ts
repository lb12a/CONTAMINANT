// Telemetry collection and meta analysis: pick/deploy/ban/win rates, zones, items, archetypes,
// tier lists and automatic anomaly detection for over-performing combinations.

import { CHARACTERS, ITEMS, type GameState, type PlayerId } from '@contaminant/engine';
import type { Db } from './db.ts';

// ---------------------------------------------------------------- archetypes

export const ARCHETYPES: Record<string, { name: string; core: string[]; plan: string }> = {
  plague_garden: { name: 'Plague Garden', core: ['arachnia', 'vile', 'mycel', 'leech_cook', 'swamp_siren', 'termite_mound', 'zombie_limb', 'pumpkin'], plan: 'Poison and status attrition' },
  tomb_and_ember: { name: 'Tomb and Ember', core: ['calaca', 'wisp', 'midas_mummy', 'baby_mummy', 'little_wendigo', 'mambo', 'werewolf', 'steak'], plan: 'Fire, souls and curses' },
  clockwork_circuit: { name: 'Clockwork Circuit', core: ['nexus', 'frankenstein', 'crystal_eye', 'scarecrow', 'ghost_train', 'lullabun', 'cymbal_chimp', 'piggybank', 'ballerina', 'pokerface'], plan: 'Information and tempo' },
  hive_swarm: { name: 'Hive Swarm', core: ['zombie_limb', 'shrink_heads', 'termite_mound', 'mycel', 'baby_mummy', 'little_wendigo'], plan: 'Cheap Hive Mind bodies and fusion' },
  moonlit_hunt: { name: 'Moonlit Hunt', core: ['werewolf', 'little_wendigo', 'scarecrow', 'pumpkin', 'ghost_train', 'lab_assistant', 'cog_cuckoo'], plan: 'Predators, pulls and Full Moon spikes' },
  toy_box_tempo: { name: 'Toy Box Tempo', core: ['lullabun', 'pokerface', 'piggybank', 'cymbal_chimp', 'ballerina', 'cog_cuckoo'], plan: 'Burst, hidden assassins and economy' },
};

export function classifyDeck(chars: string[]): { archetype: string; similarity: number } {
  const set = new Set(chars);
  let best = 'hybrid';
  let bestScore = 0;
  for (const [id, a] of Object.entries(ARCHETYPES)) {
    const core = new Set(a.core);
    const inter = [...set].filter((c) => core.has(c)).length;
    const union = new Set([...set, ...core]).size;
    const j = inter / union;
    if (j > bestScore) {
      bestScore = j;
      best = id;
    }
  }
  return bestScore >= 0.25 ? { archetype: best, similarity: bestScore } : { archetype: 'hybrid', similarity: bestScore };
}

// ---------------------------------------------------------------- recording

export interface MatchTelemetry {
  matchId: string;
  kind: string;
  mode: string;
  zone: string;
  winner: PlayerId | 'draw' | null;
  rounds: number;
  mmrAvg: number;
  decks: [string[], string[]];
  itemDecks: [string[], string[]];
  bans?: [string[], string[]];
  state: GameState;
}

export function recordTelemetry(db: Db, t: MatchTelemetry): void {
  const winner = t.winner === 'draw' || t.winner === null ? -1 : t.winner;
  db.tx(() => {
    db.run('INSERT OR REPLACE INTO tel_match(match_id,kind,mode,zone,winner,rounds,mmr_avg,created) VALUES(?,?,?,?,?,?,?,?)', t.matchId, t.kind, t.mode, t.zone, winner, t.rounds, t.mmrAvg, Date.now());
    for (const side of [0, 1] as const) {
      const won = winner === side ? 1 : 0;
      const deployedDefs = new Set<string>();
      for (const u of [...t.state.units, ...t.state.graveyard]) if (u.owner === side && u.cardUid && !u.isSummon) deployedDefs.add(u.defId);
      const counts: Record<string, number> = {};
      for (const d of t.decks[side]) counts[d] = (counts[d] ?? 0) + 1;
      for (const defId of Object.keys(counts)) {
        db.run('INSERT INTO tel_pick(match_id,side,def_id,in_deck,deployed,banned,won,damage) VALUES(?,?,?,?,?,?,?,?)', t.matchId, side, defId, 1, deployedDefs.has(defId) ? 1 : 0, 0, won, Math.round(t.state.stats.damageByChar[defId] ?? 0));
      }
      for (const b of t.bans?.[side] ?? []) db.run('INSERT INTO tel_pick(match_id,side,def_id,in_deck,deployed,banned,won,damage) VALUES(?,?,?,?,?,?,?,?)', t.matchId, side, b, 0, 0, 1, won, 0);
      const played = new Set(t.state.players[side].discard.map((c) => c.itemId));
      const itemCounts: Record<string, number> = {};
      for (const i of t.itemDecks[side]) itemCounts[i] = (itemCounts[i] ?? 0) + 1;
      for (const itemId of Object.keys(itemCounts)) db.run('INSERT INTO tel_item(match_id,side,item_id,in_deck,played,won) VALUES(?,?,?,?,?,?)', t.matchId, side, itemId, 1, played.has(itemId) ? 1 : 0, won);
      const { archetype } = classifyDeck(t.decks[side]);
      db.run('INSERT INTO tel_deck(match_id,side,archetype,signature,won) VALUES(?,?,?,?,?)', t.matchId, side, archetype, [...new Set(t.decks[side])].sort().join(','), won);
    }
  });
  invalidate();
}

// ---------------------------------------------------------------- statistics

export function wilson(wins: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

const logit = (p: number) => Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface MetaFilter {
  mode?: string;
  zone?: string;
  kind?: string;
  minMmr?: number;
  sinceMs?: number;
}

interface TelMatchRow {
  match_id: string;
  kind: string;
  mode: string;
  zone: string;
  winner: number;
  rounds: number;
  mmr_avg: number;
  created: number;
}

function matchIds(db: Db, f: MetaFilter): Set<string> {
  const rows = db.all<TelMatchRow>('SELECT * FROM tel_match');
  const now = Date.now();
  return new Set(
    rows
      .filter((r) => (!f.mode || r.mode === f.mode) && (!f.zone || r.zone === f.zone) && (!f.kind || r.kind === f.kind) && (!f.minMmr || r.mmr_avg >= f.minMmr) && (!f.sinceMs || now - r.created <= f.sinceMs))
      .map((r) => r.match_id),
  );
}

export interface CardStat {
  id: string;
  name: string;
  games: number;
  pickRate: number;
  deployRate: number;
  banRate: number;
  winRate: number;
  winLow: number;
  winHigh: number;
  avgDamage: number;
  tier: string;
}

function tierOf(adjWr: number, pick: number): string {
  const score = adjWr + Math.min(0.05, pick * 0.1);
  if (score >= 0.56) return 'S';
  if (score >= 0.53) return 'A';
  if (score >= 0.48) return 'B';
  if (score >= 0.44) return 'C';
  return 'D';
}

export function characterStats(db: Db, f: MetaFilter = {}): CardStat[] {
  const ids = matchIds(db, f);
  const sides = ids.size * 2 || 1;
  const rows = db.all<{ match_id: string; def_id: string; in_deck: number; deployed: number; banned: number; won: number; damage: number }>('SELECT match_id,def_id,in_deck,deployed,banned,won,damage FROM tel_pick');
  const agg = new Map<string, { games: number; deployed: number; banned: number; wins: number; damage: number }>();
  for (const r of rows) {
    if (!ids.has(r.match_id)) continue;
    const a = agg.get(r.def_id) ?? { games: 0, deployed: 0, banned: 0, wins: 0, damage: 0 };
    if (r.in_deck) {
      a.games++;
      a.wins += r.won;
      a.deployed += r.deployed;
      a.damage += r.damage;
    }
    if (r.banned) a.banned++;
    agg.set(r.def_id, a);
  }
  return Object.values(CHARACTERS)
    .map((c) => {
      const a = agg.get(c.id) ?? { games: 0, deployed: 0, banned: 0, wins: 0, damage: 0 };
      const [lo, hi] = wilson(a.wins, a.games);
      const adj = (a.wins + 5) / (a.games + 10);
      return {
        id: c.id,
        name: c.name,
        games: a.games,
        pickRate: a.games / sides,
        deployRate: a.games ? a.deployed / a.games : 0,
        banRate: a.banned / Math.max(1, ids.size),
        winRate: a.games ? a.wins / a.games : 0,
        winLow: lo,
        winHigh: hi,
        avgDamage: a.games ? a.damage / a.games : 0,
        tier: a.games ? tierOf(adj, a.games / sides) : '–',
      };
    })
    .sort((x, y) => y.winRate - x.winRate);
}

export function itemStats(db: Db, f: MetaFilter = {}): CardStat[] {
  const ids = matchIds(db, f);
  const sides = ids.size * 2 || 1;
  const rows = db.all<{ match_id: string; item_id: string; played: number; won: number }>('SELECT match_id,item_id,played,won FROM tel_item');
  const agg = new Map<string, { games: number; played: number; wins: number }>();
  for (const r of rows) {
    if (!ids.has(r.match_id)) continue;
    const a = agg.get(r.item_id) ?? { games: 0, played: 0, wins: 0 };
    a.games++;
    a.played += r.played;
    a.wins += r.won;
    agg.set(r.item_id, a);
  }
  return Object.values(ITEMS)
    .filter((i) => i.id !== 'midas_touch_card')
    .map((i) => {
      const a = agg.get(i.id) ?? { games: 0, played: 0, wins: 0 };
      const [lo, hi] = wilson(a.wins, a.games);
      const adj = (a.wins + 5) / (a.games + 10);
      return { id: i.id, name: i.name, games: a.games, pickRate: a.games / sides, deployRate: a.games ? a.played / a.games : 0, banRate: 0, winRate: a.games ? a.wins / a.games : 0, winLow: lo, winHigh: hi, avgDamage: 0, tier: a.games ? tierOf(adj, a.games / sides) : '–' };
    })
    .sort((x, y) => y.pickRate - x.pickRate);
}

export function zoneStats(db: Db): { zone: string; mode: string; games: number; leftWins: number; avgRounds: number }[] {
  const rows = db.all<TelMatchRow>('SELECT * FROM tel_match');
  const agg = new Map<string, { zone: string; mode: string; games: number; p0: number; rounds: number }>();
  for (const r of rows) {
    const k = `${r.zone}|${r.mode}`;
    const a = agg.get(k) ?? { zone: r.zone, mode: r.mode, games: 0, p0: 0, rounds: 0 };
    a.games++;
    if (r.winner === 0) a.p0++;
    a.rounds += r.rounds;
    agg.set(k, a);
  }
  return [...agg.values()].map((a) => ({ zone: a.zone, mode: a.mode, games: a.games, leftWins: a.games ? a.p0 / a.games : 0, avgRounds: a.games ? a.rounds / a.games : 0 }));
}

export function archetypeStats(db: Db, f: MetaFilter = {}): { id: string; name: string; games: number; share: number; winRate: number; winLow: number }[] {
  const ids = matchIds(db, f);
  const rows = db.all<{ match_id: string; archetype: string; won: number }>('SELECT match_id,archetype,won FROM tel_deck');
  const agg = new Map<string, { games: number; wins: number }>();
  let total = 0;
  for (const r of rows) {
    if (!ids.has(r.match_id)) continue;
    total++;
    const a = agg.get(r.archetype) ?? { games: 0, wins: 0 };
    a.games++;
    a.wins += r.won;
    agg.set(r.archetype, a);
  }
  return [...agg.entries()]
    .map(([id, a]) => ({ id, name: ARCHETYPES[id]?.name ?? 'Hybrid', games: a.games, share: total ? a.games / total : 0, winRate: a.games ? a.wins / a.games : 0, winLow: wilson(a.wins, a.games)[0] }))
    .sort((x, y) => y.share - x.share);
}

// ---------------------------------------------------------------- anomaly detection

export interface Anomaly {
  kind: 'card' | 'pair' | 'card-item';
  ids: string[];
  names: string[];
  games: number;
  winRate: number;
  expected: number;
  z: number;
  severity: 'watch' | 'warning' | 'critical';
  suggestion: string;
}

const LEVERS: Record<string, string> = {
  midas_mummy: 'Raise the Gilded enemy bounty from +5 VP to +8 VP',
  zombie_limb: 'Stitched Brute HP 480 → 420',
  mambo: 'Limit Voodoo copies to Standard tier or lower, or raise the backlash to 30%',
  calaca: 'Garland costs 4 Souls instead of 3, or revives with 20% HP',
  phoenix_feather: 'Phoenix Feather revives with 20% HP',
  little_wendigo: 'Cap Feast AP at +1 per round',
  lucky_coin: 'Cap Feast AP / Lucky Coin AP at +1 per round',
  cog_cuckoo: 'Turn Back Time cost 2 AP → 3 AP',
};

function suggestion(ids: string[]): string {
  for (const id of ids) if (LEVERS[id]) return LEVERS[id]!;
  return 'Review numbers: reduce Power by ~10% or raise AP cost by 1 on the strongest piece';
}

export function detectAnomalies(db: Db, opts: { minGames?: number; f?: MetaFilter } = {}): Anomaly[] {
  const minGames = opts.minGames ?? 20;
  const ids = matchIds(db, opts.f ?? {});
  const picks = db.all<{ match_id: string; side: number; def_id: string; in_deck: number; deployed: number; won: number }>('SELECT match_id,side,def_id,in_deck,deployed,won FROM tel_pick WHERE in_deck=1');
  const items = db.all<{ match_id: string; side: number; item_id: string; played: number; won: number }>('SELECT match_id,side,item_id,played,won FROM tel_item WHERE played=1');
  const sides = new Map<string, { won: number; chars: Set<string>; items: Set<string> }>();
  for (const p of picks) {
    if (!ids.has(p.match_id) || !p.deployed) continue;
    const k = `${p.match_id}|${p.side}`;
    const s = sides.get(k) ?? { won: p.won, chars: new Set(), items: new Set() };
    s.chars.add(p.def_id);
    sides.set(k, s);
  }
  for (const it of items) {
    if (!ids.has(it.match_id)) continue;
    const k = `${it.match_id}|${it.side}`;
    const s = sides.get(k) ?? { won: it.won, chars: new Set(), items: new Set() };
    s.items.add(it.item_id);
    sides.set(k, s);
  }
  const single = new Map<string, { n: number; w: number }>();
  const pair = new Map<string, { n: number; w: number }>();
  const bump = (m: Map<string, { n: number; w: number }>, k: string, won: number) => {
    const a = m.get(k) ?? { n: 0, w: 0 };
    a.n++;
    a.w += won;
    m.set(k, a);
  };
  for (const s of sides.values()) {
    const chars = [...s.chars].sort();
    const its = [...s.items].sort();
    for (const c of chars) bump(single, `c:${c}`, s.won);
    for (const i of its) bump(single, `i:${i}`, s.won);
    for (let a = 0; a < chars.length; a++) for (let b = a + 1; b < chars.length; b++) bump(pair, `c:${chars[a]}+c:${chars[b]}`, s.won);
    for (const c of chars) for (const i of its) bump(pair, `c:${c}+i:${i}`, s.won);
  }
  const name = (k: string) => (k.startsWith('c:') ? CHARACTERS[k.slice(2)]?.name : ITEMS[k.slice(2)]?.name) ?? k;
  const out: Anomaly[] = [];
  for (const [k, a] of single) {
    if (a.n < minGames) continue;
    const wr = a.w / a.n;
    const z = (wr - 0.5) / Math.sqrt(0.25 / a.n);
    if (wr >= 0.58 && z >= 2.5) {
      const id = k.slice(2);
      out.push({ kind: 'card', ids: [id], names: [name(k)], games: a.n, winRate: wr, expected: 0.5, z, severity: z >= 4 ? 'critical' : z >= 3 ? 'warning' : 'watch', suggestion: suggestion([id]) });
    }
  }
  for (const [k, a] of pair) {
    if (a.n < minGames) continue;
    const [x, y] = k.split('+') as [string, string];
    const sx = single.get(x);
    const sy = single.get(y);
    if (!sx || !sy) continue;
    const e = sigmoid(logit(sx.w / sx.n) + logit(sy.w / sy.n));
    const wr = a.w / a.n;
    const z = (wr - e) / Math.sqrt((e * (1 - e)) / a.n || 1e-9);
    if (wr >= 0.58 && z >= 2.5) {
      const idList = [x.slice(2), y.slice(2)];
      out.push({ kind: y.startsWith('i:') ? 'card-item' : 'pair', ids: idList, names: [name(x), name(y)], games: a.n, winRate: wr, expected: e, z, severity: z >= 4 ? 'critical' : z >= 3 ? 'warning' : 'watch', suggestion: suggestion(idList) });
    }
  }
  return out.sort((a, b) => b.z - a.z).slice(0, 50);
}

// ---------------------------------------------------------------- snapshot with cache

let cache: { at: number; key: string; data: MetaSnapshot } | null = null;
export function invalidate(): void {
  cache = null;
}

export interface MetaSnapshot {
  generated: number;
  matches: number;
  characters: CardStat[];
  items: CardStat[];
  zones: ReturnType<typeof zoneStats>;
  archetypes: ReturnType<typeof archetypeStats>;
  anomalies: Anomaly[];
  tierList: Record<string, string[]>;
}

export function metaSnapshot(db: Db, f: MetaFilter = {}): MetaSnapshot {
  const key = JSON.stringify(f);
  if (cache && cache.key === key && Date.now() - cache.at < 15_000) return cache.data;
  const characters = characterStats(db, f);
  const tierList: Record<string, string[]> = { S: [], A: [], B: [], C: [], D: [] };
  for (const c of characters) if (tierList[c.tier]) tierList[c.tier]!.push(c.id);
  const data: MetaSnapshot = {
    generated: Date.now(),
    matches: matchIds(db, f).size,
    characters,
    items: itemStats(db, f),
    zones: zoneStats(db),
    archetypes: archetypeStats(db, f),
    anomalies: detectAnomalies(db, { f }),
    tierList,
  };
  cache = { at: Date.now(), key, data };
  return data;
}

/** Learned bot weights: characters/items that win more get deployed/played more by bots. */
export function botWeights(db: Db): Record<string, number> {
  const w: Record<string, number> = {};
  for (const c of characterStats(db)) if (c.games >= 10) w[c.id] = Math.max(0.5, Math.min(1.5, 1 + (c.winRate - 0.5) * 2));
  for (const i of itemStats(db)) if (i.games >= 10) w[i.id] = Math.max(0.5, Math.min(1.5, 1 + (i.winRate - 0.5) * 2));
  return w;
}
