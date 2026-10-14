// Client ⇄ server WebSocket protocol (JSON). Shared by the client and the server.

import type { GameEvent, GameState, ItemType, Plan, PlayerId } from './types.ts';
import type { DeckCardInput } from './deck.ts';

export type QueueKind = 'ranked' | 'casual' | 'team' | 'bot';

export interface DeckPayload {
  id?: string;
  name?: string;
  characters: DeckCardInput[];
  items: string[];
}

export type PlanningOp =
  | { kind: 'lock'; card: string; locked: boolean }
  | { kind: 'reroll'; card: string | 'all' }
  | { kind: 'immediate'; card: string; choice?: string }
  | { kind: 'watch'; unit: string };

export type ClientMsg =
  | { t: 'hello'; token: string; version?: string }
  | { t: 'ping'; at: number }
  | { t: 'queue'; queue: QueueKind; deckId?: string; deck?: DeckPayload; mode?: string; partyId?: string }
  | { t: 'leave_queue' }
  | { t: 'plan'; match: string; plan: Plan; commit?: string; final?: boolean; round?: number }
  | { t: 'op'; match: string; op: PlanningOp }
  | { t: 'surrender'; match: string }
  | { t: 'spectate'; match: string; caster?: boolean }
  | { t: 'unspectate'; match: string }
  | { t: 'friend_create'; deckId?: string; planningSeconds?: number; mode?: string }
  | { t: 'friend_join'; code: string; deckId?: string }
  | { t: 'party_create' }
  | { t: 'party_join'; code: string }
  | { t: 'rtc_signal'; to: string; data: unknown }
  | { t: 'resume'; match: string };

export interface MatchInfo {
  match: string;
  kind: string;
  you: PlayerId;
  names: [string, string];
  mmr?: [number, number];
  planningSeconds: number;
  tournament?: string;
}

export type ServerMsg =
  | { t: 'welcome'; player: { id: string; name: string; mmr: number; division: string }; serverTime: number }
  | { t: 'pong'; at: number; serverTime: number }
  | { t: 'error'; msg: string; code?: string }
  | { t: 'queued'; queue: QueueKind; position: number; estimate: number }
  | { t: 'queue_left' }
  | { t: 'match_start'; info: MatchInfo; view: GameState; deadline: number }
  | { t: 'state'; match: string; view: GameState; deadline: number }
  | { t: 'round'; match: string; view: GameState; events: GameEvent[]; deadline: number }
  | { t: 'plan_ack'; match: string; issues: { index: number; error: string }[]; cost: number; commit?: string }
  | { t: 'opponent_ready'; match: string }
  | { t: 'watch_reveal'; match: string; unit: string; commands: unknown[] }
  | { t: 'match_end'; match: string; winner: PlayerId | 'draw' | null; reason: string | null; rewards?: unknown; mmr?: { before: number; after: number; division: string } }
  | { t: 'spectate_frame'; match: string; round: number; view: GameState; events: GameEvent[]; delayRounds: number; names: [string, string] }
  | { t: 'friend_code'; code: string }
  | { t: 'party'; code: string; members: string[] }
  | { t: 'tournament'; id: string; event: string; data?: unknown }
  | { t: 'rtc_signal'; from: string; data: unknown };

export const PROTOCOL_VERSION = '1';

/** Stable FNV-1a hash of a plan + salt used for commit–reveal (P2P lockstep and audit logs). */
export function planCommit(plan: Plan, salt: string): string {
  const s = JSON.stringify(plan) + '|' + salt;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type { ItemType };
