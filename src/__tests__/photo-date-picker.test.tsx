import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotosPanel } from '../features/companion/photos';
import { renderFramedPhoto } from '../features/companion/canvas';

vi.mock('../features/companion/canvas', async (original) => ({ ...await original<typeof import('../features/companion/canvas')>(), renderFramedPhoto: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(renderFramedPhoto).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('opens a visible in-page set of six dates, selects one, and closes without posting or stamping', async () => {
  render(<PhotosPanel eventDay={null} />);
  const picker = screen.getByRole('button', { name: /사진에 남길 행사 날짜.*날짜를 선택해주세요/ });
  expect(picker).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('group', { name: '행사 날짜 선택' })).not.toBeInTheDocument();
  fireEvent.click(picker);
  expect(picker).toHaveAttribute('aria-expanded', 'true');
  const options = screen.getByRole('group', { name: '행사 날짜 선택' });
  expect(within(options).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(within(options).getByRole('button', { name: '10월 7일 (수)' }));
  expect(picker).toHaveAttribute('aria-expanded', 'false');
  expect(picker).toHaveTextContent('10월 7일 (수)');
  expect(picker).toHaveFocus();
  expect(screen.getByText(/직접 선택한 날짜이며 촬영일이나 출석을 확인하지 않습니다/)).toBeVisible();
  expect(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' })).toBeDisabled();
  expect(localStorage.length).toBe(0);
  const fetchMock = vi.mocked(fetch);
  expect(fetchMock.mock.calls.every((call) => !call[1] || call[1].method !== 'POST')).toBe(true);
});

it('respects event-day default, permits override and Escape without resetting the chosen day', () => {
  render(<PhotosPanel eventDay={3} />);
  const picker = screen.getByRole('button', { name: /사진에 남길 행사 날짜.*10월 8일/ });
  fireEvent.click(picker);
  const options = screen.getByRole('group', { name: '행사 날짜 선택' });
  expect(within(options).getByRole('button', { name: '10월 8일 (목)' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(picker, { key: 'Escape' });
  expect(picker).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(picker);
  fireEvent.click(within(screen.getByRole('group', { name: '행사 날짜 선택' })).getByRole('button', { name: '10월 10일 (토)' }));
  expect(picker).toHaveTextContent('10월 10일 (토)');
  expect(screen.getByText(/직접 선택한 날짜이며/)).toBeVisible();
});
