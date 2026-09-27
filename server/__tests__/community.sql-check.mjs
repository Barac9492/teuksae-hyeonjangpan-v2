// Optional executable PostgreSQL test: install @electric-sql/pglite outside this app,
// then PGLITE_MODULE=/absolute/path/to/dist/index.js node server/__tests__/community.sql-check.mjs
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table public.ops_sessions(id uuid,username text);create table public.ops_accounts(username text);create function public.ops_get_session(uuid) returns jsonb language sql as $$ select '{"role":"superadmin"}'::jsonb $$;`);
await db.exec(await readFile(new URL('../../supabase/migrations/005_community.sql',import.meta.url),'utf8'));
async function call(a,b={}){return (await db.query('select public.community_v2($1,$2) as result',[a,JSON.stringify(b)])).rows[0].result;}
const id='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
await db.query('insert into ops_sessions values($1,$2)',[session,'ADMIN']);await db.exec("insert into ops_accounts values('ADMIN')");
const args={id,kind:'photo',text:'hi',eventDay:5,tokenHash:'a'.repeat(64),payloadHash:'b'.repeat(64),ipHash:'c'.repeat(64)};
assert.equal((await call('submit',args)).status,'pending');
await db.query("update community_v2_items set created_at=now()-interval '2 days' where id=$1",[id]);
assert.equal((await call('finish',args)).photoCountToday,1);
const completed=(await db.query('select created_at from community_v2_items where id=$1',[id])).rows[0].created_at;
await call('finish',args);
assert.deepEqual((await db.query('select created_at from community_v2_items where id=$1',[id])).rows[0].created_at,completed);
assert.equal((await call('submit',args)).photoCountToday,1);
assert.equal((await call('submit',{...args,payloadHash:'d'.repeat(64)})).status,'payload_mismatch');
assert.equal((await call('list',{kind:'photo'})).items.length,0);
assert.equal((await call('photo',{id})).status,'missing');
assert.equal((await call('photo',{id,session})).path,id+'.png');
assert.equal((await call('moderate',{id,session,decision:'approved',expectedVersion:0})).status,'approved');
assert.equal((await call('list',{kind:'photo'})).items.length,1);
assert.equal((await call('finish',args)).cleanupPath,undefined);
const second={...args,id:'33333333-3333-4333-8333-333333333333'};
await call('submit',second);assert.equal((await call('finish',second)).photoCountToday,2);
assert.equal((await call('moderate',{id:second.id,session,decision:'rejected',expectedVersion:0})).photoCountToday,1);
assert.equal((await call('moderate',{id:second.id,session,decision:'deleted',expectedVersion:1})).status,'deleted');
assert.equal((await call('status',second)).cleanupPath,second.id+'.png');
assert.equal((await call('submit',second)).cleanupPath,second.id+'.png');
assert.equal((await call('delete',args)).photoCountToday,0);
assert.equal((await call('photo',{id})).status,'missing');
assert.equal((await call('status',args)).status,'deleted');
assert.equal((await db.query('select text,event_day from community_v2_items')).rows[0].text,'');
const stale={...args,id:'44444444-4444-4444-8444-444444444444'};
await call('submit',stale);await db.query("update community_v2_items set created_at=now()-interval '2 hours' where id=$1",[stale.id]);
let candidates=await call('cleanupCandidates');assert.equal(candidates.items.length,3);
assert.equal((await call('status',stale)).status,'deleted');
assert.equal((await call('finish',stale)).cleanupPath,stale.id+'.png');
for(const item of candidates.items)assert.equal((await call('cleanupComplete',item)).status,'ok');
assert.equal((await call('cleanupCandidates')).items.length,3); // Successful cleanup never forgets terminal paths.
for(let i=0;i<240;i++)assert.equal((await call('preflight',{ipHash:'f'.repeat(64)})).status,'ok');
assert.equal((await call('preflight',{ipHash:'f'.repeat(64)})).status,'limited');
console.log('PASS executable migration, replay, mismatch, pending visibility, moderator photo, approval, KST counts, hard content deletion');
await db.close();
