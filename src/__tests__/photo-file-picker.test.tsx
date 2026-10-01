import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotosPanel } from '../features/companion/photos';
import { renderFramedPhoto } from '../features/companion/canvas';

vi.mock('../features/companion/canvas', async (original) => ({
  ...await original<typeof import('../features/companion/canvas')>(),
  renderFramedPhoto: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(renderFramedPhoto).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps the actual file input unhidden and nested within the visible chooser', () => {
  render(<PhotosPanel eventDay={null} />);
  const input = screen.getByLabelText('사진 올리기') as HTMLInputElement;
  expect(input).toHaveAttribute('type', 'file');
  expect(input).not.toHaveAttribute('hidden');
  expect(input.closest('label')).toHaveTextContent('사진 올리기');
  expect(input).not.toBeDisabled();
  expect(input.accept).toBe('image/jpeg,image/png,image/webp');
});

it('keeps photo selection local and public submission opt-in only', async () => {
  render(<PhotosPanel eventDay={null} />);
  const input = screen.getByLabelText('사진 올리기') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['pixels'], 'synthetic.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('button', { name: '사진 다운로드' })).toBeEnabled());
  expect(input.closest('label')).toHaveTextContent('다른 사진 고르기');
  expect(input).toHaveAccessibleName('다른 사진 고르기');
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: '사진 공개로 올리기' })).toBeDisabled();
  expect(vi.mocked(fetch).mock.calls.every((call) => !call[1] || call[1].method !== 'POST')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '사진·메모 지우기' }));
  expect(input.closest('label')).toHaveTextContent('사진 올리기');
  expect(input).toHaveAccessibleName('사진 올리기');
  expect(input.value).toBe('');
});
