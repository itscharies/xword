-- The completions counter only ever counted the author's own solves.
-- bump_puzzle_completions ran with the *solver's* privileges, and the
-- puzzles UPDATE policy only lets a row's author touch it — so for any
-- other solver the trigger's UPDATE matched zero rows and failed silently
-- (RLS filters, it doesn't error). Run the trigger as the function owner
-- instead; it only ever increments the one counter column.
create or replace function bump_puzzle_completions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.puzzle_id is not null and (NEW.data->>'completed')::boolean is true
     and (OLD is null or (OLD.data->>'completed')::boolean is not true) then
    update puzzles set completions = completions + 1 where id = NEW.puzzle_id;
  end if;
  return NEW;
end;
$$;

-- Recount from the progress rows themselves — every solve the trigger
-- dropped is still sitting there as a completed progress row.
update puzzles p set completions = (
  select count(*) from progress pr
  where pr.puzzle_id = p.id and (pr.data->>'completed')::boolean is true
);
