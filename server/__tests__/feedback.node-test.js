import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleAdmin, COOKIE_NAME, SESSION_SECONDS } from '../admin-auth.js';
import { handleCommunity } from '../community.js';
const secret='x'.repeat(64),now=Date.now(),sid='11111111-1111-4111-8111-111111111111';
const encoded=Buffer.from(JSON.stringify({v:2,sid,sub:'TEST',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
const cookie=`${COOKIE_NAME}=${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`;
const env={ADMIN_SESSION_SECRET:secret,ADMIN_ALLOWED_ORIGIN:'https://fixture.example',COMMUNITY_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'.repeat(40)};
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}});
test('Dream API requires an explicit floor only for available guidance and never retries without it',async()=>{
 for(const [state,guideFloor,occupancyPercent,expected] of [['available',1,null,200],['available',5,null,200],['full',null,null,200],['closed',null,null,200],['checking',null,null,200],['available',null,null,400],['available',6,null,400],['available','2',null,400],['full',2,null,400],['available',2,70,400],['busy',null,null,400]]) {
  let mutation=null;const reply=res();
  const fetcher=async(url,init)=>({ok:true,json:async()=>url.endsWith('ops_get_session')?{username:'TEST',credentialVersion:1,role:'parking'}:(mutation=JSON.parse(init.body),{resource:{id:'parking.dream'}})});
  await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:'parking.dream',state,guideFloor,occupancyPercent,expectedVersion:0,requestId:sid}},reply,env,now,fetcher);
  assert.equal(reply.statusCode,expected);if(expected===200)assert.equal(mutation.p_guide_floor,guideFloor);else assert.equal(mutation,null);
 }
 let writes=0;const reply=res();
 await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:'parking.dream',state:'available',guideFloor:2,expectedVersion:0,requestId:sid}},reply,env,now,async url=>url.endsWith('ops_get_session')?{ok:true,json:async()=>({username:'TEST',credentialVersion:1,role:'parking'})}:(writes++,{ok:false,status:404,json:async()=>({code:'PGRST202'})}));
 assert.equal(reply.statusCode,503);assert.equal(writes,1);
});
test('paginated feed passes validated cursor to approved-only RPC and preserves no-store',async()=>{
 const reply=res();let args;
 await handleCommunity('public',{method:'GET',url:`/api/community?kind=photo&page=1&beforeAt=2026-10-03T01%3A00%3A00Z&beforeId=${sid}`,headers:{}},reply,env,async(url,init)=>{assert.ok(url.endsWith('/rpc/community_public_page'));args=JSON.parse(init.body);return {ok:true,json:async()=>({enabled:true,items:[],photoCountToday:0,today:'2026-10-03',nextCursor:null})};});
 assert.equal(reply.statusCode,200);assert.deepEqual(args,{p_kind:'photo',p_before_at:'2026-10-03T01:00:00Z',p_before_id:sid});assert.match(reply.headers['Cache-Control'],/no-store/);
 for(const query of ['beforeAt=bad','beforeId=bad',`beforeAt=bad&beforeId=${sid}`,`beforeAt=2026-10-03T01:00:00Z&beforeId=bad`]) {
  const rejected=res();let calls=0;await handleCommunity('public',{method:'GET',url:'/api/community?kind=prayer&page=1&'+query,headers:{}},rejected,env,async()=>{calls++;throw Error('unexpected');});assert.equal(rejected.statusCode,400);assert.equal(calls,0);
 }
});

test('new Dream and sanctuary 4F percentages use all canonical steps and fail closed against an older RPC',async()=>{
 for(const resourceId of ['parking.dream','space.songrim.f4'])for(let percent=0;percent<=100;percent+=10){
  const state=percent===100?'full':percent>=70?'busy':'available';let mutation;
  const reply=res();await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId,state,occupancyPercent:percent,expectedVersion:0,requestId:sid}},reply,env,now,async(url,init)=>({ok:true,json:async()=>url.endsWith('ops_get_session')?{username:'TEST',credentialVersion:1,role:'superadmin'}:(mutation=JSON.parse(init.body),{resource:{id:resourceId}})}));
  assert.equal(reply.statusCode,200);assert.equal(mutation.p_occupancy_percent,percent);if(resourceId==='parking.dream')assert.equal(mutation.p_guide_floor,null);
 }
 let writes=0;const reply=res();
 await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:'parking.dream',state:'busy',occupancyPercent:70,expectedVersion:0,requestId:sid}},reply,env,now,async url=>url.endsWith('ops_get_session')?{ok:true,json:async()=>({username:'TEST',credentialVersion:1,role:'parking'})}:(writes++,{ok:false,status:404,json:async()=>({code:'PGRST202'})}));
 assert.equal(reply.statusCode,503);assert.equal(writes,1,'never retries by dropping the manual estimate');
});
