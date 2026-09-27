-- Run only after 004 and 007. Test fixtures and writes are rolled back.
begin;
do $test$
declare u text:='PCTTEST_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); s uuid:=gen_random_uuid(); rid text:='parking.test_'||gen_random_uuid()::text; sid text:='space.test_'||gen_random_uuid()::text; req uuid; r jsonb; replay jsonb; ver integer:=0; pct integer; st text;
begin
 insert into public.ops_accounts(username,role,display_label,active) values(u,'parking','rollback verification',true);
 insert into public.ops_sessions(id,username,credential_version,display_name,label,expires_at) values(s,u,1,'rollback verification','S-'||upper(substr(replace(s::text,'-',''),1,10)),now()+interval '1 hour');
 insert into public.ops_resources(id,label,category,state) values(rid,'rollback parking','parking','checking'),(sid,'rollback space','space','checking');
 for pct in select generate_series(0,100,10) loop
  st:=case when pct=100 then 'full' when pct>=70 then 'busy' else 'available' end; req:=gen_random_uuid();
  r:=public.ops_set_resource_state(s,rid,st,ver,req,pct);
  if r->>'status'<>'ok' or (r->'resource'->>'occupancyPercent')::integer<>pct then raise exception 'step failed %',pct; end if;
  replay:=public.ops_set_resource_state(s,rid,st,ver,req,pct); if replay<>r then raise exception 'retry mismatch'; end if;
  replay:=public.ops_set_resource_state(s,rid,st,ver,req,null); if replay->>'status'<>'payload_mismatch' then raise exception 'receipt mismatch not caught'; end if;
  ver:=ver+1;
 end loop;
 begin perform public.ops_set_resource_state(s,rid,'busy',ver,gen_random_uuid(),75); raise exception 'accepted_invalid'; exception when others then if sqlerrm='accepted_invalid' then raise; end if; end;
 begin perform public.ops_set_resource_state(s,rid,'full',ver,gen_random_uuid(),40); raise exception 'accepted_invalid'; exception when others then if sqlerrm='accepted_invalid' then raise; end if; end;
 begin perform public.ops_set_resource_state(s,rid,'closed',ver,gen_random_uuid(),0); raise exception 'accepted_invalid'; exception when others then if sqlerrm='accepted_invalid' then raise; end if; end;
 begin update public.ops_resources set occupancy_percent=75 where id=rid; raise exception 'accepted_invalid'; exception when check_violation then null; end;
 begin perform public.ops_set_resource_state(s,sid,'available',0,gen_random_uuid(),10); raise exception 'accepted_unauthorized'; exception when insufficient_privilege then null; end;
 r:=public.ops_set_resource_state(s,rid,'busy',ver,gen_random_uuid());
 if r->>'status'<>'ok' or r->'resource'->>'occupancyPercent' is not null then raise exception 'legacy 5-argument failure'; end if;
 ver:=ver+1;
 r:=public.ops_set_resource_state(s,rid,'closed',ver,gen_random_uuid(),null);
 if r->>'status'<>'ok' or r->'resource'->>'lastClosedAt' is null then raise exception 'closed history failure'; end if;
 if not exists(select 1 from public.ops_history where resource_id=rid and after_occupancy_percent=100) then raise exception 'percent history absent'; end if;
 r:=public.ops_set_resource_state(s,rid,'available',0,gen_random_uuid(),10); if r->>'status'<>'conflict' then raise exception 'version guard absent'; end if;
 if has_function_privilege('anon','public.ops_set_resource_state(uuid,text,text,integer,uuid,integer)','execute') then raise exception 'anon access'; end if;
end $test$;
select 'PASS: 11 steps, retry, payload mismatch, DB/API step guards, contradictory state rejection, role isolation, old 5-arg compatibility, history, conflict' as verification;
rollback;
