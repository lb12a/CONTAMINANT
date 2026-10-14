import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTERS,
  ITEMS,
  MODE_TARGET,
  attackDefFor,
  hasStatus,
  isImmediateItem,
  type GameEvent,
  type GameState,
  type Hex,
  type PlayerId,
  type Unit,
} from '@contaminant/engine';
import { BoardCanvas } from '../render/BoardCanvas.tsx';
import type { Floater, Flash, Overlay, Pulse } from '../render/types.ts';
import { computeOverlay, emptyPlanner, plannedPos, tapTile, toPlan, unitActions, commandLabel, type PlannerState } from '../game/planner.ts';
import type { MatchController, MatchSnapshot } from '../game/controller.ts';
import { ApBattery, CharTraits, Fuse, HpBar, IdleSteps, ItemCard, Modal, StatusChips, VpRace, secondsLeft } from '../ui/components.tsx';
import { figureCanvas, lookKey, portraitUrl } from '../render/art.ts';
import { TAG_GLYPH, STATUS_GLYPH } from '../ui/glyphs.ts';
import { t } from '../i18n.ts';
import { getProfile, toast } from '../store.ts';
import { sfx } from '../audio.ts';

interface Props {
  ctrl: MatchController;
  onExit: (summary: { won: boolean | null; snap: MatchSnapshot; log: string[] }) => void;
  tutorialPanel?: React.ReactNode;
  hideHand?: boolean;
}

const EVENT_DELAY = 280;

export function MatchScreen({ ctrl, onExit, tutorialPanel, hideHand }: Props) {
  const [snap, setSnap] = useState<MatchSnapshot>(ctrl.snapshot());
  const [ps, setPs] = useState<PlannerState>(emptyPlanner());
  const [hover, setHover] = useState<Hex | null>(null);
  const [display, setDisplay] = useState<GameState>(snap.view);
  const [play, setPlay] = useState<Partial<Overlay>>({});
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<{ text: string; kind: string }[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [popups, setPopups] = useState<number>(0);
  const [showLeft, setShowLeft] = useState(false);
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
    setDisplay(base);
    const pos = new Map<string, Hex>();
    const hp = new Map<string, number>();
    const gone = new Set<string>();
    const floaters: Floater[] = [];
    const flashes: Flash[] = [];
    const tombs: Hex[] = [];
    const pulses: Pulse[] = [];
    const unitPos = (uid?: string) => (uid ? pos.get(uid) ?? base.units.find((u) => u.uid === uid)?.pos : undefined);
    let cancelled = false;
    skipRef.current = false;
    setPlaying(true);
    setBanner(t('Resolution'));
    sfx('resolve');
    const speed = getProfile().settings.animSpeed || 1;
    const newLog: { text: string; kind: string }[] = [];
    (async () => {
      for (const e of events) {
        if (cancelled) return;
        newLog.push({ text: e.text, kind: e.kind });
        if (skipRef.current) continue;
        const now = performance.now();
        const at = unitPos(e.target) ?? e.to ?? unitPos(e.actor);
        const px = at ? { h: at } : null;
        switch (e.kind) {
          case 'move':
            if (e.actor && e.to) pos.set(e.actor, e.to);
            if (e.target && e.to) pos.set(e.target, e.to);
            if (e.tiles) flashes.push({ tiles: e.tiles, color: 'rgba(79,227,255,0.5)', t0: now, dur: 500 });
            sfx('step');
            break;
          case 'damage':
            if (e.target && e.amount) {
              const u = base.units.find((x) => x.uid === e.target);
              if (u) hp.set(u.uid, (hp.get(u.uid) ?? u.hp) - e.amount);
              if (px) floaters.push({ h: px.h, text: `-${e.amount}`, color: '#ff5a5a', t0: now, big: e.amount >= 60 });
              pulses.push({ uid: e.target, kind: 'hit', t0: now });
              sfx('hit');
            }
            break;
          case 'heal':
            if (e.target && e.amount) {
              const u = base.units.find((x) => x.uid === e.target);
              if (u) hp.set(u.uid, Math.min(u.maxHp, (hp.get(u.uid) ?? u.hp) + e.amount));
              if (px) floaters.push({ h: px.h, text: `+${e.amount}`, color: '#8CFF5A', t0: now });
              pulses.push({ uid: e.target, kind: 'heal', t0: now });
            }
            break;
          case 'miss':
            if (px) floaters.push({ h: px.h, text: 'miss', color: '#e8dfc8', t0: now });
            sfx('miss');
            break;
          case 'crit':
            if (px) flashes.push({ tiles: [px.h], color: 'rgba(255,207,58,0.8)', t0: now, dur: 450 });
            if (px) floaters.push({ h: px.h, text: 'CRIT', color: '#D9A93A', t0: now, big: true });
            if (e.target) pulses.push({ uid: e.target, kind: 'crit', t0: now });
            sfx('crit');
            break;
          case 'attack': {
            const to = unitPos(e.target) ?? e.to ?? e.tiles?.[0];
            if (e.actor && to) pulses.push({ uid: e.actor, kind: 'lunge', to, t0: now });
            if (e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(255,90,90,0.45)', t0: now, dur: 500 });
            else if (px) flashes.push({ tiles: [px.h], color: 'rgba(255,90,90,0.45)', t0: now, dur: 350 });
            break;
          }
          case 'ko':
            if (e.target) gone.add(e.target);
            if (e.to) tombs.push(e.to);
            sfx('ko');
            break;
          case 'field':
            if (e.tiles?.length) flashes.push({ tiles: e.tiles, color: 'rgba(255,154,31,0.45)', t0: now, dur: 700 });
            break;
          case 'status':
            if (px && e.status && STATUS_GLYPH[e.status]) floaters.push({ h: px.h, text: STATUS_GLYPH[e.status]!, color: '#e8dfc8', t0: now });
            break;
          case 'deploy':
            if (e.privateTo === me) setPopups((n) => n + 1);
            if (e.to) flashes.push({ tiles: [e.to], color: 'rgba(140,255,90,0.6)', t0: now, dur: 700 });
            if (e.actor) pulses.push({ uid: e.actor, kind: 'deploy', t0: now });
            sfx('deploy');
            break;
          case 'trap':
            if (px) flashes.push({ tiles: [px.h], color: 'rgba(194,43,51,0.8)', t0: now, dur: 600 });
            break;
          case 'win':
            break;
          default:
            break;
        }
        setPlay({ pos: new Map(pos), hp: new Map(hp), gone: new Set(gone), floaters: floaters.slice(-30), flashes: flashes.slice(-20), pulses: pulses.slice(-30), tombs: [...tombs] });
        const relevant = ['move', 'damage', 'heal', 'miss', 'crit', 'ko', 'field', 'deploy', 'trap', 'attack'].includes(e.kind);
        if (relevant) await sleep(EVENT_DELAY / speed);
      }
      if (cancelled) return;
      await sleep(skipRef.current ? 0 : 400 / speed);
      setLog((l) => [...l, ...newLog].slice(-400));
      setPlay({});
      setDisplay(snap.view);
      setPlaying(false);
      setBanner(snap.ended ? null : `${t('Round')} ${snap.view.round} — ${t('Planning')}`);
      if (snap.view.round % 5 === 0 && !snap.ended) setTimeout(() => setBanner('Full Moon'), 1700);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.roundSerial]);

  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (snap.ended) sfx(snap.ended.winner === me ? 'win' : 'lose');
  }, [snap.ended, me]);

  // ---------------------------------------------------------------- planning
  const pv = useMemo(() => computeOverlay(view, me, ps, hover), [view, me, ps, hover]);
  const overlay: Overlay = playing ? { highlights: new Map(), paths: [], targets: [], ghosts: [], ...play } : pv.overlay;
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

  const onTile = useCallback(
    (h: Hex) => {
      if (playing || ready || snap.ended) return;
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
    [view, me, playing, ready, snap.ended],
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
      {/* HUD */}
      <div className="hud panel" style={{ padding: '6px 10px' }}>
        <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
          <div className="col" style={{ gap: 3, minWidth: 0, flex: '0 1 330px' }}>
            <div className="row small">
              <b className="num" style={{ color: 'var(--cyan)' }}>
                {pv.apLeft}/{pl.ap} AP
              </b>
              <span className="muted">idle</span>
              <IdleSteps bonus={pl.idleBonus} />
              <span className="muted">· {pl.hand.length} cards</span>
            </div>
            <ApBattery ap={pl.ap} planned={Math.min(pl.ap, pv.cost)} idle={0} />
          </div>
          <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
            <div className="row small" style={{ justifyContent: 'space-between' }}>
              <span>
                <b style={{ color: 'var(--gold)' }}>{snap.info.names[me]}</b> <span className="num">{display.players[me].vp}</span>
              </span>
              <span className="display" style={{ fontSize: 14 }}>
                {t('Round')} {view.round} · {view.settings.mode.toUpperCase()} · {target} VP
              </span>
              <span>
                <span className="num">{display.players[enemy].vp}</span> <b style={{ color: '#ff8a8f' }}>{snap.info.names[enemy]}</b>
              </span>
            </div>
            <VpRace me={display.players[me].vp} them={display.players[enemy].vp} target={target === Infinity ? 100 : target} />
            <div className="row small">
              <div className="grow">
                <Fuse deadline={playing ? 0 : snap.deadline} total={snap.info.planningSeconds || 30} />
              </div>
              <span className="num muted">{snap.deadline && !playing ? `${tsecs}s` : playing ? '…' : '∞'}</span>
              {snap.opponentReady && !playing && <span className="chip buff">opponent ready</span>}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="icon-btn menu-burger" onClick={() => setShowLeft((v) => !v)} title="Units">
              ♟
            </button>
            <button className="icon-btn" onClick={() => setShowRight((v) => !v)} title={t('Combat log')}>
              📓
            </button>
            {playing ? (
              <button className="btn secondary small" onClick={() => (skipRef.current = true)}>
                {t('Skip')}
              </button>
            ) : (
              <button className={`btn primary${ready ? ' active' : ''}`} disabled={!!snap.ended} onClick={() => (ready ? setReady(false) : submit(true))} title={pv.issues.join('\n')}>
                {ready ? 'Sealed ✓' : t('End planning')}
              </button>
            )}
          </div>
        </div>
        {pv.issues.length > 0 && !playing && <div className="small" style={{ color: '#ff9da2', marginTop: 4 }}>⚠ {pv.issues[0]}</div>}
      </div>

      {/* LEFT: unit panel */}
      <div className="left panel">
        {tutorialPanel}
        {selected ? (
          <UnitPanel view={view} me={me} u={selected} ps={ps} setPs={setPs} setMode={setMode} toggleRest={toggleRest} removeCmd={removeCmd} handCards={handCards} />
        ) : (
          <div className="col">
            <h3>Your units</h3>
            {myUnits.length === 0 && <p className="muted small">No characters on the board. Deploy from the offered characters below.</p>}
            {myUnits.map((u) => (
              <button key={u.uid} className="btn secondary small" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setPs((p) => ({ ...p, selected: u.uid, mode: { kind: 'idle' } }))}>
                {u.name} · {u.hp}/{u.maxHp}
              </button>
            ))}
          </div>
        )}
        <div className="col" style={{ marginTop: 10 }}>
          <h3>Plan · {pv.cost} AP</h3>
          {ps.commands.length === 0 && <span className="muted small">Nothing planned. Spending less than 50% of your AP builds the Idle Bonus.</span>}
          {ps.commands.map((c, i) => (
            <div key={i} className="row small" style={{ justifyContent: 'space-between', background: '#ffffff08', borderRadius: 6, padding: '3px 6px' }}>
              <span>
                {'unit' in c ? `${view.units.find((u) => u.uid === c.unit)?.name ?? ''}: ` : ''}
                {commandLabel(view, c)}
                {(c.kind === 'attack' || c.kind === 'ability') && c.item ? ` + ${ITEMS[handCards.find((h) => h.uid === c.item)?.itemId ?? '']?.name ?? 'card'}` : ''}
              </span>
              <button className="icon-btn" style={{ width: 26, height: 26, fontSize: 12 }} onClick={() => removeCmd(i)} aria-label="remove">
                ✕
              </button>
            </div>
          ))}
          {ps.commands.length > 0 && (
            <button className="btn secondary small" onClick={() => setPs(emptyPlanner())}>
              Clear plan
            </button>
          )}
        </div>
      </div>

      {/* BOARD */}
      <div className="board panel" style={{ padding: 0, overflow: 'hidden' }} ref={boardRef}>
        <BoardCanvas state={display} me={me} overlay={overlay} onTile={onTile} onHover={setHover} onContext={() => setMode({ kind: 'idle' })} />
        {banner && (
          <div key={banner + view.round} className="banner" onAnimationEnd={() => setBanner(null)}>
            {banner}
          </div>
        )}
        {popups > 0 && (
          <div key={popups} className="popup-enemy" onAnimationEnd={() => setPopups(0)}>
            ❓ {popups > 1 ? `${popups}× ` : ''}Enemy deploys a character!
          </div>
        )}
        {ps.mode.kind !== 'idle' && !playing && (
          <div className="panel small" style={{ position: 'absolute', left: 8, bottom: 8, padding: '6px 10px' }}>
            {modeHint(view, ps)}{' '}
            <button className="btn secondary small" onClick={() => setMode({ kind: 'idle' })}>
              {t('Cancel')}
            </button>
          </div>
        )}
        {hover && !playing && <HoverInfo view={view} h={hover} me={me} />}
        {snap.watch && (
          <div className="panel small" style={{ position: 'absolute', right: 8, bottom: 8, maxWidth: 260 }}>
            👁 Watchful Eye: {view.units.find((u) => u.uid === snap.watch!.unit)?.name} plans {snap.watch.commands.length} command(s):{' '}
            {(snap.watch.commands as { kind: string }[]).map((c) => c.kind).join(', ') || 'nothing'}
          </div>
        )}
      </div>

      {/* RIGHT: initiative + log */}
      <div className="right">
        <div className="panel">
          <h3>{t('Action order')}</h3>
          <div className="initiative">
            {pv.order.length === 0 && <span className="muted small">Plan actions to see their order (Priority → Speed).</span>}
            {pv.order.map((o, i) => (
              <div key={i} className="slot">
                <span className="pr">{o.priority >= 0 ? `+${o.priority}` : o.priority}</span>
                <span className="grow">{o.label}</span>
                <span className="num muted">{o.speed ? Math.round(o.speed) : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel notebook" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <h3>{t('Combat log')}</h3>
          <LogBook entries={log} />
        </div>
      </div>

      {/* BOTTOM: offered characters + hand */}
      <div className="bottom panel" style={{ padding: '6px 8px' }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14, overflowX: 'auto' }}>
          <div className="col" style={{ gap: 4 }}>
            <div className="row small">
              <b>{t('Offered characters')}</b>
              <button className="btn secondary small" disabled={playing || ready} onClick={async () => { const r = await ctrl.op({ kind: 'reroll', card: 'all' }); if (!r.ok) toast(r.error ?? 'Cannot re-roll', 'bad'); }} title="Re-roll all unlocked offered characters (3 AP)">
                🎲 3 AP
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
                    <img src={portraitUrl(def.id, null, { size: 120 })} alt={def.name} style={{ width: '100%', borderRadius: 6, display: 'block' }} draggable={false} />
                    <div className="small center" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: 'var(--cyan)' }}>{def.deploy}</span> {def.name}
                    </div>
                    <button className="lock icon-btn" style={{ width: 24, height: 24, fontSize: 11 }} onClick={async (e) => { e.stopPropagation(); await ctrl.op({ kind: 'lock', card: o.cardUid, locked: !o.locked }); }} title={o.locked ? 'Unlock' : 'Lock'}>
                      {o.locked ? '🔒' : '🔓'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {!hideHand && (
            <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
              <b className="small">
                {t('Your hand')} ({handCards.length}/6) · {pl.cardsPlayedThisRound + ps.commands.filter((c) => c.kind === 'item' || ((c.kind === 'attack' || c.kind === 'ability') && c.item)).length}/3 played
              </b>
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
        <Modal title="Pokerface: choose a mood" onClose={() => setMoodFor(null)}>
          <p className="muted">It cannot change later. The enemy learns it when he first attacks.</p>
          <div className="row">
            {['happy', 'sad', 'angry'].map((m) => (
              <button key={m} className="btn primary" onClick={() => { setPs((p) => ({ ...p, deployChoices: { ...p.deployChoices, [moodFor]: { mood: m } } })); setMoodFor(null); }}>
                {m === 'happy' ? '😀 Happy' : m === 'sad' ? '😢 Sad' : '😠 Angry'}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {snap.ended && !playing && <EndSeal snap={snap} me={me} onExit={() => onExit({ won: snap.ended!.winner === 'draw' || snap.ended!.winner === null ? null : snap.ended!.winner === me, snap, log: log.map((l) => l.text) })} onSurrenderless />}
      {!snap.ended && (
        <button className="btn danger small" style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 25, opacity: 0.75 }} onClick={() => confirm('Surrender this match?') && ctrl.surrender()}>
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
        <button className="icon-btn" style={{ width: 28, height: 28, fontSize: 12 }} onClick={() => setPs((p) => ({ ...p, selected: undefined, mode: { kind: 'idle' } }))} aria-label="close">
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
          {fresh && <span className="small" style={{ color: 'var(--marigold)' }}>Deployed this round — cannot act yet.</span>}
          <div className="row wrap" style={{ gap: 4 }}>
            <button className={`cmd${ps.mode.kind === 'move' && ps.mode.unit === u.uid ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--cyan)' }} disabled={fresh || !acts.canMove || entranced} onClick={() => setMode({ kind: 'move', unit: u.uid })}>
              <span className="lens">👣</span>
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
                <span className="lens">{a.tag ? TAG_GLYPH[a.tag] : '✚'}</span>
                <span style={{ lineHeight: 1 }}>
                  {a.name.split(' ')[0]}
                  <br />
                  <span style={{ color: 'var(--cyan)' }}>{a.ap}AP</span>
                </span>
              </button>
            ))}
            {acts.abilities.map((ab) => (
              <button key={ab.id} className={`cmd${ps.mode.kind === 'ability' && ps.mode.ability === ab.id ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--violet)' }} disabled={fresh && ab.id !== 'mambo.wake'} title={`${ab.name} · ${ab.ap} AP${ab.priority ? ` · Priority ${ab.priority}` : ''}\n${ab.text}`} onClick={() => (ab.targeting === 'self' || ab.targeting === 'none' || ab.targeting === 'choice' ? setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'ability', unit: u.uid, ability: ab.id, target: ab.targeting === 'choice' ? { choice: view.players[me].hand.find((c) => !c.tarnished)?.uid } : {} }] })) : setMode({ kind: 'ability', unit: u.uid, ability: ab.id }))}>
                <span className="lens">⚙</span>
                <span style={{ lineHeight: 1 }}>
                  {ab.name.split(' ')[0]}
                  <br />
                  <span style={{ color: 'var(--cyan)' }}>{ab.ap}AP</span>
                </span>
              </button>
            ))}
            <button className="cmd" style={{ ['--fam' as string]: 'var(--bone)' }} disabled={fresh} onClick={() => setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'wait', unit: u.uid }] }))} title="Wait: this character's next actions come after everyone else at the same Priority">
              <span className="lens">⏳</span>
              {t('Wait')}
            </button>
            <button className="cmd" style={{ ['--fam' as string]: 'var(--ghost)' }} disabled={fresh} onClick={() => setPs((p) => ({ ...p, commands: [...p.commands, { kind: 'hold', unit: u.uid }] }))} title="Hold Position (0 AP): no voluntary movement, ignores the first tile of forced movement, −10% damage from the first hit">
              <span className="lens">⚓</span>
              {t('Hold')}
            </button>
            <button className={`cmd${ps.rest.includes(u.uid) ? ' active' : ''}`} style={{ ['--fam' as string]: 'var(--gold)' }} disabled={fresh} onClick={() => toggleRest(u.uid)} title="Rest: halves this character's Effective Speed for the whole round">
              <span className="lens">⚰</span>
              {t('Rest')}
            </button>
          </div>
          {u.defId === 'ghost_train' && (
            <label className="small col">
              Mind's Eye speed shift: {ps.speedShift[u.uid] ?? 0}%
              <input className="spine" type="range" min={-15} max={15} value={ps.speedShift[u.uid] ?? 0} onChange={(e) => setPs((p) => ({ ...p, speedShift: { ...p.speedShift, [u.uid]: Number(e.target.value) } }))} />
            </label>
          )}
          {u.defId === 'scarecrow' && (
            <label className="small col">
              Watchful Eye target
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

function HoverInfo({ view, h, me }: { view: GameState; h: Hex; me: PlayerId }) {
  const t = view.tiles.find((x) => x.c === h.c && x.r === h.r);
  const u = view.units.find((x) => x.pos.c === h.c && x.pos.r === h.r);
  if (!t) return null;
  const parts: string[] = [`${h.c + 1}/${h.r + 1}`];
  if (t.wall) parts.push(`Wall ${t.wall.hp}/${t.wall.maxHp}`);
  if (t.objective) parts.push(t.objective === 'control' ? 'Control Field (+3 VP/round)' : t.objective === 'terminal' ? 'Research Terminal (+5 VP)' : 'Lab Objective');
  for (const f of t.fields) parts.push(f.id.replace(/_/g, ' '));
  if (u) parts.push(`${u.owner === me ? '◆' : '◇'} ${u.name} ${u.hp}/${u.maxHp}`);
  return (
    <div className="panel small" style={{ position: 'absolute', left: 8, top: 8, padding: '4px 8px', pointerEvents: 'none', maxWidth: 280 }}>
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
      {entries.length === 0 && <span className="muted">The notebook is empty. Fingerprints only.</span>}
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
    <Modal title={draw ? `⚖ ${t('Draw')}` : won ? `🏆 ${t('Victory')}` : `💀 ${t('Defeat')}`}>
      <div className="col" style={{ alignItems: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 54, background: won ? 'radial-gradient(circle,#ffe27a,#D9A93A 60%,#6b5320)' : draw ? '#555' : 'radial-gradient(circle,#c22b33,#8B1A1F 60%,#3a0a0e)', boxShadow: '0 0 30px #000', border: '4px solid #0b080e' }}>
          {won ? '⬢' : draw ? '≈' : '✖'}
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
            {rewards.trophies ? `🏆 ${rewards.trophies > 0 ? '+' : ''}${rewards.trophies} trophies · ` : ''}🪙 +{rewards.gold ?? 0} gold{rewards.chest ? ` · 📦 ${rewards.chest} chest` : ''}
            {rewards.unlockedZones?.length ? ` · New area: ${rewards.unlockedZones.join(', ')}` : ''}
          </p>
        )}
        <button className="btn primary l" onClick={onExit}>
          Continue
        </button>
      </div>
    </Modal>
  );
}

export function tokenFor(defId: string, form: string | null) {
  return figureCanvas(lookKey(defId, form), 128);
}
