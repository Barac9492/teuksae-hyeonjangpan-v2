import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { handleCommunity, sanitizePng } from '../community.js';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const origin='https://teuksae-hyeonjangpan-v2.vercel.app';
const id='11111111-1111-4111-8111-111111111111';
const submit={requestId:id,kind:'prayer',text:'기도',eventDay:null,consent:true,deleteToken:'a'.repeat(43)};
function response(data,status=200){return {ok:status<300,status,json:async()=>data};}
async function run(route='public',method='GET',body,fetcher=async(_url,opts)=>{if(JSON.parse(opts.body).p_action==='preflight')return response({status:'ok'});throw Error('unexpected fetch');},headers={}) { const req={url:route==='admin'?'/api/admin/community':route==='photo'?`/api/community/photo?id=${id}`:'/api/community?kind=prayer',method,headers:{origin,'content-type':'application/json',...headers},body};const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};await handleCommunity(route,req,res,env,fetcher);return res; }
test('origin does not trust Host or v1 ADMIN origin',async()=>{for(const hostile of ['https://evil.test','https://teuksae-hyeonjangpan.vercel.app',undefined]){const r=await run('public','POST',submit,undefined,{origin:hostile,host:'evil.test'});assert.equal(r.statusCode,403);}});
test('moderation and pending-photo access require valid session',async()=>{assert.equal((await run('admin')).statusCode,401); const r=await run('photo','GET',undefined,async(url,opts)=>{assert.equal(JSON.parse(opts.body).p_args.session,null);return response({status:'missing'});});assert.equal(r.statusCode,404);});
test('prayer validation, consent, token and event day reject before database',async()=>{for(const patch of [{consent:false},{text:'x'.repeat(601)},{deleteToken:'bad'},{eventDay:6},{imageBase64:'AA=='},{requestId:'x'}])assert.equal((await run('public','POST',{...submit,...patch})).statusCode,400);});
test('PNG decoder rejects garbage, inflated IHDR and corrupt CRC, emits clean PNG',()=>{assert.throws(()=>sanitizePng(Buffer.from('fake png').toString('base64')));const image=PNG.sync.write({width:1,height:1,data:Buffer.from([1,2,3,255])});const clean=sanitizePng(image.toString('base64'));assert.equal(PNG.sync.read(clean).width,1);const bomb=Buffer.from(image);bomb.writeUInt32BE(9000,16);assert.throws(()=>sanitizePng(bomb.toString('base64')));const corrupt=Buffer.from(image);corrupt[29]^=1;assert.throws(()=>sanitizePng(corrupt.toString('base64')));});
test('raw token and IP never enter RPC; retries preserve payload hash; mismatch is 409',async()=>{const calls=[];const fetcher=async(url,opts)=>{calls.push(JSON.parse(opts.body));return response({id,status:'pending',ready:true,photoCountToday:2,today:'2026-10-05'});};for(let i=0;i<2;i++)assert.equal((await run('public','POST',submit,fetcher)).statusCode,200);assert.deepEqual(calls[0],calls[2]);assert.deepEqual(calls[1],calls[3]);assert.equal(JSON.stringify(calls).includes(submit.deleteToken),false);assert.match(calls[1].p_args.tokenHash,/^[a-f0-9]{64}$/);assert.equal((await run('public','POST',submit,async()=>response({status:'payload_mismatch'}))).statusCode,409);});
test('database errors never fabricate count zero',async()=>{const r=await run('public','GET',undefined,async()=>response({},500));assert.equal(r.statusCode,503);assert.equal('photoCountToday' in JSON.parse(r.body),false);});
test('delete removes storage and exposes only receipt and count; failure is retryable',async()=>{const calls=[];const fetcher=async(url,opts)=>{calls.push({url,opts});return response(url.includes('/rpc/')?{id,status:'deleted',photoCountToday:1,today:'2026-10-05',cleanupPath:`${id}.png`}:{});};const r=await run('public','POST',{action:'delete',id,deleteToken:submit.deleteToken},fetcher);assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).photoCountToday,1);assert.equal('cleanupPath' in JSON.parse(r.body),false);assert.equal(calls[1].opts.method,'DELETE');const failed=await run('public','POST',{action:'delete',id,deleteToken:submit.deleteToken},async(url)=>url.includes('/rpc/')?response({cleanupPath:`${id}.png`}):response({},503));assert.equal(failed.statusCode,503);});
test('private proxy rechecks visibility and uses no-store/nosniff',async()=>{let checks=0;const r=await run('photo','GET',undefined,async(url)=>url.includes('/rpc/')?(checks++,response({path:`${id}.png`})):{ok:true,arrayBuffer:async()=>new Uint8Array([1,2])});assert.equal(checks,2);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.headers['X-Content-Type-Options'],'nosniff');});
test('SQL security, count, moderation and retention invariants (static)',async()=>{const sql=await readFile(new URL('../../supabase/migrations/005_community.sql',import.meta.url),'utf8');assert.match(sql,/revoke all on function public.community_v2\(text,jsonb\) from public,anon,authenticated/);assert.match(sql,/grant execute .* to service_role/);assert.match(sql,/coalesce\(v_session->>'role'='superadmin',false\)/);assert.match(sql,/status in \('pending','approved'\) and created_at/);assert.match(sql,/2026-11-10/);assert.match(sql,/text='',event_day=null,ready=false/);assert.match(sql,/ops_get_session/);});

test('approved photos ignore ordinary and expired cookies',async()=>{
 for(const cookie of ['analytics=ordinary','__Host-woori_admin=expired.invalid']) {
  let lookups=0;
  const r=await run('photo','GET',undefined,async(url,opts)=>{
   if(url.includes('/rpc/')) { assert.equal(JSON.parse(opts.body).p_args.session,null);lookups++;return response({path:id+'.png'}); }
   return {ok:true,arrayBuffer:async()=>new Uint8Array([1])};
  },{cookie});
  assert.equal(r.statusCode,200);assert.equal(lookups,2);
 }
});
test('processing quota rejects BEFORE decoding malformed PNG and charges accepted retries',async()=>{
 let calls=0;
 const r=await run('public','POST',{...submit,kind:'photo',imageBase64:'INVALID'},async(_url,opts)=>{
  calls++;assert.equal(JSON.parse(opts.body).p_action,'preflight');return response({status:'limited'});
 });
 assert.equal(r.statusCode,429);assert.equal(calls,1);
 const invalid=await run('public','POST',{...submit,kind:'photo',imageBase64:'INVALID'},async(_url,opts)=>{assert.equal(JSON.parse(opts.body).p_action,'preflight');return response({status:'ok'});});
 assert.equal(invalid.statusCode,400);
});
test('terminal status retries orphan cleanup',async()=>{
 let removed=false;
 const r=await run('public','POST',{action:'status',id,deleteToken:submit.deleteToken},async(url)=>{
  if(url.includes('/rpc/'))return response({id,status:'rejected',cleanupPath:id+'.png',photoCountToday:0,today:'2026-10-05'});
  removed=true;return response({});
 });assert.equal(r.statusCode,200);assert.equal(removed,true);assert.equal('cleanupPath' in JSON.parse(r.body),false);
});
async function cron(secret,authorization,fetcher) {
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
 await handleCommunity('cleanup',{url:'/api/community/cleanup',method:'GET',headers:{authorization}},res,{...env,CRON_SECRET:secret},fetcher);
 return res;
}
test('cleanup rejects absent configuration, missing or wrong bearer without RPC',async()=>{
 const never=async()=>{throw Error('unexpected');};
 assert.equal((await cron(undefined,undefined,never)).statusCode,503);
 assert.equal((await cron('secret',undefined,never)).statusCode,401);
 assert.equal((await cron('secret','Bearer wrong',never)).statusCode,401);
});
test('cleanup records success only after storage deletion and reports failed batch',async()=>{
 const calls=[];const r=await cron('secret','Bearer secret',async(url,opts)=>{
  if(url.includes('/rpc/')) {const args=JSON.parse(opts.body);calls.push(args.p_action);return response(args.p_action==='cleanupCandidates'?{items:[{id,path:id+'.png'}]}:{status:'ok'});}
  calls.push('storage');return response({});
 });assert.equal(r.statusCode,200);assert.deepEqual(JSON.parse(r.body),{cleaned:1,failed:0});assert.deepEqual(calls,['cleanupCandidates','storage','cleanupComplete']);
 const failure=await cron('secret','Bearer secret',async(url)=>response(url.includes('/rpc/')?{items:[{id,path:id+'.png'}]}:{},url.includes('/rpc/')?200:500));assert.equal(failure.statusCode,503);assert.deepEqual(JSON.parse(failure.body),{cleaned:0,failed:1});
});
test('SQL auth locks precede revalidation; rejected deletion and recurring cleanup are allowed',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/005_community.sql',import.meta.url),'utf8');
 assert.ok(sql.indexOf('for update of s,a')<sql.indexOf('select public.ops_get_session'));
 assert.match(sql,/r.status='rejected' and p_args->>'decision'<>'deleted'/);
 assert.match(sql,/set ready=true,created_at=now\(\)/);
 assert.match(sql,/last_cleanup_at asc nulls first/);
 assert.match(sql,/v_hits>240/);
});
