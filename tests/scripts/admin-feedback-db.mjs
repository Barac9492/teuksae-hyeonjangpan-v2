// Actual migrated PostgreSQL in WASM; synthetic data only; never reads credentials.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(), dir=new URL('../../supabase/migrations/',import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for(const file of (await readdir(dir)).filter(f=>/^(00[2-9]|01[01])_/.test(f)||f.endsWith('_church_feedback_guidance_and_pages.sql')).sort()) await db.exec(await readFile(new URL(file,dir),'utf8'));
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(action,args={})=>(await query('select community_v2($1,$2) result',[action,JSON.stringify(args)]))[0].result;
const sessions={};for(const role of ['superadmin','parking','space']){const id=randomUUID();sessions[role]=id;await db.query('insert into ops_accounts(username,role,display_label,active) values($1,$2,$1,true)',[role.toUpperCase(),role]);await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,'Synthetic',$3,now()+interval '1 day')",[id,role.toUpperCase(),'S-'+id.replaceAll('-','').slice(0,10).toUpperCase()]);}
const tokenHash='a'.repeat(64), payloadHash='b'.repeat(64),ipHash='c'.repeat(64),session=sessions.superadmin;
const seed=async(kind='prayer')=>{const args={id:randomUUID(),kind,text:'Local synthetic content',eventDay:0,tokenHash,payloadHash,ipHash};await rpc('submit',args);if(kind==='photo')await rpc('finish',args);return args;};
const before=await seed();const original=await query('select * from community_v2_items');
const migration=await readFile(new URL((await readdir(dir)).find(f=>f.endsWith('_admin_tabs_recoverable_trash.sql')),dir),'utf8');
await assert.rejects(()=>db.exec(migration.replace(/commit;\s*$/,'select 1/0;commit;')));await db.exec('rollback');assert.deepEqual(await query('select * from community_v2_items'),original);
await db.exec(migration);assert.deepEqual(await query('select * from community_v2_items'),original);
for(const kind of ['prayer','photo','reflection']) {
 const item=await seed(kind);const decide=(decision,expectedVersion,who=session)=>rpc('moderate',{id:item.id,session:who,decision,expectedVersion});
 for(const who of [sessions.parking,sessions.space,randomUUID(),null])await assert.rejects(()=>decide('trashed',0,who));
 assert.equal((await decide('approved',0)).status,'approved');
 assert.equal((await decide('trashed',1)).status,'trashed');
 assert.equal((await decide('trashed',1)).status,'conflict');
 assert.equal((await decide('approved',2)).status,'conflict');
 assert.equal((await rpc('list',{kind})).items.some(x=>x.id===item.id),false);
 assert.equal((await query('select community_public_page($1) r',[kind]))[0].r.items.some(x=>x.id===item.id),false);
 assert.equal((await rpc('status',item)).status,'trashed');
 assert.equal((await rpc('adminList',{session})).items.some(x=>x.id===item.id),false);
 assert.equal((await rpc('adminList',{session,status:'trashed'})).items.some(x=>x.id===item.id),true);
 if(kind==='photo'){
  assert.equal((await rpc('photo',{id:item.id})).status,'missing');assert.ok((await rpc('photo',{id:item.id,session})).path);
  assert.equal((await rpc('cleanupCandidates')).items.some(x=>x.id===item.id),false);
  assert.equal((await rpc('finish',item)).status,'trashed');
 }
 assert.equal((await decide('restored',1)).status,'conflict');assert.equal((await decide('restored',2)).status,'pending');
 assert.equal((await decide('restored',2)).status,'conflict');assert.equal((await decide('approved',2)).status,'conflict');
 assert.equal((await decide('approved',3)).status,'approved');
 assert.equal((await decide('trashed',4)).status,'trashed');assert.equal((await rpc('delete',item)).status,'deleted');
 assert.equal((await decide('restored',6)).status,'conflict');assert.equal((await rpc('submit',item)).status,'deleted');
 assert.deepEqual((await query('select text,event_day,ready from community_v2_items where id=$1',[item.id]))[0],{text:'',event_day:null,ready:false});
 const audit=await query('select decision,actor from community_v2_audit where item_id=$1 order by id',[item.id]);
 assert.deepEqual(audit.map(x=>x.decision),['approved','trashed','restored','approved','trashed','deleted']);
 assert.ok(audit.slice(0,-1).every(x=>x.actor==='SUPERADMIN'));
}
// Pending and rejected behavior; private trash cannot be republished via old requests.
assert.equal((await rpc('moderate',{session,id:before.id,decision:'trashed',expectedVersion:0})).status,'trashed');
assert.equal((await rpc('moderate',{session,id:before.id,decision:'rejected',expectedVersion:1})).status,'conflict');
assert.equal((await rpc('moderate',{session,id:before.id,decision:'deleted',expectedVersion:1})).status,'deleted');
// Filter-before-limit and stable cursor across equal microsecond timestamps.
for(const kind of ['photo','prayer','reflection'])await db.query(`insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,created_at) select gen_random_uuid(),$1,'Synthetic','pending',true,$2,$3,'2026-10-01T00:00:00.123456Z' from generate_series(1,45)`,[kind,tokenHash,payloadHash]);
for(const kind of ['prayer','photo']){let cursor,ids=[];do{const page=await rpc('adminList',{session,kind,...cursor?{cursor}:{}});assert.ok(page.items.length<=20);assert.ok(page.items.every(x=>kind==='prayer'?['prayer','reflection'].includes(x.kind):x.kind===kind));ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor;if(cursor)await assert.rejects(()=>rpc('adminList',{session,kind:kind==='photo'?'prayer':'photo',cursor}));}while(cursor);assert.equal(new Set(ids).size,kind==='photo'?45:90);assert.equal(ids.length,new Set(ids).size);}
for(const role of ['anon','authenticated'])assert.equal((await query("select has_function_privilege($1,'community_v2(text,jsonb)','execute') p",[role]))[0].p,false);
assert.ok((await query("select relrowsecurity r from pg_class where oid='community_v2_items'::regclass"))[0].r);
assert.ok((await query("select proconfig from pg_proc where oid='community_v2(text,jsonb)'::regprocedure"))[0].proconfig.includes('search_path=""'));
for(const change of ["revoked_at=now()","expires_at=now()-interval '1 second'"]){await db.query(`update ops_sessions set ${change} where id=$1`,[session]);await assert.rejects(()=>rpc('adminList',{session,status:'trashed'}));await db.query("update ops_sessions set revoked_at=null,expires_at=now()+interval '1 day' where id=$1",[session]);}
// Admission and kind-scoped pagination above 100: preserve per-IP/token abuse budgets.
await db.exec('truncate community_v2_items,community_v2_audit,community_v2_rates');
for(const kind of ['prayer','photo']) {
 const expected=[];
 for(let n=1;n<=107;n++) {
  const hash=(n+(kind==='photo'?1000:0)).toString(16).padStart(64,'0');
  const item={id:randomUUID(),kind,text:'Synthetic volume',eventDay:0,tokenHash:hash,payloadHash,ipHash:hash};
  assert.equal((await rpc('submit',item)).status,'pending');
  if(kind==='photo')assert.equal((await rpc('finish',item)).status,'pending');
  expected.push(item.id);
 }
 let cursor;const seen=[];
 do {
  const page=await rpc('adminList',{session,kind,status:'pending',...cursor?{cursor}:{}});
  assert.ok(page.items.length<=20);
  seen.push(...page.items.map(item=>item.id));cursor=page.nextCursor;
  assert.ok(seen.length<=107,'cursor must terminate');
 }while(cursor);
 assert.deepEqual([...seen].sort(),expected.sort());
}
assert.equal((await rpc('list',{kind:'photo'})).photoCountToday,107);
console.log('PASS 107 prayer + 107 photo submissions in one day, every item reachable through 20-row pages');
await db.close();console.log('PASS migrated trash/restore, privacy, CAS replay, actor audit, role/session authorization, bound pagination and rollback checks');
