-- Local preparation only. Apply after physical verification of the manually
-- applied church_feedback_guidance_and_pages migration; DO NOT reapply it.
-- No existing content changes; no grants, RLS or storage policy expansion.
-- Trash retains private bytes; owner withdrawal and irreversible privacy deletion
-- remain terminal. Restore returns to pending, never straight to public.
begin;
alter table public.community_v2_items drop constraint community_v2_items_status_check;
alter table public.community_v2_items add constraint community_v2_items_status_check
 check(status in ('pending','approved','rejected','deleted','trashed'));
create or replace function public.community_v2(p_action text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.community_v2_items%rowtype; v_today date := (now() at time zone 'Asia/Seoul')::date;
 v_count bigint; v_session jsonb; v_actor text; v_result jsonb; v_key text; v_hits integer;
 v_kind text; v_filter text; v_cursor jsonb; v_last jsonb; v_next jsonb;
 v_cursor_priority integer; v_cursor_at timestamptz; v_cursor_id uuid;
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
   if p_args->>'kind' not in ('photo','prayer','reflection') or p_args->>'ipHash' !~ '^[0-9a-f]{64}$' or p_args->>'tokenHash' !~ '^[0-9a-f]{64}$' or p_args->>'payloadHash' !~ '^[0-9a-f]{64}$' then raise exception 'invalid submission'; end if;
   -- Consistent lock ordering: IP bucket then token bucket. Atomic counters count
   -- fresh IDs, not retries; shared NAT gets 60 photos or 120 prayers/minute.
   foreach v_key in array array['ip:'||(p_args->>'kind')||':'||(p_args->>'ipHash'),'token:'||(p_args->>'tokenHash')] loop
    insert into public.community_v2_rates(key,window_start,hits) values(v_key,v_window,1)
    on conflict(key) do update set window_start=excluded.window_start,hits=case when community_v2_rates.window_start=excluded.window_start then community_v2_rates.hits+1 else 1 end returning hits into v_hits;
    if v_hits > (case when v_key like 'token:%' then 10 when p_args->>'kind'='photo' then 60 else 120 end) then return jsonb_build_object('status','limited'); end if;
   end loop;
   insert into public.community_v2_items(id,kind,text,event_day,token_hash,payload_hash,path,ready)
   values(v_id,p_args->>'kind',p_args->>'text',(p_args->>'eventDay')::integer,p_args->>'tokenHash',p_args->>'payloadHash',case when p_args->>'kind'='photo' then v_id::text||'.png' end,p_args->>'kind' in ('prayer','reflection')) returning * into r;
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
  if coalesce(p_args->>'decision','') not in ('approved','rejected','deleted','trashed','restored') or coalesce(p_args->>'expectedVersion','') !~ '^[0-9]+$' then raise exception 'invalid decision'; end if;
  if p_args->>'decision' in ('trashed','restored') then
   if r.version<>(p_args->>'expectedVersion')::integer then return jsonb_build_object('status','conflict'); end if;
   if (p_args->>'decision'='trashed' and (r.status not in ('pending','approved') or not r.ready))
    or (p_args->>'decision'='restored' and r.status<>'trashed') then return jsonb_build_object('status','conflict'); end if;
   update public.community_v2_items set status=case when p_args->>'decision'='trashed' then 'trashed' else 'pending' end,
    version=version+1 where id=v_id returning * into r;
   insert into public.community_v2_audit(item_id,decision,actor) values(v_id,p_args->>'decision',v_actor);
   return jsonb_build_object('id',r.id,'status',r.status,'version',r.version);
  end if;
  -- A restored item always requires fresh review. Old approvals cannot bypass trash.
  if r.status='trashed' and p_args->>'decision'<>'deleted' then return jsonb_build_object('status','conflict'); end if;
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
  if r.id is null or r.kind<>'photo' or not r.ready or not (r.status='approved' or (r.status in ('pending','trashed') and coalesce(v_session->>'role'='superadmin',false))) then return jsonb_build_object('status','missing'); end if;
  return jsonb_build_object('path',r.path);
 elsif p_action not in ('list','adminList') then raise exception 'invalid action';
 end if;
 if r.status in ('rejected','deleted') then v_cleanup:=r.path; end if;
 select count(*) into v_count from public.community_v2_items where kind='photo' and ready and status in ('pending','approved') and created_at>=v_today::timestamp at time zone 'Asia/Seoul' and created_at<(v_today+1)::timestamp at time zone 'Asia/Seoul';
 -- Tombstones must be excluded BEFORE the page limit. Keep pending-first order,
 -- with an exact timestamp/UUID keyset so equal timestamps cannot hide old items.
 if p_action='adminList' then
  v_kind:=coalesce(p_args->>'kind','all');
  if v_kind not in ('all','prayer','photo') then raise exception 'invalid kind'; end if;
  v_filter:=coalesce(p_args->>'status','all');
  if v_filter not in ('all','pending','approved','rejected','trashed') then
   raise exception 'invalid admin status filter' using errcode='22023';
  end if;
  v_cursor:=nullif(p_args->'cursor','null'::jsonb);
  if v_cursor is not null then
   if jsonb_typeof(v_cursor) is distinct from 'object'
    or v_cursor->'v' is distinct from '1'::jsonb
    or v_cursor->>'status' is distinct from v_filter
    or coalesce(v_cursor->>'kind','all') is distinct from v_kind
    or coalesce(v_cursor->>'priority','') not in ('0','1')
    or coalesce(v_cursor->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_cursor->>'createdAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'invalid admin cursor' using errcode='22023';
   end if;
   v_cursor_priority:=(v_cursor->>'priority')::integer;
   v_cursor_at:=(v_cursor->>'createdAt')::timestamptz;
   v_cursor_id:=(v_cursor->>'id')::uuid;
   if (v_filter='pending' and v_cursor_priority<>0)
    or (v_filter in ('approved','rejected','trashed') and v_cursor_priority<>1) then
    raise exception 'invalid admin cursor priority' using errcode='22023';
   end if;
  end if;
  select coalesce(jsonb_agg(x.item order by x.priority,x.created_at desc,x.id desc),'[]'::jsonb)
   into v_result from (
    select case when c.status='pending' then 0 else 1 end as priority,c.created_at,c.id,
     jsonb_build_object('id',c.id,'kind',c.kind,'text',c.text,'createdAt',c.created_at,
      'eventDay',c.event_day,'status',c.status,'version',c.version)
     ||case when c.kind='photo' and c.ready and c.status in ('pending','approved','trashed')
       then jsonb_build_object('photoUrl','/api/community/photo?id='||c.id::text) else '{}'::jsonb end as item
    from public.community_v2_items c
    where (case when v_filter='all' then c.status not in ('deleted','trashed') else c.status=v_filter end)
     and (v_kind='all' or (v_kind='prayer' and c.kind in ('prayer','reflection')) or c.kind=v_kind)
     and (v_cursor is null
      or (case when c.status='pending' then 0 else 1 end)>v_cursor_priority
      or ((case when c.status='pending' then 0 else 1 end)=v_cursor_priority
       and (c.created_at,c.id)<(v_cursor_at,v_cursor_id)))
    order by case when c.status='pending' then 0 else 1 end,c.created_at desc,c.id desc
    limit case when v_kind='all' and v_filter<>'trashed' then 100 else 20 end
   ) x;
  v_last:=v_result->-1;
  -- EXISTS is a bounded lookahead, never a second page or a 101-item response.
  if v_last is not null and exists(
   select 1 from public.community_v2_items c
   where (case when v_filter='all' then c.status not in ('deleted','trashed') else c.status=v_filter end)
     and (v_kind='all' or (v_kind='prayer' and c.kind in ('prayer','reflection')) or c.kind=v_kind)
    and ((case when c.status='pending' then 0 else 1 end)>(case when v_last->>'status'='pending' then 0 else 1 end)
     or ((case when c.status='pending' then 0 else 1 end)=(case when v_last->>'status'='pending' then 0 else 1 end)
      and (c.created_at,c.id)<((v_last->>'createdAt')::timestamptz,(v_last->>'id')::uuid)))
  ) then
   v_next:=jsonb_build_object('v',1,'status',v_filter,
    'priority',case when v_last->>'status'='pending' then 0 else 1 end,
    'createdAt',v_last->>'createdAt','id',v_last->>'id') || case when v_kind<>'all' then jsonb_build_object('kind',v_kind) else '{}'::jsonb end;
  end if;
  return jsonb_build_object('enabled',true,'items',v_result,'photoCountToday',v_count,'today',v_today,'nextCursor',v_next,'kind',v_kind,'trashSupported',true);
 end if;
 if p_action in ('list','adminList') then
  select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into v_result from (
   select c.created_at,jsonb_build_object('id',c.id,'kind',c.kind,'text',c.text,'createdAt',c.created_at,'eventDay',c.event_day)
   ||case when c.kind='photo' and c.ready and c.status in ('pending','approved','trashed') then jsonb_build_object('photoUrl','/api/community/photo?id='||c.id::text) else '{}'::jsonb end
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

-- Retained rehearsal namespace: same pagination, isolated auth/reset locks.

commit;
