import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion/CompanionApp';
import { availableSermon, latestSermonDay, sermons } from '../features/companion/sermons';

const requests: { method: string }[] = [];
beforeEach(() => {
  requests.length = 0; localStorage.clear(); window.history.replaceState(null, '', '/');
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T12:00:00+09:00'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    requests.push({ method: options?.method ?? 'GET' });
    return new Response(JSON.stringify({ enabled: true, resources: [], items: [], photoCountToday: 0, today: '2026-10-05' }));
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('only exposes reviewed, non-future content and keeps the last available sermon after the event', () => {
  expect(availableSermon(5, Date.parse('2026-10-04T14:59:59Z'))).toBeUndefined();
  expect(availableSermon(5, Date.parse('2026-10-04T15:00:00Z'))?.title).toBe('다윗의 중심');
  for (const day of [7, 8, 9, 10]) expect(availableSermon(day, Date.parse('2027-01-01'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2027-01-01'))).toBe(6);
});

it('opens the second-day sermon only from 2026-10-06 KST and keeps day one unchanged', () => {
  expect(availableSermon(6, Date.parse('2026-10-05T14:59:59Z'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2026-10-05T14:59:59Z'))).toBe(5);
  expect(availableSermon(6, Date.parse('2026-10-05T15:00:00Z'))?.title).toBe('하나님은 사람을 어떻게 준비시키시는가?');
  expect(latestSermonDay(Date.parse('2026-10-05T15:00:00Z'))).toBe(6);
  expect(availableSermon(5, Date.parse('2026-10-06T12:00:00+09:00'))?.reflectionTitle).toBe('하나님이 기뻐하신 다윗의 중심');
  expect(sermons[0].points).toEqual(['하나님을 사랑하는 마음', '하나님을 신뢰하는 마음']);
});

it('shows the second-day card by default on 10월 6일 and links the sourced prayer segment', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T12:00:00+09:00'));
  render(<CompanionApp />);
  expect(screen.getByRole('heading', { name: '하나님이 원하셨던 훈련' })).toBeVisible();
  for (const point of ['내면을 먼저 변화시켜 주심', '섬김의 훈련', '기다림과 인내를 배우게 하심']) expect(screen.getByText(point)).toBeVisible();
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  expect(document.querySelector('.tc-sermon__prayer-excerpt')).toHaveTextContent(sermons[1].prayerExcerpt.text);
  fireEvent.click(screen.getByText('말씀에서 나눈 기도 제목'));
  expect(screen.getByRole('link', { name: /말씀 44:33–44:50/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=zERW09HgidI&t=2673s');
  expect(screen.getByRole('link', { name: /설교 다시 듣기/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=zERW09HgidI');
  fireEvent.click(screen.getByRole('button', { name: '10월 5일 말씀 묵상' }));
  expect(screen.getByRole('heading', { name: '하나님이 기뻐하신 다윗의 중심' })).toBeVisible();
  expect(screen.getByRole('button', { name: '10월 7일 말씀 미등록' })).toBeVisible();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

it('selects dates without inventing later sermons and keeps the sourced prayer folded with the after-service recap first', async () => {
  render(<CompanionApp />);
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByRole('heading', { name: '하나님이 기뻐하신 다윗의 중심' })).toBeVisible();
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  expect(document.querySelector('.tc-sermon__prayer-excerpt')).toHaveTextContent(sermons[0].prayerExcerpt.text);
  expect(screen.queryByText('오늘의 묵상 질문')).not.toBeInTheDocument();
  expect(screen.queryByText('오늘 하나님께 먼저 여쭙고 싶은 일은 무엇인가요?')).not.toBeInTheDocument();
  expect(screen.queryByText('학교·집·일터에서 하나님을 사랑하고 신뢰하는 마음으로 할 수 있는 작은 일은 무엇인가요?')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('말씀에서 나눈 기도 제목'));
  expect(screen.getByRole('link', { name: /말씀 38:46–38:54/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=0e11fIrc_6s&t=2326s');
  expect(screen.getByRole('link', { name: /설교 다시 듣기/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=0e11fIrc_6s');
  const guidance = screen.getByRole('heading', { name: '지금 예배 공간은' });
  // 12:00 KST is after the service: the recap now comes before venue guidance (before-service order is covered below).
  expect(guidance.compareDocumentPosition(document.getElementById('tc-sermon-card')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '10월 6일 말씀 미등록' }));
  expect(screen.getByRole('heading', { name: '아직 등록된 말씀이 없어요' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '이 말씀으로 1분 기도하기' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '10월 5일 말씀 묵상' }));
  expect(screen.getByText('하나님을 사랑하는 마음')).toBeVisible();
  expect(screen.getByText('하나님을 신뢰하는 마음')).toBeVisible();
  await waitFor(() => expect(document.getElementById('tc-sermon-card')).toHaveFocus());
});

it('preserves running and paused timer settings across sermon reentry without starting or resetting', async () => {
  render(<CompanionApp />);
  fireEvent.click(screen.getByRole('button', { name: '이 말씀으로 1분 기도하기' }));
  expect(screen.getByRole('timer')).toHaveTextContent('01:00');
  expect(screen.getByRole('button', { name: '기도 시작' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('기도 시간'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: '기도 시작' }));
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T12:00:30+09:00'));
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  fireEvent.click(screen.getByRole('tab', { name: '예배' }));
  fireEvent.click(screen.getByRole('button', { name: '이 말씀으로 1분 기도하기' }));
  expect(screen.getByRole('timer')).toHaveTextContent('02:30');
  fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
  fireEvent.click(screen.getByRole('button', { name: '말씀으로 돌아가기' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '하나님이 기뻐하신 다윗의 중심' })).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '이 말씀으로 1분 기도하기' }));
  expect(screen.getByRole('timer')).toHaveTextContent('02:30');
  expect(screen.getByRole('button', { name: '이어서 기도' })).toBeVisible();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

it('preserves draft and opt-out through preview cancel, browser back, and reentry without submitting', async () => {
  render(<CompanionApp />);
  fireEvent.click(screen.getByRole('button', { name: '내 기도제목 적기' }));
  await waitFor(() => expect(screen.getByLabelText('어떤 마음으로 기도하고 있나요?')).toHaveFocus());
  fireEvent.change(screen.getByLabelText('어떤 마음으로 기도하고 있나요?'), { target: { value: '합성 테스트 기도 내용' } });
  fireEvent.click(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' }));
  fireEvent.click(screen.getByRole('button', { name: /입력 내용 미리보기/ }));
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  act(() => window.history.back());
  await waitFor(() => expect(screen.getByRole('heading', { name: '하나님이 기뻐하신 다윗의 중심' })).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '내 기도제목 적기' }));
  expect(screen.getByLabelText('어떤 마음으로 기도하고 있나요?')).toHaveValue('합성 테스트 기도 내용');
  expect(screen.getByRole('checkbox', { name: '함께 나누기 · 공개' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: '기도제목 공개로 올리기' })).toBeDisabled();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

it('puts the latest sermon recap first on the home screen after the service, and keeps it below guidance before the service', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T06:30:00+09:00'));
  const { unmount } = render(<CompanionApp />);
  const panel = document.getElementById('tc-panel-worship')!;
  const card = document.getElementById('tc-sermon-card')!;
  expect(document.querySelectorAll('#tc-sermon-card')).toHaveLength(1);
  expect(card).toHaveTextContent('10월 6일 새벽 말씀 다시 보기');
  expect(screen.getByRole('heading', { name: '하나님이 원하셨던 훈련' })).toBeVisible();
  const firstSection = panel.querySelector('.tc-section');
  expect(firstSection?.contains(card)).toBe(true);
  expect(card.compareDocumentPosition(screen.getByRole('heading', { name: '지금 예배 공간은' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  unmount();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T03:30:00+09:00'));
  render(<CompanionApp />);
  const beforeCard = document.getElementById('tc-sermon-card')!;
  expect(beforeCard).toHaveTextContent('10월 6일 · 말씀 묵상');
  expect(beforeCard.compareDocumentPosition(screen.getByRole('heading', { name: '지금 예배 공간은' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});
