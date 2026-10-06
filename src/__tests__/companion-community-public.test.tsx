import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import { photoBase64, RECEIPTS_KEY, safePhotoUrl } from '../features/companion/communityClient';
const feed = { enabled: true, items: [], photoCountToday: 7, today: '2026-10-05' };
const response = (value: unknown) => ({ ok: true, json: async () => value });
let posted: Record<string, unknown>[];
beforeEach(() => {
  localStorage.clear(); posted = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T15:00:00.000Z'));
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.method === 'GET') return response(feed);
    const body = JSON.parse(options.body); posted.push(body);
    return response({ id: body.id ?? body.requestId, status: body.action === 'delete' ? 'deleted' : 'pending', photoCountToday: 8, today: feed.today });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const submit = () => screen.getByRole('button', { name: /^(공개 접수하기 · 검수 후 게시|사진 공개하기)$/ });
const consent = () => screen.getByRole('checkbox');
describe('public companion submissions', () => {
  it('requires separate unchecked consent, retains only capability receipts and supports deletion', async () => {
    render(<Community kind="prayer" text="private prayer content" payloadKey="one" />);
    await screen.findByText(/아직 승인되어/);
    expect(consent()).not.toBeChecked(); expect(submit()).toBeDisabled();
    fireEvent.click(consent()); fireEvent.click(submit());
    await screen.findByText(/서버에 접수했어요/);
    expect(posted).toHaveLength(1); expect(posted[0].consent).toBe(true);
    expect(String(posted[0].deleteToken)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const saved = JSON.parse(localStorage.getItem(RECEIPTS_KEY)!);
    expect(Object.keys(saved[0]).sort()).toEqual(['id', 'kind', 'token']);
    expect(localStorage.getItem(RECEIPTS_KEY)).not.toContain('private prayer content');
    expect(document.body.textContent).not.toContain(String(posted[0].deleteToken));
    fireEvent.click(screen.getByText(/내 제출 기록 \(/));
    fireEvent.click(screen.getAllByRole('button', { name: '제출 철회·삭제' }).at(-1)!);
    await screen.findByText(/· 삭제됨/); expect(posted.at(-1)?.action).toBe('delete');
  });
  it('reuses the attempt after uncertain response and guards double-clicks', async () => {
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options.method === 'GET') return response(feed);
      const body = JSON.parse(options.body); posted.push(body);
      if (first) { first = false; throw new Error('network interrupted'); }
      return response({ id: body.requestId, status: 'pending' });
    }));
    render(<Community kind="prayer" text="retry" payloadKey="retry" />);
    await screen.findByText(/아직 승인되어/); fireEvent.click(consent()); const button = submit(); fireEvent.click(button); fireEvent.click(button);
    await screen.findByText('network interrupted'); expect(posted).toHaveLength(1);
    fireEvent.click(submit()); await screen.findByText(/서버에 접수했어요/);
    expect(posted[0].requestId).toBe(posted[1].requestId); expect(posted[0].deleteToken).toBe(posted[1].deleteToken);
  });
  it.each([
    { status: 'approved', label: '공개 중', defaultPublic: false },
    { status: 'rejected', label: '반려', defaultPublic: false },
    { status: 'deleted', label: '삭제됨', defaultPublic: false },
    { status: 'approved', label: '공개 중', defaultPublic: true },
    { status: 'rejected', label: '반려', defaultPublic: true },
    { status: 'deleted', label: '삭제됨', defaultPublic: true },
  ])('accepts a retry already moderated to $status with defaultPublic=$defaultPublic without claiming a new pending submission', async ({ status, label, defaultPublic }) => {
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options.method === 'GET') return response(feed);
      const body = JSON.parse(options.body); posted.push(body);
      if (first) { first = false; throw new Error('response interrupted'); }
      return response({ id: body.requestId, status });
    }));
    render(<Community kind="prayer" text="moderated retry" payloadKey={status} defaultPublic={defaultPublic} />);
    await screen.findByText(/아직 승인되어/);
    const retry = () => defaultPublic ? screen.getByRole('button', { name: '기도제목 공개로 올리기' }) : submit();
    if (!defaultPublic) fireEvent.click(consent());
    fireEvent.click(retry());
    await screen.findByText('response interrupted');
    fireEvent.click(retry());
    await screen.findByText('이 요청의 기존 접수 상태를 확인했어요: ' + label);
    expect(screen.queryByText(/서버에 접수했어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/· 검수 대기/)).not.toBeInTheDocument();
    expect(posted).toHaveLength(2);
    expect(posted[0].requestId).toBe(posted[1].requestId);
    expect(posted[0].deleteToken).toBe(posted[1].deleteToken);
    expect(consent().matches(':checked')).toBe(defaultPublic);
    expect(defaultPublic ? screen.getByRole('button', { name: '접수 완료' }) : submit()).toBeDisabled();
    expect(screen.queryByRole('button', { name: '접수 완료 · 검수 후 게시' })).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(RECEIPTS_KEY)!);
    expect(saved.some((r: { id: string; token: string }) => r.id === posted[1].requestId && r.token === posted[1].deleteToken)).toBe(true);
  });
  it('resets consent on any edit, even returning to prior text', async () => {
    const view = render(<Community kind="prayer" text="A" payloadKey="A" />);
    await screen.findByText(/아직 승인되어/); fireEvent.click(consent());
    view.rerender(<Community kind="prayer" text="B" payloadKey="B" />); expect(consent()).not.toBeChecked();
    view.rerender(<Community kind="prayer" text="A" payloadKey="A" />); expect(consent()).not.toBeChecked();
  });
  it('shows escaped approved content without any photo count, never outsider images', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...feed, items: [{ id: 'public', kind: 'photo', text: '<script>unsafe()</script>', photoUrl: 'https://evil.test/x.png' }] })));
    render(<Community kind="photo" text="" payloadKey="empty" />);
    expect(await screen.findByText('<script>unsafe()</script>')).toBeInTheDocument(); expect(screen.queryByText(/사진 참여/)).toBeNull(); expect(screen.queryByText(/같은 사람의 여러 제출/)).toBeNull();
    expect(document.querySelector('script')).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
  });
  it('fails closed on an absent response without inventing zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => undefined));
    render(<Community kind="photo" text="" payloadKey="empty" />);
    await screen.findByRole('alert'); expect(submit()).toBeDisabled(); expect(screen.queryByText('오늘 사진 참여 0건')).toBeNull();
  });
  it('preserves in-memory capability and warns when storage fails', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<Community kind="prayer" text="storage" payloadKey="storage" />);
    await screen.findByText(/아직 승인되어/); fireEvent.click(consent()); fireEvent.click(submit());
    await screen.findByText(/서버에 접수했어요/); expect(screen.getByRole('alert')).toHaveTextContent('삭제 권한을 잃을 수');
    expect(screen.getByText(/내 제출 기록 \(/)).toBeInTheDocument(); vi.restoreAllMocks();
  });
  it('sends only the prepared PNG with the chosen event date and shows no count after submitting', async () => {
    const file = new File(['prepared-pixels'], 'dawn-photo.png', { type: 'image/png' });
    render(<Community kind="photo" text="새벽" eventDay={5} file={file} payloadKey="prepared" />);
    await screen.findByText(/아직 승인되어 공개된 사진이/); expect(screen.queryByText(/사진 참여/)).toBeNull();
    fireEvent.click(consent()); fireEvent.click(submit());
    await screen.findByText(/서버에 접수했어요/);
    expect(posted[0].eventDay).toBe(5);
    expect(atob(String(posted[0].imageBase64))).toBe('prepared-pixels');
    expect(localStorage.getItem(RECEIPTS_KEY)).not.toContain('prepared-pixels');
    expect(screen.queryByText(/사진 참여/)).toBeNull();
  });
  it('rejects oversized public images and only permits same origin API URLs', async () => {
    await expect(photoBase64(new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow('3MB');
    expect(safePhotoUrl('/api/community-photo?id=ok')).toBe('/api/community-photo?id=ok');
    expect(safePhotoUrl('javascript:alert(1)')).toBeNull();
    expect(safePhotoUrl('https://elsewhere.test/api/photo')).toBeNull();
    await waitFor(() => expect(posted).toHaveLength(0));
  });
});

it('submits reflection only by consent, with day and no image, and supports withdrawal', async () => {
  const { rerender } = render(<Community kind="reflection" text={'묵'.repeat(1000)} eventDay={2} payloadKey="reflection-day-2" />);
  await screen.findByText(/아직 승인되어/);
  expect(screen.getByRole('heading', { name: '함께 나누는 묵상' })).toBeVisible();
  expect(consent()).not.toBeChecked(); expect(submit()).toBeDisabled(); expect(posted).toHaveLength(0);
  fireEvent.click(consent());
  rerender(<Community kind="reflection" text={'묵'.repeat(1000)} eventDay={3} payloadKey="reflection-day-3" />);
  expect(consent()).not.toBeChecked();
  fireEvent.click(consent()); fireEvent.click(submit());
  await screen.findByText(/서버에 접수했어요/);
  expect(posted[0]).toMatchObject({ kind: 'reflection', eventDay: 3, consent: true, text: '묵'.repeat(1000) });
  expect(posted[0]).not.toHaveProperty('imageBase64');
  expect(localStorage.getItem(RECEIPTS_KEY)).not.toContain('묵');
  fireEvent.click(screen.getByText(/내 제출 기록 \(/));
  fireEvent.click(screen.getAllByRole('button', { name: '제출 철회·삭제' }).at(-1)!);
  await screen.findByText(/· 삭제됨/);
});


it('shows shared prayers before personal submission receipts', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.method === 'GET') return response({ ...feed, items: [{ id: 'prayer-1', kind: 'prayer', text: '먼저 보이는 기도', eventDay: null, createdAt: '2026-10-05T00:00:00Z' }] });
    throw new Error('Unexpected write');
  }));
  render(<Community kind="prayer" text="" payloadKey="shared-first" defaultPublic />);
  const sharedPrayer = await screen.findByText('먼저 보이는 기도');
  const receipts = screen.getByText(/내 제출 기록 \(/).closest('details')!;
  expect(sharedPrayer.compareDocumentPosition(receipts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});


it('defaults new prayer sharing to public, respects opting out across edits, and submits only on click', async () => {
  const view = render(<Community kind="prayer" text="A" payloadKey="A" defaultPublic />);
  await screen.findByText(/아직 승인되어/);
  const share = () => screen.getByRole('button', { name: '기도제목 공개로 올리기' });
  expect(consent()).toBeChecked();
  expect(posted).toHaveLength(0);
  fireEvent.click(consent());
  view.rerender(<Community kind="prayer" text="B" payloadKey="B" defaultPublic />);
  expect(consent()).not.toBeChecked();
  expect(share()).toBeDisabled();
  fireEvent.click(consent());
  fireEvent.click(share());
  await screen.findByText(/서버에 접수했어요/);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ kind: 'prayer', text: 'B', consent: true });
  expect(screen.getByRole('button', { name: '접수 완료' })).toBeDisabled();
});
