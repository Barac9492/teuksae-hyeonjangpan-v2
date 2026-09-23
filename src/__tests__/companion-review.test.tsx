import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { window.history.replaceState({}, '', '/?preview=1'); });

describe('Companion independent regression review', () => {
  it('retains a prayer draft when checking parking but shows only one accessible panel', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    await user.click(screen.getByRole('tab', { name: '기도' }));
    await user.type(screen.getByLabelText('어떤 마음으로 기도하고 있나요?'), '입력 중인 마음');
    await user.click(screen.getByRole('tab', { name: '주차' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: '주차' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: '기도' }));
    expect(screen.getByLabelText('어떤 마음으로 기도하고 있나요?')).toHaveValue('입력 중인 마음');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('keeps story composition collapsed and preserves its draft across main tabs', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<CompanionApp />);
    await user.click(screen.getByRole('tab', { name: '나눔' }));
    expect(screen.queryByRole('textbox', { name: '이야기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /한마디 남기기/ }));
    await user.type(screen.getByRole('textbox', { name: '이야기' }), '함께 기다려서 좋았습니다.');
    await user.click(screen.getByRole('tab', { name: '예배' }));
    await user.click(screen.getByRole('tab', { name: '나눔' }));
    expect(screen.getByRole('textbox', { name: '이야기' })).toHaveValue('함께 기다려서 좋았습니다.');
    await user.click(screen.getByRole('button', { name: /내 화면에 이야기 추가/ }));
    expect(screen.getByText('함께 기다려서 좋았습니다.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '이야기' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not carry Songrim parking-full state over to Dream Center', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    await user.click(screen.getByRole('button', { name: '상황 바꿔보기' }));
    const modal = screen.getByRole('dialog', { name: '상황 바꿔보기' });
    await user.click(within(modal).getByRole('checkbox', { name: /선택 장소의 모든 주차 공간 만차/ }));
    await user.click(within(modal).getByRole('button', { name: '선택한 상황 보기' }));
    await user.click(screen.getByRole('tab', { name: '주차' }));
    expect(screen.getByRole('heading', { name: '모든 주차 공간이 만차예요' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '서현 · 드림센터' }));
    expect(screen.getByRole('heading', { name: '지하층별 주차 현황을 확인해요' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '모든 주차 공간이 만차예요' })).not.toBeInTheDocument();
    expect(screen.getByText('B5')).toBeVisible();
  });

  it('retains photo preview across tabs and rejects photos over 8MB before creating an object URL', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockReturnValue('blob:review-photo');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const view = render(<CompanionApp />);
    await user.click(screen.getByRole('tab', { name: '사진' }));
    const input = screen.getByLabelText(/내 사진으로 미리보기/);
    const oversized = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 8 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['image'], 'preview.jpg', { type: 'image/jpeg' })] } });
    await user.click(screen.getByRole('tab', { name: '예배' }));
    expect(revoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: '사진' }));
    expect(screen.getByRole('img', { name: /preview.jpg/ })).toHaveAttribute('src', 'blob:review-photo');
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:review-photo');
  });
});
