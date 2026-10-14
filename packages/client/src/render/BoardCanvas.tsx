import { useEffect, useRef } from 'react';
import type { GameState, Hex, PlayerId } from '@contaminant/engine';
import { BoardRenderer, type Overlay } from './board.ts';

interface Props {
  state: GameState;
  me: PlayerId;
  overlay: Overlay;
  onTile?: (h: Hex) => void;
  onHover?: (h: Hex | null) => void;
  onContext?: (h: Hex) => void;
}

/** Interactive hex board: tap/click to select, hover for info, wheel/pinch zoom, drag to pan. */
export function BoardCanvas({ state, me, overlay, onTile, onHover, onContext }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const propsRef = useRef({ state, me, overlay });
  propsRef.current = { state, me, overlay };
  const raf = useRef(0);
  const timer = useRef(0);
  const kick = useRef<() => void>(() => undefined);

  // On-demand rendering: full frame rate only while something animates (playback effects, zoom),
  // a slow ~4 fps tick otherwise for idle shimmer – keeps phones cool and the page idle.
  useEffect(() => {
    const c = ref.current!;
    const r = new BoardRenderer(c);
    rendererRef.current = r;
    let alive = true;
    // requestAnimationFrame with a timer fallback (rAF is paused while the window is occluded)
    let fallback = 0;
    const schedule = () => {
      raf.current = requestAnimationFrame(frame);
      fallback = window.setTimeout(() => frame(performance.now()), 120);
    };
    const frame = (t: number) => {
      cancelAnimationFrame(raf.current);
      clearTimeout(fallback);
      raf.current = 0;
      if (!alive) return;
      const { state: s, me: m, overlay: o } = propsRef.current;
      const busy = r.draw(s, m, o, t);
      if (busy) schedule();
      else timer.current = window.setTimeout(schedule, 250);
    };
    kick.current = () => {
      if (raf.current) return;
      clearTimeout(timer.current);
      schedule();
    };
    kick.current();
    const ro = new ResizeObserver(() => kick.current());
    ro.observe(c);
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      clearTimeout(timer.current);
      clearTimeout(fallback);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    kick.current();
  }, [state, overlay]);

  // pointer handling: tap vs drag vs pinch
  useEffect(() => {
    const c = ref.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinch0 = 0;
    let zoom0 = 1;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already released pointers */
      }
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        downAt = { ...local(e), t: performance.now() };
        moved = false;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        zoom0 = rendererRef.current!.cam.zoom;
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = rendererRef.current!;
      const p = local(e);
      if (!pointers.has(e.pointerId)) {
        onHover?.(r.hexAt(p.x, p.y));
        return;
      }
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        r.cam.zoom = Math.max(1, Math.min(3.5, zoom0 * (d / Math.max(1, pinch0))));
        moved = true;
        return;
      }
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 8) moved = true;
      if (moved && r.cam.zoom > 1) {
        r.cam.panX += p.x - prev.x;
        r.cam.panY += p.y - prev.y;
      }
      onHover?.(r.hexAt(p.x, p.y));
      kick.current();
    };
    const onUp = (e: PointerEvent) => {
      const r = rendererRef.current!;
      const p = local(e);
      pointers.delete(e.pointerId);
      if (!moved && downAt && pointers.size === 0) {
        const h = r.hexAt(p.x, p.y);
        if (h) {
          if (e.button === 2) onContext?.(h);
          else onTile?.(h);
        }
      }
      if (pointers.size === 0) downAt = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rendererRef.current!;
      const before = r.cam.zoom;
      r.cam.zoom = Math.max(1, Math.min(3.5, before * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (r.cam.zoom === 1) {
        r.cam.panX = 0;
        r.cam.panY = 0;
      }
      kick.current();
    };
    const onLeave = () => onHover?.(null);
    const onCtx = (e: MouseEvent) => e.preventDefault();
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', onLeave);
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('contextmenu', onCtx);
    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('pointerleave', onLeave);
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('contextmenu', onCtx);
    };
  }, [onTile, onHover, onContext]);

  return <canvas ref={ref} aria-label="Hex battlefield" role="img" />;
}
