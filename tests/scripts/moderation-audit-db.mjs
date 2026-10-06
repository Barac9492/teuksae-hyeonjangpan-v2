// Actual PostgreSQL migrations (002..010, community_admin_pagination, feedback, trash, audit attribution) in PGlite.
// Synthetic rows only, no network or database credentials.
// PGLITE_MODULE=/absolute/path/to/dist/index.js node tests/scripts/moderation-audit-db.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHmac } from 'node:crypto';
import { handleCommunity } from '../../server/community.js';
import { SESSION_SECONDS } from '../../server/admin-auth.js';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../../supabase/migrations/',import.meta.url);
let checks=0;const ok=(c,l)=>{assert.ok(c,l);checks++;console.log(`PASS ${l}`);};
await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);`);
const files=(await readdir(dir)).filter(f=>(/^(00[2-9]|010)_/.test(f)||f.endsWith('_community_admin_pagination.sql'))||/_(church_feedback_guidance_and_pages|admin_tabs_recoverable_trash|moderation_audit_attribution|reviewed_prayer_masking|photo_private_archive|continuous_operations_capacity|prayer_public_edit)\.sql$/.test(f)).sort();
ok(files.at(-1).endsWith('_prayer_public_edit.sql'),'public-edit migration follows attribution, archive and continuous operations');
for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
const call=async(action,args)=>(await db.query('select public.community_v2($1,$2) r',[action,JSON.stringify(args)])).rows[0].r;
const mkSession=async(username,role,name,label)=>{const id=randomUUID();
 await db.query('insert into ops_accounts(username,role,display_label,active) values($1,$2,$3,true) on conflict do nothing',[username,role,'관리자']);
 await db.query("insert into ops_sessions(id,username,credential_version,display_name,label,expires_at) values($1,$2,1,$3,$4,now()+interval '1 day')",[id,username,name,label]);return id;};
const a=await mkSession('WOORI7','superadmin','김집사','S-AAAAAAAAAA');
const b=await mkSession('WOORI7','superadmin','Admin','S-BBBBBBBBBB');
const park=await mkSession('QAPARK','parking','주차','S-CCCCCCCCCC');
const h=c=>c.repeat(64);
const submit=async(text)=>{const id=randomUUID();await call('submit',{id,kind:'prayer',text,eventDay:0,tokenHash:h('a'),payloadHash:h('b'),ipHash:h('c')});return id;};
// Pre-migration style row (no session attribution) must remain readable.
const legacy=await submit('예전 기도');
await db.query("insert into community_v2_audit(item_id,decision,actor) values($1,'approved','WOORI7')",[legacy]);

const p1=await submit('권 집사 건강을 위해 기도해주세요. '.repeat(4));
ok((await call('moderate',{session:a,id:p1,decision:'approved',expectedVersion:0})).status==='approved','session A approves');
const p2=await submit('두번째 기도');
ok((await call('moderate',{session:b,id:p2,decision:'trashed',expectedVersion:0})).status==='trashed','session B trashes');
ok((await call('moderate',{session:b,id:p2,decision:'restored',expectedVersion:1})).status==='pending','session B restores');
const p3=await submit('세번째 기도');
ok((await call('moderate',{session:a,id:p3,decision:'rejected',expectedVersion:0})).status==='rejected','session A rejects');
const p5=await submit('관리자가 영구 삭제할 기도');
ok((await call('moderate',{session:b,id:p5,decision:'deleted',expectedVersion:0})).status==='deleted','session B permanently deletes');
const p4=await submit('작성자가 지울 기도');
await call('delete',{id:p4,tokenHash:h('a')});

const rows=(await db.query('select item_id,decision,actor,session_label,actor_display_name from community_v2_audit order by id')).rows;
const row=(id,d)=>rows.find(r=>r.item_id===id&&r.decision===d);
ok(row(p1,'approved')?.session_label==='S-AAAAAAAAAA'&&row(p1,'approved')?.actor_display_name==='김집사','approval stores session label and entered name');
ok(row(p2,'trashed')?.actor_display_name==='Admin'&&row(p2,'restored')?.session_label==='S-BBBBBBBBBB','trash/restore store the acting session');
ok(row(p3,'rejected')?.actor_display_name==='김집사','rejection stores the acting session');
ok(row(p5,'deleted')?.actor_display_name==='Admin'&&row(p5,'deleted')?.session_label==='S-BBBBBBBBBB','moderator permanent deletion stores the acting session');
ok(row(p4,'deleted')?.actor===null&&row(p4,'deleted')?.session_label===null,'owner withdrawal stays unattributed');

const list=await call('auditList',{session:a});
ok(list.attribution===true&&Array.isArray(list.items),'auditList returns attributed list');
ok(list.items.length===6,'auditList excludes owner withdrawals (6 moderator rows incl. legacy)');
ok(list.items[0].itemId===p5&&list.items[1].itemId===p3&&list.items.at(-1).itemId===legacy,'newest first');
const e1=list.items.find(x=>x.itemId===p1);
ok(e1.displayName==='김집사'&&e1.sessionLabel==='S-AAAAAAAAAA'&&e1.actor==='WOORI7'&&e1.actorLabel==='관리자'&&e1.kind==='prayer','entry carries actor, entered name, session, kind');
ok(e1.excerpt.length===60,'approved excerpt is capped at 60 chars');
ok(list.items.find(x=>x.itemId===p3).excerpt===null&&list.items.find(x=>x.itemId===p5).excerpt===null,'rejected/deleted items expose no text');
const leg=list.items.find(x=>x.itemId===legacy);
ok(leg.sessionLabel===null&&leg.displayName===null,'legacy row keeps null attribution (no inferred backfill)');
const denied=async(args,label)=>{await assert.rejects(()=>call('auditList',args),e=>e.code==='42501');checks++;console.log('PASS '+label);};
await denied({session:park},'non-superadmin cannot list audit (42501)');
await denied({session:randomUUID()},'unknown session cannot list audit (42501)');
await denied({},'missing session cannot list audit (42501)');
await db.query('update ops_sessions set revoked_at=now() where id=$1',[b]);
await denied({session:b},'revoked superadmin session cannot list audit (42501)');
const grants=(await db.query("select grantee from information_schema.routine_privileges where routine_name='community_v2' and privilege_type='EXECUTE'")).rows.map(r=>r.grantee).sort();
ok(!grants.includes('anon')&&!grants.includes('authenticated')&&grants.includes('service_role'),'execute stays service_role only');

// HTTP route through the real handler.
const env={NODE_ENV:'test',COMMUNITY_ALLOWED_ORIGIN:'http://localhost:4199',SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const cookieFor=(sid,user)=>{const now=Date.now(),p=Buffer.from(JSON.stringify({v:2,sid,sub:user,cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');return `__Host-woori_admin=${p}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(p).digest('base64url')}`;};
const fetcher=async(url,opts)=>{const name=url.split('/').at(-1),body=JSON.parse(opts.body);try{const r=name==='ops_get_session'?(await db.query('select public.ops_get_session($1) r',[body.p_session_id])).rows[0].r:await call(body.p_action,body.p_args);return new Response(JSON.stringify(r));}catch(e){return new Response(JSON.stringify({code:e.code}),{status:e.code==='42501'?403:500});}};
const http=async(path,sid,user)=>{let status,text='';const res={setHeader(){},end(x){text=x||'';},set statusCode(v){status=v;},get statusCode(){return status;}};
 await handleCommunity('admin',{method:'GET',url:path,headers:{cookie:cookieFor(sid,user),host:'localhost:4199'}},res,env,fetcher);return {status,body:text?JSON.parse(text):null};};
const ok1=await http('/api/admin/community?view=audit',a,'WOORI7');
ok(ok1.status===200&&ok1.body.items.length===6&&ok1.body.items.find(x=>x.itemId===p1).displayName==='김집사','GET ?view=audit returns attributed entries');
ok((await http('/api/admin/community?view=other',a,'WOORI7')).status===400,'unknown view rejected');
ok((await http('/api/admin/community?view=audit&status=all',a,'WOORI7')).status===400,'extra params rejected');
ok((await http('/api/admin/community?view=audit',park,'QAPARK')).status===403,'parking role forbidden over HTTP');
ok((await http('/api/admin/community?view=audit&view=audit',a,'WOORI7')).status===400,'duplicate view rejected');
ok((await http('/api/admin/community?view=audit',b,'WOORI7')).status!==200,'revoked session gets no audit over HTTP');
const page=await http('/api/admin/community',a,'WOORI7');
ok(page.status===200&&Array.isArray(page.body.items)&&page.body.trashSupported===true,'existing adminList route unchanged');
console.log(`moderation audit SQL checks: ${checks}`);
