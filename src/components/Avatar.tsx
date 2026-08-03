import { AVATAR_CENTER, AVATAR_GRID, computeAvatarPattern } from "../lib/avatar.ts";
import { accentSwatch, type AccentId } from "../lib/theme.ts";

/** Outer frame and gridline weight (CSS px). The frame is part of the
 *  component — consumers must not stack their own border on top. */
const FRAME = 1;
const LINE = 1;

/** Mixes a hex color into white — the highlighted row/column reads as a
 *  light tint rather than the full, bright accent (that's reserved for the
 *  center letter tile). */
function tint(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (channel: number) => Math.round(255 * (1 - ratio) + channel * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** A generated, crossword-styled avatar — see lib/avatar.ts. Used for every
 *  profile, including the signed-in user's own — there's no photo to show
 *  instead (see the removed lib/auth.ts avatarUrl).
 *
 *  All geometry is computed in whole CSS pixels at the requested size — a
 *  real per-size layout, not one coordinate space scaled down — so the
 *  gridlines and the built-in 1px frame land on pixel boundaries at every
 *  size instead of antialiasing into sub-pixel seams. The outer ring shows
 *  as half-tiles (the old viewBox crop) so the center letter tile stays
 *  the focal point: the strips weigh 0.5 / 1 / 0.5 of a cell. */
export function Avatar({
  username,
  displayName,
  size = 32,
  accent,
  className,
}: {
  username: string;
  displayName: string;
  size?: number;
  /** The profile's stored accent — colour is never derived client-side. */
  accent: AccentId;
  className?: string;
}) {
  const { open, highlight, letter } = computeAvatarPattern(username, displayName);
  const swatch = accentSwatch(accent);
  const tinted = tint(swatch, 0.35);

  // Strip extents via cumulative rounding, so the strips always total
  // exactly the available space and every strip keeps at least a pixel.
  const span = AVATAR_GRID - 1;
  const avail = Math.max(size - 2 * FRAME - (AVATAR_GRID - 1) * LINE, AVATAR_GRID);
  let cum = 0;
  const stops = Array.from({ length: AVATAR_GRID }, (_, i) => {
    cum += i === 0 || i === AVATAR_GRID - 1 ? 0.5 : 1;
    return Math.round((cum / span) * avail);
  });
  const startOf = (i: number) => FRAME + (i > 0 ? stops[i - 1] : 0) + i * LINE;
  const sizeOf = (i: number) => stops[i] - (i > 0 ? stops[i - 1] : 0);
  const centerMid = startOf(AVATAR_CENTER) + sizeOf(AVATAR_CENTER) / 2;

  return (
    <svg
      className={className ? `avatar ${className}` : "avatar"}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={displayName || username}
    >
      {/* One black backdrop supplies the frame, the gridlines, and the
          blocked squares in a single fill; open cells are punched on top as
          exact-pixel rects, so there's never a seam to antialias. */}
      <rect x={0} y={0} width={size} height={size} fill="#000" shapeRendering="crispEdges" />
      {open.map((row, r) =>
        row.map((isOpen, c) => {
          if (!isOpen) return null;
          const isCenter = r === AVATAR_CENTER && c === AVATAR_CENTER;
          const isHighlighted =
            (highlight.axis === "row" && r === highlight.index) ||
            (highlight.axis === "col" && c === highlight.index);
          const fill = isCenter ? swatch : isHighlighted ? tinted : "#ededed";
          return (
            <rect
              key={`${r}-${c}`}
              x={startOf(c)}
              y={startOf(r)}
              width={sizeOf(c)}
              height={sizeOf(r)}
              fill={fill}
              shapeRendering="crispEdges"
            />
          );
        }),
      )}
      {/* The app's body face (loaded globally in index.html), not the
          decorative "Jaro" brand-title face — it's already on the page, so
          an inline SVG <text> here picks it up for free. */}
      <text
        x={centerMid}
        y={centerMid}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='"SN Pro", ui-sans-serif, sans-serif'
        fontWeight={800}
        fontSize={sizeOf(AVATAR_CENTER) * 0.9}
        fill="#000"
      >
        {letter}
      </text>
    </svg>
  );
}
