import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const prayer = { id: 'prayer-1', kind: 'prayer', text: '우리 가족을 위한 기도', createdAt: '2026-10-05T00:00:00Z', eventDay: '2026-10-05', status: 'pending', version: 3 };
const photo = { ...prayer, id: 'photo-1', kind: 'photo', text: '새벽의 함께한 순간', photoUrl: '/api/community/photo/photo-1' };
function setup(role = 'superadmin', items: unknown[] = [prayer], handlers: { get?: () => Promise<Response>; post?: () => Promise<Response> } = {}) {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (url === '/api/admin/session') return response({ authenticated: true, username: 'owner', role, displayName: '관리자', expiresAt: '2026-10-06T00:00:00Z', sessionId: 'session-1', capabilities: { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false } });
    if (url === '/api/admin/operations') return response({ resources: [], history: [], canManageAccounts: true });
    if (url === '/api/admin/accounts') return response({ accounts: [] });
    if (url === '/api/admin/logout') return response({ authenticated: false });
    if (url === '/api/admin/community') {
      if (init?.method === 'POST') return handlers.post ? handlers.post() : response({});
      return handlers.get ? handlers.get() : response({ items });
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  render(<AdminApp />); return fetch;
}
const posts = (fetch: ReturnType<typeof setup>) => fetch.mock.calls.filter(([url, init]) => url === '/api/admin/community' && init?.method === 'POST');
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('superadmin community moderation', () => {
  it.each(['parking', 'space'])('never requests or exposes moderation for %s', async role => {
    const fetch = setup(role); await screen.findByRole('heading', { name: '현장 운영' });
    expect(screen.queryByRole('heading', { name: '커뮤니티 공개 검토' })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url === '/api/admin/community')).toBe(false);
  });
  it('shows actual photo, text, Korean time and privacy guidance despite legacy false capabilities', async () => {
    const fetch = setup('superadmin', [photo]);
    expect(await screen.findByText(photo.text)).toBeVisible();
    expect(screen.getByAltText('공개 검토용 제출 사진')).toHaveAttribute('src', 'http://localhost/api/community/photo/photo-1');
    expect(screen.getByText(/2026\. 10\. 5\. 오전 9:00/)).toBeVisible();
    expect(screen.getByText(/로그인 없이 누구나 인터넷/)).toBeVisible();
    expect(screen.getByText(/아동·청소년의 공개 동의/)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith('/api/admin/community', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
  });
  it('requires separate review and consent then publication; sends version and refreshes', async () => {
    let reads = 0;
    const fetch = setup('superadmin', [], { get: async () => response({ items: [{ ...prayer, status: reads++ ? 'approved' : 'pending' }] }) });
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: '공개 승인 검토' }));
    expect(posts(fetch)).toHaveLength(0);
    expect(screen.getByRole('button', { name: '확인 후 공개 승인' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ }));
    await user.click(screen.getByRole('button', { name: '확인 후 공개 승인' }));
    expect(await screen.findByRole('button', { name: '공개 철회 및 삭제' })).toBeVisible();
    expect(posts(fetch)).toHaveLength(1);
    expect(posts(fetch)[0][1]).toEqual(expect.objectContaining({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: prayer.id, decision: 'approved', expectedVersion: 3 }) }));
  });
  it('can cancel approval without posting', async () => {
    const fetch = setup(); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: '공개 승인 검토' }));
    await user.click(screen.getByRole('button', { name: '공개 검토 취소' }));
    expect(screen.queryByRole('button', { name: '확인 후 공개 승인' })).not.toBeInTheDocument(); expect(posts(fetch)).toHaveLength(0);
  });
  it.each([
    ['pending', '비공개 처리', 'rejected'], ['approved', '공개 철회 및 삭제', 'deleted'], ['rejected', '비공개 항목 삭제', 'deleted'],
  ])('handles %s privacy action with no optimistic update or duplicate request', async (status, label, decision) => {
    let finish: ((r: Response) => void) | undefined; let reads = 0;
    const fetch = setup('superadmin', [], { get: async () => response({ items: reads++ ? [] : [{ ...prayer, status }] }), post: () => new Promise(resolve => { finish = resolve; }) });
    const user = userEvent.setup(); const button = await screen.findByRole('button', { name: label });
    await user.dblClick(button); expect(button).toBeDisabled(); expect(posts(fetch)).toHaveLength(1);
    expect(screen.getByText(prayer.text)).toBeVisible(); expect(screen.queryByText(/서버 처리 후 최신/)).not.toBeInTheDocument();
    expect(JSON.parse(String(posts(fetch)[0][1]?.body))).toEqual({ id: prayer.id, decision, expectedVersion: 3 });
    await act(async () => finish?.(response({})));
    expect(await screen.findByText('현재 검토 목록에 게시물이 없습니다.')).toBeVisible();
  });
  it('requires fresh GET and new approval confirmation after a 409 conflict', async () => {
    let reads = 0;
    const fetch = setup('superadmin', [], { get: async () => response({ items: [{ ...prayer, version: ++reads + 2 }] }), post: async () => response({ error: 'conflict' }, 409) });
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: '공개 승인 검토' }));
    await user.click(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ })); await user.click(screen.getByRole('button', { name: '확인 후 공개 승인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 관리자가 먼저 변경');
    expect(screen.queryByRole('button', { name: '확인 후 공개 승인' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검토 목록 새로고침' }));
    await user.click(await screen.findByRole('button', { name: '공개 승인 검토' }));
    expect(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ })); await user.click(screen.getByRole('button', { name: '확인 후 공개 승인' }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(2));
    expect(JSON.parse(String(posts(fetch)[1][1]?.body)).expectedVersion).toBe(4);
  });
  it.each([401, 403, 404, 500])('shows GET %s as an error, never empty', async status => {
    setup('superadmin', [], { get: async () => response({ error: 'server_error' }, status) });
    expect(await screen.findByRole('alert')).toHaveTextContent(String(status));
    expect(screen.queryByText('현재 검토 목록에 게시물이 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '팀 계정 관리' })).toBeVisible();
  });
  it.each([401, 403, 500])('does not claim success on POST %s', async status => {
    setup('superadmin', [prayer], { post: async () => response({ error: 'denied' }, status) });
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: '비공개 처리' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(String(status));
    expect(screen.queryByText(/서버 처리 후 최신/)).not.toBeInTheDocument();
    expect(screen.queryByText(prayer.text)).not.toBeInTheDocument();
  });
  it('reports malformed GET rather than empty', async () => {
    setup('superadmin', [], { get: async () => response({ items: [{ ...prayer, version: undefined }] }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('서버 응답 형식');
  });
  it('reports network uncertainty and allows a clean reread', async () => {
    let fail = true; setup('superadmin', [], { get: async () => { if (fail) throw new Error('offline'); return response({ items: [] }); } });
    expect(await screen.findByRole('alert')).toHaveTextContent('offline'); fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: '검토 목록 새로고침' }));
    expect(await screen.findByText('현재 검토 목록에 게시물이 없습니다.')).toBeVisible();
  });
  it('never embeds external image URLs and does not approve unviewable photos', async () => {
    setup('superadmin', [{ ...photo, photoUrl: 'https://outside.example/private.jpg' }, { ...photo, id: 'purged', status: 'rejected', text: '', eventDay: null, photoUrl: undefined }]);
    const article = await screen.findByRole('article', { name: '사진 photo-1' });
    expect(within(article).queryByRole('img')).not.toBeInTheDocument();
    expect(within(article).getByRole('button', { name: '공개 승인 검토' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '비공개 항목 삭제' })).toBeEnabled();
  });
  it('requires a loaded photo and blocks publication if its preview fails', async () => {
    const fetch = setup('superadmin', [photo]); const user = userEvent.setup();
    const image = await screen.findByAltText('공개 검토용 제출 사진');
    expect(screen.getByRole('button', { name: '공개 승인 검토' })).toBeDisabled();
    fireEvent.load(image);
    await user.click(screen.getByRole('button', { name: '공개 승인 검토' }));
    await user.click(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ }));
    fireEvent.error(image);
    expect(screen.getByRole('button', { name: '확인 후 공개 승인' })).toBeDisabled();
    expect(posts(fetch)).toHaveLength(0);
  });
  it('does not resurrect private content when a GET resolves after logout', async () => {
    let finish: ((r: Response) => void) | undefined;
    setup('superadmin', [], { get: () => new Promise(resolve => { finish = resolve; }) });
    await screen.findByRole('heading', { name: '커뮤니티 공개 검토' });
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    await screen.findByRole('heading', { name: '로그인' });
    await act(async () => finish?.(response({ items: [prayer] })));
    expect(screen.queryByText(prayer.text)).not.toBeInTheDocument();
  });
});

it('recognizes reflection separately and requires review before public approval', async () => {
  const fetch = setup('superadmin', [{ ...prayer, id: 'reflection-1', kind: 'reflection', text: '오늘의 묵상', eventDay: 2 }]);
  const user = userEvent.setup();
  expect(await screen.findByText('오늘의 묵상')).toBeVisible();
  expect(screen.getByRole('article', { name: '묵상 reflection-1' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '공개 승인 검토' }));
  expect(posts(fetch)).toHaveLength(0);
  await user.click(screen.getByRole('checkbox', { name: /개인정보와 얼굴/ }));
  await user.click(screen.getByRole('button', { name: '확인 후 공개 승인' }));
  await waitFor(() => expect(posts(fetch)).toHaveLength(1));
  expect(JSON.parse(String(posts(fetch)[0][1]?.body))).toEqual({ id: 'reflection-1', decision: 'approved', expectedVersion: 3 });
});
