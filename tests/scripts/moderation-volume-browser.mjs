// Run with QA_ITEM_COUNT=107 admin-feedback-fixture on a dedicated local port.
// Actual SQL + HTTP handler; fresh browser; only synthetic data is mutated.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BASE_URL || 'http://127.0.0.1:4197';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out=new URL('../../evidence/moderation-volume-20261004/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage(),errors=[],posts=[],checks=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/admin/community'))posts.push(request.postDataJSON());});
 const overflow=async()=>assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);
 const rows=page.locator('.community-moderation__item');
 await page.goto(base+'/admin');
 for(const [kind,tab,total] of [['prayer','기도카드 승인',210],['photo','사진 승인',105]]) {
  await page.getByRole('tab',{name:tab,exact:true}).click();
  await page.getByRole('heading',{name:tab,exact:true}).waitFor();
  await rows.first().waitFor();
  await page.waitForFunction(() => document.querySelector('.community-moderation')?.getAttribute('aria-busy') === 'false');
  await page.getByRole('combobox',{name:'검토 상태'}).selectOption('pending');
  await page.waitForFunction(() => document.querySelector('.community-moderation')?.getAttribute('aria-busy') === 'false');
  assert.equal(await page.getByRole('combobox',{name:'검토 상태'}).inputValue(),'pending');
  await rows.first().waitFor();
  assert.equal(await rows.count(),20);
  assert.equal(await page.getByRole('checkbox').count(),20);
  assert.equal(await page.getByRole('checkbox').first().isDisabled(),true);
  await overflow();
  if(kind==='prayer'){await rows.first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'mobile-visible-checkboxes.png'});}
  const ids=[];let pageNumber=0;
  for (;;) {
   const names=await rows.evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label')));
   ids.push(...names);pageNumber++;
   assert.ok(pageNumber<20,'pagination terminates');
   if(!(await page.getByRole('button',{name:'다음 페이지',exact:true}).count()))break;
   // Explicit selections on a page are discarded when advancing.
   await rows.first().locator('summary').click();
   if(kind==='photo')await rows.first().locator('img').evaluate(e=>e.decode());
   await rows.first().getByRole('checkbox').check();
   const oldName=names[0];
   await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
   await page.waitForFunction(old=>document.querySelector('.community-moderation__item')?.getAttribute('aria-label')!==old,oldName);
   await rows.first().waitFor();
   assert.equal(await page.getByRole('button',{name:'선택 공개 승인',exact:true}).isDisabled(),true);
   assert.equal(await page.getByRole('checkbox').first().isDisabled(),true);
  }
  assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);assert.equal(posts.length,kind==='photo'?10:0);
  await page.getByRole('button',{name:'현재 페이지 내용 모두 펼치기'}).click();
  if(kind==='photo')for(const img of await page.locator('.community-moderation__item img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());}
  await page.getByRole('button',{name:'펼친 검토 대기 항목 모두 선택'}).click();
  const count=await rows.count(),before=posts.length;
  assert.equal(count,kind==='prayer'?10:5);
  await page.getByRole('button',{name:'선택 공개 승인',exact:true}).click();
  await page.getByRole('region',{name:'선택 항목 확인'}).waitFor();
  assert.equal(posts.length,before);
  await overflow();await page.screenshot({path:out+`mobile-${kind}-last-page-confirmation.png`,fullPage:true});
  await page.getByRole('button',{name:'확인 후 일괄 공개 승인'}).dblclick();
  await page.getByText(`${count}개 중 ${count}개 완료.`,{exact:true}).waitFor();
  assert.equal(posts.length,before+count);
  assert.ok(posts.slice(before).every(p=>p.expectedVersion===0&&p.decision==='approved'&&ids.slice(-count).some(name=>name.endsWith(p.id))));
  checks.push({kind,pages:pageNumber,uniquePending:total,explicitLastPageApprovals:count});
 }
 // Unloaded/broken photo is never included in the page selection.
 await page.getByRole('button',{name:'현재 페이지 내용 모두 펼치기'}).click();
 const firstImage=page.locator('.community-moderation__item img').first();
 await firstImage.scrollIntoViewIfNeeded();await firstImage.evaluate(e=>e.decode());
 await rows.first().getByRole('checkbox').check();
 await firstImage.dispatchEvent('error');
 await page.waitForFunction(() => !document.querySelector('.community-moderation__item input').checked);
 assert.equal(await rows.first().getByRole('checkbox').isChecked(),false);
 assert.equal(await page.getByRole('button',{name:'선택 공개 승인',exact:true}).isDisabled(),true);
 for(const width of [320,390,1440]) {
  await page.setViewportSize({width,height:width===1440?1000:844});
  await overflow();
  // The approval toolbar remains within the viewport while reviewing lower cards.
  await rows.nth(8).locator('img').scrollIntoViewIfNeeded();
  await rows.nth(8).locator('img').evaluate(e=>e.decode());
  await rows.nth(8).getByRole('checkbox').check();
  const box=await page.locator('.community-moderation__approve-bar').boundingBox();
  assert.ok(box&&box.y>=0&&box.y+box.height<=(width===1440?1000:844),`sticky toolbar ${width}px`);
  await page.screenshot({path:out+`photo-review-${width}.png`});
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'browser-results.json',JSON.stringify({base,syntheticOnly:true,checks,viewports:[320,390,1440],writes:posts.length,errors},null,2));
 console.log(JSON.stringify({result:'PASS',checks,writes:posts.length,errors,evidence:out}));
} finally {await browser.close();}
