-- Saved avatar accent colour. Null means "derived from the username hash" —
-- the colour every client already computes locally. A saved value overrides
-- that derivation everywhere the profile shows: avatars, and the cursor
-- colour peers see in multiplayer. The check mirrors ACCENTS in
-- src/lib/theme.ts.
alter table profiles add column accent text
  check (accent in ('red','orange','yellow','lime','green','cyan','blue',
                    'indigo','violet','pink'));

-- Adding a return column changes the row type, which `create or replace`
-- refuses — drop the old signature first (grants go with it; re-granted
-- below). Its callers (list_archive_feed, get_puzzle_with_solves,
-- get_syndicated_with_solves) all project rows with to_jsonb(mp.*), so the
-- new column reaches them without touching their definitions.
drop function if exists list_mutual_progress(uuid, text, text);

create function list_mutual_progress(
  p_puzzle_id uuid default null,
  p_source text default null,
  p_puzzle_date text default null
) returns table (
  user_id uuid,
  username text,
  display_name text,
  accent text,
  completed boolean,
  filled int,
  total int,
  updated_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    pr.user_id,
    prof.username,
    prof.display_name,
    prof.accent,
    coalesce((pr.data->>'completed')::boolean, false) as completed,
    coalesce((pr.data->>'filled')::int, 0) as filled,
    coalesce((pr.data->>'total')::int, 0) as total,
    pr.updated_at
  from progress pr
  join profiles prof on prof.user_id = pr.user_id
  where auth.uid() is not null
    and exists (select 1 from follows f
                where f.follower_id = auth.uid() and f.followee_id = pr.user_id)
    and exists (select 1 from follows f
                where f.follower_id = pr.user_id and f.followee_id = auth.uid())
    and ((p_puzzle_id is not null and pr.puzzle_id = p_puzzle_id)
      or (p_puzzle_id is null and p_source is not null and p_puzzle_date is not null
          and pr.source = p_source and pr.puzzle_date = p_puzzle_date))
  order by completed desc, filled desc, prof.username;
$$;

-- Same grants as before the drop: authenticated for real callers, anon so
-- the signed-out home feed (whose per-row subquery calls this) keeps
-- working — the auth.uid() gate returns nothing for anon anyway.
revoke execute on function list_mutual_progress from public;
grant execute on function list_mutual_progress to anon, authenticated;

-- join_session / get_session_preview: add the accent to each participant
-- so rosters and invite previews colour avatars like everywhere else.
-- Bodies otherwise identical to 20260728000000_multiplayer_sessions.sql.
create or replace function join_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sessions; pz jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into s from sessions where id = p_id;
  if s.id is null then return null; end if;

  if s.status = 'open' and s.last_activity_at < now() - interval '30 minutes' then
    update sessions set status = 'ended' where id = s.id;
    s.status := 'ended';
  end if;

  if s.status = 'open' then
    insert into session_participants (session_id, user_id)
    values (s.id, auth.uid()) on conflict do nothing;
    update sessions set last_activity_at = now() where id = s.id;
    select * into s from sessions where id = s.id;
  end if;

  if s.puzzle_id is not null then
    -- Definer read: the session id is the capability, like unlisted links.
    select data into pz from puzzles where id = s.puzzle_id;
  else
    select data into pz from syndicated_puzzles
    where source = s.source and puzzle_date = s.puzzle_date;
  end if;
  if pz is null then return null; end if;

  return jsonb_build_object(
    'session', to_jsonb(s),
    'puzzle', pz,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sp.user_id,
        'username', pr.username,
        'display_name', pr.display_name,
        'accent', pr.accent,
        'joined_at', sp.joined_at
      ) order by sp.joined_at)
      from session_participants sp
      join profiles pr on pr.user_id = sp.user_id
      where sp.session_id = s.id), '[]'::jsonb),
    'server_time', now()   -- for shared-clock skew correction
  );
end;
$$;

create or replace function get_session_preview(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', case when s.status = 'open'
                    and s.last_activity_at < now() - interval '30 minutes'
                   then 'ended' else s.status end,
    'title', coalesce(p.title, sp.data->>'title'),
    'source', s.source,
    'puzzle_date', s.puzzle_date,
    'puzzle_id', s.puzzle_id,
    'created_by', s.created_by,
    'is_participant', is_session_participant(s.id),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'username', pr.username,
        'display_name', pr.display_name,
        'accent', pr.accent))
      from session_participants m
      join profiles pr on pr.user_id = m.user_id
      where m.session_id = s.id), '[]'::jsonb)
  )
  from sessions s
  left join puzzles p on p.id = s.puzzle_id
  left join syndicated_puzzles sp
    on sp.source = s.source and sp.puzzle_date = s.puzzle_date
  where s.id = p_id;
$$;
