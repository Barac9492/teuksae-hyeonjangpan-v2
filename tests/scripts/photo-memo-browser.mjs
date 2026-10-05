// Loopback-only browser regression against admin-feedback-fixture.mjs (synthetic PGlite).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4197';
assert.equal(new URL(base).hostname, '127.0.0.1');
const out = process.env.EVIDENCE_DIR || new URL('../../evidence/photo-memo/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const png = new PNG({ width: 40, height: 30 }); png.data.fill(180);
const image = { name: 'synthetic.png', mimeType: 'image/png', buffer: PNG.sync.write(png) };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [], checks = [];
let external = 0;
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce', extraHTTPHeaders: { 'x-qa-anonymous': '1' } });
    context.setDefaultTimeout(15000);
    const posts = []; let loseResponse = true;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { external++; return route.abort(); }
      if (url.pathname === '/api/community' && request.method() === 'POST' && request.postDataJSON().kind === 'photo') {
        posts.push(request.postDataJSON());
        if (loseResponse) { loseResponse = false; await route.fetch(); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '합성 응답 유실' }) }); }
      }
      return route.continue();
    });
    const page = await context.newPage(); console.log('viewport', width); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-10-05T12:00:00+09:00'));
    await page.goto(base); await page.getByRole('tab', { name: '사진', exact: true }).click();
    await page.getByLabel('사진 올리기', { exact: true }).setInputFiles(image);
    const memo = page.getByRole('textbox', { name: /사진 아래 한 줄 메모/ });
    const publish = page.getByRole('button', { name: '사진 공개하기', exact: true });
    assert.ok(await memo.isVisible()); assert.equal(await page.locator('.tc-photo-extras').getAttribute('open'), null);
    assert.equal(await memo.evaluate(el => getComputedStyle(el).fontSize), '16px');
    await memo.fill(''); await memo.pressSequentially('가'.repeat(45)); assert.equal((await memo.inputValue()).length, 40);
    const text = `합성 ${width} <b>새벽 메모</b>`;
    await memo.fill(text); await memo.press('Enter'); assert.equal(posts.length, 0);
    assert.equal(await page.locator('.tc-photo-memo b').count(), 0);
    // A short viewport approximates reduced space while the mobile keyboard is open.
    await page.setViewportSize({ width, height: 430 }); await memo.focus(); await memo.scrollIntoViewIfNeeded();
    assert.equal(await memo.evaluate(el => el === document.activeElement), true);
    assert.ok((await memo.boundingBox()).height >= 44);
    assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: out + `memo-keyboard-space-${width}.png` });
    await page.setViewportSize({ width, height: 844 }); await memo.blur();
    console.log('before publish', width); await page.getByRole('checkbox', { name: '함께 나누기 · 공개' }).check(); await publish.click(); console.log('submitted', width);
    await page.getByText('공개 나눔 서버에 연결하지 못했어요. 접수 여부를 확인하거나 다시 시도해주세요.', { exact: true }).waitFor(); console.log('lost response', width); assert.equal(await memo.inputValue(), text);
    await publish.dblclick(); await page.getByText(/서버에 접수했어요/).waitFor();
    assert.equal(posts.length, 2); assert.deepEqual(posts[1], posts[0]); assert.equal(posts[0].text, text);
    const id = posts[0].requestId;
    let feed = await (await context.request.get(base + '/api/community?kind=photo')).json(); assert.ok(!feed.items.some(item => item.id === id));
    const admin = await context.newPage(); await admin.setExtraHTTPHeaders({ 'x-qa-anonymous': '0' }); await admin.goto(base + '/admin');
    await admin.getByRole('tab', { name: '사진 승인', exact: true }).click();
    const card = admin.getByRole('article', { name: `사진 ${id}`, exact: true });
    await card.locator('summary').click(); await card.locator('img').evaluate(el => el.decode());
    assert.equal(await card.locator('.community-moderation__text').innerText(), text); assert.equal(await card.locator('.community-moderation__text b').count(), 0);
    await card.screenshot({ path: out + `admin-memo-${width}.png` });
    await card.getByRole('checkbox').check(); await admin.getByRole('button', { name: '선택 공개 승인', exact: true }).click();
    await admin.getByRole('button', { name: '확인 후 일괄 공개 승인', exact: true }).click(); await admin.getByText('1개 중 1개 완료.', { exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    const publicCard = page.locator('.tc-community-wall li').filter({ has: page.locator(`img[src*="${id}"]`) });
    await publicCard.waitFor(); assert.ok((await publicCard.innerText()).includes(text)); assert.equal(await publicCard.locator('b').count(), 0);
    await publicCard.screenshot({ path: out + `public-memo-${width}.png` });
    // A completed action resets review selection; inspect the approved image again.
    await card.locator('summary').click(); await card.locator('img').evaluate(el => el.decode());
    // Existing archive/withdrawal must hide both the memo and photo.
    await card.getByRole('checkbox').check(); await admin.getByRole('button', { name: '선택 비공개 보관', exact: true }).click();
    await admin.getByRole('button', { name: '확인 후 비공개 보관', exact: true }).click(); await card.waitFor({ state: 'detached' });
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await publicCard.waitFor({ state: 'detached' });
    assert.equal((await context.request.get(base + `/api/community/photo?id=${id}`)).status(), 404);
    await admin.getByRole('combobox', { name: '검토 상태' }).selectOption('archived'); await card.locator('summary').click();
    assert.equal(await card.locator('.community-moderation__text').innerText(), text);
    await page.getByText('내 제출 기록 (1)', { exact: true }).click(); await page.getByRole('button', { name: '제출 철회·삭제', exact: true }).click();
    await page.getByText(/서버의 제출 기록 삭제 결과/).waitFor();
    await admin.getByRole('button', { name: '검토 목록 새로고침' }).click(); await card.waitFor({ state: 'detached' });
    await page.getByLabel('다른 사진 고르기', { exact: true }).setInputFiles(image);
    assert.equal(await memo.inputValue(), text); assert.equal(await page.getByRole('checkbox', { name: '함께 나누기 · 공개' }).isChecked(), false);
    assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    checks.push({ width, duplicateRequests: posts.length, sameRetry: true, flow: 'memo → response loss → retry → admin review → approval → public → archive → owner deletion' });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, javascriptErrors: errors, externalRequestsSent: 0, externalRequestsBlocked: external, mobileKeyboard: '430px viewport + focus/Enter/16px input verified; real iOS/Android keyboard not exercised' };
  await writeFile(out + 'results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
