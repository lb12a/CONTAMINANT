// Offline play: bot matches with the local profile's deck, local rewards and match history.
import {
  EXAMPLE_DECKS,
  applyMatchReward,
  hashString,
  makeRng,
  matchReward,
  randomDeck,
  recordPlayed,
  type Difficulty,
  type ModeId,
} from '@contaminant/engine';
import { LocalMatch, cardsFor, type MatchSnapshot } from './controller.ts';
import { activeDeck, getProfile, setProfile, toast } from '../store.ts';

const BOT_NAMES = ['Night Warden', 'Specimen 7', 'Archive Ghoul', 'Ward Nurse', 'Old Janitor', 'Spore Choir'];

export function startBotMatch(opts: { difficulty?: Difficulty; mode?: ModeId; botDeck?: number; planningSeconds?: number } = {}): LocalMatch {
  const p = getProfile();
  const deck = activeDeck(p);
  const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const rng = makeRng(hashString(`bot:${seed}`));
  const bd = opts.botDeck !== undefined ? EXAMPLE_DECKS[opts.botDeck]! : seed % 4 === 3 ? randomDeck(rng) : EXAMPLE_DECKS[seed % 3]!;
  const avgLevel = Math.max(1, Math.round(deck.characters.reduce((s, c) => s + (p.collection.chars[c.defId]?.level ?? 1), 0) / deck.characters.length));
  const zones = ['laboratory', 'graveyard', 'bog', 'toyroom', 'forest', 'tomb'] as const;
  return new LocalMatch({
    seed,
    settings: { mode: opts.mode ?? p.settings.mode, planningSeconds: opts.planningSeconds ?? p.settings.planningSeconds, friendly: false, zone: zones[seed % 6]!, maxRounds: 40 },
    players: [
      { name: p.name, cards: cardsFor(deck.characters.map((c) => ({ defId: c.defId, level: p.collection.chars[c.defId]?.level ?? 1 })), 'm'), items: deck.items },
      { name: BOT_NAMES[seed % BOT_NAMES.length]!, cards: cardsFor(bd.characters.map((defId) => ({ defId, level: avgLevel })), 'b'), items: bd.items, isBot: true },
    ],
    bot: { difficulty: opts.difficulty ?? p.settings.difficulty },
    planningSeconds: opts.planningSeconds ?? p.settings.planningSeconds,
  });
}

/** Applies offline rewards (trophies, gold, chests) and records the match in the history. */
export function finishOfflineMatch(snap: MatchSnapshot, log: string[], kind = 'bot'): void {
  const me = snap.info.you;
  const won = snap.ended?.winner === me;
  const draw = snap.ended?.winner === 'draw' || snap.ended?.winner === null;
  const margin = Math.abs(snap.view.players[0].vp - snap.view.players[1].vp);
  setProfile((p) => {
    const col = structuredClone(p.collection);
    const r = matchReward(won, margin, { draw });
    const unlocked = applyMatchReward(col, r);
    if (unlocked.length) setTimeout(() => toast(`New area unlocked: ${unlocked.join(', ')}`, 'good'), 300);
    // rewards for matches played today
    const played = recordPlayed(p.daily ?? {}, Date.now(), new Date().getTimezoneOffset());
    for (const t of played.rewards) {
      col.gold += t.gold;
      if (t.chest) col.chests.push(t.chest);
      setTimeout(() => toast(`${t.games} ${t.games === 1 ? 'match' : 'matches'} today: +${t.gold} gold${t.chest ? ' and a chest' : ''}`, 'good'), 900);
    }
    const history = [
      { id: snap.info.match, at: Date.now(), kind, mode: snap.view.settings.mode, opponent: snap.info.names[me === 0 ? 1 : 0], won: draw ? null : won, vp: [snap.view.players[me].vp, snap.view.players[me === 0 ? 1 : 0].vp] as [number, number], rounds: snap.view.round, log: log.slice(-300) },
      ...p.history,
    ].slice(0, 50);
    (col as typeof col & { missions?: unknown }).missions = updateLocalMissions(p, snap, won);
    return { ...p, collection: col, history, daily: played.state };
  });
}

function updateLocalMissions(p: ReturnType<typeof getProfile>, snap: MatchSnapshot, won: boolean) {
  const col = p.collection as typeof p.collection & { missions?: { day: string; progress: Record<string, number>; claimed: string[] } };
  const day = new Date().toISOString().slice(0, 10);
  const m = col.missions && col.missions.day === day ? structuredClone(col.missions) : { day, progress: {} as Record<string, number>, claimed: [] as string[] };
  const me = snap.info.you;
  const add = (k: string, n: number) => (m.progress[k] = (m.progress[k] ?? 0) + n);
  add('played', 1);
  if (won) add('won', 1);
  add('vp', snap.view.players[me].vp);
  add('items', snap.view.players[me].discard.length);
  return m;
}
