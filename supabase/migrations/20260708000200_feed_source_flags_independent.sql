-- The filters modal now offers "Following" and "Your puzzles" as chips in
-- one Sources row, so each can be selected without the other — but the
-- community branch gated everything on p_include_following, making
-- p_include_mine useless on its own. Split the clause so each flag governs
-- only its own rows. Same signature, so no drop-first dance this time.
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
    where p.created_at::date <= p_viewer_date
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
  )
  select * from merged
  where p_cursor_neg_date is null
     or (neg_date, kind, tie, item_id) > (p_cursor_neg_date, p_cursor_kind, p_cursor_tie, p_cursor_id)
  order by neg_date, kind, tie, item_id
  limit p_page_size;
$$;

grant execute on function list_archive_feed to anon, authenticated;
