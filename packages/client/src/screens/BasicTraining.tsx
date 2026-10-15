// Basic Training: the first match, guided step by step. The coach never plays for you: each step
// waits until you have done it yourself (picked a card, deployed, moved, attacked, sealed the plan).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CHARACTERS, createTraining, key, TRAINING, trainingWardenPlan, type Hex } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { LocalMatch, type MatchSnapshot } from '../game/controller.ts';
import type { PlannerState } from '../game/planner.ts';
import type { HighlightKind } from '../render/types.ts';
import { setProfile, toast, useProfile } from '../store.ts';
import { t, tx } from '../i18n.ts';
import { startBotMatch } from '../game/offline.ts';
import { MatchScreen } from './MatchScreen.tsx';
import { Icon } from '../ui/Icon.tsx';

interface Ctx {
  ps: PlannerState;
  snap: MatchSnapshot;
  playing: boolean;
  /** roundSerial when the step started */
  serial0: number;
}

interface Step {
  title: string;
  text: string;
  de: { title: string; text: string };
  /** CSS selector of the interface element to spotlight */
  target?: string;
  /** tiles the coach marks on the board */
  tiles?: Hex[];
  /** the step completes when this returns true; steps without it have a Next button */
  done?: (c: Ctx) => boolean;
  /** shown while the player is on the wrong track */
  hint?: (c: Ctx) => string | null;
}

const vileUid = (c: Ctx) => c.snap.view.units.find((u) => u.owner === 0 && u.defId === TRAINING.main)?.uid;
const dummyUid = (c: Ctx) => c.snap.view.units.find((u) => u.owner === 1 && u.data.tag === 'dummy')?.uid;

const STEPS: Step[] = [
  {
    title: 'Welcome to the lab, Subject',
    text: 'This is the battlefield. Your side glows blue on the left, the Warden’s side orange on the right. Drag to look around, scroll or pinch to zoom. Every round both of you plan in secret, then everything happens at once.',
    de: { title: 'Willkommen im Labor, Proband', text: 'Das ist das Schlachtfeld. Deine Seite leuchtet links blau, die des Wärters rechts orange. Ziehen zum Umsehen, scrollen oder mit zwei Fingern zoomen. Jede Runde plant ihr beide im Geheimen, dann passiert alles gleichzeitig.' },
  },
  {
    title: 'Action Points',
    text: 'Every order costs AP. You get at least 10 per round. AP you don’t spend is gone, but if you spend less than half, you bank an Idle Bonus of +3 to +12 for the next round.',
    de: { title: 'Aktionspunkte', text: 'Jeder Befehl kostet AP. Du bekommst mindestens 10 pro Runde. Nicht ausgegebene AP verfallen, aber wenn du weniger als die Hälfte ausgibst, sparst du einen Leerlauf-Bonus von +3 bis +12 für die nächste Runde an.' },
    target: '.hud-ap',
  },
  {
    title: 'Call a creature',
    text: `Your offered characters wait in the dock. Pick ${CHARACTERS[TRAINING.main]!.name}, the slime reaper.`,
    de: { title: 'Ruf eine Kreatur', text: `Deine angebotenen Charaktere warten im Dock. Wähle ${CHARACTERS[TRAINING.main]!.name}, den Schleim-Sensenmann.` },
    target: '.lockers',
    done: (c) => c.ps.mode.kind === 'deploy' || c.ps.commands.some((x) => x.kind === 'deploy'),
  },
  {
    title: 'Deploy',
    text: 'Creatures enter in your zone. Tap the gold tile: from there the training dummy is in reach next round.',
    de: { title: 'Einsetzen', text: 'Kreaturen betreten das Feld in deiner Zone. Tippe auf das goldene Feld: Von dort ist die Trainingspuppe nächste Runde in Reichweite.' },
    tiles: TRAINING.deployTiles,
    done: (c) => c.ps.commands.some((x) => x.kind === 'deploy' && TRAINING.deployTiles.some((t) => t.c === x.tile.c && t.r === x.tile.r)),
    hint: (c) => (c.ps.commands.some((x) => x.kind === 'deploy') ? 'wrong-tile' : null),
  },
  {
    title: 'Seal your plan',
    text: 'Your plan stays secret until both sides seal it (or the fuse burns down). Press End planning.',
    de: { title: 'Plan versiegeln', text: 'Dein Plan bleibt geheim, bis beide Seiten versiegelt haben (oder die Lunte abbrennt). Drücke „Planung beenden“.' },
    target: '.btn.seal',
    done: (c) => c.snap.roundSerial > c.serial0 && !c.playing,
  },
  {
    title: 'Revealed at once',
    text: 'Deployments resolve first. A creature can’t act in the round it arrives, so this round it only took its place. Now it’s ready.',
    de: { title: 'Gleichzeitig aufgedeckt', text: 'Einsätze werden zuerst aufgelöst. Eine Kreatur kann in der Runde, in der sie ankommt, nicht handeln. Diese Runde hat sie nur ihren Platz eingenommen, jetzt ist sie bereit.' },
  },
  {
    title: 'Select your creature',
    text: `Tap ${CHARACTERS[TRAINING.main]!.name} on the board. Its orders appear in the dossier on the left.`,
    de: { title: 'Wähle deine Kreatur', text: `Tippe ${CHARACTERS[TRAINING.main]!.name} auf dem Feld an. Ihre Befehle erscheinen links im Dossier.` },
    done: (c) => !!c.ps.selected && c.ps.selected === vileUid(c),
  },
  {
    title: 'Move',
    text: 'Press Move, then tap the gold tile next to the dummy. Each tile costs AP; the footprints show your planned path.',
    de: { title: 'Bewegen', text: 'Drücke Bewegen und tippe dann auf das goldene Feld neben der Puppe. Jedes Feld kostet AP; die Fußspuren zeigen deinen geplanten Weg.' },
    target: '.left .cmd',
    tiles: [{ c: 6, r: 4 }],
    done: (c) => c.ps.commands.some((x) => x.kind === 'move'),
  },
  {
    title: 'Attack',
    text: 'Now choose Reaper’s Slash and tap the training dummy, then aim at the creature (the attack follows it if it moves). Range 1: your planned position counts, so the attack comes after the move.',
    de: { title: 'Angreifen', text: 'Wähle jetzt Reaper’s Slash, tippe auf die Trainingspuppe und ziele auf die Kreatur (der Angriff folgt ihr, wenn sie sich bewegt). Reichweite 1: Deine geplante Position zählt, der Angriff kommt also nach der Bewegung.' },
    target: '.left .cmd',
    done: (c) => c.ps.commands.some((x) => x.kind === 'attack' && 'target' in x && x.target.unit === dummyUid(c)),
  },
  {
    title: 'Action order',
    text: 'The order list shows when each action happens: higher Priority first, then higher Speed. The enemy’s order stays hidden.',
    de: { title: 'Aktionsreihenfolge', text: 'Die Liste zeigt, wann jede Aktion passiert: höhere Priorität zuerst, dann höheres Tempo. Die Reihenfolge des Gegners bleibt verborgen.' },
    target: '.right',
  },
  {
    title: 'Play an item card',
    text: 'Item cards change the round. Tap Whetstone in your hand: it attaches to your attack for +15% Power.',
    de: { title: 'Eine Gegenstandskarte spielen', text: 'Gegenstandskarten verändern die Runde. Tippe in deiner Hand auf Whetstone: Sie hängt sich an deinen Angriff, +15 % Stärke.' },
    target: '.hand',
    done: (c) => c.ps.commands.some((x) => (x.kind === 'attack' && !!x.item) || x.kind === 'item'),
  },
  {
    title: 'Seal and watch',
    text: 'Seal the plan and watch the round resolve: the move, then the slash.',
    de: { title: 'Versiegeln und zusehen', text: 'Versiegle den Plan und sieh zu, wie die Runde aufgelöst wird: erst die Bewegung, dann der Hieb.' },
    target: '.btn.seal',
    done: (c) => c.snap.roundSerial > c.serial0 && !c.playing,
  },
  {
    title: 'Victory Points',
    text: 'You win at 100 VP. Damage and KOs score, so do the golden Control Field (+3 VP each round you hold it alone) and other lab objectives. A side without creatures pays the other 3 VP every round.',
    de: { title: 'Siegpunkte', text: 'Bei 100 Siegpunkten gewinnst du. Schaden und K.o.s zählen, ebenso das goldene Kontrollfeld (+3 pro Runde, solange du es allein hältst) und andere Laborziele. Eine Seite ohne Kreaturen zahlt der anderen jede Runde 3 Punkte.' },
    target: '.hud-score',
    tiles: [TRAINING.control],
  },
  {
    title: 'You’re ready',
    text: 'That’s the core loop: deploy, move, attack, play cards, seal. Every creature has its own Testing Chamber to learn its tricks. Keep beating on the Warden here, or start a real match.',
    de: { title: 'Du bist bereit', text: 'Das ist der Kern: einsetzen, bewegen, angreifen, Karten spielen, versiegeln. Jede Kreatur hat ihren eigenen Prüfstand mit ihren Tricks. Mach hier mit dem Wärter weiter oder starte ein echtes Match.' },
  },
];

function useRect(selector: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((old) => (r && old && Math.abs(old.x - r.x) < 0.5 && Math.abs(old.y - r.y) < 0.5 && Math.abs(old.width - r.width) < 0.5 && Math.abs(old.height - r.height) < 0.5 ? old : r && r.width > 0 ? r : null));
      raf = window.setTimeout(tick, 250);
    };
    tick();
    return () => clearTimeout(raf);
  }, [selector]);
  return rect;
}

export function BasicTraining({ nav }: { nav: Nav }) {
  const ctrl = useMemo(() => new LocalMatch({ seed: 11, settings: { mode: 'contamination', planningSeconds: 0, friendly: true, zone: 'laboratory', maxRounds: 60 }, players: [] as never, existing: createTraining(), opponent: trainingWardenPlan, planningSeconds: 0 }), []);
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const serial0 = useRef(0);
  const reduce = useReducedMotion();
  const de = useProfile().settings.lang === 'de';
  const s = STEPS[step];

  const onPlanner = useCallback((ps: PlannerState, snap: MatchSnapshot, playing: boolean) => setCtx({ ps, snap, playing, serial0: serial0.current }), []);

  // a step that is done moves on by itself (after a short beat so the player sees it worked)
  const done = !!(s?.done && ctx && s.done({ ...ctx, serial0: serial0.current }));
  useEffect(() => {
    if (!done) return;
    const h = setTimeout(() => advance(), 650);
    return () => clearTimeout(h);
  });

  const advance = () => {
    serial0.current = ctx?.snap.roundSerial ?? 0;
    setStep((n) => Math.min(STEPS.length, n + 1));
  };

  const finish = (then: 'stay' | 'match' | 'menu') => {
    setProfile((p) => ({ ...p, onboarded: true, trainingDone: true, collection: { ...p.collection, gold: p.collection.gold + (p.trainingDone ? 0 : 200) } }));
    toast(t('Basic Training complete · +200 gold'), 'good');
    if (then === 'match') nav({ name: 'match', ctrl: startBotMatch({ difficulty: 'easy' }) });
    else if (then === 'menu') nav({ name: 'menu' });
    else setStep(STEPS.length);
  };

  const coachTiles = useMemo(() => {
    const m = new Map<string, HighlightKind>();
    for (const t of s?.tiles ?? []) m.set(key(t), 'target');
    return m;
  }, [s]);
  const rect = useRect(s?.target);
  const hint = s?.hint && ctx ? s.hint({ ...ctx, serial0: serial0.current }) : null;
  const last = step === STEPS.length - 1;

  return (
    <>
      <MatchScreen ctrl={ctrl} onExit={() => nav({ name: 'menu' })} onPlanner={onPlanner} coachTiles={coachTiles} />
      {s && rect && <div className="coach-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden />}
      <AnimatePresence mode="wait">
        {s && !(ctx?.playing ?? false) && (
          <motion.aside
            key={step}
            className="coach"
            role="dialog"
            aria-live="polite"
            aria-label={`Basic Training, step ${step + 1} of ${STEPS.length}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: -0.6 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <div className="coach-head">
              <span className="coach-step">
                {step + 1}/{STEPS.length}
              </span>
              <b>{tx(s.title, s.de.title)}</b>
            </div>
            <p>{tx(s.text, s.de.text)}</p>
            {hint && <p className="coach-hint">{tx('For this lesson use a gold tile: remove the deployment in your plan list (✕) and try again.', 'Nimm für diese Lektion ein goldenes Feld: Entferne den Einsatz in deiner Planliste (✕) und versuche es erneut.')}</p>}
            <div className="coach-dots" aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <button className="coach-skip" onClick={() => finish('menu')}>
                {t('Skip training')}
              </button>
              {last ? (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn secondary small" onClick={() => finish('stay')}>
                    {t('Keep playing')}
                  </button>
                  <button className="btn primary small" onClick={() => finish('match')}>
                    {t('Real match')}
                  </button>
                </div>
              ) : s.done ? (
                <span className={`coach-wait${done ? ' ok' : ''}`}>{done ? (
            <>
              <Icon name="ui/check" size={18} /> {t('Nicely done')}
            </>
          ) : (
            t('Your move…')
          )}</span>
              ) : (
                <button className="btn primary small" onClick={advance}>
                  {t('Next')}
                </button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
