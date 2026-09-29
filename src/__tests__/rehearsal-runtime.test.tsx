import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RuntimeProvider } from '../features/rehearsal/RuntimeProvider';
import { RehearsalBanner } from '../features/rehearsal/RehearsalBanner';
import { RehearsalReset } from '../features/rehearsal/RehearsalReset';
import { RuntimeContext, runtimeStorageKey, setStorageNamespace } from '../features/rehearsal/runtime';
import type { Runtime } from '../features/rehearsal/runtime';
import { Community } from '../features/companion/Community';
import { RECEIPTS_KEY, readReceipts, saveReceipt, communityRequest } from '../features/companion/communityClient';
import { LiveParkingPanel } from '../features/companion/LiveOperations';
const runtime: Runtime = { rehearsal: true, eventDay: 0, setEventDay: () => undefined, managed: false, status: null, offline: false, lastSync: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); setStorageNamespace(false); localStorage.clear(); window.history.replaceState({}, '', '/'); });
it('fails closed on runtime failure, including a rehearsal query flag', async () => {
  window.history.replaceState({}, '', '/?rehearsal=1');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<RuntimeProvider><div>private child</div></RuntimeProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('안전');
  expect(screen.queryByText('private child')).not.toBeInTheDocument();
});
it('defaults absent server flag to live even before the event and ignores URL flag', async () => {
  window.history.replaceState({}, '', '/?rehearsal=1');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, resources: [] }) }));
  render(<RuntimeProvider><RehearsalBanner publicView /><div>ready</div></RuntimeProvider>);
  await screen.findByText('ready');
  expect(screen.queryByLabelText('리허설 안내')).not.toBeInTheDocument();
});
it('shows six content days only with authoritative rehearsal response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, resources: [], rehearsal: true, rehearsalUntil: '2026-10-05T00:00:00+09:00' }) }));
  render(<RuntimeProvider><RehearsalBanner publicView /></RuntimeProvider>);
  expect(await screen.findByText('리허설 · 실제 현장 안내가 아닙니다')).toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(6);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } });
  expect(screen.getByRole('combobox')).toHaveValue('5');
  expect(runtimeStorageKey('draft')).toBe('draft:rehearsal');
});
it('never carries browser receipts between namespaces including in-memory receipts', () => {
  setStorageNamespace(true); saveReceipt({ id: 'test', kind: 'prayer', token: 'test-token' });
  expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull();
  setStorageNamespace(false); expect(readReceipts()).toEqual([]);
  saveReceipt({ id: 'real', kind: 'prayer', token: 'real-token' });
  setStorageNamespace(true); expect(readReceipts().map(r => r.id)).toEqual(['test']);
  setStorageNamespace(false); expect(readReceipts().map(r => r.id)).toEqual(['real']);
});
it('enables pre-event walls and photo counts in rehearsal', async () => {
  vi.setSystemTime(new Date('2026-09-29T05:00:00+09:00'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, items: [{ id: 'photo', kind: 'photo', text: '테스트 사진', eventDay: 0 }], photoCountToday: 3, today: '2026-09-29' }) }));
  render(<RuntimeContext.Provider value={runtime}><Community kind="photo" text="" payloadKey="" showComposer={false} /></RuntimeContext.Provider>);
  expect(await screen.findByText('오늘 사진 참여 3건')).toBeInTheDocument();
  expect(screen.getByText('테스트 사진')).toBeInTheDocument();
  expect(screen.queryByText('공개 나눔은 10월 5일부터 시작합니다.')).not.toBeInTheDocument();
});
it('uses real timestamps for rehearsal freshness and permits rehearsal history', () => {
  const now = Date.parse('2026-09-29T05:00:00+09:00');
  const ops = { rehearsal: true, enabled: true, offline: false, confirmed: true, lastSync: now, now, resources: ['parking.songrim', 'parking.calvary'].map((id, i) => ({ id, label: id, category: 'parking' as const, state: 'full' as const, version: 1, updatedAt: new Date(now - (i ? 11 : 1) * 60000).toISOString(), occupancyPercent: 100, previousDay: { date: '2026-09-28', firstFullAt: '2026-09-28T04:30:00+09:00', closedAt: null } })) };
  render(<LiveParkingPanel venue="songrim" setVenue={() => undefined} operations={ops} />);
  expect(screen.getAllByText('100%')).toHaveLength(1);
  expect(screen.getByText('확인 필요')).toBeInTheDocument();
  expect(screen.getAllByText(/9\/28|09\/28/).length).toBeGreaterThan(0);
});
it('requires server permission, exact confirmation and supports cancel', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rehearsal: true, canReset: true }) }); vi.stubGlobal('fetch', fetcher);
  render(<RuntimeContext.Provider value={runtime}><RehearsalReset /></RuntimeContext.Provider>);
  await waitFor(() => expect(screen.getByText('리허설 데이터 초기화')).toBeEnabled());
  fireEvent.click(screen.getByText('리허설 데이터 초기화'));
  expect(screen.getByText('테스트 데이터 삭제 확정')).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '리허설 초기화' } });
  expect(screen.getByText('테스트 데이터 삭제 확정')).toBeEnabled();
  fireEvent.click(screen.getByText('취소'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('sends the server-selected namespace on every community mutation, including receipt checks', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'pending' }) }); vi.stubGlobal('fetch', f);
  setStorageNamespace(true); await communityRequest({ action: 'status', id: 'fixture' });
  expect(f.mock.calls[0][1].headers['X-Woori-Mode']).toBe('rehearsal');
  setStorageNamespace(false); await communityRequest({ action: 'delete', id: 'fixture' });
  expect(f.mock.calls[1][1].headers['X-Woori-Mode']).toBe('live');
});
it('never reports a reset success for malformed server confirmation', async () => {
  const f = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ rehearsal: true, canReset: true }) }).mockResolvedValueOnce({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', f);
  render(<RuntimeContext.Provider value={runtime}><RehearsalReset /></RuntimeContext.Provider>);
  await waitFor(() => expect(screen.getByText('리허설 데이터 초기화')).toBeEnabled());
  fireEvent.click(screen.getByText('리허설 데이터 초기화'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '리허설 초기화' } });
  fireEvent.click(screen.getByText('테스트 데이터 삭제 확정'));
  expect(await screen.findByRole('status')).toHaveTextContent('초기화하지 못했습니다');
});
