// Turns a resolved round's event log into "beats": one beat per action (move, attack, ability, card,
// deployment …) with everything it caused (damage, statuses, knock-outs). The match screen plays the
// beats one after another, slowly enough to follow, with a caption that says what happens.

import { STATUSES, type GameEvent, type GameState, type Hex } from '@contaminant/engine';

export type BeatKind = 'deploy' | 'move' | 'attack' | 'ability' | 'item' | 'trap' | 'field' | 'score' | 'other';

export interface Beat {
  kind: BeatKind;
  start: GameEvent;
  events: GameEvent[];
  /** caption parts */
  actorId?: string;
  actorName?: string;
  title: string;
  detail: string;
  /** team of the acting unit (for the caption colour) */
  owner?: number;
}

const START: Record<string, BeatKind> = {
  deploy: 'deploy',
  move: 'move',
  attack: 'attack',
  ability: 'ability',
  item: 'item',
  trap: 'trap',
  summon: 'ability',
  revive: 'ability',
};

function unitName(uid: string | undefined, states: GameState[]): string | undefined {
  if (!uid) return undefined;
  for (const s of states) {
    const u = s.units.find((x) => x.uid === uid) ?? s.graveyard.find((x) => x.uid === uid);
    if (u) return u.name;
  }
  return undefined;
}

function unitOwner(uid: string | undefined, states: GameState[]): number | undefined {
  if (!uid) return undefined;
  for (const s of states) {
    const u = s.units.find((x) => x.uid === uid) ?? s.graveyard.find((x) => x.uid === uid);
    if (u) return u.owner;
  }
  return undefined;
}

function unitAt(h: Hex | undefined, states: GameState[]): string | undefined {
  if (!h) return undefined;
  for (const s of states) {
    const u = s.units.find((x) => x.pos.c === h.c && x.pos.r === h.r && !x.isObject);
    if (u) return u.name;
  }
  return undefined;
}

/** "152 damage · crit · Poisoned · KO" */
function outcome(events: GameEvent[], states: GameState[]): string {
  const dmg = events.filter((e) => e.kind === 'damage').reduce((n, e) => n + (e.amount ?? 0), 0);
  const healed = events.filter((e) => e.kind === 'heal').reduce((n, e) => n + (e.amount ?? 0), 0);
  const parts: string[] = [];
  if (events.some((e) => e.kind === 'miss')) parts.push('missed');
  if (dmg) parts.push(`${dmg} damage`);
  if (events.some((e) => e.kind === 'crit')) parts.push('critical hit');
  if (healed) parts.push(`+${healed} HP`);
  const statuses = [...new Set(events.filter((e) => e.kind === 'status' && e.status && !e.text.includes('loses') && !e.text.includes('immune')).map((e) => STATUSES[e.status!]?.name ?? e.status!))];
  if (statuses.length) parts.push(statuses.join(', '));
  for (const k of events.filter((e) => e.kind === 'ko')) parts.push(`${unitName(k.target, states) ?? 'a creature'} is knocked out`);
  if (events.some((e) => e.kind === 'fizzle')) parts.push('fizzles');
  return parts.join(' · ');
}

export function toBeats(events: GameEvent[], before: GameState, after: GameState): Beat[] {
  const states = [after, before];
  const beats: Beat[] = [];
  let cur: Beat | null = null;
  for (const e of events) {
    if (e.kind === 'round' || e.kind === 'ap' || e.kind === 'win') continue;
    const kind = START[e.kind];
    // the per-target hit lines ("Vile → Dummy: Reaper's Slash") belong to the attack that started them
    if (kind === 'attack' && cur?.kind === 'attack' && cur.start.actor === e.actor && !e.text.includes(' uses ')) {
      cur.events.push(e);
      continue;
    }
    // an attack right after its own move stays separate; consequences join the current beat
    if (kind && !(kind === 'item' && cur && cur.kind === 'item' && cur.start.actor === e.actor && e.text === cur.start.text)) {
      cur = { kind, start: e, events: [e], actorId: e.actor, actorName: unitName(e.actor, states), title: e.text, detail: '', owner: e.owner ?? unitOwner(e.actor, states) };
      beats.push(cur);
      continue;
    }
    if (e.kind === 'vp') {
      // scoring at the end of the round gets its own short beat
      if (!cur || cur.kind !== 'score') {
        cur = { kind: 'score', start: e, events: [], title: 'Victory Points', detail: '' };
        beats.push(cur);
      }
      cur.events.push(e);
      continue;
    }
    if (!cur) {
      cur = { kind: e.kind === 'field' ? 'field' : 'other', start: e, events: [], title: e.text, detail: '' };
      beats.push(cur);
    }
    cur.events.push(e);
  }
  for (const b of beats) {
    if (b.kind === 'attack') {
      const target = unitAt(b.start.to, [before]) ?? unitName(b.events.find((e) => e.kind === 'damage' || e.kind === 'miss')?.target, states);
      if (target && !b.title.includes(target)) b.title = `${b.title} on ${target}`;
    }
    if (b.kind === 'score') b.detail = b.events.map((e) => e.text).join(' · ');
    else b.detail = outcome(b.events.slice(1), states);
  }
  return beats.filter((b) => b.kind !== 'other' || b.events.some((e) => ['damage', 'heal', 'ko', 'status', 'field'].includes(e.kind)));
}
