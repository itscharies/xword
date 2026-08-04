-- The archive's Type filter (Crossword / Mini / Cryptic) only described
-- syndicated sources, so switching it on dropped every community puzzle from
-- the feed. Give community puzzles a type of their own: the builder now
-- writes an explicit data->>'type' ('mini' | 'regular' | 'cryptic'), and
-- puzzles published before that field existed are categorised here from
-- what their data already says — the cryptic flag wins, then grids up to
-- 7x7 count as minis (NYT-style minis run 5-7; midis start around 9),
-- everything else is regular.
--
-- Derived at read time rather than backfilled into a column: `data` is the
-- single source of truth the builder round-trips, so a column would just be
-- a second copy to keep in sync. Mirrors puzzleTypeOf() in src/types.ts —
-- the two must stay in lockstep.
--
-- Like puzzle_publish_date: `data` is client-written jsonb, so one row with
-- junk values must degrade to a fallback, not throw and take the feed down.
create or replace function community_puzzle_type(p_data jsonb)
returns text language plpgsql immutable as $$
begin
  return case
    when p_data->>'type' in ('mini', 'regular', 'cryptic') then p_data->>'type'
    when coalesce((p_data->>'cryptic')::boolean, false) then 'cryptic'
    when greatest(coalesce((p_data->>'width')::int, 15),
                  coalesce((p_data->>'height')::int, 15)) <= 7 then 'mini'
    else 'regular'
  end;
exception when others then
  return 'regular';
end;
$$;

grant execute on function community_puzzle_type to anon, authenticated;

-- Adding puzzle_type to the output changes the return type, which
-- `create or replace` can't do — drop and recreate (transactional, so the
-- feed never observes the gap).
drop function if exists list_archive_feed(
  boolean, double precision, smallint, double precision, text, int, date, boolean);

create function list_archive_feed(
  p_include_following boolean default true,
  p_cursor_neg_date double precision default null,
  p_cursor_kind smallint default null,
  p_cursor_tie double precision default null,
  p_cursor_id text default null,
  p_page_size int default 24,
  p_viewer_date date default current_date,
  p_include_mine boolean default true
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
  tie double precision,
  puzzle_type text,
  mutual_progress jsonb
) language sql stable as $$
  with merged as (
    select
      0::smallint as kind,
      p.id::text as item_id,
      d.pub_date as iso_date,
      p.title,
      null::text as source,
      null::text as weekday,
      null::text as author, -- community puzzles show their author's profile, hydrated by author_id
      p.author_id,
      p.completions,
      -extract(epoch from d.pub_date) as neg_date,
      -extract(epoch from p.created_at) as tie,
      community_puzzle_type(p.data) as puzzle_type
    from puzzles p
    cross join lateral (select puzzle_publish_date(p.data, p.created_at) as pub_date) d
    where d.pub_date <= p_viewer_date -- scheduled-ahead puzzles stay out until their day
      -- Others' rows are already narrowed by RLS to solvable ones. Own rows
      -- come back in every visibility tier, so keep drafts out here — they
      -- aren't solvable and route to the Builder, not the Solver.
      and ((p.author_id <> auth.uid() and p_include_following)
        or (p.author_id = auth.uid() and p_include_mine and p.visibility <> 'draft'))
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
      s.source_priority::double precision as tie,
      null::text as puzzle_type -- syndicated type derives from `source` client-side
    from syndicated_puzzles s
    where s.iso_date <= p_viewer_date -- never leak a puzzle fetched ahead of its publish date
  ),
  page as (
    select * from merged
    where p_cursor_neg_date is null
       or (merged.neg_date, merged.kind, merged.tie, merged.item_id)
          > (p_cursor_neg_date, p_cursor_kind, p_cursor_tie, p_cursor_id)
    order by merged.neg_date, merged.kind, merged.tie, merged.item_id
    limit p_page_size
  )
  select
    page.kind,
    page.item_id,
    page.iso_date,
    page.title,
    page.source,
    page.weekday,
    page.author,
    page.author_id,
    page.completions,
    page.neg_date,
    page.tie,
    page.puzzle_type,
    coalesce(
      (select jsonb_agg(to_jsonb(mp.*))
       from list_mutual_progress(
         case when page.kind = 0 then page.item_id::uuid end,
         case when page.kind = 1 then page.source end,
         case when page.kind = 1 then split_part(page.item_id, ':', 2) end) mp),
      '[]'::jsonb) as mutual_progress
  from page
  order by page.neg_date, page.kind, page.tie, page.item_id;
$$;

grant execute on function list_archive_feed to anon, authenticated;
