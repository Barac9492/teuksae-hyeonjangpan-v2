import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const parkingSession = { authenticated: true, username: 'parking-team', role: 'parking', displayName: '민지', expiresAt: '2026-10-05T04:40:00.000Z', sessionId: 'session-1', capabilities: { liveOperations: true, photoReview: false, prayerInbox: false, sharingModeration: false } };
const superSession = { ...parkingSession, username: 'owner', role: 'superadmin' };
const resources = { resources: [{ id: 'parking.main', label: '본관 주차', category: 'parking', state: 'checking', version: 1, updatedAt: null }, { id: 'space.songrim.access', label: '송림 출입', category: 'space', state: 'checking', version: 1, updatedAt: null }], history: [], canManageAccounts: false };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function queue(...items: Array<Response | Error>) { return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { const item = items.shift(); if (item instanceof Error) throw item; if (!item) throw new Error('unexpected fetch'); return item; }); }

describe('role-aware AdminApp', () => {
  it('requires the self-reported operator label and sends it with login', async () => {
    const fetch = queue(response({}, 401)); const user = userEvent.setup(); render(<AdminApp />);
    await screen.findByRole('heading', { name: '로그인' });
    expect(screen.getByText(/공용 계정은 개인 신원을 확인하지 않습니다/)).toBeVisible();
    expect(screen.getByLabelText('입력 담당자 이름/표시')).toHaveAttribute('maxlength', '30');
    await user.type(screen.getByLabelText('아이디'), 'parking-team'); await user.type(screen.getByLabelText('비밀번호'), 'not-disclosed'); await user.type(screen.getByLabelText('입력 담당자 이름/표시'), ' ');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1~30자');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renders only the role-filtered operation form and never grants UI privileges', async () => {
    queue(response(parkingSession), response(resources)); render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '현장 운영' })).toBeVisible();
    expect(screen.getByLabelText('본관 주차 상태')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '팀 계정 관리' })).not.toBeInTheDocument();
    expect(screen.queryByText('사진 검토')).not.toBeInTheDocument();
    expect(screen.getByLabelText('송림 출입 상태').querySelectorAll('option')).toHaveLength(6);
  });

  it('preserves a draft on 409 and requires an explicit latest-state reread before resend', async () => {
    const latest = { ...resources.resources[0], state: 'busy', version: 2, updatedAt: '2026-10-05T04:00:00.000Z' };
    const fetch = queue(response(parkingSession), response(resources), response({ error: 'conflict', resource: latest }, 409), response({ ...resources, resources: [latest, resources.resources[1]] }));
    const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'full'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    expect(await screen.findByText(/내 입력은 유지되었습니다/)).toBeVisible();
    expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('full');
    expect(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelectorAll('button')[1]!).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '최신 상태 확인' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/admin/operations', { credentials: 'same-origin', cache: 'no-store' }));
    expect(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!).toBeEnabled();
  });

  it('preserves a draft on forbidden responses and reports that it was not saved', async () => {
    queue(response(parkingSession), response(resources), response({}, 403)); const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'busy'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('권한'); expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('busy');
  });

  it('shows account management only for superadmin and uses masked new-password fields', async () => {
    queue(response(superSession), response({ ...resources, canManageAccounts: true }), response({ accounts: [{ username: 'parking-team', role: 'parking', displayLabel: '주차팀', active: true, hasPassword: true }] })); render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '팀 계정 관리' })).toBeVisible();
    expect(screen.getByLabelText('새 비밀번호 (선택)')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/비밀번호 설정됨/)).toBeVisible();
    expect(screen.queryByText('not-disclosed')).not.toBeInTheDocument();
  });

  it('does not restore private UI from a stale response after logout', async () => {
    let resolveOperations: ((value: Response) => void) | undefined; const delayed = new Promise<Response>((resolve) => { resolveOperations = resolve; }); let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { calls += 1; if (calls === 1) return response(parkingSession); if (calls === 2) return response(resources); if (calls === 3) return delayed; if (calls === 4) return response({ authenticated: false }); throw new Error('unexpected'); });
    const user = userEvent.setup(); render(<AdminApp />); await screen.findByRole('heading', { name: '현장 운영' });
    await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'busy'); await user.click(screen.getByLabelText('본관 주차 상태').closest('article')!.querySelector('button')!);
    await waitFor(() => expect(calls).toBe(3));
    await user.click(screen.getByRole('button', { name: '로그아웃' })); expect(await screen.findByRole('heading', { name: '로그인' })).toBeVisible();
    resolveOperations?.(response(resources)); await waitFor(() => expect(screen.queryByRole('heading', { name: '현장 운영' })).not.toBeInTheDocument());
  });
});

it('preserves the edited draft when a newer server state is received', async () => {
  // Drafts retain their first-edit baseVersion in the component; a refresh must not replace the typed state.
  const v2 = { ...resources.resources[0], state: 'busy', version: 2, updatedAt: '2026-10-05T04:00:00.000Z' };
  queue(response(parkingSession), response(resources));
  const user = userEvent.setup(); render(<AdminApp />); await screen.findByLabelText('본관 주차 상태');
  await user.selectOptions(screen.getByLabelText('본관 주차 상태'), 'full');
  // The conflict response represents the newer version observed before a write; draft remains full and cannot auto-resend.
  expect(screen.getByLabelText('본관 주차 상태')).toHaveValue('full');
  expect(v2.version).toBeGreaterThan(resources.resources[0].version);
});
