import { useState } from 'react';
import { MILESTONES, nextMilestone, type Difficulty, type ModeId } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { activeDeck, setProfile, useProfile } from '../store.ts';
import { startBotMatch } from '../game/offline.ts';
import { t } from '../i18n.ts';
import { assetUrl } from '../render/assets.ts';

/** Creatures standing in the menu hero (back row first). */
const CAST = [
  { id: 'cruorina', h: 250, z: 1 },
  { id: 'frankenstein', h: 270, z: 2 },
  { id: 'vile', h: 300, z: 4 },
  { id: 'arachnia', h: 230, z: 3 },
  { id: 'calaca', h: 260, z: 2 },
];

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
  const backdrop = assetUrl('backdrops/menu');
  const cast = CAST.map((c) => ({ ...c, url: assetUrl(`tokens/${c.id}`) })).filter((c): c is typeof c & { url: string } => !!c.url);
  const play = (mode: ModeId) => {
    setProfile((x) => ({ ...x, settings: { ...x.settings, mode, difficulty: diff } }));
    nav({ name: 'match', ctrl: startBotMatch({ mode, difficulty: diff }) });
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <section className="hero">
        <div className="hero-art" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined} aria-hidden />
        <div className="hero-copy">
          <h1 className="hero-title">Contaminant</h1>
          <p className="hero-tag">{t('Plan in secret. Everything resolves at once: Priority first, then Speed. First to 100 Victory Points wins.')}</p>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn seal l" onClick={() => play('contamination')}>
              {t('Play vs Bot')}
            </button>
            <button className="btn secondary" onClick={() => nav({ name: 'online' })}>
              {p.online ? t('Ranked') : t('Go online')}
            </button>
          </div>
          {!p.trainingDone && (
            <div className="paper hero-note">
              <b>{t('Welcome, Subject.')}</b> {t('Basic Training walks you through your first round: you deploy, move, attack and seal your plan yourself. About five minutes, 200 gold.')}
              <div className="row wrap" style={{ marginTop: 8 }}>
                <input type="text" placeholder={t('Your name')} aria-label={t('Your name')} defaultValue={p.name === 'Subject' ? '' : p.name} onBlur={(e) => e.target.value.trim() && setProfile((x) => ({ ...x, name: e.target.value.trim().slice(0, 20) }))} />
                <button className="btn primary" onClick={() => nav({ name: 'match', training: true })}>
                  {t('Start Basic Training')}
                </button>
                {!p.onboarded && (
                  <button className="btn secondary small" onClick={() => setProfile((x) => ({ ...x, onboarded: true, trainingDone: true }))}>
                    {t('I know how to play')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="hero-cast" aria-hidden>
          {cast.map((c, i) => (
            <img key={c.id} src={c.url} alt="" className="hero-creature" style={{ ['--h' as string]: `${c.h}px`, ['--d' as string]: `${i * 0.37}s`, zIndex: c.z }} draggable={false} />
          ))}
        </div>
      </section>

      <section className="panel rivets">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{t('Game modes')}</h2>
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
    <div style={{ position: 'relative', height: 92, marginTop: 6 }}>
      <div className="bar" style={{ position: 'absolute', left: 0, right: 0, top: 38, height: 16 }}>
        <div className="fill" style={{ width: `${Math.min(100, (trophies / max) * 100)}%`, background: 'linear-gradient(180deg,#c8ffad,#8CFF5A)' }} />
        <div className="shine" />
      </div>
      {MILESTONES.map((m, i) => (
        // labels alternate above and below the bar so close milestones never overlap
        <div key={m.zone} title={`${m.name}: ${m.cards.length} characters`} style={{ position: 'absolute', left: `${(m.trophies / max) * 100}%`, transform: 'translateX(-50%)', top: i % 2 ? 58 : 0, fontSize: 12, textAlign: 'center', opacity: trophies >= m.trophies ? 1 : 0.5, display: 'flex', flexDirection: i % 2 ? 'column-reverse' : 'column', alignItems: 'center' }}>
          <div className="paper" style={{ padding: '1px 5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {m.name.split(' ')[0]}
          </div>
          <div className="num">{m.trophies}</div>
        </div>
      ))}
    </div>
  );
}
