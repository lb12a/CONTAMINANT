import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';

interface Row {
  id: string;
  kind: string;
  mode: string;
  p0_name: string;
  p1_name: string;
  p0: string;
  winner: number;
  vp0: number;
  vp1: number;
  rounds: number;
  ended: number;
}

export function HistoryScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [open, setOpen] = useState<string | null>(null);
  const [online, setOnline] = useState<Row[]>([]);
  const [verify, setVerify] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!p.online) return;
    getApi()
      .get<{ matches: Row[] }>('/api/matches?mine=1&limit=50')
      .then((r) => setOnline(r.matches))
      .catch(() => undefined);
  }, [p.online]);
  return (
    <div className="col">
      <h1>{t('History')}</h1>
      <div className="panel">
        <h3>Local matches</h3>
        {p.history.length === 0 && <span className="muted small">No matches yet.</span>}
        {p.history.map((h) => (
          <div key={h.id + h.at} className="col" style={{ borderBottom: '1px solid #2c2535', padding: '6px 0' }}>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <span>
                <Icon name={h.won === null ? 'ui/scales' : h.won ? 'ui/trophy' : 'ui/skull'} size={18} /> vs <b>{h.opponent}</b> · {h.mode} · <span className="num">{h.vp[0]}:{h.vp[1]}</span> · {h.rounds} rounds
              </span>
              <span className="small muted">{new Date(h.at).toLocaleString()}</span>
              <button className="btn secondary small" onClick={() => setOpen(open === h.id ? null : h.id)}>
                {t('Combat log')}
              </button>
            </div>
            {open === h.id && (
              <div className="notebook logbook" style={{ maxHeight: 320 }}>
                {h.log.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {p.online && (
        <div className="panel scroll-x">
          <h3>Online matches</h3>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Players</th>
                <th className="num">VP</th>
                <th className="num">Rounds</th>
                <th>Replay</th>
              </tr>
            </thead>
            <tbody>
              {online.map((r) => (
                <tr key={r.id}>
                  <td className="small">{new Date(r.ended).toLocaleString()}</td>
                  <td>{r.kind}</td>
                  <td>
                    {r.winner === 0 ? <b>{r.p0_name}</b> : r.p0_name} vs {r.winner === 1 ? <b>{r.p1_name}</b> : r.p1_name}
                  </td>
                  <td className="num">
                    {r.vp0}:{r.vp1}
                  </td>
                  <td className="num">{r.rounds}</td>
                  <td>
                    <button className="btn primary small" onClick={() => nav({ name: 'replay', match: r.id })}>
                      <Icon name="ui/play" size={16} /> Replay
                    </button>{' '}
                    <button
                      className="btn secondary small"
                      onClick={async () => {
                        const v = await getApi().get<{ ok: boolean; rounds: number }>(`/api/matches/${r.id}/verify`);
                        setVerify((x) => ({ ...x, [r.id]: v.ok ? `verified (${v.rounds} rounds)` : 'mismatch' }));
                      }}
                    >
                      Verify
                    </button>{' '}
                    <span className="small">{verify[r.id]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
