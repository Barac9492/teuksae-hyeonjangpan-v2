import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleStatus } from '../../api/status.js';
import { SESSION_SECONDS, handleAdmin } from '../admin-auth.js';
import { handleCommunity } from '../community.js';
import { isRehearsal, REHEARSAL_END } from '../runtime.js';
const origin='https://teuksae-hyeonjangpan-v2.vercel.app';
const env={REHEARSAL_ENABLED:'true',ADMIN_ALLOWED_ORIGIN:origin,SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const now=Date.parse('2026-09-29T12:00:00+09:00');
const id='11111111-1111-4111-8111-111111111111';
const ok=(value,status=200)=>({ok:status<300,status,json:async()=>value});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
function cookie(time=now){const p=Buffer.from(JSON.stringify({v:2,sid:id,sub:'ADMIN',cv:1,iat:Math.floor(time/1000),exp:Math.floor(time/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');return `__Host-woori_admin=${p}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(p).digest('base64url')}`;}
const session={id,username:'ADMIN',credentialVersion:1,role:'superadmin',displayName:'QA',label:'S-1111111111'};
const req=(url,method='GET',body,headers={})=>({url,method,body,headers:{origin,'content-type':'application/json','x-woori-mode':'rehearsal',...headers}});
const post={requestId:id,kind:'prayer',text:'QA rehearsal',eventDay:5,deleteToken:'a'.repeat(43),consent:true};

test('one dataset is used before and after the event even with the retired flag enabled',async()=>{
 for(const time of [now,REHEARSAL_END-1,REHEARSAL_END,REHEARSAL_END+1]){
  assert.equal(isRehearsal(env,time),false);
  const r=res();await handleStatus(req('/api/status?rehearsal=1'),r,env,async url=>{
   assert.ok(url.endsWith('/rpc/ops_public_resources'));return ok([]);
  },time);assert.equal(r.statusCode,200);assert.equal(r.body.rehearsal,false);
 }
});
test('submissions use the same RPC without a mode header or cutover conflict',async()=>{
 for(const time of [now,REHEARSAL_END]) {
  const r=res();await handleCommunity('public',req('/api/community','POST',post,{'x-woori-mode':undefined}),r,env,async(url,opts)=>{
   assert.ok(url.endsWith('/rpc/community_v2'));return ok(JSON.parse(opts.body).p_action==='preflight'?{status:'ok'}:{id,status:'pending',ready:true});
  },time);assert.equal(r.statusCode,200);
 }
});
test('retired reset cannot delete either dataset',async()=>{
 const r=res();await handleAdmin('rehearsal',req('/api/admin/rehearsal','POST',{confirmation:'리허설 초기화'},{cookie:cookie()}),r,env,now,async url=>{
  assert.ok(url.endsWith('/rpc/ops_get_session'));return ok(session);
 });assert.equal(r.statusCode,410);
});
test('moderation strips deleted tombstones while retaining pending items',async()=>{
 const r=res();await handleCommunity('admin',req('/api/admin/community','GET',undefined,{cookie:cookie()}),r,env,async(url)=>url.endsWith('ops_get_session')?ok(session):ok({items:[{id,status:'deleted'},{id:'pending',status:'pending'}]}),now);assert.equal(r.statusCode,200);assert.deepEqual(r.body.items,[{id:'pending',status:'pending'}]);
});
test('approved photo uses the operational private bucket throughout the event',async()=>{
 const urls=[];const r={...res(),end(v){this.body=v;}};
 await handleCommunity('photo',req(`/api/community/photo?id=${id}`),r,env,async(url)=>{
  urls.push(url);if(url.includes('/rpc/'))return ok({path:id+'.png'});
  if(url.includes('/rest/'))return ok([{created_at:'2026-09-29T03:00:00Z'}]);
  return {ok:true,arrayBuffer:async()=>new Uint8Array([137,80,78,71])};
 },now);assert.equal(r.statusCode,200);assert.ok(urls.some(u=>u.includes('/object/authenticated/community-photos-v2/')));assert.ok(urls.filter(u=>u.includes('/rest/')).every(u=>!u.includes('rehearsal_')));
});
test('orphan cleanup continues both isolated namespaces after event cutover',async()=>{
 const urls=[];const r=res();await handleCommunity('cleanup',req('/api/community/cleanup','GET',undefined,{authorization:'Bearer fixture'}),r,{...env,CRON_SECRET:'fixture'},async(url)=>{urls.push(url);return ok({items:[]});},REHEARSAL_END);
 assert.equal(r.statusCode,200);assert.deepEqual(urls.map(u=>u.split('/').pop()),['community_v2','rehearsal_community_v2']);
});
