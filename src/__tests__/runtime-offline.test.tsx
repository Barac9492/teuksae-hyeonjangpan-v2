import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';
import { RuntimeProvider } from '../features/rehearsal/RuntimeProvider';
import { useRuntime } from '../features/rehearsal/runtime';
import type { Runtime } from '../features/rehearsal/runtime';

const now = Date.parse('2026-10-06T04:10:00+09:00');
const status = (version = 1) => ({ enabled: true, resources: [{ id: 'space.songrim.hall', category: 'space', state: 'available', version, updatedAt: new Date(now).toISOString() }] });
const response = (body: unknown) => ({ ok: true, json: async () => body });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
function delayed(phase: 'transport' | 'body') {
  const transport = deferred<ReturnType<typeof response>>();
  const body = deferred<unknown>();
  return {
    start: () => phase === 'transport' ? transport.promise : Promise.resolve({ ok: true, json: () => body.promise }),
    resolve: (version: number) => phase === 'transport' ? transport.resolve(response(status(version))) : body.resolve(status(version)),
    reject: () => phase === 'transport' ? transport.reject(new Error('late transport error')) : body.reject(new Error('late body error')),
  };
}
const flush = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const online = (value: boolean) => { vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value); };
const disconnect = () => { online(false); fireEvent(window, new Event('offline')); };
const reconnect = () => { online(true); fireEvent(window, new Event('online')); };
const refresh = () => fireEvent(document, new Event('visibilitychange'));
function Probe() {
  const runtime = useRuntime();
  return <output data-testid="runtime">{JSON.stringify(runtime)}</output>;
}
const snapshot = () => JSON.parse(screen.getByTestId('runtime').textContent!) as Runtime;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); online(true);
  localStorage.clear(); window.history.replaceState({}, '', '/');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('production runtime offline safety', () => {
  it('immediately removes current live claims in the production wrapper on disconnect', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/status') return response(status());
      if (url.startsWith('/api/community?')) return response({ enabled: true, items: [], photoCountToday: 0 });
      throw new Error(`Unexpected endpoint: ${url}`);
    }));
    render(<StrictMode><RuntimeProvider><CompanionApp /><Probe /></RuntimeProvider></StrictMode>);
    await flush();
    expect(screen.getByText('이용 가능')).toBeVisible();
    expect(screen.getByText('현장팀 확인 현황')).toBeVisible();
    const confirmed = snapshot();
    disconnect();
    expect(screen.queryByText('이용 가능')).not.toBeInTheDocument();
    expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: '예배' })).getByText('연결 확인 중')).toBeVisible();
    expect(snapshot()).toMatchObject({ offline: true, status: confirmed.status, lastSync: confirmed.lastSync });
    expect(screen.getByRole('tab', { name: '사진' })).toBeEnabled();
  });

  it.each(['transport', 'body'] as const)('ignores late %s while offline and avoids offline polling', async phase => {
    const old = delayed(phase); const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return signals.length === 1 ? response(status()) : signals.length === 2 ? old.start() : response(status(3));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RuntimeProvider><Probe /></RuntimeProvider>); await flush();
    const confirmed = snapshot();
    refresh(); await flush(); disconnect(); await flush();
    expect(signals[1].aborted).toBe(true);
    await tick(20_000); expect(fetchMock).toHaveBeenCalledTimes(2);
    old.resolve(2); await flush();
    expect(snapshot()).toMatchObject({ offline: true, status: confirmed.status, lastSync: confirmed.lastSync });
    reconnect(); await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot()).toMatchObject({ offline: false, status: status(3), lastSync: now + 20_000 });
  });

  it.each(['transport', 'body'] as const)('reconnects immediately despite a stuck old %s and keeps pending ownership', async phase => {
    const old = delayed(phase), fresh = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(status()))
      .mockImplementationOnce(old.start)
      .mockReturnValueOnce(fresh.promise)
      .mockResolvedValue(response(status(4)));
    vi.stubGlobal('fetch', fetchMock);
    render(<RuntimeProvider><Probe /></RuntimeProvider>); await flush();
    refresh(); await flush();
    // A quick disconnect/reconnect must not wait for a transport that ignores abort.
    act(() => { disconnect(); reconnect(); }); await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot()).toMatchObject({ offline: true, status: status() });
    old.resolve(2); await flush();
    expect(snapshot()).toMatchObject({ offline: true, status: status(), lastSync: now });
    refresh(); await flush(); expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.setSystemTime(now + 1_000);
    fresh.resolve(response(status(3))); await flush();
    expect(snapshot()).toMatchObject({ offline: false, status: status(3), lastSync: now + 1_000 });
    refresh(); await flush();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot().status).toEqual(status(4));
  });

  it.each([
    ['transport', 'resolve'], ['transport', 'reject'], ['body', 'resolve'], ['body', 'reject'],
  ] as const)('ignores a superseded %s %s after the fresh reconnect response', async (phase, outcome) => {
    const old = delayed(phase);
    const fetchMock = vi.fn().mockResolvedValueOnce(response(status())).mockImplementationOnce(old.start).mockResolvedValue(response(status(3)));
    vi.stubGlobal('fetch', fetchMock);
    render(<RuntimeProvider><Probe /></RuntimeProvider>); await flush();
    refresh(); await flush(); disconnect(); reconnect(); await flush();
    expect(snapshot()).toMatchObject({ offline: false, status: status(3) });
    const fresh = snapshot();
    vi.setSystemTime(now + 1_000);
    if (outcome === 'resolve') old.resolve(2); else old.reject();
    await flush(); expect(snapshot()).toEqual(fresh);
  });

  it.each(['transport', 'body'] as const)('bounds a hung %s to eight seconds and releases polling without trusting its late result', async phase => {
    const old = delayed(phase); const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return signals.length === 1 ? old.start() : response(status(3));
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<RuntimeProvider><Probe /><div>사진 미리보기</div></RuntimeProvider>); await flush();
    expect(snapshot()).toMatchObject({ managed: true, rehearsal: false, offline: false, status: null, lastSync: null });
    expect(screen.getByText('사진 미리보기')).toBeVisible();
    await tick(7_999); expect(snapshot().offline).toBe(false);
    await tick(1); expect(snapshot()).toMatchObject({ offline: true, status: null, lastSync: null });
    expect(signals[0].aborted).toBe(true);
    await tick(12_000); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot()).toMatchObject({ offline: false, status: status(3), lastSync: now + 20_000 });
    old.resolve(2); await flush(); expect(snapshot().status).toEqual(status(3));
    view.unmount(); await flush(); expect(vi.getTimerCount()).toBe(0);
  });

  it('starts offline without fetching, then requires a successful response to restore current status', async () => {
    online(false);
    const fresh = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn().mockReturnValue(fresh.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<RuntimeProvider><Probe /><div>사진 미리보기</div></RuntimeProvider>); await flush();
    expect(snapshot()).toMatchObject({ managed: true, rehearsal: false, offline: true, status: null, lastSync: null });
    await tick(20_000); refresh(); await flush(); expect(fetchMock).not.toHaveBeenCalled();
    reconnect(); await flush(); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot().offline).toBe(true); expect(screen.getByText('사진 미리보기')).toBeVisible();
    fresh.resolve(response({ enabled: false, resources: [] })); await flush();
    expect(snapshot()).toMatchObject({ offline: false, status: { enabled: false, resources: [] }, lastSync: now + 20_000 });
  });

  it.each(['transport', 'body'] as const)('aborts a pending %s on unmount and removes timers and event listeners', async phase => {
    const old = delayed(phase); let signal!: AbortSignal;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => { signal = init.signal as AbortSignal; return old.start(); });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<RuntimeProvider><Probe /></RuntimeProvider>); await flush();
    view.unmount(); await flush(); expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    disconnect(); reconnect(); refresh(); await tick(20_000);
    old.resolve(2); await flush(); expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

});
