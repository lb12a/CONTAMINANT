import { useState } from 'react';
import { MILESTONES, nextMilestone, type Difficulty, type ModeId } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { activeDeck, setProfile, useProfile } from '../store.ts';
import { startBotMatch } from '../game/offline.ts';
import { t } from '../i18n.ts';
import { figureCanvas } from '../render/art.ts';
import { useEffect, useRef } from 'react';

const MODES: [ModeId, string, string][] = [
  ['contamination', '☣ Contamination', 'First to 100 VP, or wipe the enemy out'],
  ['elimination', '☠ Elimination', "All 10 enemy characters KO'd"],
  ['domination', '⚑ Domination', 'First to 75 VP, 3 Control Fields'],
  ['research', '⚗ Research', 'First to 90 VP, 3 Research Terminals'],
  ['escape', '🚪 Escape', 'Reach the far zone with 1 AP left'],
  ['anomaly', '👁 Anomaly', 'Defeat a buffed Boss, 150 VP cap'],
];

export function MenuScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const deck = activeDeck(p);
  const [diff, setDiff] = useState<Difficulty>(p.settings.difficulty);
  const next = nextMilestone(p.collection.bestTrophies);
  const play = (mode: ModeId) => {
    setProfile((x) => ({ ...x, settings: { ...x.settings, mode, difficulty: diff } }));
    nav({ name: 'match', ctrl: startBotMatch({ mode, difficulty: diff }) });
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <section className="row wrap" style={{ gap: 20, alignItems: 'center' }}>
        <Logo />
        <div className="col grow" style={{ minWidth: 260 }}>
          <h1 style={{ margin: 0 }}>The archive is leaking.</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Plan in secret. Everything resolves at once — Priority first, then Speed. First to 100 Victory Points wins.
          </p>
          {!p.trainingDone && (
            <div className="paper" style={{ padding: 12 }}>
              <b>Welcome, Subject.</b> Before your first real match, Basic Training walks you through a round: you deploy, move, attack and seal your plan yourself. It takes about five minutes and pays 200 gold.
              <div className="row wrap" style={{ marginTop: 8 }}>
                <input type="text" placeholder="Your name" defaultValue={p.name === 'Subject' ? '' : p.name} onBlur={(e) => e.target.value.trim() && setProfile((x) => ({ ...x, name: e.target.value.trim().slice(0, 20) }))} />
                <button className="btn primary" onClick={() => nav({ name: 'match', training: true })}>
                  Start Basic Training
                </button>
                {!p.onboarded && (
                  <button className="btn secondary small" onClick={() => setProfile((x) => ({ ...x, onboarded: true, trainingDone: true }))}>
                    I know how to play
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel rivets">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{t('Play vs Bot')}</h2>
          <div className="row small">
            Deck: <b>{deck.name}</b>
            <button className="btn secondary small" onClick={() => nav({ name: 'deck', deckId: deck.id })}>
              {t('Deck Builder')}
            </button>
            Bot:
            <select value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
              <option value="boss">Boss AI</option>
            </select>
          </div>
        </div>
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginTop: 10 }}>
          {MODES.map(([id, name, desc]) => (
            <button key={id} className={`btn ${id === 'contamination' ? 'primary' : 'secondary'}`} style={{ textAlign: 'left', minHeight: 72 }} onClick={() => play(id)}>
              <div>{name}</div>
              <div className="small" style={{ fontFamily: 'var(--font-body)', opacity: 0.8 }}>
                {desc}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="row wrap" style={{ gap: 12 }}>
        <div className="panel grow" style={{ minWidth: 280 }}>
          <h3>Trophy ladder</h3>
          <TrophyLadder trophies={p.collection.bestTrophies} />
          <p className="small muted">{next ? `${next.trophies - p.collection.bestTrophies} trophies until the ${next.name} opens.` : 'All areas are open.'}</p>
        </div>
        <div className="panel grow" style={{ minWidth: 280 }}>
          <h3>Online</h3>
          {p.online ? (
            <div className="col">
              <span>
                Connected as <b>{p.online.name}</b>
              </span>
              <div className="row wrap">
                <button className="btn primary" onClick={() => nav({ name: 'online' })}>
                  {t('Ranked')} / {t('Casual')}
                </button>
                <button className="btn secondary" onClick={() => nav({ name: 'tournaments' })}>
                  {t('Tournaments')}
                </button>
                <button className="btn buy" onClick={() => nav({ name: 'worldcup' })}>
                  🏆 {t('World Cup')}
                </button>
              </div>
            </div>
          ) : (
            <div className="col">
              <span className="muted small">Ranked ladder, tournaments, the World Cup, spectating and the live meta need a server.</span>
              <button className="btn primary" onClick={() => nav({ name: 'online' })}>
                {t('Go online')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TrophyLadder({ trophies }: { trophies: number }) {
  const max = MILESTONES[MILESTONES.length - 1]!.trophies * 1.15;
  return (
    <div style={{ position: 'relative', height: 54, marginTop: 6 }}>
      <div className="bar" style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 16 }}>
        <div className="fill" style={{ width: `${Math.min(100, (trophies / max) * 100)}%`, background: 'linear-gradient(180deg,#c8ffad,#8CFF5A)' }} />
        <div className="shine" />
      </div>
      {MILESTONES.map((m) => (
        <div key={m.zone} title={`${m.name}: ${m.cards.length} characters`} style={{ position: 'absolute', left: `calc(${(m.trophies / max) * 100}% - 10px)`, top: 0, fontSize: 11, textAlign: 'center', opacity: trophies >= m.trophies ? 1 : 0.45 }}>
          <div className="paper" style={{ padding: '1px 4px', fontFamily: 'var(--font-display)' }}>
            {m.name.split(' ')[0]}
          </div>
          <div>{m.trophies}</div>
        </div>
      ))}
    </div>
  );
}

function portraitFigure(): string {
  return figureCanvas('vile', 128).toDataURL();
}

function Logo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const S = 220;
    c.width = S;
    c.height = S;
    const draw = () => {
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.strokeStyle = '#8CFF5A';
      ctx.lineWidth = 10;
      ctx.shadowColor = '#8CFF5A';
      ctx.shadowBlur = 14;
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.arc(0, -42, 38, Math.PI * 0.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    draw();
  }, []);
  return (
    <div style={{ position: 'relative', width: 180, height: 180 }}>
      <canvas ref={ref} className="spin-slow" style={{ width: 180, height: 180 }} aria-label="Contaminant biohazard logo" />
      <img src={portraitFigure()} alt="" style={{ position: 'absolute', left: 40, top: 36, width: 100, height: 100 }} />
    </div>
  );
}
