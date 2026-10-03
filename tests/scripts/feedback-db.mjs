// Local, disposable PostgreSQL only. No environment credentials or network calls.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const dir = new URL('../../supabase/migrations/', import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for (const file of (await readdir(dir)).filter(f => /^(00[2-9]|010)_/.test(f)).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`, args)).rows[0].result;
const fixtureHash = 'scrypt$' + 'a'.repeat(32) + '$' + 'b'.repeat(64);
const sessions = {};
for (const role of ['superadmin','parking','space']) {
  const username = role.toUpperCase(); const id = randomUUID(); sessions[role] = id;
  await db.query('insert into ops_accounts(username,role,display_label,password_hash,active) values($1,$2,$3,$4,true)', [username,role,'Fixture',fixtureHash]);
  await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,'Fixture',$3,now()+interval '1 day')",[id,username,'S-'+String(Object.keys(sessions).length).padStart(10,'0')]);
}
await rpc('ops_set_resource_state',[sessions.parking,'parking.dream.b1','busy',0,randomUUID(),70]);
await rpc('ops_set_resource_state',[sessions.parking,'parking.calvary','full',0,randomUUID(),100]);
const historyBefore = (await db.query('select * from ops_history order by id')).rows;
const migration = (await readdir(dir)).find(f => f.endsWith('_church_feedback_guidance_and_pages.sql'));
await db.exec(await readFile(new URL(migration, dir), 'utf8'));
assert.deepEqual((await db.query('select id,resource_id,before_state,after_state from ops_history order by id')).rows, historyBefore.map(({id,resource_id,before_state,after_state})=>({id,resource_id,before_state,after_state})));
const initial = (await rpc('ops_public_resources')).find(r=>r.id==='parking.dream');
assert.equal(initial.guideFloor,null); assert.equal(initial.state,'checking');
const request = [sessions.parking,'parking.dream','available',0,randomUUID(),null,2];
let saved = await rpc('ops_set_resource_state',request);
assert.equal(saved.resource.guideFloor,2); assert.equal(saved.resource.version,1);
assert.deepEqual(await rpc('ops_set_resource_state',request),saved);
assert.equal((await rpc('ops_set_resource_state',[...request.slice(0,6),3])).status,'payload_mismatch');
assert.equal((await rpc('ops_set_resource_state',[sessions.parking,'parking.dream','full',0,randomUUID(),null,null])).status,'conflict');
assert.equal((await rpc('ops_public_resources')).find(r=>r.id==='parking.dream').guideFloor,2);
assert.equal((await rpc('ops_list_operations',[sessions.parking])).resources.find(r=>r.id==='parking.dream').guideFloor,2);
for (const args of [
 [sessions.space,'parking.dream','available',1,randomUUID(),null,3],
 [sessions.parking,'parking.dream','available',1,randomUUID(),null,null],
 [sessions.parking,'parking.dream','available',1,randomUUID(),null,0],
 [sessions.parking,'parking.dream','available',1,randomUUID(),null,6],
 [sessions.parking,'parking.dream','full',1,randomUUID(),100,null],
 [sessions.parking,'parking.dream','full',1,randomUUID(),null,2],
 [sessions.parking,'parking.dream','busy',1,randomUUID(),null,null],
 [sessions.parking,'parking.songrim','available',0,randomUUID(),null,1],
]) await assert.rejects(()=>rpc('ops_set_resource_state',args));
saved=await rpc('ops_set_resource_state',[sessions.parking,'parking.dream','full',1,randomUUID(),null,null]);
assert.equal(saved.resource.state,'full'); assert.equal(saved.resource.guideFloor,null);assert.ok(saved.resource.lastFullAt);
await rpc('ops_set_resource_state',[sessions.parking,'parking.songrim','busy',0,randomUUID(),70]); // old signature remains compatible
assert.equal((await db.query("select count(*)::int as n from ops_resources where id='parking.calvary' or id like 'parking.dream.b%'")).rows[0].n,6);
assert.equal((await db.query("select after_guide_floor from ops_history where resource_id='parking.dream' order by created_at,id limit 1")).rows[0].after_guide_floor,2);
// The field is operator-selected: choosing B5 then B1 is valid; no inferred progression.
await rpc('ops_set_resource_state',[sessions.parking,'parking.dream','available',2,randomUUID(),null,5]);
saved=await rpc('ops_set_resource_state',[sessions.parking,'parking.dream','available',3,randomUUID(),null,1]);
assert.equal(saved.resource.guideFloor,1);
for(const role of ['anon','authenticated']) {
 const result=(await db.query("select has_function_privilege($1,'public.community_public_page(text,timestamptz,uuid)','execute') as allowed",[role])).rows[0]; assert.equal(result.allowed,false);
}
const at='2026-10-03T04:00:00Z';
for (let n=0;n<35;n++) {
 const id=`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`;
 await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,created_at) values($1,'prayer',$2,'approved',true,$3,$4,$5)",[id,`Fixture ${n}`,'a'.repeat(64),'b'.repeat(64),at]);
}
for(const status of ['pending','rejected','deleted']) await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash) values($1,'prayer','Private fixture',$2,true,$3,$4)",[randomUUID(),status,'a'.repeat(64),'b'.repeat(64)]);
let cursor=null; const ids=[];
do {
 const page=await rpc('community_public_page',['prayer',cursor?.createdAt??null,cursor?.id??null]);
 assert.ok(page.items.length<=12);assert.ok(page.items.every(i=>i.text!=='Private fixture'&&!('token_hash' in i)&&!('path' in i)));
 ids.push(...page.items.map(i=>i.id));cursor=page.nextCursor;
} while(cursor);
assert.equal(ids.length,35);assert.equal(new Set(ids).size,35);
let first=await rpc('community_public_page',['prayer',null,null]);
await db.query("update community_v2_items set status='deleted' where id=$1",[first.items[0].id]);
assert.ok(!(await rpc('community_public_page',['prayer',null,null])).items.some(i=>i.id===first.items[0].id));
await assert.rejects(()=>rpc('community_public_page',['prayer',at,null]));
console.log('PASS local SQL: migration history preservation, no invented capacity, selected-floor guidance, roles, validation, replay, conflict, old caller compatibility, private RPC grants, 35-item tied-timestamp pagination, moderation removal.');
await db.close();
