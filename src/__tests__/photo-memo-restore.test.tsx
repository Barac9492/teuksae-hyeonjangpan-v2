import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotosPanel } from '../features/companion/photos';
import { Community } from '../features/companion/Community';
import { CommunityModeration } from '../features/admin/CommunityModeration';
import { renderFramedPhoto } from '../features/companion/canvas';

vi.mock('../features/companion/canvas', async original => ({
  ...await original<typeof import('../features/companion/canvas')>(), renderFramedPhoto: vi.fn(),
}));
const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-05' };
let posts: Record<string, unknown>[];
let photoId = 0;
const reply = (body: unknown) => new Response(JSON.stringify(body));
const choose = (type = 'image/png') => fireEvent.change(screen.getByLabelText(/^(사진 올리기|다른 사진 고르기)$/), { target: { files: [new File(['synthetic'], 'synthetic.png', { type })] } });
const ready = () => waitFor(() => expect(screen.getByRole('button', { name: '사진 다운로드', hidden: true })).toBeEnabled());
const memoInput = () => screen.getByRole('textbox', { name: /사진 아래 한 줄 메모/ });
const consent = () => screen.getByRole('checkbox', { name: '함께 나누기 · 공개' });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); posts = [];
  vi.mocked(renderFramedPhoto).mockImplementation(async (_photo, _stamp, memo) => new Blob([`synthetic pixels ${memo}`], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: () => `blob:synthetic-${++photoId}`, revokeObjectURL: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return reply(feed);
    const body = JSON.parse(String(init.body)); posts.push(body);
    return reply({ id: body.requestId, status: 'pending' });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('exposes an optional memo before consent while extras stay closed, and Enter never submits', async () => {
  render(<PhotosPanel eventDay={0} />); choose(); await ready();
  const input = memoInput();
  expect(input).toBeVisible(); expect(input.closest('details')).toBeNull();
  expect(input.compareDocumentPosition(consent()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('사진 꾸미기·다운로드·도장').closest('details')).not.toHaveAttribute('open');
  expect(input).toHaveAccessibleDescription(/메모 없이도/);
  expect(input).toHaveAttribute('enterkeyhint', 'done');
  await userEvent.type(input, '함께한 새벽{Enter}'); await ready();
  expect(posts).toHaveLength(0); expect(consent()).not.toBeChecked();
  await userEvent.clear(input); await userEvent.type(input, '가'.repeat(45));
  expect(input).toHaveValue('가'.repeat(40)); await ready();
  fireEvent.click(consent()); fireEvent.click(screen.getByRole('button', { name: '사진 공개하기' }));
  await screen.findByText(/서버에 접수했어요/);
  expect(posts[0].text).toBe('가'.repeat(40));
});

it('preserves memo through failed upload, prevents in-flight duplicates and replays identical payload', async () => {
  let rejectFirst!: (error: Error) => void;
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    if (init.method === 'GET') return reply(feed);
    const body = JSON.parse(String(init.body)); posts.push(body);
    if (posts.length === 1) return new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
    return reply({ id: body.requestId, status: 'pending' });
  }));
  render(<PhotosPanel eventDay={0} />); choose(); await ready();
  fireEvent.change(memoInput(), { target: { value: '다시 올려도 남는 메모' } }); await ready();
  fireEvent.click(consent()); const button = screen.getByRole('button', { name: '사진 공개하기' });
  fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(posts).toHaveLength(1));
  expect(button).toBeDisabled(); expect(memoInput()).toHaveValue('다시 올려도 남는 메모');
  await act(async () => rejectFirst(new Error('합성 업로드 실패')));
  await screen.findByText('합성 업로드 실패');
  expect(memoInput()).toHaveValue('다시 올려도 남는 메모');
  fireEvent.click(button); await screen.findByText(/서버에 접수했어요/);
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
  expect(posts[0]).toMatchObject({ text: '다시 올려도 남는 메모', consent: true, kind: 'photo' });
  for (let i = 0; i < localStorage.length; i++) expect(localStorage.getItem(localStorage.key(i)!)).not.toContain('다시 올려도');
});

it('retains memo when reselecting or rejecting a file, and clears only on explicit clear', async () => {
  render(<PhotosPanel eventDay={0} />); choose(); await ready();
  fireEvent.change(memoInput(), { target: { value: '사진을 바꿔도 남는 메모' } }); await ready();
  fireEvent.click(consent()); choose(); await ready();
  expect(memoInput()).toHaveValue('사진을 바꿔도 남는 메모'); expect(consent()).not.toBeChecked();
  choose('image/svg+xml'); expect(memoInput()).toHaveValue('사진을 바꿔도 남는 메모');
  fireEvent.click(screen.getByText('사진 꾸미기·다운로드·도장'));
  fireEvent.click(screen.getByRole('button', { name: '사진·메모 지우기' }));
  choose(); await ready(); expect(memoInput()).toHaveValue('');
});

it('allows an empty memo and does not publish before explicit consent', async () => {
  render(<PhotosPanel eventDay={null} />); choose(); await ready();
  const button = screen.getByRole('button', { name: '사진 공개하기' });
  expect(button).toBeDisabled(); expect(posts).toHaveLength(0);
  fireEvent.click(consent()); fireEvent.click(button); await screen.findByText(/서버에 접수했어요/);
  expect(posts[0]).toMatchObject({ text: '', eventDay: null });
});

it('renders memo markup as literal text in preview, public feed and administrator photo review', async () => {
  const text = '<img src=x onerror=alert(1)>';
  const selected = render(<PhotosPanel eventDay={0} />); choose(); await ready();
  fireEvent.change(memoInput(), { target: { value: text } }); await ready();
  expect(selected.container.querySelector('.tc-photo-memo')?.textContent).toBe(text);
  expect(selected.container.querySelector('.tc-photo-memo img')).toBeNull(); selected.unmount();
  vi.unstubAllGlobals();
  const item = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'photo', text, createdAt: '2026-10-05T00:00:00Z', eventDay: 0, photoUrl: '/api/community/photo?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  vi.stubGlobal('fetch', vi.fn(async () => reply({ ...feed, items: [item] })));
  const publicView = render(<Community kind="photo" text="" payloadKey="empty" showComposer={false} />);
  await screen.findByText(text); expect(publicView.container.querySelector('[onerror]')).toBeNull(); publicView.unmount();
  vi.stubGlobal('fetch', vi.fn(async () => reply({ items: [{ ...item, status: 'pending', version: 1 }], trashSupported: true, archiveSupported: true })));
  const admin = render(<CommunityModeration kind="photo" />);
  await userEvent.click(await screen.findByText(`내용 보기 · ${text}`));
  expect(screen.getByText(text, { selector: '.community-moderation__text' })).toBeVisible();
  expect(screen.getByAltText('공개 검토용 제출 사진')).toBeVisible();
  expect(admin.container.querySelector('[onerror]')).toBeNull();
});
