import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { LandingPage } from '../features/landing/LandingPage';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function close(this: HTMLDialogElement) { this.removeAttribute('open'); }),
  });
});

afterEach(cleanup);

describe('우리 illustrative landing page', () => {
  it('keeps the four exact sections and all venue states visible on the worship screen', () => {
    render(<LandingPage />);
    const nav = screen.getByRole('navigation', { name: '우리 메뉴' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['우리 예배', '우리 나눔', '우리 엽서', '우리 사진']);
    expect(screen.getByRole('heading', { level: 1, name: '우리' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: '예배 전 나눔 안내' })).toHaveTextContent('티백과 낱개 포장된 사탕·캔디·과자·비스킷만');
    expect(screen.getByRole('complementary', { name: '예배 전 나눔 안내' })).toHaveTextContent('소비기한과 알레르기');
    expect(screen.queryByText(/예배 후에도|예배 뒤, 따뜻한 차|자리를 정리/)).not.toBeInTheDocument();
    expect(screen.getByText('본당 입장을 기다리는 동안, 테이블 위에 포장 간식을 놓아 서로 나눠요.')).toBeVisible();
    expect(screen.getByRole('heading', { name: /기다리는 동안,.*함께 나눠요/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /묻고 싶었던 이야기.*함께 읽는 답장/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /오늘의 새벽을.*함께 남겨요/ })).toBeVisible();
    expect(screen.getByText('오늘 예배 일정 · 추후 안내')).toBeVisible();
    expect(screen.getByText('상태와 시간은 모두 예시')).toBeVisible();
    const picker = screen.getByRole('group', { name: '예배 장소 선택' });
    for (const venue of ['송림본당', '드림센터', '체육관', '온라인']) expect(within(picker).getByRole('button', { name: new RegExp(venue) })).toBeVisible();
  });

  it('opens inline example guidance without presenting online as live', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    await user.click(screen.getByRole('button', { name: /온라인/ }));
    expect(screen.getByText('온라인 예배 안내 예시')).toBeVisible();
    expect(screen.getByText('라이브 아님')).toBeVisible();
    expect(screen.queryByRole('link', { name: /방송|예배 보기/ })).not.toBeInTheDocument();
    const detailButton = screen.getByRole('button', { name: '예배 준비 예시 보기' });
    await user.click(detailButton);
    expect(detailButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('현재 연결되는 방송이나 예배 링크는 없습니다. 공식 채널의 확정 공지를 확인해주세요.')).toBeVisible();
  });

  it('opens a sharing notice and creates a session-only example without categories', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    await user.click(screen.getByRole('button', { name: /기다리시는 분들을 위해 티백을 놓아둘게요/ }));
    expect(screen.getByRole('dialog', { name: '기다리시는 분들을 위해 티백을 놓아둘게요' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: '나눔 예시 만들기' }));
    const form = screen.getByRole('form', { name: '나눔 예시 체험' });
    await user.type(within(form).getByLabelText('안내 제목'), '낱개 포장 사탕을 나눠요');
    await user.type(within(form).getByLabelText('짧은 안내'), '예배 전에 미개봉 사탕을 나누는 가상 안내입니다.');
    const rules = within(form).getByRole('checkbox', { name: /본당 대기줄의 테이블에서 안내된 낱개 포장 제품만/ });
    expect(rules).toBeRequired();
    await user.click(rules);
    await user.click(within(form).getByRole('button', { name: '화면에만 추가' }));
    expect(screen.getByRole('button', { name: /낱개 포장 사탕을 나눠요/ })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('전송되지 않았습니다');
    expect(screen.queryByRole('button', { name: /카풀|음식|물품/ })).not.toBeInTheDocument();
  });

  it('turns and browses fictional postcards and clearly does not send the form', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const card = screen.getByRole('button', { name: '답장 면 보기' });
    expect(card).toHaveTextContent('진로를 아직 정하지 못했어요');
    await user.click(card);
    expect(screen.getByRole('button', { name: '질문 면 보기' })).toHaveTextContent('저도 오래 헤맸습니다');
    await user.click(screen.getByRole('button', { name: '다음 엽서' }));
    expect(screen.getByRole('button', { name: '답장 면 보기' })).toHaveTextContent('미안하다고');
    await user.click(screen.getByRole('button', { name: '엽서 예시 써보기' }));
    const form = screen.getByRole('form', { name: '엽서 예시 체험' });
    expect(within(form).getByLabelText('가상의 질문')).toHaveAttribute('maxlength', '100');
    await user.type(within(form).getByLabelText('가상의 질문'), '가상 질문입니다.');
    await user.type(within(form).getByLabelText('가상의 답장'), '가상 답장입니다.');
    await user.click(within(form).getByRole('button', { name: '전송 없이 확인' }));
    const authoredCard = screen.getByRole('button', { name: '답장 면 보기' });
    expect(authoredCard).toHaveTextContent('내가 쓴 가상 예시');
    expect(authoredCard).toHaveTextContent('가상 질문입니다.');
    expect(screen.getByRole('status')).toHaveTextContent('저장되거나 전송되지 않았습니다');
    await user.click(authoredCard);
    expect(screen.getByRole('button', { name: '질문 면 보기' })).toHaveTextContent('가상 답장입니다.');
    await user.click(screen.getByRole('button', { name: '내 예시 지우기' }));
    expect(screen.getByRole('button', { name: '답장 면 보기' })).toHaveTextContent('진로를 아직 정하지 못했어요');
    expect(screen.queryByRole('button', { name: '내 예시 지우기' })).not.toBeInTheDocument();
  });

  it('opens the gallery dialog, closes with Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const opener = screen.getByRole('button', { name: /2026.03.22 크게 보기/ });
    opener.focus();
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: '사진 크게 보기' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    const closeButton = screen.getByRole('button', { name: '닫기' });
    closeButton.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '사진 크게 보기' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps selected photo previews local, rejects invalid and oversized files, and revokes object URLs', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<LandingPage />);
    const input = screen.getByLabelText('사진 선택');
    await user.upload(input, new File(['plain'], 'note.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG, WebP');

    const tooLarge = new File(['image'], 'too-large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(tooLarge, 'size', { value: 8 * 1024 * 1024 + 1 });
    await user.upload(input, tooLarge);
    expect(screen.getByRole('alert')).toHaveTextContent('8MB 이하');
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    const selectedFile = new File(['image'], 'dawn.jpg', { type: 'image/jpeg' });
    await user.upload(input, selectedFile);
    expect(screen.getByAltText('선택한 사진의 로컬 미리보기')).toHaveAttribute('src', 'blob:local-preview');
    expect(screen.getByText(/이 화면에만 표시됨, 전송되지 않음/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '미리보기 지우기' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
    expect(input).toHaveValue('');
    await user.upload(input, selectedFile);
    expect(screen.getByAltText('선택한 사진의 로컬 미리보기')).toBeVisible();
  });
});
