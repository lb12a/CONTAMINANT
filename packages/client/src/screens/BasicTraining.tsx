// Basic Training: the first match, guided step by step. The coach never plays for you: each step
// waits until you have done it yourself (picked a card, deployed, moved, attacked, sealed the plan).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CHARACTERS, createTraining, key, TRAINING, trainingWardenPlan, type Hex } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { LocalMatch, type MatchSnapshot } from '../game/controller.ts';
import type { PlannerState } from '../game/planner.ts';
import type { HighlightKind } from '../render/types.ts';
import { setProfile, toast } from '../store.ts';
import { startBotMatch } from '../game/offline.ts';
import { MatchScreen } from './MatchScreen.tsx';

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
  },
  {
    title: 'Action Points',
    text: 'Every order costs AP. You get at least 10 per round. AP you don’t spend is gone, but if you spend less than half, you bank an Idle Bonus of +3 to +12 for the next round.',
    target: '.hud-ap',
  },
  {
    title: 'Call a creature',
    text: `Your offered characters wait in the dock. Pick ${CHARACTERS[TRAINING.main]!.name}, the slime reaper.`,
    target: '.lockers',
    done: (c) => c.ps.mode.kind === 'deploy' || c.ps.commands.some((x) => x.kind === 'deploy'),
  },
  {
    title: 'Deploy',
    text: 'Creatures enter in your zone. Tap the gold tile: from there the training dummy is in reach next round.',
    tiles: TRAINING.deployTiles,
    done: (c) => c.ps.commands.some((x) => x.kind === 'deploy' && TRAINING.deployTiles.some((t) => t.c === x.tile.c && t.r === x.tile.r)),
    hint: (c) => (c.ps.commands.some((x) => x.kind === 'deploy') ? 'For this lesson use a gold tile: remove the deployment in your plan list (✕) and try again.' : null),
  },
  {
    title: 'Seal your plan',
    text: 'Your plan stays secret until both sides seal it (or the fuse burns down). Press End planning.',
    target: '.btn.seal',
    done: (c) => c.snap.roundSerial > c.serial0 && !c.playing,
  },
  {
    title: 'Revealed at once',
    text: 'Deployments resolve first. A creature can’t act in the round it arrives, so this round it only took its place. Now it’s ready.',
  },
  {
    title: 'Select your creature',
    text: `Tap ${CHARACTERS[TRAINING.main]!.name} on the board. Its orders appear in the dossier on the left.`,
    done: (c) => !!c.ps.selected && c.ps.selected === vileUid(c),
  },
  {
    title: 'Move',
    text: 'Press Move, then tap the gold tile next to the dummy. Each tile costs AP; the footprints show your planned path.',
    target: '.left .cmd',
    tiles: [{ c: 6, r: 4 }],
    done: (c) => c.ps.commands.some((x) => x.kind === 'move'),
  },
  {
    title: 'Attack',
    text: 'Now choose Reaper’s Slash and tap the training dummy. Range 1: your planned position counts, so the attack comes after the move.',
    target: '.left .cmd',
    done: (c) => c.ps.commands.some((x) => x.kind === 'attack' && 'target' in x && x.target.unit === dummyUid(c)),
  },
  {
    title: 'Action order',
    text: 'The order list shows when each action happens: higher Priority first, then higher Speed. The enemy’s order stays hidden.',
    target: '.right',
  },
  {
    title: 'Play an item card',
    text: 'Item cards change the round. Tap Whetstone in your hand: it attaches to your attack for +15% Power.',
    target: '.hand',
    done: (c) => c.ps.commands.some((x) => (x.kind === 'attack' && !!x.item) || x.kind === 'item'),
  },
  {
    title: 'Seal and watch',
    text: 'Seal the plan and watch the round resolve: the move, then the slash.',
    target: '.btn.seal',
    done: (c) => c.snap.roundSerial > c.serial0 && !c.playing,
  },
  {
    title: 'Victory Points',
    text: 'You win at 100 VP. Damage and KOs score, so do the golden Control Field (+3 VP each round you hold it alone) and other lab objectives. A side without creatures pays the other 3 VP every round.',
    target: '.hud-score',
    tiles: [TRAINING.control],
  },
  {
    title: 'You’re ready',
    text: 'That’s the core loop: deploy, move, attack, play cards, seal. Every creature has its own Testing Chamber to learn its tricks. Keep beating on the Warden here, or start a real match.',
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
    toast('Basic Training complete · +200 gold', 'good');
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
              <b>{s.title}</b>
            </div>
            <p>{s.text}</p>
            {hint && <p className="coach-hint">{hint}</p>}
            <div className="coach-dots" aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <button className="coach-skip" onClick={() => finish('menu')}>
                Skip training
              </button>
              {last ? (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn secondary small" onClick={() => finish('stay')}>
                    Keep playing
                  </button>
                  <button className="btn primary small" onClick={() => finish('match')}>
                    Real match
                  </button>
                </div>
              ) : s.done ? (
                <span className={`coach-wait${done ? ' ok' : ''}`}>{done ? '✔ Nicely done' : 'Your move…'}</span>
              ) : (
                <button className="btn primary small" onClick={advance}>
                  Next
                </button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
