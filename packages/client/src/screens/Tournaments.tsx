import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { Countdown } from '../ui/components.tsx';

export interface BMatch {
  id: string;
  bracket: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  scoreA: number;
  scoreB: number;
  status: string;
  roomId?: string;
  bye?: boolean;
  group?: string;
}

interface Tournament {
  id: string;
  name: string;
  format: 'single' | 'double' | 'swiss';
  status: string;
  startsAt: number;
  checkinOpensAt: number;
  minPlayers: number;
  maxPlayers: number;
  players?: number;
  registrations: { playerId: string; name: string; checkedIn: boolean; isBot?: boolean }[];
  bracket?: { matches: BMatch[]; rounds: number; entrants: { id: string; name: string; seed: number }[]; current?: number };
  prizes: { place: number; gold: number; trophies: number; title?: string; chest?: string }[];
  placements?: { playerId: string; name: string; place: number }[];
  requirement?: { minMmr?: number };
  circuit?: { season: number; month: number; year: number };
}

export function TournamentsScreen({ nav, id }: { nav: Nav; id?: string }) {
  const p = useProfile();
  const [list, setList] = useState<Tournament[]>([]);
  const [sel, setSel] = useState<string | undefined>(id);
  const [detail, setDetail] = useState<{ tournament: Tournament; standings: unknown[] } | null>(null);
  const [hall, setHall] = useState<{ title: string; player_name: string; created: number }[]>([]);
  const load = () => {
    if (!p.online) return;
    getApi()
      .get<{ tournaments: Tournament[] }>('/api/tournaments')
      .then((r) => setList(r.tournaments))
      .catch((e: Error) => toast(e.message, 'bad'));
    getApi()
      .get<{ entries: { title: string; player_name: string; created: number }[] }>('/api/trophy-hall')
      .then((r) => setHall(r.entries))
      .catch(() => undefined);
  };
  useEffect(load, [p.online]);
  useEffect(() => {
    if (!sel || !p.online) return;
    const f = () =>
      getApi()
        .get<{ tournament: Tournament; standings: unknown[] }>(`/api/tournaments/${sel}`)
        .then(setDetail)
        .catch(() => undefined);
    f();
    const i = setInterval(f, 5000);
    return () => clearInterval(i);
  }, [sel, p.online]);
  if (!p.online) return <p className="muted">Go online to join automatic tournaments.</p>;
  const act = async (tid: string, what: 'register' | 'unregister' | 'checkin') => {
    try {
      const r = await getApi().post<{ ok?: boolean; error?: string }>(`/api/tournaments/${tid}/${what}`, { deckId: p.activeDeck });
      if (r.error) toast(r.error, 'bad');
      else toast(`${what} ok`, 'good');
      load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };
  const me = p.online.playerId;
  return (
    <div className="col">
      <h1>{t('Tournaments')}</h1>
      <p className="muted">Daily Spore Cup (single elimination, 18:00 UTC), Daily Rust Swiss (5 rounds, 20:30 UTC), Weekly Bone Harvest (double elimination, Sunday 17:00 UTC). Check in during the 30-minute window before the start. Empty seats are filled with bots.</p>
      <div className="panel scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Format</th>
              <th>Status</th>
              <th>Starts</th>
              <th className="num">Players</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((tr) => {
              const reg = tr.registrations?.find((r) => r.playerId === me);
              return (
                <tr key={tr.id}>
                  <td>
                    <button className="btn secondary small" onClick={() => setSel(tr.id)}>
                      {tr.name}
                    </button>
                    {tr.circuit && (
                      <span className="chip buff" style={{ marginLeft: 6 }} title="Monthly Major: earns Circuit Points towards the Halloween World Cup">
                        Major · World Cup points
                      </span>
                    )}
                    {tr.requirement?.minMmr && (
                      <span className="chip neutral" style={{ marginLeft: 6 }}>
                        from {tr.requirement.minMmr} MMR
                      </span>
                    )}
                  </td>
                  <td>{tr.format}</td>
                  <td>{tr.status}</td>
                  <td className="small">
                    {tr.status === 'scheduled' && <Countdown to={tr.checkinOpensAt} prefix="check-in in" />}
                    {tr.status === 'checkin' && <Countdown to={tr.startsAt} prefix="starts in" />}
                    {tr.status !== 'scheduled' && tr.status !== 'checkin' && new Date(tr.startsAt).toLocaleString()}
                  </td>
                  <td className="num">{tr.players ?? tr.registrations?.length ?? 0}</td>
                  <td className="row">
                    {(tr.status === 'scheduled' || tr.status === 'checkin') && !reg && (
                      <button className="btn primary small" onClick={() => act(tr.id, 'register')}>
                        {t('Register')}
                      </button>
                    )}
                    {reg && tr.status === 'checkin' && !reg.checkedIn && (
                      <button className="btn primary small" onClick={() => act(tr.id, 'checkin')}>
                        {t('Check in')}
                      </button>
                    )}
                    {reg && <span className="chip buff">{reg.checkedIn ? 'checked in' : 'registered'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="panel">
          <h2>{detail.tournament.name}</h2>
          {(detail.tournament.status === 'scheduled' || detail.tournament.status === 'checkin') && (
            <div className="row wrap countdown-row">
              <span className="muted small">Check-in</span>
              <Countdown to={detail.tournament.checkinOpensAt} done="open" />
              <span className="muted small">Start</span>
              <Countdown to={detail.tournament.startsAt} done="running" />
            </div>
          )}
          <p className="small muted">
            {detail.tournament.format} · {detail.tournament.status} · prizes: {detail.tournament.prizes.map((pz) => `#${pz.place <= 4 ? pz.place : `≤${pz.place}`} 🪙${pz.gold}`).join(' · ')}
          </p>
          {detail.tournament.placements && (
            <div className="row wrap">
              {detail.tournament.placements.slice(0, 4).map((pl) => (
                <span key={pl.playerId} className="chip" style={{ borderColor: pl.place === 1 ? 'var(--gold)' : undefined }}>
                  {pl.place === 1 ? '👑' : pl.place === 2 ? '🥈' : pl.place === 3 ? '🥉' : `#${pl.place}`} {pl.name}
                </span>
              ))}
            </div>
          )}
          {detail.tournament.bracket && (detail.tournament.format === 'swiss' ? <SwissView standings={detail.standings as SwissRow[]} matches={detail.tournament.bracket.matches} names={nameMap(detail.tournament)} nav={nav} /> : <BracketView matches={detail.tournament.bracket.matches} names={nameMap(detail.tournament)} nav={nav} />)}
        </div>
      )}
      <div className="panel">
        <h3>{t('Trophy Hall')}</h3>
        {hall.length === 0 && <span className="muted small">No champions yet.</span>}
        {hall.slice(0, 30).map((h, i) => (
          <div key={i} className="small">
            🏆 <b>{h.player_name}</b> — {h.title} <span className="muted">({new Date(h.created).toLocaleDateString()})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function nameMap(t: Tournament): Record<string, string> {
  return Object.fromEntries(t.registrations.map((r) => [r.playerId, r.name]));
}

interface SwissRow {
  id: string;
  name: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  buchholz: number;
  vpDiff: number;
}

export function SwissView({ standings, matches, names, nav }: { standings: SwissRow[]; matches: BMatch[]; names: Record<string, string>; nav: Nav }) {
  const live = matches.filter((m) => m.status === 'live' && m.roomId);
  return (
    <div className="col">
      {live.length > 0 && (
        <div className="row wrap">
          {live.map((m) => (
            <button key={m.id} className="btn secondary small" onClick={() => nav({ name: 'spectate', match: m.roomId })}>
              👁 {names[m.a!]} vs {names[m.b!]}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Pts</th>
              <th className="num">W-D-L</th>
              <th className="num">Buchholz</th>
              <th className="num">VP ±</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.id}>
                <td className="num">{i + 1}</td>
                <td>{s.name}</td>
                <td className="num">{s.points}</td>
                <td className="num">
                  {s.wins}-{s.draws}-{s.losses}
                </td>
                <td className="num">{s.buchholz}</td>
                <td className="num">{s.vpDiff > 0 ? `+${s.vpDiff}` : s.vpDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Columns per round; winners bracket, losers bracket and grand final rows. */
export function BracketView({ matches, names, nav }: { matches: BMatch[]; names: Record<string, string>; nav: Nav }) {
  const groups: [string, BMatch[]][] = [
    ['Winners bracket', matches.filter((m) => m.bracket === 'W')],
    ['Losers bracket', matches.filter((m) => m.bracket === 'L')],
    ['Finals', matches.filter((m) => m.bracket === 'GF' || m.bracket === 'GF2' || m.bracket === '3RD')],
  ];
  return (
    <div className="col">
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => {
          const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
          return (
            <div key={title} className="col">
              <b className="small">{title}</b>
              <div className="row scroll-x" style={{ alignItems: 'stretch', gap: 14, paddingBottom: 6 }}>
                {rounds.map((r) => (
                  <div key={r} className="col" style={{ justifyContent: 'space-around', minWidth: 170 }}>
                    <span className="small muted">Round {r}</span>
                    {list
                      .filter((m) => m.round === r)
                      .map((m) => (
                        <div key={m.id} className="paper small" style={{ padding: '4px 8px', opacity: m.status === 'void' ? 0.35 : 1 }}>
                          <div style={{ fontWeight: m.winner && m.winner === m.a ? 700 : 400 }}>
                            {m.a ? names[m.a] ?? m.a : m.status === 'void' || m.bye ? '—' : 'TBD'} <span className="num" style={{ float: 'right' }}>{m.status === 'done' && !m.bye ? m.scoreA : ''}</span>
                          </div>
                          <div style={{ fontWeight: m.winner && m.winner === m.b ? 700 : 400 }}>
                            {m.b ? names[m.b] ?? m.b : m.bye ? 'bye' : m.status === 'void' ? '—' : 'TBD'} <span className="num" style={{ float: 'right' }}>{m.status === 'done' && !m.bye ? m.scoreB : ''}</span>
                          </div>
                          {m.status === 'live' && m.roomId && (
                            <button className="btn secondary small" style={{ minHeight: 24, padding: '0 6px' }} onClick={() => nav({ name: 'spectate', match: m.roomId })}>
                              👁 live
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
