-- list_archive_feed compared publish dates against the database's own
-- `current_date`, which runs in the server's (UTC) timezone. A viewer ahead
-- of UTC (e.g. AEST, UTC+10) sees "today" many hours before the server does,
-- so a puzzle already fetched and dated for the viewer's today (like a
-- Sunday puzzle synced hours ahead of the Sunday 00:00 UTC rollover) stayed
-- hidden until the server's clock caught up. Take the viewer's local date as
-- a parameter instead, and use it for both branches' publish-date cutoff.
create or replace function list_archive_feed(
  p_include_following boolean default true,
  p_cursor_neg_date double precision default null,
  p_cursor_kind smallint default null,
  p_cursor_tie double precision default null,
  p_cursor_id text default null,
  p_page_size int default 24,
  p_viewer_date date default current_date
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
      and p.created_at::date <= p_viewer_date
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
    where s.iso_date <= p_viewer_date -- never leak a puzzle fetched ahead of its publish date
  )
  select * from merged
  where p_cursor_neg_date is null
     or (neg_date, kind, tie, item_id) > (p_cursor_neg_date, p_cursor_kind, p_cursor_tie, p_cursor_id)
  order by neg_date, kind, tie, item_id
  limit p_page_size;
$$;

grant execute on function list_archive_feed to anon, authenticated;
