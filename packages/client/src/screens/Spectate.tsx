import { useEffect, useState } from 'react';
import type { GameEvent, GameState, ServerMsg } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { BoardCanvas } from '../render/BoardCanvas.tsx';
import { getApi, getSocket, useProfile } from '../store.ts';
import { VpRace } from '../ui/components.tsx';
import { t } from '../i18n.ts';

interface Live {
  id: string;
  kind: string;
  names: [string, string];
  round: number;
  vp: [number, number];
  featured: boolean;
  tournament?: string;
  delayRounds: number;
}

/** Spectator mode: full-information view with a broadcast delay; casters get the same feed for featured matches. */
export function SpectateScreen({ match }: { nav: Nav; match?: string }) {
  const p = useProfile();
  const [list, setList] = useState<Live[]>([]);
  const [sel, setSel] = useState<string | undefined>(match);
  const [frame, setFrame] = useState<{ view: GameState; events: GameEvent[]; round: number; delay: number; names: [string, string] } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (!p.online) return;
    const f = () =>
      getApi()
        .get<{ matches: Live[] }>('/api/live')
        .then((r) => setList(r.matches))
        .catch(() => undefined);
    f();
    const i = setInterval(f, 5000);
    return () => clearInterval(i);
  }, [p.online]);
  useEffect(() => {
    const s = getSocket();
    if (!s || !sel) return;
    s.send({ t: 'spectate', match: sel, caster: true });
    const off = s.on((m: ServerMsg) => {
      if (m.t === 'spectate_frame' && m.match === sel) {
        setFrame({ view: m.view, events: m.events, round: m.round, delay: m.delayRounds, names: m.names });
        setLog((l) => [...l, ...m.events.filter((e) => ['ko', 'vp', 'crit', 'deploy', 'win'].includes(e.kind) && e.privateTo === undefined).map((e) => e.text)].slice(-200));
      }
    });
    return () => {
      off();
      s.send({ t: 'unspectate', match: sel });
    };
  }, [sel, p.online]);
  if (!p.online) return <p className="muted">Go online to watch live matches.</p>;
  return (
    <div className="col">
      <h1>{t('Spectate')}</h1>
      <div className="row wrap">
        {list.length === 0 && <span className="muted">No live matches right now.</span>}
        {list.map((m) => (
          <button key={m.id} className={`btn ${m.id === sel ? 'primary' : 'secondary'} small`} onClick={() => setSel(m.id)}>
            {m.featured ? '★ ' : ''}
            {m.names[0]} {m.vp[0]}:{m.vp[1]} {m.names[1]} · R{m.round} · {m.kind}
          </button>
        ))}
      </div>
      {sel && (
        <div className="row small">
          <span className="muted">Stream overlay for OBS:</span>
          <code>{`${getApi().base}/overlay/${sel}`}</code>
        </div>
      )}
      {frame && (
        <div className="row wrap" style={{ alignItems: 'stretch' }}>
          <div className="panel col grow" style={{ minWidth: 300 }}>
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              <b>{frame.names[0]}</b>
              <span>
                Round {frame.round} · delay {frame.delay} round(s)
              </span>
              <b>{frame.names[1]}</b>
            </div>
            <VpRace me={frame.view.players[0].vp} them={frame.view.players[1].vp} />
            <div style={{ height: 'min(60vh, 520px)' }}>
              <BoardCanvas state={frame.view} me={0} overlay={{ highlights: new Map(), paths: [], targets: [], ghosts: [] }} />
            </div>
          </div>
          <div className="panel notebook logbook" style={{ width: 300, maxHeight: '70vh' }}>
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
