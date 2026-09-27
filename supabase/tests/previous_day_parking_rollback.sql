begin;
do $test$
declare u text:='HISTTEST_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); rid text:='parking.test_'||gen_random_uuid()::text; d date:=(now() at time zone 'Asia/Seoul')::date-1; start_at timestamptz; item jsonb;
begin
 start_at:=d::timestamp at time zone 'Asia/Seoul';
 insert into public.ops_accounts(username,role,display_label) values(u,'parking','rollback history test');
 insert into public.ops_resources(id,label,category,state) values(rid,'rollback history test','parking','checking');
 insert into public.ops_history(resource_id,before_state,after_state,actor_username,actor_label,session_label,created_at)
 select rid,x.before_state,x.after_state,u,'rollback history test','test',start_at+x.offset_time from (values
 ('available','full',interval '-1 second'),
 ('available','full',interval '0 seconds'),
 ('checking','closed',interval '30 minutes'),
 ('full','full',interval '1 hour'),
 ('busy','closed',interval '3 hours'),
 ('available','full',interval '4 hours'),
 ('full','closed',interval '6 hours'),
 ('closed','closed',interval '8 hours'),
 ('available','full',interval '24 hours'),
 ('busy','closed',interval '25 hours')
 ) x(before_state,after_state,offset_time);
 select x into item from jsonb_array_elements(public.ops_public_resources()) x where x->>'id'=rid;
 if item->'previousDay'->>'date'<>d::text then raise exception 'wrong Korea day'; end if;
 if (item->'previousDay'->>'firstFullAt')::timestamptz<>start_at then raise exception 'first full boundary/recheck wrong'; end if;
 if (item->'previousDay'->>'closedAt')::timestamptz<>start_at+interval '6 hours' then raise exception 'close boundary/recheck wrong'; end if;
 delete from public.ops_history where resource_id=rid;
 select x into item from jsonb_array_elements(public.ops_public_resources()) x where x->>'id'=rid;
 if item->'previousDay'->>'firstFullAt' is not null or item->'previousDay'->>'closedAt' is not null then raise exception 'invented empty history'; end if;
 if has_function_privilege('anon','public.ops_public_resources()','execute') then raise exception 'anon RPC exposed'; end if;
end $test$;
select 'PASS: Korea day boundaries, first full, last actual close, recheck exclusion, empty history, RPC privacy' as verification;
rollback;
