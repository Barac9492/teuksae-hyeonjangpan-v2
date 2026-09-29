import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPublicStatus, handleStatus } from '../../api/status.js';
import { filterPublicCommunity, handleCommunity } from '../community.js';

const env={ADMIN_SESSION_SECRET:'s'.repeat(64),ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40)};
function response(data,status=200){return {ok:status<300,status,json:async()=>data};}

// Fixed reference instants (all KST), used instead of Date.now() so these assertions are deterministic.
const PREOPEN_NOW = Date.parse('2026-09-29T10:00:00+09:00'); // during preopening, before the event starts
const EVENT_NOW = Date.parse('2026-10-05T02:00:00+09:00'); // after the event has started

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
const preopeningFresh={
  id:'parking.songrim',label:'송림본당 주차',category:'parking',state:'busy',version:11,
  updatedAt:'2026-09-29T09:30:00+09:00',occupancyPercent:40,
  lastClosedAt:null,lastFullAt:null,
};

test('status boundary neutralizes September (pre-Sep29) rehearsal status and history regardless of now',()=>{
 const body=filterPublicStatus({enabled:true,resources:[rehearsal]},PREOPEN_NOW);
 const expected={...rehearsal,state:'checking',updatedAt:null,occupancyPercent:null,lastClosedAt:null,lastFullAt:null};
 delete expected.previousDay;
 assert.deepEqual(body.resources,[expected]);
});

test('status boundary preserves event-time state and only event-window history once the event has started',()=>{
 const [resource]=filterPublicStatus({enabled:true,resources:[live]},EVENT_NOW).resources;
 assert.equal(resource.state,'busy');assert.equal(resource.updatedAt,live.updatedAt);assert.equal(resource.occupancyPercent,80);
 assert.equal(resource.lastClosedAt,null);assert.equal(resource.lastFullAt,live.lastFullAt);
 assert.deepEqual(resource.previousDay,{...live.previousDay,closedAt:null});
});

test('preopening (before Oct5) shows a fresh Sep29+ rehearsal reading as current, but keeps history hidden',()=>{
 const [resource]=filterPublicStatus({enabled:true,resources:[preopeningFresh]},PREOPEN_NOW).resources;
 assert.equal(resource.state,'busy');
 assert.equal(resource.updatedAt,preopeningFresh.updatedAt);
 assert.equal(resource.occupancyPercent,40);
 assert.equal(resource.lastClosedAt,null);
 assert.equal(resource.lastFullAt,null);
 assert.equal('previousDay' in resource,false);
});

test('preopening still hides a Sep28 (pre-Sep29 KST) rehearsal reading',()=>{
 const sep28={...preopeningFresh,updatedAt:'2026-09-28T23:59:59+09:00'};
 const [resource]=filterPublicStatus({enabled:true,resources:[sep28]},PREOPEN_NOW).resources;
 assert.equal(resource.state,'checking');
 assert.equal(resource.updatedAt,null);
});

test('preopening hides a rehearsal reading timestamped later than now',()=>{
 const future={...preopeningFresh,updatedAt:'2026-09-30T00:00:00+09:00'};
 const [resource]=filterPublicStatus({enabled:true,resources:[future]},PREOPEN_NOW).resources;
 assert.equal(resource.state,'checking');
 assert.equal(resource.updatedAt,null);
});

test('Oct5 reset: once the event starts, a preopening-only rehearsal reading no longer carries into the event',()=>{
 const [resource]=filterPublicStatus({enabled:true,resources:[preopeningFresh]},EVENT_NOW).resources;
 assert.equal(resource.state,'checking');
 assert.equal(resource.updatedAt,null);
 assert.equal(resource.occupancyPercent,null);
});

test('deployed status handler filters the successful RPC response using the supplied now, not only the client',async()=>{
 const req={method:'GET',url:'/api/status',headers:{}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 await handleStatus(req,res,env,async(url,opts)=>{
  assert.ok(url.endsWith('/rpc/ops_public_resources'));assert.deepEqual(JSON.parse(opts.body),{});
  return response([rehearsal,live]);
 },EVENT_NOW);
 assert.equal(res.statusCode,200);assert.equal(res.body.enabled,true);
 assert.equal(res.body.resources[0].state,'checking');assert.equal(res.body.resources[0].updatedAt,null);assert.equal('previousDay' in res.body.resources[0],false);
 assert.equal(res.body.resources[1].state,'busy');assert.equal(res.body.resources[1].updatedAt,live.updatedAt);
});

test('deployed status handler defaults now to the real clock when not supplied',async()=>{
 const req={method:'GET',url:'/api/status',headers:{}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 // Sep28 rehearsal must stay hidden no matter what the actual current clock reads.
 await handleStatus(req,res,env,async()=>response([rehearsal]));
 assert.equal(res.body.resources[0].state,'checking');
 assert.equal(res.body.resources[0].updatedAt,null);
});

// --- Community preopening window (server/community.js) -------------------------------------

test('community feed becomes eligible exactly at Sep29 00:00 KST and stays eligible through the original Oct11-exclusive boundary',()=>{
 const sep28={id:'a',kind:'photo',text:'rehearsal',createdAt:'2026-09-28T23:59:59+09:00',eventDay:null,photoUrl:'/api/community/photo?id=a'};
 const sep29={id:'b',kind:'photo',text:'preopen',createdAt:'2026-09-29T00:00:00+09:00',eventDay:null,photoUrl:'/api/community/photo?id=b'};
 const eventDay={id:'c',kind:'photo',text:'event',createdAt:'2026-10-05T00:00:00+09:00',eventDay:0,photoUrl:'/api/community/photo?id=c'};
 const oct11={id:'d',kind:'photo',text:'after',createdAt:'2026-10-11T00:00:00+09:00',eventDay:5,photoUrl:'/api/community/photo?id=d'};
 const filtered=filterPublicCommunity({enabled:true,items:[sep28,sep29,eventDay,oct11]});
 assert.deepEqual(filtered.items,[sep29,eventDay]);
});

test('community photo-count eligibility opens on Sep29 (not just Oct5) and stays capped at Oct10',()=>{
 const sep28=filterPublicCommunity({enabled:true,photoCountToday:3,today:'2026-09-28'});
 assert.equal(sep28.photoCountToday,0);
 const sep29=filterPublicCommunity({enabled:true,photoCountToday:3,today:'2026-09-29'});
 assert.equal(sep29.photoCountToday,3);
 const oct10=filterPublicCommunity({enabled:true,photoCountToday:5,today:'2026-10-10'});
 assert.equal(oct10.photoCountToday,5);
 const oct11=filterPublicCommunity({enabled:true,photoCountToday:5,today:'2026-10-11'});
 assert.equal(oct11.photoCountToday,0);
});

// --- Backend auth/moderation remain unchanged under the widened community window ------------

const communityEnv={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
const origin='https://teuksae-hyeonjangpan-v2.vercel.app';
const photoId='22222222-2222-4222-8222-222222222222';
const communityNow=Date.parse('2026-09-29T12:00:00+09:00');

async function runCommunity(route,method,body,fetcher,headers={}) {
 const req={url:route==='admin'?'/api/admin/community':`/api/community/photo?id=${photoId}`,method,headers:{origin,'content-type':'application/json',...headers},body};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
 await handleCommunity(route,req,res,communityEnv,fetcher,communityNow);
 return res;
}

test('admin moderation route still requires a valid session under the widened preopening window',async()=>{
 const r=await runCommunity('admin','GET',undefined,async()=>{throw new Error('must not reach RPC without a session');});
 assert.equal(r.statusCode,401);
});

test('a Sep29-eligible photo is publicly readable without a session, while a Sep28 rehearsal photo still requires moderator auth',async()=>{
 const eligible=await runCommunity('photo','GET',undefined,async(url)=>{
  if(url.includes('/rpc/')) return response({path:photoId+'.png'});
  if(url.includes('/community_v2_items?')) return response([{created_at:'2026-09-29T00:00:00+09:00'}]);
  return {ok:true,arrayBuffer:async()=>new Uint8Array([1])};
 });
 assert.equal(eligible.statusCode,200);

 const hidden=await runCommunity('photo','GET',undefined,async(url)=>{
  if(url.includes('/rpc/')) return response({path:photoId+'.png'});
  if(url.includes('/community_v2_items?')) return response([{created_at:'2026-09-28T23:00:00+09:00'}]);
  return {ok:true,arrayBuffer:async()=>new Uint8Array([1])};
 });
 assert.equal(hidden.statusCode,404);
});
