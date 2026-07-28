-- Multiplayer co-op solve sessions. The session id (an unguessable uuid) is
-- the capability: any signed-in user with the link may join — mirroring how
-- unlisted puzzles are reachable only via get_puzzle_by_id. Live sync rides
-- a realtime broadcast channel named by the session id; this table holds the
-- durable side: the roster, lifecycle timestamps, and a throttled snapshot
-- of the shared grid for late-join/refresh hydration.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  -- Puzzle reference: exactly one of (source, puzzle_date) or puzzle_id —
  -- the same dual keying as `progress`. No FK for the syndicated pair
  -- (progress doesn't FK it either); puzzle_id cascades with the puzzle.
  source text,
  puzzle_date text,
  puzzle_id uuid references puzzles(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'completed', 'ended')),
  -- Grid snapshot for hydration only, never the live sync path. Shape is
  -- owned by the client's sync protocol (per-cell values with merge stamps);
  -- opaque jsonb here. state_version (client epoch ms, the same convention
  -- as progress.client_updated_at) gives guarded last-write-wins: writers
  -- filter on state_version < theirs so an older snapshot can't clobber a
  -- newer one.
  state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),   -- the shared clock's zero
  completed_at timestamptz,                        -- freezes the shared clock
  last_activity_at timestamptz not null default now(),
  check (
    (source is not null and puzzle_date is not null and puzzle_id is null)
    or (source is null and puzzle_date is null and puzzle_id is not null)
  )
);

-- Durable roster — presence on the realtime channel is the live layer on
-- top, but membership must survive everyone disconnecting so a session can
-- be rejoined before its inactivity timeout, and it anchors the RLS below.
create table session_participants (
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index sessions_open_by_activity on sessions (last_activity_at)
  where status = 'open';
create index session_participants_user on session_participants (user_id);

-- completed_at is stamped server-side so every participant shows the same
-- frozen solve time regardless of who won the completion race; terminal
-- states never resurrect, even from a stale client write.
create function sessions_on_status_change() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  end if;
  if old.status in ('completed', 'ended') and new.status = 'open' then
    new.status := old.status;
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;
create trigger sessions_status before update on sessions
  for each row execute function sessions_on_status_change();

alter table sessions enable row level security;
alter table session_participants enable row level security;

-- Membership check as security definer so the policies below can use it
-- without RLS recursion (a subquery on session_participants inside its own
-- select policy would recurse).
create function is_session_participant(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from session_participants
    where session_id = p_session and user_id = auth.uid()
  );
$$;

-- Participants (only) read and live-update their sessions. Non-participants
-- holding the link go through the definer RPCs below — a `using (true)`
-- select policy would make the whole table enumerable, which is exactly why
-- unlisted puzzles are excluded from the puzzles feed policy.
create policy "participants read their sessions" on sessions
  for select to authenticated using (is_session_participant(id));

create policy "participants update live sessions" on sessions
  for update to authenticated
  using (is_session_participant(id) and status <> 'ended')
  with check (is_session_participant(id));

-- Only the sync-owned columns are directly writable; identity and the
-- puzzle ref can only be set by create_session.
revoke update on table sessions from anon, authenticated;
grant update (state, state_version, status, last_activity_at)
  on sessions to authenticated;

create policy "participants see the roster" on session_participants
  for select to authenticated using (is_session_participant(session_id));
-- Deliberately no insert/update/delete policies on session_participants:
-- membership changes only via join_session. A joiner can't see the session
-- row yet (participants-only select), so a plain-insert join path couldn't
-- validate status='open' — the RPC validates and inserts atomically.

-- Create a session + creator membership atomically. `p_state` seeds the
-- snapshot from the host's current local progress so "Solve together"
-- starts from their grid.
create function create_session(
  p_source text,
  p_puzzle_date text,
  p_puzzle_id uuid,
  p_state jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_puzzle_id is not null then
    if (select id from get_puzzle_by_id(p_puzzle_id)) is null then
      raise exception 'puzzle not found';
    end if;
  elsif p_source is not null and p_puzzle_date is not null then
    if not exists (select 1 from syndicated_puzzles
                   where source = p_source and puzzle_date = p_puzzle_date) then
      raise exception 'puzzle not found';
    end if;
  else
    raise exception 'bad puzzle reference';
  end if;

  insert into sessions (created_by, source, puzzle_date, puzzle_id, state, state_version)
  values (auth.uid(), p_source, p_puzzle_date, p_puzzle_id,
          coalesce(p_state, '{}'::jsonb),
          (extract(epoch from now()) * 1000)::bigint)
  returning id into sid;
  insert into session_participants (session_id, user_id) values (sid, auth.uid());
  return sid;
end;
$$;

-- Idempotent join returning everything the client needs in one round trip.
-- Also the lazy reaper: an open session idle past the timeout flips to
-- 'ended' here, so lifecycle correctness never depends on a cron job. A
-- completed/ended session still returns its payload (the link is the
-- capability, and the "session over" screen needs the final grid) but adds
-- no membership.
create function join_session(p_id uuid) returns jsonb
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
        'joined_at', sp.joined_at
      ) order by sp.joined_at)
      from session_participants sp
      join profiles pr on pr.user_id = sp.user_id
      where sp.session_id = s.id), '[]'::jsonb),
    'server_time', now()   -- for shared-clock skew correction
  );
end;
$$;

-- Anon-callable preview for the invite gate: enough to render "you're
-- invited to solve <title> with <people>" plus the puzzle ref (so a
-- signed-in visitor can be warned their solo progress on that puzzle would
-- be replaced before they actually join). No grid, no snapshot. Applies the
-- same lazy staleness view as join_session without writing anything.
create function get_session_preview(p_id uuid) returns jsonb
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
        'display_name', pr.display_name))
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

grant execute on function create_session, join_session to authenticated;
grant execute on function get_session_preview to anon, authenticated;
