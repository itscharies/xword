-- Community puzzles were dated and gated in the feed by `created_at` — the
-- moment their row was first inserted, i.e. when the author saved their
-- first draft — cast to a date in the server's UTC timezone. The date the
-- author actually picked in the builder (data->>'isoDate') was ignored, so
-- a puzzle dated "Thursday 16 July" by a Sydney author surfaced under the
-- day they started drafting it, not their chosen day. Date and gate the
-- community branch by the puzzle's own date instead, compared against
-- p_viewer_date (the viewer's local date) exactly like the syndicated
-- branch — so it also goes live on that day in each viewer's timezone.
-- Puzzles without a date keep the old created_at behaviour.

-- data->>'isoDate' comes from the app's <input type=date> so it's "" or a
-- valid YYYY-MM-DD, but `data` is client-written jsonb: one row carrying a
-- junk value must degrade to its own fallback, not throw and take the whole
-- feed down with it.
create or replace function puzzle_publish_date(p_data jsonb, p_created timestamptz)
returns date language plpgsql immutable as $$
begin
  return coalesce(nullif(p_data->>'isoDate', '')::date, p_created::date);
exception when others then
  return p_created::date;
end;
$$;

grant execute on function puzzle_publish_date to anon, authenticated;

create or replace function list_archive_feed(
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
      -extract(epoch from p.created_at) as tie
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
      s.source_priority::double precision as tie
    from syndicated_puzzles s
    where s.iso_date <= p_viewer_date -- never leak a puzzle fetched ahead of its publish date
  ),
  page as (
    select * from merged
    where p_cursor_neg_date is null
       or (neg_date, kind, tie, item_id) > (p_cursor_neg_date, p_cursor_kind, p_cursor_tie, p_cursor_id)
    order by neg_date, kind, tie, item_id
    limit p_page_size
  )
  select
    page.*,
    coalesce(
      (select jsonb_agg(to_jsonb(mp.*))
       from list_mutual_progress(
         case when page.kind = 0 then page.item_id::uuid end,
         case when page.kind = 1 then page.source end,
         case when page.kind = 1 then split_part(page.item_id, ':', 2) end) mp),
      '[]'::jsonb) as mutual_progress
  from page
  order by neg_date, kind, tie, item_id;
$$;

grant execute on function list_archive_feed to anon, authenticated;
