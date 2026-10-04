// Real migrations + RPC + HTTP handler over synthetic local data; never contacts Supabase.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHmac} from 'node:crypto';
import {handleCommunity} from '../../server/community.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../../supabase/migrations/',import.meta.url);
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);`);
const hash=c=>c.repeat(64),owner=hash('a'),payloadHash=hash('b');
const seed=async(status='pending',kind='photo',ready=true)=>{const id=randomUUID();await db.query('insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,path,event_day) values($1,$2,$3,$4,$5,$6,$7,$8,1)',[id,kind,'합성 보관 검증',status,ready,owner,payloadHash,kind==='photo'?`${id}.png`:null]);return id;};
const row=async id=>(await db.query('select * from community_v2_items where id=$1',[id])).rows[0];
for(const f of (await readdir(dir)).filter(f=>/^(00[2-9]|01[01])_/.test(f)||/^2026.*\.sql$/.test(f)).sort()) {
 if(f.endsWith('_photo_private_archive.sql')) {
  const id=await seed('approved'),before=await row(id);
  const definitions=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace")).rows;
  await db.exec(await readFile(new URL(f,dir),'utf8'));
  assert.deepEqual(await row(id),before);ok(true,'migration leaves all existing stored fields unchanged');
  const after=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace")).rows;
  assert.deepEqual(after.filter(a=>definitions.find(b=>b.proname===a.proname)?.definition!==a.definition).map(x=>x.proname),['community_v2']);ok(true,'only community_v2 changes; public-page and prayer policy definitions unchanged');
 } else await db.exec(await readFile(new URL(f,dir),'utf8'));
}
const call=async(action,args={})=>(await db.query('select public.community_v2($1,$2) r',[action,JSON.stringify(args)])).rows[0].r;
const page=async(cursor=null)=>(await db.query("select public.community_public_page('photo',$1,$2) r",[cursor?.createdAt??null,cursor?.id??null])).rows[0].r;
const sessions={};for(const [name,role] of [['ARCHIVEADMIN','superadmin'],['ARCHIVEPARK','parking'],['ARCHIVESPACE','space']]){const id=randomUUID();sessions[role]=id;await db.query('insert into ops_accounts(username,role,display_label,active) values($1,$2,$1,true)',[name,role]);await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,'합성 검토자',$3,now()+interval '1 day')",[id,name,'S-'+id.replaceAll('-','').slice(0,10).toUpperCase()]);}
const session=sessions.superadmin;
const moderate=(id,decision,expectedVersion=0)=>call('moderate',{session,id,decision,expectedVersion});
const admin=(status='all',cursor)=>call('adminList',{session,kind:'photo',status,...cursor?{cursor}:{}});
const hidden=async id=>{assert.ok(!(await call('list',{kind:'photo'})).items.some(x=>x.id===id));let cursor,seen=0;do{const p=await page(cursor);assert.ok(!p.items.some(x=>x.id===id));cursor=p.nextCursor;assert.ok(++seen<20);}while(cursor);assert.equal((await call('photo',{id})).status,'missing');};
for(const state of ['pending','approved']) {
 const id=await seed(state),before=await row(id);
 ok((await moderate(id,'archived')).status==='archived',`${state} -> archived`);
 const archived=await row(id);for(const key of ['text','path','ready','token_hash','payload_hash','event_day','created_at'])assert.deepEqual(archived[key],before[key]);
 ok(archived.version===1,'archive retains content, stored path, consent receipt and version increments once');
 await hidden(id);ok(true,'archived ID absent from legacy/page public lists and anonymous image RPC');
 ok((await call('photo',{id,session})).path===before.path,'superadmin retains original image access');
 ok((await admin('archived')).items.some(x=>x.id===id&&x.photoUrl),'dedicated archive list includes private admin image');
 ok(!(await admin()).items.some(x=>x.id===id),'routine queue excludes archive before LIMIT');
 ok((await call('status',{id,tokenHash:owner})).status==='archived','owner receipt reports archived without providing image');
 ok((await moderate(id,'archived')).status==='conflict'&&(await moderate(id,'approved',1)).status==='conflict','duplicate version and direct archive approval blocked');
 const audit=await call('auditList',{session});ok(audit.items.filter(x=>x.itemId===id&&x.decision==='archived').length===1&&audit.items.find(x=>x.itemId===id).displayName==='합성 검토자','one attributed archive audit entry');
 ok((await moderate(id,'unarchived',1)).status==='pending','archive -> review, not approved');
 await hidden(id);ok(true,'returned-to-review photo remains private');
 ok((await moderate(id,'approved',0)).status==='conflict'&&(await moderate(id,'archived',0)).status==='conflict','stale pre-archive approve/archive requests cannot overwrite review');
 ok((await moderate(id,'unarchived',1)).status==='conflict','duplicate return request has no second effect');
 ok((await moderate(id,'approved',2)).status==='approved','fresh review can explicitly approve again');
}
for(const [kind,status,ready] of [['prayer','pending',true],['reflection','pending',true],['photo','pending',false],['photo','rejected',false],['photo','deleted',false],['photo','trashed',true]]){
 const id=await seed(status,kind,ready);ok((await moderate(id,'archived')).status==='conflict',`reject archive of ${kind}/${status}/ready=${ready}`);
}
const privateId=await seed();await moderate(privateId,'archived');
for(const denied of [undefined,randomUUID(),sessions.parking,sessions.space]) {
 for(const [action,args] of [['adminList',{kind:'photo',status:'archived'}],['moderate',{id:privateId,decision:'unarchived',expectedVersion:1}],['photo',{id:privateId}]]){
  if(action==='photo'&&!denied){ok((await call(action,args)).status==='missing','anonymous image missing');continue;}
  await assert.rejects(()=>call(action,{...args,session:denied}),e=>e.code==='42501');checks++;
 }
}
await db.query('update ops_sessions set revoked_at=now() where id=$1',[session]);
await assert.rejects(()=>call('photo',{id:privateId,session}),e=>e.code==='42501');ok(true,'revoked moderator denied archived original');
await db.query('update ops_sessions set revoked_at=null where id=$1',[session]);
ok((await moderate(privateId,'trashed',1)).status==='trashed','archive can move to recoverable trash');
ok((await moderate(privateId,'restored',2)).status==='pending','trash restore returns to pending');
await moderate(privateId,'archived',3);
ok((await call('delete',{id:privateId,tokenHash:owner})).cleanupPath===`${privateId}.png`,'owner withdrawal from archive queues original removal');
ok((await row(privateId)).text===''&&!(await row(privateId)).ready,'withdrawal clears content');
ok((await moderate(privateId,'unarchived',4)).status==='conflict','withdrawn archive cannot be resurrected');
for(const decision of ['deleted','rejected']){const id=await seed();await moderate(id,'archived');ok((await moderate(id,decision,1)).cleanupPath===`${id}.png`,`archive ${decision} preserves cleanup`);}
const retained=await seed();await moderate(retained,'archived');
ok(!(await call('cleanupCandidates')).items.some(x=>x.id===retained),'existing orphan cleanup does not delete ready archives');
// More than two pages; exact timestamp / ID cursors, state isolation and no hidden-page actions.
for(let n=0;n<43;n++){const id=await seed(n%2?'approved':'pending');await moderate(id,'archived');}
let cursor,ids=[];do{const p=await admin('archived',cursor);assert.ok(p.archiveSupported&&p.items.length<=20);ids.push(...p.items.map(x=>x.id));cursor=p.nextCursor;}while(cursor);
ok(ids.length===44&&new Set(ids).size===44,'archive filter traverses 44 rows in bounded unique pages');
const ap=await admin('archived');await assert.rejects(()=>admin('approved',ap.nextCursor));ok(true,'archive cursor cannot cross filters');
const live=await seed('approved');await hidden(retained);ok((await page()).items.some(x=>x.id===live),'approved photos remain public');
const count=(await call('list',{kind:'photo'})).photoCountToday;await moderate(live,'archived');ok((await page()).photoCountToday===count-1,'both count paths retain existing pending/approved-only rule');
const grants=(await db.query("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')) safe from pg_proc p where pronamespace='public'::regnamespace and proname in ('community_v2','community_public_page')")).rows[0];ok(grants.safe,'effective RPC grants remain service-role only');
ok((await db.query("select not public private from storage.buckets where id='community-photos-v2'")).rows[0].private,'bucket remains private');
for(const table of ['community_v2_items','community_v2_audit','community_v2_rates']){const t=(await db.query("select relrowsecurity and not has_table_privilege('anon',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT') safe from pg_class where relname=$1",[table])).rows[0];ok(t.safe,`${table} retains RLS and no direct read grants`);}
// HTTP handler + real SQL; original bytes are synthetic and never go to any external service.
const env={SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)},now=Date.now();
const cookieFor=(sid,sub)=>{const data=Buffer.from(JSON.stringify({v:2,sid,sub,cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+14400,nonce:'n'.repeat(32)})).toString('base64url');return `__Host-woori_admin=${data}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(data).digest('base64url')}`;};
const adminCookie=cookieFor(session,'ARCHIVEADMIN');let reads=0,streamHook;
const http=async(route,url,{body,cookie,handler=handleCommunity}={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(b){this.body=b;}};
 await handler(route,{url,method:body?'POST':'GET',body,headers:{origin:'https://teuksae-hyeonjangpan-v2.vercel.app','content-type':'application/json',...(cookie?{cookie}:{})}},res,env,async(url,opts)=>{
  if(url.includes('/storage/')){reads++;return {ok:true,arrayBuffer:async()=>{if(streamHook)await streamHook();return new Uint8Array([1,2,3]);}};}
  const b=JSON.parse(opts.body),name=url.split('/').at(-1);try{const r=name==='community_v2'?await call(b.p_action,b.p_args):name==='ops_get_session'?(await db.query('select ops_get_session($1) r',[b.p_session_id])).rows[0].r:(await db.query('select community_public_page($1,$2,$3) r',[b.p_kind,b.p_before_at,b.p_before_id])).rows[0].r;return new Response(JSON.stringify(r));}catch(e){return new Response('{}',{status:e.code==='42501'?403:500});}
 },now);return res;};
const imgUrl=`/api/community/photo?id=${retained}`;
let r=await http('photo',imgUrl);ok(r.statusCode===404&&reads===0,'anonymous archived image returns HTTP404 before storage');
r=await http('photo',imgUrl,{cookie:cookieFor(sessions.parking,'ARCHIVEPARK')});ok(r.statusCode===403&&reads===0,'team account returns HTTP403');
r=await http('photo',imgUrl,{cookie:adminCookie});ok(r.statusCode===200&&Buffer.isBuffer(r.body),'superadmin receives retained synthetic bytes');
ok(r.headers['Cache-Control']==='private, no-store'&&r.headers.Vary==='Cookie, Origin','private image cache contract unchanged');
for(const url of ['/api/community?kind=photo','/api/community?kind=photo&page=1']){r=await http('public',url);ok(r.statusCode===200&&!String(r.body).includes(retained)&&r.headers['Cache-Control']==='private, no-store',`${url} hides archives and does not cache`);}
r=await http('admin','/api/admin/community?kind=photo&status=archived',{cookie:adminCookie});ok(JSON.parse(r.body).archiveSupported&&JSON.parse(r.body).items.every(x=>x.status==='archived'),'archive API filter maps to actual SQL');
const inFlight=await seed('approved');streamHook=()=>moderate(inFlight,'archived');r=await http('photo',`/api/community/photo?id=${inFlight}`);streamHook=null;ok(r.statusCode===404&&!Buffer.isBuffer(r.body),'archive committed during storage body read prevents public bytes');
r=await http('admin','/api/admin/community',{cookie:adminCookie,body:{id:inFlight,decision:'approved',expectedVersion:0}});ok(r.statusCode===409,'old-client approval cannot republish archive');
r=await http('admin','/api/admin/community',{cookie:adminCookie,body:{id:inFlight,decision:'unarchived',expectedVersion:1}});ok(r.statusCode===200&&JSON.parse(r.body).status==='pending','new HTTP decision returns to private review');
r=await http('public','/api/community',{body:{action:'status',id:retained,deleteToken:'a'.repeat(43)}});ok(r.statusCode===404,'invalid owner token cannot read archive receipt');
if(process.env.LEGACY_COMMUNITY_MODULE){
 const {handleCommunity:legacy}=await import(process.env.LEGACY_COMMUNITY_MODULE);
 for(const url of ['/api/community?kind=photo','/api/community?kind=photo&page=1']){const old=await http('public',url,{handler:legacy});ok(old.statusCode===200&&!String(old.body).includes(retained),'pre-release server + new DB public list excludes archived');}
 ok((await http('photo',imgUrl,{handler:legacy})).statusCode===404,'pre-release image handler + new DB denies archived');
 ok((await http('photo',imgUrl,{handler:legacy,cookie:adminCookie})).statusCode===200,'pre-release handler retains authenticated moderator original access');
}
await db.close();console.log(`Photo archive SQL/HTTP: ${checks} checks passed`);
