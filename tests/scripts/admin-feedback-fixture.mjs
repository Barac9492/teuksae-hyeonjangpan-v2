// Isolated loopback QA only: synthetic rows + actual SQL and community HTTP handler.
import { SESSION_SECONDS } from '../../server/admin-auth.js';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHmac} from 'node:crypto';
import {PNG} from 'pngjs';
import {handleCommunity} from '../../server/community.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../../supabase/migrations/',import.meta.url);
await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for(const f of (await readdir(dir)).filter(f=>(/^(00[2-9]|010)_/.test(f)||f.endsWith('_community_admin_pagination.sql'))||f.endsWith('_church_feedback_guidance_and_pages.sql') || f.endsWith('_continuous_operations_capacity.sql')||f.endsWith('_admin_tabs_recoverable_trash.sql')||f.endsWith('_moderation_audit_attribution.sql')||f.endsWith('_reviewed_prayer_masking.sql')||f.endsWith('_photo_private_archive.sql')||f.endsWith('_prayer_public_edit.sql')||f.endsWith('_prayer_blessing_boards.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
const session=randomUUID(),role=process.env.QA_ROLE || 'superadmin';
await db.query("insert into ops_accounts(username,role,display_label,active) values('LOCALQA',$1,'로컬 검증',true)",[role]);
await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,'LOCALQA',1,'로컬 검증','S-0000000001',now()+interval '1 day')",[session]);
for(let n=0;n<35;n++)await rpc('ops_set_resource_state',[session,'parking.songrim','busy',n,randomUUID(),70]);
await rpc('ops_set_resource_state',[session,'parking.dream','available',0,randomUUID(),null,2]);
const itemCount=Number(process.env.QA_ITEM_COUNT || 24);
for(const kind of ['prayer','photo','reflection'])for(let n=0;n<itemCount;n++)await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,path,created_at) values($1,$2,$3,$4,true,$5,$6,$7,now()-($8||' minutes')::interval)",[randomUUID(),kind,`로컬 검증용 ${kind} ${n+1} · 실제 제출물이 아닙니다.`,n>=itemCount-2?'approved':'pending','a'.repeat(64),'b'.repeat(64),kind==='photo'?`fixture-${n}.png`:null,n]);
// Dedicated masking fixtures: held rows must not disturb the routine queue.
for(const [id,text,status] of [['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','자살예방과 폭행 중단을 위한 합성 기도','pending'],['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','성폭행 피해 회복을 위한 합성 기도','approved']])await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash) values($1,'prayer',$2,$3,true,$4,$5)",[id,text,status,'a'.repeat(64),'b'.repeat(64)]);
if(process.env.QA_BOARDS==='1') {
 for(const board of ['adults','youth'])for(let n=0;n<14;n++)await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,prayer_board) values($1,'prayer',$2,'approved',true,$3,$4,$5)",[randomUUID(),`합성 예시 · ${board==='adults'?'어른들의 오늘에 평안과 감사를':'다음 세대의 걸음에 용기와 소망을'} ${n+1}`,'a'.repeat(64),'b'.repeat(64),board]);
}
const img=new PNG({width:500,height:320});for(let y=0;y<320;y++)for(let x=0;x<500;x++){const i=(y*500+x)*4;img.data[i]=80+y/3;img.data[i+1]=130+x/8;img.data[i+2]=160+y/5;img.data[i+3]=255;}const png=PNG.sync.write(img);
const port=Number(process.env.PORT||4185),origin=`http://localhost:${port}`;
const env={NODE_ENV:'test',COMMUNITY_ALLOWED_ORIGIN:origin,SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const now=Date.now(),payload=Buffer.from(JSON.stringify({v:2,sid:session,sub:'LOCALQA',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
const cookie=`__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
const fetcher=async(url,opts)=>{
 if(url.includes('/storage/'))return new Response(opts.method==='DELETE'?'{}':png,{status:200});
 const name=url.split('/').at(-1),b=JSON.parse(opts.body);let result;
 try{result=name==='ops_get_session'?await rpc(name,[b.p_session_id]):name==='community_prayer_page'?await rpc(name,[b.p_board,b.p_before_at,b.p_before_id]):name==='community_public_page'?await rpc(name,[b.p_kind,b.p_before_at,b.p_before_id]):await rpc(name,[b.p_action,b.p_args]);return new Response(JSON.stringify(result));}catch(e){return new Response(JSON.stringify({error:e.code}),{status:e.code==='42501'?403:500});}
};
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'isolated-admin-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(!req.url.startsWith('/api/'))return next();const url=new URL(req.url,origin);
 const send=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 try{
 if(url.pathname==='/api/admin/session')return send({authenticated:true,username:'LOCALQA',role,displayName:'로컬 검증',expiresAt:new Date(now+SESSION_SECONDS*1000).toISOString(),sessionId:'S-0000000001',capabilities:{liveOperations:true}});
 if(url.pathname==='/api/admin/accounts')return send({accounts:[]});
 if(url.pathname==='/api/admin/operations'){
  if(req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks));const result=await rpc('ops_set_resource_state',[session,b.resourceId,b.state,b.expectedVersion,b.requestId,b.occupancyPercent??null,b.guideFloor??null]);return send(result,result.status==='conflict'?409:200);}
  return send(await rpc('ops_list_operations',[session]));
 }
 if(url.pathname==='/api/status')return send({enabled:true,resources:await rpc('ops_public_resources')});
 const route=({'/api/admin/community':'admin','/api/community':'public','/api/community/photo':'photo'})[url.pathname];
 if(route){if(req.headers['x-qa-anonymous']!=='1')req.headers.cookie=cookie;if(req.method==='POST')req.headers.origin=origin;return await handleCommunity(route,req,res,env,fetcher);}
 return send({error:'Synthetic QA only'},405);
 }catch(e){console.error(e.message);return send({error:'Local fixture failed'},500);}
 });}}]});
await server.listen();console.log('Isolated synthetic admin fixture: '+server.resolvedUrls.local[0]);
