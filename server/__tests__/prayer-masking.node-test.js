import test from 'node:test';
import assert from 'node:assert/strict';
import { prayerMask, PRAYER_MASK_VERSION, PRAYER_MASK_TERMS } from '../prayer-masking.js';
import { filterPublicCommunity, handleCommunity } from '../community.js';
import { createHmac } from 'node:crypto';
import { SESSION_SECONDS } from '../admin-auth.js';

test('bounded exact dictionary, longest matches, literal stars and documented limitations',()=>{
 assert.equal(PRAYER_MASK_TERMS.length,10);
 assert.deepEqual(prayerMask('성폭행 폭행').matches.map(m=>m.term),['성폭행','폭행']);
 for(const [input,expected] of [['자살 자살','** **'],['자살예방 살인미소','**예방 **미소'],['자 살','자 살'],['자\n살','자\n살'],['자\u200b살','자\u200b살'],['자살'.normalize('NFD'),'자살'.normalize('NFD')],['우울증 치료와 건강 회복','우울증 치료와 건강 회복'],['🌱 자해','🌱 **']]){
  assert.equal(prayerMask(input).publicText,expected);assert.equal(prayerMask(expected).publicText,expected);
 }
});
test('public serializer strips hidden originals, rejects unmatched policies and raw fallback',()=>{
 const prayer={id:'a',kind:'prayer',text:'** 회복',createdAt:'now',eventDay:null,originalText:'자살',masking:{text:'강간'}};
 const body={enabled:true,items:[prayer,{...prayer,id:'b',text:'폭행'}],maskingPolicyVersion:PRAYER_MASK_VERSION,originalText:'폭행',photoCountToday:0,today:'2026-10-05'};
 const result=filterPublicCommunity(body);assert.deepEqual(result.items,[{id:'a',kind:'prayer',text:'** 회복',createdAt:'now',eventDay:null}]);assert.ok(!prayerMask(JSON.stringify(result)).required);
 assert.equal(filterPublicCommunity({...body,maskingPolicyVersion:'old'}).items.length,0);
 assert.deepEqual(filterPublicCommunity({id:'a',status:'pending',text:'자살',originalText:'강간'}),{id:'a',status:'pending'});
});
test('HTTP approval fails closed before any mutation when SQL policy is absent or mismatched',async()=>{
 const id='11111111-1111-4111-8111-111111111111',now=Date.now(),env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),ADMIN_SESSION_SECRET:'s'.repeat(64)};
 const payload=Buffer.from(JSON.stringify({v:2,sid:id,sub:'ADMIN',cv:1,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+SESSION_SECONDS,nonce:'n'.repeat(32)})).toString('base64url');
 const cookie=`__Host-woori_admin=${payload}.${createHmac('sha256',env.ADMIN_SESSION_SECRET).update(payload).digest('base64url')}`;
 for(const policy of [{status:'unknown'},{version:'old'}]){
  const actions=[],res={setHeader(){},end(text){this.body=JSON.parse(text);}};
  await handleCommunity('admin',{url:'/api/admin/community',method:'POST',headers:{origin:'https://teuksae-hyeonjangpan-v2.vercel.app','content-type':'application/json',cookie},body:{id,decision:'approved',expectedVersion:0}},res,env,async(url,init)=>{const b=JSON.parse(init.body);actions.push(b.p_action);return {ok:true,json:async()=>url.endsWith('ops_get_session')?{username:'ADMIN',credentialVersion:1,role:'superadmin'}:policy};},now);
  assert.equal(res.statusCode,503);assert.ok(!actions.includes('moderate'));
 }
});
