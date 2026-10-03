-- Approved rollout: apply before the server/frontend release. No historical rows are removed or reinterpreted.
begin;
alter table public.ops_resources add column guide_floor integer check(guide_floor between 1 and 5);
alter table public.ops_resources add constraint ops_dream_guidance check (
 (id='parking.dream' and occupancy_percent is null and
  ((state='available' and guide_floor is not null) or (state in ('checking','closed','full') and guide_floor is null)))
 or (id<>'parking.dream' and guide_floor is null));
alter table public.ops_history add column before_guide_floor integer, add column after_guide_floor integer;
alter table public.ops_request_receipts add column guide_floor integer;
-- No capacity or automatic inference: an operator chooses the currently directed floor.
insert into public.ops_resources(id,label,category,state) values('parking.dream','드림센터 주차장','parking','checking') on conflict(id) do nothing;
drop function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer);
create or replace function public.ops_set_resource_state(p_session_id uuid, p_resource_id text, p_state text, p_expected_version integer, p_request_id uuid, p_occupancy_percent integer default null, p_guide_floor integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session_username text; v_role text; v_user text; v_label text; v_session_label text; resource_row public.ops_resources%rowtype; old_receipt public.ops_request_receipts%rowtype; result jsonb; v_before text; v_before_percent integer; v_before_floor integer;
begin
  if p_expected_version is null or p_expected_version < 0 or p_request_id is null or p_state is null then raise exception 'invalid request'; end if;
  if p_resource_id='parking.dream' then
    if p_occupancy_percent is not null or p_state not in ('checking','closed','full','available') then raise exception 'invalid parking guidance'; end if;
    if p_state='available' then
      if p_guide_floor is null or p_guide_floor not between 1 and 5 then raise exception 'guide floor required'; end if;
    elsif p_guide_floor is not null then raise exception 'unexpected guide floor';
    end if;
  elsif p_guide_floor is not null then raise exception 'guide floor resource required';
  end if;
  if p_occupancy_percent is not null then
    if p_occupancy_percent < 0 or p_occupancy_percent > 100 or p_occupancy_percent % 10 <> 0 or p_resource_id='space.songrim.access' then raise exception 'invalid operator estimate'; end if;
    if (p_state='available' and p_occupancy_percent between 0 and 60)
      or (p_state='busy' and p_occupancy_percent between 70 and 90)
      or (p_state='full' and p_occupancy_percent=100) then null;
    else raise exception 'operator estimate does not match state';
    end if;
  end if;
  -- Read username without a row lock, acquire its advisory lock, then reauthorize under row locks.
  select username into v_session_username from public.ops_sessions where id=p_session_id;
  if v_session_username is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || v_session_username, 0));
  select actor.role,actor.username,session_row.display_name,session_row.label into v_role,v_user,v_label,v_session_label from public.ops_sessions session_row join public.ops_accounts actor on actor.username=session_row.username where session_row.id=p_session_id and session_row.username=v_session_username and session_row.revoked_at is null and session_row.expires_at>now() and actor.active and actor.credential_version=session_row.credential_version for update of session_row,actor;
  if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into old_receipt from public.ops_request_receipts where request_id=p_request_id;
  if found then
    if old_receipt.session_id<>p_session_id or old_receipt.resource_id<>p_resource_id or old_receipt.state<>p_state or old_receipt.expected_version<>p_expected_version or old_receipt.occupancy_percent is distinct from p_occupancy_percent or old_receipt.guide_floor is distinct from p_guide_floor then return jsonb_build_object('status','payload_mismatch'); end if;
    return old_receipt.result;
  end if;
  select * into resource_row from public.ops_resources where id=p_resource_id for update;
  if not found or (v_role <> 'superadmin' and resource_row.category <> v_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  if (resource_row.id='space.songrim.access' and p_state not in ('checking','closed','school_open','gym_open','hall_open','hall_closed')) or (resource_row.id<>'space.songrim.access' and p_state not in ('checking','closed','available','busy','full')) then raise exception 'invalid state'; end if;
  if resource_row.version<>p_expected_version then result:=jsonb_build_object('status','conflict','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at,'occupancyPercent',resource_row.occupancy_percent,'guideFloor',resource_row.guide_floor,'lastClosedAt',resource_row.last_closed_at,'lastFullAt',resource_row.last_full_at));
  else
    v_before:=resource_row.state; v_before_percent:=resource_row.occupancy_percent; v_before_floor:=resource_row.guide_floor;
    update public.ops_resources set state=p_state,occupancy_percent=p_occupancy_percent,guide_floor=p_guide_floor,version=version+1,updated_at=now(),
      last_closed_at=case when p_state in ('closed','hall_closed') and state is distinct from p_state then now() else last_closed_at end,
      last_full_at=case when p_state='full' and state is distinct from p_state then now() else last_full_at end where id=resource_row.id returning * into resource_row;
    insert into public.ops_history(resource_id,before_state,after_state,actor_username,actor_label,session_label,before_occupancy_percent,after_occupancy_percent,before_guide_floor,after_guide_floor) values(resource_row.id,v_before,p_state,v_user,v_label,v_session_label,v_before_percent,p_occupancy_percent,v_before_floor,p_guide_floor);
    result:=jsonb_build_object('status','ok','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at,'occupancyPercent',resource_row.occupancy_percent,'guideFloor',resource_row.guide_floor,'lastClosedAt',resource_row.last_closed_at,'lastFullAt',resource_row.last_full_at));
  end if;
  insert into public.ops_request_receipts(request_id,session_id,resource_id,state,expected_version,result,occupancy_percent,guide_floor) values(p_request_id,p_session_id,p_resource_id,p_state,p_expected_version,result,p_occupancy_percent,p_guide_floor);
  return result;
end; $$;

create or replace function public.ops_list_operations(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
 select a.role into v_role from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and a.active and a.credential_version=s.credential_version;
 if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object('resources', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,'updatedAt',r.updated_at,'occupancyPercent',r.occupancy_percent,'guideFloor',r.guide_floor,'lastClosedAt',r.last_closed_at,'lastFullAt',r.last_full_at) order by r.id),'[]'::jsonb) from public.ops_resources r where v_role='superadmin' or r.category=v_role), 'history', (select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'resourceId',recent.resource_id,'beforeState',recent.before_state,'afterState',recent.after_state,'beforeOccupancyPercent',recent.before_occupancy_percent,'afterOccupancyPercent',recent.after_occupancy_percent,'beforeGuideFloor',recent.before_guide_floor,'afterGuideFloor',recent.after_guide_floor,'actorUsername',recent.actor_username,'actorLabel',recent.actor_label,'sessionLabel',recent.session_label,'createdAt',recent.created_at) order by recent.created_at desc),'[]'::jsonb) from (select h.* from public.ops_history h join public.ops_resources r on r.id=h.resource_id where v_role='superadmin' or r.category=v_role order by h.created_at desc limit 100) recent), 'canManageAccounts',v_role='superadmin');
end; $$;
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
  'guideFloor',r.guide_floor,'lastClosedAt',r.last_closed_at,'lastFullAt',r.last_full_at
 ) || case when r.category='parking' then jsonb_build_object('previousDay',jsonb_build_object(
  'date',b.today-1,'firstFullAt',p.first_full_at,'closedAt',p.closed_at
 )) else '{}'::jsonb end order by r.id),'[]'::jsonb)
 from public.ops_resources r cross join bounds b left join previous p on p.resource_id=r.id;
$$;
-- Keyset pages: stable timestamp+UUID tie-breaker; no private fields or storage paths.
create index community_v2_public_page on public.community_v2_items(kind,created_at desc,id desc) where status='approved' and ready;
create or replace function public.community_public_page(p_kind text, p_before_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb; v_more boolean; v_count bigint; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
 if p_kind is null or p_kind not in ('prayer','photo','reflection') or ((p_before_at is null) <> (p_before_id is null)) then raise exception 'invalid page'; end if;
 with page as (
  select id,kind,text,created_at,event_day from public.community_v2_items
  where kind=p_kind and status='approved' and ready
   and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id))
  order by created_at desc,id desc limit 13
 ), visible as (select * from page order by created_at desc,id desc limit 12)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'text',text,'createdAt',created_at,'eventDay',event_day)
  ||case when kind='photo' then jsonb_build_object('photoUrl','/api/community/photo?id='||id::text) else '{}'::jsonb end order by created_at desc,id desc) from visible),'[]'::jsonb), (select count(*)>12 from page)
 into v_items,v_more;
 select count(*) into v_count from public.community_v2_items where kind='photo' and ready and status in ('pending','approved') and created_at>=v_today::timestamp at time zone 'Asia/Seoul' and created_at<(v_today+1)::timestamp at time zone 'Asia/Seoul';
 return jsonb_build_object('enabled',true,'items',v_items,'photoCountToday',v_count,'today',v_today,
  'nextCursor',case when v_more then jsonb_build_object('createdAt',v_items->11->>'createdAt','id',v_items->11->>'id') else null end);
end; $$;
revoke all on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer,integer),public.ops_list_operations(uuid),public.ops_public_resources(),public.community_public_page(text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer,integer),public.ops_list_operations(uuid),public.ops_public_resources(),public.community_public_page(text,timestamptz,uuid) to service_role;
commit;
