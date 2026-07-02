-- The site creator (and anyone else granted this later) can fix up
-- syndicated puzzles that parsed badly, without needing a git commit.
alter table profiles add column is_admin boolean not null default false;

-- Syndicated puzzles' canonical database copy. New syndication (or an admin
-- fixing bad parsing) writes here directly instead of a static
-- public/puzzles/<source>/<date>.json file, so it doesn't need a deploy.
-- The solver checks here first and only falls back to the static file for
-- puzzles never touched since this table was introduced.
create table syndicated_puzzles (
  source text not null,
  puzzle_date text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (source, puzzle_date)
);
alter table syndicated_puzzles enable row level security;

-- Readable by anyone (signed in or not) — same visibility as the static
-- files they replace.
create policy "syndicated puzzles are public" on syndicated_puzzles
  for select using (true);

-- Only admins can create/edit/remove one.
create policy "admins manage syndicated puzzles" on syndicated_puzzles
  for all to authenticated using (
    exists (select 1 from profiles where user_id = auth.uid() and is_admin)
  ) with check (
    exists (select 1 from profiles where user_id = auth.uid() and is_admin)
  );

-- Unpublished Builder work-in-progress, visible only to its author (the
-- "own rows" clause in the puzzles RLS policy already covers every tier).
alter table puzzles drop constraint puzzles_visibility_check;
alter table puzzles add constraint puzzles_visibility_check
  check (visibility in ('public', 'mutual', 'unlisted', 'draft'));
