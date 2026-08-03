-- Saved avatar accent colour, non-nullable: every profile owns a concrete
-- colour. Existing rows are backfilled with the exact colour clients already
-- derive from the username (see derived_accent below), so nothing visibly
-- changes at migration time; from then on the stored value is the single
-- source of truth everywhere the profile shows — avatars, and the cursor
-- colour peers see in multiplayer. The check mirrors ACCENTS in
-- src/lib/theme.ts.
alter table profiles add column accent text
  check (accent in ('red','orange','yellow','lime','green','cyan','blue',
                    'indigo','violet','pink'));

-- JS Math.imul: uint32 multiplication mod 2^32. Two uint32s can overflow
-- bigint when multiplied directly, so widen through numeric.
create function imul32(x bigint, y bigint) returns bigint
language sql immutable as $$
  select mod(x::numeric * y::numeric, 4294967296)::bigint;
$$;

-- One step of the mulberry32 PRNG (bit-exact port of lib/avatar.ts, uint32
-- carried in bigint): a_out is the next seed state, r the [0,1) draw.
create function mulberry32_step(a_in bigint, out a_out bigint, out r double precision)
language plpgsql immutable as $$
declare t bigint;
begin
  a_out := (a_in + 1831565813) & 4294967295;                 -- a += 0x6d2b79f5
  t := imul32(a_out # (a_out >> 15), a_out | 1);             -- imul(a ^ a>>>15, 1|a)
  t := (((t + imul32(t # (t >> 7), t | 61)) & 4294967295) # t);
  t := t # (t >> 14);
  r := t / 4294967296.0;
end;
$$;

-- The accent computeAvatarPattern derives for a username with no saved
-- override: FNV-1a seeds mulberry32, and the rand stream is consumed in the
-- generator's exact order (five pattern cells, the reachability fix-up, the
-- highlight-axis pick when both axes are open) before the accent draw — so
-- this returns precisely the colour clients have been showing.
create function derived_accent(p_username text) returns text
language plpgsql immutable as $$
declare
  accents constant text[] := array['red','orange','yellow','lime','green',
                                   'cyan','blue','indigo','violet','pink'];
  a bigint := 2166136261;   -- FNV-1a offset basis (0x811c9dc5)
  r double precision;
  b01 boolean;              -- top/bottom flank pair is black
  b10 boolean;              -- left/right flank pair is black
  i int;
begin
  for i in 1..length(p_username) loop
    a := a # ascii(substr(p_username, i, 1));
    a := imul32(a, 16777619);                  -- imul(h, 0x01000193)
  end loop;

  -- Pattern cells in loop order: (0,0), (0,1), (0,2), (1,0), (1,1). Only
  -- the flank pairs steer later draws; the rest just advance the stream.
  select s.a_out, s.r into a, r from mulberry32_step(a) s;
  select s.a_out, s.r into a, r from mulberry32_step(a) s;
  b01 := r < 0.4;
  select s.a_out, s.r into a, r from mulberry32_step(a) s;
  select s.a_out, s.r into a, r from mulberry32_step(a) s;
  b10 := r < 0.4;
  select s.a_out, s.r into a, r from mulberry32_step(a) s;

  if b01 and b10 then
    -- Center enclosed: one draw picks which neighbour (and its mirror) to
    -- open, leaving exactly one open axis — no axis draw follows.
    select s.a_out, s.r into a, r from mulberry32_step(a) s;
  elsif not b01 and not b10 then
    -- Both axes open: one draw picks the highlight axis.
    select s.a_out, s.r into a, r from mulberry32_step(a) s;
  end if;

  select s.a_out, s.r into a, r from mulberry32_step(a) s;
  return accents[1 + floor(r * 10)::int];
end;
$$;

update profiles set accent = derived_accent(username) where accent is null;
alter table profiles alter column accent set not null;

-- The client sends an accent when claiming a profile; this backstops any
-- insert path that doesn't.
create function profiles_default_accent() returns trigger
language plpgsql as $$
begin
  if new.accent is null then
    new.accent := derived_accent(new.username);
  end if;
  return new;
end;
$$;
create trigger profiles_accent_default before insert on profiles
  for each row execute function profiles_default_accent();

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
