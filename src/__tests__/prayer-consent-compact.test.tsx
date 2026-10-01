import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';

const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' };
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renders just a checkbox in the compact prayer consent area, keeping submission separate', () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(feed)));
  const { container } = render(<Community kind="prayer" text="평안을 위해" payloadKey="draft" defaultPublic />);
  const consent = container.querySelector('.tc-community-compose--compact');
  expect(consent).not.toBeNull();
  expect(within(consent as HTMLElement).getByRole('checkbox', { name: '함께 나누기 · 공개' })).toBeChecked();
  expect(within(consent as HTMLElement).queryByRole('heading')).not.toBeInTheDocument();
  expect(within(consent as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('공개 범위와 삭제 한계 자세히 보기')).not.toBeInTheDocument();
  expect(screen.queryByText('내 제출 기록에서 삭제 가능. 관리자도 검수·삭제할 수 있습니다.')).not.toBeInTheDocument();
  const checkbox = screen.getByRole('checkbox');
  const description = document.getElementById(checkbox.getAttribute('aria-describedby')!);
  expect(description).toHaveAttribute('hidden');
  expect(description).toHaveTextContent('캡처·외부 저장 사본');
  expect(screen.getByRole('button', { name: '기도제목 공개로 올리기' })).toBeInTheDocument();
});

it('does not submit on checkbox changes and still requires selection and an explicit button press', async () => {
  const fetchSpy = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const payload = JSON.parse(options.body as string);
      return response({ id: payload.requestId, status: 'pending' });
    }
    return response(feed);
  });
  vi.stubGlobal('fetch', fetchSpy);
  render(<Community kind="prayer" text="평안을 위해" payloadKey="draft" defaultPublic />);
  const button = screen.getByRole('button', { name: '기도제목 공개로 올리기' });
  await waitFor(() => expect(button).toBeEnabled());
  const posts = () => fetchSpy.mock.calls.filter(([, options]) => options?.method === 'POST');
  fireEvent.click(screen.getByRole('checkbox'));
  expect(button).toBeDisabled();
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(button).toBeEnabled();
  expect(posts()).toHaveLength(0);
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('button', { name: '접수 완료 · 검수 후 게시' })).toBeDisabled());
  expect(posts()).toHaveLength(1);
  expect(JSON.parse(posts()[0][1]!.body as string)).toMatchObject({ kind: 'prayer', text: '평안을 위해', consent: true });
  expect(screen.getByRole('status')).toHaveTextContent('관리자가 검수한 뒤에만 공개');
});

it('keeps compact photo consent accessible and its unchecked default intact', () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(feed)));
  const { container } = render(<Community kind="photo" text="" payloadKey="photo" />);
  expect(container.querySelector('.tc-community-compose--compact')).not.toBeNull();
  expect(screen.queryByRole('heading', { name: '앱에 들어온 모든 분께 공개하기' })).not.toBeInTheDocument();
  expect(screen.queryByText('공개 범위와 삭제 한계 자세히 보기')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(/미성년자는 보호자 동의를 확인했습니다/);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('keeps the public prayer feed readable without showing a composer in read view', () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(feed)));
  render(<Community kind="prayer" text="" payloadKey="draft" defaultPublic showComposer={false} />);
  expect(screen.getByRole('heading', { name: '함께 나누는 기도' })).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
