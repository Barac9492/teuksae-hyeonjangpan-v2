begin;
-- Derive only observed transitions on the previous Korea calendar day.
-- A repeated full/closed check is not a new event. Initial checking -> closed
-- is not evidence that parking operated and then closed.
create or replace function public.ops_public_resources()
returns jsonb language sql stable security definer set search_path = '' as $$
 with bounds as (
  select (now() at time zone 'Asia/Seoul')::date as today
 ), previous as (
  select h.resource_id,
   min(h.created_at) filter(where h.after_state='full' and h.before_state<>'full') as first_full_at,
   max(h.created_at) filter(where h.after_state='closed' and h.before_state in ('available','busy','full')) as closed_at
  from public.ops_history h cross join bounds b
  where h.created_at >= (b.today-1)::timestamp at time zone 'Asia/Seoul'
    and h.created_at < b.today::timestamp at time zone 'Asia/Seoul'
  group by h.resource_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,
  'updatedAt',r.updated_at,'occupancyPercent',r.occupancy_percent,
  'lastClosedAt',r.last_closed_at,'lastFullAt',r.last_full_at
 ) || case when r.category='parking' then jsonb_build_object('previousDay',jsonb_build_object(
  'date',b.today-1,'firstFullAt',p.first_full_at,'closedAt',p.closed_at
 )) else '{}'::jsonb end order by r.id),'[]'::jsonb)
 from public.ops_resources r cross join bounds b left join previous p on p.resource_id=r.id;
$$;
revoke all on function public.ops_public_resources() from public,anon,authenticated;
grant execute on function public.ops_public_resources() to service_role;
commit;
