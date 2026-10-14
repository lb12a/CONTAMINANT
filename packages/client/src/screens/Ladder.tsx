import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';

interface Row {
  rank: number;
  id: string;
  name: string;
  mmr: number;
  division: string;
  divisionId: string;
  wins: number;
  losses: number;
  titles: string[];
}
interface Division {
  id: string;
  name: string;
  min: number;
  color: string;
  reward: { gold: number; trophies: number; cardBack?: string; skin?: string; title?: string };
}

export function LadderScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [divs, setDivs] = useState<Division[]>([]);
  const [season, setSeason] = useState<{ name: string; end: number } | null>(null);
  const [bots, setBots] = useState(false);
  useEffect(() => {
    if (!p.online) return;
    getApi()
      .get<{ players: Row[]; season: { name: string; end: number } }>(`/api/ladder?limit=200${bots ? '&bots=1' : ''}`)
      .then((r) => {
        setRows(r.players);
        setSeason(r.season);
      })
      .catch((e: Error) => toast(e.message, 'bad'));
    getApi()
      .get<{ divisions: Division[] }>('/api/divisions')
      .then((r) => setDivs(r.divisions))
      .catch(() => undefined);
  }, [p.online, bots]);
  if (!p.online) return <p className="muted">Go online to see the global ladder.</p>;
  const color = (id: string) => divs.find((d) => d.id === id)?.color ?? '#888';
  return (
    <div className="col">
      <h1>{t('Ladder')}</h1>
      {season && (
        <p className="muted">
          {season.name} · season ends {new Date(season.end).toLocaleString()} · soft reset halfway to 1000 MMR
        </p>
      )}
      <div className="row wrap">
        {divs.map((d) => (
          <div key={d.id} className="panel small" style={{ borderColor: d.color, minWidth: 150 }}>
            <b style={{ color: d.color }}>{d.name}</b>
            <div className="muted">from {d.min} MMR</div>
            <div>
              🪙 {d.reward.gold} · 🏆 {d.reward.trophies}
            </div>
            {d.reward.cardBack && <div>Card back: {d.reward.cardBack.replace(/_/g, ' ')}</div>}
            {d.reward.skin && <div>Skin: {d.reward.skin.replace(/_/g, ' ')}</div>}
            {d.reward.title && <div>Title: {d.reward.title}</div>}
          </div>
        ))}
      </div>
      <label className="row small">
        <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} /> show bot accounts
      </label>
      <div className="panel scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Division</th>
              <th className="num">MMR</th>
              <th className="num">W–L</th>
              <th>Titles</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.id === p.online?.playerId ? { background: '#8cff5a14' } : undefined}>
                <td className="num">{r.rank}</td>
                <td>
                  <button className="link-name" onClick={() => nav({ name: 'profile', id: r.id })}>
                    {r.name}
                  </button>
                </td>
                <td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color(r.divisionId), marginRight: 6 }} />
                  {r.division}
                </td>
                <td className="num">{r.mmr}</td>
                <td className="num">
                  {r.wins}–{r.losses}
                </td>
                <td className="small">{r.titles.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
