import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleCommunity } from '../community.js';
import { SESSION_SECONDS } from '../admin-auth.js';

const env = {SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const origin = 'https://teuksae-hyeonjangpan-v2.vercel.app';
const id = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-10-05T12:00:00+09:00');
const session = {username:'ADMIN',credentialVersion:3,role:'superadmin'};
const cursor = {v:1,status:'approved',priority:1,createdAt:'2026-10-01T01:02:03.123456+00:00',id};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function cookie() {
  const payload = encode({v:2,sid:id,sub:'ADMIN',cv:3,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)});
  return `__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
}
async function run(query='', data={items:[],nextCursor:null}, auth=session, signed=true) {
  const calls=[];
  const req={url:`/api/admin/community${query}`,method:'GET',headers:{origin,...signed?{cookie:cookie()}:{}}};
  const res={setHeader(){},end(text){this.body=JSON.parse(text);}};
  await handleCommunity('admin',req,res,env,async(url,opts)=>{
    calls.push({url,...JSON.parse(opts.body)});
    return {ok:true,json:async()=>url.endsWith('/ops_get_session')?auth:data};
  },now);
  return {...res,calls};
}

test('legacy admin GET defaults to all, preserves data, and returns a null final cursor',async()=>{
  const item={id,status:'approved'};
  const result=await run('',{items:[item],enabled:true,photoCountToday:7});
  assert.equal(result.statusCode,200);
  assert.deepEqual(result.calls[1].p_args,{session:id,status:'all'});
  assert.deepEqual(result.body,{items:[item],enabled:true,photoCountToday:7,nextCursor:null});
});

test('admin status filter and opaque cursor round-trip exact microsecond precision',async()=>{
  const first=await run('?status=approved',{items:[{id,status:'approved'}],nextCursor:cursor});
  assert.equal(first.statusCode,200);
  assert.equal(first.body.nextCursor,encode(cursor));
  const second=await run(`?status=approved&cursor=${first.body.nextCursor}`);
  assert.equal(second.statusCode,200);
  assert.deepEqual(second.calls[1].p_args,{session:id,status:'approved',cursor});
  assert.equal(second.body.nextCursor,null);
});

test('invalid, duplicate, oversized and filter-mismatched cursors fail before listing RPC',async()=>{
  const queries=[
    '?status=deleted','?status=','?status=all&status=approved','?cursor=',
    '?cursor=a&cursor=b','?cursor=not!base64','?cursor='+ 'a'.repeat(1025),
    '?cursor='+encode(null),'?cursor='+encode([]),'?cursor='+encode('bad'),
    '?cursor='+encode({...cursor,status:'all',v:2}),
    '?cursor='+encode({...cursor,status:'all',id:'bad'}),
    '?cursor='+encode({...cursor,status:'all',id:[id]}),
    '?cursor='+encode({...cursor,status:'all',extra:'unexpected'}),
    '?cursor='+encode({...cursor,status:'all',priority:2}),
    '?cursor='+encode({...cursor,status:'all',createdAt:'2026-10-01'}),
    '?cursor='+encode({...cursor,status:'all',createdAt:'2026-99-99T01:02:03Z'}),
    '?cursor='+encode(cursor),
    '?status=pending&cursor='+encode({...cursor,status:'pending'}),
    '?status=approved&cursor='+encode(cursor)+'=',
  ];
  for (const query of queries) {
    const result=await run(query);
    assert.equal(result.statusCode,400,query);
    assert.equal(result.calls.length,1,query);
  }
});

test('admin pagination still requires a valid current superadmin session',async()=>{
  assert.equal((await run('?status=approved',undefined,session,false)).statusCode,401);
  for (const auth of [{...session,role:'parking'},{...session,role:'space'},{...session,credentialVersion:4},{...session,username:'OTHER'}]) {
    const result=await run('?status=approved',undefined,auth);
    assert.equal(result.statusCode,403);
    assert.equal(result.calls.length,1);
  }
});

test('new filtered/cursor requests fail closed against an unmigrated RPC',async()=>{
  assert.equal((await run('?status=approved',{items:[]})).statusCode,503);
  assert.equal((await run('?status=approved&cursor='+encode(cursor),{items:[]})).statusCode,503);
  assert.equal((await run('?cursor='+encode({...cursor,status:'all'}),{items:[]})).statusCode,503);
});

test('admin list fails closed for oversized pages and malformed database cursors',async()=>{
  for (const data of [{items:{}},{items:Array.from({length:101},()=>({id,status:'approved'}))},{items:[],nextCursor:cursor},{items:[],nextCursor:'opaque-from-wrong-contract'}]) {
    assert.equal((await run('',data)).statusCode,503);
  }
  const result=await run('',{items:[{id,status:'deleted'},{id:'active',status:'pending'}],nextCursor:null});
  assert.deepEqual(result.body.items,[{id:'active',status:'pending'}]);
});

test('kind is enforced before pagination and bound to its opaque cursor',async()=>{
 const bound={...cursor,kind:'photo'};
 const first=await run('?kind=photo&status=approved',{kind:'photo',items:[],nextCursor:bound,trashSupported:true});
 assert.equal(first.statusCode,200);assert.equal(first.body.nextCursor,encode(bound));
 const next=await run('?kind=photo&status=approved&cursor='+encode(bound),{kind:'photo',items:[],nextCursor:null});
 assert.equal(next.statusCode,200);assert.deepEqual(next.calls[1].p_args,{session:id,status:'approved',kind:'photo',cursor:bound});
 for(const query of ['?kind=prayer&status=approved&cursor='+encode(bound),'?kind=unknown','?kind=photo&kind=prayer'])assert.equal((await run(query)).statusCode,400);
});
test('kind/trash features fail closed until the actual supporting migration exists',async()=>{
 assert.equal((await run('?kind=photo',{items:[],nextCursor:null})).statusCode,503);
 assert.equal((await run('?kind=photo',{kind:'prayer',items:[],nextCursor:null})).statusCode,503);
 assert.equal((await run('?status=trashed',{items:[],nextCursor:null})).statusCode,503);
 assert.equal((await run('?status=trashed',{items:[],nextCursor:null,trashSupported:true})).statusCode,200);
 assert.equal((await run('?kind=photo',{kind:'photo',items:Array(21).fill({id}),nextCursor:null})).statusCode,503);
});
test('trash and restore use the same origin/session/version boundary and never clean storage',async()=>{
 for(const decision of ['trashed','restored']){
  const calls=[],req={url:'/api/admin/community',method:'POST',headers:{origin,cookie:cookie(),'content-type':'application/json'},body:{id,decision,expectedVersion:7}};
  const res={setHeader(){},end(text){this.body=JSON.parse(text);}};
  await handleCommunity('admin',req,res,env,async(url,opts)=>{calls.push(url);const b=JSON.parse(opts.body);if(url.endsWith('/ops_get_session'))return {ok:true,json:async()=>session};assert.deepEqual(b.p_args,{id,decision,expectedVersion:7,session:id});return {ok:true,json:async()=>({id,status:decision==='restored'?'pending':'trashed',version:8})};},now);
  assert.equal(res.statusCode,200);assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('/storage/')));
 }
});
