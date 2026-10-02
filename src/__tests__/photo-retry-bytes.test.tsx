import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import { PhotosPanel } from '../features/companion/photos';
import { renderFramedPhoto } from '../features/companion/canvas';
import { finishSubmission, readReceipts, saveReceipt, submissionAttempt } from '../features/companion/communityClient';

vi.mock('../features/companion/canvas', async original => ({
  ...await original<typeof import('../features/companion/canvas')>(), renderFramedPhoto: vi.fn(),
}));
const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-02' };
let generation = 0;
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  // Real rendering adds random grain, so restoring an editor value regenerates
  // different PNG bytes. Deliberately reproduce that property, not a fixed blob.
  vi.mocked(renderFramedPhoto).mockImplementation(async () => new Blob([`synthetic PNG generation ${++generation}`], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: () => `blob:synthetic-photo-${++generation}`, revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ready = async () => { await waitFor(() => expect(screen.getByRole('button', { name: '사진 다운로드', hidden: true })).toBeEnabled()); };
const publish = () => {
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  fireEvent.click(screen.getByRole('button', { name: '사진 공개하기' }));
};
const changeDay = (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: /사진에 남길 행사 날짜/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
};

it.each(['memo', 'day'] as const)('replays exact photo bytes after uncertain response and %s edit away/back', async field => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    posts.push(JSON.parse(String(init.body)));
    if (posts.length === 1) throw new Error('Synthetic uncertain response');
    return new Response(JSON.stringify({ id: posts.at(-1)?.requestId, status: 'pending' }));
  }));
  render(<PhotosPanel eventDay={0} />);
  fireEvent.change(screen.getByLabelText('사진 올리기'), { target: { files: [new File(['local image'], 'synthetic.jpg', { type: 'image/jpeg' })] } });
  await ready(); await screen.findByText(/아직 승인되어/); publish();
  await screen.findByText('Synthetic uncertain response');
  if (field === 'memo') fireEvent.change(screen.getByLabelText(/사진 아래 한 줄/), { target: { value: 'changed memo' } });
  else changeDay('10월 6일 (화)');
  await ready();
  if (field === 'memo') fireEvent.change(screen.getByLabelText(/사진 아래 한 줄/), { target: { value: '' } });
  else changeDay('10월 5일 (월)');
  await ready(); publish();
  await screen.findByText(/서버에 접수했어요/);
  expect(renderFramedPhoto).toHaveBeenCalledTimes(3);
  expect(posts).toHaveLength(2);
  expect(posts[1].requestId).toBe(posts[0].requestId);
  expect(posts[1].deleteToken).toBe(posts[0].deleteToken);
  expect(posts[1].imageBase64).toBe(posts[0].imageBase64);
  expect(posts[1]).toEqual(posts[0]);
});


it.each(['memo', 'day', 'photo'] as const)('keeps changed %s submissions distinct from an unresolved photo', async field => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    posts.push(JSON.parse(String(init.body)));
    if (posts.length === 1) throw new Error('Synthetic uncertain response');
    return new Response(JSON.stringify({ id: posts.at(-1)?.requestId, status: 'pending' }));
  }));
  render(<PhotosPanel eventDay={0} />);
  const image = new File(['local image'], 'synthetic.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('사진 올리기'), { target: { files: [image] } });
  await ready(); await screen.findByText(/아직 승인되어/); publish();
  await screen.findByText('Synthetic uncertain response');
  if (field === 'memo') fireEvent.change(screen.getByLabelText(/사진 아래 한 줄/), { target: { value: 'new content' } });
  else if (field === 'day') changeDay('10월 6일 (화)');
  else fireEvent.change(screen.getByLabelText('다른 사진 고르기'), { target: { files: [image] } });
  await ready(); publish();
  await screen.findByText(/서버에 접수했어요/);
  expect(posts).toHaveLength(2);
  expect(posts[1].requestId).not.toBe(posts[0].requestId);
  expect(posts[1].deleteToken).not.toBe(posts[0].deleteToken);
  expect(posts[1].imageBase64).not.toBe(posts[0].imageBase64);
});

it('keeps retry images out of persisted receipts and releases bytes after confirmation', () => {
  const attempt = submissionAttempt('synthetic in-memory image lifetime');
  attempt.imageBase64 = 'synthetic private pixels';
  saveReceipt({ id: attempt.requestId, kind: 'photo', token: attempt.token });
  expect(readReceipts().find(r => r.id === attempt.requestId)).toEqual({ id: attempt.requestId, kind: 'photo', token: attempt.token });
  for (let i = 0; i < localStorage.length; i++) expect(localStorage.getItem(localStorage.key(i)!)).not.toContain(attempt.imageBase64);
  expect(submissionAttempt(attempt.key)).toBe(attempt);
  finishSubmission(attempt);
  expect(attempt.imageBase64).toBeUndefined();
  expect(submissionAttempt(attempt.key).requestId).not.toBe(attempt.requestId);
});


it.each([
  { action: 'status', result: { status: 'pending' }, label: '검수 대기', retained: true },
  { action: 'status', result: { status: 'approved' }, label: '공개 중', retained: false },
  { action: 'status', result: { status: 'rejected' }, label: '반려', retained: false },
  { action: 'status', result: { status: 'deleted' }, label: '삭제됨', retained: false },
  { action: 'delete', result: { deleted: true }, label: '삭제됨', retained: false },
])('handles retry-byte lifetime after $action result $label', async test => {
  const payloadKey = `receipt-lifetime-${test.action}-${test.label}`;
  const attempt = submissionAttempt(JSON.stringify(['photo', '', 0, payloadKey]));
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    const body = JSON.parse(String(init.body));
    if (body.action) return new Response(JSON.stringify(test.result));
    throw new Error('Synthetic uncertain response');
  }));
  render(<Community kind="photo" text="" eventDay={0} payloadKey={payloadKey} file={new File(['original pixels'], 'photo.png', { type: 'image/png' })} />);
  await screen.findByText(/아직 승인되어/); publish();
  await screen.findByText('Synthetic uncertain response');
  expect(attempt.imageBase64).toBeTruthy();
  const row = screen.getByText('접수 여부 확인 필요 · 상태 확인 또는 같은 내용으로 재시도', { exact: false }).closest('div')!;
  fireEvent.click(within(row).getByRole('button', { name: test.action === 'delete' ? '제출 철회·삭제' : '상태 확인', hidden: true }));
  await waitFor(() => expect(row).toHaveTextContent(test.label));
  expect(screen.queryByText('Synthetic uncertain response')).not.toBeInTheDocument();
  if (test.retained) {
    expect(attempt.imageBase64).toBeTruthy();
    expect(submissionAttempt(attempt.key)).toBe(attempt);
  } else {
    expect(attempt.imageBase64).toBeUndefined();
    expect(submissionAttempt(attempt.key).requestId).not.toBe(attempt.requestId);
    expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '사진 공개하기' })).toBeDisabled();
  }
});

it('retains exact photo bytes through a pending POST unmount and remount', async () => {
  const posts: Record<string, unknown>[] = [];
  let oldReply!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { oldReply = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    posts.push(JSON.parse(String(init.body)));
    if (posts.length === 1) return pending;
    return new Response(JSON.stringify({ id: posts.at(-1)?.requestId, status: 'pending' }));
  }));
  const props = { kind: 'photo' as const, text: 'remount', eventDay: 0, payloadKey: 'same-render-after-remount' };
  const view = render(<Community {...props} file={new File(['first pixels'], 'photo.png', { type: 'image/png' })} />);
  await screen.findByText(/아직 승인되어/); publish();
  await waitFor(() => expect(posts).toHaveLength(1));
  view.unmount();
  render(<Community {...props} file={new File(['regenerated pixels'], 'photo.png', { type: 'image/png' })} />);
  await screen.findByText(/아직 승인되어/); publish();
  await screen.findByText(/서버에 접수했어요/);
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
  await act(async () => { oldReply(new Response(JSON.stringify({ id: posts[0].requestId, status: 'pending' }))); });
  expect(screen.getByText(/서버에 접수했어요/)).toBeVisible();
});


it('settling an older photo receipt preserves consent for a different current draft', async () => {
  const props = { kind: 'photo' as const, text: 'old memo', eventDay: 0, payloadKey: 'older-receipt-render' };
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return new Response(JSON.stringify(feed));
    if (JSON.parse(String(init.body)).action) return new Response(JSON.stringify({ status: 'approved' }));
    throw new Error('Synthetic uncertain response');
  }));
  const file = new File(['original pixels'], 'photo.png', { type: 'image/png' });
  const view = render(<Community {...props} file={file} />);
  await screen.findByText(/아직 승인되어/); publish();
  await screen.findByText('Synthetic uncertain response');
  const row = screen.getByText('접수 여부 확인 필요 · 상태 확인 또는 같은 내용으로 재시도', { exact: false }).closest('div')!;
  view.rerender(<Community {...props} text="new memo" payloadKey="different-render" file={file} />);
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  fireEvent.click(within(row).getByRole('button', { name: '상태 확인', hidden: true }));
  await waitFor(() => expect(row).toHaveTextContent('공개 중'));
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).toBeChecked();
  expect(screen.getByRole('button', { name: '사진 공개하기' })).toBeEnabled();
});
