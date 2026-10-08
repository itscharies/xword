-- Admin stats page (/admin): site-wide figures, user search, and a per-user
-- drill-down. Every read here crosses other users' rows that RLS hides from
-- everyone (progress is own-rows-only, follows only edges touching you,
-- drafts only their author), so each function is SECURITY DEFINER and
-- refuses anyone whose profile isn't is_admin.

-- ---------------------------------------------------------------------------
-- Activity timestamps on progress
-- ---------------------------------------------------------------------------
-- progress.updated_at was only ever the insert time (the client's upsert
-- doesn't send it and nothing bumped it), so "last active" and "solved this
-- week" had nothing server-side to read. Keep it current from here on, and
-- stamp the moment a row first flips to completed.

alter table progress add column completed_at timestamptz;

-- Backfill from the client's own save clock — the best record there is for
-- rows written before this migration (clamped, in case a client clock ran
-- ahead).
update progress set updated_at = least(now(),
  greatest(updated_at, to_timestamp(client_updated_at / 1000.0)));
update progress set completed_at = updated_at
  where (data->>'completed')::boolean is true;

create function progress_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if (new.data->>'completed')::boolean is true then
    new.completed_at := coalesce(
      case when tg_op = 'UPDATE' then old.completed_at end, now());
  else
    new.completed_at := null; -- reset puzzle
  end if;
  return new;
end;
$$;
create trigger progress_touch before insert or update on progress
  for each row execute function progress_touch();

create index progress_updated_at_idx on progress (updated_at desc);
create index progress_completed_at_idx on progress (completed_at desc)
  where completed_at is not null;

-- ---------------------------------------------------------------------------
-- Gate
-- ---------------------------------------------------------------------------

-- The "insert/update own profile" policies cover the whole row, so until now
-- any signed-in user could grant themselves is_admin through the API. Only a
-- direct database role (SQL editor, service key) may set it.
create function profiles_guard_admin() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.is_admin is distinct from
         (case when tg_op = 'UPDATE' then old.is_admin else false end) then
    raise exception 'is_admin can only be changed by the database owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_admin before insert or update on profiles
  for each row execute function profiles_guard_admin();

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from profiles where user_id = auth.uid()), false);
$$;

create function assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Site-wide overview
-- ---------------------------------------------------------------------------

create function admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform assert_admin();

  select jsonb_build_object(
    'generated_at', now(),

    'users', jsonb_build_object(
      'total',       (select count(*) from profiles),
      'new_7d',      (select count(*) from profiles where created_at > now() - interval '7 days'),
      'new_30d',     (select count(*) from profiles where created_at > now() - interval '30 days'),
      -- Signed in with Google but never claimed a username.
      'unclaimed',   (select count(*) from auth.users u
                       where not exists (select 1 from profiles p where p.user_id = u.id)),
      'active_1d',   (select count(distinct user_id) from progress where updated_at > now() - interval '1 day'),
      'active_7d',   (select count(distinct user_id) from progress where updated_at > now() - interval '7 days'),
      'active_30d',  (select count(distinct user_id) from progress where updated_at > now() - interval '30 days'),
      'admins',      (select count(*) from profiles where is_admin)
    ),

    'solving', jsonb_build_object(
      'started',       (select count(*) from progress),
      'completed',     (select count(*) from progress where completed_at is not null),
      'completed_7d',  (select count(*) from progress where completed_at > now() - interval '7 days'),
      'completed_30d', (select count(*) from progress where completed_at > now() - interval '30 days'),
      'median_seconds',(select percentile_cont(0.5) within group (order by (data->>'elapsed')::numeric)
                          from progress where completed_at is not null),
      -- Completed without revealing a single cell.
      'clean',         (select count(*) from progress where completed_at is not null
                          and coalesce(jsonb_array_length(data->'revealed'), 0) = 0),
      'avg_rating',    (select round(avg((data->>'rating')::numeric), 2)
                          from progress where data ? 'rating')
    ),

    'community', jsonb_build_object(
      'public',      (select count(*) from puzzles where visibility = 'public'),
      'mutual',      (select count(*) from puzzles where visibility = 'mutual'),
      'unlisted',    (select count(*) from puzzles where visibility = 'unlisted'),
      'draft',       (select count(*) from puzzles where visibility = 'draft'),
      'authors',     (select count(distinct author_id) from puzzles where visibility <> 'draft'),
      'new_30d',     (select count(*) from puzzles where visibility <> 'draft'
                        and created_at > now() - interval '30 days'),
      'completions', (select coalesce(sum(completions), 0) from puzzles)
    ),

    'social', jsonb_build_object(
      'follows',      (select count(*) from follows),
      'mutual_pairs', (select count(*) from follows a join follows b
                         on a.follower_id = b.followee_id and a.followee_id = b.follower_id
                         where a.follower_id < a.followee_id),
      'following_anyone', (select count(distinct follower_id) from follows),
      'new_30d',      (select count(*) from follows where created_at > now() - interval '30 days')
    ),

    'coop', jsonb_build_object(
      'sessions',     (select count(*) from sessions),
      'completed',    (select count(*) from sessions where status = 'completed'),
      'open',         (select count(*) from sessions where status = 'open'),
      'sessions_30d', (select count(*) from sessions where created_at > now() - interval '30 days'),
      'avg_players',  (select round(avg(n), 2) from (
                         select count(*) n from session_participants group by session_id) x),
      'messages',     (select count(*) from session_comments)
    ),

    -- One row per day for the last 30 days (UTC), zero-filled.
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups',   (select count(*) from profiles
                        where created_at >= d and created_at < d + interval '1 day'),
        'active',    (select count(distinct user_id) from progress
                        where updated_at >= d and updated_at < d + interval '1 day'),
        'completed', (select count(*) from progress
                        where completed_at >= d and completed_at < d + interval '1 day')
      ) order by d)
      from generate_series(date_trunc('day', now()) - interval '29 days',
                           date_trunc('day', now()), interval '1 day') d
    ),

    -- Syndicated sources by solving activity.
    'sources', (
      select coalesce(jsonb_agg(row_to_json(s) order by s.started desc), '[]'::jsonb)
      from (
        select source,
               count(*) started,
               count(completed_at) completed,
               count(distinct user_id) solvers,
               percentile_cont(0.5) within group (order by (data->>'elapsed')::numeric)
                 filter (where completed_at is not null) median_seconds,
               round(avg((data->>'rating')::numeric), 2) avg_rating
        from progress where source is not null
        group by source
      ) s
    ),

    'top_puzzles', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select p.id, p.title, p.visibility, p.completions, p.created_at,
               pr.username author_username, pr.display_name author_display_name
        from puzzles p left join profiles pr on pr.user_id = p.author_id
        where p.visibility <> 'draft'
        order by p.completions desc, p.created_at desc
        limit 10
      ) t
    ),

    'most_followed', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select pr.user_id, pr.username, pr.display_name, pr.accent, count(*) followers
        from follows f join profiles pr on pr.user_id = f.followee_id
        group by pr.user_id
        order by count(*) desc, pr.username
        limit 10
      ) t
    ),

    'top_solvers_30d', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select pr.user_id, pr.username, pr.display_name, pr.accent,
               count(*) completed
        from progress g join profiles pr on pr.user_id = g.user_id
        where g.completed_at > now() - interval '30 days'
        group by pr.user_id
        order by count(*) desc, pr.username
        limit 10
      ) t
    )
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- User search
-- ---------------------------------------------------------------------------

-- Matches username, display name or email (substring, case-insensitive). An
-- empty query lists the most recently active users.
create function admin_search_users(p_query text default '', p_limit int default 50)
returns table (
  user_id uuid,
  username text,
  display_name text,
  accent text,
  is_admin boolean,
  email text,
  created_at timestamptz,
  last_active_at timestamptz,
  solved int,
  following int,
  followers int,
  puzzles int
)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform assert_admin();

  return query
  select pr.user_id, pr.username, pr.display_name, pr.accent, pr.is_admin,
         u.email::text, pr.created_at,
         (select max(g.updated_at) from progress g where g.user_id = pr.user_id),
         (select count(*)::int from progress g where g.user_id = pr.user_id and g.completed_at is not null),
         (select count(*)::int from follows f where f.follower_id = pr.user_id),
         (select count(*)::int from follows f where f.followee_id = pr.user_id),
         (select count(*)::int from puzzles p where p.author_id = pr.user_id and p.visibility <> 'draft')
  from profiles pr
  join auth.users u on u.id = pr.user_id
  where q is null
     or pr.username ilike '%' || q || '%'
     or pr.display_name ilike '%' || q || '%'
     or u.email ilike '%' || q || '%'
  order by
    -- Exact username first, then prefix, then the rest by recency.
    (q is not null and pr.username = lower(q)) desc,
    (q is not null and pr.username ilike q || '%') desc,
    (select max(g.updated_at) from progress g where g.user_id = pr.user_id) desc nulls last,
    pr.created_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- One user, everything
-- ---------------------------------------------------------------------------

create function admin_user_detail(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid;
  result jsonb;
begin
  perform assert_admin();

  select user_id into uid from profiles where username = lower(p_username);
  if uid is null then return null; end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'user_id', pr.user_id, 'username', pr.username,
        'display_name', pr.display_name, 'accent', pr.accent,
        'is_admin', pr.is_admin, 'created_at', pr.created_at,
        'email', u.email, 'signed_up_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'provider', u.raw_app_meta_data->>'provider',
        'last_active_at', (select max(updated_at) from progress where user_id = uid))
      from profiles pr join auth.users u on u.id = pr.user_id
      where pr.user_id = uid
    ),

    'stats', jsonb_build_object(
      'started',     (select count(*) from progress where user_id = uid),
      'completed',   (select count(*) from progress where user_id = uid and completed_at is not null),
      'completed_30d', (select count(*) from progress where user_id = uid
                          and completed_at > now() - interval '30 days'),
      'clean',       (select count(*) from progress where user_id = uid and completed_at is not null
                        and coalesce(jsonb_array_length(data->'revealed'), 0) = 0),
      'median_seconds', (select percentile_cont(0.5) within group (order by (data->>'elapsed')::numeric)
                          from progress where user_id = uid and completed_at is not null),
      'total_seconds', (select coalesce(sum((data->>'elapsed')::numeric), 0)
                          from progress where user_id = uid),
      'avg_rating',  (select round(avg((data->>'rating')::numeric), 2)
                        from progress where user_id = uid and data ? 'rating'),
      'sessions',    (select count(*) from session_participants where user_id = uid),
      'messages',    (select count(*) from session_comments where author_id = uid),
      -- Distinct UTC days with any solving activity, last 30.
      'active_days_30d', (select count(distinct date_trunc('day', updated_at)) from progress
                            where user_id = uid and updated_at > now() - interval '30 days')
    ),

    -- Favourite sources: where their solving goes.
    'sources', (
      select coalesce(jsonb_agg(row_to_json(s) order by s.started desc), '[]'::jsonb)
      from (
        select coalesce(source, 'community') source,
               count(*) started, count(completed_at) completed
        from progress where user_id = uid
        group by 1
      ) s
    ),

    'following', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.followed_at desc), '[]'::jsonb)
      from (
        select pr.user_id, pr.username, pr.display_name, pr.accent, f.created_at followed_at,
               exists (select 1 from follows b where b.follower_id = f.followee_id
                       and b.followee_id = uid) mutual
        from follows f join profiles pr on pr.user_id = f.followee_id
        where f.follower_id = uid
      ) t
    ),

    'followers', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.followed_at desc), '[]'::jsonb)
      from (
        select pr.user_id, pr.username, pr.display_name, pr.accent, f.created_at followed_at,
               exists (select 1 from follows b where b.follower_id = uid
                       and b.followee_id = f.follower_id) mutual
        from follows f join profiles pr on pr.user_id = f.follower_id
        where f.followee_id = uid
      ) t
    ),

    -- Everything they've authored, drafts included.
    'puzzles', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select id, title, visibility, completions, created_at,
               (data->>'width')::int width, (data->>'height')::int height,
               (select count(*) from progress g where g.puzzle_id = p.id) solvers
        from puzzles p where author_id = uid
      ) t
    ),

    -- Most recent 200 puzzles they've touched.
    'solves', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.updated_at desc), '[]'::jsonb)
      from (
        select g.source, g.puzzle_date, g.puzzle_id,
               coalesce(sp.title, p.title) title,
               g.updated_at, g.completed_at,
               (g.data->>'elapsed')::numeric elapsed,
               (g.data->>'filled')::int filled, (g.data->>'total')::int total,
               coalesce(jsonb_array_length(g.data->'revealed'), 0) revealed,
               (g.data->>'rating')::int rating
        from progress g
        left join syndicated_puzzles sp on sp.source = g.source and sp.puzzle_date = g.puzzle_date
        left join puzzles p on p.id = g.puzzle_id
        where g.user_id = uid
        order by g.updated_at desc
        limit 200
      ) t
    ),

    'sessions', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select s.id, s.status, s.source, s.puzzle_date, s.puzzle_id, s.created_at, s.completed_at,
               coalesce(sp.title, p.title) title,
               (select count(*) from session_participants x where x.session_id = s.id) players,
               (select count(*) from session_comments c where c.session_id = s.id) messages
        from session_participants me
        join sessions s on s.id = me.session_id
        left join syndicated_puzzles sp on sp.source = s.source and sp.puzzle_date = s.puzzle_date
        left join puzzles p on p.id = s.puzzle_id
        where me.user_id = uid
        order by s.created_at desc
        limit 50
      ) t
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function assert_admin, admin_overview, admin_search_users, admin_user_detail
  from public, anon;
grant execute on function is_admin, assert_admin, admin_overview, admin_search_users, admin_user_detail
  to authenticated;
