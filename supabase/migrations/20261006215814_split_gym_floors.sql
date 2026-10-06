-- DB first, then app. Keep the legacy aggregate row, history and receipts intact.
-- A legacy gym estimate does not establish either floor's actual status.
begin;
insert into public.ops_resources(id, label, category, state)
values
  ('space.songrim.gym.f1', '체육관 1층', 'space', 'checking'),
  ('space.songrim.gym.f2', '체육관 2층', 'space', 'checking')
on conflict(id) do nothing;
commit;
