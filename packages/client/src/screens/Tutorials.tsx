import { CHARACTERS, TUTORIALS } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { CharacterCard } from '../ui/components.tsx';
import { useProfile } from '../store.ts';
import { t, tx } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';

export function TutorialsScreen({ nav }: { nav: Nav; defId?: string }) {
  const p = useProfile();
  const done = TUTORIALS.filter((tu) => p.collection.chars[tu.id]?.tutorialDone).length;
  return (
    <div className="col">
      <h1>{t('Testing Chambers')}</h1>
      <p className="muted">
        {tx('Every unlocked card has a Testing Chamber: 2–5 minutes, five acts, one Warden. The first completion pays 100 gold.', 'Jede freigeschaltete Karte hat einen Prüfstand: 2–5 Minuten, fünf Akte, ein Wärter. Der erste Abschluss bringt 100 Gold.')}{' '}
        <b>
          {done}/{TUTORIALS.length}
        </b>
      </p>
      <div className="paper row wrap" style={{ padding: 12, justifyContent: 'space-between' }}>
        <span>
          <b>{tx('Basic Training', 'Grundausbildung')}</b> · {tx('a guided first match: deploy, move, attack, cards, sealing your plan.', 'eine geführte erste Runde: Einsetzen, Bewegen, Angreifen, Karten, Versiegeln.')}
        </span>
        <button className="btn primary small" onClick={() => nav({ name: 'match', training: true })}>
          {p.trainingDone ? (tx('Replay training', 'Wiederholen')) : tx('Start', 'Starten')}
        </button>
      </div>
      <div className="grid-cards">
        {TUTORIALS.map((tu) => {
          const owned = !!p.collection.chars[tu.id];
          const c = p.collection.chars[tu.id];
          return (
            <div key={tu.id} className="col" style={{ gap: 6 }}>
              <CharacterCard defId={tu.id} locked={!owned} isNew={c?.isNew} level={c?.level} onClick={owned ? () => nav({ name: 'match', tutorial: tu.id }) : undefined}>
                {c?.tutorialDone && (
                  <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                    <Icon name="ui/check" size={56} label="Done" />
                  </div>
                )}
              </CharacterCard>
              <button className="btn tutorial" disabled={!owned} onClick={() => nav({ name: 'match', tutorial: tu.id })} title={tx(tu.title, tu.titleDe)}>
                {tx('Test chamber', 'Prüfstand')} · {tu.duration}
              </button>
              <span className="small muted center">{owned ? (tx(tu.title, tu.titleDe)) : `${tx('Locked', 'Gesperrt')} · ${CHARACTERS[tu.id]?.zone}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
