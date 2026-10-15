// The Contamination Circuit (Monthly Majors → Circuit Points → Halloween World Cup) and teams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../src/server.ts';
import { CIRCUIT, circuitSeason, halloweenSchedule, pointsFor, seasonMajors } from '../src/circuit.ts';
import type { Clock } from '../src/rooms.ts';
import type { Tournament } from '../src/tournaments.ts';

function fakeClock(start: number): Clock & { t: number } {
  const c = {
    t: start,
    now: () => c.t,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  };
  return c;
}

function mkServer(clock: Clock) {
  return new GameServer({ dataFile: ':memory:', autoTick: false, calendar: true, planningSeconds: 30, botFillSeconds: 999, clock });
}

/** Humans forfeit whatever match they are seated in, so bot-filled brackets can finish. */
function forfeitHumans(s: GameServer, ids: string[]) {
  for (let i = 0; i < 200; i++) {
    const rooms = ids.map((id) => s.rooms.forPlayer(id)).filter(Boolean);
    if (!rooms.length) return;
    for (const id of ids) s.rooms.forPlayer(id)?.surrender(id);
  }
}

test('calendar: World Cup finals on Halloween, 11 Monthly Majors on first Saturdays from November to September', () => {
  const h = halloweenSchedule(2027);
  assert.equal(new Date(h.playoffsAt).toISOString(), '2027-10-31T17:00:00.000Z');
  assert.equal(new Date(h.qualifiersAt).toISOString(), '2027-10-29T17:00:00.000Z');
  assert.equal(circuitSeason(Date.UTC(2026, 9, 15)), 2026);
  assert.equal(circuitSeason(Date.UTC(2026, 10, 2)), 2027);
  const majors = seasonMajors(2027);
  assert.equal(majors.length, 11);
  assert.equal(majors[0]!.name, 'November Major 2026');
  assert.equal(majors.at(-1)!.name, 'September Major 2027');
  for (const m of majors) {
    const d = new Date(m.startsAt);
    assert.equal(d.getUTCDay(), 6, `${m.name} is on a Saturday`);
    assert.ok(d.getUTCDate() <= 7, `${m.name} is the first Saturday`);
    assert.notEqual(d.getUTCMonth(), 9, 'no Major in World Cup month');
  }
  assert.deepEqual([pointsFor(1), pointsFor(2), pointsFor(3), pointsFor(7), pointsFor(40)], [400, 300, 200, 120, 10]);
});

test('Monthly Major: created two weeks ahead, MMR threshold, double elimination, Circuit Points for humans who played', () => {
  const clock = fakeClock(Date.UTC(2026, 9, 25, 12));
  const s = mkServer(clock);
  const major = s.circuit.tick(clock.now())!;
  assert.ok(major, 'November Major is open for registration');
  assert.equal(major.name, 'November Major 2026');
  assert.equal(major.format, 'double');
  assert.equal(major.requirement?.minMmr, CIRCUIT.majorMinMmr);
  assert.equal(s.circuit.tick(clock.now()), null, 'not created twice');

  const rookie = s.players.register('Rookie');
  assert.equal(s.tournaments.register(major.id, rookie).ok, false, 'below the MMR threshold');
  const vet = s.players.register('Veteran');
  s.db.run('UPDATE players SET mmr=1400 WHERE id=?', vet.id);
  assert.equal(s.tournaments.register(major.id, s.players.byId(vet.id)!).ok, true);

  clock.t = major.startsAt;
  s.tournaments.start(major.id, { force: true });
  forfeitHumans(s, [vet.id]);
  const fin = s.tournaments.get(major.id)!;
  assert.equal(fin.status, 'finished');
  const entry = s.circuit.standings(2027).entries[vet.id]!;
  assert.ok(entry.points >= 10, 'the veteran earned at least participation points');
  assert.equal(Object.values(s.circuit.standings(2027).entries).length, 1, 'bots never earn Circuit Points');
  s.close();
});

test('Halloween World Cup: direct seeds from Majors and the points race, Last Chance qualifier, stages wait for their day', () => {
  const clock = fakeClock(Date.UTC(2027, 8, 20));
  const s = mkServer(clock);
  // a finished September Major won by a human, plus a points race leader
  const champ = s.players.register('Major Queen');
  const racer = s.players.register('Points Racer');
  const t: Tournament = s.tournaments.create({ name: 'September Major 2027', series: 'major-2027-09', format: 'double', startsAt: Date.UTC(2027, 8, 4, 17), circuit: { season: 2027, month: 8, year: 2027 } });
  t.status = 'finished';
  t.registrations = [champ, racer].map((p) => ({ playerId: p.id, name: p.name, mmr: 1300, checkedIn: true }));
  t.placements = [
    { playerId: champ.id, name: champ.name, place: 1 },
    { playerId: racer.id, name: racer.name, place: 2 },
  ];
  t.bracket = { format: 'double', entrants: [], rounds: 1, matches: [{ id: 'm1', round: 1, bracket: 'W', a: champ.id, b: racer.id, status: 'done', winner: champ.id }] } as unknown as Tournament['bracket'];
  s.tournaments.save(t);
  s.circuit.onTournamentFinished(t);
  assert.equal(s.circuit.pointsOf(2027, champ.id), 400);

  // nothing before 1 October
  s.worldcup.tick(clock.now());
  assert.equal(s.worldcup.all().length, 0);
  clock.t = Date.UTC(2027, 9, 1, 0, 5);
  s.worldcup.tick(clock.now());
  const w = s.worldcup.current()!;
  assert.equal(w.id, 'wm-2027');
  assert.equal(new Date(w.schedule.playoffsAt).toISOString(), '2027-10-31T17:00:00.000Z');
  assert.deepEqual(w.registrations.filter((r) => r.direct).map((r) => r.name).sort(), ['Major Queen', 'Points Racer']);

  const casual = s.players.register('Casual');
  assert.equal(s.worldcup.register(casual).ok, false, 'needs MMR or Circuit Points');
  const strong = s.players.register('Strong');
  s.db.run('UPDATE players SET mmr=1500 WHERE id=?', strong.id);
  assert.equal(s.worldcup.register(s.players.byId(strong.id)!).ok, true);

  // 29 Oct: the Last Chance qualifier (bots + Strong); the groups wait for 30 Oct
  clock.t = Date.UTC(2027, 9, 29, 17);
  s.worldcup.tick(clock.now());
  forfeitHumans(s, [strong.id]);
  let cur = s.worldcup.current()!;
  assert.equal(cur.qualifierAdvance, CIRCUIT.groupField - 2);
  assert.equal(cur.pendingStage, 'groups');
  assert.equal(cur.groups, undefined);

  clock.t = Date.UTC(2027, 9, 30, 17);
  s.worldcup.tick(clock.now());
  forfeitHumans(s, [champ.id, racer.id, strong.id]);
  cur = s.worldcup.current()!;
  assert.ok(cur.groups, 'group stage played on 30 Oct');
  const groupIds = cur.groups!.entrants.map((e) => e.id);
  assert.ok(groupIds.includes(champ.id) && groupIds.includes(racer.id), 'direct seeds start in the groups');
  assert.equal(cur.pendingStage, 'playoffs');

  clock.t = Date.UTC(2027, 9, 31, 17);
  s.worldcup.tick(clock.now());
  forfeitHumans(s, [champ.id, racer.id, strong.id]);
  cur = s.worldcup.current()!;
  assert.equal(cur.status, 'finished');
  const champs = s.worldcup.champions();
  const champIsBot = cur.registrations.find((r) => r.playerId === cur.champion!.playerId)?.isBot;
  assert.equal(champs.current?.name ?? null, champIsBot ? null : cur.champion!.name);
  assert.equal(champs.history.length, champIsBot ? 0 : 1);
  s.close();
});

test('teams: create, join, ladder rating, captaincy passes on, team battles count', () => {
  const clock = fakeClock(Date.UTC(2026, 9, 15));
  const s = mkServer(clock);
  const a = s.players.register('Alpha');
  const b = s.players.register('Bravo');
  const c = s.players.register('Charlie');
  const d = s.players.register('Delta');
  const t1 = s.teams.create(a, { name: 'Night Shift', tag: 'nsh' });
  assert.equal(t1.ok, true);
  assert.equal(t1.team!.tag, 'NSH');
  assert.equal(s.teams.create(c, { name: 'Night Shift', tag: 'XX' }).ok, false, 'names are unique');
  assert.equal(s.teams.join(s.players.byId(b.id)!, t1.team!.id).ok, true);
  assert.equal(s.teams.create(s.players.byId(b.id)!, { name: 'Other', tag: 'OTH' }).ok, false, 'one team per player');
  const t2 = s.teams.create(c, { name: 'Spore Choir', tag: 'SPC' });
  s.teams.join(s.players.byId(d.id)!, t2.team!.id);
  s.db.run('UPDATE players SET team_mmr=1400 WHERE id IN (?,?)', a.id, b.id);
  const ladder = s.teams.ladder();
  assert.equal(ladder[0]!.name, 'Night Shift');
  assert.equal(ladder[0]!.rating, 1400);
  s.teams.recordBattle([[a.id, b.id], [c.id, d.id]], 0);
  assert.equal(s.teams.get(t1.team!.id)!.wins, 1);
  assert.equal(s.teams.get(t2.team!.id)!.losses, 1);
  assert.equal(s.teams.leave(s.players.byId(a.id)!).ok, true);
  const after = s.teams.get(t1.team!.id)!;
  assert.equal(after.captain, b.id, 'the remaining member becomes captain');
  s.close();
});

test('developer accounts (name ending in #): everything unlocked, no ladder, tournaments or World Cup', () => {
  const clock = fakeClock(Date.UTC(2026, 9, 25, 12));
  const s = mkServer(clock);
  const dev = s.players.register('Tester#');
  assert.equal(dev.name, 'Tester#');
  const col = s.players.collection(dev.id);
  assert.ok(col.gold >= 999_999);
  assert.ok(Object.values(col.chars).every((c) => c.level === 10));
  assert.ok(Object.keys(col.chars).length >= 30);
  assert.equal(s.players.public(dev).dev, true);
  s.db.run('UPDATE players SET mmr=2400 WHERE id=?', dev.id);
  assert.ok(!s.players.leaderboard().some((p) => p.id === dev.id), 'not on the ladder');
  const major = s.circuit.tick(clock.now())!;
  assert.equal(s.tournaments.register(major.id, s.players.byId(dev.id)!).ok, false);
  const normal = s.players.register('Normal Name');
  assert.equal(s.players.public(normal).dev, false);
  s.close();
});
