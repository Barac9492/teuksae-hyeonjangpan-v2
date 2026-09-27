begin;
-- Percentages are nullable manual operator estimates, never measured capacity.
alter table public.ops_resources add column occupancy_percent integer check (occupancy_percent between 0 and 100), add column last_closed_at timestamptz, add column last_full_at timestamptz;
alter table public.ops_resources add constraint ops_access_no_occupancy check (id <> 'space.songrim.access' or occupancy_percent is null);
alter table public.ops_history add column before_occupancy_percent integer check (before_occupancy_percent between 0 and 100), add column after_occupancy_percent integer check (after_occupancy_percent between 0 and 100);
alter table public.ops_request_receipts add column occupancy_percent integer check (occupancy_percent between 0 and 100);
-- Backfill only actual transitions already recorded, not the latest recheck time.
update public.ops_resources r set last_closed_at=(select max(h.created_at) from public.ops_history h where h.resource_id=r.id and h.after_state in ('closed','hall_closed') and h.before_state<>h.after_state), last_full_at=(select max(h.created_at) from public.ops_history h where h.resource_id=r.id and h.after_state='full' and h.before_state<>h.after_state);
insert into public.ops_resources(id,label,category,state) values ('parking.calvary','갈보리교회 주차','parking','checking') on conflict(id) do nothing;
-- Remove the old overload so no write path bypasses estimate-aware receipts.
drop function public.ops_set_resource_state(uuid,text,text,integer,uuid);
create or replace function public.ops_set_resource_state(p_session_id uuid, p_resource_id text, p_state text, p_expected_version integer, p_request_id uuid, p_occupancy_percent integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session_username text; v_role text; v_user text; v_label text; v_session_label text; resource_row public.ops_resources%rowtype; old_receipt public.ops_request_receipts%rowtype; result jsonb; v_before text; v_before_percent integer;
begin
  if p_occupancy_percent is not null and (p_occupancy_percent < 0 or p_occupancy_percent > 100 or p_resource_id='space.songrim.access') then raise exception 'invalid operator estimate'; end if;
  -- Read username without a row lock, acquire its advisory lock, then reauthorize under row locks.
  select username into v_session_username from public.ops_sessions where id=p_session_id;
  if v_session_username is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || v_session_username, 0));
  select actor.role,actor.username,session_row.display_name,session_row.label into v_role,v_user,v_label,v_session_label from public.ops_sessions session_row join public.ops_accounts actor on actor.username=session_row.username where session_row.id=p_session_id and session_row.username=v_session_username and session_row.revoked_at is null and session_row.expires_at>now() and actor.active and actor.credential_version=session_row.credential_version for update of session_row,actor;
  if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into old_receipt from public.ops_request_receipts where request_id=p_request_id;
  if found then
    if old_receipt.session_id<>p_session_id or old_receipt.resource_id<>p_resource_id or old_receipt.state<>p_state or old_receipt.expected_version<>p_expected_version or old_receipt.occupancy_percent is distinct from p_occupancy_percent then return jsonb_build_object('status','payload_mismatch'); end if;
    return old_receipt.result;
  end if;
  select * into resource_row from public.ops_resources where id=p_resource_id for update;
  if not found or (v_role <> 'superadmin' and resource_row.category <> v_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  if (resource_row.id='space.songrim.access' and p_state not in ('checking','closed','school_open','gym_open','hall_open','hall_closed')) or (resource_row.id<>'space.songrim.access' and p_state not in ('checking','closed','available','busy','full')) then raise exception 'invalid state'; end if;
  if resource_row.version<>p_expected_version then result:=jsonb_build_object('status','conflict','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at,'occupancyPercent',resource_row.occupancy_percent,'lastClosedAt',resource_row.last_closed_at,'lastFullAt',resource_row.last_full_at));
  else
    v_before:=resource_row.state; v_before_percent:=resource_row.occupancy_percent;
    update public.ops_resources set state=p_state,occupancy_percent=p_occupancy_percent,version=version+1,updated_at=now(),
      last_closed_at=case when p_state in ('closed','hall_closed') and state is distinct from p_state then now() else last_closed_at end,
      last_full_at=case when p_state='full' and state is distinct from p_state then now() else last_full_at end where id=resource_row.id returning * into resource_row;
    insert into public.ops_history(resource_id,before_state,after_state,actor_username,actor_label,session_label,before_occupancy_percent,after_occupancy_percent) values(resource_row.id,v_before,p_state,v_user,v_label,v_session_label,v_before_percent,p_occupancy_percent);
    result:=jsonb_build_object('status','ok','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at,'occupancyPercent',resource_row.occupancy_percent,'lastClosedAt',resource_row.last_closed_at,'lastFullAt',resource_row.last_full_at));
  end if;
  insert into public.ops_request_receipts(request_id,session_id,resource_id,state,expected_version,result,occupancy_percent) values(p_request_id,p_session_id,p_resource_id,p_state,p_expected_version,result,p_occupancy_percent);
  return result;
end; $$;

create or replace function public.ops_list_operations(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
 select a.role into v_role from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and a.active and a.credential_version=s.credential_version;
 if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object('resources', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,'updatedAt',r.updated_at,'occupancyPercent',r.occupancy_percent,'lastClosedAt',r.last_closed_at,'lastFullAt',r.last_full_at) order by r.id),'[]'::jsonb) from public.ops_resources r where v_role='superadmin' or r.category=v_role), 'history', (select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'resourceId',recent.resource_id,'beforeState',recent.before_state,'afterState',recent.after_state,'beforeOccupancyPercent',recent.before_occupancy_percent,'afterOccupancyPercent',recent.after_occupancy_percent,'actorUsername',recent.actor_username,'actorLabel',recent.actor_label,'sessionLabel',recent.session_label,'createdAt',recent.created_at) order by recent.created_at desc),'[]'::jsonb) from (select h.* from public.ops_history h join public.ops_resources r on r.id=h.resource_id where v_role='superadmin' or r.category=v_role order by h.created_at desc limit 100) recent), 'canManageAccounts',v_role='superadmin');
end; $$;
create or replace function public.ops_public_resources()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'category',category,'state',state,'version',version,'updatedAt',updated_at,'occupancyPercent',occupancy_percent,'lastClosedAt',last_closed_at,'lastFullAt',last_full_at) order by id),'[]'::jsonb) from public.ops_resources;
$$;


revoke all on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer), public.ops_list_operations(uuid), public.ops_public_resources() from public, anon, authenticated;
grant execute on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer), public.ops_list_operations(uuid), public.ops_public_resources() to service_role;
commit;
