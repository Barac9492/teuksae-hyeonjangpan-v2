import { useState } from 'react';
import { RequestTimeoutError, requestWithDeadline } from '../../lib/requestDeadline';

type AuditEntry = {
    id: number | string;
    itemId: string;
    decision: string;
    actor: string;
    actorLabel?: string | null;
    sessionLabel?: string | null;
    displayName?: string | null;
    createdAt: string;
    kind?: string | null;
    excerpt?: string | null;
    publicationMode?: string | null;
    publicTextLength?:number|null;
    publicTextChanged?:boolean|null;
};

const decisionNames: Record<string, string> = { reviewed_approved: '공개 문구 게시', masked_approved: '가림 처리본 게시', approved: '공개 승인', rejected: '비공개 처리', deleted: '영구 삭제', trashed: '휴지통 이동', restored: '휴지통에서 복원', archived: '사진 비공개 보관', unarchived: '보관 사진 검토 대기로 이동' };
const kindNames: Record<string, string> = { prayer: '기도카드', reflection: '기도카드', photo: '사진' };
const when = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '시간 확인 불가' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Seoul' }).format(d); };
const validEntry = (x: unknown): x is AuditEntry => !!x && typeof x === 'object' && typeof (x as AuditEntry).itemId === 'string' && typeof (x as AuditEntry).decision === 'string' && typeof (x as AuditEntry).actor === 'string' && typeof (x as AuditEntry).createdAt === 'string';

/** Collapsed by default; loads only when an administrator opens it. */
export function ModerationAuditLog() {
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [items, setItems] = useState<AuditEntry[]>([]);
    const [message, setMessage] = useState('');
    const load = async () => {
        setState('loading'); setMessage('');
        try {
            const { r, body } = await requestWithDeadline(async signal => {
                const r = await fetch('/api/admin/community?view=audit', { signal, credentials: 'same-origin', cache: 'no-store' });
                let body: { items?: unknown; error?: unknown } = {};
                try { body = await r.json(); } catch { /* handled below */ }
                return { r, body };
            });
            if (!r.ok || !Array.isArray(body.items)) { setMessage(typeof body.error === 'string' ? body.error : '승인 기록을 불러오지 못했습니다.'); setState('error'); return; }
            setItems(body.items.filter(validEntry)); setState('ready');
        } catch (e) { setMessage(e instanceof RequestTimeoutError ? e.message : '승인 기록을 불러오지 못했습니다. 연결을 확인해주세요.'); setState('error'); }
    };
    return <details className="ta-admin__group ta-admin__audit" onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && state === 'idle') void load(); }}>
        <summary><h2>기도카드·사진 승인 기록 <span>펼쳐서 보기 · 최근 100건</span></h2></summary>
        <p>누가 어떤 게시물을 공개·비공개 보관·검토 대기·휴지통·삭제 처리했는지 남깁니다. 이름은 로그인할 때 입력한 담당자 이름입니다(본인 확인 아님). 기록은 삭제되지 않습니다.</p>
        {state === 'loading' && <p role="status">불러오는 중…</p>}
        {state === 'error' && <p className="ta-admin__alert" role="alert">{message} <button type="button" className="ta-admin__secondary" onClick={() => void load()}>다시 시도</button></p>}
        {state === 'ready' && <>
            <button type="button" className="ta-admin__secondary" onClick={() => void load()}>새로고침</button>
            {items.length === 0 ? <p>승인 기록이 없습니다.</p> : <div className="ta-admin__history">{items.map(h => <p key={String(h.id)}>
                {when(h.createdAt)} · <strong>{decisionNames[h.decision] ?? h.decision}</strong>{h.publicationMode ? ` · ${h.publicationMode === 'manual' ? '직접 수정' : '자동 가림'} · 공개 ${h.publicTextLength ?? '?'}자 · ${h.publicTextChanged ? '원문과 다름' : '원문과 같음'}` : ''} · {kindNames[h.kind ?? ''] ?? '게시물'}{h.excerpt ? ` “${h.excerpt}${h.excerpt.length >= 60 ? '…' : ''}”` : ''} · 처리: {h.displayName ? <strong>{h.displayName}</strong> : '이름 기록 없음(기록 추가 전)'} ({h.actor}{h.actorLabel && h.actorLabel !== h.displayName ? ` · ${h.actorLabel}` : ''}){h.sessionLabel ? ` · 세션 ${h.sessionLabel}` : ''} · 게시물 {h.itemId.slice(0, 8)}
            </p>)}</div>}
        </>}
    </details>;
}
