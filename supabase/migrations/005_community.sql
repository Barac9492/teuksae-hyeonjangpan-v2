-- Requires operations sessions (002/003), NOT migration 004. No public storage policies.
-- Suggested post-event retention review 2026-11-10; no automatic full purge.
-- If the operator chooses full removal, delete ALL bucket objects via Storage API first,
-- then TRUNCATE public.community_v2_items, public.community_v2_rates,
-- public.community_v2_audit; do not delete storage.objects directly.
-- Hourly /api/community/cleanup repairs orphan storage only, not approved posts.
-- Operator must approve and verify any full content/receipt/audit removal.
begin;
create table if not exists public.community_v2_items (
 id uuid primary key, kind text not null check(kind in ('prayer','photo')),
 text text not null, event_day integer check(event_day between 0 and 5),
 status text not null default 'pending' check(status in ('pending','approved','rejected','deleted')),
 version integer not null default 0, created_at timestamptz not null default now(),
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 path text, ready boolean not null default false,
 check(length(text)<=case when kind='prayer' then 600 else 40 end)
);
alter table public.community_v2_items add column if not exists last_cleanup_at timestamptz;
create table if not exists public.community_v2_rates (key text primary key, window_start timestamptz not null, hits integer not null);
create table if not exists public.community_v2_audit (id bigint generated always as identity primary key, item_id uuid not null, decision text not null, actor text, created_at timestamptz not null default now());
create index if not exists community_v2_recent on public.community_v2_items(status,created_at desc);
alter table public.community_v2_items enable row level security;
alter table public.community_v2_rates enable row level security;
alter table public.community_v2_audit enable row level security;
revoke all on public.community_v2_items, public.community_v2_rates, public.community_v2_audit from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-photos-v2','community-photos-v2',false,3145728,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/png'];
create or replace function public.community_v2(p_action text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.community_v2_items%rowtype; v_today date := (now() at time zone 'Asia/Seoul')::date;
 v_count bigint; v_session jsonb; v_actor text; v_result jsonb; v_key text; v_hits integer;
 v_window timestamptz := date_trunc('minute',now()); v_id uuid; v_cleanup text;
begin
 -- Moderator authentication is revalidated within the same transaction, serialized
 -- with account revocation/password changes; row locks cover direct revocations.
 if p_action in ('adminList','moderate') or (p_action='photo' and p_args->>'session' is not null) then
  select username into v_actor from public.ops_sessions where id=(p_args->>'session')::uuid;
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ops-account:'||v_actor,0));
  perform 1 from public.ops_sessions s join public.ops_accounts a on a.username=s.username where s.id=(p_args->>'session')::uuid for update of s,a;
  select public.ops_get_session((p_args->>'session')::uuid) into v_session;
  if v_session is null or v_session->>'role'<>'superadmin' then raise exception 'unauthorized' using errcode='42501'; end if;
 end if;
 if p_action='preflight' then
  if coalesce(p_args->>'ipHash','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid ip hash'; end if;
  insert into public.community_v2_rates(key,window_start,hits) values('attempt:'||(p_args->>'ipHash'),v_window,1)
  on conflict(key) do update set window_start=excluded.window_start,hits=case when community_v2_rates.window_start=excluded.window_start then community_v2_rates.hits+1 else 1 end returning hits into v_hits;
  return jsonb_build_object('status',case when v_hits>240 then 'limited' else 'ok' end);
 elsif p_action='cleanupCandidates' then
  v_result:='[]'::jsonb;
  -- Row locks serialize stale expiry with finish. Paths remain tombstones forever
  -- until retention cleanup, so late uploads are removed on a future sweep.
  for r in select * from public.community_v2_items
   where kind='photo' and path is not null and
    (status in ('rejected','deleted') or (status='pending' and not ready and created_at<now()-interval '1 hour'))
   order by last_cleanup_at asc nulls first,created_at,id limit 50 for update skip locked
  loop
   if r.status='pending' then
    update public.community_v2_items set status='deleted',text='',event_day=null,ready=false,version=version+1 where id=r.id;
    insert into public.community_v2_audit(item_id,decision,actor) values(r.id,'deleted','orphan-cleanup');
   end if;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('id',r.id,'path',r.path));
  end loop;
  return jsonb_build_object('items',v_result);
 elsif p_action='cleanupComplete' then
  update public.community_v2_items set last_cleanup_at=now()
   where id=(p_args->>'id')::uuid and path=p_args->>'path' and status in ('rejected','deleted');
  if not found then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','ok');
 end if;
 if p_action in ('submit','finish','delete','status','moderate','photo') then
  v_id:=(p_args->>'id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||v_id::text,0));
  select * into r from public.community_v2_items where id=v_id for update;
 end if;
 if p_action='submit' then
  if r.id is not null then
   if r.token_hash<>p_args->>'tokenHash' or r.payload_hash<>p_args->>'payloadHash' then return jsonb_build_object('status','payload_mismatch'); end if;
  else
   if p_args->>'kind' not in ('photo','prayer') or p_args->>'ipHash' !~ '^[0-9a-f]{64}$' or p_args->>'tokenHash' !~ '^[0-9a-f]{64}$' or p_args->>'payloadHash' !~ '^[0-9a-f]{64}$' then raise exception 'invalid submission'; end if;
   -- Consistent lock ordering: IP bucket then token bucket. Atomic counters count
   -- fresh IDs, not retries; shared NAT gets 60 photos or 120 prayers/minute.
   foreach v_key in array array['ip:'||(p_args->>'kind')||':'||(p_args->>'ipHash'),'token:'||(p_args->>'tokenHash')] loop
    insert into public.community_v2_rates(key,window_start,hits) values(v_key,v_window,1)
    on conflict(key) do update set window_start=excluded.window_start,hits=case when community_v2_rates.window_start=excluded.window_start then community_v2_rates.hits+1 else 1 end returning hits into v_hits;
    if v_hits > (case when v_key like 'token:%' then 10 when p_args->>'kind'='photo' then 60 else 120 end) then return jsonb_build_object('status','limited'); end if;
   end loop;
   insert into public.community_v2_items(id,kind,text,event_day,token_hash,payload_hash,path,ready)
   values(v_id,p_args->>'kind',p_args->>'text',(p_args->>'eventDay')::integer,p_args->>'tokenHash',p_args->>'payloadHash',case when p_args->>'kind'='photo' then v_id::text||'.png' end,p_args->>'kind'='prayer') returning * into r;
  end if;
 elsif p_action in ('finish','status','delete') then
  if r.id is null or r.token_hash<>p_args->>'tokenHash' then return jsonb_build_object('status','missing'); end if;
  if p_action='finish' then
   if r.payload_hash<>p_args->>'payloadHash' then return jsonb_build_object('status','payload_mismatch'); end if;
   if r.status='pending' and not r.ready then update public.community_v2_items set ready=true,created_at=now() where id=v_id returning * into r; elsif r.status in ('rejected','deleted') then v_cleanup:=r.path; end if;
  elsif p_action='delete' then
   v_cleanup:=r.path;
   if r.status<>'deleted' then
    update public.community_v2_items set status='deleted',text='',event_day=null,ready=false,version=version+1 where id=v_id returning * into r;
    insert into public.community_v2_audit(item_id,decision) values(v_id,'deleted');
   end if;
  end if;
 elsif p_action='moderate' then
  if r.id is null then return jsonb_build_object('status','missing'); end if;
  if p_args->>'decision' not in ('approved','rejected','deleted') then raise exception 'invalid decision'; end if;
  -- Repeating a destructive decision can retry failed object cleanup safely.
  if r.status in ('rejected','deleted') and r.status=p_args->>'decision' then v_cleanup:=r.path;
  else
   if r.version<>(p_args->>'expectedVersion')::integer then return jsonb_build_object('status','conflict'); end if;
   if r.status='deleted' or (r.status='rejected' and p_args->>'decision'<>'deleted') or (p_args->>'decision'='approved' and not r.ready) then return jsonb_build_object('status','conflict'); end if;
   update public.community_v2_items set status=p_args->>'decision',version=version+1,
    text=case when p_args->>'decision'='approved' then text else '' end,
    event_day=case when p_args->>'decision'='approved' then event_day else null end,
    ready=case when p_args->>'decision'='approved' then ready else false end
    where id=v_id returning * into r;
   insert into public.community_v2_audit(item_id,decision,actor) values(v_id,r.status,v_actor);
   if r.status in ('rejected','deleted') then v_cleanup:=r.path; end if;
  end if;
 elsif p_action='photo' then
  if r.id is null or r.kind<>'photo' or not r.ready or not (r.status='approved' or (r.status='pending' and coalesce(v_session->>'role'='superadmin',false))) then return jsonb_build_object('status','missing'); end if;
  return jsonb_build_object('path',r.path);
 elsif p_action not in ('list','adminList') then raise exception 'invalid action';
 end if;
 if r.status in ('rejected','deleted') then v_cleanup:=r.path; end if;
 select count(*) into v_count from public.community_v2_items where kind='photo' and ready and status in ('pending','approved') and created_at>=v_today::timestamp at time zone 'Asia/Seoul' and created_at<(v_today+1)::timestamp at time zone 'Asia/Seoul';
 if p_action in ('list','adminList') then
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_result from (
   select c.created_at,jsonb_build_object('id',c.id,'kind',c.kind,'text',c.text,'createdAt',c.created_at,'eventDay',c.event_day)
   ||case when c.kind='photo' and c.ready and c.status in ('pending','approved') then jsonb_build_object('photoUrl','/api/community/photo?id='||c.id::text) else '{}'::jsonb end
   ||case when p_action='adminList' then jsonb_build_object('status',c.status,'version',c.version) else '{}'::jsonb end as item
   from public.community_v2_items c where (p_action='adminList' or (c.kind=p_args->>'kind' and c.status='approved' and c.ready))
   order by case when p_action='adminList' and c.status='pending' then 0 else 1 end,c.created_at desc limit case when p_action='adminList' then 100 else 30 end
  ) x;
  return jsonb_build_object('enabled',true,'items',v_result,'photoCountToday',v_count,'today',v_today);
 end if;
 return jsonb_build_object('id',r.id,'status',r.status,'photoCountToday',v_count,'today',v_today)
 ||case when p_action='submit' then jsonb_build_object('ready',r.ready,'path',r.path) else '{}'::jsonb end
 ||case when p_action in ('status','moderate') then jsonb_build_object('version',r.version) else '{}'::jsonb end
 ||case when v_cleanup is not null then jsonb_build_object('cleanupPath',v_cleanup) else '{}'::jsonb end;
end; $$;
revoke all on function public.community_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.community_v2(text,jsonb) to service_role;
commit;
