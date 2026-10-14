import { CHARACTERS, TUTORIALS } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { CharacterCard } from '../ui/components.tsx';
import { useProfile } from '../store.ts';
import { t } from '../i18n.ts';

export function TutorialsScreen({ nav }: { nav: Nav; defId?: string }) {
  const p = useProfile();
  const de = p.settings.lang === 'de';
  const done = TUTORIALS.filter((tu) => p.collection.chars[tu.id]?.tutorialDone).length;
  return (
    <div className="col">
      <h1>{t('Testing Chambers')}</h1>
      <p className="muted">
        {de
          ? 'Jede freigeschaltete Karte hat einen Prüfstand: 2–5 Minuten, fünf Akte, ein Wärter. Der erste Abschluss bringt 100 Gold.'
          : 'Every unlocked card has a Testing Chamber: 2–5 minutes, five acts, one Warden. The first completion pays 100 gold.'}{' '}
        <b>
          {done}/{TUTORIALS.length}
        </b>
      </p>
      <div className="paper row wrap" style={{ padding: 12, justifyContent: 'space-between' }}>
        <span>
          <b>{de ? 'Grundausbildung' : 'Basic Training'}</b> · {de ? 'eine geführte erste Runde: Einsetzen, Bewegen, Angreifen, Karten, Versiegeln.' : 'a guided first match: deploy, move, attack, cards, sealing your plan.'}
        </span>
        <button className="btn primary small" onClick={() => nav({ name: 'match', training: true })}>
          {p.trainingDone ? (de ? 'Wiederholen' : 'Replay training') : de ? 'Starten' : 'Start'}
        </button>
      </div>
      <div className="grid-cards">
        {TUTORIALS.map((tu) => {
          const owned = !!p.collection.chars[tu.id];
          const c = p.collection.chars[tu.id];
          return (
            <div key={tu.id} className="col" style={{ gap: 6 }}>
              <CharacterCard defId={tu.id} locked={!owned} isNew={c?.isNew} level={c?.level} onClick={owned ? () => nav({ name: 'match', tutorial: tu.id }) : undefined}>
                {c?.tutorialDone && <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 40, color: 'var(--spore)', textShadow: '0 0 8px #000' }}>✔</div>}
              </CharacterCard>
              <button className="btn tutorial" disabled={!owned} onClick={() => nav({ name: 'match', tutorial: tu.id })} title={de ? tu.titleDe : tu.title}>
                {de ? 'Prüfstand' : 'Test chamber'} · {tu.duration}
              </button>
              <span className="small muted center">{owned ? (de ? tu.titleDe : tu.title) : `${de ? 'Gesperrt' : 'Locked'} · ${CHARACTERS[tu.id]?.zone}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
