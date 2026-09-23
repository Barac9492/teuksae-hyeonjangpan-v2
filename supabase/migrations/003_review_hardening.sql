begin;

-- 002 is already applied. Reservation rows make a successful login refund only its own reserved attempt.
create table if not exists public.ops_login_reservations (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.ops_accounts(username) on delete cascade,
  credential_version integer not null,
  window_started_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ops_login_reservations_account on public.ops_login_reservations(username, created_at);
alter table public.ops_login_reservations enable row level security;
revoke all on table public.ops_login_reservations from public, anon, authenticated;

-- 002 exposed this signature. Replace it rather than retaining a path without reservation binding.
revoke all on function public.ops_finish_login(text,boolean,text,text,timestamptz,integer) from public, anon, authenticated, service_role;
drop function public.ops_finish_login(text,boolean,text,text,timestamptz,integer);

create or replace function public.ops_reserve_login(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_row public.ops_accounts%rowtype; v_now timestamptz := pg_catalog.now(); v_window timestamptz; v_reservation uuid; v_retry integer;
begin
  -- All functions that lock an account/session take this username key first.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || coalesce(p_username, ''), 0));
  select * into account_row from public.ops_accounts where username = p_username for update;
  if not found or not account_row.active or account_row.password_hash is null then return jsonb_build_object('status','invalid'); end if;
  if account_row.failed_window_started_at is not null and account_row.failed_window_started_at > v_now - interval '15 minutes' and account_row.failed_attempts >= 12 then
    v_retry := greatest(1, ceil(extract(epoch from (account_row.failed_window_started_at + interval '15 minutes' - v_now)))::integer);
    return jsonb_build_object('status','limited','retryAfter',v_retry);
  end if;
  if account_row.failed_window_started_at is null or account_row.failed_window_started_at <= v_now - interval '15 minutes' then
    v_window := v_now;
    update public.ops_accounts set failed_attempts=1,failed_window_started_at=v_window,updated_at=v_now where username=p_username;
  else
    v_window := account_row.failed_window_started_at;
    update public.ops_accounts set failed_attempts=failed_attempts+1,updated_at=v_now where username=p_username;
  end if;
  insert into public.ops_login_reservations(username,credential_version,window_started_at) values(p_username,account_row.credential_version,v_window) returning id into v_reservation;
  return jsonb_build_object('status','reserved','passwordHash',account_row.password_hash,'credentialVersion',account_row.credential_version,'reservationId',v_reservation);
end; $$;

create function public.ops_finish_login(p_username text, p_reservation_id uuid, p_success boolean, p_display_name text default null, p_session_label text default null, p_expires_at timestamptz default null, p_expected_credential_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_row public.ops_accounts%rowtype; reservation_row public.ops_login_reservations%rowtype; session_row public.ops_sessions%rowtype; v_account_found boolean; v_reservation_found boolean; v_now timestamptz := pg_catalog.now();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || coalesce(p_username, ''), 0));
  select * into account_row from public.ops_accounts where username=p_username for update;
  v_account_found := found;
  select * into reservation_row from public.ops_login_reservations where id=p_reservation_id for update;
  v_reservation_found := found;
  if not v_reservation_found or reservation_row.username is distinct from p_username or reservation_row.consumed_at is not null then return jsonb_build_object('status','stale'); end if;
  -- A reservation is single-use even when a credential reset made it stale.
  update public.ops_login_reservations set consumed_at=v_now where id=reservation_row.id and consumed_at is null;
  if not v_account_found or not account_row.active or account_row.password_hash is null or reservation_row.credential_version is distinct from p_expected_credential_version or reservation_row.credential_version is distinct from account_row.credential_version then return jsonb_build_object('status','stale'); end if;
  if not p_success then return jsonb_build_object('status','failed'); end if;
  if p_display_name is null or char_length(p_display_name) not between 1 and 30 or p_session_label !~ '^S-[A-F0-9]{10}$' or p_expires_at is null then raise exception 'invalid login completion'; end if;
  -- Refund precisely this reservation only if it belongs to the still-current window. Never clear other attempts.
  if account_row.failed_window_started_at = reservation_row.window_started_at and account_row.failed_window_started_at > v_now - interval '15 minutes' and account_row.failed_attempts > 0 then
    update public.ops_accounts set failed_attempts=failed_attempts-1,updated_at=v_now where username=p_username;
  end if;
  insert into public.ops_sessions(username,credential_version,display_name,label,expires_at) values(account_row.username,account_row.credential_version,p_display_name,p_session_label,p_expires_at) returning * into session_row;
  return jsonb_build_object('id',session_row.id,'username',account_row.username,'role',account_row.role,'credentialVersion',account_row.credential_version,'label',session_row.label);
end; $$;

create or replace function public.ops_get_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_username text; result jsonb;
begin
  select username into v_username from public.ops_sessions where id=p_session_id;
  if v_username is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || v_username, 0));
  select jsonb_build_object('username',actor.username,'role',actor.role,'credentialVersion',actor.credential_version,'displayName',session_row.display_name,'label',session_row.label) into result
  from public.ops_sessions session_row join public.ops_accounts actor on actor.username=session_row.username
  where session_row.id=p_session_id and session_row.revoked_at is null and session_row.expires_at>now() and actor.active and actor.credential_version=session_row.credential_version;
  return result;
end; $$;

create or replace function public.ops_revoke_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
  select username into v_username from public.ops_sessions where id=p_session_id;
  if v_username is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || v_username, 0));
  update public.ops_sessions set revoked_at=now() where id=p_session_id and username=v_username and revoked_at is null;
end; $$;

create or replace function public.ops_set_resource_state(p_session_id uuid, p_resource_id text, p_state text, p_expected_version integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session_username text; v_role text; v_user text; v_label text; v_session_label text; resource_row public.ops_resources%rowtype; old_receipt public.ops_request_receipts%rowtype; result jsonb; v_before text;
begin
  -- Read username without a row lock, acquire its advisory lock, then reauthorize under row locks.
  select username into v_session_username from public.ops_sessions where id=p_session_id;
  if v_session_username is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:' || v_session_username, 0));
  select actor.role,actor.username,session_row.display_name,session_row.label into v_role,v_user,v_label,v_session_label from public.ops_sessions session_row join public.ops_accounts actor on actor.username=session_row.username where session_row.id=p_session_id and session_row.username=v_session_username and session_row.revoked_at is null and session_row.expires_at>now() and actor.active and actor.credential_version=session_row.credential_version for update of session_row,actor;
  if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into old_receipt from public.ops_request_receipts where request_id=p_request_id;
  if found then
    if old_receipt.session_id<>p_session_id or old_receipt.resource_id<>p_resource_id or old_receipt.state<>p_state or old_receipt.expected_version<>p_expected_version then return jsonb_build_object('status','payload_mismatch'); end if;
    return old_receipt.result;
  end if;
  select * into resource_row from public.ops_resources where id=p_resource_id for update;
  if not found or (v_role <> 'superadmin' and resource_row.category <> v_role) then raise exception 'unauthorized' using errcode='42501'; end if;
  if (resource_row.id='space.songrim.access' and p_state not in ('checking','closed','school_open','gym_open','hall_open','hall_closed')) or (resource_row.id<>'space.songrim.access' and p_state not in ('checking','closed','available','busy','full')) then raise exception 'invalid state'; end if;
  if resource_row.version<>p_expected_version then result:=jsonb_build_object('status','conflict','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at));
  else
    v_before:=resource_row.state;
    update public.ops_resources set state=p_state,version=version+1,updated_at=now() where id=resource_row.id returning * into resource_row;
    insert into public.ops_history(resource_id,before_state,after_state,actor_username,actor_label,session_label) values(resource_row.id,v_before,p_state,v_user,v_label,v_session_label);
    result:=jsonb_build_object('status','ok','resource',jsonb_build_object('id',resource_row.id,'label',resource_row.label,'category',resource_row.category,'state',resource_row.state,'version',resource_row.version,'updatedAt',resource_row.updated_at));
  end if;
  insert into public.ops_request_receipts(request_id,session_id,resource_id,state,expected_version,result) values(p_request_id,p_session_id,p_resource_id,p_state,p_expected_version,result);
  return result;
end; $$;

create or replace function public.ops_upsert_account(p_session_id uuid, p_username text, p_role text, p_display_label text, p_password_hash text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_username text; v_role text; target_row public.ops_accounts%rowtype; v_revoke boolean; v_first_key text; v_second_key text;
begin
  if p_username is null or p_username !~ '^[A-Z0-9_-]{1,80}$' or p_role not in ('parking','space') or char_length(p_display_label) not between 1 and 30 or (p_password_hash is not null and p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$') then raise exception 'invalid account'; end if;
  -- Find actor without locks, then take actor/target locks in lexical order before any account or session row lock.
  select username into v_actor_username from public.ops_sessions where id=p_session_id;
  if v_actor_username is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_first_key := least('ops-account:' || v_actor_username, 'ops-account:' || p_username);
  v_second_key := greatest('ops-account:' || v_actor_username, 'ops-account:' || p_username);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_first_key, 0));
  if v_second_key <> v_first_key then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_second_key, 0)); end if;
  select actor.role into v_role from public.ops_sessions session_row join public.ops_accounts actor on actor.username=session_row.username where session_row.id=p_session_id and session_row.username=v_actor_username and session_row.revoked_at is null and session_row.expires_at>now() and actor.active and actor.credential_version=session_row.credential_version for update of session_row,actor;
  if v_role is distinct from 'superadmin' then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into target_row from public.ops_accounts where username=p_username for update;
  if not found then
    if p_active and p_password_hash is null then raise exception 'active account requires password'; end if;
    insert into public.ops_accounts(username,role,display_label,password_hash,active) values(p_username,p_role,p_display_label,p_password_hash,p_active) returning * into target_row;
  else
    if target_row.role='superadmin' then raise exception 'superadmin account is immutable here' using errcode='42501'; end if;
    if p_active and coalesce(p_password_hash,target_row.password_hash) is null then raise exception 'active account requires password'; end if;
    v_revoke := p_password_hash is not null or target_row.active<>p_active or target_row.role<>p_role;
    update public.ops_accounts set role=p_role,display_label=p_display_label,password_hash=coalesce(p_password_hash,password_hash),active=p_active,credential_version=case when v_revoke then credential_version+1 else credential_version end,failed_attempts=case when p_password_hash is not null or (not target_row.active and p_active) then 0 else failed_attempts end,failed_window_started_at=case when p_password_hash is not null or (not target_row.active and p_active) then null else failed_window_started_at end,updated_at=now() where username=p_username returning * into target_row;
    if v_revoke then update public.ops_sessions set revoked_at=now() where username=p_username and revoked_at is null; end if;
  end if;
  return jsonb_build_object('username',target_row.username,'role',target_row.role,'displayLabel',target_row.display_label,'active',target_row.active,'hasPassword',target_row.password_hash is not null);
end; $$;

revoke all on function public.ops_reserve_login(text), public.ops_get_session(uuid), public.ops_revoke_session(uuid), public.ops_set_resource_state(uuid,text,text,integer,uuid), public.ops_upsert_account(uuid,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.ops_finish_login(text,uuid,boolean,text,text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.ops_reserve_login(text), public.ops_get_session(uuid), public.ops_revoke_session(uuid), public.ops_set_resource_state(uuid,text,text,integer,uuid), public.ops_upsert_account(uuid,text,text,text,text,boolean), public.ops_finish_login(text,uuid,boolean,text,text,timestamptz,integer) to service_role;
commit;
