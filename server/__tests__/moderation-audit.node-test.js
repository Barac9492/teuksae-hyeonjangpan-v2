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
function cookie() {
  const payload = Buffer.from(JSON.stringify({v:2,sid:id,sub:'ADMIN',cv:3,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
  return `__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
}
// communityResponse: {status, body} returned for the community_v2 RPC.
async function run(query, communityResponse) {
  const calls=[];
  const req={url:`/api/admin/community${query}`,method:'GET',headers:{origin,cookie:cookie()}};
  const res={setHeader(){},end(text){this.body=JSON.parse(text);}};
  await handleCommunity('admin',req,res,env,async(url,opts)=>{
    calls.push({url,...JSON.parse(opts.body)});
    if (url.endsWith('/ops_get_session')) return {ok:true,status:200,json:async()=>session};
    return {ok:communityResponse.status===200,status:communityResponse.status,json:async()=>communityResponse.body};
  },now);
  return {...res,calls};
}
const entry = {id:1,itemId:id,decision:'approved',actor:'WOORI7',sessionLabel:'S-AAAAAAAAAA',displayName:'김집사',createdAt:'2026-10-04T05:00:28Z'};

test('audit view calls auditList with the signed session only and returns items',async()=>{
  const r=await run('?view=audit',{status:200,body:{attribution:true,items:[entry]}});
  assert.equal(r.statusCode,200);
  assert.deepEqual(r.body,{items:[entry]});
  const rpc=r.calls.find(c=>c.url.endsWith('/community_v2'));
  assert.deepEqual(rpc,{url:'https://test.supabase.co/rest/v1/rpc/community_v2',p_action:'auditList',p_args:{session:id}});
});

test('pre-migration database (unknown action error) maps to a 503 update-needed message',async()=>{
  const r=await run('?view=audit',{status:400,body:{code:'P0001',message:'invalid action'}});
  assert.equal(r.statusCode,503);
  assert.equal(r.body.error,'승인 기록 DB 업데이트가 필요합니다.');
});

test('database authorization failure passes through as 403',async()=>{
  const r=await run('?view=audit',{status:403,body:{code:'42501'}});
  assert.equal(r.statusCode,403);
});

test('responses without the attribution marker or with too many rows are rejected',async()=>{
  assert.equal((await run('?view=audit',{status:200,body:{items:[entry]}})).statusCode,503);
  assert.equal((await run('?view=audit',{status:200,body:{attribution:true,items:Array(101).fill(entry)}})).statusCode,503);
});

test('invalid audit queries never reach the database',async()=>{
  for (const q of ['?view=other','?view=audit&status=all','?view=audit&view=audit','?view=']) {
    const r=await run(q,{status:200,body:{attribution:true,items:[]}});
    assert.equal(r.statusCode,400,q);
    assert.equal(r.calls.some(c=>c.url.endsWith('/community_v2')),false,q);
  }
});

test('existing adminList GET is unaffected when view is absent',async()=>{
  const r=await run('',{status:200,body:{items:[],nextCursor:null}});
  assert.equal(r.statusCode,200);
  assert.equal(r.calls.find(c=>c.url.endsWith('/community_v2')).p_action,'adminList');
});
