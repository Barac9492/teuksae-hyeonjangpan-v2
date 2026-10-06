// Every API response is synthetic; this regression must never target production.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4199';
assert.equal(new URL(base).hostname, '127.0.0.1');
const out = process.env.EVIDENCE_DIR || new URL('../../evidence/gym-home-paths/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [], errors = [], writes = [];
const times = { before: '2026-10-07T03:30:00+09:00', worship: '2026-10-07T05:00:00+09:00', after: '2026-10-07T07:00:00+09:00', outside: '2026-10-11T07:00:00+09:00' };
async function setup(width, time, missing = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const resource = (id, label, percent) => ({ id, label, category: 'space', state: percent < 70 ? 'available' : 'busy', occupancyPercent: percent, version: 1, updatedAt: new Date(time).toISOString() });
  const resources = [resource('space.songrim.gym', '체육관', 90), ...(missing ? [] : [resource('space.songrim.gym.f1', '체육관 1층', 20), resource('space.songrim.gym.f2', '체육관 2층', 80)])];
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (req.method() !== 'GET') { writes.push({ method: req.method(), path: url.pathname }); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, resources, items: [], photoCountToday: 0, today: '2026-10-07' }) });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date(time) });
  await page.clock.pauseAt(new Date(time));
  return { context, page };
}
async function floors(page, expected) {
  for (const n of [1, 2]) {
    const row = page.locator('.tc-status-row').filter({ hasText: `체육관 ${n}층` });
    await row.waitFor();
    // Wait for the asynchronous read instead of accepting initial unknown placeholders.
    await page.waitForFunction(({ n, value }) => [...document.querySelectorAll('.tc-status-row')].some(r => r.textContent.includes(`체육관 ${n}층`) && r.textContent.includes(value)), { n, value: expected[n - 1] });
    assert.match(await row.innerText(), new RegExp(expected[n - 1]));
  }
  const names = await page.locator('.tc-status-row > span:first-child').evaluateAll(els => els.map(el => el.childNodes[0].textContent));
  assert.ok(!names.includes('체육관') && !names.includes('본당·체육관'));
  assert.equal(await page.getByText('90% · 혼잡', { exact: true }).count(), 0);
  assert.equal(await page.locator('body').evaluate(e => e.scrollWidth <= innerWidth), true);
}
async function screenshot(page, name) {
  await page.locator('.tc-status-row').filter({ hasText: '체육관 1층' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + name + '.png' });
}
try {
  for (const width of [320, 390]) {
    for (const [mode, time] of Object.entries(times)) {
      const { context, page } = await setup(width, time);
      await page.goto(base);
      await floors(page, ['20% · 이용 가능', '80% · 혼잡']);
      await page.getByRole('button', { name: '서현 · 드림센터', exact: true }).click();
      assert.deepEqual(await page.locator('.tc-floor__name b').allTextContents(), ['11층', '7층', '3층']);
      assert.equal(await page.getByText('체육관 1층', { exact: true }).count(), 0);
      await page.getByRole('button', { name: '이매 · 송림본당', exact: true }).click();
      await page.getByRole('tab', { name: '주차', exact: true }).click();
      await page.getByRole('tab', { name: '예배', exact: true }).click();
      await floors(page, ['20% · 이용 가능', '80% · 혼잡']);
      await page.reload();
      await floors(page, ['20% · 이용 가능', '80% · 혼잡']);
      if (mode === 'after') await screenshot(page, `home-${width}`);
      results.push({ width, path: '/', mode, independentFloors: true, venueSwitch: true, tabReturn: true, reload: true });
      await context.close();
    }
    {
      const { context, page } = await setup(width, times.after);
      await page.goto(base + '/?preview=1');
      for (const stage of [0, 1, 2, 3, 4]) {
        await page.getByRole('button', { name: '상황 바꿔보기' }).click();
        await page.getByLabel('송림본당 개방 단계').selectOption(String(stage));
        await page.getByRole('button', { name: '선택한 상황 보기' }).click();
        await floors(page, ['사용률 확인 전', '사용률 확인 전']);
        if (stage === 2) await screenshot(page, `preview-${width}`);
      }
      await page.getByRole('button', { name: '상황 바꿔보기' }).click();
      await page.getByRole('checkbox', { name: '현황 정보가 오래된 상황' }).check();
      await page.getByRole('button', { name: '선택한 상황 보기' }).click();
      await floors(page, ['사용률 확인 전', '사용률 확인 전']);
      await page.getByRole('button', { name: '서현 · 드림센터', exact: true }).click();
      assert.equal(await page.getByText('3·7·11층', { exact: true }).isVisible(), true);
      await page.getByRole('button', { name: '이매 · 송림본당', exact: true }).click();
      await floors(page, ['사용률 확인 전', '사용률 확인 전']);
      results.push({ width, path: '/?preview=1', stages: [0, 1, 2, 3, 4], stale: true, venueSwitch: true, unknownFloors: true });
      await context.close();
    }
    for (const missing of [false, true]) {
      const { context, page } = await setup(width, times.after, missing);
      await page.goto(base + '/app');
      const expected = missing ? ['확인 필요', '확인 필요'] : ['20% · 이용 가능', '80% · 혼잡'];
      await floors(page, expected);
      assert.equal(await page.locator('.venue').count(), 4);
      assert.equal(await page.locator('.venue--gym .badge, .venue--gym .meta').count(), 0);
      assert.equal(await page.locator('.venue--gym button.pick').count(), 1);
      await page.locator('.phase-switch button').nth(1).click();
      assert.equal(await page.locator('.venue--gym').count(), 0);
      await page.locator('.phase-switch button').nth(0).click();
      await floors(page, expected);
      await page.reload();
      await floors(page, expected);
      if (!missing) await screenshot(page, `legacy-${width}`);
      results.push({ width, path: '/app', missing, afterAndBack: true, reload: true, attendanceNotDuplicated: true });
      await context.close();
    }
  }
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  await writeFile(out + 'results.json', JSON.stringify({ results, writes, errors, synthetic: true }, null, 2));
  console.log(`PASS: ${results.length} mobile path/mode cases; preview stages and stale, independent/unknown floors, zero writes/errors`);
} finally { await browser.close(); }
