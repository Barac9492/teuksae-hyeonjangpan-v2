// Synthetic integration: migrations + real PostgreSQL RPCs + HTTP handler. No remote DB.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHmac } from 'node:crypto';
import { handleCommunity } from '../../server/community.js';
import { PRAYER_MASK_TERMS, PRAYER_MASK_VERSION, prayerMask } from '../../server/prayer-masking.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../../supabase/migrations/',import.meta.url);
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log(`PASS ${label}`);};
await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for(const f of (await readdir(dir)).filter(f=>(/^(00[2-9]|010)_/.test(f)||f.endsWith('_community_admin_pagination.sql'))||/^2026.*\.sql$/.test(f)).sort()) {
 const isUpgrade=f.endsWith('_reviewed_prayer_masking.sql'),isEditingUpgrade=f.endsWith('_prayer_public_edit.sql');let before,legacySnapshot,functionSnapshot,archiveSnapshot;
 if(isEditingUpgrade){await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,masked_public_text,masked_policy_version,masked_source_hash) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','prayer','자해 합성 기존 가림','approved',true,$1,$2,'** 합성 기존 가림',public.prayer_mask_policy_version(),encode(sha256(convert_to('자해 합성 기존 가림','UTF8')),'hex'))",['a'.repeat(64),'b'.repeat(64)]);legacySnapshot=(await db.query("select to_jsonb(c) snapshot from community_v2_items c where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'")).rows[0].snapshot;}
 if(isUpgrade){await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash) values('ffffffff-ffff-4fff-8fff-ffffffffffff','prayer','폭행 합성 기존 승인 원문','approved',true,$1,$2)",['a'.repeat(64),'b'.repeat(64)]);before=(await db.query('select to_jsonb(c) snapshot from community_v2_items c')).rows[0].snapshot;}
 if(isEditingUpgrade){
  functionSnapshot=(await db.query("select proname,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace order by proname,oid")).rows;
  await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,path) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','photo','합성 기존 보관','archived',true,$1,$2,'synthetic.png')",['a'.repeat(64),'b'.repeat(64)]);
  archiveSnapshot=(await db.query("select to_jsonb(c) snapshot from community_v2_items c where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'")).rows[0].snapshot;
 }
 await db.exec(await readFile(new URL(f,dir),'utf8'));
 if(isEditingUpgrade){
  const defs=(await db.query("select proname,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace order by proname,oid")).rows;
  assert.deepEqual(defs.filter(x=>!functionSnapshot.some(y=>x.proname===y.proname&&x.hash===y.hash)).map(x=>x.proname),['community_v2','prayer_public_text_valid','prayer_publication_allowed']);
  ok(true,'upgrade changes only intended prayer/community functions; all operational RPCs preserved');
  assert.deepEqual((await db.query("select to_jsonb(c)-'public_review_mode' snapshot from community_v2_items c where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'")).rows[0].snapshot,archiveSnapshot);
  ok(true,'existing archived photo content, status, version and receipt fields unchanged');
  await db.exec("delete from community_v2_items where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'");
 }

 if(isEditingUpgrade){const row=(await db.query("select to_jsonb(c)-'public_review_mode' snapshot,public.prayer_publication_allowed(c) allowed from community_v2_items c where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'")).rows[0];assert.deepEqual(row.snapshot,legacySnapshot);ok(row.allowed,'additive edit migration preserves all legacy publication fields and availability');await db.exec("delete from community_v2_items where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'");}
 if(isUpgrade){const after=(await db.query("select to_jsonb(c)-'masked_public_text'-'masked_policy_version'-'masked_source_hash' snapshot from community_v2_items c")).rows[0].snapshot;assert.deepEqual(after,before);ok(true,'upgrade leaves existing original and every prior field unchanged');await db.exec("delete from community_v2_items where id='ffffffff-ffff-4fff-8fff-ffffffffffff'");}
}
const privileges=(await db.query("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')) safe from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('community_v2','community_public_page','prayer_mask_text','prayer_mask_policy_version','prayer_needs_review','prayer_publication_allowed','prayer_public_text_valid')")).rows[0];ok(privileges.safe,'new and existing RPC effective privileges remain service-role only');
const call=async(action,args={})=>(await db.query('select public.community_v2($1,$2) r',[action,JSON.stringify(args)])).rows[0].r;
const page=async(cursor=null)=>(await db.query("select public.community_public_page('prayer',$1,$2) r",[cursor?.createdAt??null,cursor?.id??null])).rows[0].r;
const session=randomUUID();await db.query("insert into ops_accounts(username,role,display_label,active) values('MASKADMIN','superadmin','검토자',true)");
await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,'MASKADMIN',1,'합성 검토자','S-AAAAAAAAAA',now()+interval '1 day')",[session]);
const h=c=>c.repeat(64);
const seed=async(text,status='pending',kind='prayer')=>{const id=randomUUID();await db.query('insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash) values($1,$2,$3,$4,true,$5,$6)',[id,kind,text,status,h('a'),h('b')]);return id;};
const item=async id=>(await db.query('select * from community_v2_items where id=$1',[id])).rows[0];
const approve=(id,expectedVersion=0,extra={})=>call('moderate',{session,id,expectedVersion,decision:'approved',...extra});
const masked=(id,text,expectedVersion=0,extra={})=>approve(id,expectedVersion,{decision:'masked_approved',reviewedPublicText:prayerMask(text).publicText,maskPolicyVersion:PRAYER_MASK_VERSION,...extra});
const examples=[...PRAYER_MASK_TERMS,'자살 자살 강간 폭행','성폭행과 폭행','자살예방과 살인미소','자 살','자\u200b살','자살'.normalize('NFD'),'자\n살','건강 회복과 우울증 치료','**','🌱 자해\n성폭력'];
for(const text of examples){const sql=(await db.query('select public.prayer_mask_text($1) t',[text])).rows[0].t;assert.equal(sql,prayerMask(text).publicText);assert.equal(prayerMask(sql).publicText,sql);}
ok(true,`SQL/JS parity and idempotence for ${examples.length} exact/Unicode/false-positive cases`);
const raw='합성 예시: 자살예방, 강간 피해 회복과 폭행 중단';const flagged=await seed(raw),plain=await seed('평안한 하루');
ok((await approve(flagged)).status==='mask_review_required','generic approval blocked by database');
ok((await masked(flagged,raw,0,{reviewedPublicText:'임의로 쓴 문장'})).status==='preview_changed','arbitrary rewritten preview rejected');
ok((await masked(flagged,raw,0,{maskPolicyVersion:'old'})).status==='preview_changed','stale dictionary preview rejected');
await assert.rejects(()=>call('moderate',{id:flagged,decision:'masked_approved',expectedVersion:0,session:randomUUID()}));ok(true,'unauthorized original/moderation route rejected');
ok((await masked(flagged,raw)).status==='approved','explicit exact masked preview approved');
ok((await masked(flagged,raw)).status==='conflict','duplicate/concurrent old version cannot approve again');
ok((await item(flagged)).text===raw,'stored original retained');
ok((await page()).items.find(x=>x.id===flagged).text===prayerMask(raw).publicText,'public SQL emits reviewed masked text');
const audit=await call('auditList',{session});ok(audit.items.some(x=>x.itemId===flagged&&x.decision==='masked_approved'&&x.maskPolicyVersion===PRAYER_MASK_VERSION),'audit retains review policy and existing actor attribution');
ok((await approve(plain)).status==='approved','ordinary unflagged approval preserved');
const old=await seed('폭행 합성 기존 승인','approved');
ok(!(await page()).items.some(x=>x.id===old)&&!(await call('list',{kind:'prayer'})).items.some(x=>x.id===old),'old approved match held on both public SQL paths');
const pending=await seed('자해 합성 대기');
const separate=await call('adminList',{session,kind:'prayer',status:'mask_review'});
ok(separate.items.some(x=>x.id===old&&x.publicationHeld)&&separate.items.some(x=>x.id===pending),'separate queue contains pending and old approved held items');
ok(!(await call('adminList',{session,kind:'prayer',status:'all'})).items.some(x=>[old,pending].includes(x.id)),'routine queue excludes separate-review items');
const admin=await call('adminList',{session,kind:'prayer',status:'approved'});ok(admin.items.find(x=>x.id===flagged).text===raw,'admin original stays original after publication');
// Filtering occurs before LIMIT: traverse > 2 pages interleaved with held items.
for(let i=0;i<30;i++){await seed(`평안 ${i}`,'approved');await seed(`폭행 ${i}`,'approved');}
let cursor=null,seen=new Set(),pages=0;do{const r=await page(cursor);for(const x of r.items){assert.ok(!prayerMask(x.text).required);assert.ok(!seen.has(x.id));seen.add(x.id);}cursor=r.nextCursor;pages++;}while(cursor&&pages<20);
ok(seen.size===32&&pages===3,'all pages remain full/unique and exclude held originals before pagination');
let reviewCursor=null,reviewSeen=new Set();do{const r=await call('adminList',{session,kind:'prayer',status:'mask_review',...(reviewCursor?{cursor:reviewCursor}:{})});for(const x of r.items){assert.ok(!reviewSeen.has(x.id));reviewSeen.add(x.id);}reviewCursor=r.nextCursor;}while(reviewCursor);
ok(reviewSeen.size===32,'separate-review cursor traverses held and pending items without skipping');
// Full HTTP route over actual SQL, synthetic credentials only.
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};const now=Date.now();
const payload=Buffer.from(JSON.stringify({v:2,sid:session,sub:'MASKADMIN',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+14400,nonce:'n'.repeat(32)})).toString('base64url');
const cookie=`__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
const http=async(route,url,body,auth=false,handler=handleCommunity)=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
 await handler(route,{url,method:body?'POST':'GET',body,headers:{origin:'https://teuksae-hyeonjangpan-v2.vercel.app','content-type':'application/json',...(auth?{cookie:typeof auth==='string'?auth:cookie}:{})}},res,env,async(url,init)=>{const args=JSON.parse(init.body);const name=url.split('/').at(-1);let data;
 if(name==='community_v2')data=await call(args.p_action,args.p_args);
 else if(name==='community_public_page')data=(await db.query('select public.community_public_page($1,$2,$3) r',[args.p_kind,args.p_before_at,args.p_before_id])).rows[0].r;
 else if(name==='ops_get_session')data=(await db.query('select public.ops_get_session($1) r',[args.p_session_id])).rows[0].r;
 else throw Error(name);return {ok:true,json:async()=>data};},now);return res;};
for(const path of ['/api/community?kind=prayer','/api/community?kind=prayer&page=1']){const r=await http('public',path);ok(r.statusCode===200&&!prayerMask(JSON.stringify(r.body)).required&&!JSON.stringify(r.body).includes('masked_source_hash'),'HTTP public legacy/page responses contain no originals or review metadata');}
let httpCursor=null,httpSeen=new Set();do{const query=new URLSearchParams({kind:'prayer',page:'1'});if(httpCursor){query.set('beforeAt',httpCursor.createdAt);query.set('beforeId',httpCursor.id);}const r=await http('public','/api/community?'+query);assert.equal(r.statusCode,200);assert.ok(!prayerMask(JSON.stringify(r.body)).required);for(const x of r.body.items){assert.ok(!httpSeen.has(x.id));httpSeen.add(x.id);}httpCursor=r.body.nextCursor;}while(httpCursor);
ok(httpSeen.size===32,'HTTP all public pages contain no raw terms and preserve pagination');
if(process.env.LEGACY_COMMUNITY_MODULE){
 const {handleCommunity:legacyHandler}=await import(process.env.LEGACY_COMMUNITY_MODULE);
 for(const path of ['/api/community?kind=prayer','/api/community?kind=prayer&page=1']){const r=await http('public',path,undefined,false,legacyHandler);ok(r.statusCode===200&&!prayerMask(JSON.stringify(r.body)).required,'actual main handler with new SQL never emits originals');}
}
const blocked=await http('admin','/api/admin/community',{id:pending,decision:'approved',expectedVersion:0},true);assert.equal(blocked.statusCode,409,JSON.stringify(blocked.body));ok(true,'HTTP generic approval bypass blocked');
const preview=await http('admin','/api/admin/community?kind=prayer&status=mask_review',undefined,true);ok(preview.body.items.every(x=>x.kind!=='prayer'||x.masking.supported&&x.masking.publicText===prayerMask(x.text).publicText),'admin HTTP provides exact supported previews');
ok((await http('admin','/api/admin/community?kind=prayer',undefined,false)).statusCode===401,'anonymous admin read rejected');
for(const blank of ['', ' \n\t ', '\u00a0\u3000\ufeff'])ok((await db.query('select public.prayer_public_text_valid($1) valid',[blank])).rows[0].valid===false,'SQL independently rejects ASCII/Unicode blank public text');
for(const [text,expected] of [['가'.repeat(601),false],['🌱'.repeat(600),true],['폭행',false]])ok((await db.query('select public.prayer_public_text_valid($1) valid',[text])).rows[0].valid===expected,'SQL public text validates code-point length and targeted words');
// Two-mode publication: real HTTP receipt and SQL locks, synthetic contents only.
const editedRaw='자해와 폭행에 관한 합성 원문',edited=await seed(editedRaw);
const {createHash}=await import('node:crypto');const digest=t=>createHash('sha256').update(t).digest('hex');
const fields={id:edited,expectedVersion:0,publicationMode:'manual',reviewedPublicText:'평안과 회복을 위한 합성 공개 문구',sourceHash:digest(editedRaw),maskPolicyVersion:PRAYER_MASK_VERSION};
const prepare=(f=fields,auth=true)=>http('admin','/api/admin/community',{action:'publicationPreview',...f},auth);
const publish=(p)=>http('admin','/api/admin/community',{decision:'reviewed_approved',...p},true);
ok((await prepare(fields,false)).statusCode===401,'anonymous preview denied');
for(const text of ['', ' \n\t ', '가'.repeat(601),'새로운 자살 표현'])ok((await prepare({...fields,reviewedPublicText:text})).statusCode===400,'manual invalid/blank/overlong/raw-term draft rejected before receipt');
ok((await prepare({...fields,sourceHash:'0'.repeat(64)})).statusCode===409,'preview requires exact original hash');
ok((await prepare({...fields,expectedVersion:1})).statusCode===409,'preview requires current item version');
ok((await prepare({...fields,publicationMode:'auto'})).statusCode===409,'auto preview must exactly match deterministic masking');
const prepared=await prepare();assert.equal(prepared.statusCode,200,JSON.stringify(prepared.body));const receipt=prepared.body;
const secondSession=randomUUID();await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,'MASKADMIN',1,'다른 합성 검토자','S-BBBBBBBBBB',now()+interval '1 day')",[secondSession]);const secondPayload=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url')),sid:secondSession})).toString('base64url'),secondCookie=`__Host-woori_admin=${secondPayload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(secondPayload).digest('base64url')}`;ok((await http('admin','/api/admin/community',{decision:'reviewed_approved',...receipt},secondCookie)).statusCode===409,'preview receipt cannot be reused by another valid moderator session');
ok(receipt.reviewedPublicText===fields.reviewedPublicText&&receipt.previewToken.length===64,'manual exact preview gets session-bound server receipt');
for(const patch of [{reviewedPublicText:'다른 안전한 문구'},{publicationMode:'auto'},{sourceHash:'0'.repeat(64)},{expectedVersion:1},{previewExpires:now-1},{previewToken:'0'.repeat(64)}])ok((await publish({...receipt,...patch})).statusCode===409,'changed/expired publication receipt rejected');
ok((await item(edited)).status==='pending','preview and invalid requests never publish');
await db.query("update ops_accounts set active=false where username='MASKADMIN'");ok((await publish(receipt)).statusCode!==200,'revoked moderator cannot use valid preview');await db.query("update ops_accounts set active=true where username='MASKADMIN'");
const published=await publish(receipt);assert.equal(published.statusCode,200,JSON.stringify(published.body));ok((await item(edited)).text===editedRaw&&(await item(edited)).masked_public_text===fields.reviewedPublicText&&(await item(edited)).public_review_mode==='manual','manual publish retains original and stores only separate public text');
ok((await publish(receipt)).statusCode===409,'repeat/concurrent manual confirmation cannot publish twice');
ok((await approve(edited,1)).status==='mask_review_required','generic approval cannot revert a reviewed manual publication');
for(const publicPath of ['/api/community?kind=prayer','/api/community?kind=prayer&page=1']){const r=await http('public',publicPath);ok(r.body.items.find(x=>x.id===edited)?.text===fields.reviewedPublicText&&!JSON.stringify(r.body).includes(editedRaw)&&!JSON.stringify(r.body).includes('sourceHash'),'manual reviewed text only on public legacy/page HTTP');}
if(process.env.LEGACY_COMMUNITY_MODULE){const {handleCommunity:oldHandler}=await import(process.env.LEGACY_COMMUNITY_MODULE);for(const path of ['/api/community?kind=prayer','/api/community?kind=prayer&page=1']){const r=await http('public',path,undefined,false,oldHandler);ok(r.body.items.find(x=>x.id===edited)?.text===fields.reviewedPublicText,'deployed old HTTP handler safely returns manual public text with new SQL');}}
const manualAudit=(await call('auditList',{session})).items.filter(x=>x.itemId===edited);ok(manualAudit.length===1&&manualAudit[0].publicationMode==='manual'&&manualAudit[0].publicTextHash===digest(fields.reviewedPublicText)&&manualAudit[0].publicTextLength===[...fields.reviewedPublicText].length&&manualAudit[0].publicTextChanged===true,'audit records mode, output hash/length/change and one attributed decision');
const adminCurrent=(await http('admin','/api/admin/community?kind=prayer&status=approved',undefined,true)).body.items.find(x=>x.id===edited);ok(adminCurrent.text===editedRaw&&adminCurrent.reviewedPublicText===fields.reviewedPublicText&&adminCurrent.publicationMode==='manual','authorized admin original and actual public preview remain accurate');
await call('delete',{id:edited,tokenHash:h('a')});ok((await item(edited)).text===''&&(await item(edited)).masked_public_text===null&&(await item(edited)).public_review_mode===null,'manual publication author withdrawal clears original and public draft');
const autoRaw='자살예방 합성 자동',autoId=await seed(autoRaw),autoFields={...fields,id:autoId,publicationMode:'auto',reviewedPublicText:prayerMask(autoRaw).publicText,sourceHash:digest(autoRaw)};
const autoReceipt=(await prepare(autoFields)).body;ok((await publish(autoReceipt)).statusCode===200&&(await item(autoId)).public_review_mode==='auto','new automatic mode uses same exact preview-confirm contract');
await call('moderate',{session,id:autoId,decision:'trashed',expectedVersion:1});await call('moderate',{session,id:autoId,decision:'restored',expectedVersion:2});ok((await item(autoId)).public_review_mode===null&&(await publish(autoReceipt)).statusCode===409,'trash/restore clears mode and invalidates old preview');
const afterRestore={...autoFields,expectedVersion:3};const staleReceipt=(await prepare(afterRestore)).body;
await db.query('update community_v2_items set text=$2 where id=$1',[autoId,'폭행예방 합성 자동']);ok((await publish(staleReceipt)).statusCode===409,'same transformed text but changed original invalidates exact source receipt');
await db.query('update community_v2_items set text=$2 where id=$1',[autoId,autoRaw]);
const safeSqlArgs={session,decision:'reviewed_approved',publicReviewVersion:'prayer-public-review-v1',...afterRestore};
ok((await call('moderate',{...safeSqlArgs,reviewedPublicText:'자살'})).status==='preview_changed','SQL independently rejects raw targeted output');
ok((await call('moderate',{...safeSqlArgs,sourceHash:'0'.repeat(64)})).status==='preview_changed','SQL independently rejects mismatched original');
ok((await call('moderate',{...safeSqlArgs,maskPolicyVersion:'old'})).status==='preview_changed','SQL independently rejects stale policy');
await assert.rejects(()=>call('publicationPreview',{...autoFields,session:randomUUID()}));ok(true,'SQL independently rejects unauthenticated preview');
await call('delete',{id:autoId,tokenHash:h('a')});

// Stale source even with unchanged masked output must be held.
await db.query('update community_v2_items set text=$2 where id=$1',[flagged,raw.replace('강간','폭행')]);ok(!(await page()).items.some(x=>x.id===flagged),'changed original invalidates reviewed source even when transformed text is identical');
await db.query('update community_v2_items set text=$2 where id=$1',[flagged,raw]);
await db.exec("create or replace function public.prayer_mask_policy_version() returns text language sql immutable set search_path='' as $$select 'next-policy'::text$$");
ok(!(await page()).items.some(x=>x.id===flagged),'changed policy holds prior masked approvals');
ok((await masked(flagged,raw,1)).status==='preview_changed','old preview cannot approve under changed policy');
await db.exec("create or replace function public.prayer_mask_text(p_text text) returns text language sql immutable strict set search_path='' as $$select p_text$$");
ok((await approve(flagged,1)).status==='mask_review_required','dictionary removal cannot fall back to generic original publication');
ok((await approve(flagged,1,{decision:'masked_approved',maskPolicyVersion:'next-policy',reviewedPublicText:raw})).status==='approved','dictionary removal requires explicit exact replacement preview');
// Restore synthetic policy and row review to continue withdrawal regression checks.
await db.exec(`create or replace function public.prayer_mask_policy_version() returns text language sql immutable set search_path='' as $$select '${PRAYER_MASK_VERSION}'::text$$`);
await db.exec(`create or replace function public.prayer_mask_text(p_text text) returns text language sql immutable strict set search_path='' as $$select regexp_replace(p_text,'${[...PRAYER_MASK_TERMS].sort((a,b)=>b.length-a.length).join('|')}','**','g')$$`);
await masked(flagged,raw,2);
ok((await call('moderate',{session,id:flagged,decision:'trashed',expectedVersion:3})).status==='trashed','trash preserved');
ok((await call('moderate',{session,id:flagged,decision:'restored',expectedVersion:4})).status==='pending'&&(await item(flagged)).masked_public_text===null,'restore clears old masked approval');
ok((await approve(flagged,5)).status==='mask_review_required','restored flagged item requires explicit review again');
await masked(flagged,raw,5);await call('delete',{id:flagged,tokenHash:h('a')});const deleted=await item(flagged);ok(deleted.text===''&&deleted.masked_public_text===null&&deleted.masked_source_hash===null,'author withdrawal removes original and derived text');
const reflection=await seed('폭행 합성 묵상','pending','reflection');ok((await approve(reflection)).status==='approved','scope stays prayer only');
const submitId=randomUUID(),args={id:submitId,kind:'prayer',text:'자해 합성 접수',eventDay:null,tokenHash:h('d'),payloadHash:h('e'),ipHash:h('f')};await call('submit',args);await call('submit',args);ok((await item(submitId)).text===args.text&&(await item(submitId)).version===0,'submission exact-byte idempotency stays unchanged');
console.log(`PASS ${checks} integration assertions`);await db.close();
