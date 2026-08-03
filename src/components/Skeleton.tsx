import { Logo } from "./Logo.tsx";
import { Card } from "./Card.tsx";
import { useStuck } from "../hooks/useStuck.ts";

/** Shimmering placeholder blocks shown while async data loads. Each skeleton
 *  mirrors the layout of the content it stands in for, so the real UI slots
 *  into the same space instead of jumping in. Styles live in index.css under
 *  "Skeleton loading states". */

/** One shimmering rectangle. Width/height via inline style so each call site
 *  can match the text line or box it stands in for. */
export function Sk({
  w,
  h = 12,
  lh,
  style,
  className = "",
}: {
  w: number | string;
  h?: number;
  /** Line-box height the bar stands in for. The bar stays `h` tall but sits
   *  centred in an `lh`-tall box, so the real text line lands with no shift.
   *  (A wrapper, not margins — block margins would collapse out of plain
   *  block parents like headings and shift the box.) */
  lh?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  if (lh !== undefined) {
    return (
      <span className="sk-line" style={{ width: w, height: lh, ...style }} aria-hidden>
        <span className={`skeleton ${className}`} style={{ width: "100%", height: h }} />
      </span>
    );
  }
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width: w, height: h, ...style }}
      aria-hidden
    />
  );
}

/** Stand-in for a 36px Avatar in an .ai-row (square, like the real SVG). */
function SkAvatar({ size = 36 }: { size?: number }) {
  return <Sk w={size} h={size} className="sk-avatar" />;
}

/** One archive day section of shimmering puzzle tiles. Line widths vary per
 *  tile so the section doesn't read as a repeated stamp, and every third
 *  tile drops its middle line — real days mix 2-line (source + author) and
 *  3-line (with a title) tiles, so a uniform stack would guess the feed's
 *  height wrong in one direction every time. Also shown on its own below
 *  the feed while Show more's next page is in flight. The lh values match
 *  the real tiles' 16/14/13px text line boxes. */
export function ArchiveDaySkeleton({ count }: { count: number }) {
  return (
    <section className="archive-day" aria-busy="true" aria-label="Loading puzzles">
      <h2 className="archive-day-head">
        <Sk w={150} h={14} lh={18} />
      </h2>
      <ul className="card-list">
        {Array.from({ length: count }, (_, i) => (
          <Card key={i}>
            <Sk w={`${52 + ((i * 17) % 30)}%`} h={16} lh={21} />
            {i % 3 !== 1 && <Sk w={`${68 + ((i * 23) % 24)}%`} h={14} lh={18} />}
            <Sk w={`${34 + ((i * 11) % 18)}%`} h={13} lh={17} />
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** Archive feed: a couple of day sections of puzzle tiles. */
export function ArchiveSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading puzzles">
      <ArchiveDaySkeleton count={4} />
      <ArchiveDaySkeleton count={3} />
    </div>
  );
}

/** Full-page stand-in for the Solver (and Builder, close enough) while the
 *  puzzle JSON is in flight: real header scaffold with a live Logo (so you
 *  can still navigate back), then a grid-shaped shimmer and two clue
 *  columns. */
export function SolverSkeleton({ onOpenArchive }: { onOpenArchive?: () => void }) {
  const actionbarRef = useStuck<HTMLDivElement>();
  return (
    <div className="app solver" aria-busy="true" aria-label="Loading puzzle">
      <header className="header">
        <div className="header-left">
          {onOpenArchive && <Logo onClick={onOpenArchive} />}
          {/* Heights match the real 14px h1 + 12px byline line boxes. */}
          <div className="title-block sk-stack" style={{ gap: 4 }}>
            <Sk w={180} h={16} />
            <Sk w={130} h={12} />
          </div>
        </div>
      </header>

      <div className="solve-body">
        <div className="actionbar" ref={actionbarRef}>
          {/* Check / Reveal dropdowns, two icon buttons … timer group + icons. */}
          <div className="sk-btn-row">
            <Sk w={110} h={42} />
            <Sk w={110} h={42} />
            <Sk w={42} h={42} />
            <Sk w={42} h={42} />
          </div>
          <div className="sk-btn-row">
            <Sk w={42} h={42} />
            <Sk w={80} h={42} />
            <Sk w={42} h={42} />
            <Sk w={42} h={42} />
          </div>
        </div>

        <div className="main">
          <div className="board">
            <div className="grid-fit">
              <div className="skeleton sk-grid" />
            </div>
          </div>
          <div className="clues">
            <SkClueCol lines={9} />
            <SkClueCol lines={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkClueCol({ lines }: { lines: number }) {
  return (
    <div className="clue-col">
      <Sk w={100} h={31} style={{ marginBottom: 8 }} />
      <div className="sk-stack">
        {Array.from({ length: lines }, (_, i) => (
          <Sk key={i} w={`${58 + ((i * 19) % 40)}%`} h={14} style={{ margin: "7px 8px" }} />
        ))}
      </div>
    </div>
  );
}

/** Account-page tile lists (My puzzles / Followers / Following) while their
 *  fetch is in flight. `avatar` matches the follower/following rows; without
 *  it, the My-puzzles title + meta rows. */
export function TileListSkeleton({
  rows = 3,
  avatar = false,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <ul className="card-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Card className="account-tile" key={i}>
          {avatar ? (
            <div className="ai-row">
              <SkAvatar />
              <div className="ai-row-text">
                <Sk w={90 + ((i * 37) % 60)} h={16} lh={21} />
                <Sk w={70 + ((i * 21) % 40)} h={13} lh={17} />
              </div>
            </div>
          ) : (
            <>
              <Sk w={`${46 + ((i * 29) % 34)}%`} h={16} lh={21} />
              <Sk w={`${30 + ((i * 13) % 22)}%`} h={13} lh={17} />
            </>
          )}
        </Card>
      ))}
    </ul>
  );
}

/** Whole account body while the profile row itself is still loading —
 *  summary card plus one section, so the claimed-profile layout lands in
 *  place. The wrapper mirrors .account-body's column gap, since the real
 *  summary/sections sit as direct flex children there. */
export function AccountPageSkeleton() {
  return (
    <div className="sk-account-body" aria-busy="true" aria-label="Loading account">
      <div className="account-summary">
        <SkAvatar size={48} />
        <div className="account-identity">
          {/* Display name (16px line) over @username (13px line), no gap. */}
          <Sk w={140} h={16} lh={21} />
          <Sk w={100} h={13} lh={16} />
        </div>
        {/* Sign out button. */}
        <Sk w={92} h={42} />
      </div>
      <section className="account-section">
        <div className="account-section-head">
          {/* Section title line + the "+ New" button that shares the head. */}
          <Sk w={91} h={14} lh={18} />
          <Sk w={79} h={42} />
        </div>
        <TileListSkeleton rows={2} />
      </section>
    </div>
  );
}
