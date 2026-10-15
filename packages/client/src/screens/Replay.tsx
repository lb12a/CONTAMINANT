import { useEffect, useMemo, useRef, useState } from 'react';
import { replayFrames, type GameEvent, type ReplayFrame, type ReplayLog } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { BoardCanvas } from '../render/BoardCanvas.tsx';
import type { Floater, Flash, Overlay, Pulse } from '../render/types.ts';
import { getApi, toast, useProfile } from '../store.ts';
import { VpRace } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';

interface StoredMatch {
  id: string;
  kind: string;
  p0_name: string;
  p1_name: string;
  winner: number | null;
  vp0: number;
  vp1: number;
  rounds: number;
  ended: number | null;
  replay: ReplayLog;
}

const LOGGED = new Set(['ko', 'vp', 'crit', 'deploy', 'win', 'attack', 'field', 'trap', 'heal']);

/** Effects for one resolved round, anchored to tiles (damage numbers, flashes, lunges, hits). */
function effectsFor(events: GameEvent[], t0: number): Pick<Overlay, 'floaters' | 'flashes' | 'pulses'> {
  const floaters: Floater[] = [];
  const flashes: Flash[] = [];
  const pulses: Pulse[] = [];
  events.forEach((e, i) => {
    const at = t0 + Math.min(i, 40) * 90;
    if (e.kind === 'damage' && e.target && e.amount && e.to) floaters.push({ h: e.to, text: `-${e.amount}`, color: '#ff5a5a', t0: at, big: e.amount >= 60 });
    if (e.kind === 'damage' && e.target) pulses.push({ uid: e.target, kind: 'hit', t0: at });
    if (e.kind === 'heal' && e.target) pulses.push({ uid: e.target, kind: 'heal', t0: at });
    if (e.kind === 'attack' && e.actor && (e.to ?? e.tiles?.[0])) pulses.push({ uid: e.actor, kind: 'lunge', to: (e.to ?? e.tiles![0])!, t0: at });
    if (e.kind === 'field' && e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(255,154,31,0.45)', t0: at, dur: 700 });
    if (e.kind === 'crit' && e.to) floaters.push({ h: e.to, text: 'CRIT', color: '#D9A93A', t0: at, big: true });
  });
  return { floaters, flashes, pulses };
}

/** Replay viewer: re-simulates a stored match from its seed and plans, round by round, with full information. */
export function ReplayScreen({ nav, match }: { nav: Nav; match?: string }) {
  const p = useProfile();
  const [stored, setStored] = useState<StoredMatch | null>(null);
  const [frames, setFrames] = useState<ReplayFrame[] | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fx, setFx] = useState<Pick<Overlay, 'floaters' | 'flashes' | 'pulses'>>({});
  const [list, setList] = useState<{ id: string; p0_name: string; p1_name: string; vp0: number; vp1: number; kind: string; ended: number | null }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!p.online) return;
    if (!match) {
      getApi()
        .get<{ matches: typeof list }>('/api/matches?limit=40')
        .then((r) => setList(r.matches))
        .catch(() => undefined);
      return;
    }
    setFrames(null);
    getApi()
      .get<{ match: StoredMatch }>(`/api/matches/${match}`)
      .then((r) => {
        setStored(r.match);
        try {
          setFrames(replayFrames(r.match.id, r.match.replay));
          setI(0);
        } catch (e) {
          toast(`Replay could not be rebuilt: ${(e as Error).message}`, 'bad');
        }
      })
      .catch((e: Error) => toast(e.message, 'bad'));
  }, [p.online, match]);

  // autoplay: one round every 2.2 s
  useEffect(() => {
    if (!playing || !frames) return;
    if (i >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const h = setTimeout(() => step(1), 2200);
    return () => clearTimeout(h);
  });

  const step = (d: number) => {
    if (!frames) return;
    const n = Math.max(0, Math.min(frames.length - 1, i + d));
    setI(n);
    setFx(d === 1 ? effectsFor(frames[n]!.events, performance.now()) : {});
  };

  const overlay = useMemo<Overlay>(() => ({ highlights: new Map(), paths: [], targets: [], ghosts: [], ...fx }), [fx]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [i]);

  if (!p.online) return <p className="muted">Go online to watch replays.</p>;
  if (!match)
    return (
      <div className="col">
        <h1>Replays</h1>
        {!list.length && <span className="muted">No recorded matches yet.</span>}
        {list.map((m) => (
          <button key={m.id} className="btn secondary small" style={{ justifyContent: 'flex-start' }} onClick={() => nav({ name: 'replay', match: m.id })}>
            <Icon name="ui/play" size={16} /> {m.p0_name} {m.vp0}:{m.vp1} {m.p1_name} · {m.kind} {m.ended ? `· ${new Date(m.ended).toLocaleDateString()}` : ''}
          </button>
        ))}
      </div>
    );
  if (!frames || !stored) return <p className="muted">Rebuilding the match from its seed…</p>;
  const f = frames[i]!;
  const allVerified = frames.every((x) => x.verified);
  return (
    <div className="col replay-page">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>
          {stored.p0_name} <span className="muted">vs</span> {stored.p1_name}
        </h1>
        <span className={`chip ${allVerified ? 'buff' : 'debuff'}`} title="Every round was re-simulated and compared with the recorded state hash">
          <Icon name={allVerified ? 'ui/check' : 'ui/warning'} size={16} /> {allVerified ? 'verified replay' : 'hash mismatch'}
        </span>
      </div>
      <div className="replay-stage panel">
        <div className="replay-score">
          <b style={{ color: 'var(--me)' }}>
            {stored.p0_name} {f.state.players[0].vp}
          </b>
          <span className="display">{i === 0 ? 'Opening' : `Round ${f.round}`}</span>
          <b style={{ color: 'var(--foe)' }}>
            {f.state.players[1].vp} {stored.p1_name}
          </b>
        </div>
        <VpRace me={f.state.players[0].vp} them={f.state.players[1].vp} />
        <div className="replay-board">
          <BoardCanvas state={f.state} me={0} overlay={overlay} />
        </div>
        <div className="row replay-controls">
          <button className="btn secondary small" onClick={() => (setI(0), setFx({}))} aria-label="First round">
            <Icon name="ui/first" size={18} />
          </button>
          <button className="btn secondary small" onClick={() => step(-1)} aria-label="Previous round">
            <Icon name="ui/step_back" size={18} />
          </button>
          <button className="btn primary small" onClick={() => setPlaying((v) => !v)}>
            <Icon name={playing ? 'ui/pause' : 'ui/play'} size={18} /> {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn secondary small" onClick={() => step(1)} aria-label="Next round">
            <Icon name="ui/play" size={18} />
          </button>
          <input className="spine grow" type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => (setI(Number(e.target.value)), setFx({}))} aria-label="Round" />
          <span className="num small">
            {i}/{frames.length - 1}
          </span>
        </div>
      </div>
      <div className="panel notebook logbook" ref={logRef} style={{ maxHeight: 260 }}>
        {i === 0 && <span className="muted">Both labs are prepared. Press play.</span>}
        {f.events
          .filter((e) => LOGGED.has(e.kind) && e.privateTo === undefined)
          .map((e, k) => (
            <div key={k} className={e.kind}>
              {e.text}
            </div>
          ))}
      </div>
    </div>
  );
}
