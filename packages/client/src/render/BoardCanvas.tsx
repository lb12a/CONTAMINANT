import { useEffect, useRef } from 'react';
import type { GameState, Hex, PlayerId } from '@contaminant/engine';
import { DioramaRenderer } from './diorama.ts';
import type { Insets, Overlay } from './types.ts';

interface Props {
  state: GameState;
  me: PlayerId;
  overlay: Overlay;
  /** screen area covered by floating HUD panels */
  insets?: Insets;
  onTile?: (h: Hex) => void;
  onHover?: (h: Hex | null) => void;
  onContext?: (h: Hex) => void;
  /** exposes hex → screen mapping (for DOM overlays anchored to tiles) */
  onRenderer?: (r: DioramaRenderer | null) => void;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Interactive 2.5D board: tap/click to select, hover for info, wheel/pinch zoom, drag to pan. */
export function BoardCanvas({ state, me, overlay, insets, onTile, onHover, onContext, onRenderer }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DioramaRenderer | null>(null);
  const latest = useRef({ state, me, overlay });
  latest.current = { state, me, overlay };

  useEffect(() => {
    const el = host.current!;
    const r = new DioramaRenderer();
    rendererRef.current = r;
    r.set(latest.current.state, latest.current.me, latest.current.overlay);
    void r.init(el).then(() => {
      onRenderer?.(r);
      // QA hook: lets the Playwright scripts find tiles on screen (dev builds only)
      if (import.meta.env.DEV) (window as unknown as { __board?: DioramaRenderer }).__board = r;
    });
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      onRenderer?.(null);
      r.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.set(state, me, overlay);
  }, [state, me, overlay]);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.insets = insets ?? NO_INSETS;
  }, [insets?.top, insets?.right, insets?.bottom, insets?.left]); // eslint-disable-line react-hooks/exhaustive-deps

  // pointer handling: tap vs drag vs pinch
  useEffect(() => {
    const el = host.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let moved = false;
    let pinch0 = 0;
    let zoom0 = 1;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already released pointers */
      }
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        downAt = local(e);
        moved = false;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        zoom0 = rendererRef.current?.cam.zoom ?? 1;
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = rendererRef.current;
      if (!r) return;
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
        r.cam.zoom = Math.max(1, Math.min(3, zoom0 * (d / Math.max(1, pinch0))));
        moved = true;
        return;
      }
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 8) moved = true;
      if (moved && r.cam.zoom > 1) {
        r.cam.panX += p.x - prev.x;
        r.cam.panY += p.y - prev.y;
      }
      onHover?.(r.hexAt(p.x, p.y));
    };
    const onUp = (e: PointerEvent) => {
      const r = rendererRef.current;
      const p = local(e);
      pointers.delete(e.pointerId);
      if (r && !moved && downAt && pointers.size === 0) {
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
      const r = rendererRef.current;
      if (!r) return;
      r.cam.zoom = Math.max(1, Math.min(3, r.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (r.cam.zoom === 1) {
        r.cam.panX = 0;
        r.cam.panY = 0;
      }
    };
    const onLeave = () => onHover?.(null);
    const onCtx = (e: MouseEvent) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onCtx);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onCtx);
    };
  }, [onTile, onHover, onContext]);

  return <div ref={host} className="board-host" style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />;
}
