// Real PostgreSQL engine and production HTTP handler. Synthetic data; no network.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { handleCommunity } from '../../server/community.js';
import { PRAYER_MASK_VERSION, prayerMask } from '../../server/prayer-masking.js';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../../supabase/migrations/',import.meta.url);
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log(`PASS ${label}`);};
await db.exec('create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);');
let legacy,functionsBefore;
for(const f of (await readdir(dir)).filter(f=>/^(00[2-9]|01[01])_/.test(f)||/^2026.*\.sql$/.test(f)).sort()){
 if(f.endsWith('_prayer_blessing_boards.sql')){
  await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash) values($1,'prayer','합성 기존 기도','approved',true,$2,$3)",[randomUUID(),'a'.repeat(64),'b'.repeat(64)]);
  legacy=(await db.query('select to_jsonb(c) row from community_v2_items c')).rows;
  functionsBefore=(await db.query("select proname,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace order by proname,oid")).rows;
 }
 await db.exec(await readFile(new URL(f,dir),'utf8'));
}
assert.deepEqual((await db.query("select to_jsonb(c)-'prayer_board' row from community_v2_items c")).rows,legacy);ok(true,'migration preserves every existing value');
ok((await db.query("select bool_and(prayer_board='general') ok from community_v2_items")).rows[0].ok,'all legacy content stays general');
const changed=(await db.query("select proname,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace order by proname,oid")).rows.filter(x=>!functionsBefore.some(y=>y.proname===x.proname&&y.hash===x.hash)).map(x=>x.proname);
assert.deepEqual(changed,['community_prayer_page','community_public_page','community_v2']);ok(true,'only three intended functions changed; operations and masking unchanged');
ok((await db.query("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')) ok from pg_proc p where pronamespace='public'::regnamespace and proname in ('community_prayer_page','community_public_page','community_v2')")).rows[0].ok,'RPC privileges remain service-role only');
ok((await db.query("select relrowsecurity from pg_class where oid='community_v2_items'::regclass")).rows[0].relrowsecurity,'RLS stays enabled');
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from community_v2_items'));await db.exec('reset role');ok(true,`${role} cannot bypass server through table`);}
const call=async(action,args={})=>(await db.query('select public.community_v2($1,$2) r',[action,JSON.stringify(args)])).rows[0].r;
const page=async(board,cursor=null)=>(await db.query('select public.community_prayer_page($1,$2,$3) r',[board,cursor?.createdAt??null,cursor?.id??null])).rows[0].r;
const row=async id=>(await db.query('select * from community_v2_items where id=$1',[id])).rows[0];
const session=randomUUID();await db.exec("insert into ops_accounts(username,role,display_label,active) values('BOARDADMIN','superadmin','합성 관리자',true)");await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,'BOARDADMIN',1,'합성 검토자','S-AAAAAAAAAA',now()+interval '1 day')",[session]);
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)},now=Date.now();
const payload=Buffer.from(JSON.stringify({v:2,sid:session,sub:'BOARDADMIN',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+14400,nonce:'n'.repeat(32)})).toString('base64url');
const cookie=`__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
const http=async(route,url,body,auth=false,oldDb=false)=>{const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await handleCommunity(route,{url,method:body?'POST':'GET',body,headers:{origin:'https://teuksae-hyeonjangpan-v2.vercel.app','content-type':'application/json',...(auth?{cookie}:{})}},res,env,async(url,init)=>{const a=JSON.parse(init.body),name=url.split('/').at(-1);let data;
 if(name==='community_v2') data=oldDb&&a.p_action==='boardPolicy'?{}:await call(a.p_action,a.p_args);
 else if(name==='community_prayer_page')data=await page(a.p_board,a.p_before_at?{createdAt:a.p_before_at,id:a.p_before_id}:null);
 else if(name==='community_public_page')data=(await db.query('select public.community_public_page($1,$2,$3) r',[a.p_kind,a.p_before_at,a.p_before_id])).rows[0].r;
 else if(name==='ops_get_session')data=(await db.query('select public.ops_get_session($1) r',[a.p_session_id])).rows[0].r;
 else throw Error(name);return {ok:true,json:async()=>data};},now);return res;};
const draft=board=>({requestId:randomUUID(),kind:'prayer',prayerBoard:board,text:'합성 축복기도 '+board,eventDay:null,consent:true,deleteToken:'t'.repeat(43)});
for(const board of ['general','adults','youth']){
 const b=draft(board);let r=await http('public','/api/community',b);ok(r.statusCode===200&&r.body.status==='pending',`${board}: HTTP submission pending`);
 ok((await row(b.requestId)).prayer_board===board,`${board}: stored category`);
 ok(!(await page(board)).items.some(x=>x.id===b.requestId),`${board}: no publication before approval`);
 r=await http('public','/api/community',b);ok(r.statusCode===200&&(await row(b.requestId)).version===0,`${board}: identical retry creates no duplicate`);
 r=await http('public','/api/community',{...b,prayerBoard:board==='adults'?'youth':'adults'});ok(r.statusCode===409,`${board}: request ID cannot move boards`);
 const admin=await http('admin','/api/admin/community?kind=prayer',undefined,true);ok(admin.body.items.some(x=>x.id===b.requestId&&x.prayerBoard===board),`${board}: admin receives classification`);
 await call('moderate',{session,id:b.requestId,decision:'approved',expectedVersion:0,prayerBoard:'youth'});
 for(const target of ['general','adults','youth'])ok((await page(target)).items.some(x=>x.id===b.requestId)===(target===board),`${board}: only visible in ${target} when appropriate`);
 await call('moderate',{session,id:b.requestId,decision:'trashed',expectedVersion:1});await call('moderate',{session,id:b.requestId,decision:'restored',expectedVersion:2});
 ok((await row(b.requestId)).prayer_board===board&&!(await page(board)).items.some(x=>x.id===b.requestId),`${board}: trash/restore keeps board and requires fresh approval`);
}
for(const board of ['adults','youth']){
 const b={...draft(board),text:'합성 자해 회복 기도'};await http('public','/api/community',b);
 ok((await call('moderate',{session,id:b.requestId,decision:'approved',expectedVersion:0})).status==='mask_review_required',`${board}: plain approval cannot bypass masking`);
 const f={id:b.requestId,expectedVersion:0,publicationMode:board==='adults'?'auto':'manual',reviewedPublicText:board==='adults'?prayerMask(b.text).publicText:'합성 회복과 평안을 위한 기도',sourceHash:createHash('sha256').update(b.text).digest('hex'),maskPolicyVersion:PRAYER_MASK_VERSION};
 const preview=await http('admin','/api/admin/community',{action:'publicationPreview',...f},true);ok(preview.statusCode===200,`${board}: signed public preview`);
 ok(!(await page(board)).items.length,`${board}: preview alone never publishes`);
 const approved=await http('admin','/api/admin/community',{decision:'reviewed_approved',...preview.body,prayerBoard:'general'},true);ok(approved.statusCode===200,`${board}: reviewed publication`);
 const item=await row(b.requestId);ok(item.prayer_board===board&&item.text===b.text,`${board}: automatic/manual review preserves category and original`);
 const publicFeed=await http('public',`/api/community?kind=prayer&page=1&board=${board}`);ok(publicFeed.body.items[0].text===f.reviewedPublicText&&publicFeed.body.items[0].prayerBoard===board&&!JSON.stringify(publicFeed.body).includes(b.text),`${board}: only reviewed text leaves HTTP`);
 ok((await http('admin','/api/admin/community',{decision:'reviewed_approved',...preview.body},true)).statusCode===409,`${board}: repeated approval conflicts`);
 await http('public','/api/community',{action:'delete',id:b.requestId,deleteToken:b.deleteToken});ok(!(await page(board)).items.length,`${board}: author withdrawal hides publication`);
}
for(const board of ['adults','youth'])for(let i=0;i<27;i++)await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,prayer_board,created_at) values($1,'prayer',$2,'approved',true,$3,$4,$5,'2026-10-05T00:00:00.123456Z')",[randomUUID(),`합성 ${board} ${i}`,'a'.repeat(64),'b'.repeat(64),board]);
for(const board of ['adults','youth']){let cursor=null,seen=new Set(),sizes=[];do{const p=await page(board,cursor);sizes.push(p.items.length);p.items.forEach(x=>{assert.equal(x.prayerBoard,board);assert.ok(!seen.has(x.id));seen.add(x.id);});cursor=p.nextCursor;}while(cursor);assert.deepEqual(sizes,[12,12,3]);ok(seen.size===27,`${board}: filtering before pagination, exact timestamp ties, no skips`);}
const legacyList=await call('list',{kind:'prayer'});ok(legacyList.items.every(x=>x.prayerBoard==='general'),'old list API cannot mix special prayers into general');
const oldPage=(await db.query("select public.community_public_page('prayer') r")).rows[0].r;ok(oldPage.items.every(x=>x.text==='합성 기존 기도'),'old page API remains general');
for(const board of ['invalid','',null,[],{}]){const b={...draft('adults'),prayerBoard:board};if(board===null)continue;ok((await http('public','/api/community',b)).statusCode===400,'invalid category rejected by HTTP');}
for(const q of ['board=invalid','board=adults&board=youth','kind=photo&board=adults'])ok((await http('public','/api/community?kind=prayer&page=1&'+q)).statusCode===400,'invalid query rejected');
const blocked=draft('adults');ok((await http('public','/api/community',blocked,false,true)).statusCode===503&&!(await row(blocked.requestId)),'unmigrated DB fails closed before special submission');
await assert.rejects(()=>call('submit',{id:randomUUID(),kind:'prayer',prayerBoard:'bad'}));ok(true,'SQL independently rejects invalid board');
await assert.rejects(()=>db.query("update community_v2_items set prayer_board='bad'"));ok(true,'table check independently rejects invalid board');
await assert.rejects(()=>call('moderate',{id:legacy[0].row.id,decision:'approved',expectedVersion:0,session:randomUUID()}));ok(true,'SQL independently denies unauthenticated moderator');
console.log(`PASS ${checks} prayer-board integration assertions`);await db.close();
