import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SharingPanel } from '../features/companion/sharing';
import { restaurants } from '../features/companion/restaurants';
import type { Venue } from '../features/companion/ui';

afterEach(cleanup);
function panel(venue: Venue, setVenue = vi.fn()) {
  return <SharingPanel eventDay={0} stories={[]} onAddStory={() => null} onDeleteStory={vi.fn()} onHideStory={vi.fn()} onMoreStories={vi.fn()} view="breakfast" setView={vi.fn()} venue={venue} setVenue={setVenue} />;
}
it('shows three Yatap options without claiming they are walkable from Songrim', () => {
  render(panel('songrim'));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByText(/송림본당 바로 앞이나 도보권 추천은 아닙니다/)).toBeVisible();
  for (const restaurant of restaurants.songrim) {
    const card = within(screen.getByRole('article', { name: restaurant.name }));
    expect(card.getByRole('link', { name: '전화 확인' })).toHaveAttribute('href', `tel:${restaurant.phone}`);
    expect(card.getByRole('link', { name: /참고 자료/ })).toHaveAttribute('href', restaurant.source);
    expect(card.getByRole('link', { name: /지도·영업정보/ })).toHaveAttribute('href', restaurant.map);
  }
});
it('shows Seohyeon opening exceptions even on the first event day', () => {
  render(panel('dream'));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByText(/10\/5\(월\)은 오전 9시 개점/)).toBeVisible();
  expect(screen.getByText('매일 06:00~22:00 안내')).toBeVisible();
  expect(screen.getByText(/지금 영업 중.*뜻하지 않으며/)).toBeVisible();
  expect(screen.queryByText('역전국밥 야탑점')).not.toBeInTheDocument();
});
it('switches the breakfast region without mixing restaurants', async () => {
  const setVenue = vi.fn();
  const { rerender } = render(panel('songrim', setVenue));
  await userEvent.click(screen.getByRole('button', { name: '서현 · 드림센터' }));
  expect(setVenue).toHaveBeenCalledWith('dream');
  rerender(panel('dream', setVenue));
  expect(screen.getByRole('article', { name: '전주현대옥 분당서현역점' })).toBeVisible();
  expect(screen.queryByRole('article', { name: '유치회관 야탑직영점' })).not.toBeInTheDocument();
});
