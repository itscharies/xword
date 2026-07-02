-- Public-facing identity; auth.users has no username.
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "profiles readable by any signed-in user" on profiles
  for select to authenticated using (true);
create policy "insert own profile" on profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own profile" on profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One-way follow graph (no approval step).
create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table follows enable row level security;
create policy "read edges touching me" on follows
  for select to authenticated using (auth.uid() = follower_id or auth.uid() = followee_id);
create policy "create own follow" on follows
  for insert to authenticated with check (auth.uid() = follower_id);
create policy "remove own follow" on follows
  for delete to authenticated using (auth.uid() = follower_id);

-- Published Builder puzzles.
create table puzzles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  data jsonb not null,               -- grid/clues, shaped like the app's Puzzle type
  visibility text not null check (visibility in ('public', 'mutual', 'unlisted')),
  completions int not null default 0,
  created_at timestamptz not null default now()
);
alter table puzzles enable row level security;

-- Feed/browse access. Deliberately excludes visibility='unlisted' — those
-- rows never come back from a plain SELECT, only from get_puzzle_by_id()
-- below, so a shared link (unguessable UUID) is the only way in.
create policy "feed: own, or eligible via follow graph" on puzzles
  for select to authenticated using (
    author_id = auth.uid()
    or (visibility = 'public' and exists (
      select 1 from follows where follower_id = auth.uid() and followee_id = puzzles.author_id))
    or (visibility = 'mutual' and exists (
      select 1 from follows where follower_id = auth.uid() and followee_id = puzzles.author_id)
      and exists (
      select 1 from follows where follower_id = puzzles.author_id and followee_id = auth.uid()))
  );
create policy "authors write their own puzzles" on puzzles
  for insert to authenticated with check (author_id = auth.uid());
create policy "authors update their own puzzles" on puzzles
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete their own puzzles" on puzzles
  for delete to authenticated using (author_id = auth.uid());

-- The one path that can return an unlisted puzzle: caller must already know its id.
create function get_puzzle_by_id(p_id uuid) returns puzzles
language sql security definer set search_path = public as $$
  select * from puzzles where id = p_id and (
    visibility = 'unlisted'
    or author_id = auth.uid()
    or (visibility = 'public' and exists (
      select 1 from follows where follower_id = auth.uid() and followee_id = puzzles.author_id))
    or (visibility = 'mutual' and exists (
      select 1 from follows where follower_id = auth.uid() and followee_id = puzzles.author_id)
      and exists (
      select 1 from follows where follower_id = puzzles.author_id and followee_id = auth.uid()))
  ) limit 1;
$$;

-- Per-user progress. Exactly one of (source,puzzle_date) or puzzle_id is set,
-- covering syndicated puzzles and community-published puzzles respectively.
create table progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text,
  puzzle_date text,
  puzzle_id uuid references puzzles(id) on delete cascade,
  data jsonb not null,              -- the app's Progress object
  client_updated_at bigint not null,
  updated_at timestamptz not null default now(),
  check (
    (source is not null and puzzle_date is not null and puzzle_id is null)
    or (source is null and puzzle_date is null and puzzle_id is not null)
  ),
  unique (user_id, source, puzzle_date),
  unique (user_id, puzzle_id)
);
alter table progress enable row level security;
create policy "own progress only" on progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Completion counter, bumped the moment a community puzzle's progress first
-- flips to completed.
create or replace function bump_puzzle_completions() returns trigger
language plpgsql as $$
begin
  if NEW.puzzle_id is not null and (NEW.data->>'completed')::boolean is true
     and (OLD is null or (OLD.data->>'completed')::boolean is not true) then
    update puzzles set completions = completions + 1 where id = NEW.puzzle_id;
  end if;
  return NEW;
end;
$$;
create trigger progress_completion_stat after insert or update on progress
  for each row execute function bump_puzzle_completions();
