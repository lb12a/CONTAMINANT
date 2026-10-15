import { useEffect, useMemo, useState } from 'react';
import { CHARACTERISTICS, CHARACTERS, CATEGORY_ORDER, currentTasks, isProbe, tutorialStations } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { MatchScreen } from './MatchScreen.tsx';
import { TutorialController } from '../game/tutorialController.ts';
import { CharacterCard, HexIcon, Modal } from '../ui/components.tsx';
import { charRing } from '../ui/glyphs.ts';
import { getApi, getProfile, setProfile, toast } from '../store.ts';
import { t } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';

export function TutorialMatch({ defId, nav }: { defId: string; nav: Nav }) {
  const ctrl = useMemo(() => new TutorialController(defId), [defId]);
  const [, force] = useState(0);
  const [intro, setIntro] = useState(true);
  const [lit, setLit] = useState(0);
  useEffect(() => ctrl.onTutorial(() => force((n) => n + 1)), [ctrl]);
  useEffect(() => {
    if (!intro) return;
    const i = setInterval(() => setLit((n) => Math.min(5, n + 1)), 650);
    return () => clearInterval(i);
  }, [intro]);
  const sess = ctrl.sess;
  const plan = sess.plan;
  const def = CHARACTERS[plan.main]!;
  const de = getProfile().settings.lang === 'de';
  const probe = isProbe(sess);
  const act = sess.stage >= 1 && sess.stage <= plan.acts.length ? plan.acts[sess.stage - 1] : undefined;
  const tasks = currentTasks(sess);
  const stations = tutorialStations(sess);

  const finish = () => {
    const first = !getProfile().collection.chars[defId]?.tutorialDone;
    setProfile((p) => {
      const col = structuredClone(p.collection);
      col.chars[defId] ??= { level: 1, dups: 0 };
      if (!col.chars[defId]!.tutorialDone) col.gold += 100;
      col.chars[defId]!.tutorialDone = true;
      col.chars[defId]!.isNew = false;
      return { ...p, collection: col };
    });
    if (getProfile().online) void getApi().post('/api/collection/tutorial', { defId }).catch(() => undefined);
    toast(first ? 'Testing Chamber complete: +100 gold' : 'Testing Chamber complete (no reward for repeats)', 'good');
    nav({ name: 'tutorials' });
  };

  const panel = (
    <div className="col" style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b className="display">Testing Chamber · {def.name}</b>
        <span className="small muted">{plan.duration}</span>
      </div>
      <div className="stations" title="Five acts">
        {stations.map((d, i) => (
          <span key={i} className="row" style={{ gap: 0 }}>
            {i > 0 && <span className="thread" />}
            <span className={`st${d ? ' done' : ''}`} title={['Introduction', 'Basic move', 'Core mechanic', 'Synergy & weakness', 'Final test'][i]} />
          </span>
        ))}
      </div>
      <div className="warden">
        <div aria-hidden>
          <Icon name="ui/skull" size={40} />
        </div>
        <div className="note">
          {probe ? (
            <>
              <b>{de ? 'Probe' : 'Final test'}:</b> {de ? plan.probe.de : plan.probe.en}
              <div className="small">{de ? 'Keine Hinweise. Echte Zufälle.' : 'No hints. Real randomness.'} ({3 - sess.probeTries} tries)</div>
            </>
          ) : act ? (
            <>
              <b>
                {act.mark} · {act.title}
              </b>
              <div>{de ? act.de : act.en}</div>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {act.hints.map((h) => (
                  <li key={h} className="small">
                    {h}
                  </li>
                ))}
              </ul>
            </>
          ) : sess.passed ? (
            <b>{de ? 'Bestanden. Die Kammer öffnet sich.' : 'Passed. The chamber opens.'}</b>
          ) : (
            <span>{de ? plan.intro.de : plan.intro.en}</span>
          )}
        </div>
      </div>
      {tasks.map((tk, i) => (
        <div key={i} className={`task${sess.done[i] && !probe ? ' done' : ''}`}>
          <span className="tube" />
          <span className="small">{de ? tk.de : tk.en}</span>
        </div>
      ))}
      {ctrl.last && !ctrl.last.passed && !sess.passed && <div className="small" style={{ color: '#ff9da2' }}>{de ? 'Aufgabe nicht erfüllt.' : 'Task not completed.'}</div>}
      {sess.showSolution && (
        <div className="paper small" style={{ padding: 8 }}>
          <Icon name="tag/soul" size={18} /> {de ? 'Geister-Vorschau' : 'Ghost preview'}: {plan.probe.solution}
        </div>
      )}
      <div className="row wrap">
        <button className="btn tutorial" disabled={sess.rewindsLeft <= 0 || probe} onClick={() => (ctrl.rewind() ? toast(`${sess.rewindsLeft} rewinds left`) : undefined)}>
          ↺ {t('Try another plan')} ({sess.rewindsLeft})
        </button>
        {!sess.passed && !probe && (
          <button className="btn secondary small" onClick={() => ctrl.skip()}>
            {t('Skip')}
          </button>
        )}
        {(sess.passed || sess.showSolution) && (
          <button className="btn primary small" onClick={finish}>
            {t('Next')}
          </button>
        )}
      </div>
      <details className="small">
        <summary>{de ? 'Synergien und Schwäche' : 'Synergies and weakness'}</summary>
        <p>
          <b>+</b> {plan.synergies}
        </p>
        <p>
          <b style={{ color: '#ff9da2' }}>!</b> {plan.weakness}
        </p>
      </details>
    </div>
  );

  return (
    <>
      <MatchScreen ctrl={ctrl} tutorialPanel={panel} onExit={() => (sess.passed ? finish() : nav({ name: 'tutorials' }))} />
      {intro && (
        <Modal title={`${t('Testing Chambers')} — ${def.name}`} onClose={() => { setIntro(false); ctrl.start(); }}>
          <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
            <div className="float-in">
              <CharacterCard defId={def.id} width={170} />
            </div>
            <div className="col grow" style={{ minWidth: 240 }}>
              <p className="display">{de ? plan.titleDe : plan.title}</p>
              {CATEGORY_ORDER.map((cat, i) => {
                const ch = CHARACTERISTICS[def.chars[cat]]!;
                return (
                  <div key={cat} className="row small" style={{ opacity: i < lit ? 1 : 0.15, transition: 'opacity .4s' }}>
                    <HexIcon ring={charRing(ch.id)}>{ch.name.slice(0, 2)}</HexIcon>
                    <span>
                      <b>{ch.name}</b>: {ch.buff} · <span style={{ color: '#ff9da2' }}>{ch.weakness}</span>
                    </span>
                  </div>
                );
              })}
              <p className="small">{de ? plan.intro.de : plan.intro.en}</p>
              {plan.intro.quote && <p className="paper small" style={{ padding: 8 }}>„{plan.intro.quote}“ — Wärter</p>}
              <div className="row">
                <button className="btn primary" onClick={() => { setIntro(false); ctrl.start(); }}>
                  {t('Start tutorial')}
                </button>
                <button className="btn secondary" onClick={() => nav({ name: 'tutorials' })}>
                  {t('Later')}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
