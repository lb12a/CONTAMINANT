// Fog of war: what each player is allowed to know. The server only ever sends `viewFor()` results
// to clients, so hidden information (Hidden units, traps, Corrupted tiles, hands, RNG) never leaves it.

import { distance } from './hex.ts';
import { canSee, hasChar } from './stats.ts';
import type { GameEvent, GameState, PlayerId } from './types.ts';

export const HIDDEN_CARD = 'hidden';

export function trapVisibleTo(s: GameState, p: PlayerId, t: GameState['traps'][number]): boolean {
  if (t.owner === p || t.revealedTo.includes(p)) return true;
  const pl = s.players[p];
  for (const u of s.units) {
    if (u.owner !== p || u.isObject) continue;
    const d = distance(u.pos, t.pos);
    if (hasChar(u, 'perceptive') && d <= 3) return true;
    if (u.gear === 'night_goggles' && d <= 4) return true;
    if (pl.spyDroneUntil >= s.round && d <= 4) return true;
  }
  return false;
}

export function viewFor(s: GameState, p: PlayerId): GameState {
  const v = structuredClone(s);
  const enemy: PlayerId = p === 0 ? 1 : 0;
  // never leak RNG state (would let a client predict hits, crits and draws)
  v.rng = { s: 0 };
  v.rngP = [{ s: 0 }, { s: 0 }];
  v.units = v.units.filter((u) => canSee(s, p, s.units.find((x) => x.uid === u.uid)!));
  for (const u of v.units) {
    if (u.owner === enemy && u.defId === 'pokerface' && !u.data.moodRevealed) u.form = null;
    if (u.owner === enemy) {
      delete u.data.lastAttack;
      delete u.data.tuning;
    }
  }
  v.traps = v.traps.filter((t) => trapVisibleTo(s, p, t));
  for (const t of v.tiles) {
    t.fields = t.fields.filter((f) => {
      if (f.id === 'corrupted' && f.owner === enemy && !f.data?.revealed) return false;
      return true;
    });
  }
  // the match seed and the enemy's secret would let a client recompute hidden choices
  v.seed = 0;
  const ep = v.players[enemy];
  ep.secret = '';
  ep.hand = ep.hand.map((c) => (ep.revealedToEnemy.includes(c.uid) ? c : { uid: c.uid, itemId: HIDDEN_CARD }));
  ep.itemDeck = ep.itemDeck.map((c) => ({ uid: '?', itemId: HIDDEN_CARD, tarnished: c.tarnished }));
  ep.offered = ep.offered.map(() => ({ cardUid: HIDDEN_CARD, locked: false }));
  const visibleCards = new Set([...ep.koCards, ...s.units.filter((u) => u.owner === enemy && u.cardUid).map((u) => u.cardUid!)]);
  ep.cards = ep.cards.map((c) => (visibleCards.has(c.uid) ? c : { uid: c.uid, defId: HIDDEN_CARD, level: 0, tuning: {} }));
  ep.undeployed = ep.undeployed.map(() => HIDDEN_CARD);
  ep.watchTarget = null;
  const mine = v.players[p];
  mine.itemDeck = mine.itemDeck.map((c) => ({ uid: '?', itemId: HIDDEN_CARD, tarnished: c.tarnished }));
  v.events = eventsFor(s.events, p);
  for (const [uid] of Object.entries(v.roundStart)) if (!v.units.some((u) => u.uid === uid)) delete v.roundStart[uid];
  v.pendingRevives = v.pendingRevives.filter((r) => r.unit.owner === p);
  return v;
}

export function eventsFor(events: GameEvent[], p: PlayerId): GameEvent[] {
  return events.filter((e) => (e.privateTo === undefined || e.privateTo === p) && e.hiddenFrom !== p);
}

/** Spectator view: full information (used with a broadcast delay by the server). */
export function spectatorView(s: GameState): GameState {
  const v = structuredClone(s);
  v.rng = { s: 0 };
  v.rngP = [{ s: 0 }, { s: 0 }];
  return v;
}
