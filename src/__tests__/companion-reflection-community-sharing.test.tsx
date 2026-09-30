import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import { REFLECTION_DRAFTS_KEY, Reflection } from '../features/companion/Reflection';
import { SharingPanel } from '../features/companion/sharing';

const response = (value: unknown) => ({ ok: true, json: async () => value }) as Response;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T14:59:59.000Z'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('reflection local-device drafts', () => {
  it('automatically restores a private per-day draft after remounting', () => {
    const first = render(<Reflection />);
    const textarea = screen.getByLabelText('나의 묵상');
    fireEvent.change(textarea, { target: { value: '오늘의 묵상 초안' } });

    expect(JSON.parse(window.localStorage.getItem(REFLECTION_DRAFTS_KEY)!)).toEqual({ '5': '오늘의 묵상 초안' });
    expect(screen.getByText(/이 기기에 자동 임시저장됩니다/)).toBeVisible();
    expect(screen.getByText('묵상 초안은 이 기기에만 저장됩니다.')).toBeVisible();
    fireEvent.click(screen.getByText('ⓘ 저장·공개 안내'));
    expect(screen.getByText(/공개 접수 전까지 서버로 전송되지 않습니다/)).toBeVisible();

    first.unmount();
    render(<Reflection />);
    expect(screen.getByLabelText('나의 묵상')).toHaveValue('오늘의 묵상 초안');
  });

  it('keeps the current input but honestly warns when automatic storage fails', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    render(<Reflection />);
    fireEvent.change(screen.getByLabelText('나의 묵상'), { target: { value: '저장 실패 중인 초안' } });

    expect(screen.getByLabelText('나의 묵상')).toHaveValue('저장 실패 중인 초안');
    expect(screen.getByRole('alert')).toHaveTextContent('새로고침하거나 닫으면 사라질 수 있어요');
    expect(screen.getByRole('alert')).toHaveTextContent('직접 복사해주세요');
  });
});

describe('community sharing is open before the calendar launch date, with consent unaffected', () => {
  it('shows real feed counts and content and permits a consented submission before Oct 5, with no date gate copy', async () => {
    const fetchSpy = vi.fn(async () => response({
      enabled: true,
      photoCountToday: 3,
      today: '2026-10-04',
      items: [{ id: 'rehearsal-photo', kind: 'photo', text: '사전 점검 사진', eventDay: null, createdAt: '2026-10-04T01:00:00Z' }],
    }));
    vi.stubGlobal('fetch', fetchSpy);

    render(<Community kind="photo" text="사전 점검 초안" file={new File(['png'], 'before.png', { type: 'image/png' })} payloadKey="before-event" />);
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('오늘 사진 참여 3건')).toBeVisible();
    expect(screen.getByText('사전 점검 사진')).toBeVisible();
    expect(screen.queryByText(/10월 5일부터/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '앱에 들어온 모든 분께 공개하기' })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: '모두에게 공개하는 데 동의합니다.' }));
    expect(screen.getByRole('button', { name: '공개 접수하기 · 검수 후 게시' })).not.toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the live feed at launch and keeps full disclosure in accessible details', async () => {
    vi.setSystemTime(new Date('2026-10-04T15:00:00.000Z'));
    vi.stubGlobal('fetch', vi.fn(async () => response({
      enabled: true,
      photoCountToday: 3,
      today: '2026-10-05',
      items: [{ id: 'launch-photo', kind: 'photo', text: '첫날 사진', eventDay: 0, createdAt: '2026-10-04T15:01:00Z' }],
    })));

    render(<Community kind="photo" text="첫날" file={new File(['png'], 'photo.png', { type: 'image/png' })} payloadKey="launch" />);
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('오늘 사진 참여 3건')).toBeVisible();
    expect(screen.getByText('첫날 사진')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: '모두에게 공개하는 데 동의합니다.' })).not.toBeChecked();
    const details = screen.getByText('공개 범위와 삭제 한계 자세히 보기').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('공개 범위와 삭제 한계 자세히 보기'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(/캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다/)).toBeVisible();
    expect(screen.getByText(/미성년자는 보호자 동의를 확인했습니다/)).toBeVisible();
  });
});

describe('local memo and unconfirmed schedule copy', () => {
  const baseProps = {
    eventDay: 0,
    stories: [],
    onAddStory: vi.fn(() => null),
    onDeleteStory: vi.fn(),
    onHideStory: vi.fn(),
    onMoreStories: vi.fn(),
    setView: vi.fn(),
    venue: 'songrim' as const,
    setVenue: vi.fn(),
  };

  it('labels the local notes as 나만 보는 메모 and never presents them as public sharing', () => {
    const { container } = render(<SharingPanel {...baseProps} view="snacks" />);
    expect(screen.getByRole('heading', { name: '나만 보는 메모' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /메모 작성하기/ }));
    expect(screen.getByLabelText('메모')).toBeVisible();
    expect(screen.getByText('이 메모는 서버로 전송하거나 공개하지 않아요.')).toBeVisible();
    expect(screen.getByRole('button', { name: /나만 보는 메모에 추가/ })).toBeVisible();
    expect(container).not.toHaveTextContent('오늘 나눈 이야기');
    expect(container).not.toHaveTextContent('공개될 글이라고 생각하고');
  });

  it('gives organizer-confirmation guidance without inventing snack or service times', () => {
    const view = render(<SharingPanel {...baseProps} view="snacks" />);
    expect(screen.getByText(/정확한 학교 밖 위치와 시작·마감 시각은 주최팀 확인 전입니다/)).toBeVisible();
    expect(screen.getByText(/확인 전에는 임의의 장소나 시각을 안내하지 않습니다/)).toBeVisible();
    // youth-team/picket reveal copy is hidden from public views (see sharing.tsx footnote).
    expect(screen.queryByText(/1청년부|피켓/)).not.toBeInTheDocument();

    view.rerender(<SharingPanel {...baseProps} view="breakfast" />);
    expect(screen.getByText(/예배 종료 시각은 주최 측 공식 확인 전이라 안내하지 않습니다/)).toBeVisible();
    expect(screen.getByText(/이동은 당일 예배 안내를 따르고/)).toBeVisible();
  });
});
