-- Local-stack seed, applied by `supabase start` / `supabase db reset` only
-- (never part of `db push` to production).
--
-- The hosted platform's default privileges grant table DML to the API roles
-- automatically; the local stack doesn't for tables created in migrations,
-- which breaks every query with "permission denied". Mirror prod here, then
-- re-apply the sessions migration's deliberate tightening (the migration
-- itself already did this, but the blanket grant above would undo it).

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

revoke update on table sessions from anon, authenticated;
grant update (state, state_version, status, last_activity_at)
  on sessions to authenticated;
