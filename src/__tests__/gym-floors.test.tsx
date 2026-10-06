import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
import { LiveWorshipStatus, useLiveOperations } from '../features/companion/LiveOperations';
import { entranceFingerprint, entranceWarnings } from '../features/admin/entranceConsistency';
const now = Date.parse('2026-10-07T04:00:00+09:00');
const legacy = { id: 'space.songrim.gym', label: '체육관', category: 'space', state: 'busy', occupancyPercent: 90, version: 38, updatedAt: new Date(now).toISOString() };
const floor = (n: number, state = 'checking', percent: number | null = null) => ({ ...legacy, id: `space.songrim.gym.f${n}`, label: `체육관 ${n}층`, state, occupancyPercent: percent, version: percent === null ? 0 : 1, updatedAt: percent === null ? null : legacy.updatedAt });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Public() { return <LiveWorshipStatus venue="songrim" operations={useLiveOperations()} />; }
function mock(resources: unknown[]) {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith('/session') ? { authenticated: true, username: 'SYNTHETIC', role: 'space', displayName: '합성 검증', expiresAt: '2030-01-01', sessionId: 'fixture', capabilities: { liveOperations: true } } : { enabled: true, resources, publicResources: resources, history: [], canManageAccounts: false })));
}
it('does not copy a confirmed legacy estimate into missing floors or count it as a displayed fresh reading', async () => {
  mock([legacy]); render(<Public />);
  for (const n of [1, 2]) {
    const row = (await screen.findByText(`체육관 ${n}층`)).closest('.tc-status-row')!;
    expect(within(row as HTMLElement).getByText('확인 필요')).toBeVisible();
    expect(within(row as HTMLElement).getByText('아직 확인 기록 없음')).toBeVisible();
  }
  expect(screen.queryByText('90% · 혼잡')).toBeNull();
  expect(screen.getByText('현장팀 확인 전')).toBeVisible();
});
it('shows only independently confirmed floors while a second floor remains unknown', async () => {
  mock([legacy, floor(1, 'available', 20), floor(2)]); render(<Public />);
  expect(await screen.findByText('20% · 이용 가능')).toBeVisible();
  expect(screen.queryByText('90% · 혼잡')).toBeNull();
  expect(within(screen.getByText('체육관 2층').closest('.tc-status-row') as HTMLElement).getByText('확인 필요')).toBeVisible();
});
it('hides the legacy admin input and disclosure row while explaining a missing migration', async () => {
  mock([legacy]); render(<AdminApp />);
  expect(await screen.findByText(/체육관 층별 현황 준비 중/)).toBeVisible();
  expect(screen.queryByLabelText('체육관 사용률·상태')).toBeNull();
  expect(screen.queryByRole('rowheader', { name: '체육관' })).toBeNull();
  expect(screen.getByText('전체 공개 항목 0개 · 최근 10분 내 확인 0개')).toBeVisible();
});
it('shows two unselected admin floor inputs, neither save enabled, and excludes legacy aggregate from counts', async () => {
  mock([legacy, floor(1), floor(2)]); render(<AdminApp />);
  for (const n of [1, 2]) {
    const select = await screen.findByLabelText(`체육관 ${n}층 사용률·상태`);
    expect(select).toHaveValue('unselected');
    expect(within(select.closest('article')!).getByRole('button')).toBeDisabled();
  }
  expect(screen.getByText('전체 공개 항목 2개 · 최근 10분 내 확인 0개')).toBeVisible();
  expect(screen.queryByLabelText('체육관 사용률·상태')).toBeNull();
});
it('checks each floor against the entry stage and invalidates acknowledgement when either floor changes', () => {
  const readings = [{ ...legacy, id: 'space.songrim.access', state: 'closed' }, legacy, floor(1, 'available', 20), floor(2, 'busy', 80)];
  const warnings = entranceWarnings(readings);
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toContain('체육관 1층'); expect(warnings[1]).toContain('체육관 2층');
  const key = entranceFingerprint(readings, 'space.songrim.access', 'gym_open', null);
  for (const n of [1, 2]) expect(entranceFingerprint(readings.map(r => r.id === `space.songrim.gym.f${n}` ? { ...r, version: r.version + 1 } : r), 'space.songrim.access', 'gym_open', null)).not.toBe(key);
  expect(entranceWarnings([readings[0], legacy, floor(1), floor(2)])).toEqual([]);
});
