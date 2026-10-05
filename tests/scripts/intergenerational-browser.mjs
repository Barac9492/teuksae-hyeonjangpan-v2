import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4202';
assert.equal(new URL(base).hostname, '127.0.0.1');
const out = process.env.EVIDENCE_DIR || new URL('../../evidence/intergenerational-prayer/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [], errors = [];
try {
 for (const width of [320,390,1440]) {
  const context = await browser.newContext({ viewport: {width,height:844}, reducedMotion:'reduce',serviceWorkers:'block' });
  const writes=[];
  await context.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==base)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){writes.push(req.method());return route.abort();}
   const items=url.searchParams.get('kind')==='prayer' ? [
    {id:'synthetic-1',kind:'prayer',text:'합성 예시 · 서로의 마음을 이해하며 기도하고 싶어요.',createdAt:'2026-10-05T00:00:00Z',eventDay:null},
    {id:'synthetic-2',kind:'prayer',text:'합성 예시 · 바쁜 하루에도 서로를 돌아보게 해주세요.',createdAt:'2026-10-05T00:00:00Z',eventDay:null},
   ] : [];
   return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,resources:[],items,photoCountToday:0,today:'2026-10-05'})});
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-05T12:00:00+09:00')});await page.clock.pauseAt(new Date('2026-10-05T12:00:00+09:00'));
  await page.goto(base);await page.getByRole('tab',{name:'기도',exact:true}).click();await page.clock.runFor(30);
  assert.deepEqual(await page.getByRole('tab').allTextContents(),['예배','기도','주차','사진']);
  assert.equal(await page.locator('.tc-prayer-clock').getAttribute('open'),null);
  await page.getByText('합성 예시 · 서로의 마음을 이해하며 기도하고 싶어요.').waitFor();
  assert.equal(await page.locator('.tc-blessing-boards').count(),1);
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);
  await page.screenshot({path:out+`prayer-${width}.png`});
  await page.getByText('조용히 기도하기 · 타이머',{exact:true}).click();
  await page.getByLabel('기도 시간',{exact:true}).selectOption('3');await page.getByRole('button',{name:'기도 시작',exact:true}).click();await page.clock.runFor(10000);
  await page.getByText('조용히 기도하기 · 타이머',{exact:true}).click();
  await page.getByRole('tab',{name:'예배',exact:true}).click();
  const guide=page.locator('.tc-supporting-guide');assert.equal(await guide.getAttribute('open'),null);
  await page.getByRole('button',{name:'주차 안내',exact:true}).click();await page.getByRole('heading',{name:'주차 안내',exact:true}).waitFor();
  await page.getByRole('tab',{name:'예배',exact:true}).click();
  await page.locator('.tc-home-shortcuts').screenshot({path:out+`home-actions-${width}.png`});
  await guide.screenshot({path:out+`snack-folded-${width}.png`});
  await guide.getByText('간식 나눔·아침 식사 안내',{exact:true}).click();
  await guide.getByRole('button',{name:'아침 식사',exact:true}).click();await guide.getByRole('button',{name:'오병이어 챌린지',exact:true}).click();
  await guide.getByRole('button',{name:'메모 작성하기',exact:false}).click();
  await guide.getByRole('textbox',{name:'메모',exact:true}).fill('합성 메모 초안');
  await guide.getByText('간식 나눔·아침 식사 안내',{exact:true}).click();
  await page.getByRole('tab',{name:'기도',exact:true}).click();await page.getByText('조용히 기도하기 · 타이머',{exact:true}).click();
  assert.match(await page.getByRole('timer').innerText(),/02:50/);await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.getByRole('group',{name:'기도 메뉴'}).getByRole('button',{name:'기도제목 올리기',exact:true}).click();
  await page.getByLabel('어떤 마음으로 기도하고 있나요?').fill('합성 작성 초안');await page.getByRole('checkbox',{name:'함께 나누기 · 공개'}).uncheck();
  await page.getByRole('button',{name:/입력 내용 미리보기/}).click();await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('tab',{name:'예배',exact:true}).click();
  await guide.getByText('간식 나눔·아침 식사 안내',{exact:true}).click();assert.equal(await guide.getByRole('textbox',{name:'메모',exact:true}).inputValue(),'합성 메모 초안');
  await page.getByRole('button',{name:'서로를 위한 기도',exact:true}).click();
  assert.equal(await page.getByLabel('어떤 마음으로 기도하고 있나요?').inputValue(),'합성 작성 초안');assert.equal(await page.getByRole('checkbox',{name:'함께 나누기 · 공개'}).isChecked(),false);
  await page.getByRole('tab',{name:'예배',exact:true}).click();await page.getByRole('button',{name:'이 말씀으로 1분 기도하기',exact:true}).click();await page.clock.runFor(30);
  await page.getByRole('button',{name:'이어서 기도',exact:true}).waitFor();assert.match(await page.getByRole('timer').innerText(),/02:50/);
  await page.goBack();await page.locator('#tc-sermon-card').waitFor({state:'visible'});
  await page.getByText('말씀에서 나눈 기도 제목',{exact:false}).click();assert.equal(await page.getByRole('link',{name:/말씀 38:46–38:54/}).getAttribute('href'),'https://www.youtube.com/watch?v=0e11fIrc_6s&t=2326s');
  assert.deepEqual(writes,[]);results.push({width,specialBoardsPresent:true,snackStillAvailable:true,memoDraftPreserved:true,prayerDraftConsentPreserved:true,timerStatePreserved:true,sermonReturn:true,apiWrites:0});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'browser-results.json',JSON.stringify({base,data:'synthetic only; all external traffic blocked',results,errors},null,2));console.log('PASS intergenerational prayer at 320/390/1440; drafts/timer/consent preserved; zero writes.');
} finally {await browser.close();}
