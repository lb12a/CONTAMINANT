import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';

interface ProfileData {
  player: { id: string; name: string; mmr: number; peak: number; division: string; games: number; wins: number; losses: number; draws: number; titles: string[]; isBot: boolean };
  rank: number | null;
  team: { id: string; name: string; tag: string } | null;
  circuit: { points: number; majorWins: number; majors: { name: string; place: number; points: number }[] } | null;
  recent: { id: string; kind: string; p0: string; p1: string; p0_name: string; p1_name: string; winner: number | null; vp0: number; vp1: number; rounds: number; ended: number | null }[];
  honours: { kind: string; title: string; created: number }[];
}

const HONOUR_ICON: Record<string, string> = { world_champion: 'ui/crown', world_podium: 'ui/medal', season_champion: 'ui/medal', trophy: 'ui/trophy' };

/** Public player profile: rating, record, team, Circuit results, honours and recent matches (with replays). */
export function ProfileScreen({ nav, id }: { nav: Nav; id?: string }) {
  const p = useProfile();
  const pid = id ?? p.online?.playerId;
  const [data, setData] = useState<ProfileData | null>(null);
  useEffect(() => {
    if (!p.online || !pid) return;
    setData(null);
    getApi()
      .get<ProfileData>(`/api/players/${pid}`)
      .then(setData)
      .catch((e: Error) => toast(e.message, 'bad'));
  }, [p.online, pid]);
  if (!p.online) return <p className="muted">Go online to see player profiles.</p>;
  if (!data) return <p className="muted">Opening the file…</p>;
  const pl = data.player;
  const winRate = pl.games ? Math.round((pl.wins / pl.games) * 100) : 0;
  return (
    <div className="col profile-page">
      <section className="panel profile-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="small muted">{pl.isBot ? 'Laboratory bot' : `Subject #${data.rank ?? '—'} on the ladder`}</span>
          <h1 style={{ margin: 0 }}>
            {data.team && <span className="team-tag">[{data.team.tag}]</span>} {pl.name}
          </h1>
          {data.team && (
            <button className="link-name small" onClick={() => nav({ name: 'teams', id: data.team!.id })}>
              {data.team.name}
            </button>
          )}
        </div>
        <div className="profile-stats">
          <div>
            <b className="display num">{pl.mmr}</b>
            <span className="small muted">MMR · {pl.division}</span>
          </div>
          <div>
            <b className="display num">{pl.peak}</b>
            <span className="small muted">Peak</span>
          </div>
          <div>
            <b className="display num">{winRate}%</b>
            <span className="small muted">
              {pl.wins}W {pl.losses}L {pl.draws}D
            </span>
          </div>
          <div>
            <b className="display num">{data.circuit?.points ?? 0}</b>
            <span className="small muted">Circuit Points</span>
          </div>
        </div>
      </section>
      <div className="wc-grid">
        <section className="panel">
          <h2>Honours</h2>
          {!data.honours.length && !pl.titles.length && <span className="muted small">No honours yet.</span>}
          {pl.titles.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              {pl.titles.map((t) => (
                <span key={t} className="chip buff">
                  {t}
                </span>
              ))}
            </div>
          )}
          {data.honours.map((h, i) => (
            <div key={i} className="small">
              <Icon name={HONOUR_ICON[h.kind] ?? 'ui/medal'} size={18} /> {h.title} <span className="muted">· {new Date(h.created).toLocaleDateString()}</span>
            </div>
          ))}
          {data.circuit?.majors.length ? (
            <>
              <h3 style={{ marginTop: 12 }}>Monthly Majors</h3>
              {data.circuit.majors.map((m) => (
                <div key={m.name} className="small">
                  {m.name}: #{m.place} <span className="muted">(+{m.points})</span>
                </div>
              ))}
            </>
          ) : null}
        </section>
        <section className="panel">
          <h2>Recent matches</h2>
          {!data.recent.length && <span className="muted small">No recorded matches.</span>}
          {data.recent.map((m) => {
            const side = m.p0 === pl.id ? 0 : 1;
            const res = m.winner === null ? 'draw' : m.winner === side ? 'win' : 'loss';
            const opp = side === 0 ? m.p1_name : m.p0_name;
            return (
              <div key={m.id} className="row small" style={{ justifyContent: 'space-between' }}>
                <span>
                  <span className={`chip ${res === 'win' ? 'buff' : res === 'loss' ? 'debuff' : 'neutral'}`}>{res}</span> vs {opp} · {side === 0 ? m.vp0 : m.vp1}:{side === 0 ? m.vp1 : m.vp0} · {m.kind}
                </span>
                <button className="btn secondary small" onClick={() => nav({ name: 'replay', match: m.id })}>
                  <Icon name="ui/play" size={16} /> Replay
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
