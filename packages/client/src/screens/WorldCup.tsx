import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { BracketView, SwissView, type BMatch } from './Tournaments.tsx';
import { Icon } from '../ui/Icon.tsx';

interface WorldCup {
  id: string;
  name: string;
  status: string;
  edition: number;
  season?: number;
  schedule: { qualifiersAt: number; groupsAt: number; playoffsAt: number };
  registrations: { playerId: string; name: string; direct?: boolean; via?: string }[];
  champion?: { name: string; playerId: string };
  podium?: { name: string; place: number; playerId: string }[];
  broadcastDelayRounds: number;
  pendingStage?: string;
}

interface Major {
  name: string;
  series: string;
  startsAt: number;
  registrationOpensAt: number;
  tournamentId: string | null;
  status: string;
  champion: string | null;
  players: number;
  month: number;
}

interface CircuitRow {
  rank: number;
  playerId: string;
  name: string;
  points: number;
  majorWins: number;
}

interface CircuitData {
  calendar: { season: number; majors: Major[]; worldCup: { registrationAt: number; qualifiersAt: number; groupsAt: number; playoffsAt: number }; rules: { majorMinMmr: number; wmMinMmr: number; directFromPoints: number; maxDirect: number } };
  standings: CircuitRow[];
  direct: { playerId: string; name: string; via: string }[];
  me: { points: number; majors: { name: string; place: number; points: number }[] } | null;
}

interface Champions {
  current: { name: string; playerId: string; season?: number; edition: number; name_of_cup: string } | null;
  history: { edition: number; season?: number; cup: string; champion: string; playerId: string; podium?: { name: string; place: number }[] }[];
  majors: { id: string; name: string; season: number; champion: string; playerId: string }[];
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function countdown(to: number, now: number): string {
  const ms = Math.max(0, to - now);
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  if (d > 0) return `${d} days ${h} h`;
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h} h ${m} min`;
}

export function WorldCupScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [wc, setWc] = useState<WorldCup | null>(null);
  const [lb, setLb] = useState<Record<string, unknown> | null>(null);
  const [circuit, setCircuit] = useState<CircuitData | null>(null);
  const [champs, setChamps] = useState<Champions | null>(null);
  const [elig, setElig] = useState<{ ok: boolean; direct: boolean; reason: string } | null>(null);
  const [live, setLive] = useState<{ id: string; names: [string, string]; round: number; vp: [number, number]; featured: boolean }[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!p.online) return;
    const api = getApi();
    const f = () => {
      api.get<{ worldcup: WorldCup | null }>('/api/worldcup').then((r) => setWc(r.worldcup)).catch(() => undefined);
      api.get<{ leaderboard: Record<string, unknown> }>('/api/worldcup/leaderboard').then((r) => setLb(r.leaderboard)).catch(() => undefined);
      api.get<{ matches: typeof live }>('/api/live').then((r) => setLive(r.matches.filter((m) => m.featured))).catch(() => undefined);
      setNow(Date.now());
    };
    f();
    api.get<CircuitData>('/api/circuit').then(setCircuit).catch(() => undefined);
    api.get<Champions>('/api/champions').then(setChamps).catch(() => undefined);
    api.get<{ ok: boolean; direct: boolean; reason: string }>('/api/worldcup/eligibility').then(setElig).catch(() => undefined);
    const i = setInterval(f, 8000);
    return () => clearInterval(i);
  }, [p.online]);

  if (!p.online) return <p className="muted">Go online to follow the Circuit and the World Cup.</p>;
  const names = Object.fromEntries((wc?.registrations ?? []).map((r) => [r.playerId, r.name]));
  const registered = wc?.registrations.some((r) => r.playerId === p.online!.playerId);
  const wmDates = circuit?.calendar.worldCup;
  const season = circuit?.calendar.season;
  const directIds = new Set(circuit?.direct.map((d) => d.playerId));
  const openWc = wc && wc.status !== 'finished' ? wc : null;

  return (
    <div className="col wc-page">
      {/* hero: reigning champion + countdown to the Halloween finals */}
      <section className="wc-hero panel">
        <div className="wc-crown" aria-hidden>
          <Icon name="ui/crown" size={64} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <span className="muted small">Reigning World Champion</span>
          {champs?.current ? (
            <button className="link-name display wc-champ" onClick={() => nav({ name: 'profile', id: champs.current!.playerId })}>
              {champs.current.name}
            </button>
          ) : (
            <span className="display wc-champ">The crown is unclaimed</span>
          )}
          {champs?.current && <span className="small muted">{champs.current.name_of_cup}</span>}
        </div>
        {wmDates && (
          <div className="wc-count">
            <span className="small muted">World Cup {season} final · Halloween</span>
            <b className="display num">{now < wmDates.playoffsAt ? countdown(wmDates.playoffsAt, now) : 'Tonight'}</b>
            <span className="small muted">{new Date(wmDates.playoffsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}
      </section>

      {/* the road to Halloween */}
      {circuit && (
        <section className="panel">
          <h2>Road to Halloween {season}</h2>
          <p className="small muted">
            One Monthly Major on the first Saturday of every month from November to September (double elimination, from {circuit.calendar.rules.majorMinMmr} MMR). Placements earn Circuit Points. Every Major champion and the top {circuit.calendar.rules.directFromPoints} of the points race go straight to the World Cup groups; everybody else with {circuit.calendar.rules.wmMinMmr} MMR or any Circuit Points can fight through the Last Chance qualifier on 29 October.
          </p>
          <ol className="road">
            {circuit.calendar.majors.map((m) => {
              const state = m.status === 'finished' ? 'done' : m.status === 'upcoming' ? (now >= m.startsAt ? 'missed' : 'next') : 'open';
              return (
                <li key={m.series} className={`road-stop ${state}`}>
                  <span className="road-month">{MONTH[m.month]}</span>
                  <span className="road-pin" />
                  <span className="small">{m.champion ? `Champion: ${m.champion}` : m.status === 'scheduled' || m.status === 'checkin' ? `${m.players} in` : new Date(m.startsAt).getUTCDate() + '.'}</span>
                  {m.tournamentId && (m.status === 'scheduled' || m.status === 'checkin') && (
                    <button className="btn small primary" onClick={() => nav({ name: 'tournaments', id: m.tournamentId! })}>
                      Enter
                    </button>
                  )}
                </li>
              );
            })}
            <li className="road-stop finale">
              <span className="road-month">Oct</span>
              <span className="road-pin" />
              <span className="small">World Cup</span>
            </li>
          </ol>
        </section>
      )}

      <div className="wc-grid">
        {/* current edition */}
        <section className="panel">
          <h2>{openWc ? openWc.name : `World Cup ${season ?? ''}`}</h2>
          {!openWc && wmDates && <p className="muted">Registration opens on {new Date(wmDates.registrationAt).toLocaleDateString()}. Earn Circuit Points in the Monthly Majors to get seeded.</p>}
          {openWc && (
            <>
              <div className="row wrap small">
                {(['registration', 'qualifiers', 'groups', 'playoffs', 'finished'] as const).map((s) => (
                  <span key={s} className={`chip ${openWc.status === s ? 'buff' : 'neutral'}`}>
                    {s === 'qualifiers' ? `Last Chance · ${new Date(openWc.schedule.qualifiersAt).toLocaleDateString()}` : s === 'groups' ? `Groups · ${new Date(openWc.schedule.groupsAt).toLocaleDateString()}` : s === 'playoffs' ? `Final · ${new Date(openWc.schedule.playoffsAt).toLocaleDateString()}` : s}
                  </span>
                ))}
              </div>
              {openWc.pendingStage && <p className="small muted">The {openWc.pendingStage} start on schedule.</p>}
              {openWc.status === 'registration' &&
                (registered ? (
                  <span className="chip buff">{openWc.registrations.find((r) => r.playerId === p.online!.playerId)?.direct ? `Seeded: ${openWc.registrations.find((r) => r.playerId === p.online!.playerId)?.via}` : 'Registered for the Last Chance qualifier'}</span>
                ) : elig?.ok ? (
                  <button className="btn buy" onClick={async () => { const r = await getApi().post<{ ok: boolean; error?: string }>('/api/worldcup/register', { deckId: p.activeDeck }); toast(r.error ?? 'Registered for the World Cup', r.error ? 'bad' : 'good'); }}>
                    {t('Register')} · {elig.reason}
                  </button>
                ) : (
                  <span className="chip neutral">{elig?.reason ?? 'Not eligible yet'}</span>
                ))}
              {lb && (
                <div className="col" style={{ marginTop: 8 }}>
                  {lb.stage === 'qualifiers' && Array.isArray(lb.standings) && <SwissView standings={lb.standings as never} matches={[]} names={names} nav={nav} />}
                  {lb.stage === 'groups' &&
                    Object.entries(lb.groups as Record<string, { id: string; name: string; points: number; wins: number; draws: number; losses: number; buchholz: number; vpDiff: number }[]>).map(([g, rows]) => (
                      <div key={g}>
                        <b>Group {g}</b>
                        <SwissView standings={rows} matches={[]} names={names} nav={nav} />
                      </div>
                    ))}
                  {(lb.stage === 'playoffs' || lb.stage === 'finished') && Array.isArray(lb.bracket) && <BracketView matches={lb.bracket as BMatch[]} names={names} nav={nav} />}
                  {lb.stage === 'registration' && Array.isArray(lb.direct) && (lb.direct as { name: string; via: string }[]).length > 0 && (
                    <div className="small">
                      <b>Seeded into the groups</b>
                      {(lb.direct as { name: string; via: string }[]).map((d) => (
                        <div key={d.name}>
                          {d.name} <span className="muted">· {d.via}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {live.length > 0 && (
            <div className="col" style={{ marginTop: 10 }}>
              <h3>Live broadcasts</h3>
              <div className="row wrap">
                {live.map((m) => (
                  <button key={m.id} className="btn secondary small" onClick={() => nav({ name: 'spectate', match: m.id })}>
                    <Icon name="ui/eye" size={16} /> {m.names[0]} {m.vp[0]}:{m.vp[1]} {m.names[1]} · R{m.round}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Circuit Points race */}
        <section className="panel">
          <h2>Circuit Points</h2>
          {circuit?.me && (
            <p className="small">
              You: <b className="num">{circuit.me.points}</b> points · {circuit.me.majors.map((m) => `${m.name} #${m.place}`).join(', ')}
            </p>
          )}
          {!circuit?.standings.length && <p className="muted small">No Major has been played this season yet. The first one decides the first seed.</p>}
          <table className="table">
            <tbody>
              {circuit?.standings.slice(0, 32).map((r) => (
                <tr key={r.playerId} className={r.playerId === p.online!.playerId ? 'me' : ''}>
                  <td className="num">{r.rank}</td>
                  <td>
                    <button className="link-name" onClick={() => nav({ name: 'profile', id: r.playerId })}>
                      {r.name}
                    </button>
                    {directIds.has(r.playerId) && <span className="chip buff" style={{ marginLeft: 6 }}>seeded</span>}
                  </td>
                  <td className="num">{r.points}</td>
                  <td className="num muted">{r.majorWins ? (
                      <>
                        {r.majorWins}× <Icon name="ui/crown" size={14} />
                      </>
                    ) : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* champion history */}
      <section className="panel">
        <h2>Champions</h2>
        {!champs?.history.length && !champs?.majors.length && <span className="muted small">No champion yet. The first crown is still unclaimed.</span>}
        <div className="champ-list">
          {champs?.history.map((h) => (
            <div key={h.edition} className="champ-card world">
              <span className="small muted">{h.season ? `World Cup ${h.season}` : h.cup}</span>
              <button className="link-name display" onClick={() => nav({ name: 'profile', id: h.playerId })}>
                <Icon name="ui/crown" size={18} /> {h.champion}
              </button>
              <span className="small muted">{h.podium?.filter((x) => x.place > 1 && x.place <= 3).map((x) => `#${x.place} ${x.name}`).join(' · ')}</span>
            </div>
          ))}
          {champs?.majors.map((m) => (
            <div key={m.id} className="champ-card">
              <span className="small muted">{m.name}</span>
              <button className="link-name" onClick={() => nav({ name: 'profile', id: m.playerId })}>
                {m.champion}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
