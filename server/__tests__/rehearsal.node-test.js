import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleStatus } from '../../api/status.js';
import { handleAdmin } from '../admin-auth.js';
import { handleCommunity } from '../community.js';
import { isRehearsal, REHEARSAL_END } from '../runtime.js';
const origin='https://teuksae-hyeonjangpan-v2.vercel.app';
const env={REHEARSAL_ENABLED:'true',ADMIN_ALLOWED_ORIGIN:origin,SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const now=Date.parse('2026-09-29T12:00:00+09:00');
const id='11111111-1111-4111-8111-111111111111';
const ok=(value,status=200)=>({ok:status<300,status,json:async()=>value});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
function cookie(time=now){const p=Buffer.from(JSON.stringify({v:2,sid:id,sub:'ADMIN',cv:1,iat:Math.floor(time/1000),exp:Math.floor(time/1000)+7200,nonce:'n'.repeat(32)})).toString('base64url');return `__Host-woori_admin=${p}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(p).digest('base64url')}`;}
const session={id,username:'ADMIN',credentialVersion:1,role:'superadmin',displayName:'QA',label:'S-1111111111'};
const req=(url,method='GET',body,headers={})=>({url,method,body,headers:{origin,'content-type':'application/json','x-woori-mode':'rehearsal',...headers}});
const post={requestId:id,kind:'prayer',text:'QA rehearsal',eventDay:5,deleteToken:'a'.repeat(43),consent:true};

test('rehearsal requires explicit server flag and stops exactly at Korea midnight',()=>{
 assert.equal(isRehearsal({},now),false);assert.equal(isRehearsal({...env,REHEARSAL_ENABLED:'false'},now),false);
 assert.equal(isRehearsal(env,REHEARSAL_END-1),true);assert.equal(isRehearsal(env,REHEARSAL_END),false);assert.equal(isRehearsal(env,NaN),false);
});
test('status uses only rehearsal namespace before cutoff and live namespace with original filters after',async()=>{
 for(const [time,scope] of [[now,true],[REHEARSAL_END,false]]){
  const r=res();await handleStatus(req('/api/status?rehearsal=1'),r,env,async url=>{
   assert.ok(url.endsWith(`/rpc/${scope?'rehearsal_':''}ops_public_resources`));
   return ok([{id:'parking.songrim',state:'full',updatedAt:'2026-09-29T03:00:00Z',occupancyPercent:100}]);
  },time);
  assert.equal(r.statusCode,200);assert.equal(r.body.rehearsal,scope);assert.equal(r.body.resources[0].state,'full');assert.match(r.headers['Cache-Control'],/no-store/);
 }
});
test('community rehearsal list and count are real isolated data, not date-filtered examples',async()=>{
 const r=res();await handleCommunity('public',req('/api/community?kind=prayer'),r,env,async(url,opts)=>{
  assert.ok(url.endsWith('/rpc/rehearsal_community_v2'));assert.equal(JSON.parse(opts.body).p_action,'list');
  return ok({enabled:true,items:[{id,kind:'prayer',text:'QA',createdAt:'2026-09-29T03:00:00Z'}],photoCountToday:2,today:'2026-09-29'});
 },now);assert.equal(r.statusCode,200);assert.equal(r.body.items.length,1);assert.equal(r.body.photoCountToday,2);
});
test('rehearsal submissions hit isolated RPC; stale or unmarked client cannot cross cutoff',async()=>{
 const calls=[];const db=async(url,opts)=>{calls.push(url);const a=JSON.parse(opts.body).p_action;return ok(a==='preflight'?{status:'ok'}:{id,status:'pending',ready:true});};
 const r=res();await handleCommunity('public',req('/api/community','POST',post),r,env,db,now);assert.equal(r.statusCode,200);assert.equal(calls.length,2);assert.ok(calls.every(u=>u.endsWith('/rehearsal_community_v2')));
 for(const [time,mode] of [[REHEARSAL_END,'rehearsal'],[now,'live'],[now,undefined]]){const blocked=res();await handleCommunity('public',req('/api/community','POST',post,{'x-woori-mode':mode}),blocked,env,()=>{throw Error('must not query');},time);assert.equal(blocked.statusCode,409);}
 const liveOpen=res();await handleCommunity('public',req('/api/community','POST',post),liveOpen,{...env,REHEARSAL_ENABLED:'false'},async(url,opts)=>{assert.ok(url.endsWith('/rpc/community_v2'));return ok(JSON.parse(opts.body).p_action==='preflight'?{status:'ok'}:{id,status:'pending',ready:true});},now);assert.equal(liveOpen.statusCode,200);
});
test('reset is authenticated superadmin only, requires typed confirmation, and cannot reset live namespace',async()=>{
 for(const [role,time,confirmation,status] of [['superadmin',now,'리허설 초기화',200],['parking',now,'리허설 초기화',403],['superadmin',now,'',400],['superadmin',REHEARSAL_END,'리허설 초기화',403]]){
  let resetCalls=0;const r=res();await handleAdmin('rehearsal',req('/api/admin/rehearsal','POST',{confirmation},{cookie:cookie(time)}),r,env,time,async(url)=>{
   if(url.endsWith('ops_get_session')) return ok({...session,role});
   assert.ok(url.endsWith('/rehearsal_ops_reset_rehearsal'));resetCalls++;return ok({reset:true});
  });assert.equal(r.statusCode,status);assert.equal(resetCalls,status===200?1:0);
 }
 const r=res();await handleAdmin('rehearsal',req('/api/admin/rehearsal','POST',{confirmation:'리허설 초기화'}),r,env,now,()=>{throw Error('must not query');});assert.equal(r.statusCode,401);
});
test('moderation strips deleted tombstones while retaining pending items',async()=>{
 const r=res();await handleCommunity('admin',req('/api/admin/community','GET',undefined,{cookie:cookie()}),r,env,async(url)=>url.endsWith('ops_get_session')?ok(session):ok({items:[{id,status:'deleted'},{id:'pending',status:'pending'}]}),now);assert.equal(r.statusCode,200);assert.deepEqual(r.body.items,[{id:'pending',status:'pending'}]);
});
test('approved rehearsal photo reads only rehearsal private bucket, never live storage',async()=>{
 const urls=[];const r={...res(),end(v){this.body=v;}};
 await handleCommunity('photo',req(`/api/community/photo?id=${id}`),r,env,async(url)=>{
  urls.push(url);if(url.includes('/rpc/'))return ok({path:id+'.png'});
  if(url.includes('/rest/'))return ok([{created_at:'2026-09-29T03:00:00Z'}]);
  return {ok:true,arrayBuffer:async()=>new Uint8Array([137,80,78,71])};
 },now);assert.equal(r.statusCode,200);assert.ok(urls.some(u=>u.includes('/object/authenticated/rehearsal-community-photos-v2/')));assert.ok(urls.filter(u=>u.includes('/rest/')).every(u=>u.includes('rehearsal_')));
});
test('orphan cleanup continues both isolated namespaces after event cutover',async()=>{
 const urls=[];const r=res();await handleCommunity('cleanup',req('/api/community/cleanup','GET',undefined,{authorization:'Bearer fixture'}),r,{...env,CRON_SECRET:'fixture'},async(url)=>{urls.push(url);return ok({items:[]});},REHEARSAL_END);
 assert.equal(r.statusCode,200);assert.deepEqual(urls.map(u=>u.split('/').pop()),['community_v2','rehearsal_community_v2']);
});
