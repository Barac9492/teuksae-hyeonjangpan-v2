import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import { photoBase64 } from '../features/companion/communityClient';
import { REQUEST_TIMEOUT_MS } from '../lib/requestDeadline';

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128]);
const expectedBase64 = 'iVBORw0KGgoA/4A=';
// jsdom's File lacks arrayBuffer; model its native byte-read contract explicitly.
function modernFile(data = bytes) {
  return Object.assign(new File([data], 'synthetic.png', { type: 'image/png' }), {
    arrayBuffer: vi.fn(async () => data.slice().buffer),
  });
}
function removeReader() { Reflect.deleteProperty(globalThis, 'FileReader'); }
const OriginalReader = globalThis.FileReader;
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, writable: true, value: OriginalReader });
});

describe('photo upload without FileReader', () => {
  it('encodes exact PNG bytes when FileReader is missing', async () => {
    removeReader();
    expect('FileReader' in globalThis).toBe(false);
    const file = modernFile();
    await expect(photoBase64(file)).resolves.toBe(expectedBase64);
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
  });
  it.each([32767, 32768, 32769, 3 * 1024 * 1024])('preserves all %i bytes without oversized spread calls', async size => {
    removeReader();
    const data = Uint8Array.from({ length: size }, (_, i) => (i * 31) % 256);
    await expect(photoBase64(modernFile(data))).resolves.toBe(btoa(Array.from(data, byte => String.fromCharCode(byte)).join('')));
  });
  it('prefers arrayBuffer even when FileReader is present', async () => {
    const reader = vi.fn(() => { throw new Error('legacy reader must not run'); });
    vi.stubGlobal('FileReader', reader);
    await expect(photoBase64(modernFile())).resolves.toBe(expectedBase64);
    expect(reader).not.toHaveBeenCalled();
  });
  it('retains the legacy FileReader path if arrayBuffer is unavailable', async () => {
    const file = new File([bytes], 'synthetic.png', { type: 'image/png' });
    expect(typeof file.arrayBuffer).not.toBe('function');
    await expect(photoBase64(file)).resolves.toBe(expectedBase64);
  });
  it('gives a useful Korean error when neither reader is available', async () => {
    removeReader();
    await expect(photoBase64(new File([bytes], 'synthetic.png', { type: 'image/png' }))).rejects.toThrow(/사진.*(읽|지원)/);
  });
  it.each([
    new File([], 'empty.png', { type: 'image/png' }),
    new File([bytes], 'wrong.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  ])('preserves validation before attempting a read', async file => {
    removeReader();
    await expect(photoBase64(file)).rejects.toThrow('3MB');
  });
  it('rejects an unsuccessful modern read', async () => {
    removeReader(); const file = modernFile();
    file.arrayBuffer.mockRejectedValue(new Error('read failed'));
    await expect(photoBase64(file)).rejects.toThrow();
  });
  it('does not start an already cancelled read', async () => {
    removeReader(); const file = modernFile(); const controller = new AbortController(); controller.abort();
    await expect(photoBase64(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
  it('cancels a pending read and ignores its late bytes', async () => {
    removeReader(); const file = modernFile(); const controller = new AbortController();
    const encode = vi.spyOn(globalThis, 'btoa');
    let finish!: (buffer: ArrayBuffer) => void;
    file.arrayBuffer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const request = photoBase64(file, controller.signal);
    const check = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); await check;
    finish(bytes.slice().buffer); await Promise.resolve(); await Promise.resolve();
    expect(encode).not.toHaveBeenCalled();
  });
  it('aborts the underlying legacy reader when cancelled', async () => {
    const read = vi.spyOn(OriginalReader.prototype, 'readAsDataURL').mockImplementation(() => {});
    const abort = vi.spyOn(OriginalReader.prototype, 'abort');
    const controller = new AbortController();
    const pending = photoBase64(new File([bytes], 'legacy.png', { type: 'image/png' }), controller.signal);
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    await Promise.resolve(); expect(read).toHaveBeenCalledOnce(); controller.abort();
    expect(await outcome).toMatchObject({ error: { name: 'AbortError' } });
    expect(abort).toHaveBeenCalledOnce();
  });
  it('times out a hanging read and cleans up its deadline', async () => {
    vi.useFakeTimers(); removeReader(); const file = modernFile();
    file.arrayBuffer.mockImplementation(() => new Promise(() => {}));
    const outcome = photoBase64(file).then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await outcome).toMatchObject({ error: { name: 'RequestTimeoutError' } });
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('publishes only after consent without FileReader and retries the identical payload after failure', async () => {
  removeReader(); const posts: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify({ enabled: true, items: [], today: '2026-10-06', photoCountToday: 0 }));
    const body = JSON.parse(String(init.body)); posts.push(body);
    if (posts.length === 1) throw new Error('synthetic network failure');
    return new Response(JSON.stringify({ id: body.requestId, status: 'pending' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Community kind="photo" text="synthetic memo" eventDay={1} file={modernFile()} payloadKey="no-reader-retry" />);
  const publish = screen.getByRole('button', { name: '사진 공개하기' });
  await screen.findByText(/아직 승인되어 공개된 사진이/);
  expect(publish).toBeDisabled(); expect(posts).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  expect(posts).toHaveLength(0); fireEvent.click(publish);
  await screen.findByText('synthetic network failure');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ kind: 'photo', text: 'synthetic memo', eventDay: 1, consent: true, imageBase64: expectedBase64 });
  fireEvent.click(publish); await screen.findByText(/서버에 접수했어요/);
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
});

it('never POSTs after leaving during a pending photo read', async () => {
  removeReader(); const file = modernFile(); let finish!: (buffer: ArrayBuffer) => void;
  file.arrayBuffer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ enabled: true, items: [], today: '2026-10-06', photoCountToday: 0 })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Community kind="photo" text="" eventDay={1} file={file} payloadKey="no-reader-cancel" />);
  await screen.findByText(/아직 승인되어 공개된 사진이/);
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  fireEvent.click(screen.getByRole('button', { name: '사진 공개하기' }));
  await waitFor(() => expect(file.arrayBuffer).toHaveBeenCalledOnce()); view.unmount();
  await act(async () => { finish(bytes.slice().buffer); await Promise.resolve(); });
  expect(fetchMock.mock.calls).toHaveLength(1);
});
