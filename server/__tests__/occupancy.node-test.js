import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validOccupancy, handleAdmin, COOKIE_NAME, SESSION_SECONDS } from '../admin-auth.js';
test('operator percentage accepts only null/omitted or 10-point steps from 0–100', () => {
  for (const v of [undefined,null,0,10,70,100]) assert.equal(validOccupancy(v),true);
  for (const v of [-1,1,75,99,101,0.5,'50','',false,NaN,Infinity,{},[]]) assert.equal(validOccupancy(v),false);
});
test('API accepts matching steps and rejects invalid or state-inconsistent estimates', async () => {
  const secret='x'.repeat(64),now=Date.now(),sid='11111111-1111-4111-8111-111111111111';
  const encoded=Buffer.from(JSON.stringify({v:2,sid,sub:'TEST',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
  const cookie=`${COOKIE_NAME}=${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`;
  const env={ADMIN_SESSION_SECRET:secret,ADMIN_ALLOWED_ORIGIN:'https://fixture.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'.repeat(40)};
  for(const [percent,id,state,expected] of [[0,'parking.calvary','available',200],[60,'space.songrim.hall','available',200],[70,'parking.songrim','busy',200],[100,'space.songrim.hall','full',200],[null,'parking.songrim','closed',200],[undefined,'parking.songrim','busy',200],[-1,'parking.songrim','available',400],[75,'parking.songrim','busy',400],[101,'parking.songrim','full',400],[50.5,'parking.songrim','available',400],['50','parking.songrim','available',400],[40,'parking.songrim','full',400],[100,'parking.songrim','busy',400],[50,'parking.songrim','closed',400],[20,'space.songrim.access','closed',400]]) {
    let mutation=null;
    const fetcher=async(url,init)=>({ok:true,json:async()=>url.endsWith('ops_get_session')?{username:'TEST',credentialVersion:1,role:'superadmin'}:(mutation=JSON.parse(init.body),{resource:{id}})});
    const res={setHeader(){},end(){}};
    await handleAdmin('operations',{method:'POST',url:'/api/admin/operations',headers:{cookie,origin:env.ADMIN_ALLOWED_ORIGIN,'content-type':'application/json'},body:{resourceId:id,state,occupancyPercent:percent,expectedVersion:0,requestId:'22222222-2222-4222-8222-222222222222'}},res,env,now,fetcher);
    assert.equal(res.statusCode,expected);
    if(expected===200)assert.equal(mutation.p_occupancy_percent,percent ?? null);else assert.equal(mutation,null);
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
test('007 enforces discrete estimates and preserves the secured, idempotent six-argument RPC',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/007_occupancy_steps.sql',import.meta.url),'utf8');
 for (const [table,column] of [['ops_resources','occupancy_percent'],['ops_history','before_occupancy_percent'],['ops_history','after_occupancy_percent'],['ops_request_receipts','occupancy_percent']]) {
   assert.match(sql,new RegExp(`alter table public\\.${table}[\\s\\S]*?${column} is null or ${column} % 10 = 0`));
 }
 assert.match(sql,/p_occupancy_percent integer default null/);
 assert.match(sql,/p_occupancy_percent < 0 or p_occupancy_percent > 100 or p_occupancy_percent % 10 <> 0/);
 assert.match(sql,/p_state='available' and p_occupancy_percent between 0 and 60/);
 assert.match(sql,/p_state='busy' and p_occupancy_percent between 70 and 90/);
 assert.match(sql,/p_state='full' and p_occupancy_percent=100/);
 assert.match(sql,/p_resource_id='space\.songrim\.access'/);
 assert.match(sql,/old_receipt\.occupancy_percent is distinct from p_occupancy_percent/);
 assert.match(sql,/for update of session_row,actor/);
 assert.match(sql,/raise exception 'unauthorized' using errcode='42501'/);
 assert.match(sql,/revoke all on function public\.ops_set_resource_state\(uuid,text,text,integer,uuid,integer\) from public, anon, authenticated/);
});
