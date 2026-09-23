begin;

-- Isolated from the pilot tables in 001. Only the server's service-role key may call these RPCs.
create table public.ops_accounts (
  username text primary key check (username = upper(username) and username ~ '^[A-Z0-9_-]{1,80}$'),
  role text not null check (role in ('superadmin', 'parking', 'space')),
  display_label text not null check (char_length(display_label) between 1 and 30),
  password_hash text check (password_hash is null or password_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$'),
  active boolean not null default false,
  credential_version integer not null default 1 check (credential_version > 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  failed_window_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ops_sessions (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.ops_accounts(username) on delete cascade,
  credential_version integer not null,
  display_name text not null check (char_length(display_name) between 1 and 30), -- self-reported, not verified identity
  label text not null unique check (label ~ '^S-[A-F0-9]{10}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index ops_sessions_active_lookup on public.ops_sessions (id, username, expires_at) where revoked_at is null;
create table public.ops_resources (
  id text primary key,
  label text not null,
  category text not null check (category in ('parking', 'space')),
  state text not null,
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz,
  check ((id = 'space.songrim.access' and state in ('checking','closed','school_open','gym_open','hall_open','hall_closed')) or (id <> 'space.songrim.access' and state in ('checking','closed','available','busy','full')))
);
create table public.ops_history (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references public.ops_resources(id),
  before_state text not null,
  after_state text not null,
  actor_username text not null references public.ops_accounts(username),
  actor_label text not null, -- session self-reported label, deliberately not an identity claim
  session_label text not null,
  created_at timestamptz not null default now()
);
create index ops_history_recent on public.ops_history (created_at desc);
create table public.ops_request_receipts (
  request_id uuid primary key,
  session_id uuid not null references public.ops_sessions(id),
  resource_id text not null,
  state text not null,
  expected_version integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ops_accounts enable row level security;
alter table public.ops_sessions enable row level security;
alter table public.ops_resources enable row level security;
alter table public.ops_history enable row level security;
alter table public.ops_request_receipts enable row level security;
revoke all on table public.ops_accounts, public.ops_sessions, public.ops_resources, public.ops_history, public.ops_request_receipts from public, anon, authenticated;

create or replace function public.ops_bootstrap_superadmin(p_username text, p_password_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize first-install bootstrap so two first logins cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops_bootstrap_superadmin', 0));
  -- Bootstrap only an empty installation. Existing DB accounts are canonical thereafter, so stale bootstrap env values are ignored.
  if exists (select 1 from public.ops_accounts where role = 'superadmin') then return; end if;
  if p_username is null or p_password_hash is null or p_username !~ '^[A-Z0-9_-]{1,80}$' or p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$' then raise exception 'invalid bootstrap'; end if;
  insert into public.ops_accounts(username, role, display_label, password_hash, active) values (p_username, 'superadmin', '관리자', p_password_hash, true)
  on conflict (username) do nothing;
end; $$;
create or replace function public.ops_reserve_login(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.ops_accounts%rowtype; v_now timestamptz := pg_catalog.now(); v_retry integer;
begin
  select * into a from public.ops_accounts where username = p_username for update;
  if not found or not a.active or a.password_hash is null then return jsonb_build_object('status','invalid'); end if;
  if a.failed_window_started_at is not null and a.failed_window_started_at > v_now - interval '15 minutes' and a.failed_attempts >= 12 then
    v_retry := greatest(1, ceil(extract(epoch from (a.failed_window_started_at + interval '15 minutes' - v_now)))::integer);
    return jsonb_build_object('status','limited','retryAfter',v_retry);
  end if;
  if a.failed_window_started_at is null or a.failed_window_started_at <= v_now - interval '15 minutes' then
    update public.ops_accounts set failed_attempts = 1, failed_window_started_at = v_now, updated_at = v_now where username = p_username;
  else
    update public.ops_accounts set failed_attempts = failed_attempts + 1, updated_at = v_now where username = p_username;
  end if;
  return jsonb_build_object('status','reserved','passwordHash',a.password_hash,'credentialVersion',a.credential_version);
end; $$;
create or replace function public.ops_finish_login(p_username text, p_success boolean, p_display_name text default null, p_session_label text default null, p_expires_at timestamptz default null, p_expected_credential_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.ops_accounts%rowtype; s public.ops_sessions%rowtype;
begin
  select * into a from public.ops_accounts where username = p_username for update;
  if not found or not a.active or a.password_hash is null then raise exception 'invalid login'; end if;
  if p_expected_credential_version is distinct from a.credential_version then raise exception 'stale credentials' using errcode='40001'; end if;
  if not p_success then return jsonb_build_object('ok',false); end if;
  if p_display_name is null or char_length(p_display_name) not between 1 and 30 or p_session_label !~ '^S-[A-F0-9]{10}$' or p_expires_at is null then raise exception 'invalid login completion'; end if;
  update public.ops_accounts set failed_attempts = 0, failed_window_started_at = null, updated_at = now() where username = p_username;
  insert into public.ops_sessions(username, credential_version, display_name, label, expires_at) values (a.username, a.credential_version, p_display_name, p_session_label, p_expires_at) returning * into s;
  return jsonb_build_object('id',s.id,'username',a.username,'role',a.role,'credentialVersion',a.credential_version,'label',s.label);
end; $$;
create or replace function public.ops_get_session(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('username',a.username,'role',a.role,'credentialVersion',a.credential_version,'displayName',s.display_name,'label',s.label)
  from public.ops_sessions s join public.ops_accounts a on a.username=s.username
  where s.id=p_session_id and s.revoked_at is null and s.expires_at > now() and a.active and a.credential_version=s.credential_version;
$$;
create or replace function public.ops_revoke_session(p_session_id uuid)
returns void language sql security definer set search_path = '' as $$ update public.ops_sessions set revoked_at=now() where id=p_session_id and revoked_at is null; $$;
create or replace function public.ops_list_operations(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
 select a.role into v_role from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and a.active and a.credential_version=s.credential_version;
 if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object('resources', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,'updatedAt',r.updated_at) order by r.id),'[]'::jsonb) from public.ops_resources r where v_role='superadmin' or r.category=v_role), 'history', (select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'resourceId',recent.resource_id,'beforeState',recent.before_state,'afterState',recent.after_state,'actorUsername',recent.actor_username,'actorLabel',recent.actor_label,'sessionLabel',recent.session_label,'createdAt',recent.created_at) order by recent.created_at desc),'[]'::jsonb) from (select h.* from public.ops_history h join public.ops_resources r on r.id=h.resource_id where v_role='superadmin' or r.category=v_role order by h.created_at desc limit 100) recent), 'canManageAccounts',v_role='superadmin');
end; $$;
create or replace function public.ops_set_resource_state(p_session_id uuid, p_resource_id text, p_state text, p_expected_version integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; v_user text; v_label text; v_session_label text; r public.ops_resources%rowtype; old public.ops_request_receipts%rowtype; result jsonb; v_before text;
begin
 -- Serialize a request ID before checking/inserting its receipt, so concurrent retries replay rather than race into a duplicate audit row.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
 select a.role,a.username,s.display_name,s.label into v_role,v_user,v_label,v_session_label from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and a.active and a.credential_version=s.credential_version for update of s,a;
 if v_role is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into old from public.ops_request_receipts where request_id=p_request_id;
 if found then
   if old.session_id<>p_session_id or old.resource_id<>p_resource_id or old.state<>p_state or old.expected_version<>p_expected_version then return jsonb_build_object('status','payload_mismatch'); end if;
   return old.result;
 end if;
 select * into r from public.ops_resources where id=p_resource_id for update;
 if not found or (v_role <> 'superadmin' and r.category <> v_role) then raise exception 'unauthorized' using errcode='42501'; end if;
 if (r.id='space.songrim.access' and p_state not in ('checking','closed','school_open','gym_open','hall_open','hall_closed')) or (r.id<>'space.songrim.access' and p_state not in ('checking','closed','available','busy','full')) then raise exception 'invalid state'; end if;
 if r.version<>p_expected_version then
   result:=jsonb_build_object('status','conflict','resource',jsonb_build_object('id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,'updatedAt',r.updated_at));
 else
   v_before:=r.state;
   update public.ops_resources set state=p_state,version=version+1,updated_at=now() where id=r.id returning * into r;
   insert into public.ops_history(resource_id,before_state,after_state,actor_username,actor_label,session_label) values(r.id,v_before,p_state,v_user,v_label,v_session_label);
   result:=jsonb_build_object('status','ok','resource',jsonb_build_object('id',r.id,'label',r.label,'category',r.category,'state',r.state,'version',r.version,'updatedAt',r.updated_at));
 end if;
 insert into public.ops_request_receipts(request_id,session_id,resource_id,state,expected_version,result) values(p_request_id,p_session_id,p_resource_id,p_state,p_expected_version,result);
 return result;
end; $$;
create or replace function public.ops_list_accounts(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
 select a.role into v_role from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and a.active and a.credential_version=s.credential_version;
 if v_role is distinct from 'superadmin' then raise exception 'unauthorized' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('username',username,'role',role,'displayLabel',display_label,'active',active,'hasPassword',password_hash is not null) order by username),'[]'::jsonb) from public.ops_accounts);
end; $$;
create or replace function public.ops_upsert_account(p_session_id uuid, p_username text, p_role text, p_display_label text, p_password_hash text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; a public.ops_accounts%rowtype; v_revoke boolean;
begin
 select actor.role into v_role from public.ops_sessions s join public.ops_accounts actor on actor.username=s.username where s.id=p_session_id and s.revoked_at is null and s.expires_at>now() and actor.active and actor.credential_version=s.credential_version for update of s,actor;
 if v_role is distinct from 'superadmin' then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_username !~ '^[A-Z0-9_-]{1,80}$' or p_role not in ('parking','space') or char_length(p_display_label) not between 1 and 30 or (p_password_hash is not null and p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$') then raise exception 'invalid account'; end if;
 select * into a from public.ops_accounts where username=p_username for update;
 if not found then
   if p_active and p_password_hash is null then raise exception 'active account requires password'; end if;
   insert into public.ops_accounts(username,role,display_label,password_hash,active) values(p_username,p_role,p_display_label,p_password_hash,p_active) returning * into a;
 else
   if a.role = 'superadmin' then raise exception 'superadmin account is immutable here' using errcode='42501'; end if;
   if p_active and coalesce(p_password_hash,a.password_hash) is null then raise exception 'active account requires password'; end if;
   v_revoke := p_password_hash is not null or a.active<>p_active or a.role<>p_role;
   update public.ops_accounts set role=p_role,display_label=p_display_label,password_hash=coalesce(p_password_hash,password_hash),active=p_active,credential_version=case when v_revoke then credential_version+1 else credential_version end,failed_attempts=case when p_password_hash is not null or (not a.active and p_active) then 0 else failed_attempts end,failed_window_started_at=case when p_password_hash is not null or (not a.active and p_active) then null else failed_window_started_at end,updated_at=now() where username=p_username returning * into a;
   if v_revoke then update public.ops_sessions set revoked_at=now() where username=p_username and revoked_at is null; end if;
 end if;
 return jsonb_build_object('username',a.username,'role',a.role,'displayLabel',a.display_label,'active',a.active,'hasPassword',a.password_hash is not null);
end; $$;
create or replace function public.ops_public_resources()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'category',category,'state',state,'version',version,'updatedAt',updated_at) order by id),'[]'::jsonb) from public.ops_resources;
$$;

-- No browser role gets table or function access. The Vercel server uses SUPABASE_SERVICE_ROLE_KEY.
revoke all on function public.ops_bootstrap_superadmin(text,text), public.ops_reserve_login(text), public.ops_finish_login(text,boolean,text,text,timestamptz,integer), public.ops_get_session(uuid), public.ops_revoke_session(uuid), public.ops_list_operations(uuid), public.ops_set_resource_state(uuid,text,text,integer,uuid), public.ops_list_accounts(uuid), public.ops_upsert_account(uuid,text,text,text,text,boolean), public.ops_public_resources() from public, anon, authenticated;
grant execute on function public.ops_bootstrap_superadmin(text,text), public.ops_reserve_login(text), public.ops_finish_login(text,boolean,text,text,timestamptz,integer), public.ops_get_session(uuid), public.ops_revoke_session(uuid), public.ops_list_operations(uuid), public.ops_set_resource_state(uuid,text,text,integer,uuid), public.ops_list_accounts(uuid), public.ops_upsert_account(uuid,text,text,text,text,boolean), public.ops_public_resources() to service_role;

insert into public.ops_resources(id,label,category,state) values
 ('parking.songrim','송림본당 주차','parking','checking'),
 ('parking.dream.b1','드림센터 B1','parking','checking'),('parking.dream.b2','드림센터 B2','parking','checking'),('parking.dream.b3','드림센터 B3','parking','checking'),('parking.dream.b4','드림센터 B4','parking','checking'),('parking.dream.b5','드림센터 B5','parking','checking'),
 ('space.songrim.access','송림본당 개방 단계','space','checking'),('space.songrim.hall','본당1·2층','space','checking'),('space.songrim.gym','체육관','space','checking'),('space.dream.f3','드림센터 3층','space','checking'),('space.dream.f7','드림센터 7층','space','checking'),('space.dream.f11','드림센터 11층','space','checking')
on conflict (id) do nothing;
commit;
