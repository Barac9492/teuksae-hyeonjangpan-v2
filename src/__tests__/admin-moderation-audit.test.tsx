import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { REQUEST_TIMEOUT_MS } from '../lib/requestDeadline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { AdminApp } from '../features/admin';
import { ModerationAuditLog } from '../features/admin/ModerationAuditLog';

const entries = [
    { id: 2, itemId: '4bce9a0d-7086-487b-8906-c0b4cb80c071', decision: 'approved', actor: 'WOORI7', actorLabel: '관리자', sessionLabel: 'S-49ADD737AB', displayName: '김집사', createdAt: '2026-10-04T05:00:28Z', kind: 'prayer', excerpt: '하나님이 살려놓으신 건강 끝까지 지켜주세요.' },
    { id: 1, itemId: '73747ad2-1d6b-4b3f-999d-c5e249a55cea', decision: 'rejected', actor: 'WOORI7', actorLabel: '관리자', sessionLabel: null, displayName: null, createdAt: '2026-10-03T05:00:00Z', kind: 'photo', excerpt: null },
];
const open = (container: HTMLElement) => { const d = container.querySelector('details')!; d.open = true; fireEvent(d, new Event('toggle')); };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('moderation audit log', () => {
    it('is collapsed by default and does not load until opened', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<ModerationAuditLog />);
        expect(container.querySelector('details')?.open).toBe(false);
        expect(screen.getByText('기도카드·사진 승인 기록')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads on open and shows who made each decision', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: entries }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<ModerationAuditLog />);
        open(container);
        await screen.findByText('공개 승인');
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/community?view=audit', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
        const rows = container.querySelectorAll('.ta-admin__history p');
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('김집사');
        expect(rows[0].textContent).toContain('WOORI7');
        expect(rows[0].textContent).toContain('세션 S-49ADD737AB');
        expect(rows[0].textContent).toContain('하나님이 살려놓으신');
        expect(rows[0].textContent).toContain('게시물 4bce9a0d');
        expect(rows[1].textContent).toContain('비공개 처리');
        expect(rows[1].textContent).toContain('이름 기록 없음(기록 추가 전)');
        expect(rows[1].textContent).toContain('사진');
        // Opening again does not refetch automatically.
        const d = container.querySelector('details')!; d.open = false; fireEvent(d, new Event('toggle')); open(container);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('shows the server error and allows retry', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: '승인 기록 DB 업데이트가 필요합니다.' }), { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<ModerationAuditLog />);
        open(container);
        expect(await screen.findByRole('alert')).toHaveTextContent('승인 기록 DB 업데이트가 필요합니다.');
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        await waitFor(() => expect(screen.getByText('승인 기록이 없습니다.')).toBeInTheDocument());
    });

    it.each([['superadmin', true], ['parking', false], ['space', false]] as const)('history tab for %s shows the collapsed log: %s', async (role, visible) => {
        const session = { authenticated: true, username: 'QA', role, displayName: '로컬', sessionId: 'S-QA', expiresAt: '2030-01-01', capabilities: { liveOperations: true } };
        const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/session') ? session : { resources: [], history: [], canManageAccounts: role === 'superadmin', accounts: [] })));
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<AdminApp />);
        await userEvent.click(await screen.findByRole('tab', { name: '변경 기록' }));
        expect(screen.getByRole('heading', { name: '최근 변경 기록' })).toBeInTheDocument();
        expect(!!screen.queryByText('기도카드·사진 승인 기록')).toBe(visible);
        if (visible) expect(container.querySelector('details.ta-admin__audit')?.hasAttribute('open')).toBe(false);
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('view=audit'))).toBe(false);
    });

    it('releases a hung request after the deadline with a retry control', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
        const { container } = render(<ModerationAuditLog />);
        open(container);
        expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
        await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1); });
        expect(screen.getByRole('alert')).toHaveTextContent('연결을 중단');
        expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
    });

    it('drops malformed entries instead of rendering them', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ nope: 1 }, entries[0]] }), { status: 200 })));
        const { container } = render(<ModerationAuditLog />);
        open(container);
        await screen.findByText('공개 승인');
        expect(container.querySelectorAll('.ta-admin__history p')).toHaveLength(1);
    });
});
