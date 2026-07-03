-- Turn syndicated_puzzles into the canonical store for every syndicated
-- puzzle (not just admin-fixed ones), and add a single paginated,
-- date-sorted feed spanning it and `puzzles` (community/authored) — the
-- homepage no longer renders these as two separate lists.

alter table syndicated_puzzles
  add column iso_date date,
  add column weekday text,
  add column title text,
  add column author text,
  -- Mirrors SOURCE_ORDER's index in src/lib/sources.ts — the existing
  -- same-day, cross-source tie-break. Computed in TypeScript when writing a
  -- row (backfill + fetch scripts); never re-derived in SQL, so
  -- SOURCE_ORDER stays the one source of truth for source ordering.
  add column source_priority smallint not null default 0;

create index syndicated_puzzles_iso_date_idx on syndicated_puzzles (iso_date desc, source_priority);
create index puzzles_created_at_idx on puzzles (created_at desc);

-- One merged, keyset-paginated feed of community + syndicated puzzles,
-- newest first, with a same-day community-before-syndicated tie-break.
--
-- SECURITY INVOKER (the default) deliberately, not DEFINER: the `puzzles`
-- branch runs under the caller's own row-level security, so its visibility
-- rules (own puzzles, public-from-followed, mutual-from-mutual — see
-- 20260702125030_initial_schema.sql) apply unmodified instead of being
-- hand-duplicated here and risking drift the next time that policy changes.
--
-- Sort keys are inverted (negative epoch) so a plain ascending keyset
-- predicate reads as "newest first": `neg_date` orders by day, `kind` breaks
-- ties community-before-syndicated, `tie` breaks ties within a kind
-- (newest-created-first for community, SOURCE_ORDER for syndicated), and
-- `item_id` is a final deterministic tiebreak.
create or replace function list_archive_feed(
  p_include_following boolean default true,
  p_cursor_neg_date double precision default null,
  p_cursor_kind smallint default null,
  p_cursor_tie double precision default null,
  p_cursor_id text default null,
  p_page_size int default 24
) returns table (
  kind smallint,
  item_id text,
  iso_date date,
  title text,
  source text,
  weekday text,
  author text,
  author_id uuid,
  completions int,
  neg_date double precision,
  tie double precision
) language sql stable as $$
  with merged as (
    select
      0::smallint as kind,
      p.id::text as item_id,
      p.created_at::date as iso_date,
      p.title,
      null::text as source,
      null::text as weekday,
      null::text as author, -- community puzzles show their author's profile, hydrated by author_id
      p.author_id,
      p.completions,
      -extract(epoch from p.created_at::date) as neg_date,
      -extract(epoch from p.created_at) as tie
    from puzzles p
    where p_include_following
      and p.created_at::date <= current_date
      and p.author_id <> auth.uid() -- the viewer's own puzzles live in "My Puzzles", not this feed
    union all
    select
      1::smallint as kind,
      s.source || ':' || s.puzzle_date as item_id,
      s.iso_date,
      s.title,
      s.source,
      s.weekday,
      s.author,
      null::uuid as author_id,
      null::int as completions,
      -extract(epoch from s.iso_date) as neg_date,
      s.source_priority::double precision as tie
    from syndicated_puzzles s
    where s.iso_date <= current_date -- never leak a puzzle fetched ahead of its publish date
  )
  select * from merged
  where p_cursor_neg_date is null
     or (neg_date, kind, tie, item_id) > (p_cursor_neg_date, p_cursor_kind, p_cursor_tie, p_cursor_id)
  order by neg_date, kind, tie, item_id
  limit p_page_size;
$$;

grant execute on function list_archive_feed to anon, authenticated;
