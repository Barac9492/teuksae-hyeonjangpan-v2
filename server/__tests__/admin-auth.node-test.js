import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { COOKIE_NAME, handleAdmin, handlePublicStatus } from '../admin-auth.js';
const salt=randomBytes(16), password='unit-test-password';
const env={ADMIN_LOGIN_ID:'FIXTURE_ADMIN',ADMIN_PASSWORD_SCRYPT:`scrypt$${salt.toString('hex')}$${scryptSync(password,salt,32).toString('hex')}`,ADMIN_SESSION_SECRET:randomBytes(48).toString('base64url'),ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40)};
let sessions=new Map(), revoked=new Set(), receipts=new Map(), resources=[{id:'parking.songrim',label:'송림본당 주차',category:'parking',state:'checking',version:0,updatedAt:null},{id:'space.songrim.access',label:'송림본당 개방 단계',category:'space',state:'checking',version:0,updatedAt:null}], history=[];
const accounts=new Map([['FIXTURE_ADMIN',{username:'FIXTURE_ADMIN',role:'superadmin',displayLabel:'관리자',passwordHash:env.ADMIN_PASSWORD_SCRYPT,active:true,credentialVersion:1,failed:0}]]);
function response(ok,data,status=ok?200:500){return {ok,status,json:async()=>data};}
async function db(url,init){const name=url.split('/').pop(),a=JSON.parse(init.body||'{}'); if(name==='ops_bootstrap_superadmin')return response(true,null); if(name==='ops_reserve_login'){let x=accounts.get(a.p_username);if(!x||!x.active||!x.passwordHash)return response(true,{status:'invalid'});if(x.failed>=12)return response(true,{status:'limited',retryAfter:900});x.failed++;return response(true,{status:'reserved',passwordHash:x.passwordHash,credentialVersion:x.credentialVersion,reservationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});} if(name==='ops_finish_login'){let x=accounts.get(a.p_username);if(!a.p_success)return response(true,{ok:false});x.failed=0;let id='11111111-1111-4111-8111-'+String(sessions.size+1).padStart(12,'0'),s={id,username:x.username,role:x.role,credentialVersion:x.credentialVersion,label:a.p_session_label,displayName:a.p_display_name};sessions.set(id,s);return response(true,s);} if(name==='ops_get_session'){let s=sessions.get(a.p_session_id);return response(true,!s||revoked.has(s.id)?null:s);} if(name==='ops_revoke_session'){revoked.add(a.p_session_id);return response(true,null);} if(name==='ops_list_operations'){let s=sessions.get(a.p_session_id);let rs=resources.filter(r=>s.role==='superadmin'||r.category===s.role);return response(true,{resources:rs,history:history.filter(h=>s.role==='superadmin'||resources.find(r=>r.id===h.resourceId)?.category===s.role),canManageAccounts:s.role==='superadmin'});} if(name==='ops_set_resource_state'){let s=sessions.get(a.p_session_id),r=resources.find(x=>x.id===a.p_resource_id),prior=receipts.get(a.p_request_id);if(prior){if(prior.resourceId!==a.p_resource_id||prior.state!==a.p_state||prior.expectedVersion!==a.p_expected_version)return response(true,{status:'payload_mismatch'});return response(true,prior.result);}if(s.role!=='superadmin'&&s.role!==r?.category)return response(false,{message:'unauthorized'},403);let result;if(r.version!==a.p_expected_version)result={status:'conflict',resource:r};else {let before=r.state;r={...r,state:a.p_state,version:r.version+1,updatedAt:'2026-01-01T00:00:00.000Z'};resources=resources.map(x=>x.id===r.id?r:x);history.push({id:'h'+history.length,resourceId:r.id,beforeState:before,afterState:r.state,actorUsername:s.username,actorLabel:s.displayName,sessionLabel:s.label,createdAt:r.updatedAt});result={status:'ok',resource:r};}receipts.set(a.p_request_id,{resourceId:a.p_resource_id,state:a.p_state,expectedVersion:a.p_expected_version,result});return response(true,result); } if(name==='ops_list_accounts')return response(true,[...accounts.values()].map(({passwordHash,...x})=>({...x,hasPassword:!!passwordHash})));if(name==='ops_upsert_account'){let x=accounts.get(a.p_username);if(a.p_active&&!a.p_password_hash&&!x?.passwordHash)return response(false,{message:'active account requires password'},400);accounts.set(a.p_username,{username:a.p_username,role:a.p_role,displayLabel:a.p_display_label,passwordHash:a.p_password_hash||x?.passwordHash,active:a.p_active,credentialVersion:(x?.credentialVersion||0)+1});return response(true,{username:a.p_username,role:a.p_role,displayLabel:a.p_display_label,active:a.p_active,hasPassword:!!(a.p_password_hash||x?.passwordHash)});}if(name==='ops_public_resources')return response(true,resources);return response(false,{});}
async function call(action,opt={}){let headers={origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json',...opt.headers},req={method:opt.method||(action==='login'||action==='logout'?'POST':'GET'),url:`/api/admin/${action}`,headers,body:opt.body??{},...(opt.req||{})},out={},res={setHeader(k,v){out[k.toLowerCase()]=v;},end(v){this.body=JSON.parse(v);}};await handleAdmin(action,req,res,env,Date.now(),opt.fetcher||db);return {status:res.statusCode,body:res.body,headers:out};}
async function login(username='FIXTURE_ADMIN',pass=password,name='현장 운영'){let r=await call('login',{body:{username,password:pass,displayName:name}});return r;}
test('DB-backed login returns the exact role/session contract without secrets',async()=>{let r=await login();assert.equal(r.status,200);assert.deepEqual(Object.keys(r.body).sort(),['authenticated','capabilities','displayName','expiresAt','role','sessionId','username']);assert.equal(r.body.role,'superadmin');assert.ok(!JSON.stringify(r).includes(password));});
test('protected endpoints re-resolve sessions and logout revokes only current session',async()=>{let a=await login(),b=await login();let ca=a.headers['set-cookie'].split(';')[0],cb=b.headers['set-cookie'].split(';')[0];assert.equal((await call('logout',{headers:{cookie:ca},body:{}})).status,200);assert.equal((await call('session',{headers:{cookie:ca}})).status,401);assert.equal((await call('session',{headers:{cookie:cb}})).status,200);});
test('operations enforce CAS and return latest resource on conflict',async()=>{let l=await login(),cookie=l.headers['set-cookie'].split(';')[0],id='22222222-2222-4222-8222-222222222222';let ok=await call('operations',{method:'POST',headers:{cookie},body:{resourceId:'parking.songrim',state:'available',expectedVersion:0,requestId:id}});assert.equal(ok.status,200);let stale=await call('operations',{method:'POST',headers:{cookie},body:{resourceId:'parking.songrim',state:'busy',expectedVersion:0,requestId:'33333333-3333-4333-8333-333333333333'}});assert.equal(stale.status,409);assert.equal(stale.body.resource.version,1);});
test('team role cannot mutate another category',async()=>{accounts.set('WOORIPARK',{username:'WOORIPARK',role:'parking',displayLabel:'주차',passwordHash:env.ADMIN_PASSWORD_SCRYPT,active:true,credentialVersion:1,failed:0});let l=await login('WOORIPARK'),cookie=l.headers['set-cookie'].split(';')[0];let r=await call('operations',{method:'POST',headers:{cookie},body:{resourceId:'space.songrim.access',state:'school_open',expectedVersion:0,requestId:'44444444-4444-4444-8444-444444444444'}});assert.equal(r.status,403);});
test('public status fails closed on database failure and never returns fallback data',async()=>{let req={method:'GET',url:'/api/status',headers:{}},res={setHeader(){},end(v){this.body=JSON.parse(v);}};await handlePublicStatus(req,res,env,async()=>response(false,{},500));assert.equal(res.statusCode,503);assert.deepEqual(res.body,{enabled:false});});
test('invalid displayName, cross-site writes, and oversized request bodies are rejected',async()=>{assert.equal((await call('login',{body:{username:'FIXTURE_ADMIN',password,displayName:''}})).status,400);assert.equal((await call('login',{headers:{origin:'https://evil.example'},body:{username:'FIXTURE_ADMIN',password,displayName:'x'}})).status,403);assert.equal((await call('login',{headers:{'content-length':'5000'},body:{username:'FIXTURE_ADMIN',password,displayName:'x'}})).status,400);});

test('request replay is durable and cannot append a duplicate audit action',async()=>{let l=await login(),cookie=l.headers['set-cookie'].split(';')[0],r=resources.find(x=>x.id==='parking.songrim'),id='55555555-5555-4555-8555-555555555555',body={resourceId:r.id,state:r.state==='busy'?'available':'busy',expectedVersion:r.version,requestId:id},before=history.length;let one=await call('operations',{method:'POST',headers:{cookie},body}),two=await call('operations',{method:'POST',headers:{cookie},body});assert.equal(one.status,200);assert.deepEqual(two.body,one.body);assert.equal(history.length,before+1);let mismatch=await call('operations',{method:'POST',headers:{cookie},body:{...body,state:'full'}});assert.equal(mismatch.status,409);});
test('durable account attempt budget blocks the thirteenth request',async()=>{accounts.set('LIMITED',{username:'LIMITED',role:'parking',displayLabel:'주차',passwordHash:env.ADMIN_PASSWORD_SCRYPT,active:true,credentialVersion:1,failed:0});for(let i=0;i<12;i++)assert.equal((await login('LIMITED','wrong-password')).status,401);let blocked=await login('LIMITED');assert.equal(blocked.status,429);assert.equal(blocked.body.retryAfter,900);});

test('rejects bad origin, wrong methods, alternate paths, malformed bodies, and forged cookies', async () => {
  assert.equal((await call('login', { headers: { origin: 'https://attacker.example' }, body: { username: 'FIXTURE_ADMIN', password, displayName: 'x' } })).status, 403);
  assert.equal((await call('login', { req: { method: 'GET' }, body: {} })).status, 405);
  assert.equal((await call('login', { req: { url: '/api/admin/login/' }, body: {} })).status, 404);
  assert.equal((await call('login', { body: '{invalid' })).status, 400);
  assert.equal((await call('session', { headers: { cookie: `${COOKIE_NAME}=forged` } })).status, 401);
});
test('server refuses a known superadmin target before team upsert RPC', async () => {
  const loginResult = await login();
  const cookie = loginResult.headers['set-cookie'].split(';')[0];
  const result = await call('accounts', { method: 'POST', headers: { cookie }, body: { username: 'FIXTURE_ADMIN', role: 'parking', displayLabel: '변경 금지', active: false } });
  assert.equal(result.status, 403);
});
test('migration protects superadmin targets and stale credential completion', async () => {
  const migration = await (await import('node:fs/promises')).readFile(new URL('../../supabase/migrations/002_team_operations.sql', import.meta.url), 'utf8');
  assert.match(migration, /a\.role = 'superadmin'.+immutable here/s);
  assert.match(migration, /p_expected_credential_version is distinct from a\.credential_version/);
  assert.match(migration, /v_role is distinct from 'superadmin'/);
});

test('all authenticated identity responses expose the live-operations capability', async () => {
  const signedIn = await login();
  const cookie = signedIn.headers['set-cookie'].split(';')[0];
  for (const result of [signedIn, await call('session', { headers: { cookie } }), await call('dashboard', { headers: { cookie } })]) {
    assert.deepEqual(result.body.capabilities, { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false });
  }
});

test('003 reservation upgrade consumes once, refunds only its own current-window attempt, and serializes account locks', async () => {
  const migration = await (await import('node:fs/promises')).readFile(new URL('../../supabase/migrations/003_review_hardening.sql', import.meta.url), 'utf8');
  assert.match(migration, /ops_login_reservations/);
  assert.match(migration, /consumed_at=v_now/);
  assert.match(migration, /failed_attempts=failed_attempts-1/);
  assert.doesNotMatch(migration, /failed_attempts\s*=\s*0[^\n]*ops_finish_login/s);
  assert.match(migration, /reservation_row\.consumed_at is not null/);
  assert.match(migration, /failed_window_started_at = reservation_row\.window_started_at/);
  assert.match(migration, /ops-account:' \|\| coalesce\(p_username/);
  assert.match(migration, /v_first_key := least[\s\S]*v_second_key := greatest/);
});
