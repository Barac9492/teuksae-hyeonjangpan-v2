import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPublicStatus, handleStatus } from '../../api/status.js';
import { filterPublicCommunity, handleCommunity } from '../community.js';

const env={ADMIN_SESSION_SECRET:'s'.repeat(64),ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40)};
function response(data,status=200){return {ok:status<300,status,json:async()=>data};}

// Fixed reference instants (all KST), used instead of Date.now() so these assertions are deterministic.
// All-date rehearsal availability: none of these instants gate visibility any more. They are kept
// only as varied "now" fixtures spanning before/during/after the official Oct5-10 event window, to
// prove the calendar itself no longer changes behavior.
const BEFORE_NOW = Date.parse('2026-09-29T10:00:00+09:00'); // before the official event window
const DURING_NOW = Date.parse('2026-10-05T02:00:00+09:00'); // during the official event window
const AFTER_NOW = Date.parse('2026-11-01T00:00:00+09:00'); // well after the official event window

const rehearsal={
  id:'parking.songrim',label:'송림본당 주차',category:'parking',state:'full',version:9,
  updatedAt:'2026-09-28T03:00:00Z',occupancyPercent:100,
  lastClosedAt:'2026-09-27T22:00:00Z',lastFullAt:'2026-09-27T21:00:00Z',
  previousDay:{date:'2026-09-27',firstFullAt:'2026-09-27T21:00:00Z',closedAt:'2026-09-27T22:00:00Z'},
};
const live={
  id:'parking.calvary',label:'갈보리교회 주차',category:'parking',state:'busy',version:4,
  updatedAt:'2026-10-05T01:00:00+09:00',occupancyPercent:80,
  lastClosedAt:'2026-09-28T00:00:00Z',lastFullAt:'2026-10-05T00:30:00+09:00',
  previousDay:{date:'2026-10-05',firstFullAt:'2026-10-05T00:20:00+09:00',closedAt:'2026-10-11T00:00:00+09:00'},
};

test('status boundary shows a fresh non-future reading as current on any date, before/during/well after the official event window',()=>{
 for (const now of [BEFORE_NOW, DURING_NOW, AFTER_NOW]) {
  const reading = {...rehearsal, updatedAt: new Date(now - 60_000).toISOString()};
  const [resource] = filterPublicStatus({enabled:true,resources:[reading]}, now).resources;
  assert.equal(resource.state, reading.state);
  assert.equal(resource.updatedAt, reading.updatedAt);
  assert.equal(resource.occupancyPercent, reading.occupancyPercent);
 }
});

test('status boundary keeps history (lastClosedAt/lastFullAt/previousDay) visible on any past date, not only the official event window',()=>{
 for (const now of [BEFORE_NOW, DURING_NOW, AFTER_NOW]) {
  const [resource] = filterPublicStatus({enabled:true,resources:[rehearsal]}, now).resources;
  assert.equal(resource.lastClosedAt, rehearsal.lastClosedAt);
  assert.equal(resource.lastFullAt, rehearsal.lastFullAt);
  assert.deepEqual(resource.previousDay, rehearsal.previousDay);
 }
});

test('status boundary hides a future-timestamped reading and future history regardless of date policy (safety preserved)',()=>{
 const future = {...rehearsal, updatedAt:'2099-01-01T00:00:00Z', lastClosedAt:'2099-01-01T00:00:00Z', lastFullAt:'2099-01-01T00:00:00Z'};
 const [resource] = filterPublicStatus({enabled:true,resources:[future]}, BEFORE_NOW).resources;
 assert.equal(resource.state,'checking');
 assert.equal(resource.updatedAt,null);
 assert.equal(resource.occupancyPercent,null);
 assert.equal(resource.lastClosedAt,null);
 assert.equal(resource.lastFullAt,null);
});

test('status boundary hides a non-finite/invalid updatedAt regardless of date policy (safety preserved)',()=>{
 const invalid = {...rehearsal, updatedAt:'not-a-date'};
 const [resource] = filterPublicStatus({enabled:true,resources:[invalid]}, BEFORE_NOW).resources;
 assert.equal(resource.state,'checking');
 assert.equal(resource.updatedAt,null);
});

test('previousDay keeps firstFullAt/closedAt only while they are finite and not in the future, on any calendar date',()=>{
 const futureHistoryDay={...rehearsal, previousDay:{date:'2026-09-27',firstFullAt:'2099-01-01T00:00:00Z',closedAt:null}};
 const [resource] = filterPublicStatus({enabled:true,resources:[futureHistoryDay]}, BEFORE_NOW).resources;
 assert.equal(resource.previousDay.firstFullAt,null);
 assert.equal(resource.previousDay.closedAt,null);
});

test('deployed status handler filters the successful RPC response using the supplied now, with no date-window gating',async()=>{
 const req={method:'GET',url:'/api/status',headers:{}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 await handleStatus(req,res,env,async(url,opts)=>{
  assert.ok(url.endsWith('/rpc/ops_public_resources'));assert.deepEqual(JSON.parse(opts.body),{});
  return response([rehearsal,live]);
 },BEFORE_NOW);
 assert.equal(res.statusCode,200);assert.equal(res.body.enabled,true);
 assert.equal(res.body.resources[0].state,rehearsal.state);assert.equal(res.body.resources[0].updatedAt,rehearsal.updatedAt);
 assert.equal(res.body.resources[1].state,'checking');assert.equal(res.body.resources[1].updatedAt,null); // live.updatedAt is Oct5, in the future relative to BEFORE_NOW
});

test('deployed status handler defaults now to the real clock when not supplied',async()=>{
 const req={method:'GET',url:'/api/status',headers:{}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 // rehearsal's updatedAt is always in the past relative to the real clock, so it stays visible.
 await handleStatus(req,res,env,async()=>response([rehearsal]));
 assert.equal(res.body.resources[0].state,rehearsal.state);
 assert.equal(res.body.resources[0].updatedAt,rehearsal.updatedAt);
});

// --- Community all-date availability (server/community.js) -------------------------------------

test('filterPublicCommunity no longer filters items or photo counts by date, on any date',()=>{
 const before={id:'a',kind:'photo',text:'rehearsal',createdAt:'2026-09-28T23:59:59+09:00',eventDay:null,photoUrl:'/api/community/photo?id=a'};
 const duringEvent={id:'c',kind:'photo',text:'event',createdAt:'2026-10-05T00:00:00+09:00',eventDay:0,photoUrl:'/api/community/photo?id=c'};
 const after={id:'d',kind:'photo',text:'after',createdAt:'2026-11-01T00:00:00+09:00',eventDay:null,photoUrl:'/api/community/photo?id=d'};
 const filtered=filterPublicCommunity({enabled:true,items:[before,duringEvent,after]});
 assert.deepEqual(filtered.items,[before,duringEvent,after]);

 for (const today of ['2026-09-28','2026-09-29','2026-10-10','2026-10-11','2026-11-01']) {
  const counted=filterPublicCommunity({enabled:true,photoCountToday:3,today});
  assert.equal(counted.photoCountToday,3);
 }
});

// --- Backend auth/moderation remain unchanged under all-date availability ------------

const communityEnv={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const origin='https://teuksae-hyeonjangpan-v2.vercel.app';
const photoId='22222222-2222-4222-8222-222222222222';

async function runCommunity(route,method,body,fetcher,headers={},now=Date.parse('2026-09-29T12:00:00+09:00')) {
 const req={url:route==='admin'?'/api/admin/community':`/api/community/photo?id=${photoId}`,method,headers:{origin,'content-type':'application/json',...headers},body};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
 await handleCommunity(route,req,res,communityEnv,fetcher,now);
 return res;
}

test('admin moderation route still requires a valid session regardless of date',async()=>{
 const r=await runCommunity('admin','GET',undefined,async()=>{throw new Error('must not reach RPC without a session');});
 assert.equal(r.statusCode,401);
});

test('an approved photo is publicly readable without a session on any date, while a pending photo still requires moderator auth',async()=>{
 for (const now of [Date.parse('2026-09-29T12:00:00+09:00'), Date.parse('2026-10-05T12:00:00+09:00'), Date.parse('2026-11-01T12:00:00+09:00')]) {
  const approved=await runCommunity('photo','GET',undefined,async(url)=>{
   if(url.includes('/rpc/')) return response({path:photoId+'.png'});
   return {ok:true,arrayBuffer:async()=>new Uint8Array([1])};
  },{},now);
  assert.equal(approved.statusCode,200);

  const pending=await runCommunity('photo','GET',undefined,async(url,opts)=>{
   if(url.includes('/rpc/')) {const args=JSON.parse(opts.body).p_args;return args.session?response({path:photoId+'.png'}):response({status:'missing'});}
   return {ok:true,arrayBuffer:async()=>new Uint8Array([1])};
  },{},now);
  assert.equal(pending.statusCode,404);
 }
});
