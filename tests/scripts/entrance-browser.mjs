import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL || 'http://127.0.0.1:4196';assert.equal(new URL(base).hostname,'127.0.0.1');
const out=new URL('../../evidence/entrance-consistency/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[],checks=[];const now=Date.parse('2026-10-05T04:10:00+09:00');
async function fixture(width,live=true){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 let resources=['access','hall','gym'].map((id,i)=>({id:'space.songrim.'+id,label:['송림본당 개방 단계','본당1·2층','체육관'][i],category:'space',state:'closed',version:1,updatedAt:new Date(now-60000).toISOString(),occupancyPercent:null}));
 const posts=[];let reads=0;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let body;
  if(url.pathname==='/api/admin/session')body={authenticated:true,username:'LOCAL-FIXTURE',role:'space',displayName:'합성 확인',expiresAt:'2030-01-01T00:00:00Z',sessionId:'fixture',capabilities:{liveOperations:live}};
  else if(url.pathname==='/api/admin/operations'){
   if(req.method()==='POST'){const p=req.postDataJSON();posts.push(p);resources=resources.map(r=>r.id===p.resourceId?{...r,state:p.state,occupancyPercent:p.occupancyPercent,version:r.version+1}:r);body={resource:resources.find(r=>r.id===p.resourceId)};}
   else body={resources,publicResources:resources,history:[],canManageAccounts:false};
  }else if(url.pathname==='/api/status'){reads++;body={enabled:true,resources};}
  else if(url.pathname==='/api/community')body={enabled:true,items:[],photoCountToday:0,today:'2026-10-05'};
  else throw new Error('Unmocked endpoint '+url.pathname);
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:now});await page.clock.setFixedTime(now);
 return {context,page,posts,reads:()=>reads};
}
try {
 for(const width of [320,390,1440]){
  const f=await fixture(width);const {page}=f;
  await page.goto(base+'/');await page.getByText('마지막 확인 04:09 (한국)',{exact:true}).first().waitFor();
  assert.match(await page.locator('#tc-panel-worship .tc-status-row').first().innerText(),/^송림 입장 단계/);
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,`HOME overflow ${width}`);
  await page.locator('#tc-panel-worship > .tc-section').first().screenshot({path:out+`home-${width}.png`});
  await page.clock.setFixedTime(now+600001);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByText('마지막 확인 04:09 (한국) · 10분 경과',{exact:true}).first().waitFor();
  assert.equal(await page.locator('#tc-panel-worship .tc-status-value').first().innerText(),'확인 필요');
  if(width===390)await page.locator('#tc-panel-worship > .tc-section').first().screenshot({path:out+'home-stale-390.png'});
  await page.clock.setFixedTime(now);await page.goto(base+'/admin');await page.getByLabel('송림본당 개방 단계 상태').waitFor();
  const input=page.getByLabel('송림본당 개방 단계 상태'),card=input.locator('..').locator('..');
  await input.selectOption('hall_open');await card.getByRole('button',{name:'상태 저장',exact:true}).click();
  const warning=page.getByRole('alert',{name:'입장 안내 차이 확인'});await warning.waitFor();
  assert.equal(await warning.evaluate(e=>e===document.activeElement),true);assert.equal(f.posts.length,0);
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,`admin warning overflow ${width}`);
  await card.screenshot({path:out+`warning-${width}.png`});
  await warning.getByRole('button',{name:'돌아가서 수정'}).click();assert.equal(await input.inputValue(),'hall_open');assert.equal(f.posts.length,0);
  await card.getByRole('button',{name:'상태 저장',exact:true}).click();await warning.waitFor();
  await warning.getByRole('button',{name:'차이를 확인하고 저장'}).dblclick();await page.getByText(/저장했습니다/).waitFor();
  assert.equal(f.posts.length,1);assert.equal(f.posts[0].resourceId,'space.songrim.access');assert.equal(f.posts[0].expectedVersion,1);
  const table=page.getByRole('table',{name:'공개 현황 한눈에 보기'});
  await page.clock.setFixedTime(new Date('2026-10-05T04:40:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await table.getByText('예배 중 · 05:50까지 현황 표시·갱신 중지',{exact:true}).first().waitFor();
  if(width===390)await table.screenshot({path:out+'admin-worship-390.png'});
  await page.clock.setFixedTime(new Date('2026-10-05T05:50:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await table.getByText('예배 후 · 귀가 안내 표시',{exact:true}).first().waitFor();
  if(width===390)await table.screenshot({path:out+'admin-after-390.png'});
  await page.clock.setFixedTime(new Date('2026-10-05T04:40:00+09:00'));const beforeReads=f.reads();await page.goto(base+'/');await page.locator('[data-service-mode="worship"]').waitFor();assert.equal(f.reads(),beforeReads);
  await page.clock.setFixedTime(new Date('2026-10-05T05:50:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'예배를 마친 뒤'}).waitFor();assert.equal(await page.locator('#tc-panel-worship .tc-status-row').count(),0);
  checks.push({width,syntheticWrites:f.posts.length,checks:['last confirmed time','TTL retained','no horizontal overflow','warning focus','cancel keeps draft','double click one write','04:40 and 05:50 admin/public agreement']});await f.context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'browser-results.json',JSON.stringify({base,externalTraffic:'blocked',data:'synthetic route fixtures only',checks,errors},null,2));
 console.log('PASS entrance browser checks at 320, 390, 1440; synthetic local writes only. Evidence: '+out);
}finally{await browser.close();}
