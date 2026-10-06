// Actual PostgreSQL migrations 002..010 + community_admin_pagination, synthetic rows only, no network/database credentials.
// Install @electric-sql/pglite@0.3.14 outside the app, then:
// PGLITE_MODULE=/absolute/path/to/dist/index.js npm run test:community-sql
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHmac } from 'node:crypto';
import { handleCommunity } from '../../server/community.js';
import { SESSION_SECONDS } from '../../server/admin-auth.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
let checks=0;
const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log(`PASS ${label}`);};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
const call=(scope,action,args={}) => scalar(`select public.${scope}community_v2($1,$2)`,[action,JSON.stringify(args)]);
const dir=new URL('../../supabase/migrations/',import.meta.url);
const files=(await readdir(dir)).filter(f=>/^00[2-9]_|^010_/.test(f)).sort();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for (const file of files) await db.exec(await readFile(new URL(file,dir),'utf8'));

const sessions={};
for (const scope of ['','rehearsal_']) {
  sessions[scope]={};
  for (const [name,role] of [['QAADMIN','superadmin'],['QAPARK','parking'],['QASPACE','space']]) {
    const id=randomUUID(); sessions[scope][role]=id;
    await db.query(`insert into ${scope}ops_accounts(username,role,display_label,active) values($1,$2,$1,true)`,[name,role]);
    await db.query(`insert into ${scope}ops_sessions(id,username,credential_version,display_name,label,expires_at)
      values($1,$2,1,'Synthetic QA',$3,now()+interval '1 day')`,[id,name,'S-'+id.replaceAll('-','').slice(0,10).toUpperCase()]);
  }
}
const tokenHash='a'.repeat(64),payloadHash='b'.repeat(64),ipHash='c'.repeat(64);
const make=kind=>({id:randomUUID(),kind,text:'Synthetic QA only',eventDay:0,tokenHash,payloadHash,ipHash});
const seed=async(scope,options={})=>{
  const {count=1,status='approved',at='2026-09-01T00:00:00.123456Z',prefix='33333333'}=options;
  await db.query(`insert into ${scope}community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,created_at)
    select ($1||'-3333-4333-8333-'||lpad(n::text,12,'0'))::uuid,'prayer',case when $2='deleted' then '' else 'Synthetic page item' end,
    $2,$2 in ('approved','pending'),$3,$4,$5::timestamptz from generate_series(1,$6::integer) n`,[prefix,status,tokenHash,payloadHash,at,count]);
};
await seed('',{status:'deleted',prefix:'77777777'});
const sentinel=await rows('select * from community_v2_items');
const oldDefinitions=await rows(`select oid,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace order by oid`);
const migration=await readFile(new URL('20261002024937_community_admin_pagination.sql',dir),'utf8');
await assert.rejects(()=>db.exec(migration.replace(/commit;\s*$/,'select 1/0; commit;')));
await db.exec('rollback');
equal(await rows(`select oid,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace order by oid`),oldDefinitions,'failed migration rolls back all functions');
await db.exec(migration);
equal(await rows('select * from community_v2_items'),sentinel,'migration preserves tombstones and all row values');
const changedDefinitions=await rows(`select oid,proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace order by oid`);
equal(changedDefinitions.filter(row=>oldDefinitions.find(old=>old.oid===row.oid)?.definition!==row.definition).map(row=>row.proname).sort(),['community_v2','rehearsal_community_v2'],'only the two community RPCs change');

// Re-run legacy invariants against the replacement live RPC too.
await db.exec(await readFile(new URL('20261003183917_admin_tabs_recoverable_trash.sql',dir),'utf8'));
for (const scope of ['','rehearsal_']) {
  const session=sessions[scope].superadmin;
  const admin=args=>call(scope,'adminList',{session,...args});
  const clear=()=>db.exec(`truncate ${scope}community_v2_items,${scope}community_v2_audit,${scope}community_v2_rates`);
  await clear();
  await seed(scope,{count:130,status:'deleted',prefix:'44444444',at:'2026-09-30T00:00:00Z'});
  await seed(scope,{prefix:'22222222'});
  const first=await admin({});
  equal(first.items.length,1,'130 recent tombstones cannot consume the page');
  equal(first.items[0].status,'approved','old approved item remains reachable');
  equal(first.nextCursor,null,'single active item has no next page');
  ok(first.items.every(item=>!('token_hash' in item)&&!('payload_hash' in item)&&!('path' in item)),`${scope || 'live '} list has no private deletion/upload data`);
  await clear();
  await seed(scope,{count:203,status:'approved'});
  await seed(scope,{count:105,status:'pending',prefix:'22222222',at:'2026-08-01T00:00:00.123456Z'});
  await seed(scope,{count:4,status:'rejected',prefix:'55555555'});
  await seed(scope,{count:130,status:'deleted',prefix:'44444444',at:'2026-09-30T00:00:00Z'});
  for (const status of ['all','pending','approved','rejected']) {
    const expected=await rows(`select id from ${scope}community_v2_items where status<>'deleted' and ($1='all' or status=$1)
      order by case when status='pending' then 0 else 1 end,created_at desc,id desc`,[status]);
    const collected=[]; let cursor;
    do {
      const page=await admin({status,...cursor?{cursor}:{}});
      ok(page.items.length<=100,`${scope || 'live '} ${status} page is bounded to 100`);
      collected.push(...page.items.map(item=>item.id)); cursor=page.nextCursor;
      if (cursor) {
        equal(cursor.status,status,'cursor remains bound to its filter');
        ok(cursor.createdAt.endsWith('.123456+00:00'),'cursor preserves PostgreSQL microseconds');
      }
      assert.ok(collected.length<=expected.length,'pagination must terminate without repeats');
    } while(cursor);
    equal(collected,expected.map(row=>row.id),'all active items are reachable in stable pending/date/id order, without duplicates');
  }
  const page=await admin({status:'approved'});
  await call(scope,'moderate',{session,id:page.items.at(-1).id,decision:'deleted',expectedVersion:0});
  const afterDeletedBoundary=await admin({status:'approved',cursor:page.nextCursor});
  equal(afterDeletedBoundary.items.length,100,'cursor still works after its boundary row is deleted');
  equal(afterDeletedBoundary.items[0].id,'33333333-3333-4333-8333-000000000103','no row skipped after boundary deletion');
  for (const args of [{status:'deleted'},{cursor:{}},{status:'approved',cursor:{...page.nextCursor,status:'all'}},{status:'approved',cursor:{...page.nextCursor,priority:0}},{status:'approved',cursor:{...page.nextCursor,createdAt:'infinity'}}]) {
    await assert.rejects(()=>admin(args)); checks++;
  }
  for (const denied of [undefined,randomUUID(),sessions[scope].parking,sessions[scope].space,sessions[scope?'':'rehearsal_'].superadmin]) {
    await assert.rejects(()=>call(scope,'adminList',{session:denied}),error=>error.code==='42501'); checks++;
  }
  for (const [table,change,restore] of [
    ['ops_sessions','revoked_at=now()','revoked_at=null'],
    ['ops_sessions',"expires_at=now()-interval '1 second'","expires_at=now()+interval '1 day'"],
    ['ops_accounts','active=false','active=true'],
    ['ops_accounts','credential_version=2','credential_version=1'],
  ]) {
    const predicate=table==='ops_sessions'?'id=$1':'username=$1';
    const key=table==='ops_sessions'?session:'QAADMIN';
    await db.query(`update ${scope}${table} set ${change} where ${predicate}`,[key]);
    await assert.rejects(()=>admin({}),error=>error.code==='42501'); checks++;
    await db.query(`update ${scope}${table} set ${restore} where ${predicate}`,[key]);
  }
  // Terminal states, optimistic moderation, replay, public reads and photo cleanup
  // run against the same replacement RPC, not a mock or the superseded 005 body.
  await clear();
  for (const kind of ['prayer','photo','reflection']) {
    const args=make(kind);
    equal((await call(scope,'submit',args)).status,'pending','submission remains pending');
    equal((await call(scope,'list',{kind})).items.length,0,'pending submissions remain private');
    equal((await call(scope,'status',{...args,tokenHash:'d'.repeat(64)})).status,'missing','invalid owner token denied');
    equal((await call(scope,'delete',{...args,tokenHash:'d'.repeat(64)})).status,'missing','invalid deletion token denied');
    equal((await call(scope,'submit',args)).status,'pending','same request replays');
    equal((await call(scope,'submit',{...args,payloadHash:'d'.repeat(64)})).status,'payload_mismatch','changed payload rejected');
    if (kind==='photo') {
      equal((await call(scope,'photo',{id:args.id})).status,'missing','pending photo remains private');
      equal((await call(scope,'list',{kind})).photoCountToday,0,'unfinished photo not counted');
      equal((await call(scope,'finish',args)).photoCountToday,1,'finished photo counted');
      equal((await call(scope,'photo',{id:args.id,session})).path,args.id+'.png','moderator can preview pending photo');
    }
    equal((await call(scope,'moderate',{session,id:args.id,decision:'approved',expectedVersion:0})).status,'approved','moderation still approves');
    equal((await call(scope,'list',{kind})).items.some(item=>item.id===args.id),true,'approved item publicly visible');
    equal((await call(scope,'moderate',{session,id:args.id,decision:'deleted',expectedVersion:0})).status,'conflict','stale version cannot withdraw');
    equal((await call(scope,'delete',args)).status,'deleted','owner can withdraw');
    equal((await call(scope,'delete',args)).status,'deleted','withdrawal retries safely');
    equal((await call(scope,'submit',args)).status,'deleted','replay cannot resurrect');
    equal((await call(scope,'moderate',{session,id:args.id,decision:'approved',expectedVersion:2})).status,'conflict','deleted is terminal');
    equal((await call(scope,'list',{kind})).items.some(item=>item.id===args.id),false,'withdrawn item no longer public');
    if (kind==='photo') {
      equal((await call(scope,'photo',{id:args.id,session})).status,'missing','deleted photo is unavailable to moderator');
      equal((await call(scope,'finish',args)).status,'deleted','late upload cannot resurrect');
      equal((await call(scope,'cleanupCandidates')).items.some(item=>item.id===args.id),true,'tombstone remains eligible for cleanup');
      equal((await call(scope,'list',{kind})).photoCountToday,0,'withdrawn photo not counted');
    }
    const rejected=make(kind);
    await call(scope,'submit',rejected);
    equal((await call(scope,'moderate',{session,id:rejected.id,decision:'rejected',expectedVersion:0})).status,'rejected','rejection works');
    equal((await call(scope,'moderate',{session,id:rejected.id,decision:'approved',expectedVersion:1})).status,'conflict','rejection cannot be reversed');
    equal((await call(scope,'moderate',{session,id:rejected.id,decision:'deleted',expectedVersion:1})).status,'deleted','rejected items can be deleted');
    equal((await rows(`select text,ready,event_day from ${scope}community_v2_items where id=$1`,[rejected.id]))[0],{text:'',ready:false,event_day:null},'terminal content stays erased');
  }
  for (const role of ['anon','authenticated']) {
    equal(await scalar(`select has_function_privilege($1,$2,'execute')`,[role,`public.${scope}community_v2(text,jsonb)`]),false,'browser role cannot execute RPC');
  }
  equal(await scalar(`select has_function_privilege('service_role',$1,'execute')`,[`public.${scope}community_v2(text,jsonb)`]),true,'service role retains execute grant');
  const fn=(await rows(`select prosrc,prosecdef,proconfig from pg_proc where oid=$1::regprocedure`,[`public.${scope}community_v2(text,jsonb)`]))[0];
  ok(fn.prosecdef&&fn.proconfig.includes('search_path=""'),'security definer retains empty search path');
  if (scope) {
    ok(/begin\s+perform pg_catalog.pg_advisory_xact_lock_shared/.test(fn.prosrc),'rehearsal global reset lock remains first');
    ok(!/(?<!rehearsal_)(?:public\.)?(?:ops_|community_v2)/.test(fn.prosrc),'rehearsal replacement has no live table/function references');
  }
}

// Exercise actual HTTP pagination with the actual new SQL, including old active
// items behind >100 live rows and >100 tombstones. No external fetch occurs.
await db.exec('truncate community_v2_items,community_v2_audit,community_v2_rates');
await seed('',{count:130,status:'deleted',prefix:'44444444',at:'2026-09-30T00:00:00Z'});
await seed('',{count:201,status:'approved'});
const now=Date.now();
const env={SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const payload=Buffer.from(JSON.stringify({v:2,sid:sessions[''].superadmin,sub:'QAADMIN',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
const cookie=`__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
const httpIds=[]; let cursor;
do {
  const res={setHeader(){},end(value){this.body=JSON.parse(value);}};
  await handleCommunity('admin',{url:'/api/admin/community?status=approved'+(cursor?'&cursor='+cursor:''),method:'GET',headers:{cookie}},res,env,async(url,opts)=>{
    const args=JSON.parse(opts.body);
    const result=url.endsWith('/ops_get_session')?await scalar('select public.ops_get_session($1)',[args.p_session_id]):await call('',args.p_action,args.p_args);
    return {ok:true,json:async()=>result};
  },now);
  equal(res.statusCode,200,'HTTP pagination succeeds against migrated database');
  httpIds.push(...res.body.items.map(item=>item.id)); cursor=res.body.nextCursor;
  assert.ok(httpIds.length<=201,'HTTP pagination must terminate');
} while(cursor);
equal(new Set(httpIds).size,201,'HTTP pagination reaches every active item through opaque cursors');
await db.close();
console.log(`PASS ${checks} community PostgreSQL/HTTP checks. Actual migrations 002..010 + community_admin_pagination; synthetic local data only.`);
