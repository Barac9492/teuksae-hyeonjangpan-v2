import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' };
const image = new File(['prepared PNG pixels'], 'dawn-photo.png', { type: 'image/png' });
let writes: Record<string, unknown>[];
beforeEach(() => {
  localStorage.clear(); writes = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.method === 'GET') return { ok: true, json: async () => feed };
    const body = JSON.parse(options.body); writes.push(body);
    return { ok: true, json: async () => ({ id: body.requestId, status: 'pending' }) };
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('renders only one visible photo-consent label and puts explicit posting outside it', async () => {
  const { container } = render(<Community kind="photo" text="" payloadKey="A" file={image} />);
  await screen.findByText('오늘 사진 참여 0건');
  const box = container.querySelector('.tc-community-compose--compact') as HTMLElement;
  expect(box).not.toBeNull();
  expect(Array.from(box.children).filter(n => !(n as HTMLElement).hidden)).toHaveLength(1);
  expect(within(box).queryByRole('heading')).not.toBeInTheDocument();
  expect(within(box).queryByRole('button')).not.toBeInTheDocument();
  expect(box.querySelector('details')).toBeNull();
  const check = screen.getByRole('checkbox', { name: '함께 나누기 · 공개' });
  expect(check).not.toBeChecked();
  expect(check).toHaveAccessibleDescription(/관리자는 검수 대기 내용도 읽을 수 있습니다/);
  expect(check).toHaveAccessibleDescription(/3MB/);
  expect(check).toHaveAccessibleDescription(/원본 EXIF/);
  expect(screen.queryByRole('heading', { name: '앱에 들어온 모든 분께 공개하기' })).not.toBeInTheDocument();
  expect(screen.queryByText('공개 범위와 삭제 한계 자세히 보기')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '사진 공개하기' })).toBeDisabled();
});
it('never uploads on checkbox click and requires an explicit prepared-photo submit', async () => {
  render(<Community kind="photo" text="새벽" payloadKey="A" file={image} eventDay={1} />);
  await screen.findByText('오늘 사진 참여 0건');
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  expect(writes).toHaveLength(0);
  const publish = screen.getByRole('button', { name: '사진 공개하기' });
  expect(publish).toBeEnabled(); fireEvent.click(publish);
  await screen.findByText(/서버에 접수했어요/);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ kind: 'photo', text: '새벽', eventDay: 1, consent: true });
  expect(atob(String(writes[0].imageBase64))).toBe('prepared PNG pixels');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
it('invalidates photo consent after memo, date and payload edits, even returning to a prior photo', async () => {
  const view = render(<Community kind="photo" text="A" payloadKey="one" file={image} eventDay={0} />);
  await screen.findByText('오늘 사진 참여 0건');
  const agree = () => fireEvent.click(screen.getByRole('checkbox'));
  agree(); view.rerender(<Community kind="photo" text="B" payloadKey="one" file={image} eventDay={0} />);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  agree(); view.rerender(<Community kind="photo" text="B" payloadKey="one" file={image} eventDay={1} />);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  agree(); view.rerender(<Community kind="photo" text="B" payloadKey="two" file={image} eventDay={1} />);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  view.rerender(<Community kind="photo" text="A" payloadKey="one" file={image} eventDay={0} />);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(writes).toHaveLength(0);
});
it('keeps posting disabled without a prepared file even with consent', async () => {
  render(<Community kind="photo" text="" payloadKey="empty" file={null} />);
  await screen.findByText('오늘 사진 참여 0건');
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: '사진 공개하기' })).toBeDisabled();
  await waitFor(() => expect(writes).toHaveLength(0));
});
