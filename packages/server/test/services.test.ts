// End-to-end service tests: simulations → telemetry → meta, tournaments and the World Cup with bots,
// ranked matches through real HTTP + WebSocket connections, replay verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server.ts';
import { metaSnapshot, detectAnomalies } from '../src/meta.ts';
import { verifyReplay, type ReplayLog } from '../src/rooms.ts';
import type { ServerMsg } from '@contaminant/engine';

function mkServer() {
  return new GameServer({ dataFile: ':memory:', autoTick: false, planningSeconds: 30, botFillSeconds: 999 });
}

test('bot simulations feed telemetry and the meta dashboard', () => {
  const s = mkServer();
  s.simulate(40);
  const meta = metaSnapshot(s.db);
  assert.equal(meta.matches, 40);
  assert.ok(meta.characters.some((c) => c.games > 0));
  assert.ok(meta.items.some((i) => i.games > 0));
  assert.ok(meta.archetypes.length > 0);
  const tiers = Object.values(meta.tierList).flat();
  assert.ok(tiers.length > 0);
  assert.ok(Array.isArray(detectAnomalies(s.db, { minGames: 5 })));
  s.close();
});

test('stored replays verify by re-simulation (seed + ops + plans → same hashes)', () => {
  const s = mkServer();
  s.simulate(3);
  // simulations are not persisted as rooms; run a bot room and read it back from the matches table
  const bots = s.players.ensureBots(2);
  const deck = s.players.deck(bots[0]!.id)!;
  const room = s.rooms.create(
    [
      { playerId: bots[0]!.id, name: 'A', deck, bot: { difficulty: 'normal' } },
      { playerId: bots[1]!.id, name: 'B', deck, bot: { difficulty: 'normal' } },
    ],
    { kind: 'casual' },
  );
  room.start();
  const row = s.db.get<{ replay: string }>('SELECT replay FROM matches WHERE id=?', room.id)!;
  const v = verifyReplay(room.id, JSON.parse(row.replay) as ReplayLog);
  assert.ok(v.ok, JSON.stringify(v));
  assert.ok(v.rounds > 3);
  s.close();
});

test('automatic tournaments: schedule, bot-filled single / double / swiss events run to a champion with prizes', () => {
  const s = mkServer();
  const created = s.tournaments.scheduleTick(Date.UTC(2026, 9, 14, 12, 0));
  assert.equal(created.length, 3);
  for (const t of created) {
    const human = s.players.register('Leander');
    s.tournaments.register(t.id, human);
    const done = s.tournaments.start(t.id, { force: true })!;
    // the human seat is waiting for input: let them forfeit by surrendering every match they get
    for (let i = 0; i < 20; i++) {
      const room = s.rooms.forPlayer(human.id);
      if (!room) break;
      room.surrender(human.id);
    }
    const fin = s.tournaments.get(t.id)!;
    assert.equal(fin.status, 'finished', `${t.format}: ${fin.status}`);
    assert.ok(fin.placements!.length >= 8);
    assert.equal(fin.placements![0]!.place, 1);
    void done;
  }
  assert.ok(s.tournaments.trophyHall().length >= 3);
  s.close();
});

test('World Cup pipeline: qualifiers → groups → playoffs → crowned champion in the hall of fame', () => {
  const s = mkServer();
  const w = s.worldcup.open({ qualifiersAt: Date.now() + 1000 });
  s.worldcup.startQualifiers(w.id);
  const fin = s.worldcup.current()!;
  assert.equal(fin.status, 'finished');
  assert.ok(fin.champion);
  assert.equal(fin.podium!.length, 4);
  assert.equal(Object.keys(fin.groups!.groups!).length, 4);
  const hall = s.worldcup.hallOfFame() as { kind: string; title: string }[];
  assert.ok(hall.some((h) => h.kind === 'world_champion' && h.title.startsWith('World Champion')));
  s.close();
});

test('season rollover grants division rewards and soft-resets MMR', () => {
  const s = mkServer();
  const p = s.players.register('Ranked Rita');
  s.db.run('UPDATE players SET mmr=1650, season_games=12 WHERE id=?', p.id);
  const before = s.seasons.current();
  const next = s.seasons.rollover();
  assert.equal(next.number, before.number + 1);
  const after = s.players.byId(p.id)!;
  assert.equal(after.mmr, 1325);
  const col = s.players.collection(p.id);
  assert.ok(col.cardBacks.includes('diamond_vial'));
  assert.ok(col.titles.some((t) => t.includes('Champion')));
  s.close();
});

test('ranked match over HTTP + WebSocket: queue, secret plans, fog of war, surrender, MMR update', async () => {
  const s = mkServer();
  const port = await s.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const reg = async (name: string) => (await (await fetch(`${base}/api/register`, { method: 'POST', body: JSON.stringify({ name }) })).json()) as { token: string; player: { id: string; mmr: number } };
  const A = await reg('Alpha');
  const B = await reg('Beta');
  const open = (token: string) =>
    new Promise<{ ws: WebSocket; inbox: ServerMsg[]; wait: (t: ServerMsg['t']) => Promise<ServerMsg> }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const inbox: ServerMsg[] = [];
      const waiters: { t: string; fn: (m: ServerMsg) => void }[] = [];
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as ServerMsg;
        const w = waiters.findIndex((x) => x.t === m.t);
        if (w >= 0) waiters.splice(w, 1)[0]!.fn(m);
        else inbox.push(m);
      });
      const wait = (t: ServerMsg['t']) =>
        new Promise<ServerMsg>((res) => {
          const i = inbox.findIndex((x) => x.t === t);
          if (i >= 0) return res(inbox.splice(i, 1)[0]!);
          waiters.push({ t, fn: res });
        });
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hello', token }));
        resolve({ ws, inbox, wait });
      });
    });
  const a = await open(A.token);
  const b = await open(B.token);
  await a.wait('welcome');
  await b.wait('welcome');
  a.ws.send(JSON.stringify({ t: 'queue', queue: 'ranked' }));
  b.ws.send(JSON.stringify({ t: 'queue', queue: 'ranked' }));
  const startA = (await a.wait('match_start')) as Extract<ServerMsg, { t: 'match_start' }>;
  const startB = (await b.wait('match_start')) as Extract<ServerMsg, { t: 'match_start' }>;
  assert.equal(startA.info.match, startB.info.match);
  assert.notEqual(startA.info.you, startB.info.you);
  // fog of war: the opponent's hand is hidden and RNG state stripped
  const enemy = startA.view.players[startA.info.you === 0 ? 1 : 0];
  assert.ok(enemy.hand.every((c) => c.itemId === 'hidden'));
  assert.equal(startA.view.rng.s, 0);
  // both submit a final (empty) plan → round resolves immediately
  for (const [c, st] of [[a, startA], [b, startB]] as const) c.ws.send(JSON.stringify({ t: 'plan', match: st.info.match, plan: { player: st.info.you, commands: [], rest: [] }, final: true, round: st.view.round }));
  await a.wait('plan_ack');
  const round = (await a.wait('round')) as Extract<ServerMsg, { t: 'round' }>;
  assert.equal(round.view.round, 2);
  // a stale plan for round 1 is rejected
  a.ws.send(JSON.stringify({ t: 'plan', match: startA.info.match, plan: { player: startA.info.you, commands: [], rest: [] }, round: 1 }));
  const err = (await a.wait('error')) as Extract<ServerMsg, { t: 'error' }>;
  assert.match(err.msg, /stale/);
  // surrender → match end with MMR
  b.ws.send(JSON.stringify({ t: 'surrender', match: startA.info.match }));
  const endA = (await a.wait('match_end')) as Extract<ServerMsg, { t: 'match_end' }>;
  assert.equal(endA.winner, startA.info.you);
  assert.ok(endA.mmr && endA.mmr.after > endA.mmr.before);
  const ladder = (await (await fetch(`${base}/api/ladder`)).json()) as { players: { name: string; mmr: number }[] };
  assert.equal(ladder.players[0]!.name, 'Alpha');
  const verify = (await (await fetch(`${base}/api/matches/${startA.info.match}/verify`)).json()) as { ok: boolean };
  assert.ok(verify.ok);
  a.ws.close();
  b.ws.close();
  s.close();
});
