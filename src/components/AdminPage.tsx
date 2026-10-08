import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useProfile } from "../hooks/useProfile.ts";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { formatTime } from "../hooks/useTimer.ts";
import {
  getAdminOverview,
  getAdminUserDetail,
  searchAdminUsers,
  type AdminOverview,
  type AdminSolve,
  type AdminUserDetail,
  type AdminUserRow,
  type DailyPoint,
  type UserRef,
} from "../lib/admin.ts";
import { isSource, SOURCES } from "../lib/sources.ts";
import { VISIBILITY_LABEL } from "../lib/puzzles.ts";
import { Logo } from "./Logo.tsx";
import { Avatar } from "./Avatar.tsx";
import { TileListSkeleton } from "./Skeleton.tsx";

const BASE = import.meta.env.BASE_URL;

type Navigate = (route: string) => void;

/** "/admin" (site overview + user search) and "/admin/<username>" (one
 *  user's drill-down). Admin-only: the rpcs refuse everyone else
 *  server-side; the profile check here just skips the doomed request. */
export function AdminPage({
  username,
  onOpenArchive,
  onNavigate,
}: {
  username: string | null;
  onOpenArchive: () => void;
  onNavigate: Navigate;
}) {
  const { status } = useAuth();
  const profile = useProfile();
  useDocumentTitle(username ? `@${username} · Admin` : "Admin");

  let body: ReactNode;
  if (status === "loading" || profile === "loading") {
    body = <TileListSkeleton rows={4} />;
  } else if (!profile?.is_admin) {
    body = <p className="account-empty">This page is for admins only.</p>;
  } else if (username) {
    body = <UserDetail key={username} username={username} onNavigate={onNavigate} />;
  } else {
    body = (
      <>
        <UserSearch onNavigate={onNavigate} />
        <Overview onNavigate={onNavigate} />
      </>
    );
  }

  return (
    <div className="app account-page admin-page">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>
              {username ? (
                <>
                  <Link route="admin" onNavigate={onNavigate}>
                    Admin
                  </Link>{" "}
                  / @{username}
                </>
              ) : (
                "Admin"
              )}
            </h1>
          </div>
        </div>
      </header>
      <div className="account-body">{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ onNavigate }: { onNavigate: Navigate }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getAdminOverview().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="account-empty">Couldn't load stats: {error}</p>;
  if (!data) return <TileListSkeleton rows={4} />;

  const { users, solving, community, social, coop } = data;
  const published = community.public + community.mutual + community.unlisted;

  return (
    <>
      <Section title="Users">
        <div className="admin-stats">
          <Stat label="Users" value={users.total} sub={`+${users.new_7d} this week · +${users.new_30d} in 30d`} />
          <Stat label="Active today" value={users.active_1d} sub="solved or saved progress" />
          <Stat label="Active this week" value={users.active_7d} sub={pctOf(users.active_7d, users.total, "of users")} />
          <Stat label="Active in 30 days" value={users.active_30d} sub={pctOf(users.active_30d, users.total, "of users")} />
          <Stat label="Unclaimed sign-ins" value={users.unclaimed} sub="signed in, never picked a username" />
        </div>
      </Section>

      <Section title="Solving">
        <div className="admin-stats">
          <Stat label="Puzzles completed" value={solving.completed} sub={`${solving.completed_7d} this week · ${solving.completed_30d} in 30d`} />
          <Stat label="Completion rate" value={pct(solving.completed, solving.started)} sub={`${fmt(solving.started)} puzzles started`} />
          <Stat label="Median solve time" value={solving.median_seconds == null ? "—" : formatTime(Math.round(solving.median_seconds))} />
          <Stat label="Clean solves" value={pct(solving.clean, solving.completed)} sub="completed with no reveals" />
          <Stat label="Average rating" value={solving.avg_rating == null ? "—" : `${solving.avg_rating} / 5`} />
        </div>
      </Section>

      <Section title="Last 30 days (UTC)">
        <div className="admin-charts">
          <DailyBars data={data.daily} field="active" label="Active users" />
          <DailyBars data={data.daily} field="completed" label="Puzzles completed" />
          <DailyBars data={data.daily} field="signups" label="New users" />
        </div>
      </Section>

      <Section title="Community, social & co-op">
        <div className="admin-stats">
          <Stat label="Published puzzles" value={published} sub={`${community.public} public · ${community.mutual} mutual · ${community.unlisted} unlisted`} />
          <Stat label="Drafts" value={community.draft} sub={`${community.authors} people have published`} />
          <Stat label="Community solves" value={community.completions} sub={`${community.new_30d} published in 30d`} />
          <Stat label="Follows" value={social.follows} sub={`${social.mutual_pairs} mutual pairs · ${social.following_anyone} people follow someone`} />
          <Stat label="Co-op sessions" value={coop.sessions} sub={`${coop.completed} finished · ${coop.open} open · ${coop.sessions_30d} in 30d`} />
          <Stat label="Co-op chat" value={coop.messages} sub={coop.avg_players == null ? undefined : `${coop.avg_players} players per session`} />
        </div>
      </Section>

      <Section title="Sources">
        <Table
          empty="No syndicated puzzles started yet."
          head={["Source", "Started", "Completed", "Rate", "Solvers", "Median time", "Rating"]}
          numeric={[1, 2, 3, 4, 5, 6]}
          rows={data.sources.map((s) => [
            sourceLabel(s.source),
            fmt(s.started),
            fmt(s.completed),
            pct(s.completed, s.started),
            fmt(s.solvers),
            s.median_seconds == null ? "—" : formatTime(Math.round(s.median_seconds)),
            s.avg_rating ?? "—",
          ])}
        />
      </Section>

      <div className="admin-columns">
        <Section title="Top solvers (30 days)">
          <UserRankList
            users={data.top_solvers_30d}
            metric={(u) => `${u.completed} solved`}
            onNavigate={onNavigate}
          />
        </Section>
        <Section title="Most followed">
          <UserRankList
            users={data.most_followed}
            metric={(u) => `${u.followers} followers`}
            onNavigate={onNavigate}
          />
        </Section>
      </div>

      <Section title="Most-solved community puzzles">
        <Table
          empty="No published community puzzles yet."
          head={["Puzzle", "Author", "Visibility", "Solves", "Published"]}
          numeric={[3]}
          rows={data.top_puzzles.map((p) => [
            <Link route={`p/${p.id}`} onNavigate={onNavigate}>
              {p.title}
            </Link>,
            p.author_username ? (
              <Link route={`admin/${p.author_username}`} onNavigate={onNavigate}>
                @{p.author_username}
              </Link>
            ) : (
              "—"
            ),
            VISIBILITY_LABEL[p.visibility],
            fmt(p.completions),
            shortDate(p.created_at),
          ])}
        />
      </Section>

      <p className="account-empty">Generated {relative(data.generated_at)}.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// User search
// ---------------------------------------------------------------------------

function UserSearch({ onNavigate }: { onNavigate: Navigate }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced; an empty query lists the most recently active users.
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      searchAdminUsers(query, query.trim() ? 50 : 15).then(
        (r) => !stale && (setRows(r), setError(null)),
        (e: Error) => !stale && setError(e.message),
      );
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <Section title={query.trim() ? "Find a user" : "Find a user — recently active"}>
      <input
        className="text-input admin-search"
        type="search"
        placeholder="Search by username, name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {error ? (
        <p className="account-empty">Search failed: {error}</p>
      ) : rows === null ? (
        <TileListSkeleton rows={2} avatar />
      ) : (
        <Table
          empty="No users match."
          head={["User", "Email", "Joined", "Last active", "Solved", "Following", "Followers", "Puzzles"]}
          numeric={[4, 5, 6, 7]}
          rows={rows.map((u) => [
            <UserCell user={u} admin={u.is_admin} onNavigate={onNavigate} />,
            u.email ?? "—",
            shortDate(u.created_at),
            u.last_active_at ? relative(u.last_active_at) : "never",
            fmt(u.solved),
            fmt(u.following),
            fmt(u.followers),
            fmt(u.puzzles),
          ])}
        />
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// One user
// ---------------------------------------------------------------------------

function UserDetail({ username, onNavigate }: { username: string; onNavigate: Navigate }) {
  const [data, setData] = useState<AdminUserDetail | null | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getAdminUserDetail(username).then(setData, (e: Error) => setError(e.message));
  }, [username]);

  if (error) return <p className="account-empty">Couldn't load @{username}: {error}</p>;
  if (data === "loading") return <TileListSkeleton rows={4} avatar />;
  if (!data) return <p className="account-empty">No user called @{username}.</p>;

  const { profile: p, stats } = data;
  return (
    <>
      <div className="account-summary">
        <Avatar username={p.username} displayName={p.display_name} accent={p.accent} size={48} />
        <div className="account-identity">
          <div className="account-display-name">
            {p.display_name}
            {p.is_admin && <span className="admin-badge">admin</span>}
          </div>
          <div className="savedata-status">
            @{p.username}
            {p.email && ` · ${p.email}`}
            {p.provider && ` · via ${p.provider}`}
          </div>
          <div className="savedata-status">
            Joined {shortDate(p.created_at)} · last signed in{" "}
            {p.last_sign_in_at ? relative(p.last_sign_in_at) : "never"} · last active{" "}
            {p.last_active_at ? relative(p.last_active_at) : "never"}
          </div>
        </div>
      </div>

      <Section title="Activity">
        <div className="admin-stats">
          <Stat label="Completed" value={stats.completed} sub={`${stats.completed_30d} in 30d · ${fmt(stats.started)} started`} />
          <Stat label="Clean solves" value={pct(stats.clean, stats.completed)} sub="no reveals" />
          <Stat label="Median solve time" value={stats.median_seconds == null ? "—" : formatTime(Math.round(stats.median_seconds))} />
          <Stat label="Total time solving" value={hours(stats.total_seconds)} />
          <Stat label="Active days (30d)" value={stats.active_days_30d} />
          <Stat label="Co-op" value={stats.sessions} sub={`sessions · ${stats.messages} chat messages`} />
          <Stat label="Average rating" value={stats.avg_rating == null ? "—" : `${stats.avg_rating} / 5`} />
        </div>
      </Section>

      {data.sources.length > 0 && (
        <Section title="Where they solve">
          <Table
            head={["Source", "Started", "Completed", "Rate"]}
            numeric={[1, 2, 3]}
            rows={data.sources.map((s) => [
              s.source === "community" ? "Community puzzles" : sourceLabel(s.source),
              fmt(s.started),
              fmt(s.completed),
              pct(s.completed, s.started),
            ])}
          />
        </Section>
      )}

      <div className="admin-columns">
        <Section title={`Following (${data.following.length})`}>
          <FollowList users={data.following} empty="Not following anyone." onNavigate={onNavigate} />
        </Section>
        <Section title={`Followers (${data.followers.length})`}>
          <FollowList users={data.followers} empty="No followers." onNavigate={onNavigate} />
        </Section>
      </div>

      <Section title={`Puzzles (${data.puzzles.length})`}>
        <Table
          empty="Hasn't made any puzzles."
          head={["Title", "Visibility", "Size", "Solves", "Solvers", "Created"]}
          numeric={[3, 4]}
          rows={data.puzzles.map((pz) => [
            // Drafts are author-only — even an admin can't open one.
            pz.visibility === "draft" ? (
              pz.title
            ) : (
              <Link route={`p/${pz.id}`} onNavigate={onNavigate}>
                {pz.title}
              </Link>
            ),
            VISIBILITY_LABEL[pz.visibility],
            pz.width && pz.height ? `${pz.width}×${pz.height}` : "—",
            fmt(pz.completions),
            fmt(pz.solvers),
            shortDate(pz.created_at),
          ])}
        />
      </Section>

      <Section title={`Recent solves (${data.solves.length}${data.solves.length === 200 ? "+" : ""})`}>
        <Table
          empty="Hasn't started a puzzle."
          head={["Puzzle", "Status", "Time", "Reveals", "Rating", "Last played"]}
          numeric={[2, 3, 4]}
          rows={data.solves.map((s) => [
            <SolveTitle solve={s} onNavigate={onNavigate} />,
            s.completed_at
              ? "Solved"
              : s.filled != null && s.total
                ? `${Math.round((s.filled / s.total) * 100)}% filled`
                : "Started",
            s.elapsed == null ? "—" : formatTime(Math.round(s.elapsed)),
            s.revealed || "—",
            s.rating ? "★".repeat(s.rating) : "—",
            relative(s.updated_at),
          ])}
        />
      </Section>

      {data.sessions.length > 0 && (
        <Section title={`Co-op sessions (${data.sessions.length})`}>
          <Table
            head={["Puzzle", "Status", "Players", "Messages", "Started"]}
            numeric={[2, 3]}
            rows={data.sessions.map((s) => [
              s.title ?? (s.source ? sourceLabel(s.source) : "Community puzzle"),
              s.status,
              fmt(s.players),
              fmt(s.messages),
              relative(s.created_at),
            ])}
          />
        </Section>
      )}
    </>
  );
}

function SolveTitle({ solve: s, onNavigate }: { solve: AdminSolve; onNavigate: Navigate }) {
  if (s.puzzle_id) {
    return (
      <Link route={`p/${s.puzzle_id}`} onNavigate={onNavigate}>
        {s.title ?? "Community puzzle"}
      </Link>
    );
  }
  const label = s.source ? sourceLabel(s.source) : "Puzzle";
  return (
    <Link route={`${s.source}/${s.puzzle_date}`} onNavigate={onNavigate}>
      {label} · {puzzleDate(s.puzzle_date)}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{typeof value === "number" ? fmt(value) : value}</span>
      {sub && <span className="admin-stat-sub">{sub}</span>}
    </div>
  );
}

/** One day-per-bar series. Single series, so no legend — the heading names
 *  it; hovering a bar swaps the heading's total for that day's figure. */
function DailyBars({
  data,
  field,
  label,
}: {
  data: DailyPoint[];
  field: "signups" | "active" | "completed";
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d[field]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const W = 300;
  const H = 90;
  const step = W / Math.max(values.length, 1);
  const barW = Math.max(step - 2, 1); // 2px surface gap between bars

  const readout =
    hover == null
      ? field === "active"
        ? `peak ${fmt(Math.max(0, ...values))} / day`
        : `${fmt(total)} total`
      : `${dayLabel(data[hover].day)} · ${fmt(values[hover])}`;

  return (
    <figure className="admin-chart">
      <figcaption>
        <span className="admin-stat-label">{label}</span>
        <span className="admin-chart-readout">{readout}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, daily for the last ${values.length} days: ${values.join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="admin-chart-axis" />
        {values.map((v, i) => {
          const h = v === 0 ? 0 : Math.max((v / max) * (H - 4), 2);
          return (
            <g key={data[i].day} onMouseEnter={() => setHover(i)}>
              {/* Full-height hit target, wider than the bar itself. */}
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              <rect
                x={i * step + 1}
                y={H - 1 - h}
                width={barW}
                height={h}
                className={`admin-chart-bar${hover === i ? " hover" : ""}`}
              />
            </g>
          );
        })}
      </svg>
      <div className="admin-chart-range">
        <span>{dayLabel(data[0]?.day)}</span>
        <span>{dayLabel(data[data.length - 1]?.day)}</span>
      </div>
    </figure>
  );
}

function Table({
  head,
  rows,
  numeric = [],
  empty,
}: {
  head: string[];
  rows: ReactNode[][];
  numeric?: number[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="account-empty">{empty ?? "Nothing here."}</p>;
  const num = new Set(numeric);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={num.has(i) ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className={num.has(ci) ? "num" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRankList<T extends UserRef>({
  users,
  metric,
  onNavigate,
}: {
  users: T[];
  metric: (u: T) => string;
  onNavigate: Navigate;
}) {
  if (users.length === 0) return <p className="account-empty">Nobody yet.</p>;
  return (
    <ol className="admin-user-list">
      {users.map((u) => (
        <li key={u.user_id}>
          <UserCell user={u} onNavigate={onNavigate} />
          <span className="admin-stat-sub">{metric(u)}</span>
        </li>
      ))}
    </ol>
  );
}

function FollowList({
  users,
  empty,
  onNavigate,
}: {
  users: (UserRef & { followed_at: string; mutual: boolean })[];
  empty: string;
  onNavigate: Navigate;
}) {
  if (users.length === 0) return <p className="account-empty">{empty}</p>;
  return (
    <ul className="admin-user-list">
      {users.map((u) => (
        <li key={u.user_id}>
          <UserCell user={u} onNavigate={onNavigate} />
          <span className="admin-stat-sub">
            {u.mutual ? "mutual · " : ""}
            {shortDate(u.followed_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UserCell({
  user: u,
  admin,
  onNavigate,
}: {
  user: UserRef;
  admin?: boolean;
  onNavigate: Navigate;
}) {
  return (
    <Link route={`admin/${u.username}`} onNavigate={onNavigate} className="admin-user-cell">
      <Avatar username={u.username} displayName={u.display_name} accent={u.accent} size={24} />
      <span>
        {u.display_name} <span className="admin-stat-sub">@{u.username}</span>
        {admin && <span className="admin-badge">admin</span>}
      </span>
    </Link>
  );
}

/** A real link (so cmd-click opens a tab) that navigates in-app otherwise. */
function Link({
  route,
  onNavigate,
  className,
  children,
}: {
  route: string;
  onNavigate: Navigate;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(route);
  };
  return (
    <a href={BASE + route} onClick={onClick} className={["admin-link", className].filter(Boolean).join(" ")}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString();

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

const pctOf = (part: number, whole: number, suffix: string) =>
  whole > 0 ? `${pct(part, whole)} ${suffix}` : undefined;

const hours = (seconds: number) =>
  seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`;

const sourceLabel = (s: string) => (isSource(s) ? SOURCES[s].label : s);

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dayLabel(day: string | undefined): string {
  if (!day) return "";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Syndicated puzzle ids are usually YYYYMMDD; anything else (e.g. the
 *  Seattle midi's sequential ids) is shown as-is. */
function puzzleDate(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d);
  return m ? dayLabel(`${m[1]}-${m[2]}-${m[3]}`) + ` ${m[1]}` : d;
}

function relative(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return shortDate(iso);
}
