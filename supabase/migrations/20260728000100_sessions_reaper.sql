-- Hygiene reaper for co-op sessions. Correctness never depends on this:
-- join_session/get_session_preview already treat an open session idle past
-- the timeout as ended (and flip it on read), and connected clients end it
-- live. This just keeps rows nobody ever revisits from lingering as 'open',
-- and clears out old sessions entirely after a month.
--
-- Kept as its own migration so it can be applied (or skipped) independently
-- of the feature: pg_cron needs to be enabled on the Supabase project, and
-- free-tier projects pause when inactive, which pauses cron with them.

create extension if not exists pg_cron;

select cron.schedule(
  'xword-end-stale-sessions',
  '*/10 * * * *',
  $$
    update public.sessions set status = 'ended'
    where status = 'open' and last_activity_at < now() - interval '30 minutes'
  $$
);

select cron.schedule(
  'xword-purge-old-sessions',
  '17 3 * * *',
  $$
    delete from public.sessions
    where last_activity_at < now() - interval '30 days'
  $$
);
