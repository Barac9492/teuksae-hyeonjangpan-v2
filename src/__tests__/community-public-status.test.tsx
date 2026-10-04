import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Community } from '../features/companion/Community';
import type { CommunityKind } from '../features/companion/communityClient';

const feed = { enabled: true, items: [], photoCountToday: 0, today: '2026-10-01' };
const response = (body: unknown) => ({ ok: true, json: async () => body });
const receiptMessage = '서버에 접수했어요. 내 제출 기록에서 현재 상태를 확인할 수 있어요.';
const kinds: CommunityKind[] = ['prayer', 'photo', 'reflection'];

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each(kinds)('%s public status copy', kind => {
  it('shows an approved public card without a redundant status caption', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      ...feed,
      items: [{ id: 'approved', kind, text: '승인된 테스트 내용', eventDay: 0, photoUrl: '/api/community/photo?id=approved' }],
    })));
    render(<Community kind={kind} text="" payloadKey="read-only" showComposer={false} />);

    const card = await screen.findByRole('listitem');
    expect(within(card).getByText('승인된 테스트 내용')).toBeVisible();
    expect(within(card).queryByText(/공개 중|검수 후|검수 대기/)).not.toBeInTheDocument();
    expect(card.querySelector('small')).not.toBeInTheDocument();
  });

  it.each([
    ['approved', '공개 중'],
    ['rejected', '반려'],
    ['deleted', '삭제됨'],
    ...(kind === 'photo' ? [['archived', '관리자 비공개 보관 중'], ['trashed', '휴지통 (비공개)']] : []),
  ])('keeps the receipt truthful after pending becomes %s', async (nextStatus, label) => {
    let serverStatus = 'pending';
    let submissionId = '';
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options.method === 'GET') return response({
        ...feed,
        items: serverStatus === 'approved'
          ? [{ id: submissionId, kind, text: '상태 전환 테스트', eventDay: 0, photoUrl: `/api/community/photo?id=${submissionId}` }]
          : [],
      });
      const body = JSON.parse(options.body);
      if (body.action === 'status') return response({ status: serverStatus });
      submissionId = body.requestId;
      return response({ id: submissionId, status: serverStatus });
    }));
    render(<Community kind={kind} text="상태 전환 테스트" payloadKey={`${kind}-${nextStatus}`} defaultPublic={kind === 'prayer'}
      file={kind === 'photo' ? new File(['test PNG'], 'test.png', { type: 'image/png' }) : undefined} />);
    await screen.findByText(/아직 승인되어/);
    if (kind !== 'prayer') fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^(기도제목 공개로 올리기|사진 공개하기|공개 접수하기 · 검수 후 게시)$/ }));

    await screen.findByText(receiptMessage);
    fireEvent.click(screen.getByText(/내 제출 기록 \(/));
    const statusButton = screen.getAllByRole('button', { name: '상태 확인' }).at(-1)!;
    const receipt = statusButton.parentElement!;
    expect(within(receipt).getByText('· 검수 대기')).toBeVisible();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    if (kind === 'prayer') expect(screen.getByRole('button', { name: '접수 완료' })).toBeDisabled();

    serverStatus = nextStatus;
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(statusButton);
    await waitFor(() => expect(within(receipt).getByText(`· ${label}`)).toBeVisible());
    expect(within(receipt).queryByText('· 검수 대기')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(receiptMessage);
    expect(screen.getByRole('status')).not.toHaveTextContent(/검수|대기/);
    expect(screen.queryByRole('button', { name: '접수 완료 · 검수 후 게시' })).not.toBeInTheDocument();
    if (nextStatus === 'approved') {
      const card = await screen.findByRole('listitem');
      expect(within(card).getByText('상태 전환 테스트')).toBeVisible();
      expect(within(card).queryByText(/공개 중|검수 후|검수 대기/)).not.toBeInTheDocument();
      expect(card.querySelector('small')).not.toBeInTheDocument();
    } else {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    }
    if (nextStatus === 'deleted') expect(within(receipt).getByRole('button', { name: '제출 철회·삭제' })).toBeDisabled();
  });
});
