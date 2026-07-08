-- The solver page issued a second round-trip (list_mutual_progress) after
-- the puzzle itself arrived, so the solves segment popped in late. Project
-- the mutual-progress list onto the puzzle fetch instead: one call returns
-- { puzzle, mutual_progress } for either kind of puzzle. Both wrap the
-- existing definer functions, so visibility rules stay in one place;
-- signed-out callers just get an empty list (list_mutual_progress requires
-- auth.uid()).

create function get_puzzle_with_solves(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'puzzle', to_jsonb(p.*),
    'mutual_progress', coalesce(
      (select jsonb_agg(to_jsonb(mp.*)) from list_mutual_progress(p_id, null, null) mp),
      '[]'::jsonb)
  )
  from get_puzzle_by_id(p_id) p
  where p.id is not null; -- not-found comes back as SQL null, not a husk of nulls
$$;

create function get_syndicated_with_solves(p_source text, p_puzzle_date text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'puzzle', s.data,
    'mutual_progress', coalesce(
      (select jsonb_agg(to_jsonb(mp.*)) from list_mutual_progress(null, p_source, p_puzzle_date) mp),
      '[]'::jsonb)
  )
  from syndicated_puzzles s
  where s.source = p_source and s.puzzle_date = p_puzzle_date;
$$;

-- Anon stays allowed: unlisted links and syndicated puzzles are reachable
-- signed out (matching get_puzzle_by_id / the public syndicated read
-- policy); the solves projection is simply empty for them.
grant execute on function get_puzzle_with_solves to anon, authenticated;
grant execute on function get_syndicated_with_solves to anon, authenticated;
