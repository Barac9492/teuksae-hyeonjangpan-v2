import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotosPanel } from '../features/companion/photos';
import { renderFramedPhoto } from '../features/companion/canvas';

vi.mock('../features/companion/canvas', async (original) => ({
  ...await original<typeof import('../features/companion/canvas')>(),
  renderFramedPhoto: vi.fn(),
}));

const requests: string[] = [];
const submissions: Record<string, unknown>[] = [];
beforeEach(() => {
  localStorage.clear(); requests.length = 0; submissions.length = 0; vi.clearAllMocks();
  vi.mocked(renderFramedPhoto).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    requests.push(options?.method ?? 'GET');
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      submissions.push(body);
      return { ok: true, json: async () => ({ id: body.requestId, status: 'pending' }) };
    }
    return { ok: true, json: async () => ({ enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('puts explicit public posting immediately after the selected photo, before optional tools', async () => {
  const { container } = render(<PhotosPanel eventDay={null} />);
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('사진 올리기'), { target: { files: [new File(['pixels'], 'synthetic.png', { type: 'image/png' })] } });
  await waitFor(() => expect(renderFramedPhoto).toHaveBeenCalled());
  const preview = container.querySelector('.tc-photo-preview') as HTMLElement;
  const composer = container.querySelector('.tc-community-compose') as HTMLElement;
  const extras = screen.getByText('사진 꾸미기·다운로드·도장').closest('details') as HTMLDetailsElement;
  expect(preview).not.toBeNull(); expect(composer).not.toBeNull(); expect(extras).not.toBeNull();
  expect(preview.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(composer.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(extras.open).toBe(false);
  const publish = screen.getByRole('button', { name: '사진 공개하기' });
  expect(publish).toBeDisabled();
  expect(requests.every(method => method !== 'POST')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  await waitFor(() => expect(publish).toBeEnabled());
  expect(requests.every(method => method !== 'POST')).toBe(true);
  expect(screen.getByText(/앱에 들어온 누구나 볼 수 있어요/)).toBeVisible();
  fireEvent.click(publish);
  await screen.findByText(/서버에 접수했어요/);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ kind: 'photo', consent: true, eventDay: null });
  expect(atob(String(submissions[0].imageBase64))).toBe('png');
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
  fireEvent.click(screen.getByText('내 제출 기록 (1)'));
  expect(screen.getByRole('button', { name: '제출 철회·삭제' })).toBeEnabled();
});
