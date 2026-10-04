import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4185';assert.equal(new URL(base).hostname,'127.0.0.1');
const out=process.env.ARCHIVE_EVIDENCE_DIR||'/tmp/photo-archive-browser/';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
let external=0;await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
const page=await context.newPage(),posts=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/admin/community'))posts.push(r.postDataJSON());});
const get=async path=>(await context.request.get(base+path)).json();
const anonImage=id=>context.request.get(base+`/api/community/photo?id=${id}`,{headers:{'x-qa-anonymous':'1'}});
async function selectFirst(){const card=page.locator('.community-moderation__item').first();await card.locator('summary').click();await card.locator('img').evaluate(e=>e.decode());await card.getByRole('checkbox').check();return (await card.getAttribute('aria-label')).slice('사진 '.length);}
try{
 await page.goto(base+'/admin');await page.getByRole('tab',{name:'사진 승인',exact:true}).click();await page.locator('.community-moderation__item').first().waitFor();
 const pending=await selectFirst();await page.getByRole('button',{name:'선택 비공개 보관',exact:true}).click();assert.equal(posts.length,0);await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(posts.length,0);
 await page.getByRole('button',{name:'선택 비공개 보관',exact:true}).click();await page.getByRole('region',{name:'선택 항목 확인'}).screenshot({path:out+'archive-confirmation.png'});await page.getByRole('button',{name:'확인 후 비공개 보관',exact:true}).dblclick();await page.getByText('1개 중 1개 완료.',{exact:true}).waitFor();assert.equal(posts.length,1);
 assert.equal((await anonImage(pending)).status(),404);
 await page.getByRole('combobox',{name:'검토 상태'}).selectOption('approved');await page.locator('.community-moderation__item').first().waitFor();const approved=await selectFirst();assert.equal((await anonImage(approved)).status(),200);
 const viewer=await context.newPage();await viewer.setExtraHTTPHeaders({'x-qa-anonymous':'1'});await viewer.clock.setFixedTime(new Date('2026-10-01T12:00:00+09:00'));await viewer.goto(base);await viewer.getByRole('tab',{name:'사진',exact:true}).click();await viewer.locator(`.tc-community-wall img[src*="${approved}"]`).waitFor();
 await page.getByRole('button',{name:'선택 비공개 보관',exact:true}).click();await page.getByRole('button',{name:'확인 후 비공개 보관',exact:true}).click();await page.getByText('1개 중 1개 완료.',{exact:true}).waitFor();assert.equal((await anonImage(approved)).status(),404);
 await viewer.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await viewer.locator(`.tc-community-wall img[src*="${approved}"]`).waitFor({state:'detached'});await viewer.close();
 for(const path of ['/api/community?kind=photo','/api/community?kind=photo&page=1'])assert.ok(!(await get(path)).items.some(x=>[pending,approved].includes(x.id)));
 await page.getByRole('combobox',{name:'검토 상태'}).selectOption('archived');await page.getByRole('region',{name:/비공개 보관 사진/}).waitFor();assert.equal(await page.getByRole('button',{name:'선택 공개 승인',exact:true}).count(),0);
 const archived=(await get('/api/admin/community?kind=photo&status=archived')).items;assert.ok(archived.some(x=>x.id===pending)&&archived.some(x=>x.id===approved));
 await page.getByRole('button',{name:'현재 페이지 내용 모두 펼치기'}).click();for(const img of await page.getByAltText('공개 검토용 제출 사진').all())await img.evaluate(e=>e.decode());
 // Keep useful compact screenshot evidence at mobile/narrow/desktop widths.
 for(const width of [390,320,1440]){await page.setViewportSize({width,height:width===320?740:960});assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,`overflow ${width}`);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+`archived-list-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 const card=page.getByRole('article',{name:`사진 ${approved}`,exact:true});await card.getByRole('checkbox').check();await page.getByRole('button',{name:'선택 검토 대기로 이동',exact:true}).click();assert.match(await page.getByRole('region',{name:'선택 항목 확인'}).innerText(),/자동 공개되지/);await page.getByRole('button',{name:'확인 후 검토 대기로 이동',exact:true}).click();await page.getByText('1개 중 1개 완료.',{exact:true}).waitFor();assert.equal((await anonImage(approved)).status(),404);
 let cursor=null,returned;do{const pendingList=await get('/api/admin/community?kind=photo&status=pending'+(cursor?'&cursor='+cursor:''));returned=pendingList.items.find(x=>x.id===approved);cursor=pendingList.nextCursor;}while(!returned&&cursor);assert.equal(returned?.version,2);
 const stale=await context.request.post(base+'/api/admin/community',{data:{id:approved,decision:'approved',expectedVersion:0}});assert.equal(stale.status(),409);
 // Archive -> trash -> restore stays private, with fresh version checks.
 await selectFirst();await page.getByRole('button',{name:'선택 휴지통으로 이동'}).click();await page.getByRole('button',{name:'확인 후 휴지통 이동'}).click();await page.getByText('현재 검토 목록에 게시물이 없습니다.').waitFor();
 await page.getByRole('tab',{name:'휴지통',exact:true}).click();const trash=page.getByRole('article',{name:`사진 ${pending}`,exact:true});await trash.locator('summary').click();await trash.locator('img').evaluate(e=>e.decode());await trash.getByRole('checkbox').check();await page.getByRole('button',{name:'선택 복원'}).click();await page.getByRole('button',{name:'확인 후 복원'}).click();await page.getByText('1개 중 1개 완료.',{exact:true}).waitFor();assert.equal((await anonImage(pending)).status(),404);
 assert.deepEqual(errors,[]);const result={passed:true,viewports:[390,320,1440],checks:['pending/approved archive','confirm/cancel/double-click','private archive list','anonymous direct image 404','public legacy/page exclusion','existing public DOM removes archived photo on refresh','archive->pending remains private','stale approval 409','archive->trash->pending','no overflow or JS errors'],writes:posts.length,externalRequests:0,blockedExternalRequests:external};await writeFile(out+'results.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
