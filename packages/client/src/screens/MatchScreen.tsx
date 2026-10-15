import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTERS,
  ITEMS,
  MODE_TARGET,
  STATUSES,
  attackDefFor,
  distance,
  hasStatus,
  isImmediateItem,
  type GameEvent,
  type GameState,
  type Hex,
  type PlayerId,
  type Unit,
} from '@contaminant/engine';
import { BoardCanvas } from '../render/BoardCanvas.tsx';
import type { DioramaRenderer } from '../render/diorama.ts';
import type { Floater, Flash, HighlightKind, Insets, Overlay, Pulse, Vfx } from '../render/types.ts';
import { toBeats, type Beat } from '../game/beats.ts';
import { aimAttack, computeOverlay, emptyPlanner, needsAimChoice, plannedPos, tapTile, toPlan, unitActions, commandLabel, type PlannerState } from '../game/planner.ts';
import type { MatchController, MatchSnapshot } from '../game/controller.ts';
import { ApBattery, CharTraits, Fuse, HpBar, IdleSteps, ItemCard, Modal, StatusChips, VpRace, secondsLeft } from '../ui/components.tsx';
import { figureCanvas, lookKey, portraitUrl } from '../render/art.ts';
import { TAG_COLOR } from '../ui/glyphs.ts';
import { Icon } from '../ui/Icon.tsx';
import { t } from '../i18n.ts';
import { getProfile, toast } from '../store.ts';
import { sfx } from '../audio.ts';

interface Props {
  ctrl: MatchController;
  onExit: (summary: { won: boolean | null; snap: MatchSnapshot; log: string[] }) => void;
  tutorialPanel?: React.ReactNode;
  hideHand?: boolean;
  /** Basic Training: the coach follows the planner and marks tiles */
  onPlanner?: (ps: PlannerState, snap: MatchSnapshot, playing: boolean) => void;
  coachTiles?: Map<string, HighlightKind>;
}

const EVENT_DELAY = 280;

export function MatchScreen({ ctrl, onExit, tutorialPanel, hideHand, onPlanner, coachTiles }: Props) {
  const [snap, setSnap] = useState<MatchSnapshot>(ctrl.snapshot());
  const [ps, setPs] = useState<PlannerState>(emptyPlanner());
  const [hover, setHover] = useState<Hex | null>(null);
  const [display, setDisplay] = useState<GameState>(snap.view);
  const [play, setPlay] = useState<Partial<Overlay> & { arrived?: Unit[]; vpLive?: [number, number] }>({});
  const [caption, setCaption] = useState<{ index: number; total: number; beat: Beat } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<{ text: string; kind: string }[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [popups, setPopups] = useState<number>(0);
  const [showLeft, setShowLeft] = useState(false);
  /** phones show one dock row at a time: the offered creatures or the hand */
  const [dockTab, setDockTab] = useState<'chars' | 'hand'>('chars');
  const [showRight, setShowRight] = useState(false);
  const [ready, setReady] = useState(false);
  const [moodFor, setMoodFor] = useState<string | null>(null);
  const skipRef = useRef(false);
  const lastSerial = useRef(0);
  const me = snap.info.you;
  const enemy: PlayerId = me === 0 ? 1 : 0;
  const view = snap.view;

  useEffect(() => ctrl.subscribe(setSnap), [ctrl]);
  useEffect(() => () => ctrl.dispose(), [ctrl]);

  // ---------------------------------------------------------------- playback of a resolved round
  // Every action is its own short scene ("beat"): a caption says what happens, the creature walks
  // tile by tile or lunges, a projectile or slash flies, then damage, statuses and knock-outs land.
  useEffect(() => {
    if (snap.roundSerial === lastSerial.current) {
      if (!playing) setDisplay(snap.view);
      return;
    }
    lastSerial.current = snap.roundSerial;
    const events = snap.roundEvents;
    setPs(emptyPlanner());
    setReady(false);
    const base = snap.prevView ?? snap.view;
    const final = snap.view;
    setDisplay(base);
    const pos = new Map<string, Hex>();
    const hp = new Map<string, number>();
    const gone = new Set<string>();
    const floaters: Floater[] = [];
    const flashes: Flash[] = [];
    const tombs: Hex[] = [];
    const pulses: Pulse[] = [];
    const vfx: Vfx[] = [];
    const arrived: Unit[] = [];
    const vpLive: [number, number] = [base.players[0].vp, base.players[1].vp];
    const unitOf = (uid?: string) => (uid ? base.units.find((u) => u.uid === uid) ?? arrived.find((u) => u.uid === uid) ?? final.units.find((u) => u.uid === uid) : undefined);
    const unitPos = (uid?: string) => (uid ? pos.get(uid) ?? unitOf(uid)?.pos : undefined);
    let cancelled = false;
    skipRef.current = false;
    setPlaying(true);
    setBanner(t('Resolution'));
    sfx('resolve');
    const speed = getProfile().settings.animSpeed || 1;
    const wait = (ms: number) => (skipRef.current || cancelled ? Promise.resolve() : sleep(ms / speed));
    const beats = toBeats(events, base, final);
    const show = () =>
      setPlay({
        pos: new Map(pos),
        hp: new Map(hp),
        gone: new Set(gone),
        floaters: floaters.slice(-30),
        flashes: flashes.slice(-20),
        pulses: pulses.slice(-30),
        vfx: vfx.slice(-12),
        tombs: [...tombs],
        arrived: [...arrived],
        vpLive: [...vpLive] as [number, number],
      });
    const consequence = async (e: GameEvent) => {
      const now = performance.now();
      const at = unitPos(e.target) ?? e.to ?? unitPos(e.actor);
      switch (e.kind) {
        case 'damage':
          if (e.target && e.amount) {
            const u = unitOf(e.target);
            if (u) hp.set(u.uid, Math.max(0, (hp.get(u.uid) ?? u.hp) - e.amount));
            if (at) floaters.push({ h: at, text: `-${e.amount}`, color: '#ff5a5a', t0: now, big: e.amount >= 60 });
            pulses.push({ uid: e.target, kind: 'hit', t0: now });
            sfx('hit');
            show();
            await wait(260);
          }
          break;
        case 'heal':
          if (e.target && e.amount) {
            const u = unitOf(e.target);
            if (u) hp.set(u.uid, Math.min(u.maxHp, (hp.get(u.uid) ?? u.hp) + e.amount));
            if (at) floaters.push({ h: at, text: `+${e.amount}`, color: '#8CFF5A', t0: now });
            pulses.push({ uid: e.target, kind: 'heal', t0: now });
            show();
            await wait(260);
          }
          break;
        case 'miss':
          if (at) floaters.push({ h: at, text: t('miss'), color: '#e8dfc8', t0: now });
          sfx('miss');
          show();
          await wait(260);
          break;
        case 'crit':
          if (at) flashes.push({ tiles: [at], color: 'rgba(255,207,58,0.8)', t0: now, dur: 450 });
          if (at) floaters.push({ h: at, text: t('CRIT'), color: '#D9A93A', t0: now, big: true });
          if (e.target) pulses.push({ uid: e.target, kind: 'crit', t0: now });
          sfx('crit');
          show();
          await wait(200);
          break;
        case 'status':
          if (at && e.status && !e.text.includes('loses') && !e.text.includes('immune')) {
            floaters.push({ h: at, text: STATUSES[e.status]?.name ?? e.status, color: STATUSES[e.status]?.kind === 'buff' ? '#8CFF5A' : '#e8dfc8', t0: now });
            show();
            await wait(200);
          }
          break;
        case 'ko':
          await wait(250);
          if (e.target) gone.add(e.target);
          if (e.to) tombs.push(e.to);
          if (e.to) floaters.push({ h: e.to, text: t('KO'), color: '#ff2b3a', t0: performance.now(), big: true });
          sfx('ko');
          show();
          await wait(450);
          break;
        case 'field':
          if (e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(255,154,31,0.45)', t0: now, dur: 800 });
          show();
          await wait(200);
          break;
        case 'trap':
          if (at) flashes.push({ tiles: [at], color: 'rgba(194,43,51,0.8)', t0: now, dur: 600 });
          show();
          await wait(250);
          break;
        case 'vp':
          if (e.owner !== undefined && e.amount) {
            vpLive[e.owner] += e.amount;
            show();
            await wait(250);
          }
          break;
        default:
          break;
      }
    };
    (async () => {
      await wait(900);
      const newLog: { text: string; kind: string }[] = [];
      for (const [bi, beat] of beats.entries()) {
        if (cancelled) return;
        for (const e of beat.events) newLog.push({ text: e.text, kind: e.kind });
        if (!skipRef.current) setCaption({ index: bi + 1, total: beats.length, beat });
        const e = beat.start;
        const now = performance.now();
        switch (beat.kind) {
          case 'deploy': {
            const u = final.units.find((x) => x.uid === e.actor) ?? unitOf(e.actor);
            if (u && !arrived.some((x) => x.uid === u.uid) && !base.units.some((x) => x.uid === u.uid)) arrived.push(structuredClone(u));
            if (e.to) flashes.push({ tiles: [e.to], color: 'rgba(140,255,90,0.6)', t0: now, dur: 800 });
            if (e.privateTo === me) setPopups((n) => n + 1);
            sfx('deploy');
            show();
            await wait(900);
            break;
          }
          case 'move': {
            const path = e.tiles ?? (e.to ? [e.to] : []);
            for (const tile of path.slice(1)) {
              if (e.actor) pos.set(e.actor, tile);
              if (e.target && !e.actor) pos.set(e.target, tile);
              sfx('step');
              show();
              await wait(300);
            }
            if (e.actor && e.to) pos.set(e.actor, e.to);
            show();
            await wait(250);
            break;
          }
          case 'attack': {
            const from = unitPos(e.actor);
            const firstHit = beat.events.find((x) => x.kind === 'damage' || x.kind === 'miss' || x.kind === 'heal');
            const to = e.to ?? unitPos(firstHit?.target) ?? e.tiles?.[0];
            const tag = beat.events.find((x) => x.tag)?.tag;
            if (e.actor && to) pulses.push({ uid: e.actor, kind: 'lunge', to, t0: now });
            if (from && to) vfx.push({ kind: distance(from, to) > 1 ? (tag === 'electric' ? 'beam' : 'projectile') : 'slash', from, to, color: TAG_COLOR[tag ?? 'slash'] ?? '#ffcf6a', t0: now, dur: distance(from, to) > 1 ? 420 : 320 });
            if (e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(255,90,90,0.45)', t0: now, dur: 600 });
            show();
            await wait(distance(from ?? to ?? { c: 0, r: 0 }, to ?? from ?? { c: 0, r: 0 }) > 1 ? 450 : 350);
            for (const c of beat.events.slice(1)) await consequence(c);
            await wait(650);
            break;
          }
          default: {
            const at = unitPos(e.target) ?? e.to ?? unitPos(e.actor);
            if (e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(180,140,255,0.45)', t0: now, dur: 700 });
            else if (at && beat.kind !== 'score') vfx.push({ kind: 'burst', from: at, to: at, color: '#b48cff', t0: now, dur: 500 });
            show();
            await wait(beat.kind === 'score' ? 200 : 350);
            for (const c of beat.kind === 'score' ? beat.events : beat.events.slice(1)) await consequence(c);
            await wait(beat.kind === 'score' ? 500 : 550);
          }
        }
      }
      if (cancelled) return;
      await wait(400);
      setCaption(null);
      setLog((l) => [...l, ...newLog].slice(-400));
      setPlay({});
      setDisplay(snap.view);
      setPlaying(false);
      setBanner(snap.ended ? null : `${t('Round')} ${snap.view.round} — ${t('Planning')}`);
      if (snap.view.round % 5 === 0 && !snap.ended) setTimeout(() => setBanner(t('Full Moon')), 1700);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.roundSerial]);

  const boardRef = useRef<HTMLDivElement>(null);
  // creatures deployed this round appear on the board when their deployment beat plays
  const boardState = useMemo(
    () => (play.arrived?.length ? { ...display, units: [...display.units, ...play.arrived.filter((a) => !display.units.some((u) => u.uid === a.uid))] } : display),
    [display, play.arrived],
  );
  const vpOf = (p: PlayerId) => (playing && play.vpLive ? play.vpLive[p] : display.players[p].vp);
  const [renderer, setRenderer] = useState<DioramaRenderer | null>(null);
  const insets = useBoardInsets();

  useEffect(() => {
    if (snap.ended) sfx(snap.ended.winner === me ? 'win' : 'lose');
  }, [snap.ended, me]);

  // ---------------------------------------------------------------- planning
  const pv = useMemo(() => computeOverlay(view, me, ps, hover), [view, me, ps, hover]);
  const overlay: Overlay = useMemo(() => {
    if (playing) return { highlights: new Map(), paths: [], targets: [], ghosts: [], ...play };
    if (!coachTiles?.size) return pv.overlay;
    return { ...pv.overlay, highlights: new Map([...pv.overlay.highlights, ...coachTiles]) };
  }, [playing, play, pv.overlay, coachTiles]);
  useEffect(() => onPlanner?.(ps, snap, playing), [ps, snap, playing, onPlanner]);
  const selected = view.units.find((u) => u.uid === ps.selected);

  const submit = useCallback(
    (final: boolean) => {
      ctrl.submit(toPlan(ps, me), final);
      if (final) {
        setReady(true);
        sfx('seal');
      }
    },
    [ctrl, ps, me],
  );

  // keep the server informed of the current draft (non-final) so a timeout still uses it
  useEffect(() => {
    if (playing || snap.ended || ready) return;
    const h = setTimeout(() => ctrl.submit(toPlan(ps, me), false), 400);
    return () => clearTimeout(h);
  }, [ps, playing, snap.ended, ready, ctrl, me]);

  const [aim, setAim] = useState<{ h: Hex; unit: Unit } | null>(null);
  const onTile = useCallback(
    (h: Hex) => {
      if (playing || ready || snap.ended) return;
      const ambiguous = needsAimChoice(view, ps, h);
      if (ambiguous) {
        setAim({ h, unit: ambiguous });
        return;
      }
      setPs((cur) => {
        const r = tapTile(view, me, cur, h);
        if (r.msg) toast(r.msg);
        if (r.ps.commands.length !== cur.commands.length) sfx('click');
        const last = r.ps.commands.at(-1);
        if (last && last !== cur.commands.at(-1) && last.kind === 'deploy') {
          const def = CHARACTERS[view.players[me].cards.find((c) => c.uid === last.card)?.defId ?? ''];
          if (def?.id === 'pokerface') setMoodFor(last.card);
        }
        if (r.ps.selected && r.ps.selected !== cur.selected) setShowLeft(true);
        return r.ps;
      });
    },
    [view, me, playing, ready, snap.ended, ps],
  );

  const setMode = (mode: PlannerState['mode']) => setPs((p) => ({ ...p, mode }));
  const removeCmd = (i: number) => setPs((p) => ({ ...p, commands: p.commands.filter((_, j) => j !== i), mode: { kind: 'idle' } }));
  const toggleRest = (uid: string) => setPs((p) => ({ ...p, rest: p.rest.includes(uid) ? p.rest.filter((x) => x !== uid) : [...p.rest, uid] }));

  const myUnits = view.units.filter((u) => u.owner === me && !u.isObject);
  const pl = view.players[me];
  const target = MODE_TARGET[view.settings.mode] ?? 100;
  const tsecs = secondsLeft(snap.deadline);
  const handCards = pl.hand;
  const offered = pl.offered;

  const onHandCard = async (uid: string) => {
    const card = handCards.find((c) => c.uid === uid);
    const it = card ? ITEMS[card.itemId] : undefined;
    if (!card || !it || playing || ready) return;
    if (card.tarnished) return toast('Tarnished cards cannot be played', 'bad');
    if (ps.commands.some((c) => (c.kind === 'item' && c.card === uid) || ((c.kind === 'attack' || c.kind === 'ability') && c.item === uid))) {
      setPs((p) => ({ ...p, commands: p.commands.map((c) => ((c.kind === 'attack' || c.kind === 'ability') && c.item === uid ? { ...c, item: undefined } : c)).filter((c) => !(c.kind === 'item' && c.card === uid)) }));
      return;
    }
    if (isImmediateItem(it.id)) {
      const other = handCards.find((c) => c.uid !== uid && !c.tarnished);
      const choice = it.id === 'reroll_ticket' ? other?.uid : undefined;
      const r = await ctrl.op({ kind: 'immediate', card: uid, choice });
      if (!r.ok) toast(r.error ?? 'Cannot play', 'bad');
      else toast(`${it.name} played`, 'good');
      return;
    }
    if (it.type === 'attack' || (it.type === 'ability' && it.id !== 'time_dilation_bottle')) {
      // attach to the last matching command
      const idx = [...ps.commands].reverse().findIndex((c) => (it.type === 'attack' ? c.kind === 'attack' : c.kind === 'ability' || c.kind === 'attack') && !(c as { item?: string }).item);
      if (idx < 0) return toast(`Plan an ${it.type === 'attack' ? 'Attack' : 'Ability'} first, then attach ${it.name}`, 'info');
      const real = ps.commands.length - 1 - idx;
      setPs((p) => ({ ...p, commands: p.commands.map((c, j) => (j === real ? { ...c, item: uid } as typeof c : c)) }));
      toast(`${it.name} attached to ${commandLabel(view, ps.commands[real]!)}`, 'good');
      return;
    }
    if (it.targeting === 'none' || it.targeting === 'choice') {
      setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'item', card: uid, target: it.targeting === 'choice' ? { choice: 'field' } : {} }] }));
      return;
    }
    setMode({ kind: 'item', card: uid });
    toast(`Choose a ${it.targeting === 'tile' || it.targeting === 'trap-tile' ? 'tile' : 'unit'} for ${it.name}`);
  };

  const attachedCards = new Set(ps.commands.flatMap((c) => (c.kind === 'item' ? [c.card] : (c.kind === 'attack' || c.kind === 'ability') && c.item ? [c.item] : [])));
  const deployingCards = new Set(ps.commands.flatMap((c) => (c.kind === 'deploy' ? [c.card] : [])));

  // ---------------------------------------------------------------- render
  return (
    <div className={`match${showLeft ? ' show-left' : ''}${showRight ? ' show-right' : ''}`}>
      {/* HUD: AP · scoreboard · actions */}
      <div className="hud">
        <div className="hud-ap panel" title={`${pv.apLeft} AP left of ${pl.ap} · planned ${pv.cost}`}>
          <div className="ap-top">
            <div className="ap-num">
              <b className="num">{pv.apLeft}</b>
              <span className="num">/{pl.ap}</span>
              <small>{t('AP')}</small>
            </div>
            <div className="row small muted" style={{ gap: 6 }} title={t('Idle Bonus: spend less than half your AP to bank extra AP next round')}>
              <IdleSteps bonus={pl.idleBonus} />
              <span>+{pl.idleBonus}</span>
            </div>
          </div>
          <ApBattery ap={pl.ap} planned={Math.min(pl.ap, pv.cost)} idle={0} />
        </div>
        <div className="hud-score panel">
          <div className="score-row">
            <span className="side me">
              <b className="vp num">{vpOf(me)}</b>
              <span className="nm">{snap.info.names[me]}</span>
            </span>
            <span className="round">
              {t('Round')} {view.round}
            </span>
            <span className="side foe">
              <span className="nm">{snap.info.names[enemy]}</span>
              <b className="vp num">{vpOf(enemy)}</b>
            </span>
          </div>
          <VpRace me={vpOf(me)} them={vpOf(enemy)} target={target === Infinity ? 100 : target} />
          <div className="score-meta">
            <span className="mode">
              {view.settings.mode[0]!.toUpperCase() + view.settings.mode.slice(1)} · first to {target === Infinity ? '∞' : target}
            </span>
            <div className="grow">
              <Fuse deadline={playing ? 0 : snap.deadline} total={snap.info.planningSeconds || 30} />
            </div>
            <span className="num">{snap.deadline && !playing ? `${tsecs}s` : playing ? '…' : '∞'}</span>
            {snap.opponentReady && !playing && <span className="chip buff" title={t('Your opponent has sealed their plan')}>{t('rival sealed')}</span>}
          </div>
        </div>
        <div className="hud-actions">
          <button className="icon-btn glass menu-burger" onClick={() => setShowLeft((v) => !v)} title={t('Units and plan')} aria-label={t('Units and plan')}>
            <Icon name="ui/pawn" size={24} />
          </button>
          <button className="icon-btn glass" onClick={() => setShowRight((v) => !v)} title={t('Combat log')} aria-label={t('Combat log')}>
            <Icon name="ui/journal" size={24} />
          </button>
          {playing ? (
            <button className="btn secondary" onClick={() => (skipRef.current = true)}>
              {t('Skip')}
            </button>
          ) : (
            <button className={`btn seal${ready ? ' active' : ''}`} disabled={!!snap.ended} onClick={() => (ready ? setReady(false) : submit(true))} title={pv.issues.join('\n') || 'Lock in your plan for this round'}>
              {ready ? t('Sealed') : t('End planning')}
            </button>
          )}
        </div>
      </div>
      {caption && playing && <BeatCaption {...caption} me={me} />}
      {pv.issues.length > 0 && !playing && (
        <div className="panel small" style={{ position: 'absolute', top: 112, left: '50%', transform: 'translateX(-50%)', zIndex: 13, color: '#ffb0b4', padding: '4px 12px' }}>
          <Icon name="ui/warning" size={16} /> {pv.issues[0]}
        </div>
      )}

      {/* LEFT: unit panel */}
      <div className={`left panel${!tutorialPanel && !selected && myUnits.length === 0 && ps.commands.length === 0 ? ' empty' : ''}`}>
        {tutorialPanel}
        {selected ? (
          <UnitPanel view={view} me={me} u={selected} ps={ps} setPs={setPs} setMode={setMode} toggleRest={toggleRest} removeCmd={removeCmd} handCards={handCards} />
        ) : (
          <div className="col">
            <h3>{t('Your units')}</h3>
            {myUnits.length === 0 && <p className="muted small">{t('No characters on the board. Deploy from the offered characters below.')}</p>}
            {myUnits.map((u) => (
              <button key={u.uid} className="btn secondary small" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setPs((p) => ({ ...p, selected: u.uid, mode: { kind: 'idle' } }))}>
                {u.name} · {u.hp}/{u.maxHp}
              </button>
            ))}
          </div>
        )}
        <div className="col" style={{ marginTop: 10 }}>
          <h3>Plan · {pv.cost} AP</h3>
          {ps.commands.length === 0 && <span className="muted small">{t('Nothing planned. Spending less than 50% of your AP builds the Idle Bonus.')}</span>}
          {ps.commands.map((c, i) => (
            <div key={i} className="row small" style={{ justifyContent: 'space-between', background: '#ffffff08', borderRadius: 6, padding: '3px 6px' }}>
              <span>
                {'unit' in c ? `${view.units.find((u) => u.uid === c.unit)?.name ?? ''}: ` : ''}
                {commandLabel(view, c)}
                {(c.kind === 'attack' || c.kind === 'ability') && c.item ? ` + ${ITEMS[handCards.find((h) => h.uid === c.item)?.itemId ?? '']?.name ?? 'card'}` : ''}
              </span>
              {c.kind === 'deploy' && pl.cards.find((x) => x.uid === c.card)?.defId === 'nexus' && (
                <button
                  className="btn secondary small"
                  disabled={(ps.deployChoices[c.card]?.rerolls ?? 0) >= 3}
                  title={t('Corrupt: the three magenta tiles are corrupted when Nexus arrives (hidden from the enemy). Re-roll them up to 3 times this round.')}
                  onClick={() => setPs((p) => ({ ...p, deployChoices: { ...p.deployChoices, [c.card]: { ...p.deployChoices[c.card], rerolls: Math.min(3, (p.deployChoices[c.card]?.rerolls ?? 0) + 1) } } }))}
                >
                  Re-roll tiles {3 - (ps.deployChoices[c.card]?.rerolls ?? 0)}/3
                </button>
              )}
              <button className="icon-btn" style={{ width: 26, height: 26, fontSize: 12 }} onClick={() => removeCmd(i)} aria-label={t('remove')}>
                ✕
              </button>
            </div>
          ))}
          {ps.commands.length > 0 && (
            <button className="btn secondary small" onClick={() => setPs(emptyPlanner())}>
              {t('Clear plan')}
            </button>
          )}
        </div>
      </div>

      {/* BOARD */}
      <div className="board" ref={boardRef}>
        <BoardCanvas state={boardState} me={me} overlay={overlay} insets={insets} onTile={onTile} onHover={setHover} onContext={() => setMode({ kind: 'idle' })} onRenderer={setRenderer} />
        {banner && (
          <div key={banner + view.round} className="banner" onAnimationEnd={() => setBanner(null)}>
            {banner}
          </div>
        )}
        {popups > 0 && (
          <div key={popups} className="popup-enemy" onAnimationEnd={() => setPopups(0)}>
            <Icon name="ui/question" size={20} /> {popups > 1 ? `${popups}× ` : ''}Enemy deploys a character!
          </div>
        )}
        {hover && !playing && <HoverInfo view={view} h={hover} me={me} at={renderer?.screenOf(hover)} />}
        {snap.watch && (
          <div className="panel small" style={{ position: 'absolute', right: 10, bottom: 200, maxWidth: 260, zIndex: 12 }}>
            <Icon name="ui/eye" size={16} /> Watchful Eye: {view.units.find((u) => u.uid === snap.watch!.unit)?.name} plans {snap.watch.commands.length} command(s):{' '}
            {(snap.watch.commands as { kind: string }[]).map((c) => c.kind).join(', ') || 'nothing'}
          </div>
        )}
      </div>
      {aim && !playing && (
        <AimChooser
          at={renderer?.screenOf(aim.h)}
          unit={aim.unit}
          enemy={aim.unit.owner !== me}
          onPick={(which) => {
            setPs((p) => aimAttack(p, which === 'unit' ? { unit: aim.unit.uid } : { tile: aim.h }));
            setAim(null);
            sfx('click');
          }}
          onCancel={() => setAim(null)}
        />
      )}
      {ps.mode.kind !== 'idle' && !playing && (
        <div className="panel mode-hint">
          <span>{modeHint(view, ps)}</span>
          <button className="btn secondary small" onClick={() => setMode({ kind: 'idle' })}>
            {t('Cancel')}
          </button>
        </div>
      )}

      {/* RIGHT: action order (while planning) + combat log drawer */}
      <div className="right">
        {pv.order.length > 0 && !playing && (
          <div className="panel">
            <h3>{t('Action order')}</h3>
            <div className="initiative">
              {pv.order.map((o, i) => (
                <div key={i} className="slot">
                  <span className="pr">{o.priority >= 0 ? `+${o.priority}` : o.priority}</span>
                  <span className="grow">{o.label}</span>
                  <span className="num muted">{o.speed ? Math.round(o.speed) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showRight && (
          <div className="panel notebook" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{t('Combat log')}</h3>
              <button className="icon-btn" style={{ width: 30, height: 30, fontSize: 13 }} onClick={() => setShowRight(false)} aria-label={t('Close log')}>
                ✕
              </button>
            </div>
            <LogBook entries={log} />
          </div>
        )}
      </div>

      {/* DOCK: offered characters + hand */}
      <div className="bottom">
        {!hideHand && (
          <div className="dock-switch" role="tablist" aria-label={t('Dock')}>
            <button role="tab" aria-selected={dockTab === 'chars'} className={dockTab === 'chars' ? 'on' : ''} onClick={() => setDockTab('chars')}>
              <Icon name="tier/standard" size={18} /> {t('Creatures')} <b className="num">{offered.length}</b>
            </button>
            <button role="tab" aria-selected={dockTab === 'hand'} className={dockTab === 'hand' ? 'on' : ''} onClick={() => setDockTab('hand')}>
              <Icon name="ui/cards" size={18} /> {t('Cards')} <b className="num">{handCards.length}</b>
            </button>
          </div>
        )}
        <div className={`dock show-${hideHand ? 'chars' : dockTab}`}>
          <div className="dock-group dock-chars">
            <div className="dock-label">
              <span>{t('Offered characters')}</span>
              <button className="btn secondary small" disabled={playing || ready} onClick={async () => { const r = await ctrl.op({ kind: 'reroll', card: 'all' }); if (!r.ok) toast(r.error ?? 'Cannot re-roll', 'bad'); }} title={t('Re-roll all unlocked offered characters (3 AP)')}>
                <Icon name="ui/dice" size={16} /> 3 AP
              </button>
            </div>
            <div className="lockers">
              {offered.map((o) => {
                const card = pl.cards.find((c) => c.uid === o.cardUid);
                const def = card ? CHARACTERS[card.defId] : undefined;
                if (!def) return null;
                const chosen = ps.mode.kind === 'deploy' && ps.mode.card === o.cardUid;
                return (
                  <div key={o.cardUid} className={`locker rarity-${def.rarity}${chosen ? ' selected' : ''}`} style={{ opacity: deployingCards.has(o.cardUid) ? 0.4 : 1 }} title={`${def.name} · Deploy ${def.deploy} AP · ${def.tier}`} onClick={() => !playing && !ready && !deployingCards.has(o.cardUid) && setMode({ kind: 'deploy', card: o.cardUid })}>
                    <img src={portraitUrl(def.id, null, { size: 160 })} alt={def.name} style={{ width: '100%', borderRadius: 8, display: 'block' }} draggable={false} />
                    <div className="locker-name">
                      <span className="cost-pip">{def.deploy}</span> {def.name}
                    </div>
                    <button className="lock icon-btn" style={{ width: 26, height: 26, fontSize: 11 }} onClick={async (e) => { e.stopPropagation(); await ctrl.op({ kind: 'lock', card: o.cardUid, locked: !o.locked }); }} title={o.locked ? 'Unlock' : 'Lock'} aria-label={o.locked ? 'Unlock' : 'Lock'}>
                      <Icon name={o.locked ? 'ui/lock' : 'ui/unlock'} size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {!hideHand && (
            <div className="dock-group dock-hand" style={{ minWidth: 0 }}>
              <div className="dock-label">
                {t('Your hand')} {handCards.length}/6 · {pl.cardsPlayedThisRound + ps.commands.filter((c) => c.kind === 'item' || ((c.kind === 'attack' || c.kind === 'ability') && c.item)).length}/3 played
              </div>
              <div className="hand">
                {handCards.map((c) => (
                  <ItemCard key={c.uid} itemId={c.itemId} tarnished={c.tarnished} attached={attachedCards.has(c.uid)} selected={ps.mode.kind === 'item' && ps.mode.card === c.uid} onClick={() => onHandCard(c.uid)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {moodFor && (
        <Modal title={t('Pokerface: choose a mood')} onClose={() => setMoodFor(null)}>
          <p className="muted">{t('It cannot change later. The enemy learns it when he first attacks.')}</p>
          <div className="row">
            {['happy', 'sad', 'angry'].map((m) => (
              <button key={m} className="btn primary" onClick={() => { setPs((p) => ({ ...p, deployChoices: { ...p.deployChoices, [moodFor]: { mood: m } } })); setMoodFor(null); }}>
                <Icon name={`mood/${m}`} size={22} /> {m === 'happy' ? 'Happy' : m === 'sad' ? 'Sad' : 'Angry'}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {snap.ended && !playing && <EndSeal snap={snap} me={me} onExit={() => onExit({ won: snap.ended!.winner === 'draw' || snap.ended!.winner === null ? null : snap.ended!.winner === me, snap, log: log.map((l) => l.text) })} onSurrenderless />}
      {!snap.ended && (
        <button className="btn danger small surrender" onClick={() => confirm('Surrender this match?') && ctrl.surrender()}>
          {t('Surrender')}
        </button>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function modeHint(view: GameState, ps: PlannerState): string {
  const m = ps.mode;
  switch (m.kind) {
    case 'move':
      return 'Tap a highlighted tile to move there.';
    case 'attack': {
      const u = view.units.find((x) => x.uid === m.unit);
      const a = u ? attackDefFor(view, u, m.attack) : undefined;
      if (!a) return '';
      if (a.targeting === 'multi-field') return `${a.name}: choose ${a.custom === 'candy_rain' ? '3 tiles' : a.custom === 'prismatic_beam' ? '1–2 tiles' : '2 tiles'}.`;
      if (a.targeting === 'field') return `${a.name}: choose a target tile${a.shape === 'cone3' ? ' (cone direction)' : ''}.`;
      if (a.targeting === 'self') return `${a.name}: tap anywhere to confirm.`;
      return `${a.name}: choose a target (a tile also works: it hits whoever stands there).`;
    }
    case 'vector':
      return 'Trainticket: choose a unit, then its destination (1–3 tiles in a line).';
    case 'ability':
      return 'Choose the ability target.';
    case 'deploy':
      return 'Tap a free tile in your zone to deploy.';
    case 'item':
      return 'Choose the card target.';
    default:
      return '';
  }
}

function UnitPanel({ view, me, u, ps, setPs, setMode, toggleRest, removeCmd, handCards }: { view: GameState; me: PlayerId; u: Unit; ps: PlannerState; setPs: (f: (p: PlannerState) => PlannerState) => void; setMode: (m: PlannerState['mode']) => void; toggleRest: (uid: string) => void; removeCmd: (i: number) => void; handCards: GameState['players'][0]['hand'] }) {
  const mine = u.owner === me;
  const def = CHARACTERS[u.defId];
  const acts = unitActions(view, u);
  const fresh = u.deployedRound === view.round;
  const entranced = hasStatus(u, 'entranced');
  const unitCmds = ps.commands.map((c, i) => ({ c, i })).filter(({ c }) => 'unit' in c && c.unit === u.uid);
  void handCards;
  return (
    <div className="col">
      <div className="row">
        <img src={portraitUrl(u.defId, u.form, { size: 120 })} alt="" style={{ width: 64, height: 64, borderRadius: 8, border: '2px solid #0b080e' }} />
        <div className="col grow" style={{ gap: 2 }}>
          <b>{u.name}</b>
          <span className="small muted">
            {u.tier} · L{u.level} {u.form ? `· ${u.form}` : ''} {mine ? '' : '· enemy'}
          </span>
          <HpBar hp={u.hp} max={u.maxHp} shield={u.shield?.amount} />
          <span className="small num">
            {u.hp}/{u.maxHp} HP
          </span>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28, fontSize: 12 }} onClick={() => setPs((p) => ({ ...p, selected: undefined, mode: { kind: 'idle' } }))} aria-label={t('close')}>
          ✕
        </button>
      </div>
      <div className="small num muted">
        PAtk {u.stats.patk} · PDef {u.stats.pdef} · SAtk {u.stats.satk} · SDef {u.stats.sdef} · Spd {u.stats.speed} · Move {u.move}
      </div>
      <CharTraits chars={u.chars} />
      {u.statuses.length > 0 && <StatusChips statuses={u.statuses} />}
      {Object.entries(u.counters).some(([, v]) => v > 0) && (
        <div className="row wrap small">
          {Object.entries(u.counters)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <span key={k} className="chip" style={{ color: 'var(--gold)' }}>
                {k}: {v}
              </span>
            ))}
        </div>
      )}
      {u.gear && <span className="chip">Gear: {ITEMS[u.gear]?.name}</span>}
      {mine && !u.isObject && (
        <>
          {fresh && <span className="small" style={{ color: 'var(--marigold)' }}>{t('Deployed this round — cannot act yet.')}</span>}
          <div className="row wrap" style={{ gap: 4 }}>
            <button className={`cmd${ps.mode.kind === 'move' && ps.mode.unit === u.uid ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--cyan)' }} disabled={fresh || !acts.canMove || entranced} onClick={() => setMode({ kind: 'move', unit: u.uid })}>
              <span className="lens"><Icon name="ui/footprints" size={22} /></span>
              {t('Move')}
            </button>
            {acts.attacks.map((a) => (
              <button
                key={a.id}
                className={`cmd${ps.mode.kind === 'attack' && ps.mode.attack === a.id ? ' active' : ''}`}
                style={{ ['--fam' as string]: a.category === 'support' || a.category === 'utility' ? 'var(--spore)' : 'var(--blood-hi)' }}
                disabled={fresh || entranced}
                title={`${a.name} — ${a.category}${a.tag ? '/' + a.tag : ''} · Power ${a.power ?? '—'} · Range ${a.range} · ${a.ap} AP · Acc ${a.acc ?? '—'} · Crit ${a.crit}% · max ${a.maxUses}${a.priority ? ` · Priority ${a.priority}` : ''}\n${a.text}`}
                onClick={() => setMode(a.targeting === 'vector' ? { kind: 'vector', unit: u.uid, attack: a.id } : { kind: 'attack', unit: u.uid, attack: a.id, tiles: [] })}
              >
                <span className="lens">
                  <Icon name={a.tag ? `tag/${a.tag}` : 'ui/plus'} size={22} />
                </span>
                <span style={{ lineHeight: 1 }}>
                  {a.name.split(' ')[0]}
                  <br />
                  <span style={{ color: 'var(--cyan)' }}>{a.ap}AP</span>
                </span>
              </button>
            ))}
            {acts.abilities.map((ab) => (
              <button key={ab.id} className={`cmd${ps.mode.kind === 'ability' && ps.mode.ability === ab.id ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--violet)' }} disabled={fresh && ab.id !== 'mambo.wake'} title={`${ab.name} · ${ab.ap} AP${ab.priority ? ` · Priority ${ab.priority}` : ''}\n${ab.text}`} onClick={() => (ab.targeting === 'self' || ab.targeting === 'none' || ab.targeting === 'choice' ? setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'ability', unit: u.uid, ability: ab.id, target: ab.targeting === 'choice' ? { choice: view.players[me].hand.find((c) => !c.tarnished)?.uid } : {} }] })) : setMode({ kind: 'ability', unit: u.uid, ability: ab.id }))}>
                <span className="lens"><Icon name="ui/gear" size={22} /></span>
                <span style={{ lineHeight: 1 }}>
                  {ab.name.split(' ')[0]}
                  <br />
                  <span style={{ color: 'var(--cyan)' }}>{ab.ap}AP</span>
                </span>
              </button>
            ))}
            <button className="cmd" style={{ ['--fam' as string]: 'var(--bone)' }} disabled={fresh} onClick={() => setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'wait', unit: u.uid }] }))} title={t('Wait: this character\'s next actions come after everyone else at the same Priority')}>
              <span className="lens"><Icon name="ui/hourglass" size={22} /></span>
              {t('Wait')}
            </button>
            <button className="cmd" style={{ ['--fam' as string]: 'var(--ghost)' }} disabled={fresh} onClick={() => setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'hold', unit: u.uid }] }))} title={t('Hold Position (0 AP): no voluntary movement, ignores the first tile of forced movement, −10% damage from the first hit')}>
              <span className="lens"><Icon name="ui/anchor" size={22} /></span>
              {t('Hold')}
            </button>
            <button className={`cmd${ps.rest.includes(u.uid) ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--gold)' }} disabled={fresh} onClick={() => toggleRest(u.uid)} title={t('Rest: halves this character\'s Effective Speed for the whole round')}>
              <span className="lens"><Icon name="ui/coffin" size={22} /></span>
              {t('Rest')}
            </button>
          </div>
          {u.defId === 'ghost_train' && (
            <label className="small col">
              Mind's Eye speed shift: {ps.speedShift[u.uid] ?? 0}%
              <input className="spine" type="range" min={-15} max={15} value={ps.speedShift[u.uid] ?? 0} onChange={(e) => setPs((p) => ({ ...p, speedShift: { ...p.speedShift, [u.uid]: Number(e.target.value) } }))} />
            </label>
          )}
          {u.defId === 'ghost_train' && (
            <label className="small col">
              Mind's Eye: on a Speed tie, act after
              <div className="row" style={{ gap: 6 }}>
                <select
                  value={ps.mindsEye?.[u.uid]?.after ?? ''}
                  onChange={(e) =>
                    setPs((p) => {
                      const next = { ...(p.mindsEye ?? {}) };
                      if (e.target.value) next[u.uid] = { after: e.target.value, action: next[u.uid]?.action ?? 1 };
                      else delete next[u.uid];
                      return { ...p, mindsEye: next };
                    })
                  }
                >
                  <option value="">{t('nobody (random)')}</option>
                  {view.units
                    .filter((x) => x.owner === me && x.uid !== u.uid && !x.isObject)
                    .map((x) => (
                      <option key={x.uid} value={x.uid}>
                        {x.name}
                      </option>
                    ))}
                </select>
                {ps.mindsEye?.[u.uid] && (
                  <select value={ps.mindsEye[u.uid]!.action ?? 1} onChange={(e) => setPs((p) => ({ ...p, mindsEye: { ...p.mindsEye, [u.uid]: { after: p.mindsEye![u.uid]!.after, action: Number(e.target.value) } } }))}>
                    <option value={0}>{t('before its actions')}</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        after its action {n}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          )}
          {u.defId === 'scarecrow' && (
            <label className="small col">
              {t('Watchful Eye target')}
              <select value={ps.watch ?? ''} onChange={(e) => setPs((p) => ({ ...p, watch: e.target.value || undefined }))}>
                <option value="">—</option>
                {view.units
                  .filter((x) => x.owner !== me && !x.isObject && x.defId !== 'lab_assistant')
                  .map((x) => (
                    <option key={x.uid} value={x.uid}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {unitCmds.length > 0 && (
            <div className="col small" style={{ gap: 3 }}>
              {unitCmds.map(({ c, i }) => (
                <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {i + 1}. {commandLabel(view, c)}
                  </span>
                  <button className="btn secondary small" style={{ minHeight: 26, padding: '2px 8px' }} onClick={() => removeCmd(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="small muted">Planned position: {(() => { const p = plannedPos(view, ps, u.uid); return p ? `${p.c + 1}/${p.r + 1}` : '?'; })()}</div>
        </>
      )}
      {def && (
        <details className="small">
          <summary>Ability: {def.ability.name}</summary>
          {def.ability.text}
        </details>
      )}
    </div>
  );
}

/** Screen area covered by the floating HUD at the current window size (the camera fits the board into the rest). */
function useBoardInsets(): Insets {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return useMemo(() => {
    if (w <= 760) return { top: 150, right: 4, bottom: 158, left: 4 };
    return { top: 108, right: 24, bottom: 176, left: 24 };
  }, [w]);
}

/** What is happening right now during the resolution: one line per action, with its outcome. */
function BeatCaption({ index, total, beat, me }: { index: number; total: number; beat: Beat; me: PlayerId }) {
  const side = beat.owner === undefined ? 'neutral' : beat.owner === me ? 'mine' : 'theirs';
  return (
    <div key={index} className={`panel beat-caption ${side}`} role="status" aria-live="polite">
      <span className="beat-step num">
        {index}/{total}
      </span>
      <div className="col" style={{ gap: 2, minWidth: 0 }}>
        <b className="beat-title">{beat.title}</b>
        {beat.detail && <span className="beat-detail">{beat.detail}</span>}
      </div>
    </div>
  );
}

/** "Creature or tile?" when a single-target attack is aimed at an occupied tile. */
function AimChooser({ at, unit, enemy, onPick, onCancel }: { at?: { x: number; y: number }; unit: Unit; enemy: boolean; onPick: (which: 'unit' | 'tile') => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div className="panel aim-chooser" role="dialog" aria-label={t('Choose the target')} style={at ? { left: at.x, top: at.y } : { left: '50%', top: '40%' }}>
      <b className="small">{t('Aim at …')}</b>
      <button className="btn primary small" onClick={() => onPick('unit')} autoFocus>
        {enemy ? 'the creature' : unit.name}
        <span className="aim-sub">follows {unit.name} if it moves</span>
      </button>
      <button className="btn secondary small" onClick={() => onPick('tile')}>
        the tile
        <span className="aim-sub">{t('hits whoever stands here')}</span>
      </button>
      <button className="coach-skip" onClick={onCancel}>
        {t('Cancel')}
      </button>
    </div>
  );
}

function HoverInfo({ view, h, me, at }: { view: GameState; h: Hex; me: PlayerId; at?: { x: number; y: number } }) {
  const t = view.tiles.find((x) => x.c === h.c && x.r === h.r);
  const u = view.units.find((x) => x.pos.c === h.c && x.pos.r === h.r);
  if (!t) return null;
  const parts: string[] = [`${h.c + 1}/${h.r + 1}`];
  if (t.wall) parts.push(`Wall ${t.wall.hp}/${t.wall.maxHp}`);
  if (t.objective) parts.push(t.objective === 'control' ? 'Control Field (+3 VP/round)' : t.objective === 'terminal' ? 'Research Terminal (+5 VP)' : 'Lab Objective');
  for (const f of t.fields) parts.push(f.id.replace(/_/g, ' '));
  if (u) parts.push(`${u.owner === me ? '◆' : '◇'} ${u.name} ${u.hp}/${u.maxHp}`);
  return (
    <div className="panel hover-info" style={at ? { left: at.x, top: at.y - 40 } : { left: '50%', top: 120 }}>
      {parts.join(' · ')}
    </div>
  );
}

function LogBook({ entries }: { entries: { text: string; kind: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [entries.length]);
  return (
    <div className="logbook" ref={ref} style={{ flex: 1 }}>
      {entries.length === 0 && <span className="muted">{t('The notebook is empty. Fingerprints only.')}</span>}
      {entries.map((e, i) => (
        <div key={i} className={e.kind}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

function EndSeal({ snap, me, onExit }: { snap: MatchSnapshot; me: PlayerId; onExit: () => void; onSurrenderless?: boolean }) {
  const e = snap.ended!;
  const won = e.winner === me;
  const draw = e.winner === 'draw' || e.winner === null;
  const rewards = e.rewards as { trophies?: number; gold?: number; chest?: string | null; unlockedZones?: string[] } | undefined;
  return (
    <Modal title={draw ? t('Draw') : won ? t('Victory') : t('Defeat')} icon={draw ? 'ui/scales' : won ? 'ui/trophy' : 'ui/skull'}>
      <div className="col" style={{ alignItems: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 54, background: won ? 'radial-gradient(circle,#ffe27a,#D9A93A 60%,#6b5320)' : draw ? '#555' : 'radial-gradient(circle,#c22b33,#8B1A1F 60%,#3a0a0e)', boxShadow: '0 0 30px #000', border: '4px solid #0b080e' }}>
          <Icon name={won ? 'ui/win' : draw ? 'ui/scales' : 'ui/loss'} size={72} />
        </div>
        <p className="center">{e.reason}</p>
        <p className="num">
          VP {snap.view.players[me].vp} : {snap.view.players[me === 0 ? 1 : 0].vp} · {snap.view.round} rounds
        </p>
        {e.mmr && (
          <p className="num">
            MMR {e.mmr.before} → <b>{e.mmr.after}</b> ({e.mmr.after >= e.mmr.before ? '+' : ''}
            {e.mmr.after - e.mmr.before}) · {e.mmr.division}
          </p>
        )}
        {rewards && (
          <p>
            {rewards.trophies ? (
              <>
                <Icon name="ui/trophy" size={18} /> {rewards.trophies > 0 ? '+' : ''}
                {rewards.trophies} trophies ·{' '}
              </>
            ) : null}
            <Icon name="ui/gold" size={18} /> +{rewards.gold ?? 0} gold
            {rewards.chest ? (
              <>
                {' · '}
                <Icon name="ui/chest" size={18} /> {rewards.chest} chest
              </>
            ) : null}
            {rewards.unlockedZones?.length ? ` · New area: ${rewards.unlockedZones.join(', ')}` : ''}
          </p>
        )}
        <button className="btn primary l" onClick={onExit}>
          {t('Continue')}
        </button>
      </div>
    </Modal>
  );
}

export function tokenFor(defId: string, form: string | null) {
  return figureCanvas(lookKey(defId, form), 128);
}
