import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { AnagramTile } from "../hooks/useAnagramPool.ts";
import { LockIcon } from "./icons.tsx";

// How long a second tap on the same tile counts as a "double tap" (touch
// only — a mouse click toggles the lock right away).
const DOUBLE_TAP_MS = 350;

/** The scrambled-letter tiles, laid out in a circle or grid and draggable to
 * reorder (works with both touch and mouse). Shared by the mobile overlay and
 * the desktop dialog.
 *
 * Dragging *swaps* the grabbed tile with whatever sits in the slot under the
 * pointer — a single exchange, so the rest of the list stays put (rather than
 * the whole ring rotating). While dragging, the grabbed tile shows as a faded
 * ghost in the target slot and a clone follows the finger/cursor.
 *
 * Swaps are cumulative: the grabbed tile carries its current position, so
 * sweeping it over several letters swaps it with each in turn (it ends up where
 * you drop it, having traded places with everything it crossed) rather than
 * always exchanging with the tile in its original slot.
 *
 * Clicking (mouse) or double-tapping (touch) a tile locks it: it's skipped by
 * shuffle and can't be dragged or swapped into, so you can pin the letters
 * you're sure of and keep working the rest. */
export function AnagramTiles({
  tiles,
  view,
  onReorder,
  onToggleLock,
  emptyText,
}: {
  tiles: AnagramTile[];
  view: "circle" | "grid";
  onReorder: (tiles: AnagramTile[]) => void;
  onToggleLock: (id: number) => void;
  emptyText: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The tile being dragged (by stable id) plus the pointer position relative to
  // the tiles area, so the clone can follow the finger / cursor.
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Grid tiles sit in normal flow, so reordering them snaps instantly. FLIP the
  // moved ones — translate each from its previous position to its new one then
  // release to the CSS transition — so a swap glides as it happens, the same as
  // the circle's transform animation. (Circle tiles are positioned by transform
  // already, so they animate on their own and are skipped here.)
  const prevRects = useRef(new Map<string, { left: number; top: number }>());
  const prevOrder = useRef("");
  const rafRef = useRef(0);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || view !== "grid") {
      prevRects.current.clear();
      prevOrder.current = "";
      return;
    }
    // Only animate when the order actually changed — not on the pointer-move
    // re-renders in between, which would re-measure mid-flight and fight the
    // running transition.
    const order = tiles.map((t) => t.id).join(",");
    if (order === prevOrder.current) return;

    const els = [
      ...container.querySelectorAll<HTMLElement>(
        ".ana-tile:not(.ana-floating)",
      ),
    ];
    // Clear any in-flight transform so we measure true settled positions.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    els.forEach((el) => {
      el.style.transition = "none";
      el.style.transform = "";
    });
    const next = new Map<string, { left: number; top: number }>();
    const flips: Array<[HTMLElement, number, number]> = [];
    els.forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      const rect = el.getBoundingClientRect();
      next.set(id, { left: rect.left, top: rect.top });
      const prev = prevRects.current.get(id);
      if (!prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (dx || dy) flips.push([el, dx, dy]);
    });
    // Pin each moved tile to its old position…
    flips.forEach(([el, dx, dy]) => {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    // …then release on the next frame so the browser paints the pinned state
    // first and actually runs the transition to the new slot (releasing in the
    // same frame gets coalesced into no animation).
    rafRef.current = requestAnimationFrame(() => {
      els.forEach((el) => {
        el.style.transition = "";
        el.style.transform = "";
      });
    });
    prevRects.current = next;
    prevOrder.current = order;
  });

  // The live order during a drag and the grabbed tile's current index in it
  // (updated on each swap so swaps compound), plus each slot's centre (client
  // coords), snapshotted at grab time for stable grid hit-testing.
  const orderRef = useRef<AnagramTile[]>([]);
  const curIndexRef = useRef(0);
  const slotsRef = useRef<{ x: number; y: number }[]>([]);

  // Whether the current pointer session actually swapped anything — a plain
  // tap (down/up with no move in between) leaves this false, which is how a
  // click/double-tap is told apart from a drag for lock-toggling purposes.
  const movedRef = useRef(false);
  // Last tap's tile + time, for touch double-tap detection (mouse toggles on
  // a single click instead — see onTileUp).
  const lastTapRef = useRef<{ id: number; time: number } | null>(null);

  const relPos = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (id: number) => (e: PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // no active pointer (e.g. synthetic events) — capture is best-effort
    }
    movedRef.current = false;
    // Locked tiles can't be picked up — skip the drag setup entirely so
    // onMovePointer (which bails on a null drag ref) leaves them in place.
    // The pointerdown/up still runs through to onTileUp below, so tapping a
    // locked tile still unlocks it.
    const tile = tiles.find((t) => t.id === id);
    if (tile?.locked) return;
    orderRef.current = tiles;
    curIndexRef.current = tiles.findIndex((t) => t.id === id);
    slotsRef.current = [
      ...(ref.current?.querySelectorAll<HTMLElement>(".ana-tile") ?? []),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const p = relPos(e);
    setDrag({ id, x: p.x, y: p.y });
  };

  const onMovePointer = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = relPos(e);
    const order = orderRef.current;
    const cur = curIndexRef.current;
    const n = order.length;
    let target = cur;

    if (view === "circle" && n > 1) {
      // Map the pointer's angle around the centre straight to a slot index.
      // Independent of the current ordering, so it can't oscillate.
      const r = ref.current!.getBoundingClientRect();
      const ang = Math.atan2(p.y - r.height / 2, p.x - r.width / 2);
      let bestDiff = Infinity;
      for (let i = 0; i < n; i++) {
        const slot = (i / n) * 2 * Math.PI - Math.PI / 2;
        const delta = Math.abs(
          Math.atan2(Math.sin(ang - slot), Math.cos(ang - slot)),
        );
        if (delta < bestDiff) {
          bestDiff = delta;
          target = i;
        }
      }
    } else if (view === "grid") {
      // Nearest slot centre, hit-tested against the grab-time snapshot so the
      // target stays stable even as the swap moves tiles around.
      let bestDist = Infinity;
      slotsRef.current.forEach((s, i) => {
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          target = i;
        }
      });
    }

    // Locked tiles hold their slot — skip the swap if the pointer's over one,
    // rather than bumping it out of place.
    if (target !== cur && target >= 0 && target < n && !order[target]?.locked) {
      // Swap the grabbed tile (at its current index) with the tile in the slot
      // under the pointer, then remember its new index so the next swap builds
      // on this one.
      const next = [...order];
      [next[cur], next[target]] = [next[target], next[cur]];
      orderRef.current = next;
      curIndexRef.current = target;
      movedRef.current = true;
      onReorder(next);
    }
    setDrag({ id: d.id, x: p.x, y: p.y });
  };

  const onUp = () => setDrag(null);

  // Fires on the tile that was originally grabbed (pointer capture keeps
  // routing events there even as tiles swap around under it). A tap that
  // didn't turn into a drag toggles the lock — immediately for a mouse
  // click, or on the second tap within DOUBLE_TAP_MS for touch, so a single
  // tap while reaching for a drag doesn't lock something by accident.
  const onTileUp = (id: number) => (e: PointerEvent) => {
    if (movedRef.current) return;
    if (e.pointerType === "mouse") {
      onToggleLock(id);
      return;
    }
    const last = lastTapRef.current;
    if (last && last.id === id && Date.now() - last.time < DOUBLE_TAP_MS) {
      onToggleLock(id);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { id, time: Date.now() };
    }
  };

  const radius = Math.min(95, 30 + tiles.length * 8);

  const slotStyle = (i: number): CSSProperties | undefined => {
    if (view !== "circle") return undefined;
    const a = (i / tiles.length) * 2 * Math.PI - Math.PI / 2;
    return {
      transform: `translate(-50%, -50%) translate(${Math.cos(a) * radius}px, ${
        Math.sin(a) * radius
      }px)`,
    };
  };

  const dragged = drag ? tiles.find((t) => t.id === drag.id) : undefined;

  return (
    <div
      className={`ana-tiles ana-${view} ${drag ? "ana-dragging" : ""}`}
      ref={ref}
      onPointerMove={onMovePointer}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {tiles.length === 0 ? (
        <span className="ana-empty">{emptyText}</span>
      ) : (
        tiles.map((tile, i) => {
          const isDrag = drag?.id === tile.id;
          return (
            <span
              key={tile.id}
              data-i={i}
              data-id={tile.id}
              data-dragging={isDrag ? "true" : "false"}
              className={`ana-tile ${isDrag ? "ana-ghost" : ""} ${tile.locked ? "ana-locked" : ""}`}
              style={slotStyle(i)}
              onPointerDown={onDown(tile.id)}
              onPointerUp={onTileUp(tile.id)}
              title={tile.locked ? "Locked — click to unlock" : "Click, or double-tap, to lock in place"}
            >
              {tile.ch}
              {tile.locked && (
                <span className="ana-lock-badge" aria-hidden>
                  <LockIcon />
                </span>
              )}
            </span>
          );
        })
      )}
      {drag && dragged && (
        <span
          className="ana-tile ana-floating"
          data-dragging="true"
          style={{
            position: "absolute",
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%) scale(1.1)",
            transition: "none",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {dragged.ch}
        </span>
      )}
    </div>
  );
}
