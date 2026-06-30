import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AnagramTile } from "../hooks/useAnagramPool.ts";

/** The scrambled-letter tiles, laid out in a circle or grid and draggable to
 * reorder (works with both touch and mouse). Shared by the mobile overlay and
 * the desktop dialog.
 *
 * While dragging, the grabbed tile stays put as a faded "ghost" marking where
 * it will land, and a separate clone follows the finger/cursor. The other tiles
 * glide (circle) or reflow apart (grid) to open the gap. Keeping the ghost in
 * its slot means there's nothing to teleport on release. */
export function AnagramTiles({
  tiles,
  view,
  onMove,
  emptyText,
}: {
  tiles: AnagramTile[];
  view: "circle" | "grid";
  onMove: (from: number, to: number) => void;
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
    const p = relPos(e);
    setDrag({ id, x: p.x, y: p.y });
  };

  const onMovePointer = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = relPos(e);
    const n = tiles.length;
    const from = tiles.findIndex((t) => t.id === d.id);
    if (from < 0) return;
    let best = from;

    if (view === "circle" && n > 1) {
      // Map the pointer's angle around the centre straight to a slot index.
      // The mapping doesn't depend on the current ordering, so unlike a
      // nearest-neighbour hit-test it can't oscillate when neighbours shift
      // under a held pointer (the old first/last-tile flicker).
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
          best = i;
        }
      }
    } else if (view === "grid") {
      // Insertion index = how many other tiles sit before the pointer in
      // reading order. Monotonic in pointer position, so it can't oscillate as
      // tiles reflow around the gap.
      let count = 0;
      ref.current?.querySelectorAll<HTMLElement>(".ana-tile").forEach((el) => {
        if (el.dataset.dragging === "true") return; // ghost + clone
        const rr = el.getBoundingClientRect();
        const cx = rr.left + rr.width / 2;
        const cy = rr.top + rr.height / 2;
        const sameRow = Math.abs(cy - e.clientY) <= rr.height / 2;
        if (cy < e.clientY - rr.height / 2 || (sameRow && cx < e.clientX))
          count++;
      });
      best = count;
    }

    if (best !== from) onMove(from, best);
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
