import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4396';assert.equal(new URL(base).hostname,'127.0.0.1');
const out=process.env.EVIDENCE_DIR||new URL('../../evidence/prayer-boards/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[],results=[];
const titles={adults:'어른들을 향한 축복의 기도',youth:'청년과 청소년들을 향한 축복의 기도'};
try{
for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage(),posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url()===base+'/api/community')posts.push(r.postDataJSON());});
 await page.goto(base);await page.getByRole('tab',{name:'기도',exact:true}).click();
 await page.getByRole('heading',{name:'함께 나누는 기도',exact:true}).waitFor();
 assert.deepEqual(await page.getByRole('tab').allTextContents(),['예배','기도','주차','사진']);
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);
 for(const card of await page.locator('.tc-blessing-card').all())assert.equal(await card.evaluate(e=>e.scrollHeight===e.clientHeight&&e.scrollWidth===e.clientWidth),true);
 await page.screenshot({path:out+`cards-${width}.png`,fullPage:true});
 for(const board of ['adults','youth']){
  await page.getByRole('button',{name:new RegExp(titles[board])}).click();
  await page.getByRole('heading',{name:titles[board],level:1}).waitFor();
  await page.locator('#tc-panel-prayer .tc-community-empty, #tc-panel-prayer .tc-community-wall').waitFor();
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);
  const getFeed=async(target)=>{const r=await context.request.get(`${base}/api/community?kind=prayer&page=1&board=${target}`);assert.equal(r.status(),200);return r.json();};
  const before=await getFeed(board);assert.ok(before.items.every(x=>x.prayerBoard===board));
  if(before.nextCursor){await page.getByRole('button',{name:'다음 페이지',exact:true}).click();await page.locator('#tc-panel-prayer').getByText('2페이지',{exact:true}).waitFor();await page.getByRole('button',{name:'이전 페이지',exact:true}).click();await page.locator('#tc-panel-prayer').getByText('1페이지',{exact:true}).waitFor();}
  await page.screenshot({path:out+`${board}-list-${width}.png`,fullPage:true});
  await page.getByRole('group',{name:'기도 메뉴'}).getByRole('button',{name:'기도제목 올리기',exact:true}).click();
  const draft=`합성 검증 ${board} ${width} · 자해로 아픈 마음에 회복을`;
  await page.getByRole('textbox').fill(draft);await page.getByRole('button',{name:'작성 취소 · 목록으로'}).click();
  assert.equal(posts.length,0);await page.getByRole('group',{name:'기도 메뉴'}).getByRole('button',{name:'기도제목 올리기',exact:true}).click();assert.equal(await page.getByRole('textbox').inputValue(),draft);
  await page.getByRole('button',{name:/입력 내용 미리보기/}).click();await page.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(posts.length,0);
  await page.screenshot({path:out+`${board}-write-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'기도제목 공개로 올리기',exact:true}).dblclick();await page.getByRole('button',{name:'접수 완료',exact:true}).waitFor();
  assert.equal(posts.length,1);const post=posts[0];assert.equal(post.prayerBoard,board);
  await page.getByRole('button',{name:'← 기도 게시판으로 돌아가기'}).click();
  await page.getByRole('button',{name:new RegExp(titles[board])}).click();
  await page.getByRole('group',{name:'기도 메뉴'}).getByRole('button',{name:'기도제목 올리기',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'접수 완료',exact:true}).isDisabled(),true);
  for(const target of ['general','adults','youth'])assert.ok(!(await getFeed(target)).items.some(x=>x.id===post.requestId));
  // Review in the real admin UI, with category visible beside the unchanged original.
  const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base+'/admin');await admin.getByRole('tab',{name:'기도카드 승인',exact:true}).click();await admin.getByRole('button',{name:'별도 검토 · 공개 문구'}).click();
  const row=admin.getByRole('article',{name:`기도 ${post.requestId}`});await row.waitFor();await row.getByText(`게시판 · ${titles[board]}`,{exact:true}).waitFor();
  if(board==='youth'){await row.getByRole('radio',{name:'직접 수정'}).check();await row.getByRole('textbox',{name:'공개할 문구만 수정'}).fill(`합성 검증 ${board} ${width} · 회복과 평안을`);}
  await row.getByRole('button',{name:'공개 미리보기 확인',exact:true}).click();await row.getByRole('button',{name:'확인 취소 · 초안 유지'}).click();
  assert.ok(!(await getFeed(board)).items.some(x=>x.id===post.requestId));
  await row.getByRole('button',{name:'공개 미리보기 확인',exact:true}).click();await row.screenshot({path:out+`${board}-admin-${width}.png`});
  await row.getByRole('button',{name:'확인 후 공개 문구 게시'}).dblclick();await row.waitFor({state:'detached'});
  const published=(await getFeed(board)).items.find(x=>x.id===post.requestId);assert.ok(published);assert.ok(!published.text.includes('자해'));assert.equal(published.prayerBoard,board);
  for(const target of ['general',board==='adults'?'youth':'adults'])assert.ok(!(await getFeed(target)).items.some(x=>x.id===post.requestId));
  await admin.close();await context.request.post(base+'/api/community',{data:{action:'delete',id:post.requestId,deleteToken:post.deleteToken}});posts.length=0;
  await page.getByRole('button',{name:'← 기도 게시판으로 돌아가기'}).click();
 }
 // Empty/loading/error recovery is exercised with local intercepted GETs only.
 let mode='loading',held=[];
 await page.route('**/api/community?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('board')!=='youth')return route.continue();
  if(mode==='loading'){held.push(route);return;}
  if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,boardVersion:'prayer-boards-v1',prayerBoard:'youth',items:[],photoCountToday:0,today:'2026-10-05'})});
 });
 await page.getByRole('button',{name:new RegExp(titles.youth)}).click();await page.getByText('공개 나눔 정보를 불러오는 중이에요.').waitFor();
 mode='error';for(const route of held)await route.fulfill({status:503,body:'{}'});held=[];
 await page.getByRole('alert').waitFor();await page.screenshot({path:out+`error-${width}.png`,fullPage:true});
 mode='empty';await page.getByRole('button',{name:'다시 불러오기'}).click();await page.locator('#tc-panel-prayer .tc-community-empty').waitFor();await page.screenshot({path:out+`empty-${width}.png`,fullPage:true});
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);
 results.push({width,boards:2,cancelPreviewDoNotSubmit:true,doubleClickSingleSubmit:true,pendingPrivate:true,reviewClassificationPreserved:true,autoAndManualReview:true,publicIsolation:true,loadingErrorRetryEmpty:true,noOverflow:true});
 await context.close();
}
assert.deepEqual(errors,[]);await writeFile(out+'browser-results.json',JSON.stringify({base,data:'synthetic PGlite only; external browser traffic blocked',results,errors},null,2));console.log('PASS blessing boards at 320/390/1440 with real SQL + HTTP + admin UI');
}finally{await browser.close();}
