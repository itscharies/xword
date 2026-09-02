-- A session-wide chat log for co-op sessions. Lives and dies with the
-- session (FK cascade) — never persisted at the puzzle level, never
-- visible to solo solvers, and invisible to a later session on the same
-- puzzle. Append-only: no edit, no delete — just a running, scrollable
-- history everyone in the session shares.

create table session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index session_comments_by_session
  on session_comments (session_id, created_at);

alter table session_comments enable row level security;

create policy "participants read session comments" on session_comments
  for select to authenticated using (is_session_participant(session_id));

create policy "participants post session comments" on session_comments
  for insert to authenticated
  with check (is_session_participant(session_id) and author_id = auth.uid());
