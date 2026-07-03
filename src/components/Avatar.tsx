import { AVATAR_CENTER, AVATAR_GRID, computeAvatarPattern } from "../lib/avatar.ts";

const CELL = 20;
const FULL = AVATAR_GRID * CELL;
// The outer ring of tiles is only half-shown — cropping in like this makes
// the center letter tile (always fully visible) read as the focal point
// instead of one square among many.
const CROP = FULL - CELL;
const OFFSET = CELL / 2;

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

/** A generated, crossword-styled avatar — see lib/avatar.ts. Used anywhere
 *  we show another person's profile, since a real photo only ever exists
 *  for whoever is actually signed in (see lib/auth.ts's avatarUrl). */
export function Avatar({
  username,
  displayName,
  size = 32,
  className,
}: {
  username: string;
  displayName: string;
  size?: number;
  className?: string;
}) {
  const { open, highlight, accent, letter } = computeAvatarPattern(username, displayName);
  const tinted = tint(accent.swatch, 0.35);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${OFFSET} ${OFFSET} ${CROP} ${CROP}`}
      role="img"
      aria-label={displayName || username}
    >
      {open.map((row, r) =>
        row.map((isOpen, c) => {
          const isCenter = r === AVATAR_CENTER && c === AVATAR_CENTER;
          const isHighlighted =
            (highlight.axis === "row" && r === highlight.index) ||
            (highlight.axis === "col" && c === highlight.index);
          const fill = !isOpen ? "#000" : isCenter ? accent.swatch : isHighlighted ? tinted : "#ededed";
          return (
            <rect
              key={`${r}-${c}`}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              fill={fill}
              stroke="#000"
              strokeWidth={1}
            />
          );
        }),
      )}
      {/* Same display face as the app's "The Daily Grid" brand title
          (loaded globally in index.html) — it's already on the page, so an
          inline SVG <text> here picks it up for free. */}
      <text
        x={AVATAR_CENTER * CELL + CELL / 2}
        y={AVATAR_CENTER * CELL + CELL / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Jaro, sans-serif"
        fontSize={CELL * 0.85}
        fill="#000"
      >
        {letter}
      </text>
    </svg>
  );
}
