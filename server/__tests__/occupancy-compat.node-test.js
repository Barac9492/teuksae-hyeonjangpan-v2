import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleAdmin, COOKIE_NAME, SESSION_SECONDS } from '../admin-auth.js';
async function attempt(percent, failure, fallbackFailure=false) {
 const secret='x'.repeat(64),now=Date.now(),sid='11111111-1111-4111-8111-111111111111';
 const encoded=Buffer.from(JSON.stringify({v:2,sid,sub:'TEST',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
 const cookie=`${COOKIE_NAME}=${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`;
 const env={ADMIN_SESSION_SECRET:secret,ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'.repeat(40)};
 const calls=[];
 const fetcher=async(url,init)=>{
  if(url.endsWith('ops_get_session'))return {ok:true,json:async()=>({username:'TEST',credentialVersion:1,role:'parking'})};
  calls.push(JSON.parse(init.body));
  if(calls.length===1 || fallbackFailure){if(failure instanceof Error)throw failure;return {ok:false,status:failure.status,json:async()=>failure.body};}
  return {ok:true,json:async()=>({resource:{id:'parking.songrim',state:'busy'}})};
 };
 const res={setHeader(){},end(value){this.body=JSON.parse(value);}};
 await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:'parking.songrim',state:'busy',occupancyPercent:percent,expectedVersion:7,requestId:'22222222-2222-4222-8222-222222222222'}},res,env,now,fetcher);
 return {res,calls};
}
const missing={status:404,body:{code:'PGRST202'}};
test('only missing signature plus null/omitted estimate falls back with identical five arguments',async()=>{
 for(const percent of [null,undefined]){
  const {res,calls}=await attempt(percent,missing);assert.equal(res.statusCode,200);assert.equal(calls.length,2);
  const {p_occupancy_percent,...args}=calls[0];assert.equal(p_occupancy_percent,null);assert.deepEqual(calls[1],args);assert.equal(Object.keys(calls[1]).length,5);
 }
});
test('missing signature never silently drops explicit estimates including zero',async()=>{
 for(const percent of [0,50,100]){const {res,calls}=await attempt(percent,missing);assert.equal(res.statusCode,503);assert.equal(calls.length,1);assert.equal(calls[0].p_occupancy_percent,percent);}
});
test('timeouts, transport failures, other errors and wrong HTTP status never retry',async()=>{
 for(const failure of [new Error('timeout'),new Error('network'),{status:500,body:{code:'PGRST202'}},{status:404,body:{code:'PGRST203'}},{status:404,body:{}},{status:403,body:{code:'42501'}},{status:503,body:{}}]){
  const {res,calls}=await attempt(null,failure);assert.equal(res.statusCode,failure.status===403?403:503);assert.equal(calls.length,1);
 }
});
test('failure of legacy fallback does not attempt a third write',async()=>{
 const {res,calls}=await attempt(null,missing,true);assert.equal(res.statusCode,503);assert.equal(calls.length,2);
});
