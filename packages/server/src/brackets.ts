// Pure tournament bracket logic: Single Elimination, Double Elimination (with grand-final reset),
// Swiss system and round-robin groups. No I/O – the tournament service drives these.

export interface Entrant {
  id: string;
  name: string;
  seed: number;
  mmr: number;
}

export type SlotState = 'pending' | 'filled' | 'empty';

export interface BMatch {
  id: string;
  bracket: 'W' | 'L' | 'GF' | 'GF2' | '3RD' | 'SW' | 'RR';
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  aState: SlotState;
  bState: SlotState;
  winner: string | null;
  loser: string | null;
  scoreA: number;
  scoreB: number;
  status: 'waiting' | 'ready' | 'live' | 'done' | 'void';
  /** where the winner / loser go: match id + side */
  win?: { m: string; side: 'a' | 'b' };
  lose?: { m: string; side: 'a' | 'b' };
  group?: string;
  roomId?: string;
  bye?: boolean;
  draw?: boolean;
}

export interface Bracket {
  format: 'single' | 'double' | 'swiss' | 'groups';
  entrants: Entrant[];
  matches: BMatch[];
  rounds: number;
  /** swiss: current round number */
  current?: number;
  thirdPlace?: boolean;
  groups?: Record<string, string[]>;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

/** Standard seeding order: 1 v N, N/2+1 v N/2 ... e.g. size 8 → [1,8,4,5,2,7,3,6]. */
export function seedOrder(size: number): number[] {
  let arr = [1];
  while (arr.length < size) {
    const len = arr.length * 2;
    arr = arr.flatMap((x) => [x, len + 1 - x]);
  }
  return arr;
}

function mk(id: string, bracket: BMatch['bracket'], round: number, index: number): BMatch {
  return { id, bracket, round, index, a: null, b: null, aState: 'pending', bState: 'pending', winner: null, loser: null, scoreA: 0, scoreB: 0, status: 'waiting' };
}

export function byId(b: Bracket, id: string): BMatch {
  const m = b.matches.find((x) => x.id === id);
  if (!m) throw new Error(`no match ${id}`);
  return m;
}

function place(b: Bracket, target: { m: string; side: 'a' | 'b' } | undefined, player: string | null): void {
  if (!target) return;
  const m = byId(b, target.m);
  if (target.side === 'a') {
    m.a = player;
    m.aState = player ? 'filled' : 'empty';
  } else {
    m.b = player;
    m.bState = player ? 'filled' : 'empty';
  }
  settle(b, m);
}

/** Auto-resolve byes / empty matches and mark ready matches. */
function settle(b: Bracket, m: BMatch): void {
  if (m.status === 'done' || m.status === 'void') return;
  if (m.aState === 'pending' || m.bState === 'pending') return;
  if (m.aState === 'empty' && m.bState === 'empty') {
    m.status = 'void';
    place(b, m.win, null);
    place(b, m.lose, null);
    return;
  }
  if (m.aState === 'empty' || m.bState === 'empty') {
    // grand final reset never happens by bye
    if (m.bracket === 'GF2') {
      m.status = 'void';
      return;
    }
    const w = m.aState === 'filled' ? m.a : m.b;
    m.winner = w;
    m.loser = null;
    m.bye = true;
    m.status = 'done';
    place(b, m.win, w);
    place(b, m.lose, null);
    return;
  }
  m.status = 'ready';
}

// ---------------------------------------------------------------- single elimination

export function singleElimination(entrants: Entrant[], opts: { thirdPlace?: boolean } = {}): Bracket {
  const sorted = entrants.slice().sort((x, y) => x.seed - y.seed);
  const size = nextPow2(sorted.length);
  const rounds = Math.log2(size);
  const b: Bracket = { format: 'single', entrants: sorted, matches: [], rounds, thirdPlace: !!opts.thirdPlace };
  for (let r = 1; r <= rounds; r++) {
    const n = size / 2 ** r;
    for (let i = 0; i < n; i++) b.matches.push(mk(`W${r}-${i}`, 'W', r, i));
  }
  for (let r = 1; r < rounds; r++) {
    const n = size / 2 ** r;
    for (let i = 0; i < n; i++) byId(b, `W${r}-${i}`).win = { m: `W${r + 1}-${Math.floor(i / 2)}`, side: i % 2 === 0 ? 'a' : 'b' };
  }
  if (opts.thirdPlace && rounds >= 2) {
    b.matches.push(mk('3RD', '3RD', rounds, 0));
    byId(b, `W${rounds - 1}-0`).lose = { m: '3RD', side: 'a' };
    byId(b, `W${rounds - 1}-1`).lose = { m: '3RD', side: 'b' };
  }
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    const m = byId(b, `W1-${i}`);
    const ea = sorted[order[2 * i]! - 1];
    const eb = sorted[order[2 * i + 1]! - 1];
    m.a = ea?.id ?? null;
    m.aState = ea ? 'filled' : 'empty';
    m.b = eb?.id ?? null;
    m.bState = eb ? 'filled' : 'empty';
  }
  for (const m of b.matches.filter((x) => x.round === 1 && x.bracket === 'W')) settle(b, m);
  return b;
}

// ---------------------------------------------------------------- double elimination

export function doubleElimination(entrants: Entrant[]): Bracket {
  const sorted = entrants.slice().sort((x, y) => x.seed - y.seed);
  const size = Math.max(4, nextPow2(sorted.length));
  const k = Math.log2(size);
  const b: Bracket = { format: 'double', entrants: sorted, matches: [], rounds: k };
  // winners bracket
  for (let r = 1; r <= k; r++) for (let i = 0; i < size / 2 ** r; i++) b.matches.push(mk(`W${r}-${i}`, 'W', r, i));
  for (let r = 1; r < k; r++) for (let i = 0; i < size / 2 ** r; i++) byId(b, `W${r}-${i}`).win = { m: `W${r + 1}-${Math.floor(i / 2)}`, side: i % 2 === 0 ? 'a' : 'b' };
  // losers bracket: 2(k−1) rounds
  const lbRounds = 2 * (k - 1);
  const lbCount = (r: number) => size / 2 ** (Math.floor((r + 1) / 2) + 1);
  for (let r = 1; r <= lbRounds; r++) for (let i = 0; i < lbCount(r); i++) b.matches.push(mk(`L${r}-${i}`, 'L', r, i));
  // WB round 1 losers → LB round 1 (paired)
  for (let i = 0; i < size / 2; i++) byId(b, `W1-${i}`).lose = { m: `L1-${Math.floor(i / 2)}`, side: i % 2 === 0 ? 'a' : 'b' };
  for (let r = 1; r <= lbRounds; r++) {
    for (let i = 0; i < lbCount(r); i++) {
      const m = byId(b, `L${r}-${i}`);
      if (r === lbRounds) continue;
      if (r % 2 === 1) {
        // odd LB round winners meet the dropping WB losers in the next (even) round
        m.win = { m: `L${r + 1}-${i}`, side: 'a' };
      } else {
        m.win = { m: `L${r + 1}-${Math.floor(i / 2)}`, side: i % 2 === 0 ? 'a' : 'b' };
      }
    }
  }
  // WB round r (r ≥ 2) losers drop into LB round 2(r−1), reversed to avoid immediate rematches
  for (let r = 2; r <= k; r++) {
    const n = size / 2 ** r;
    const lr = 2 * (r - 1);
    for (let i = 0; i < n; i++) {
      const target = r % 2 === 0 ? n - 1 - i : i;
      byId(b, `W${r}-${i}`).lose = { m: `L${lr}-${target}`, side: 'b' };
    }
  }
  // grand final + reset
  b.matches.push(mk('GF', 'GF', k + 1, 0));
  b.matches.push(mk('GF2', 'GF2', k + 2, 0));
  byId(b, `W${k}-0`).win = { m: 'GF', side: 'a' };
  byId(b, `L${lbRounds}-0`).win = { m: 'GF', side: 'b' };
  // seed WB round 1
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    const m = byId(b, `W1-${i}`);
    const ea = sorted[order[2 * i]! - 1];
    const eb = sorted[order[2 * i + 1]! - 1];
    m.a = ea?.id ?? null;
    m.aState = ea ? 'filled' : 'empty';
    m.b = eb?.id ?? null;
    m.bState = eb ? 'filled' : 'empty';
  }
  for (const m of b.matches.filter((x) => x.round === 1 && x.bracket === 'W')) settle(b, m);
  return b;
}

// ---------------------------------------------------------------- reporting

export function report(b: Bracket, matchId: string, winner: string | null, scoreA = 0, scoreB = 0): void {
  const m = byId(b, matchId);
  if (m.status !== 'ready' && m.status !== 'live') throw new Error(`match ${matchId} is not playable (${m.status})`);
  m.scoreA = scoreA;
  m.scoreB = scoreB;
  if (winner === null) {
    // draws only exist in Swiss / round robin
    if (b.format !== 'swiss' && b.format !== 'groups') throw new Error('elimination matches need a winner');
    m.draw = true;
    m.status = 'done';
    return;
  }
  if (winner !== m.a && winner !== m.b) throw new Error('winner is not in this match');
  m.winner = winner;
  m.loser = winner === m.a ? m.b : m.a;
  m.status = 'done';
  if (m.bracket === 'GF') {
    // the winners-bracket champion (side a) wins the event; the losers-bracket champion forces a reset
    const gf2 = b.matches.find((x) => x.id === 'GF2');
    if (gf2) {
      if (winner === m.a) {
        gf2.status = 'void';
      } else {
        gf2.a = m.a;
        gf2.b = m.b;
        gf2.aState = 'filled';
        gf2.bState = 'filled';
        gf2.status = 'ready';
      }
    }
    return;
  }
  place(b, m.win, m.winner);
  place(b, m.lose, m.loser);
}

export function playable(b: Bracket): BMatch[] {
  return b.matches.filter((m) => m.status === 'ready');
}

export function champion(b: Bracket): string | null {
  if (b.format === 'single') {
    const final = b.matches.find((m) => m.bracket === 'W' && m.round === b.rounds);
    return final?.status === 'done' ? final.winner : null;
  }
  if (b.format === 'double') {
    const gf = b.matches.find((m) => m.id === 'GF');
    const gf2 = b.matches.find((m) => m.id === 'GF2');
    if (gf2?.status === 'done') return gf2.winner;
    if (gf?.status === 'done' && gf2?.status === 'void') return gf.winner;
    return null;
  }
  if (b.format === 'swiss' && b.current === b.rounds && b.matches.every((m) => m.status === 'done')) return swissStandings(b)[0]?.id ?? null;
  return null;
}

/** Final placements (1-based). Single elimination: 1, 2, 3/4 (3rd-place match), then 5, 9, 17 ... */
export function placements(b: Bracket): { id: string; place: number }[] {
  if (b.format === 'swiss' || b.format === 'groups') return swissStandings(b).map((s, i) => ({ id: s.id, place: i + 1 }));
  const out: { id: string; place: number }[] = [];
  const placed = new Set<string>();
  const put = (id: string | null | undefined, place: number) => {
    if (!id || placed.has(id)) return;
    placed.add(id);
    out.push({ id, place });
  };
  put(champion(b), 1);
  if (b.format === 'single') {
    const final = b.matches.find((m) => m.bracket === 'W' && m.round === b.rounds);
    if (final?.status === 'done') put(final.loser, 2);
    const third = b.matches.find((m) => m.bracket === '3RD');
    if (third?.status === 'done' && !third.bye) {
      put(third.winner, 3);
      put(third.loser, 4);
    }
    for (let r = b.rounds - 1; r >= 1; r--) {
      for (const m of b.matches.filter((x) => x.bracket === 'W' && x.round === r && x.status === 'done' && !x.bye)) put(m.loser, 2 ** (b.rounds - r) + 1);
    }
    return out;
  }
  // double elimination: grand final loser 2nd, then by the losers-bracket round of elimination
  const gf2 = b.matches.find((m) => m.id === 'GF2');
  const gf = b.matches.find((m) => m.id === 'GF');
  if (gf2?.status === 'done') put(gf2.loser, 2);
  else if (gf?.status === 'done') put(gf.loser, 2);
  const lb = b.matches.filter((m) => m.bracket === 'L' && m.status === 'done' && !m.bye).sort((x, y) => y.round - x.round);
  let place = out.length + 1;
  let i = 0;
  while (i < lb.length) {
    const r = lb[i]!.round;
    const same = lb.filter((m) => m.round === r);
    for (const m of same) put(m.loser, place);
    place += same.filter((m) => m.loser).length;
    i += same.length;
  }
  return out;
}

// ---------------------------------------------------------------- swiss

export interface Standing {
  id: string;
  name: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  buchholz: number;
  vpDiff: number;
  opponents: string[];
  byes: number;
}

export function swiss(entrants: Entrant[], rounds?: number): Bracket {
  const b: Bracket = {
    format: 'swiss',
    entrants: entrants.slice().sort((x, y) => x.seed - y.seed),
    matches: [],
    rounds: rounds ?? Math.max(3, Math.ceil(Math.log2(Math.max(2, entrants.length)))),
    current: 0,
  };
  swissNextRound(b);
  return b;
}

export function swissStandings(b: Bracket): Standing[] {
  const map = new Map<string, Standing>();
  for (const e of b.entrants) map.set(e.id, { id: e.id, name: e.name, points: 0, wins: 0, draws: 0, losses: 0, buchholz: 0, vpDiff: 0, opponents: [], byes: 0 });
  for (const m of b.matches) {
    if (m.status !== 'done') continue;
    const A = m.a ? map.get(m.a) : undefined;
    const B = m.b ? map.get(m.b) : undefined;
    if (m.bye) {
      const w = map.get(m.winner!)!;
      w.points += 3;
      w.wins++;
      w.byes++;
      continue;
    }
    if (!A || !B) continue;
    A.opponents.push(B.id);
    B.opponents.push(A.id);
    A.vpDiff += m.scoreA - m.scoreB;
    B.vpDiff += m.scoreB - m.scoreA;
    if (m.draw) {
      A.points += 1;
      B.points += 1;
      A.draws++;
      B.draws++;
    } else if (m.winner === A.id) {
      A.points += 3;
      A.wins++;
      B.losses++;
    } else {
      B.points += 3;
      B.wins++;
      A.losses++;
    }
  }
  for (const s of map.values()) s.buchholz = s.opponents.reduce((acc, o) => acc + (map.get(o)?.points ?? 0), 0);
  const seed = new Map(b.entrants.map((e) => [e.id, e.seed]));
  return [...map.values()].sort((x, y) => y.points - x.points || y.buchholz - x.buchholz || y.vpDiff - x.vpDiff || (seed.get(x.id)! - seed.get(y.id)!));
}

/** Pairs the next Swiss round (no rematches where possible, bye to the lowest player without one). */
export function swissNextRound(b: Bracket): BMatch[] {
  if (b.format !== 'swiss') throw new Error('not swiss');
  if (b.matches.some((m) => m.status !== 'done' && m.status !== 'void')) throw new Error('current round not finished');
  if ((b.current ?? 0) >= b.rounds) return [];
  b.current = (b.current ?? 0) + 1;
  const r = b.current;
  const standings = swissStandings(b);
  const pool = standings.map((s) => s.id);
  const created: BMatch[] = [];
  if (pool.length % 2 === 1) {
    const byeIdx = [...pool].reverse().findIndex((id) => (standings.find((s) => s.id === id)?.byes ?? 0) === 0);
    const idx = byeIdx < 0 ? pool.length - 1 : pool.length - 1 - byeIdx;
    const [byePlayer] = pool.splice(idx, 1);
    const m = mk(`S${r}-bye`, 'SW', r, 99);
    m.a = byePlayer!;
    m.aState = 'filled';
    m.bState = 'empty';
    m.winner = byePlayer!;
    m.bye = true;
    m.status = 'done';
    b.matches.push(m);
  }
  const played = new Set(b.matches.filter((m) => m.a && m.b).map((m) => [m.a, m.b].sort().join('|')));
  const pairs = pairUp(pool, played);
  pairs.forEach(([x, y], i) => {
    const m = mk(`S${r}-${i}`, 'SW', r, i);
    m.a = x;
    m.b = y;
    m.aState = 'filled';
    m.bState = 'filled';
    m.status = 'ready';
    b.matches.push(m);
    created.push(m);
  });
  return created;
}

function pairUp(pool: string[], played: Set<string>): [string, string][] {
  // backtracking from the top of the standings
  const result: [string, string][] = [];
  const used = new Set<string>();
  const rec = (): boolean => {
    const first = pool.find((p) => !used.has(p));
    if (!first) return true;
    used.add(first);
    for (const cand of pool) {
      if (used.has(cand)) continue;
      if (played.has([first, cand].sort().join('|'))) continue;
      used.add(cand);
      result.push([first, cand]);
      if (rec()) return true;
      result.pop();
      used.delete(cand);
    }
    used.delete(first);
    return false;
  };
  if (rec()) return result;
  // fall back: allow rematches
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) out.push([pool[i]!, pool[i + 1]!]);
  return out;
}

// ---------------------------------------------------------------- round robin groups

/** Group stage: entrants are snake-seeded into groups, every group plays a full round robin (circle method). */
export function roundRobinGroups(entrants: Entrant[], groupCount: number): Bracket {
  const sorted = entrants.slice().sort((x, y) => x.seed - y.seed);
  const names = 'ABCDEFGHIJKLMNOP'.split('').slice(0, groupCount);
  const groups: Record<string, string[]> = Object.fromEntries(names.map((n) => [n, [] as string[]]));
  sorted.forEach((e, i) => {
    const row = Math.floor(i / groupCount);
    const col = row % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[names[col]!]!.push(e.id);
  });
  const b: Bracket = { format: 'groups', entrants: sorted, matches: [], rounds: 0, groups };
  for (const [g, ids] of Object.entries(groups)) {
    const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids];
    const n = list.length;
    b.rounds = Math.max(b.rounds, n - 1);
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const x = list[i];
        const y = list[n - 1 - i];
        if (!x || !y) continue;
        const m = mk(`G${g}-${r + 1}-${i}`, 'RR', r + 1, i);
        m.group = g;
        m.a = x;
        m.b = y;
        m.aState = 'filled';
        m.bState = 'filled';
        m.status = 'ready';
        b.matches.push(m);
      }
      list.splice(1, 0, list.pop()!);
    }
  }
  return b;
}

export function groupStandings(b: Bracket, group: string): Standing[] {
  const sub: Bracket = { ...b, format: 'swiss', entrants: b.entrants.filter((e) => b.groups?.[group]?.includes(e.id)), matches: b.matches.filter((m) => m.group === group) };
  return swissStandings(sub);
}
