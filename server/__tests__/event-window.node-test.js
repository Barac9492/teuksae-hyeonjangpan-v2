import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPublicStatus, handleStatus } from '../../api/status.js';

const env={ADMIN_SESSION_SECRET:'s'.repeat(64),ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40)};
function response(data,status=200){return {ok:status<300,status,json:async()=>data};}

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

test('status boundary neutralizes rehearsal status and September parking history',()=>{
 const body=filterPublicStatus({enabled:true,resources:[rehearsal]});
 const expected={...rehearsal,state:'checking',updatedAt:null,occupancyPercent:null,lastClosedAt:null,lastFullAt:null};
 delete expected.previousDay;
 assert.deepEqual(body.resources,[expected]);
});

test('status boundary preserves event-time state and only event-window history',()=>{
 const [resource]=filterPublicStatus({enabled:true,resources:[live]}).resources;
 assert.equal(resource.state,'busy');assert.equal(resource.updatedAt,live.updatedAt);assert.equal(resource.occupancyPercent,80);
 assert.equal(resource.lastClosedAt,null);assert.equal(resource.lastFullAt,live.lastFullAt);
 assert.deepEqual(resource.previousDay,{...live.previousDay,closedAt:null});
});

test('deployed status handler filters the successful RPC response, not only the client',async()=>{
 const req={method:'GET',url:'/api/status',headers:{}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 await handleStatus(req,res,env,async(url,opts)=>{
  assert.ok(url.endsWith('/rpc/ops_public_resources'));assert.deepEqual(JSON.parse(opts.body),{});
  return response([rehearsal,live]);
 });
 assert.equal(res.statusCode,200);assert.equal(res.body.enabled,true);
 assert.equal(res.body.resources[0].state,'checking');assert.equal(res.body.resources[0].updatedAt,null);assert.equal('previousDay' in res.body.resources[0],false);
 assert.equal(res.body.resources[1].state,'busy');assert.equal(res.body.resources[1].updatedAt,live.updatedAt);
});
