-- Signed-out visitors lost the whole home feed: list_archive_feed runs
-- with the caller's privileges and now calls list_mutual_progress per
-- row, which anon was deliberately revoked from back when only the
-- browser called it directly. The function is already safe for anon —
-- its `auth.uid() is not null` gate returns nothing — so let anon
-- execute it rather than teaching the feed to branch around it.
grant execute on function list_mutual_progress to anon;
