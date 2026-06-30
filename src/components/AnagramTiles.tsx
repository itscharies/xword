import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AnagramTile } from "../hooks/useAnagramPool.ts";

/** The scrambled-letter tiles, laid out in a circle or grid and draggable to
 * reorder (works with both touch and mouse). Shared by the mobile overlay and
 * the desktop dialog. */
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

  // The tile being dragged: its index plus the pointer position (relative to
  // the tiles area) so it can follow the finger / cursor.
  const [drag, setDrag] = useState<{ i: number; x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const relPos = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (i: number) => (e: PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // no active pointer (e.g. synthetic events) — capture is best-effort
    }
    const p = relPos(e);
    setDrag({ i, x: p.x, y: p.y });
  };

  const onMovePointer = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = relPos(e);
    const n = tiles.length;
    let best = d.i;

    if (view === "circle" && n > 1) {
      // Map the pointer's angle around the centre straight to a slot index.
      // This mapping doesn't depend on the current ordering, so unlike a
      // nearest-neighbour hit-test it can't oscillate when neighbours shift
      // under the pointer (the first/last-tile flicker).
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
    } else {
      // Grid: reorder to whichever other tile's centre the pointer is nearest.
      let bestDist = Infinity;
      ref.current?.querySelectorAll<HTMLElement>(".ana-tile").forEach((el) => {
        const idx = Number(el.dataset.i);
        if (idx === d.i) return;
        const rr = el.getBoundingClientRect();
        const dx = e.clientX - (rr.left + rr.width / 2);
        const dy = e.clientY - (rr.top + rr.height / 2);
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
    }

    if (best !== d.i) {
      onMove(d.i, best);
      setDrag({ i: best, x: p.x, y: p.y });
    } else {
      setDrag({ i: d.i, x: p.x, y: p.y });
    }
  };

  const onUp = () => setDrag(null);

  const radius = Math.min(95, 30 + tiles.length * 8);

  return (
    <div
      className={`ana-tiles ana-${view}`}
      ref={ref}
      onPointerMove={onMovePointer}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {tiles.length === 0 ? (
        <span className="ana-empty">{emptyText}</span>
      ) : (
        tiles.map((tile, i) => {
          const isDrag = drag?.i === i;
          let style: CSSProperties | undefined;
          if (isDrag && drag) {
            style = {
              position: "absolute",
              left: drag.x,
              top: drag.y,
              transform: "translate(-50%, -50%) scale(1.12)",
              transition: "none",
              zIndex: 5,
            };
          } else if (view === "circle") {
            const a = (i / tiles.length) * 2 * Math.PI - Math.PI / 2;
            style = {
              transform: `translate(-50%, -50%) translate(${
                Math.cos(a) * radius
              }px, ${Math.sin(a) * radius}px)`,
            };
          }
          return (
            <span
              key={tile.id}
              data-i={i}
              className={`ana-tile ${isDrag ? "dragging" : ""}`}
              style={style}
              onPointerDown={onDown(i)}
            >
              {tile.ch}
            </span>
          );
        })
      )}
    </div>
  );
}
