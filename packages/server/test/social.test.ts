// Friends by code, players nearby, challenges between them, profile cards and daily rewards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { claimDaily, dailyStatus, recordPlayed, type ServerMsg } from '@contaminant/engine';
import { GameServer } from '../src/server.ts';
import { isPrivateAddress, normalizeCode, sameNetwork } from '../src/social.ts';

function mkServer() {
  return new GameServer({ dataFile: ':memory:', autoTick: false, planningSeconds: 30, botFillSeconds: 999 });
}

async function setup() {
  const s = mkServer();
  const port = await s.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const call = async <T>(token: string | null, path: string, body?: unknown) =>
    (await (
      await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    ).json()) as T;
  const reg = (name: string) => call<{ token: string; player: { id: string; name: string } }>(null, '/api/register', { name });
  const open = (token: string) =>
    new Promise<{ ws: WebSocket; wait: (t: ServerMsg['t']) => Promise<ServerMsg>; send: (m: unknown) => void }>((resolve) => {
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
        void wait('welcome').then(() => resolve({ ws, wait, send: (m) => ws.send(JSON.stringify(m)) }));
      });
    });
  return { s, call, reg, open };
}

test('network helpers: private ranges, same Wi-Fi, friend codes without look-alike letters', () => {
  assert.ok(isPrivateAddress('192.168.178.20'));
  assert.ok(isPrivateAddress('::ffff:10.0.0.4'));
  assert.ok(isPrivateAddress('172.20.1.1'));
  assert.ok(!isPrivateAddress('172.32.1.1'));
  assert.ok(!isPrivateAddress('84.12.3.4'));
  assert.ok(sameNetwork('84.12.3.4', '::ffff:84.12.3.4'));
  assert.ok(!sameNetwork('84.12.3.4', '84.12.3.5'));
  assert.ok(sameNetwork('192.168.1.2', '192.168.1.40'));
  assert.equal(normalizeCode(' ab-c0o1i '), 'ABC0011');
});

test('friends: add by code, accept, presence, remove', async () => {
  const { s, call, reg, open } = await setup();
  const A = await reg('Ada');
  const B = await reg('Bram');
  const listA = await call<{ code: string }>(A.token, '/api/friends');
  const listB = await call<{ code: string }>(B.token, '/api/friends');
  assert.match(listA.code, /^[A-Z2-9]{6}$/);
  assert.notEqual(listA.code, listB.code);

  const wb = await open(B.token);
  const sent = await call<{ ok: boolean; status: string }>(A.token, '/api/friends/add', { code: listB.code.toLowerCase() });
  assert.deepEqual([sent.ok, sent.status], [true, 'sent']);
  const req = (await wb.wait('social')) as Extract<ServerMsg, { t: 'social' }>;
  assert.equal(req.event, 'request');
  assert.equal(req.name, 'Ada');

  const inc = await call<{ incoming: { id: string }[] }>(B.token, '/api/friends');
  assert.equal(inc.incoming[0]!.id, A.player.id);
  const acc = await call<{ ok: boolean }>(B.token, '/api/friends/accept', { id: A.player.id });
  assert.ok(acc.ok);
  const fa = await call<{ friends: { id: string; online: boolean }[] }>(A.token, '/api/friends');
  assert.equal(fa.friends.length, 1);
  assert.equal(fa.friends[0]!.id, B.player.id);
  assert.equal(fa.friends[0]!.online, true, 'Bram has a socket open');

  // own code, unknown code
  assert.equal((await call<{ ok: boolean }>(A.token, '/api/friends/add', { code: listA.code })).ok, false);
  assert.equal((await call<{ ok: boolean }>(A.token, '/api/friends/add', { code: 'ZZZZZZ' })).ok, false);

  await call(A.token, '/api/friends/remove', { id: B.player.id });
  assert.equal((await call<{ friends: unknown[] }>(B.token, '/api/friends')).friends.length, 0);
  wb.ws.close();
  s.close();
});

test('mutual requests become a friendship without an extra accept', async () => {
  const { s, call, reg } = await setup();
  const A = await reg('Cleo');
  const B = await reg('Dov');
  await call(A.token, '/api/friends/add', { id: B.player.id });
  const r = await call<{ status: string }>(B.token, '/api/friends/add', { name: 'cleo' });
  assert.equal(r.status, 'friends');
  s.close();
});

test('players nearby see each other and can challenge each other to a friendly', async () => {
  const { s, call, reg, open } = await setup();
  const A = await reg('Eve');
  const B = await reg('Finn');
  const wa = await open(A.token);
  const wb = await open(B.token);
  const near = await call<{ players: { id: string; name: string }[] }>(A.token, '/api/nearby');
  assert.deepEqual(
    near.players.map((p) => p.name),
    ['Finn'],
    'both connect from 127.0.0.1, so they count as the same network',
  );

  wa.send({ t: 'invite', to: B.player.id });
  const sentMsg = (await wa.wait('invite_sent')) as Extract<ServerMsg, { t: 'invite_sent' }>;
  const inv = (await wb.wait('invite')) as Extract<ServerMsg, { t: 'invite' }>;
  assert.equal(inv.name, 'Eve');
  assert.equal(inv.code, sentMsg.code);

  // somebody else cannot take an invitation meant for Finn
  const C = await reg('Gus');
  const wc = await open(C.token);
  wc.send({ t: 'friend_join', code: inv.code });
  assert.match(((await wc.wait('error')) as Extract<ServerMsg, { t: 'error' }>).msg, /someone else/);

  wb.send({ t: 'friend_join', code: inv.code });
  const [sa, sb] = await Promise.all([wa.wait('match_start'), wb.wait('match_start')]);
  const match = (sa as Extract<ServerMsg, { t: 'match_start' }>).info.match;
  assert.equal(match, (sb as Extract<ServerMsg, { t: 'match_start' }>).info.match);
  wa.send({ t: 'surrender', match });
  await wa.wait('match_end');
  for (const w of [wa, wb, wc]) w.ws.close();
  s.close();
});

test('a declined challenge tells the challenger', async () => {
  const { s, reg, open } = await setup();
  const A = await reg('Hana');
  const B = await reg('Ivo');
  const wa = await open(A.token);
  const wb = await open(B.token);
  wa.send({ t: 'invite', to: B.player.id });
  const inv = (await wb.wait('invite')) as Extract<ServerMsg, { t: 'invite' }>;
  wb.send({ t: 'invite_decline', code: inv.code });
  const d = (await wa.wait('invite_declined')) as Extract<ServerMsg, { t: 'invite_declined' }>;
  assert.equal(d.name, 'Ivo');
  wa.ws.close();
  wb.ws.close();
  s.close();
});

test('public profile card: avatar must be owned, title must be earned, motto is cleaned', async () => {
  const { s, call, reg } = await setup();
  const A = await reg('Juno');
  const me = await call<{ collection: { chars: Record<string, unknown> } }>(A.token, '/api/me');
  const owned = Object.keys(me.collection.chars)[0]!;
  const r = await call<{ profile: { avatar?: string; title?: string; motto?: string; color?: string } }>(A.token, '/api/me/profile', { avatar: owned, title: 'World Champion', motto: '  <b>Stay   sterile</b>  ', color: '#4FE3FF' });
  assert.equal(r.profile.avatar, owned);
  assert.equal(r.profile.title, undefined, 'titles must be earned');
  assert.equal(r.profile.motto, 'bStay sterile/b');
  assert.equal(r.profile.color, '#4FE3FF');
  const r2 = await call<{ profile: { avatar?: string } }>(A.token, '/api/me/profile', { avatar: 'not_a_character' });
  assert.equal(r2.profile.avatar, owned);
  const card = await call<{ profile: { avatar?: string }; code: string }>(null, `/api/players/${A.player.id}`);
  assert.equal(card.profile.avatar, owned);
  assert.match(card.code, /^[A-Z2-9]{6}$/);
  s.close();
});

test('daily rewards: once a day, streak grows on consecutive days and resets after a gap', async () => {
  const day = 86_400_000;
  const t0 = Date.parse('2026-10-01T10:00:00Z');
  let st = {};
  const a = claimDaily(st, t0);
  assert.equal(a.reward?.gold, 40);
  st = a.state;
  assert.equal(claimDaily(st, t0 + 3_600_000).reward, null, 'second claim on the same day');
  const b = claimDaily(st, t0 + day);
  assert.equal(b.state.streak, 2);
  assert.equal(b.reward?.gold, 60);
  const c = claimDaily(b.state, t0 + 3 * day);
  assert.equal(c.state.streak, 1, 'missed a day');
  assert.equal(dailyStatus(c.state, t0 + 3 * day).canClaim, false);

  let p = {};
  const paid: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = recordPlayed(p, t0);
    p = r.state;
    for (const x of r.rewards) paid.push(x.games);
  }
  assert.deepEqual(paid, [1, 3, 5, 10]);
  assert.deepEqual(recordPlayed(p, t0).rewards, []);
  assert.deepEqual(recordPlayed(p, t0 + day).rewards.map((x) => x.games), [1], 'a new day starts over');

  const { s, call, reg } = await setup();
  const A = await reg('Kai');
  const before = await call<{ collection: { gold: number } }>(A.token, '/api/me');
  const claim = await call<{ ok: boolean; reward: { gold: number } }>(A.token, '/api/daily/claim', {});
  assert.ok(claim.ok);
  const after = await call<{ collection: { gold: number } }>(A.token, '/api/me');
  assert.equal(after.collection.gold, before.collection.gold + claim.reward.gold);
  assert.equal((await call<{ ok: boolean }>(A.token, '/api/daily/claim', {})).ok, false);
  s.close();
});

test('health reports the server name and players online for the server finder', async () => {
  const s = new GameServer({ dataFile: ':memory:', autoTick: false, name: 'Lab PC' });
  const port = await s.listen(0);
  const h = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as { game: string; name: string; players: number };
  assert.deepEqual([h.game, h.name, h.players], ['contaminant', 'Lab PC', 0]);
  s.close();
});

test('team management: invite-only with code, officers, kick, captaincy hand-over, settings', async () => {
  const { s, call, reg } = await setup();
  const cap = await reg('Captain Rot');
  const a = await reg('Ash');
  const b = await reg('Bea');
  const made = await call<{ ok: boolean; team: { id: string; inviteCode?: string; color?: string } }>(cap.token, '/api/teams', { name: 'Night Shift', tag: 'NSH', open: false });
  assert.ok(made.ok);
  assert.match(made.team.inviteCode ?? '', /^[A-Z2-9]{6}$/, 'the captain sees the invite code');
  assert.ok(made.team.color);
  const id = made.team.id;
  const pub = await call<{ team: { inviteCode?: string } }>(a.token, `/api/teams/${id}`);
  assert.equal(pub.team.inviteCode, undefined, 'outsiders never see the code');
  assert.equal((await call<{ ok: boolean }>(a.token, `/api/teams/${id}/join`, {})).ok, false, 'invite-only');
  assert.ok((await call<{ ok: boolean }>(a.token, '/api/teams/join-code', { code: made.team.inviteCode!.toLowerCase() })).ok);
  assert.ok((await call<{ ok: boolean }>(b.token, `/api/teams/${id}/join`, { code: made.team.inviteCode })).ok);

  // members cannot manage; the captain promotes Ash to officer, Ash may then kick Bea
  assert.equal((await call<{ ok: boolean }>(b.token, `/api/teams/${id}/manage`, { action: 'kick', playerId: a.player.id })).ok, false);
  assert.ok((await call<{ ok: boolean }>(cap.token, `/api/teams/${id}/manage`, { action: 'promote', playerId: a.player.id })).ok);
  const kicked = await call<{ ok: boolean; team: { roster: { playerId: string }[] } }>(a.token, `/api/teams/${id}/manage`, { action: 'kick', playerId: b.player.id });
  assert.ok(kicked.ok);
  assert.ok(!kicked.team.roster.some((r) => r.playerId === b.player.id));
  // an officer cannot remove the captain or change roles
  assert.equal((await call<{ ok: boolean }>(a.token, `/api/teams/${id}/manage`, { action: 'kick', playerId: cap.player.id })).ok, false);
  assert.equal((await call<{ ok: boolean }>(a.token, `/api/teams/${id}/manage`, { action: 'captain', playerId: a.player.id })).ok, false);

  const set = await call<{ ok: boolean; team: { motto: string; open: boolean; color: string; emblem?: string } }>(a.token, `/api/teams/${id}/manage`, { action: 'settings', motto: 'We never sleep', open: true, color: '#4FE3FF', emblem: 'vile' });
  assert.deepEqual([set.team.motto, set.team.open, set.team.color, set.team.emblem], ['We never sleep', true, '#4FE3FF', 'vile']);
  const old = made.team.inviteCode;
  const fresh = await call<{ team: { inviteCode: string } }>(cap.token, `/api/teams/${id}/manage`, { action: 'new-code' });
  assert.notEqual(fresh.team.inviteCode, old);

  const handed = await call<{ ok: boolean; team: { captain: string } }>(cap.token, `/api/teams/${id}/manage`, { action: 'captain', playerId: a.player.id });
  assert.equal(handed.team.captain, a.player.id);
  s.close();
});

test('the planning clock starts only after both players have watched the round', async () => {
  const { s, reg, open } = await setup();
  const A = await reg('Watcher A');
  const B = await reg('Watcher B');
  const wa = await open(A.token);
  const wb = await open(B.token);
  wa.send({ t: 'invite', to: B.player.id });
  const inv = (await wb.wait('invite')) as Extract<ServerMsg, { t: 'invite' }>;
  wb.send({ t: 'friend_join', code: inv.code });
  const start = (await wa.wait('match_start')) as Extract<ServerMsg, { t: 'match_start' }>;
  await wb.wait('match_start');
  assert.ok(start.deadline > 0, 'the first round has nothing to watch: the clock runs at once');
  const match = start.info.match;
  const empty = (p: number) => ({ player: p, commands: [], rest: [] });
  wa.send({ t: 'plan', match, plan: empty(0), final: true, round: 1 });
  wb.send({ t: 'plan', match, plan: empty(1), final: true, round: 1 });
  const ra = (await wa.wait('round')) as Extract<ServerMsg, { t: 'round' }>;
  await wb.wait('round');
  assert.equal(ra.deadline, 0, 'no countdown while the round animation plays');
  wa.send({ t: 'played', match, round: ra.view.round });
  wb.send({ t: 'played', match, round: ra.view.round });
  const d = (await wa.wait('deadline')) as Extract<ServerMsg, { t: 'deadline' }>;
  assert.ok(d.deadline - Date.now() > 40_000, 'the full 45 s start after watching');
  wa.send({ t: 'surrender', match });
  await wa.wait('match_end');
  wa.ws.close();
  wb.ws.close();
  s.close();
});
