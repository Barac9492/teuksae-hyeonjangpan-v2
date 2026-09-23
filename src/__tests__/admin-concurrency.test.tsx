import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const resource = { id: 'parking.songrim', label: '송림본당 주차', category: 'parking', state: 'checking', version: 1, updatedAt: null as string | null };
const identity = (role = 'parking') => ({ authenticated: true, username: 'FIXTURE', role, displayName: '검증자', expiresAt: new Date(Date.now() + 7200000).toISOString(), sessionId: 'S-FIXTURE', capabilities: { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false } });
const data = (row = resource, superadmin = false) => ({ resources: [row], history: [], canManageAccounts: superadmin });
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { promise, resolve }; }
function capturePoll() { let tick: (() => void) | undefined; vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler, delay: number) => { if (delay === 20000) tick = handler as () => void; return 99999; }) as typeof window.setInterval); return async () => { expect(tick).toBeDefined(); await act(async () => { tick?.(); }); }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('processes a committed resource POST and clears pending even when polling runs during the write', async () => {
  const poll = capturePoll(); const post = deferred(); let row = resource; let gets = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (url === '/api/admin/session') return reply(identity());
    if (url === '/api/admin/operations' && init?.method === 'POST') return post.promise;
    if (url === '/api/admin/operations') { gets++; return reply(data(row)); }
    throw new Error('unexpected endpoint');
  });
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('송림본당 주차 상태');
  await user.selectOptions(screen.getByLabelText('송림본당 주차 상태'), 'busy');
  await user.click(screen.getByRole('button', { name: /상태 저장|현황 확인/ }));
  expect(screen.getByLabelText('송림본당 주차 상태')).toBeDisabled();
  await poll(); await waitFor(() => expect(gets).toBe(2));
  row = { ...resource, state: 'busy', version: 2, updatedAt: new Date().toISOString() };
  await act(async () => { post.resolve(reply({ resource: row })); });
  await waitFor(() => expect(screen.getByLabelText('송림본당 주차 상태')).toBeEnabled());
  expect(screen.getByLabelText('송림본당 주차 상태')).toHaveValue('busy');
  expect(screen.getByRole('button', { name: /상태 저장|현황 확인/ })).toBeEnabled();
});

it('retains first-edit version after a newer poll rather than silently rebasing the user draft', async () => {
  const poll = capturePoll(); let gets = 0; let writtenVersion: unknown;
  const newer = { ...resource, state: 'busy', version: 2, updatedAt: new Date().toISOString() };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (url === '/api/admin/session') return reply(identity());
    if (url === '/api/admin/operations' && init?.method === 'POST') { writtenVersion = JSON.parse(String(init.body)).expectedVersion; return reply({ resource: newer }, 409); }
    if (url === '/api/admin/operations') return reply(data(++gets === 1 ? resource : newer));
    throw new Error('unexpected endpoint');
  });
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('송림본당 주차 상태');
  await user.selectOptions(screen.getByLabelText('송림본당 주차 상태'), 'full');
  await poll(); await waitFor(() => expect(gets).toBe(2));
  expect(screen.getByLabelText('송림본당 주차 상태')).toHaveValue('full');
  await user.click(screen.getByRole('button', { name: /상태 저장|현황 확인/ }));
  await waitFor(() => expect(writtenVersion).toBe(1));
  expect(await screen.findByText(/내 입력은 유지되었습니다/)).toBeVisible();
});

it('finishes account creation and resets the form when a poll overlaps its POST', async () => {
  const poll = capturePoll(); const post = deferred(); let accounts: unknown[] = []; let gets = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (url === '/api/admin/session') return reply(identity('superadmin'));
    if (url === '/api/admin/operations') { gets++; return reply(data(resource, true)); }
    if (url === '/api/admin/accounts' && init?.method === 'POST') return post.promise;
    if (url === '/api/admin/accounts') return reply({ accounts });
    throw new Error('unexpected endpoint');
  });
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByRole('heading', { name: '팀 계정 관리' });
  await user.type(screen.getByLabelText('계정 아이디'), 'NEWTEAM');
  await user.type(screen.getByLabelText('표시 이름'), '주차 지원');
  await user.click(screen.getByRole('button', { name: '계정 저장' }));
  await poll(); await waitFor(() => expect(gets).toBe(2));
  const account = { username: 'NEWTEAM', displayLabel: '주차 지원', role: 'parking', active: false, hasPassword: false }; accounts = [account];
  await act(async () => { post.resolve(reply({ account })); });
  expect(await screen.findByText(/계정 설정을 저장했습니다/)).toBeVisible();
  expect(screen.getByRole('button', { name: '계정 저장' })).toBeEnabled();
  expect(screen.getByLabelText('계정 아이디')).toHaveValue('');
});

it('keeps logout effective when an overlapping operations poll resolves afterward', async () => {
  const poll = capturePoll(); const logout = deferred(); const lateRead = deferred(); let gets = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (url === '/api/admin/session') return reply(identity());
    if (url === '/api/admin/logout') return logout.promise;
    if (url === '/api/admin/operations') return ++gets === 1 ? reply(data()) : lateRead.promise;
    throw new Error('unexpected endpoint');
  });
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('송림본당 주차 상태');
  await user.click(screen.getByRole('button', { name: '로그아웃' })); await poll();
  await act(async () => { logout.resolve(reply({ authenticated: false })); });
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeVisible();
  await act(async () => { lateRead.resolve(reply(data())); });
  expect(screen.queryByRole('heading', { name: '현장 운영' })).not.toBeInTheDocument();
});
