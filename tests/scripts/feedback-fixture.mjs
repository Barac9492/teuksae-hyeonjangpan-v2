// Isolated local QA server. All data are synthetic; never uses production credentials.
import { createServer } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const dir = new URL('../../supabase/migrations/', import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key,bucket_id text,name text);`);
for (const file of (await readdir(dir)).filter(f => /^(00[2-9]|01[01])_/.test(f) || f.endsWith('_church_feedback_guidance_and_pages.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`, args)).rows[0].result;
const session = randomUUID();
await db.query("insert into ops_accounts(username,role,display_label,password_hash,active) values('LOCAL','parking','로컬 검증',$1,true)",['scrypt$'+'a'.repeat(32)+'$'+'b'.repeat(64)]);
await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,'LOCAL',1,'로컬 검증','S-0000000001',now()+interval '1 day')",[session]);
await rpc('ops_set_resource_state',[session,'parking.songrim','busy',0,randomUUID(),70]);
await rpc('ops_set_resource_state',[session,'parking.dream','available',0,randomUUID(),null,2]);
for (const kind of ['prayer','photo','reflection']) for(let n=0;n<35;n++) await db.query("insert into community_v2_items(id,kind,text,status,ready,token_hash,payload_hash,created_at) values($1,$2,$3,'approved',true,$4,$5,now()-($6 ||' minutes')::interval)",[randomUUID(),kind,`로컬 검증용 ${kind} ${n+1} · 실제 제출 내용이 아닙니다.`,'a'.repeat(64),'b'.repeat(64),n]);
const img=new PNG({width:300,height:400});for(let y=0;y<400;y++)for(let x=0;x<300;x++){const i=(y*300+x)*4;img.data[i]=100+y/3;img.data[i+1]=115+y/4;img.data[i+2]=150+y/5;img.data[i+3]=255;}const png=PNG.sync.write(img);
const server=await createServer({server:{host:'127.0.0.1',port:Number(process.env.PORT || 4179),strictPort:true},plugins:[{name:'local-fixtures-only',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(!req.url.startsWith('/api/'))return next();
 const url=new URL(req.url,'http://127.0.0.1:4179');
 const send=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 try {
 if(url.pathname==='/api/status')return send({enabled:true,resources:await rpc('ops_public_resources')});
 if(url.pathname==='/api/admin/session')return send({authenticated:true,username:'LOCAL',role:'parking',displayName:'로컬 검증',expiresAt:new Date(Date.now()+86400000).toISOString(),sessionId:'S-0000000001',capabilities:{liveOperations:true}});
 if(url.pathname==='/api/admin/operations'){
  if(req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks));const out=await rpc('ops_set_resource_state',[session,b.resourceId,b.state,b.expectedVersion,b.requestId,b.occupancyPercent??null,b.guideFloor??null]);return send(out,out.status==='conflict'?409:200);}
  return send(await rpc('ops_list_operations',[session]));
 }
 if(url.pathname==='/api/community/photo'){res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','no-store');return res.end(png);}
 if(url.pathname==='/api/community'&&req.method==='GET')return send(await rpc('community_public_page',[url.searchParams.get('kind'),url.searchParams.get('beforeAt'),url.searchParams.get('beforeId')]));
 return send({error:'Local fixture has no submission endpoint'},405);
 }catch{send({error:'Local fixture failure'},500);}
 });}}]});
await server.listen();console.log('Synthetic QA fixture server:', server.resolvedUrls.local[0]);
