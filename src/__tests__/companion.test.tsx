import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.history.replaceState({}, '', '/?preview=1');
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
});

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '상황 바꿔보기' }));
  return screen.getByRole('dialog', { name: '상황 바꿔보기' });
}

async function chooseTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('tab', { name }));
}

describe('CompanionApp', () => {
  it('has exactly five keyboard tabs and no postcard tab or panel', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    const tablist = screen.getByRole('tablist', { name: '주요 메뉴' });
    const tabLabels = within(tablist).getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabLabels).toEqual(['예배', '주차', '기도', '나눔', '사진']);
    expect(screen.queryByText('엽서')).not.toBeInTheDocument();
    const worship = screen.getByRole('tab', { name: '예배' });
    worship.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('tab', { name: '주차' })).toHaveFocus());
    expect(screen.getByRole('heading', { name: '주차 안내' })).toBeVisible();
  });

  it('previews every Songrim opening stage, combines hall floors, and distinguishes Dream floors', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    const expected = [
      '학교 밖에서 기다려주세요',
      '학교 안에서 대기해요',
      '체육관에 먼저 들어갈 수 있어요',
      '본당 입장이 시작됐어요',
      '본당 입장이 마감됐어요',
    ];
    for (let stage = 0; stage < expected.length; stage += 1) {
      const dialog = await openSettings(user);
      await user.selectOptions(within(dialog).getByLabelText('송림본당 개방 단계'), String(stage));
      await user.click(within(dialog).getByRole('button', { name: '선택한 상황 보기' }));
      expect(screen.getByRole('heading', { name: expected[stage] })).toBeVisible();
    }
    expect(screen.getByText('1·2층 통합 안내')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '서현 · 드림센터' }));
    expect(screen.getByText('3층')).toBeVisible();
    expect(screen.getByText('7층')).toBeVisible();
    expect(screen.getByText('11층')).toBeVisible();
    await chooseTab(user, '주차');
    for (const floor of ['B1', 'B2', 'B3', 'B4', 'B5']) expect(screen.getByText(floor)).toBeVisible();
  });

  it('fails closed for stale status and can preview all parking full without a live claim', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    let dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('checkbox', { name: '현황 정보가 오래된 상황' }));
    await user.click(within(dialog).getByRole('button', { name: '선택한 상황 보기' }));
    expect(screen.getByRole('heading', { name: '현장 확인을 기다리고 있어요' })).toBeVisible();
    expect(screen.queryByText('입장 중')).not.toBeInTheDocument();
    dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('checkbox', { name: '현황 정보가 오래된 상황' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /선택 장소의 모든 주차 공간 만차/ }));
    await user.click(within(dialog).getByRole('button', { name: '선택한 상황 보기' }));
    await chooseTab(user, '주차');
    expect(screen.getByRole('heading', { name: '모든 주차 공간이 만차예요' })).toBeVisible();
    expect(within(screen.getByRole('tabpanel', { name: '주차' })).getByText(/디자인 예시/)).toBeVisible();
  });

  it('keeps Songrim snack sharing outside before school opens and gates indoor hot water on gym opening', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    await chooseTab(user, '나눔');
    expect(screen.getByText('송림본당만')).toBeVisible();
    expect(screen.getByText('학교 개방 전 · 학교 밖 대기 장소')).toBeVisible();
    expect(screen.getByText(/개인 보온병에 따뜻한 물을 준비해 오시거나/)).toBeVisible();
    expect(screen.getByText(/체육관이 열린 뒤 내부 온수 정수기/)).toBeVisible();
    expect(screen.getByText(/학교 출입문만 열렸을 때는 이용할 수 없습니다/)).toBeVisible();
    expect(screen.getByText(/학교 밖에서는 뜨거운 물을 나눠드리지 않습니다/)).toBeVisible();
  });

  it('shows first-day preparation and subsequent voluntary packaged snacks without an attendance obligation', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    await chooseTab(user, '나눔');
    expect(screen.getByText('1청년부 3팀이 간식을 준비합니다.')).toBeVisible();
    const dialog = await openSettings(user);
    expect(within(dialog).getByText(/실제 날짜나 현장 상태와 무관하게/)).toBeVisible();
    await user.selectOptions(within(dialog).getByLabelText('미리 볼 예배일'), '1');
    await user.click(within(dialog).getByRole('button', { name: '선택한 상황 보기' }));
    expect(screen.getByText(/포장된 티백·사탕·캔디·과자·비스킷/)).toBeVisible();
    expect(screen.getByText(/준비하지 않으셔도 편하게 함께해 주세요/)).toBeVisible();
  });

  it('adds only session preview stories, renders text safely, limits recent cards, and supports delete and no-server hide', async () => {
    const user = userEvent.setup();
    render(<CompanionApp />);
    await chooseTab(user, '나눔');
    expect(screen.getByText('이야기를 남겨보세요. 지금은 내 화면에서만 확인할 수 있어요.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /한마디 남기기/ }));
    const storyBox = screen.getByLabelText('이야기');
    await user.type(storyBox, '<img src=x onerror=alert(1)> 고마웠어요');
    await user.click(screen.getByRole('button', { name: /내 화면에 이야기 추가/ }));
    expect(screen.getByText('<img src=x onerror=alert(1)> 고마웠어요')).toBeVisible();
    expect(document.querySelector('.tc-story-card img')).toBeNull();
    expect(screen.getByText('익명')).toBeVisible();
    expect(screen.getByText(/다른 사람에게 공개되지 않습니다/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.queryByText('<img src=x onerror=alert(1)> 고마웠어요')).not.toBeInTheDocument();
    for (const text of ['첫 이야기', '둘 이야기', '셋 이야기', '넷 이야기']) {
      await user.click(screen.getByRole('button', { name: /한마디 남기기/ }));
      await user.clear(storyBox);
      await user.type(storyBox, text);
      await user.click(screen.getByRole('button', { name: /내 화면에 이야기 추가/ }));
    }
    expect(document.querySelectorAll('.tc-story-list .tc-story-card')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /더 보기/ }));
    expect(within(screen.getByRole('dialog', { name: '내 화면의 이야기 더 보기' })).getAllByRole('article')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getAllByRole('button', { name: '숨기기·신고 체험' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('서버 신고는 접수되지 않았습니다');
  });

  it('keeps prayer private by default, previews locally, and never calls fetch', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<CompanionApp />);
    await chooseTab(user, '기도');
    const sharing = screen.getByRole('checkbox', { name: /함께 읽는 기도로 나누는 의향/ });
    expect(sharing).not.toBeChecked();
    await user.type(screen.getByLabelText('어떤 마음으로 기도하고 있나요?'), '가족을 위해 기도합니다.');
    await user.click(screen.getByRole('button', { name: /입력 내용 미리보기/ }));
    const dialog = screen.getByRole('dialog', { name: '내 기도 제목 미리보기' });
    expect(within(dialog).getByText('가족을 위해 기도합니다.')).toBeVisible();
    expect(within(dialog).getByText(/비공개 선택입니다/)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('rejects invalid photos and revokes valid object URLs on replacement and unmount', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const view = render(<CompanionApp />);
    await chooseTab(user, '사진');
    const input = screen.getByLabelText(/내 사진으로 미리보기/);
    fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.gif', { type: 'image/gif' })] } });
    expect(screen.getByRole('status')).toHaveTextContent('JPG·PNG·WebP 형식의 8MB 이하');
    expect(createObjectURL).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['one'], 'one.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByRole('img', { name: /one.jpg/ })).toHaveAttribute('src', 'blob:first');
    fireEvent.change(input, { target: { files: [new File(['two'], 'two.png', { type: 'image/png' })] } });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
  });
});
