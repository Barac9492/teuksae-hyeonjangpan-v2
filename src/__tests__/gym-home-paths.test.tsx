import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion/CompanionApp';
import { PreviewWorshipStatus } from '../features/companion/preview';
import type { Stage } from '../features/companion/preview';
import { TodayBeforeView } from '../features/today-before/TodayBeforeView';
import { LocalAppRepository } from '../data/LocalAppRepository';
import { defaultAppConfig } from '../domain/config';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState({}, '', '/'); });
const reading = (id: string, label: string, percent: number) => ({ id, label, category: 'space', state: percent < 70 ? 'available' : 'busy', occupancyPercent: percent, version: 1, updatedAt: new Date(Date.now()).toISOString() });
const fixture = () => [reading('space.songrim.gym', '체육관', 90), reading('space.songrim.gym.f1', '체육관 1층', 20), reading('space.songrim.gym.f2', '체육관 2층', 80)];
function mock(resources = fixture()) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ enabled: true, resources, items: [] })));
}
function row(name: string) { return screen.getByText(name, { exact: true }).closest('.tc-status-row') as HTMLElement; }

for (const [mode, time] of [['before', '2026-10-07T03:30:00+09:00'], ['worship', '2026-10-07T05:00:00+09:00'], ['after', '2026-10-07T07:00:00+09:00'], ['outside', '2026-10-11T07:00:00+09:00']]) {
  it(`keeps independent floors on the actual home in ${mode} mode and when switching venues/tabs`, async () => {
    window.history.replaceState({}, '', '/');
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(time));
    const fetch = mock(); render(<CompanionApp />);
    await waitFor(() => expect(row('체육관 1층')).toHaveTextContent('20% · 이용 가능'));
    expect(row('체육관 2층')).toHaveTextContent('80% · 혼잡');
    expect(screen.queryByText('90% · 혼잡')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '서현 · 드림센터' }));
    for (const floor of [3, 7, 11]) expect(screen.getByText(`${floor}층`)).toBeVisible();
    expect(screen.queryByText('체육관 1층')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '이매 · 송림본당' }));
    fireEvent.click(screen.getByRole('tab', { name: '주차' }));
    fireEvent.click(screen.getByRole('tab', { name: '예배' }));
    expect(row('체육관 1층')).toHaveTextContent('20% · 이용 가능');
    expect(row('체육관 2층')).toHaveTextContent('80% · 혼잡');
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  });
}

for (const stage of [0, 1, 2, 3, 4] as Stage[]) for (const stale of [false, true]) {
  it(`shows unknown floors instead of a combined gym in preview stage ${stage}, stale=${stale}`, () => {
    render(<PreviewWorshipStatus venue="songrim" stage={stage} stale={stale} />);
    for (const floor of [1, 2]) expect(row(`체육관 ${floor}층`)).toHaveTextContent('사용률 확인 전');
    const names = [...document.querySelectorAll('.tc-status-row > span:first-child')].map(el => el.childNodes[0].textContent);
    expect(names).not.toContain('체육관'); expect(names).not.toContain('본당·체육관');
    expect(screen.queryByText('개방 · 여유')).toBeNull();
  });
}

function LegacyHome() {
  const snapshot = new LocalAppRepository(defaultAppConfig).getSnapshot();
  return <TodayBeforeView config={defaultAppConfig} snapshot={snapshot} onToggleTodayAttendance={() => undefined} onToggleTomorrowAttendance={() => undefined} onSelectVenue={() => undefined} repositoryMode="local" />;
}
it('replaces the legacy home gym aggregate with the same live floor readings without splitting attendance', async () => {
  const fetch = mock(); render(<LegacyHome />);
  await waitFor(() => expect(row('체육관 1층')).toHaveTextContent('20% · 이용 가능'));
  expect(row('체육관 2층')).toHaveTextContent('80% · 혼잡');
  const gym = screen.getByRole('heading', { name: '체육관 층별 현황' }).closest('article')!;
  expect(gym.querySelector('.badge')).toBeNull();
  expect(gym.querySelector('.meta')).toBeNull();
  expect(within(gym).getAllByRole('button')).toHaveLength(1);
  expect(document.querySelectorAll('.venue')).toHaveLength(4);
  expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});
it('keeps legacy-only operational values out of both missing floors on the legacy home', async () => {
  mock([fixture()[0]]); render(<LegacyHome />);
  await screen.findByText('체육관 층별 현황');
  for (const floor of [1, 2]) expect(row(`체육관 ${floor}층`)).toHaveTextContent('확인 필요');
  expect(screen.queryByText('90% · 혼잡')).toBeNull();
  expect(screen.getByText('현장팀 확인 전')).toBeVisible();
});
