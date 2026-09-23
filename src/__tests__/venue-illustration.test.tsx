import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VenueIllustration } from '../features/landing/VenueIllustration';
import { WorshipGuide } from '../features/landing/WorshipGuide';

afterEach(cleanup);

describe('illustrative venue geometry', () => {
  it('shows local zone examples, not individual seat availability', async () => {
    const user = userEvent.setup();
    render(<VenueIllustration venue="songlim" hallOpen />);
    expect(screen.getByText('실측 좌석도 아님 · 개별 빈자리 안내 아님')).toBeVisible();
    const group = screen.getByRole('group', { name: '예시 구역 선택' });
    expect(within(group).getAllByRole('button')).toHaveLength(4);
    const zone = within(group).getByRole('button', { name: '앞쪽 오른편 혼잡' });
    await user.click(zone);
    expect(zone).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('앞쪽 오른편 · 혼잡 · 예시')).toBeVisible();
  });

  it('uses confirmed landmark order and lets unknown remove the queue endpoint', async () => {
    const user = userEvent.setup();
    render(<VenueIllustration venue="songlim" />);
    const landmarks = screen.getByRole('list', { name: '송림고 입구부터 이어지는 기준점 순서' });
    expect(within(landmarks).getAllByRole('listitem').map(item => item.querySelector('strong')?.textContent)).toEqual(['송림고 입구', '동명유치원', '분당카병원', 'CU']);
    const select = screen.getByLabelText('줄 끝 예시 바꿔보기');
    expect(screen.getByText('줄 끝 · 분당카병원 부근 · 예시')).toBeVisible();
    await user.selectOptions(select, '3');
    expect(screen.getByText('줄 끝 · CU 부근 · 예시')).toBeVisible();
    await user.selectOptions(select, 'unknown');
    expect(screen.getByText('줄 끝 · 확인 중 · 예시')).toBeVisible();
    expect(landmarks.parentElement).toHaveClass('wvi-route--unknown');
    expect(landmarks.querySelector('.wvi-landmark--end')).toBeNull();
    expect(landmarks.querySelector('.wvi-landmark--filled')).toBeNull();
    expect(screen.getByText(/실제 현황은 변경되지 않으며 저장되지 않습니다/)).toBeVisible();
    await user.selectOptions(select, '0');
    expect(screen.getByText('줄 끝 · 송림고 입구 부근 · 예시')).toBeVisible();
  });

  it('keeps every gym zone unknown and does not invent a gym queue', () => {
    render(<VenueIllustration venue="gym" />);
    const group = screen.getByRole('group', { name: '예시 구역 선택' });
    for (const button of within(group).getAllByRole('button')) expect(button).toHaveTextContent('확인 중');
    expect(screen.getByText(/빈 공간을 뜻하지 않습니다/)).toBeVisible();
    expect(screen.queryByLabelText('줄 끝 예시 바꿔보기')).not.toBeInTheDocument();
  });

  it('adds diagrams only for hall and gym, resets the local demo on venue change', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<WorshipGuide selected="songlim" onSelect={onSelect} />);
    await user.selectOptions(screen.getByLabelText('줄 끝 예시 바꿔보기'), '3');
    rerender(<WorshipGuide selected="dream" onSelect={onSelect} />);
    expect(screen.queryByText('구역별 혼잡도 · 예시')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '드림센터 안내 예시' })).toBeVisible();
    rerender(<WorshipGuide selected="online" onSelect={onSelect} />);
    expect(screen.queryByText('구역별 혼잡도 · 예시')).not.toBeInTheDocument();
    rerender(<WorshipGuide selected="gym" onSelect={onSelect} />);
    expect(screen.getByRole('heading', { name: '체육관 구역 보기' })).toBeVisible();
    rerender(<WorshipGuide selected="songlim" onSelect={onSelect} />);
    expect(screen.getByLabelText('줄 끝 예시 바꿔보기')).toHaveValue('2');
  });
  it('never shows the hall queue and seat map together, and opens the gym first', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WorshipGuide selected="songlim" onSelect={onSelect} />);
    expect(screen.getByText('올해는 체육관을 먼저 개방합니다.')).toBeVisible();
    expect(screen.getByRole('heading', { name: '줄 끝은 어디쯤일까요?' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '송림본당 구역 보기' })).not.toBeInTheDocument();
    const picker = screen.getByRole('group', { name: '예배 장소 선택' });
    expect(within(picker).getByRole('button', { name: /송림본당/ })).toHaveTextContent('개방 전 · 대기 안내');
    expect(within(picker).getByRole('button', { name: /체육관/ })).toHaveTextContent('개방 · 혼잡도 확인 중');
    await user.click(screen.getByRole('button', { name: '본당 개방 후' }));
    expect(screen.getByRole('heading', { name: '송림본당 구역 보기' })).toBeVisible();
    expect(screen.queryByLabelText('줄 끝 예시 바꿔보기')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '줄 끝은 어디쯤일까요?' })).not.toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: /송림본당/ })).toHaveTextContent('개방 · 여유 있음');
    await user.click(screen.getByRole('button', { name: '본당 개방 전' }));
    expect(screen.queryByRole('heading', { name: '송림본당 구역 보기' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('줄 끝 예시 바꿔보기')).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: '체육관 안내 보기' }));
    expect(onSelect).toHaveBeenCalledWith('gym');
  });

});
