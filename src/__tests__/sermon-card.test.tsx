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
  expect(availableSermon(10, Date.parse('2027-01-01'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2027-01-01'))).toBe(9);
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
  expect(beforeCard).toHaveTextContent('10월 7일 · 말씀 묵상');
  expect(beforeCard.compareDocumentPosition(screen.getByRole('heading', { name: '지금 예배 공간은' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});

it('opens day three at midnight KST while keeping day two latest until then', () => {
  expect(availableSermon(7, Date.parse('2026-10-06T14:59:59Z'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2026-10-06T14:59:59Z'))).toBe(6);
  expect(availableSermon(7, Date.parse('2026-10-06T15:00:00Z'))?.title).toBe('골리앗보다 크신 하나님을 보라');
  expect(latestSermonDay(Date.parse('2026-10-06T15:00:00Z'))).toBe(7);
});

it('shows the day-three caption wording, exact prayer link, older dates and latest selection after returning from another tab', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T06:30:00+09:00'));
  render(<CompanionApp />);
  const card = document.getElementById('tc-sermon-card')!;
  expect(document.querySelector('#tc-panel-worship .tc-section')?.contains(card)).toBe(true);
  expect(card).toHaveTextContent('10월 7일 새벽 말씀 다시 보기');
  expect(screen.getByRole('heading', { name: '기름부으심이 가져다 준 세 가지 변화' })).toBeVisible();
  expect(document.querySelector('.tc-sermon__summary')).not.toBeInTheDocument();
  for (const point of ['보는 눈과 언어가 달라집니다.', '사람의 평가에 연연하지 않습니다. 끌려다니지 않습니다.', '과거의 은혜로 현재를 재해석합니다.']) expect(screen.getByText(point)).toBeVisible();
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('말씀에서 나눈 기도 제목'));
  expect(screen.getByText('우리의 눈을 열어 주님을 보게 하여 주옵소서.')).toBeVisible();
  expect(screen.getByRole('link', { name: /말씀 44:48–44:55/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=x27Jm9asHDE&t=2688s');
  expect(screen.getByRole('link', { name: /설교 다시 듣기/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=x27Jm9asHDE');
  for (const day of [5, 6] as const) {
    fireEvent.click(screen.getByRole('button', { name: `10월 ${day}일 말씀 묵상` }));
    expect(screen.getByRole('heading', { name: sermons[day - 5].reflectionTitle })).toBeVisible();
    expect(document.querySelector('.tc-sermon__summary')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: '10월 7일 말씀 묵상' }));
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('tab', { name: '기도' }));
  fireEvent.click(screen.getByRole('tab', { name: '예배' }));
  expect(screen.getByRole('heading', { name: sermons[2].reflectionTitle })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '10월 8일 말씀 미등록' }));
  expect(screen.getByRole('heading', { name: '아직 등록된 말씀이 없어요' })).toBeVisible();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

it('opens day four at midnight KST while keeping day three latest until then', () => {
  expect(availableSermon(8, Date.parse('2026-10-07T14:59:59Z'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2026-10-07T14:59:59Z'))).toBe(7);
  expect(availableSermon(8, Date.parse('2026-10-07T15:00:00Z'))?.title).toBe('사람은 관계를 통해 성숙해간다');
  expect(latestSermonDay(Date.parse('2026-10-07T15:00:00Z'))).toBe(8);
});

it('shows the day-four caption wording, exact prayer link and older dates', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T06:30:00+09:00'));
  render(<CompanionApp />);
  const card = document.getElementById('tc-sermon-card')!;
  expect(document.querySelector('#tc-panel-worship .tc-section')?.contains(card)).toBe(true);
  expect(card).toHaveTextContent('10월 8일 새벽 말씀 다시 보기');
  expect(screen.getByRole('heading', { name: '요나단을 통해 보는 참된 사랑의 특징' })).toBeVisible();
  expect(document.querySelector('.tc-sermon__summary')).not.toBeInTheDocument();
  for (const point of ['상대방이 잘될 때 기뻐하는 사랑', '자신의 권리를 내려놓는 사랑', '하나님을 더 의지하도록 도와주는 사랑']) expect(screen.getByText(point)).toBeVisible();
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('말씀에서 나눈 기도 제목'));
  expect(screen.getByText('하나님 피하기 전에 내 최선을 다해서 품을 수 있는 마음을 주시기 원합니다.')).toBeVisible();
  expect(screen.getByRole('link', { name: /말씀 43:06–43:17/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=kFLj2-Axxd0&t=2586s');
  expect(screen.getByRole('link', { name: /설교 다시 듣기/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=kFLj2-Axxd0');
  for (const day of [5, 6, 7] as const) {
    fireEvent.click(screen.getByRole('button', { name: `10월 ${day}일 말씀 묵상` }));
    expect(screen.getByRole('heading', { name: sermons[day - 5].reflectionTitle })).toBeVisible();
  }
  fireEvent.click(screen.getByRole('button', { name: '10월 9일 말씀 미등록' }));
  expect(screen.getByRole('heading', { name: '아직 등록된 말씀이 없어요' })).toBeVisible();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

it('opens the fifth event day on October 9 at midnight KST while keeping October 8 latest until then', () => {
  expect(availableSermon(9, Date.parse('2026-10-08T14:59:59Z'))).toBeUndefined();
  expect(latestSermonDay(Date.parse('2026-10-08T14:59:59Z'))).toBe(8);
  expect(availableSermon(9, Date.parse('2026-10-08T15:00:00Z'))?.title).toBe('상대방에게 끌려가지 않는 믿음');
  expect(latestSermonDay(Date.parse('2026-10-08T15:00:00Z'))).toBe(9);
});

it('shows the October 9 caption wording, exact prayer link and older dates', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T06:30:00+09:00'));
  render(<CompanionApp />);
  const card = document.getElementById('tc-sermon-card')!;
  expect(document.querySelector('#tc-panel-worship .tc-section')?.contains(card)).toBe(true);
  expect(card).toHaveTextContent('10월 9일 새벽 말씀 다시 보기');
  expect(screen.getByRole('heading', { name: '다윗이 가진 힘의 원동력' })).toBeVisible();
  expect(document.querySelector('.tc-sermon__summary')).not.toBeInTheDocument();
  for (const point of ['하나님께서 나와 함께 계신다. 이 확신.', '주권을 하나님께 맡겨 드린다. 이 믿음.']) expect(screen.getByText(point)).toBeVisible();
  expect(document.querySelector('.tc-sermon__questions')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('말씀에서 나눈 기도 제목'));
  expect(screen.getByText('하나님을 마음에 의식하고 하나님을 바라보고 그 하나님의 인도하심을 따라 혼란 없이 인생길을 걸어가는 주님의 자녀 되도록 인도하여 주시옵소서.')).toBeVisible();
  expect(screen.getByRole('link', { name: /말씀 1:04:49–1:05:02/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=AO95eBj9Yp4&t=3889s');
  expect(screen.getByRole('link', { name: /설교 다시 듣기/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=AO95eBj9Yp4');
  for (const day of [5, 6, 7, 8] as const) {
    fireEvent.click(screen.getByRole('button', { name: `10월 ${day}일 말씀 묵상` }));
    expect(screen.getByRole('heading', { name: sermons[day - 5].reflectionTitle })).toBeVisible();
  }
  fireEvent.click(screen.getByRole('button', { name: '10월 10일 말씀 미등록' }));
  expect(screen.getByRole('heading', { name: '아직 등록된 말씀이 없어요' })).toBeVisible();
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});
