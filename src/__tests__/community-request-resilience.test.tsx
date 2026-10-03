import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import { CommunityModeration } from '../features/admin/CommunityModeration';
import { RECEIPTS_KEY } from '../features/companion/communityClient';
import { REQUEST_TIMEOUT_MS, requestWithDeadline } from '../lib/requestDeadline';

const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' };
const approved = { id: 'synthetic-public', kind: 'prayer', text: 'Synthetic approved prayer', eventDay: null, createdAt: '2026-10-01T00:00:00Z' };
const adminItem = { ...approved, status: 'approved', version: 3 };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const flush = async () => { await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); }); };
const deferred = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
const never = () => new Promise<Response>(() => {});
let sequence = 0;
const props = () => ({ kind: 'prayer' as const, text: 'Synthetic test only', payloadKey: `resilience-${++sequence}`, defaultPublic: true });
const submit = () => screen.getByRole('button', { name: '기도제목 공개로 올리기' });
const records = () => fireEvent.click(screen.getByText(/내 제출 기록 \(/));
const recordButton = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;
const tick = async (ms = REQUEST_TIMEOUT_MS) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bounded community transport', () => {
  it('times out body decoding and aborts even when the transport ignores cancellation', async () => {
    let signal!: AbortSignal;
    const request = requestWithDeadline(async current => { signal = current; return new Promise(() => {}); });
    const check = expect(request).rejects.toThrow('처리 결과는 아직 확인되지');
    await tick(); await check; expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not start an operation that was already cancelled and removes deadline timers', async () => {
    const controller = new AbortController(); controller.abort(); const operation = vi.fn();
    await expect(requestWithDeadline(operation, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(operation).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    await expect(requestWithDeadline(async () => 'ok')).resolves.toBe('ok'); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('public feed freshness and cancellation', () => {
  it('ignores an older populated GET after a newer empty GET and aborts the superseded request', async () => {
    const old = deferred(), newer = deferred(); let reads = 0; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => { signals.push(init.signal as AbortSignal); return ++reads === 1 ? response({ ...feed, items: [approved] }) : reads === 2 ? old.promise : newer.promise; }));
    render(<Community {...props()} showComposer={false} />); await flush(); expect(screen.getByText(approved.text)).toBeVisible();
    fireEvent(document, new Event('visibilitychange')); await flush();
    fireEvent(document, new Event('visibilitychange')); await flush();
    expect(signals[1].aborted).toBe(true);
    newer.resolve(response(feed)); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    old.resolve(response({ ...feed, items: [approved] })); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('hides a stale feed after the deadline and never accumulates overlapping polls in ten minutes', async () => {
    let reads = 0, inflight = 0, maximum = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (++reads === 1) return response({ ...feed, items: [approved] });
      inflight++; maximum = Math.max(maximum, inflight);
      init.signal?.addEventListener('abort', () => inflight--, { once: true }); return never();
    }));
    render(<Community {...props()} showComposer={false} />); await flush();
    await tick(30_000 + REQUEST_TIMEOUT_MS);
    expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('이전 게시물과 참여 건수를 숨겼어요');
    await tick(600_000); expect(maximum).toBe(1); expect(inflight).toBeLessThanOrEqual(1);
    expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
  });
  it('times out a response whose JSON body never settles and does not restore it later', async () => {
    let finish!: (body: unknown) => void; let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return { ok: true, status: 200, json: () => new Promise(resolve => { finish = resolve; }) };
    }));
    render(<Community {...props()} showComposer={false} />); await flush(); await tick();
    expect(signal.aborted).toBe(true); expect(screen.getByRole('alert')).toBeVisible();
    finish({ ...feed, items: [approved] }); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
  });
  it('cancels hidden-tab reads, clears the snapshot, and fetches anew on return', async () => {
    let visibility: DocumentVisibilityState = 'visible'; vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    let reads = 0; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => { signals.push(init.signal as AbortSignal); return ++reads === 1 ? response({ ...feed, items: [approved] }) : reads === 2 ? never() : response(feed); }));
    render(<Community {...props()} showComposer={false} />); await flush(); await tick(30_000);
    visibility = 'hidden'; fireEvent(document, new Event('visibilitychange')); await flush();
    expect(signals[1].aborted).toBe(true); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    await tick(90_000); expect(reads).toBe(2);
    visibility = 'visible'; fireEvent(document, new Event('visibilitychange')); await flush(); expect(reads).toBe(3);
  });
  it('ignores a previous kind response after tab change and cancels all reads on unmount', async () => {
    const old = deferred(); const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init: RequestInit) => { signals.push(init.signal as AbortSignal); return String(url).includes('prayer') ? old.promise : response(feed); }));
    const view = render(<Community {...props()} showComposer={false} />); await flush();
    view.rerender(<Community kind="photo" text="" payloadKey="new-tab" showComposer={false} />); await flush();
    expect(signals[0].aborted).toBe(true); old.resolve(response({ ...feed, photoCountToday: 99, items: [approved] })); await flush();
    expect(screen.getByText('오늘 사진 참여 0건')).toBeVisible(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('recoverable public mutations', () => {
  it('unlocks a never-settling POST, keeps its capability, and retries the same committed request without duplicates', async () => {
    const posts: Record<string, unknown>[] = []; const signals: AbortSignal[] = []; const committed = new Set();
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'GET') return response(feed);
      const body = JSON.parse(String(init.body)); posts.push(body); signals.push(init.signal as AbortSignal); committed.add(body.requestId);
      expect(JSON.parse(localStorage.getItem(RECEIPTS_KEY)!)).toEqual(expect.arrayContaining([expect.objectContaining({ id: body.requestId, token: body.deleteToken })]));
      return posts.length === 1 ? never() : response({ id: body.requestId, status: 'pending' });
    }));
    render(<Community {...props()} />); await flush(); const button = submit(); fireEvent.click(button); fireEvent.click(button); await flush();
    expect(posts).toHaveLength(1); await tick(); expect(signals[0].aborted).toBe(true); expect(submit()).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('처리 결과는 아직 확인되지'); records();
    expect(recordButton('상태 확인')).toBeEnabled(); expect(recordButton('제출 철회·삭제')).toBeEnabled();
    fireEvent.click(submit()); await flush(); expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1]); expect(committed.size).toBe(1);
    expect(screen.getByRole('button', { name: '접수 완료' })).toBeDisabled();
  });
  it('retains uncertain request identity across unmount/remount and ignores the cancelled completion', async () => {
    const config = props(), old = deferred(); const posts: Record<string, unknown>[] = []; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'GET') return response(feed);
      const body = JSON.parse(String(init.body)); posts.push(body); signals.push(init.signal as AbortSignal);
      return posts.length === 1 ? old.promise : response({ id: body.requestId, status: 'deleted' });
    }));
    const view = render(<Community {...config} />); await flush(); fireEvent.click(submit()); await flush(); view.unmount(); expect(signals[0].aborted).toBe(true);
    render(<Community {...config} />); await flush(); fireEvent.click(submit()); await flush();
    expect(posts[0]).toEqual(posts[1]); expect(screen.getByRole('status')).toHaveTextContent('삭제됨');
    old.resolve(response({ id: posts[0].requestId, status: 'pending' })); await flush(); expect(screen.getByRole('status')).toHaveTextContent('삭제됨');
  });
  it.each(['status', 'delete'])('unlocks a hung %s action, marks uncertainty, and preserves the same capability for retry', async action => {
    const actions: Record<string, unknown>[] = []; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'GET') return response(feed);
      const body = JSON.parse(String(init.body));
      if (!body.action) return response({ id: body.requestId, status: 'pending' });
      actions.push(body); signals.push(init.signal as AbortSignal); return actions.length === 1 ? never() : response({ status: 'deleted' });
    }));
    render(<Community {...props()} />); await flush(); fireEvent.click(submit()); await flush(); records();
    const label = action === 'status' ? '상태 확인' : '제출 철회·삭제'; fireEvent.click(recordButton(label)); await flush(); await tick();
    expect(signals[0].aborted).toBe(true); expect(recordButton(label)).toBeEnabled(); expect(screen.getByRole('status')).toHaveTextContent('상태 확인으로 결과');
    fireEvent.click(recordButton(label)); await flush(); expect(actions[0]).toEqual(actions[1]); expect(recordButton('제출 철회·삭제')).toBeDisabled();
  });
  it('does not accept a late pre-deletion feed snapshot after confirmed deletion', async () => {
    const old = deferred(); let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'GET') return ++reads === 1 ? response({ ...feed, items: [approved] }) : reads === 2 ? old.promise : response(feed);
      const body = JSON.parse(String(init.body)); return response({ id: body.requestId, status: body.action === 'delete' ? 'deleted' : 'pending' });
    }));
    render(<Community {...props()} />); await flush(); fireEvent.click(submit()); await flush(); records();
    fireEvent.click(recordButton('제출 철회·삭제')); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    old.resolve(response({ ...feed, items: [approved] })); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
  });
});

describe('admin recovery and older-page access', () => {
  it('unlocks a hung GET within the deadline and ignores late data after a successful refresh', async () => {
    const old = deferred(); let reads = 0; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => { signals.push(init.signal as AbortSignal); return ++reads === 1 ? old.promise : response({ items: [] }); }));
    render(<CommunityModeration />); await flush(); await tick();
    expect(signals[0].aborted).toBe(true); expect(screen.getByRole('alert')).toHaveTextContent('처리 결과는 아직 확인되지');
    fireEvent.click(screen.getByRole('button', { name: '검토 목록 새로고침' })); await flush();
    old.resolve(response({ items: [adminItem] })); await flush(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    expect(screen.getByText('현재 검토 목록에 게시물이 없습니다.')).toBeVisible();
  });
  it('unlocks a hung moderation POST without claiming failure or success; reloads the actual committed state', async () => {
    let reads = 0; const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'POST') { signals.push(init.signal as AbortSignal); return never(); }
      return response({ items: ++reads === 1 ? [adminItem] : [] });
    }));
    render(<CommunityModeration />); await flush(); fireEvent.click(screen.getByText(`내용 보기 · ${adminItem.text.slice(0,35)}`)); await flush(); fireEvent(screen.getByText(`내용 보기 · ${adminItem.text.slice(0,35)}`).closest('details')!, new Event('toggle', {bubbles:true})); await flush(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('영구 삭제', {exact:true})); fireEvent.click(screen.getByRole('button',{name:'선택 영구 삭제'})); fireEvent.click(screen.getByRole('button',{name:'확인 후 영구 삭제'})); await flush(); await tick();
    expect(signals[0].aborted).toBe(true); expect(screen.getByText(/새로고침 후 다시 검토하세요/)).toBeVisible(); expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '검토 목록 새로고침' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '검토 목록 새로고침' })); await flush(); expect(screen.getByText('현재 검토 목록에 게시물이 없습니다.')).toBeVisible();
  });
  it('cancels a pending admin read on unmount', async () => {
    let signal!: AbortSignal; vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => { signal = init.signal as AbortSignal; return never(); }));
    const view = render(<CommunityModeration />); await flush(); view.unmount(); expect(signal.aborted).toBe(true); await flush(); expect(vi.getTimerCount()).toBe(0);
  });
  it('navigates bounded pages, resets cursor on filter change, and refreshes after a versioned older-item deletion', async () => {
    const urls: string[] = [], posts: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init: RequestInit) => {
      urls.push(String(url));
      if (init.method === 'POST') { posts.push(JSON.parse(String(init.body))); return response({}); }
      if (String(url).includes('cursor=')) return response({ items: [adminItem], nextCursor: null });
      if (String(url).includes('status=approved')) return response({ items: [], nextCursor: null });
      return response({ items: [], nextCursor: 'opaque-next' });
    }));
    render(<CommunityModeration />); await flush(); fireEvent.click(screen.getByRole('button', { name: '다음 페이지' })); await flush();
    expect(urls.at(-1)).toBe('/api/admin/community?cursor=opaque-next'); expect(screen.getByText(`내용 보기 · ${adminItem.text.slice(0,35)}`)).toBeVisible();
    fireEvent.click(screen.getByText(`내용 보기 · ${adminItem.text.slice(0,35)}`)); await flush(); fireEvent(screen.getByText(`내용 보기 · ${adminItem.text.slice(0,35)}`).closest('details')!, new Event('toggle', {bubbles:true})); await flush(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('영구 삭제', {exact:true})); fireEvent.click(screen.getByRole('button',{name:'선택 영구 삭제'})); fireEvent.click(screen.getByRole('button',{name:'확인 후 영구 삭제'})); await flush();
    expect(posts).toEqual([{ id: approved.id, decision: 'deleted', expectedVersion: 3 }]); expect(urls.at(-1)).toBe('/api/admin/community');
    fireEvent.change(screen.getByRole('combobox', { name: '검토 상태' }), { target: { value: 'approved' } }); await flush();
    expect(urls.at(-1)).toBe('/api/admin/community?status=approved'); expect(screen.queryByRole('button', { name: '다음 페이지' })).not.toBeInTheDocument();
    expect(screen.queryByText(approved.text)).not.toBeInTheDocument();
  });
});
