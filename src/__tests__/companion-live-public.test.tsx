import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';
import { liveEventDay } from '../features/companion/CompanionApp';

const eventNow = Date.parse('2026-10-06T04:40:00+09:00');
const fresh = new Date(eventNow).toISOString();
const communityReply = () => Promise.resolve({ ok: true, json: async () => ({ enabled: true, items: [], photoCountToday: 0, today: '2026-09-24' }) });
const routeFetch = (statusReply: () => ReturnType<typeof reply>) => vi.fn((input: unknown) => {
  if (input === '/api/status') return statusReply();
  if (String(input).startsWith('/api/community?kind=')) return communityReply();
  throw new Error('Unexpected endpoint: ' + String(input));
});
const reply = (resources: unknown[], enabled = true, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve({ enabled, resources }) });

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(eventNow);
  window.history.replaceState({}, '', '/');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public companion live operations', () => {
  it('reads only public staff values and keeps Songrim access, hall, and gym independent', async () => {
    const fetchMock = routeFetch(() => reply([
      { id: 'space.songrim.access', label: '학교 출입', category: 'space', state: 'school_open', version: 2, updatedAt: fresh },
      { id: 'space.songrim.hall', label: '본당 1·2층', category: 'space', state: 'full', version: 2, updatedAt: fresh },
      { id: 'space.songrim.gym', label: '체육관', category: 'space', state: 'available', version: 2, updatedAt: fresh },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    render(<CompanionApp />);
    await waitFor(() => expect(screen.getByText('학교 개방')).toBeVisible());
    expect(screen.getByText('입장 마감')).toBeVisible();
    expect(screen.getByText('이용 가능')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/status', expect.anything());
    expect(screen.queryByText('현장 현황 시범 운영')).not.toBeInTheDocument();
    expect(screen.queryByText(/교회 공식 앱 승인 전 공개 안내/)).not.toBeInTheDocument();
    expect(screen.queryByText('방금 확인')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '행사 포스터' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '분당우리교회' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '상황 바꿔보기' })).not.toBeInTheDocument();
    expect(screen.queryByText('운영자')).not.toBeInTheDocument();
  });

  it('shows checking, not seeded example states, for an enabled empty response and unavailable API', async () => {
    const statusReply = vi.fn().mockImplementationOnce(() => reply([])).mockImplementationOnce(() => reply([], false, false));
    const fetchMock = routeFetch(statusReply);
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<CompanionApp />);
    await waitFor(() => expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0));
    expect(screen.getAllByText('현장팀 확인 전')[0]).toBeVisible();
    view.unmount();
    render(<CompanionApp />);
    await waitFor(() => expect(screen.getAllByText('현장팀 확인 전')[0]).toBeVisible());
    expect(screen.queryByText('개방 · 여유')).not.toBeInTheDocument();
  });

  it('fails closed when a staff update is stale and shows independent Dream floors and parking levels', async () => {
    const stale = new Date(Date.now() - 11 * 60_000).toISOString();
    vi.stubGlobal('fetch', routeFetch(() => reply([
      { id: 'space.dream.f3', label: '3층', category: 'space', state: 'available', version: 1, updatedAt: stale },
      { id: 'space.dream.f7', label: '7층', category: 'space', state: 'busy', version: 1, updatedAt: fresh },
      { id: 'space.dream.f11', label: '11층', category: 'space', state: 'full', version: 1, updatedAt: fresh },
      { id: 'parking.dream.b1', label: 'B1', category: 'parking', state: 'full', version: 1, updatedAt: fresh },
      { id: 'parking.dream.b2', label: 'B2', category: 'parking', state: 'available', version: 1, updatedAt: fresh },
    ])));
    const user = userEvent.setup();
    render(<CompanionApp />);
    await user.click(screen.getByRole('button', { name: '서현 · 드림센터' }));
    await waitFor(() => expect(screen.getByText(/확인 \(한국 시간\) · 마지막 확인 후 10분 경과/)).toBeVisible());
    expect(screen.getAllByText('확인 필요')[0]).toBeVisible();
    expect(within(screen.getByRole('tabpanel', { name: '예배' })).queryByText('이용 가능')).not.toBeInTheDocument();
    expect(screen.getByText('혼잡')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '주차' }));
    expect(screen.getByText('B1')).toBeVisible();
    expect(screen.getByText('B5')).toBeVisible();
    expect(within(screen.getByRole('tabpanel', { name: '주차' })).getByText('만차')).toBeVisible();
  });

  it.each(['2026-10-04T14:59:59Z', '2026-10-06T00:00:00Z', '2026-10-05T18:00:00Z'])('does not claim a confirmed live banner for invalid freshness %s', async (updatedAt) => {
    vi.stubGlobal('fetch', routeFetch(() => reply([{ id: 'space.songrim.hall', category: 'space', state: 'available', version: 1, updatedAt }])));
    render(<CompanionApp />);
    await waitFor(() => expect(screen.getAllByText('현장팀 확인 전')[0]).toBeVisible());
    expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
    expect(screen.queryByText('이용 가능')).not.toBeInTheDocument();
  });

  it('uses the Seoul event day only during October 5 through 10', () => {
    expect(liveEventDay(new Date('2026-10-04T14:59:00Z'))).toBeNull();
    expect(liveEventDay(new Date('2026-10-04T15:00:00Z'))).toBe(0);
    expect(liveEventDay(new Date('2026-10-05T15:00:00Z'))).toBe(1);
  });

  it('polls every 20 seconds and labels an offline connection without reusing a live claim', async () => {
    vi.useFakeTimers();
    const fetchMock = routeFetch(() => reply([{ id: 'parking.songrim', label: '송림본당 주차', category: 'parking', state: 'available', version: 1, updatedAt: fresh }]));
    vi.stubGlobal('fetch', fetchMock);
    render(<CompanionApp />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/status')).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/status')).toHaveLength(2);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getAllByText('연결 확인 중')[0]).toBeVisible();
    expect(within(screen.getByRole('tabpanel', { name: '예배' })).queryByText('이용 가능')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
