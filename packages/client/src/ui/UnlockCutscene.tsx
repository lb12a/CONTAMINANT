// The unlock cutscene: a new character arrives in a sealed containment pod. The pod shakes and leaks light in
// its rarity colour, the seal bursts, and the creature steps out of the fog with its name. Tap to skip ahead.

import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, MILESTONES } from '@contaminant/engine';
import { assetUrl } from '../render/assets.ts';
import { portraitUrl } from '../render/art.ts';
import { sfx } from '../audio.ts';
import { t } from '../i18n.ts';

/** intro (pod shakes) → burst → reveal (name, buttons) */
type Phase = 'intro' | 'burst' | 'reveal';
const INTRO_MS = 1700;
const BURST_MS = 450;

const RARITY_COLOR: Record<string, string> = {
  common: '#c9c3b4',
  uncommon: '#e07b45',
  rare: '#3fd7b0',
  epic: '#b06cff',
  legendary: '#ffcf4a',
};

export function UnlockCutscene({ defIds, onDone, onTutorial }: { defIds: string[]; onDone: () => void; onTutorial?: (defId: string) => void }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const timers = useRef<number[]>([]);
  const defId = defIds[i]!;
  const def = CHARACTERS[defId]!;
  const art = assetUrl(`tokens/${defId}`) ?? portraitUrl(defId, null, { size: 512 });
  const zone = MILESTONES.find((m) => m.cards.includes(defId));
  const color = RARITY_COLOR[def.rarity] ?? RARITY_COLOR.common!;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const last = i >= defIds.length - 1;
  const doneBtn = useRef<HTMLButtonElement>(null);

  const clear = () => {
    for (const x of timers.current) window.clearTimeout(x);
    timers.current = [];
  };
  const toReveal = () => {
    clear();
    setPhase('reveal');
    sfx('reveal');
  };
  const toBurst = () => {
    clear();
    setPhase('burst');
    sfx('burst');
    timers.current.push(window.setTimeout(toReveal, BURST_MS));
  };

  useEffect(() => {
    setPhase(reduced ? 'reveal' : 'intro');
    if (reduced) return;
    sfx('rumble');
    timers.current.push(window.setTimeout(toBurst, INTRO_MS));
    return clear;
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'reveal') doneBtn.current?.focus({ preventScroll: true });
  }, [phase]);

  const next = () => (last ? onDone() : setI(i + 1));
  // tapping during the intro skips straight to the burst, during the burst to the reveal
  const skip = () => {
    if (phase === 'intro') toBurst();
    else if (phase === 'burst') toReveal();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (phase !== 'reveal' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className={`unlock-cut phase-${phase}`} style={{ ['--rar' as string]: color }} role="dialog" aria-modal="true" aria-label={t('New character unlocked')} onClick={skip}>
      <div className="uc-vignette" />
      <div className="uc-rays" aria-hidden />
      <div className="uc-spores" aria-hidden>
        {Array.from({ length: 18 }, (_, k) => (
          <span key={`${i}-${k}`} style={{ ['--x' as string]: `${(k * 37) % 100}%`, ['--d' as string]: `${(k % 6) * 0.45}s`, ['--s' as string]: `${4 + (k % 4) * 2}px` }} />
        ))}
      </div>
      <div className="uc-stage" key={i}>
        <div className="uc-pod" aria-hidden>
          <div className="uc-pod-glass">
            <img src={art} alt="" draggable={false} />
          </div>
          <div className="uc-door left" />
          <div className="uc-door right" />
          <div className="uc-seal display">?</div>
          <div className="uc-crack" />
        </div>
        <div className="uc-ring" aria-hidden />
        <div className="uc-hero">
          <img src={art} alt={def.name} draggable={false} />
        </div>
        <div className="uc-copy">
          <span className="uc-kicker display">{t('New character unlocked')}</span>
          <h2 className="uc-name display">{def.name}</h2>
          <span className="uc-title">{def.title}</span>
          <span className="uc-tags">
            <span className="uc-rarity">{t(def.rarity)}</span>
            {zone && <span className="chip neutral small">{t(zone.name)}</span>}
            <span className="chip neutral small">{def.role}</span>
          </span>
          <div className="uc-actions" onClick={(e) => e.stopPropagation()}>
            {onTutorial && (
              <button className="btn tutorial" onClick={() => onTutorial(defId)}>
                {t('Open its Testing Chamber')}
              </button>
            )}
            <button ref={doneBtn} className="btn primary" onClick={next}>
              {last ? t('Continue') : `${t('Next')} (${i + 2}/${defIds.length})`}
            </button>
          </div>
        </div>
      </div>
      {phase !== 'reveal' && <span className="uc-skip small">{t('Tap to skip')}</span>}
    </div>
  );
}
