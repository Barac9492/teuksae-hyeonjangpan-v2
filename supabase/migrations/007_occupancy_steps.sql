begin;
-- A displayed estimate is a discrete operator choice. These checks deliberately
-- validate existing rows too: this migration must fail rather than round or invent history.
alter table public.ops_resources add constraint ops_resources_occupancy_percent_step check (occupancy_percent is null or occupancy_percent % 10 = 0);
alter table public.ops_history add constraint ops_history_before_occupancy_percent_step check (before_occupancy_percent is null or before_occupancy_percent % 10 = 0), add constraint ops_history_after_occupancy_percent_step check (after_occupancy_percent is null or after_occupancy_percent % 10 = 0);
alter table public.ops_request_receipts add constraint ops_request_receipts_occupancy_percent_step check (occupancy_percent is null or occupancy_percent % 10 = 0);

-- Keep the six-argument RPC and its fifth-argument-compatible default. A null
-- estimate is intentional: older callers may still record available/busy/full
-- without fabricating a percentage.
create or replace function public.ops_set_resource_state(p_session_id uuid, p_resource_id text, p_state text, p_expected_version integer, p_request_id uuid, p_occupancy_percent integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session_username text; v_role text; v_user text; v_label text; v_session_label text; resource_row public.ops_resources%rowtype; old_receipt public.ops_request_receipts%rowtype; result jsonb; v_before text; v_before_percent integer;
begin
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

revoke all on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer) from public, anon, authenticated;
grant execute on function public.ops_set_resource_state(uuid,text,text,integer,uuid,integer) to service_role;
commit;
