import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';
import { REFLECTION_DRAFTS_KEY } from '../features/companion/Reflection';
import { shareText } from '../features/companion/shareText';

beforeEach(() => { window.history.replaceState({}, '', '/?preview=1'); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
it('offers all-visitor public prayer posting instead of recipient sharing', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  const user = userEvent.setup(); render(<CompanionApp />);
  await user.click(screen.getByRole('tab', { name: '기도' }));
  await user.click(screen.getByRole('button', { name: '기도제목 올리기' }));
  await user.type(screen.getByLabelText('어떤 마음으로 기도하고 있나요?'), '마음의 평안을 위해 기도해주세요.');
  expect(screen.queryByText(/이 기도제목을 내가 선택한 사람에게/)).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /함께 나누기 · 공개/ })).toBeChecked();
  expect(screen.getByRole('heading', { name: '앱에 들어온 모든 분께 공개하기' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /입력 내용 미리보기/ }));
  const dialog = screen.getByRole('dialog', { name: '내 기도 제목 미리보기' });
  expect(within(dialog).queryByRole('button', { name: '기도제목 공유 메뉴 열기' })).not.toBeInTheDocument();
  expect(within(dialog).getByText(/앱에 들어온 모든 분이 볼 수/)).toBeVisible();
  expect(share).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});
it('keeps daily reflection drafts separate and resets sharing consent on edits', async () => {
  const user = userEvent.setup(); render(<CompanionApp />);
  await user.click(screen.getByRole('tab', { name: '기도' }));
  await user.click(screen.getByRole('button', { name: '특새 묵상' }));
  await user.type(screen.getByLabelText('나의 묵상'), '먼저 듣기');
  await user.click(screen.getByRole('checkbox', { name: /모두에게 공개하는 데 동의/ }));
  await user.type(screen.getByLabelText('나의 묵상'), '.');
  expect(screen.getByRole('button', { name: '공개 접수하기 · 검수 후 게시' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('묵상할 예배일'), '6');
  expect(screen.getByLabelText('나의 묵상')).toHaveValue('');
  await user.selectOptions(screen.getByLabelText('묵상할 예배일'), '5');
  expect(screen.getByLabelText('나의 묵상')).toHaveValue('먼저 듣기.');
  expect(JSON.parse(localStorage.getItem(REFLECTION_DRAFTS_KEY)!)).toEqual({ '5': '먼저 듣기.' });
  expect(localStorage.length).toBe(1);
});
it('distinguishes the youth challenge from the church snack distribution', async () => {
  const user = userEvent.setup(); render(<CompanionApp />);
  await user.click(screen.getByRole('tab', { name: '나눔' }));
  expect(screen.getByRole('button', { name: '오병이어 챌린지' })).toBeVisible();
  expect(screen.getByText(/월·금·토 교회 간식 배부와 구분/)).toBeVisible();
});
it('reports unsupported sharing and cancellation truthfully', async () => {
  expect(await shareText('기도', '내용')).toMatch(/지원하지 않아요/);
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError')) });
  expect(await shareText('기도', '내용')).toMatch(/취소/);
});
