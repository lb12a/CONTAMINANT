// Stored matches: seed + per-round planning ops and plans. Re-simulating them reproduces the match
// exactly (the server verifies every round's state hash; the client replay viewer steps through it).

import { ITEMS } from './data/items.ts';
import { applyImmediateItem, discardFromHand, freeRequirementMet, isImmediateItem, lockOffer, paidReroll } from './itemfx.ts';
import { newMatch, playRound, stateHash } from './match.ts';
import type { DeckCardInput } from './deck.ts';
import type { PlanningOp } from './protocol.ts';
import type { GameEvent, GameState, ModeId, Plan, PlayerId, Zone } from './types.ts';

export interface ReplayRound {
  ops: { seat: PlayerId; op: PlanningOp }[];
  plans: [Plan, Plan];
  hash: string;
}

export interface ReplayLog {
  seed: number;
  settings: { mode: ModeId; planningSeconds: number; friendly: boolean; zone: Zone };
  seats: { name: string; deck: { characters: DeckCardInput[]; items: string[] }; bot?: boolean }[];
  rounds: ReplayRound[];
  finalHash?: string;
}

export function buildMatchState(id: string, seed: number, settings: ReplayLog['settings'], seats: { name: string; deck: { characters: DeckCardInput[]; items: string[] }; bot?: unknown }[]): GameState {
  return newMatch({
    id,
    seed,
    settings: { mode: settings.mode, planningSeconds: settings.planningSeconds, friendly: settings.friendly, zone: settings.zone, maxRounds: 40 },
    players: seats.map((s) => ({
      name: s.name,
      cards: s.deck.characters.map((c, i) => ({ uid: `c${i + 1}`, defId: c.defId, level: c.level ?? 1, tuning: c.tuning ?? {} })),
      items: s.deck.items,
      isBot: !!s.bot,
    })) as [never, never],
  });
}

/** Planning-phase operations that change state immediately (offer locks, paid re-rolls, instant Intel cards). */
export function applyPlanningOp(state: GameState, p: PlayerId, op: PlanningOp, plannedCards: number): { ok: boolean; error?: string } {
  const pl = state.players[p];
  switch (op.kind) {
    case 'lock':
      return lockOffer(state, p, op.card, !!op.locked) ? { ok: true } : { ok: false, error: 'card not offered' };
    case 'reroll':
      return paidReroll(state, p, op.card);
    case 'watch':
      return { ok: true };
    case 'immediate': {
      const card = pl.hand.find((c) => c.uid === op.card);
      const it = card ? ITEMS[card.itemId] : undefined;
      if (!card || !it || card.tarnished) return { ok: false, error: 'card not playable' };
      if (!isImmediateItem(it.id)) return { ok: false, error: 'not an instant card' };
      if (pl.cardsPlayedThisRound >= 3) return { ok: false, error: 'at most 3 cards per round' };
      if (it.cost === 0 && pl.freeCardsThisRound >= 2) return { ok: false, error: 'at most 2 Free cards per round' };
      if (pl.itemNamesThisRound.includes(it.name)) return { ok: false, error: 'same card name once per round' };
      const cmd = { kind: 'item' as const, card: card.uid, target: { choice: op.choice } };
      const req = it.cost === 0 ? freeRequirementMet(state, p, it.id, cmd, { cards: pl.cardsPlayedThisRound + plannedCards, others: [] }) : null;
      if (req) return { ok: false, error: req };
      if (it.cost > pl.ap) return { ok: false, error: 'not enough AP' };
      pl.ap -= it.cost;
      pl.apSpentThisRound += it.cost;
      discardFromHand(state, p, card.uid);
      pl.cardsPlayedThisRound++;
      if (it.cost === 0) pl.freeCardsThisRound++;
      pl.itemNamesThisRound.push(it.name);
      return applyImmediateItem(state, p, card, cmd);
    }
  }
}

export interface ReplayFrame {
  /** 0 = the opening position, n = after round n */
  round: number;
  state: GameState;
  /** events of the round that led to this frame */
  events: GameEvent[];
  /** the re-simulated state hash matches the recorded one */
  verified: boolean;
}

/** Re-simulates a stored match and returns one full-information frame per round. */
export function replayFrames(id: string, log: ReplayLog): ReplayFrame[] {
  const s = buildMatchState(id, log.seed, log.settings, log.seats);
  const frames: ReplayFrame[] = [{ round: 0, state: structuredClone(s), events: [], verified: true }];
  for (const [i, r] of log.rounds.entries()) {
    for (const o of r.ops) applyPlanningOp(s, o.seat, o.op, 0);
    const before = s.events.length;
    playRound(s, r.plans);
    frames.push({ round: i + 1, state: structuredClone(s), events: s.events.slice(before), verified: stateHash(s) === r.hash });
  }
  return frames;
}
