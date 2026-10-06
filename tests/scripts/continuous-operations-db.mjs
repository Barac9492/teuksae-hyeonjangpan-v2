// In-memory PostgreSQL only. Never connects to a remote database; all rows are synthetic.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await rows(sql,args))[0])[0];
const dir=new URL('../../supabase/migrations/',import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);`);
const migration='20261004230127_continuous_operations_capacity.sql';
const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.startsWith('001')&&f!==migration).sort();
for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
const sessions={};
for(const [name,role] of [['LOCALADMIN','superadmin'],['LOCALPARK','parking'],['LOCALSPACE','space']]) {
 const id=randomUUID();sessions[role]=id;
 await db.query('insert into ops_accounts(username,role,display_label,active) values($1,$2,$1,true)',[name,role]);
 await db.query(`insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,'Synthetic','$3',now()+interval '1 day')`.replace("'$3'",'$3'),[id,name,'S-'+id.replaceAll('-','').slice(0,10).toUpperCase()]);
}
const call=(id,state,percent,version,session=sessions.parking,request=randomUUID(),floor=null)=>scalar('select ops_set_resource_state($1,$2,$3,$4,$5,$6,$7)',[session,id,state,version,request,percent,floor]);
// Capture actual legacy API receipt/history, including the directed floor.
const legacyRequest=randomUUID();const legacy=await call('parking.dream','available',null,0,sessions.parking,legacyRequest,2);
const before=await rows('select * from ops_resources order by id');
const history=await rows('select * from ops_history order by id');
const receipts=await rows('select * from ops_request_receipts order by request_id');
const grants=await rows("select relname,relacl,relrowsecurity from pg_class where relname in ('ops_resources','ops_history','ops_request_receipts') order by relname");
const sql=await readFile(new URL(migration,dir),'utf8');
await assert.rejects(()=>db.exec(sql.replace(/commit;\s*$/,'select 1/0; commit;')));await db.exec('rollback');
eq(await rows('select * from ops_resources order by id'),before,'failed migration rolls back new resource and constraint');
await db.exec(sql);
eq(await rows("select * from ops_resources where id<>'space.songrim.f4' order by id"),before,'every existing resource retained exactly, including old floor rows/version/time');
eq(await rows('select * from ops_history order by id'),history,'all historical floor and percent records retained');
eq(await rows('select * from ops_request_receipts order by request_id'),receipts,'idempotency receipts retained');
eq(await rows("select relname,relacl,relrowsecurity from pg_class where relname in ('ops_resources','ops_history','ops_request_receipts') order by relname"),grants,'table grants and RLS unchanged');
const f4=await rows("select label,category,state,version,updated_at,occupancy_percent from ops_resources where id='space.songrim.f4'");
eq(f4,[{label:'본당 4층',category:'space',state:'checking',version:0,updated_at:null,occupancy_percent:null}],'new independent floor starts unknown');
eq(await call('parking.dream','available',null,0,sessions.parking,legacyRequest,2),legacy,'legacy retry still replays exactly');
let current=await call('parking.dream','available',null,1,sessions.parking,randomUUID(),3);
eq(current.status,'ok','old app floor update remains valid in DB-first interval');
for(const id of ['parking.dream','space.songrim.f4']) {
 const session=id.startsWith('parking')?sessions.parking:sessions.space;
 let version=await scalar('select version from ops_resources where id=$1',[id]);
 for(let percent=0;percent<=100;percent+=10){
  const state=percent===100?'full':percent>=70?'busy':'available',request=randomUUID();
  const result=await call(id,state,percent,version,session,request);
  eq(result.status,'ok',`${id} accepts ${percent}%`);eq(result.resource.occupancyPercent,percent,'exact manual percentage');eq(result.resource.guideFloor,null,'new readings clear current floor only');
  eq(await call(id,state,percent,version,session,request),result,'replay no duplicate write');
  eq((await call(id,state,percent,version,session)).status,'conflict','old expectedVersion rejected');
  eq((await call(id,state,percent===100?90:percent+10,version,session,request).catch(()=>({status:'invalid'}))).status==='ok',false,'changed retry payload cannot write');
  version++;
 }
 const publicRows=await scalar('select ops_public_resources()');const adminRows=await scalar('select ops_list_operations($1)',[session]);
 for(const field of ['state','version','updatedAt','occupancyPercent','guideFloor'])eq(publicRows.find(r=>r.id===id)[field],adminRows.resources.find(r=>r.id===id)[field],`public/admin ${field} parity`);
 for(const [state,percent,floor] of [['busy',65,null],['available',70,null],['full',90,null],['closed',50,null],['available',-10,null],['full',110,null],['available',50,2]]) {
  await assert.rejects(()=>call(id,state,percent,version,session,randomUUID(),floor));checks++;
 }
 for(const state of ['checking','closed']) {const saved=await call(id,state,null,version++,session);eq(saved.resource.occupancyPercent,null,`${state} is explicit non-percentage state`);}
}
const historyAfter=await rows('select * from ops_history where id=$1',[history[0].id]);eq(historyAfter,[history[0]],'legacy audit is still byte-equivalent after new saves');
const transition=await rows("select before_guide_floor,after_guide_floor,before_occupancy_percent,after_occupancy_percent from ops_history where resource_id='parking.dream' and after_occupancy_percent=0");
eq(transition,[{before_guide_floor:3,after_guide_floor:null,before_occupancy_percent:null,after_occupancy_percent:0}],'first actual percentage records floor-to-percent transition');
for(const [id,session] of [['space.songrim.f4',sessions.parking],['parking.dream',sessions.space]]){await assert.rejects(()=>call(id,'available',0,0,session),/unauthorized/);checks++;}
for(const role of ['anon','authenticated']) {
 eq(await scalar("select has_function_privilege($1,'public.ops_set_resource_state(uuid,text,text,integer,uuid,integer,integer)','EXECUTE')",[role]),false,role+' cannot execute privileged mutation');
 eq(await scalar("select has_table_privilege($1,'public.ops_resources','UPDATE')",[role]),false,role+' cannot mutate resources');
}
eq(await scalar("select has_function_privilege('service_role','public.ops_set_resource_state(uuid,text,text,integer,uuid,integer,integer)','EXECUTE')"),true,'server still allowed');
const spaceList=await scalar('select ops_list_operations($1)',[sessions.space]);eq(spaceList.resources.some(r=>r.id==='space.songrim.f4'),true,'space operator sees new floor');eq(spaceList.resources.some(r=>r.id==='parking.dream'),false,'category isolation');
await db.query('update ops_sessions set revoked_at=now() where id=$1',[sessions.parking]);await assert.rejects(()=>call('parking.dream','available',0,0),/unauthorized/);checks++;
console.log(`PASS ${checks} continuous-operation migration checks; in-memory synthetic PostgreSQL only`);await db.close();
