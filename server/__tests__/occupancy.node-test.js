import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validOccupancy, handleAdmin, COOKIE_NAME, SESSION_SECONDS } from '../admin-auth.js';
test('operator percentage accepts only null/omitted or integer 0–100', () => {
  for (const v of [undefined,null,0,1,99,100]) assert.equal(validOccupancy(v),true);
  for (const v of [-1,101,0.5,'50','',false,NaN,Infinity,{},[]]) assert.equal(validOccupancy(v),false);
});
test('API rejects invalid estimates and passes valid nullable estimate to secured RPC', async () => {
  const secret='x'.repeat(64),now=Date.now(),sid='11111111-1111-4111-8111-111111111111';
  const encoded=Buffer.from(JSON.stringify({v:2,sid,sub:'TEST',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
  const cookie=`${COOKIE_NAME}=${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`;
  const env={ADMIN_SESSION_SECRET:secret,ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'.repeat(40)};
  for(const [percent,id,expected] of [[0,'parking.calvary',200],[100,'space.songrim.hall',200],[null,'parking.songrim',200],[-1,'parking.songrim',400],[101,'parking.songrim',400],[50.5,'parking.songrim',400],['50','parking.songrim',400],[20,'space.songrim.access',400]]) {
    let mutation=null;
    const fetcher=async(url,init)=>({ok:true,json:async()=>url.endsWith('ops_get_session')?{username:'TEST',credentialVersion:1,role:'superadmin'}:(mutation=JSON.parse(init.body),{resource:{id}})});
    const res={setHeader(){},end(){}};
    await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:id,state:'closed',occupancyPercent:percent,expectedVersion:0,requestId:'22222222-2222-4222-8222-222222222222'}},res,env,now,fetcher);
    assert.equal(res.statusCode,expected);
    if(expected===200)assert.equal(mutation.p_occupancy_percent,percent);else assert.equal(mutation,null);
  }
});
test('004 preserves transitions and security in SQL (static contract, not DB execution)',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/004_occupancy_and_event_history.sql',import.meta.url),'utf8');
 assert.match(sql,/occupancy_percent between 0 and 100/);
 assert.match(sql,/old_receipt\.occupancy_percent is distinct from p_occupancy_percent/);
 assert.match(sql,/last_full_at=case when p_state='full' and state is distinct from p_state then now\(\) else last_full_at end/);
 assert.match(sql,/last_closed_at=case when p_state in \('closed','hall_closed'\) and state is distinct from p_state then now\(\) else last_closed_at end/);
 assert.match(sql,/before_occupancy_percent,after_occupancy_percent/);
 assert.match(sql,/for update of session_row,actor/);
 assert.match(sql,/resource_row\.version<>p_expected_version/);
 assert.match(sql,/from public, anon, authenticated/);
 assert.match(sql,/'parking.calvary','갈보리교회 주차','parking','checking'/);
});
