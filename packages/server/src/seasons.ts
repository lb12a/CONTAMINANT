// Ranked seasons: rollover with tier rewards (gold, trophies, card backs, skins, titles),
// season hall of fame and the soft MMR reset.

import type { Db } from './db.ts';
import type { PlayerService } from './players.ts';
import type { Clock } from './rooms.ts';
import { divisionFor, SEASON_LENGTH_MS, seasonName, softReset, type Season } from './rating.ts';

export class SeasonService {
  private db: Db;
  private players: PlayerService;
  private clock: Clock;
  constructor(db: Db, players: PlayerService, clock: Clock) {
    this.db = db;
    this.players = players;
    this.clock = clock;
  }

  current(): Season {
    const all = this.db.listDocs<Season>('season').sort((a, b) => b.number - a.number);
    const active = all.find((s) => s.status === 'active');
    if (active) return active;
    return this.open((all[0]?.number ?? 0) + 1);
  }

  open(n: number): Season {
    const now = this.clock.now();
    const s: Season = { id: `s${n}`, name: seasonName(n), number: n, start: now, end: now + SEASON_LENGTH_MS, status: 'active' };
    this.db.putDoc('season', s.id, s);
    return s;
  }

  tick(now = this.clock.now()): Season | null {
    const s = this.current();
    if (now < s.end) return null;
    return this.rollover();
  }

  /** Close the current season: rewards per division, top-3 hall entries, soft reset, open the next one. */
  rollover(): Season {
    const s = this.current();
    const humans = this.players.allHumans().filter((p) => p.season_games > 0).sort((a, b) => b.mmr - a.mmr);
    humans.forEach((p, i) => {
      const d = divisionFor(p.mmr).division;
      this.players.grant(p.id, { ...d.reward, title: i === 0 ? `${s.name} Champion` : d.reward.title }, `season:${s.id}:${d.id}`);
      if (i < 3) {
        this.db.run(
          'INSERT INTO hall(kind,title,player_id,player_name,season,created,data) VALUES(?,?,?,?,?,?,?)',
          'season_champion',
          `${s.name} — #${i + 1}`,
          p.id,
          p.name,
          s.id,
          this.clock.now(),
          JSON.stringify({ mmr: Math.round(p.mmr), division: d.name }),
        );
      }
    });
    for (const p of this.players.allHumans()) this.players.setMmr(p.id, softReset(p.mmr));
    s.status = 'closed';
    s.end = this.clock.now();
    this.db.putDoc('season', s.id, s);
    return this.open(s.number + 1);
  }
}
