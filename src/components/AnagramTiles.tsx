import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AnagramTile } from "../hooks/useAnagramPool.ts";

/** The scrambled-letter tiles, laid out in a circle or grid and draggable to
 * reorder (works with both touch and mouse). Shared by the mobile overlay and
 * the desktop dialog.
 *
 * Dragging *swaps* the grabbed tile with whatever sits in the slot under the
 * pointer — a single exchange, so the rest of the list stays put (rather than
 * the whole ring rotating). While dragging, the grabbed tile shows as a faded
 * ghost in the target slot and a clone follows the finger/cursor.
 *
 * The swap is always computed against `baseRef` — a snapshot of the order taken
 * when the drag began — so moving the pointer to a new slot never compounds
 * earlier swaps; it's recomputed fresh from the original layout each time. */
export function AnagramTiles({
  tiles,
  view,
  onReorder,
  emptyText,
}: {
  tiles: AnagramTile[];
  view: "circle" | "grid";
  onReorder: (tiles: AnagramTile[]) => void;
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

  // Captured at grab time: the order to swap against, the grabbed tile's index
  // in it, and each slot's centre (client coords) for stable grid hit-testing.
  const baseRef = useRef<AnagramTile[]>([]);
  const originRef = useRef(0);
  const slotsRef = useRef<{ x: number; y: number }[]>([]);

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
    baseRef.current = tiles;
    originRef.current = tiles.findIndex((t) => t.id === id);
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
    const base = baseRef.current;
    const origin = originRef.current;
    const n = base.length;
    let target = origin;

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

    if (target !== origin && target >= 0 && target < n) {
      const next = [...base];
      [next[origin], next[target]] = [next[target], next[origin]];
      onReorder(next);
    } else {
      onReorder(base);
    }
    setDrag({ id: d.id, x: p.x, y: p.y });
  };

  const onUp = () => setDrag(null);

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
              data-dragging={isDrag ? "true" : "false"}
              className={`ana-tile ${isDrag ? "ana-ghost" : ""}`}
              style={slotStyle(i)}
              onPointerDown={onDown(tile.id)}
            >
              {tile.ch}
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
