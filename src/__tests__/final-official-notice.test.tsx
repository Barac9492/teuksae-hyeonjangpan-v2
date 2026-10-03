import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { OfficialNotice, ParkingNotice } from '../features/companion/EventNotice';
import { noticeServiceDay, songrimParkingNotice } from '../features/companion/officialNotice';
import { buildCalendar } from '../features/companion/dawn';
import { WakePlanner } from '../features/companion/worship';
import { LiveParkingPanel } from '../features/companion/LiveOperations';
afterEach(cleanup);

it('selects the parking rule at Korea midnight, not the browser timezone', () => {
  expect(noticeServiceDay(Date.parse('2026-10-04T14:59:59Z'))).toBeNull();
  expect(noticeServiceDay(Date.parse('2026-10-04T15:00:00Z'))).toBe(5);
  expect(noticeServiceDay(Date.parse('2026-10-08T15:00:00Z'))).toBe(9);
  expect(noticeServiceDay(Date.parse('2026-10-10T15:00:00Z'))).toBeNull();
  expect(noticeServiceDay(NaN)).toBeNull();
});
it.each([5, 9])('overrides the weekday exit rule for October %s', day => {
  const text = songrimParkingNotice(day);
  expect(text).toMatch(/정상 진행/); expect(text).toMatch(/종일 주차/);
  expect(text).toMatch(/자율 출차 불가/); expect(text).toMatch(/선입선출/);
  expect(text).toMatch(/중간 출차.*드림센터/); expect(text).not.toMatch(/06:45/);
});
it.each([6, 7, 8])('keeps the school field exit deadline on October %s', day => {
  expect(songrimParkingNotice(day)).toMatch(/송림학교 운동장.*06:45까지 출차/);
  expect(songrimParkingNotice(day)).not.toMatch(/종일 주차/);
});
it('does not invent a Saturday departure deadline or all-day permission', () => {
  expect(songrimParkingNotice(10)).toMatch(/현장 안내/);
  expect(songrimParkingNotice(10)).not.toMatch(/06:45|종일 주차/);
});
it('places each date-specific rule in its own downloaded calendar event', () => {
  const events = buildCalendar(70, '송림본당 (이매)').split('BEGIN:VEVENT').slice(1);
  expect(events).toHaveLength(6);
  for (const [index, event] of events.entries()) {
    expect(event).toMatch(/3시 50분 전후/); expect(event).toMatch(/04:30 준비기도/);
    if (index === 0 || index === 4) { expect(event).toMatch(/종일 주차/); expect(event).not.toMatch(/06:45/); }
    if ([1, 2, 3].includes(index)) expect(event).toMatch(/06:45/);
    if (index === 5) expect(event).not.toMatch(/06:45|종일 주차/);
  }
  const dreamCalendar = buildCalendar(70, '서현 드림센터');
  expect(dreamCalendar).not.toMatch(/06:45/);
  expect(dreamCalendar).toMatch(/드림센터는 예배 중간 출차가 필요한 분께 공식 안내된 주차장/);
  expect(dreamCalendar).not.toMatch(/필요하면 드림센터를 이용해주세요/);
});
it('shows the final times, holiday exception and changed Friday service without guessed links', () => {
  const view = render(<OfficialNotice />);
  fireEvent.click(screen.getByText(/2026 가을특별새벽부흥회 · 최종 공지/));
  expect(view.container.textContent).toMatch(/3시 50분 전후/);
  expect(view.container.textContent).toMatch(/04:20.*생중계/);
  expect(view.container.textContent).toMatch(/04:30 준비기도/);
  expect(view.container.textContent).toMatch(/이찬수 담임목사/);
  expect(view.container.textContent).toMatch(/10월 9일\(금\) 금요기도회는 한 주 쉽니다/);
  expect(view.container.textContent).toMatch(/10월 4일\(주일\)/);
  expect(view.container.querySelector('a')).toBeNull();
});
it('aligns the existing wake planner arrival buffer and holiday parking', () => {
  render(<WakePlanner venue="songrim" day={9} />);
  fireEvent.click(screen.getByText('몇 시에 일어나면 될까요?'));
  expect(screen.getByText(/계산한 도착 시간/)).toHaveTextContent('04:20');
  fireEvent.change(screen.getByRole('slider', { name: /도착 후 여유/ }), { target: { value: '5' } });
  expect(screen.getByText(/계산한 도착 시간/)).toHaveTextContent('04:35');
  expect(screen.getByText(/계산한 도착 시간/)).toHaveTextContent('10분 이상');
  const notice = screen.getByRole('complementary', { name: '공식 주차 일정' });
  expect(notice).toHaveTextContent('종일 주차'); expect(notice).not.toHaveTextContent('06:45');
});
it('keeps official guidance separate from unavailable live parking data', () => {
  render(<LiveParkingPanel venue="songrim" setVenue={() => {}} operations={{ now: Date.parse('2026-10-09T04:30:00+09:00'), enabled: false, offline: true, confirmed: false, lastSync: null, resources: [] }} />);
  expect(screen.getByText('연결 확인 중')).toBeVisible();
  expect(screen.getByText('확인 필요')).toBeVisible();
  expect(within(screen.getByRole('complementary', { name: '공식 주차 일정' })).getByText(/자율 출차 불가/)).toBeVisible();
});
it('does not carry Songrim school or holiday restrictions into Dream Center', () => {
  render(<ParkingNotice venue="dream" day={9} />);
  expect(screen.getByRole('complementary')).toHaveTextContent('드림센터는 예배 중간 출차가 필요한 분께 공식 안내된 주차장입니다.');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('필요하면 드림센터를 이용해주세요');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('자율 출차 불가');
});
