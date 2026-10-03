import { requestWithDeadline } from '../../lib/requestDeadline';
import { foregroundPolling } from '../companion/polling';
import { CommunityModeration } from './CommunityModeration';
import { useCallback, useEffect, useRef, useState } from 'react';
type Role = 'superadmin' | 'parking' | 'space';
type Capabilities = {
    liveOperations: boolean;
    photoReview: boolean;
    prayerInbox: boolean;
    sharingModeration: boolean;
};
type Session = {
    username: string;
    role: Role;
    displayName: string;
    expiresAt: string;
    sessionId: string;
    capabilities: Capabilities;
};
type Resource = {
    id: string;
    label: string;
    category: 'parking' | 'space';
    state: string;
    version: number;
    updatedAt: string | null;
    occupancyPercent?: number | null;
    guideFloor?: number | null;
    lastClosedAt?: string | null;
    lastFullAt?: string | null;
};
type History = {
    id: string;
    resourceId: string;
    beforeState: string;
    beforeOccupancyPercent?: number | null;
    afterOccupancyPercent?: number | null;
    afterState: string;
    beforeGuideFloor?: number | null;
    afterGuideFloor?: number | null;
    actorUsername: string;
    actorLabel: string;
    sessionLabel: string;
    createdAt: string;
};
type Operations = {
    resources: Resource[];
    history: History[];
    canManageAccounts: boolean;
    publicResources?: Resource[];
};
type Account = {
    username: string;
    role: Role;
    displayLabel: string;
    active: boolean;
    hasPassword: boolean;
};
type Draft = {
    state: string;
    baseVersion: number;
    occupancyPercent?: string;
    guideFloor?: string;
    requestId?: string;
    selectedAt?: number;
};
type AdminTab = 'dashboard' | 'parking' | 'guidance' | 'prayer' | 'photo' | 'trash' | 'history' | 'accounts';
const tabNames: Record<AdminTab, string> = {dashboard:'현황판',parking:'주차',guidance:'안내',prayer:'기도카드 승인',photo:'사진 승인',trash:'휴지통',history:'변경 기록',accounts:'계정 관리'};
type Screen = 'checking' | 'login' | 'dashboard' | 'unavailable';
type ApiSession = Partial<Session> & {
    authenticated?: boolean;
};
const noCapabilities: Capabilities = { liveOperations: false, photoReview: false, prayerInbox: false, sharingModeration: false };
const hasOccupancySchema = (r: Resource) => Object.prototype.hasOwnProperty.call(r, 'occupancyPercent');
const occupancySteps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
const isCapacityResource = (r: Resource) => r.id !== 'parking.dream' && r.id !== 'space.songrim.access' && hasOccupancySchema(r);
const needsOccupancySelection = (r: Resource) => isCapacityResource(r) && r.occupancyPercent == null && !['checking', 'closed'].includes(r.state);
const occupancyState = (percent: number): 'available' | 'busy' | 'full' => percent <= 60 ? 'available' : percent <= 90 ? 'busy' : 'full';
const capacityState = (state: string, percent: number | null): string => state === 'closed' ? 'closed' : percent === null ? 'checking' : occupancyState(percent);
const normal = ['checking', 'closed', 'available', 'busy', 'full'];
const parseJson = async (r: Response): Promise<Record<string, unknown>> => { try {
    return await r.json() as Record<string, unknown>;
}
catch {
    return {};
} };
const valid = (x: ApiSession): x is ApiSession & Required<Pick<Session, 'username' | 'role' | 'displayName' | 'expiresAt' | 'sessionId'>> => x.authenticated === true && typeof x.username === 'string' && ['superadmin', 'parking', 'space'].includes(String(x.role)) && typeof x.displayName === 'string' && typeof x.expiresAt === 'string' && typeof x.sessionId === 'string';
const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '시간 확인 불가' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(d); };
const time = (value: string | null) => { if (!value)
    return '기록 없음'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '시간 확인 불가' : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(d); };
const stale = (value: string | null) => !!value && (!Number.isFinite(new Date(value).getTime()) || Date.now() - new Date(value).getTime() > 600000);
const choices = (r: Resource) => r.id === 'space.songrim.access' ? ['checking', 'closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed'] : normal;
const label = (r: Resource, state: string) => { if (state === 'checking')
    return '현장 확인 전'; if (r.id === 'space.songrim.access')
    return ({ closed: '학교 개방 전', school_open: '학교만 개방', gym_open: '체육관 먼저 개방', hall_open: '본당 입장 중', hall_closed: '본당 입장 마감' }[state] ?? state); if (state === 'closed')
    return r.category === 'parking' ? '이용 불가' : '미개방'; if (state === 'available')
    return '이용 가능'; if (state === 'busy')
    return '혼잡'; if (state === 'full')
    return r.category === 'parking' ? '만차' : '입장 마감'; return state; };
const currentLabel = (r: Resource) => r.id === 'parking.dream' && r.state === 'available' && r.guideFloor != null ? `B${r.guideFloor}층으로 안내 중` : isCapacityResource(r) && r.occupancyPercent != null ? `${r.occupancyPercent}% · ${label(r, capacityState(r.state, r.occupancyPercent))}` : label(r, r.state);
const needsFreshSelection = (r: Resource) => !r.updatedAt || stale(r.updatedAt);
const draftSelectionExpired = (r: Resource, draft?: Draft) => !!draft && needsFreshSelection(r) && (!draft.selectedAt || Date.now() - draft.selectedAt > 600000);
const needsExplicitSelection = (r: Resource, draft?: Draft) => (!draft && (needsFreshSelection(r) || needsOccupancySelection(r))) || draftSelectionExpired(r, draft);
const overviewOrder = ['space.songrim.access', 'space.songrim.hall', 'space.songrim.gym', 'space.dream.f11', 'space.dream.f7', 'space.dream.f3', 'parking.songrim', 'parking.dream'];
const group = (r: Resource) => r.id === 'parking.calvary' ? '갈보리교회' : r.id.startsWith('parking.songrim') ? '송림본당' : r.id.startsWith('parking.dream') ? '드림센터' : r.id.startsWith('space.songrim') ? '송림본당' : r.id.startsWith('space.dream') ? '드림센터' : r.category === 'parking' ? '주차' : '예배 공간';
export function AdminApp() {
    const [tab, setTab] = useState<AdminTab>('dashboard');
    const [historyPage, setHistoryPage] = useState(0);
    const [screen, setScreen] = useState<Screen>('checking');
    const [session, setSession] = useState<Session | null>(null);
    const [operations, setOperations] = useState<Operations | null>(null);
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [conflicts, setConflicts] = useState<Record<string, Resource>>({});
    const [pending, setPending] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState('');
    useEffect(() => { window.dispatchEvent(new Event('woori-admin-session-change')); }, [session]);
    const authEpoch = useRef(0);
    const saving = useRef(new Set<string>());
    const operationsRequestSeq = useRef(0);
    const clear = useCallback((m = '') => { authEpoch.current++; setSession(null); setTab('dashboard'); setOperations(null); setAccounts(null); setEditingAccount(null); setDrafts({}); setConflicts({}); setPending({}); setMessage(m); setScreen('login'); }, []);
    const unavailable = useCallback((m = '서버와 연결할 수 없습니다. 저장 여부를 확인할 수 없습니다.') => { setMessage(m); setScreen('unavailable'); }, []);
    const current = (e: number) => e === authEpoch.current;
    const mergeOperations = useCallback((next: Operations) => setOperations(old => { if (!old)
        return next; const known = new Map(old.resources.map(r => [r.id, r])); return { ...next, resources: next.resources.map(r => { const prior = known.get(r.id); return prior && prior.version > r.version ? prior : r; }) }; }), []);
    const loadOperations = useCallback(async (quiet = false, signal?: AbortSignal) => { const auth = authEpoch.current, read = ++operationsRequestSeq.current; try {
        const { r, body } = await requestWithDeadline(async deadlineSignal => { const r = await fetch('/api/admin/operations', { signal: deadlineSignal, credentials: 'same-origin', cache: 'no-store' }); return { r, body: await parseJson(r) }; }, { signal });
        if (signal?.aborted || !current(auth) || read !== operationsRequestSeq.current)
            return false;
        if (r.status === 401) {
            clear('세션이 만료되었습니다. 다시 로그인해주세요.');
            return false;
        }
        if (r.status === 403) {
            setMessage('이 계정에는 이 운영 화면 권한이 없습니다.');
            return false;
        }
        if (!r.ok || !Array.isArray(body.resources) || !Array.isArray(body.history)) {
            if (!quiet)
                unavailable();
            else
                setMessage('최신 상태를 불러오지 못했습니다.');
            return false;
        }
        const next = body as unknown as Operations;
        mergeOperations(next);
        setMessage(current => ['최신 상태를 불러오지 못했습니다.', '오프라인입니다. 최신 상태를 불러오지 못했습니다.'].includes(current) ? '' : current);
        setScreen('dashboard');
        return next;
    }
    catch {
        if ((!signal?.aborted || signal.reason?.message === 'timeout') && current(auth) && read === operationsRequestSeq.current) {
            if (!quiet)
                unavailable();
            else
                setMessage('오프라인입니다. 최신 상태를 불러오지 못했습니다.');
        }
        return false;
    } }, [clear, mergeOperations, unavailable]);
    const loadAccounts = useCallback(async () => { const e = authEpoch.current; try {
        const r = await fetch('/api/admin/accounts', { credentials: 'same-origin', cache: 'no-store' }), body = await parseJson(r);
        if (!current(e))
            return;
        if (r.status === 401) {
            clear('세션이 만료되었습니다. 다시 로그인해주세요.');
            return;
        }
        if (r.status === 403) {
            setMessage('계정 관리는 최고 관리자만 사용할 수 있습니다.');
            return;
        }
        if (!r.ok || !Array.isArray(body.accounts)) {
            setMessage('계정 목록을 불러오지 못했습니다.');
            return;
        }
        setAccounts(body.accounts as unknown as Account[]);
    }
    catch {
        if (current(e))
            setMessage('계정 목록을 불러오지 못했습니다.');
    } }, [clear]);
    const accept = useCallback(async (body: ApiSession) => { if (!valid(body)) {
        unavailable('로그인 상태를 확인할 수 없습니다.');
        return;
    } setTab(body.role === 'parking' ? 'parking' : 'dashboard'); setSession({ username: body.username, role: body.role, displayName: body.displayName, expiresAt: body.expiresAt, sessionId: body.sessionId, capabilities: { ...noCapabilities, ...body.capabilities } }); setMessage(''); setScreen('dashboard'); const ok = await loadOperations(); if (ok && body.role === 'superadmin')
        void loadAccounts(); }, [loadAccounts, loadOperations, unavailable]);
    const check = useCallback(async () => { const e = ++authEpoch.current; setScreen('checking'); try {
        const r = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' }), body = await parseJson(r) as ApiSession;
        if (!current(e))
            return;
        if (r.status === 401 || !valid(body)) {
            clear();
            return;
        }
        await accept(body);
    }
    catch {
        if (current(e))
            unavailable('관리자 서비스를 지금 확인할 수 없습니다.');
    } }, [accept, clear, unavailable]);
    useEffect(() => { const authRef = authEpoch; void check(); return () => { authRef.current++; }; }, [check]);
    useEffect(() => { if (screen !== 'dashboard') return; const polling = foregroundPolling(async signal => { await loadOperations(true, signal); }, 20000, () => setMessage('오프라인입니다. 최신 상태를 불러오지 못했습니다.'), false); return polling.stop; }, [loadOperations, screen]);
    const login = async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const el = ev.currentTarget, f = new FormData(el), displayName = String(f.get('displayName') || '').trim(); if (!displayName || displayName.length > 30) {
        setMessage('입력 담당자 이름/표시를 1~30자로 입력해주세요.');
        return;
    } const e = authEpoch.current; setPending({ login: true }); try {
        const r = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: String(f.get('username') || '').trim(), password: String(f.get('password') || ''), displayName }) }), body = await parseJson(r) as ApiSession;
        if (!current(e))
            return;
        if (r.status === 401)
            setMessage('아이디 또는 비밀번호를 확인해주세요.');
        else if (r.status === 429)
            setMessage('로그인 시도가 제한되었습니다. 잠시 후 다시 시도해주세요.');
        else if (r.status === 503)
            unavailable('관리자 서비스가 일시적으로 사용할 수 없습니다.');
        else if (r.ok)
            await accept(body);
        else
            unavailable();
    }
    catch {
        if (current(e))
            unavailable('오프라인입니다. 로그인되지 않았습니다.');
    }
    finally {
        el.reset();
        if (current(e))
            setPending({});
    } };
    const logout = async () => { authEpoch.current++; const e = authEpoch.current; setPending({ logout: true }); try {
        const r = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }), b = await parseJson(r);
        if (!current(e))
            return;
        if (r.ok && b.authenticated === false)
            clear('이 기기에서 로그아웃했습니다.');
        else
            setMessage('로그아웃하지 못했습니다. 현재 로그인 상태를 유지합니다.');
    }
    catch {
        if (current(e))
            setMessage('로그아웃하지 못했습니다. 현재 로그인 상태를 유지합니다.');
    }
    finally {
        if (current(e))
            setPending({});
    } };
    const review = async (id: string) => {
        const fresh = await loadOperations(true);
        const resource = fresh && fresh.resources.find(x => x.id === id);
        if (!resource) return;
        setDrafts(old => { const draft = old[id]; return draft ? { ...old, [id]: { ...draft, baseVersion: resource.version, requestId: undefined } } : old; });
        setConflicts(old => { const next = { ...old }; delete next[id]; return next; });
    };
    const save = async (r: Resource) => { if (saving.current.has(r.id)) return; if (needsExplicitSelection(r, drafts[r.id])) {
        setMessage('기존 확인 기록이 없거나 10분 이상 지났습니다. 현장을 확인하고 값을 직접 선택한 뒤 저장해주세요.');
        return;
    } const d = drafts[r.id] ?? { state: r.state, baseVersion: r.version, occupancyPercent: r.occupancyPercent == null ? '' : String(r.occupancyPercent), guideFloor: r.guideFloor == null ? '' : String(r.guideFloor) }; if (conflicts[r.id]) {
        setMessage('최신 상태를 확인하고 비교한 뒤 다시 저장해주세요.');
        return;
    } const requestId = d.requestId ?? crypto.randomUUID(); if (!d.requestId)
        setDrafts(old => ({ ...old, [r.id]: { ...d, requestId } })); const e = authEpoch.current; saving.current.add(r.id); setPending(old => ({ ...old, [r.id]: true })); try {
        const occupancyPercent = d.occupancyPercent === undefined ? r.occupancyPercent ?? null : d.occupancyPercent.trim() === '' ? null : Number(d.occupancyPercent);
        if (occupancyPercent !== null && (!Number.isInteger(occupancyPercent) || occupancyPercent < 0 || occupancyPercent > 100 || (isCapacityResource(r) && !occupancySteps.includes(occupancyPercent as typeof occupancySteps[number])))) { setMessage('사용률은 0%, 10%, …, 100% 중에서 선택해주세요.'); setPending(old => ({ ...old, [r.id]: false })); return; }
        const guideFloor = (d.guideFloor ?? String(r.guideFloor ?? '')).trim() === '' ? null : Number(d.guideFloor ?? r.guideFloor);
        if (r.id === 'parking.dream' && (d.state === 'available' ? !Number.isInteger(guideFloor) || Number(guideFloor) < 1 || Number(guideFloor) > 5 : guideFloor !== null)) { setMessage('현재 안내할 층 또는 전체 만차·이용 불가·확인 전을 선택해주세요.'); return; }
        const state = isCapacityResource(r) ? capacityState(d.state, occupancyPercent) : d.state;
        const response = await fetch('/api/admin/operations', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: r.id, state, occupancyPercent, ...(r.id === 'parking.dream' ? { guideFloor } : {}), expectedVersion: d.baseVersion, requestId }) }), body = await parseJson(response);
        if (!current(e))
            return;
        if (response.status === 401) {
            clear('세션이 만료되었습니다. 다시 로그인해주세요.');
            return;
        }
        if (response.status === 403) {
            setMessage('이 계정에는 해당 상태를 변경할 권한이 없습니다.');
            return;
        }
        if (response.status === 409 && body.resource) {
            const latest = body.resource as unknown as Resource;
            mergeOperations({ ...(operations as Operations), resources: (operations?.resources ?? []).map(x => x.id === r.id ? latest : x) });
            setConflicts(old => ({ ...old, [r.id]: latest }));
            setMessage('다른 담당자가 먼저 변경했습니다. 내 입력은 유지되었습니다. 최신 상태를 확인하고 비교해주세요.');
            return;
        }
        if (!response.ok || !body.resource) {
            setMessage('저장 여부를 확인할 수 없습니다. 같은 요청을 다시 확인해주세요.');
            return;
        }
        const saved = body.resource as unknown as Resource;
        mergeOperations({ ...(operations as Operations), resources: (operations?.resources ?? []).map(x => x.id === r.id ? saved : x) });
        setDrafts(old => { const n = { ...old }; delete n[r.id]; return n; });
        setConflicts(old => { const n = { ...old }; delete n[r.id]; return n; });
        setMessage('저장했습니다. 공개 앱이 다음 자동 확인 때 반영합니다(20초 주기).');
        void loadOperations(true);
    }
    catch {
        if (current(e))
            setMessage('저장 여부를 확인할 수 없습니다. 입력은 유지되었습니다.');
    }
    finally {
        saving.current.delete(r.id);
        if (current(e))
            setPending(old => { const n = { ...old }; delete n[r.id]; return n; });
    } };
    const account = async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const el = ev.currentTarget, f = new FormData(el), password = String(f.get('password') || ''); if (password && password.length < 4) {
        setMessage('비밀번호는 4자 이상이어야 합니다.');
        return;
    } const e = authEpoch.current; setPending(old => ({ ...old, account: true })); try {
        const r = await fetch('/api/admin/accounts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: String(f.get('username') || '').trim(), role: f.get('role'), displayLabel: String(f.get('displayLabel') || '').trim(), ...(password ? { password } : {}), active: f.get('active') === 'on' }) }), b = await parseJson(r);
        if (!current(e))
            return;
        if (r.status === 401) {
            clear('세션이 만료되었습니다. 다시 로그인해주세요.');
            return;
        }
        if (r.status === 403) {
            setMessage('계정 관리는 최고 관리자만 사용할 수 있습니다.');
            return;
        }
        if (!r.ok || !b.account) {
            setMessage('계정 변경이 저장되지 않았습니다.');
            return;
        }
        el.reset();
        setEditingAccount(null);
        await loadAccounts();
        if (current(e))
            setMessage('계정 설정을 저장했습니다. 일부 계정의 기존 세션은 해제될 수 있습니다.');
    }
    catch {
        if (current(e))
            setMessage('계정 변경이 저장되지 않았습니다.');
    }
    finally {
        if (current(e))
            setPending(old => { const n = { ...old }; delete n.account; return n; });
    } };
    const tabs = (Object.keys(tabNames) as AdminTab[]).filter(t => session?.role === 'superadmin' || ['dashboard','guidance','history'].includes(t) || t === 'parking' && session?.role === 'parking');
    const visibleHistory = (operations?.history ?? []).filter(h => h.resourceId !== 'parking.calvary' && !h.resourceId.startsWith('parking.dream.b'));
    const overviewResources = [...(operations?.publicResources ?? operations?.resources ?? [])].filter(r => overviewOrder.includes(r.id)).sort((a, b) => overviewOrder.indexOf(a.id) - overviewOrder.indexOf(b.id));
    const changeTab = (next: AdminTab) => { setTab(next); };
    return <main className="ta-admin" lang="ko"><header className="ta-admin__header"><a className="ta-admin__brand" href="/"><strong>우리</strong><span>특새 관리자</span></a><a className="ta-admin__back" href="/">앱으로 돌아가기</a></header><section className="ta-admin__content" aria-live="polite">{screen === 'checking' && <div className="ta-admin__card"><h1>세션을 확인하고 있어요</h1></div>}{screen === 'unavailable' && <div className="ta-admin__card"><h1>지금은 열 수 없어요</h1><p role="alert">{message}</p><button className="ta-admin__primary" onClick={() => void check()}>다시 시도</button><a className="ta-admin__checkpoint" href="/admin">관리자 페이지 다시 열기</a></div>}{screen === 'login' && <div className="ta-admin__card"><h1>로그인</h1><p>공용 계정은 개인 신원을 확인하지 않습니다. 현장 기록에 표시할 입력 담당자 이름/표시를 입력해주세요.</p>{message && <p className="ta-admin__alert" role="alert">{message}</p>}<form onSubmit={login}><label>아이디<input name="username" autoComplete="username" required/></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required/></label><label>입력 담당자 이름/표시<input name="displayName" minLength={1} maxLength={30} required/></label><button className="ta-admin__primary" disabled={!!pending.login}>{pending.login ? '확인 중…' : '로그인'}</button></form></div>}{screen === 'dashboard' && session && <div className="ta-admin__dashboard"><div className="ta-admin__dashboard-head"><div><p className="ta-admin__eyebrow">{{superadmin: "슈퍼 어드민", parking: "주차팀 관리자", space: "예배 공간 관리자"}[session.role]}</p><h1>예배·주차 현황판</h1>{session.role === "superadmin" && <p><button type="button" className="ta-admin__secondary" onClick={() => changeTab('accounts')}>팀 계정 관리로 이동</button></p>}<p><strong>{session.displayName}</strong> · {session.username} · 세션 {session.sessionId}</p><p className="ta-admin__expiry">만료 {date(session.expiresAt)} · 로그아웃은 이 기기에서만 적용됩니다.</p></div><button className="ta-admin__secondary" disabled={!!pending.logout} onClick={() => void logout()}>{pending.logout ? '처리 중…' : '로그아웃'}</button></div><div className="ta-admin__tabs" role="tablist" aria-label="관리자 메뉴">{tabs.map((t, i) => <button key={t} id={`admin-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls="admin-panel" tabIndex={tab === t ? 0 : -1} onClick={() => changeTab(t)} onKeyDown={e => { const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) { e.preventDefault(); changeTab(tabs[next]); document.getElementById(`admin-tab-${tabs[next]}`)?.focus(); } }}>{tabNames[t]}</button>)}</div><div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
{message && <p className="ta-admin__alert" role="alert">{message}</p>}
{!operations && <p role="status">현황을 불러오는 중입니다. 오래 걸리면 아래에서 다시 불러와주세요.</p>}
{(!operations || operations.resources.length === 0) && <div className="ta-admin__empty"><h2>표시할 현황이 없습니다</h2><p>이 계정에 반환된 운영 항목이 없습니다. 현황은 자동으로 생성되지 않습니다. 다시 불러온 뒤에도 비어 있으면 최고 관리자에게 계정 역할과 운영 DB를 확인해달라고 요청하세요.</p><button className="ta-admin__secondary" onClick={() => void loadOperations()}>현황 다시 불러오기</button></div>}
{tab === 'dashboard' && <section className="ta-admin__group"><h2>현장 확인부터 시작하세요</h2><p><strong>1. 현장 확인 → 2. 값 선택 → 3. 현황 확인/저장, 10분마다 재확인</strong></p><p>자동 감지 현황판이 아닙니다. 담당자가 실제 상황을 확인해 저장해야 공개 앱에 반영됩니다.</p><p>전체 공개 항목 {overviewResources.length}개 · 최근 10분 내 확인 {overviewResources.filter(r => r.updatedAt && !stale(r.updatedAt)).length}개</p>{overviewResources.length > 0 && <div style={{overflowX:'auto'}}><table aria-label="공개 현황 한눈에 보기" style={{width:'100%',minWidth:620,borderCollapse:'collapse',fontSize:14}}><thead><tr><th>공개 항목</th><th>현재 상태</th><th>마지막 확인</th><th>공개 상태</th></tr></thead><tbody>{overviewResources.map(r => <tr key={r.id}><th scope="row">{r.label || r.id}</th><td>{currentLabel(r)}</td><td>{time(r.updatedAt)}</td><td><strong>{r.updatedAt && !stale(r.updatedAt) ? '공개 중(10분 이내)' : '확인 필요'}</strong></td></tr>)}</tbody></table></div>}<p>{session.role === 'parking' ? '주차팀 계정입니다. 주차 탭에서 담당 주차장을 확인하고 저장하세요.' : '아래 예배 공간을 확인하고 저장하세요. 주차 안내 층·사용률은 주차 탭에서 입력합니다.'}</p>{session.role !== 'parking' && <button className="ta-admin__primary" onClick={() => document.getElementById('space-inputs')?.focus()}>예배 공간 현황 입력으로 이동</button>}{tabs.includes('parking') && <button className="ta-admin__secondary" onClick={() => changeTab('parking')}>주차 현황 입력하기</button>}</section>}
{tab === 'guidance' && <section className="ta-admin__group"><h2>현장 운영 안내</h2><ol><li>현황판에서 예배 공간 개방·사용률을, 주차에서 송림 추정 사용률과 드림센터 안내 층을 선택합니다.</li><li>현황 확인/저장을 누르면 공개 앱이 20초 주기로 반영합니다.</li><li>변동이 없어도 현장 확인 후 다시 저장하세요. 10분이 지나면 공개 화면은 확인 필요로 표시합니다.</li></ol><p>안내 층은 자동 전환되지 않습니다. 담당자가 현장을 확인하고 변경합니다.</p><p>공식 일정·장소 공지는 공개 앱에서 확인하세요. 이 탭은 운영 방법 안내이며 공지 편집 화면은 아닙니다.</p><a href="/" target="_blank" rel="noopener noreferrer">공개 예배·공지 확인 (새 탭)</a><p><a href="/?tab=parking" target="_blank" rel="noopener noreferrer">공개 주차 안내 확인 (새 탭)</a></p></section>}
{!session.capabilities.liveOperations && <p className="ta-admin__alert">이 계정에는 현장 운영 권한이 없습니다.</p>}{operations?.resources.some(r => !hasOccupancySchema(r)) && <p className="ta-admin__alert" role="status">사용률·마감 시각 기능은 DB 마이그레이션 적용 대기 중입니다. 기존 상태 확인·저장은 계속 이용할 수 있습니다.</p>}{operations && tab === 'parking' && <section className="ta-admin__group"><h2>현황 입력 → 공개 주차 안내</h2><ol><li>담당 주차장의 실제 현황을 확인하고 아래 값을 입력합니다.</li><li>현황 확인/저장을 누르면 공개 앱의 다음 자동 확인 때 반영됩니다(20초 주기).</li><li>변동이 없어도 다시 확인해 저장하세요. 10분이 지난 정보는 공개 앱에서 확인 필요로 표시됩니다.</li></ol><p>자동 차량 계수기가 아닙니다. 송림은 현장 추정 사용률, 드림센터는 현재 안내할 층이나 전체 만차를 선택합니다.</p><a href="/?tab=parking" target="_blank" rel="noopener noreferrer">공개 주차 안내 확인 (새 탭)</a>{!operations.resources.some(r => r.id === 'parking.dream') && <p role="status">드림센터 통합 안내 준비 중입니다. 운영 DB 적용 후 안내 층을 선택할 수 있습니다. 기존 층별 기록은 보존됩니다.</p>}</section>}{operations && ['dashboard','parking'].includes(tab) && <div id={tab === 'dashboard' ? 'space-inputs' : undefined} tabIndex={tab === 'dashboard' ? -1 : undefined}>{Object.entries(operations.resources.filter(r => (tab === 'parking' ? r.category === 'parking' : r.category === 'space') && r.id !== 'parking.calvary' && !r.id.startsWith('parking.dream.b')).sort((a, b) => (a.id === 'parking.songrim' ? -1 : a.id === 'parking.dream' ? 0 : 1) - (b.id === 'parking.songrim' ? -1 : b.id === 'parking.dream' ? 0 : 1)).reduce<Record<string, Resource[]>>((a, r) => { const k = `${r.category}:${group(r)}`; (a[k] ??= []).push(r); return a; }, {})).map(([key, rs]) => <section className="ta-admin__group" key={key}><h2>{rs[0].category === 'parking' ? '주차' : '예배 공간'} · {group(rs[0])}</h2>{rs.map(r => { const d = drafts[r.id], capacity = isCapacityResource(r), percent = d?.occupancyPercent ?? (r.occupancyPercent == null ? '' : String(r.occupancyPercent)), numericPercent = percent === '' ? null : Number(percent), value = capacity ? capacityState(d?.state ?? r.state, numericPercent) : d?.state ?? r.state, expiredDraft = draftSelectionExpired(r, d), selectionNeeded = needsExplicitSelection(r, d), selectValue = selectionNeeded ? 'unselected' : capacity ? value === 'closed' ? 'closed' : numericPercent !== null && occupancySteps.includes(numericPercent as typeof occupancySteps[number]) ? String(numericPercent) : 'checking' : value, conflict = conflicts[r.id]; return <article className="ta-admin__resource" key={r.id}><div><h3>{r.label}</h3><p>현재: <strong>{label(r, capacity && !needsOccupancySelection(r) ? capacityState(r.state, r.occupancyPercent ?? null) : r.state)}</strong> · {r.updatedAt ? date(r.updatedAt) : '현장 확인 기록 없음'}</p>{r.id === 'parking.dream' && <p>{r.state === 'available' && r.guideFloor != null ? `B${r.guideFloor}층으로 안내 중` : r.state === 'full' ? '전체 만차' : label(r, r.state)}</p>}{r.lastClosedAt && <p>최근 닫힘·입장 마감 기록: {date(r.lastClosedAt)}</p>}{r.lastFullAt && <p>최근 만차·만석 기록: {date(r.lastFullAt)}</p>}{stale(r.updatedAt) && <p className="ta-admin__stale">10분 이상 지난 상태입니다. 현장을 다시 확인해주세요.</p>}{expiredDraft && <p className="ta-admin__stale">선택한 지 10분이 지나 다시 확인 후 선택해주세요</p>}</div>{r.id === 'parking.dream' ? <label>현재 주차 안내<select aria-label="드림센터 현재 주차 안내" value={selectionNeeded ? 'unselected' : (d?.state ?? r.state) === 'available' ? String(d?.guideFloor ?? r.guideFloor ?? '') : d?.state ?? r.state} disabled={!!pending[r.id] || !session.capabilities.liveOperations} onChange={e => { const next = e.target.value; setDrafts(old => ({ ...old, [r.id]: { ...(old[r.id] ?? { baseVersion: r.version }), state: ['checking','closed','full'].includes(next) ? next : 'available', guideFloor: ['checking','closed','full'].includes(next) ? '' : next, requestId: undefined, selectedAt: Date.now() } })); }}>{selectionNeeded && <option value="unselected" disabled>기존: {currentLabel(r)} · 현장 확인 후 다시 선택</option>}<option value="checking">현장 확인 전</option>{[1,2,3,4,5].map(floor => <option key={floor} value={String(floor)}>B{floor}층으로 안내 중</option>)}<option value="full">전체 만차</option><option value="closed">이용 불가</option></select><small>현재 안내할 층을 직접 선택합니다. 해당 층이 차면 현장 확인 후 안내 층을 변경하세요. 자동 계수나 층 자동 전환은 하지 않습니다.</small></label> : capacity ? <label>사용률·상태<select aria-label={r.label + ' 사용률·상태'} value={selectValue} disabled={!!pending[r.id] || !session.capabilities.liveOperations} onChange={e => { const next = e.target.value; setDrafts(old => ({ ...old, [r.id]: { ...(old[r.id] ?? { baseVersion: r.version }), state: next === 'closed' ? 'closed' : next === 'checking' ? 'checking' : occupancyState(Number(next)), occupancyPercent: next === 'closed' || next === 'checking' ? '' : next, requestId: undefined, selectedAt: Date.now() } })); }}>{selectionNeeded && <option value="unselected" disabled>기존: {currentLabel(r)} · 현장 확인 후 다시 선택</option>}<option value="checking">사용률 확인 전</option><option value="closed">{label(r, 'closed')}</option>{occupancySteps.map(x => <option key={x} value={String(x)}>{x}% · {label(r, occupancyState(x))}</option>)}</select><small>운영자 추정 · 실측 수용률이 아닙니다. 사용률을 선택하면 상태가 함께 저장됩니다.</small></label> : <label>상태<select aria-label={r.label + ' 상태'} value={selectionNeeded ? 'unselected' : value} disabled={!!pending[r.id] || !session.capabilities.liveOperations} onChange={e => setDrafts(old => old[r.id] ? { ...old, [r.id]: { ...old[r.id], state: e.target.value, requestId: undefined, selectedAt: Date.now() } } : { ...old, [r.id]: { state: e.target.value, baseVersion: r.version, occupancyPercent: r.occupancyPercent == null ? '' : String(r.occupancyPercent), selectedAt: Date.now() } })}>{selectionNeeded && <option value="unselected" disabled>기존: {currentLabel(r)} · 현장 확인 후 다시 선택</option>}{choices(r).map(x => <option key={x} value={x}>{label(r, x)}</option>)}</select></label>}{conflict && <div className="ta-admin__conflict"><p>최신 상태: <strong>{label(r, conflict.state)}</strong> · {r.id === 'parking.dream' ? conflict.guideFloor == null ? '안내 층 없음' : `B${conflict.guideFloor}층으로 안내 중` : '추정 사용률'} {r.id === 'parking.dream' ? '' : conflict.occupancyPercent == null ? '미입력' : `${conflict.occupancyPercent}%`}. 내 입력은 저장되지 않았습니다.</p><button className="ta-admin__secondary" onClick={() => void review(r.id)}>최신 상태 확인</button></div>}<button className="ta-admin__primary" disabled={selectionNeeded || !!pending[r.id] || !!conflict || !session.capabilities.liveOperations} onClick={() => void save(r)}>{pending[r.id] ? '저장 중…' : value === r.state ? '현황 확인/저장' : '상태 저장'}</button></article>; })}</section>)}</div>}{tab === 'history' ? <section className="ta-admin__group"><h2>최근 변경 기록</h2><p>서버의 최근 100건 중 현재 운영 항목을 10건씩 표시합니다. 기록은 삭제되지 않습니다.</p>{visibleHistory.length === 0 && <p>변경 기록이 없습니다.</p>}<div className="ta-admin__history">{visibleHistory.slice(historyPage * 10, historyPage * 10 + 10).map(h => { const resource = [...(operations?.resources ?? []), ...(operations?.publicResources ?? [])].find(r => r.id === h.resourceId) ?? { id: h.resourceId, label: h.resourceId, category: h.resourceId.startsWith('parking.') ? 'parking' : 'space', state: h.afterState, version: 0, updatedAt: null } as Resource; return <p key={h.id}>{date(h.createdAt)} · {h.actorLabel} ({h.actorUsername}) · 세션 {h.sessionLabel} · {resource.label || h.resourceId}: {label(resource, h.beforeState)} → {label(resource, h.afterState)} · {h.resourceId === 'parking.dream' ? `안내 층 ${h.beforeGuideFloor == null ? '없음' : `B${h.beforeGuideFloor}`} → ${h.afterGuideFloor == null ? '없음' : `B${h.afterGuideFloor}`}` : `추정 사용률 ${h.beforeOccupancyPercent == null ? '미입력' : `${h.beforeOccupancyPercent}%`} → ${h.afterOccupancyPercent == null ? '미입력' : `${h.afterOccupancyPercent}%`}`} </p>; })}</div><div className="ta-admin__pagination"><button className="ta-admin__secondary" disabled={historyPage === 0} onClick={() => setHistoryPage(p => p - 1)}>이전 기록</button><span>{historyPage + 1} / {Math.max(1, Math.ceil(visibleHistory.length / 10))}</span><button className="ta-admin__secondary" disabled={(historyPage + 1) * 10 >= visibleHistory.length} onClick={() => setHistoryPage(p => p + 1)}>다음 기록</button></div></section> : null}{session.role === 'superadmin' && ['prayer','photo','trash'].includes(tab) && <CommunityModeration key={`${session.sessionId}:${tab}`} kind={tab === 'photo' ? 'photo' : tab === 'prayer' ? 'prayer' : undefined} trash={tab === 'trash'} />}{tab === 'accounts' && session.role === 'superadmin' && operations?.canManageAccounts && <section className="ta-admin__accounts" id="team-accounts"><h2>팀 계정 관리</h2><p>계정 변경 시 해당 계정의 기존 세션이 해제될 수 있습니다. 비밀번호는 화면이나 기록에 표시되지 않습니다.</p>{accounts?.filter(a => a.role !== "superadmin").map(a => <p key={a.username}>{a.displayLabel} ({a.username}) · {a.role === 'parking' ? '주차' : '예배 공간'} · {a.active ? '활성' : '비활성'} · {a.hasPassword ? '비밀번호 설정됨' : '비밀번호 없음'} <button type="button" className="ta-admin__secondary" disabled={!!pending.account} onClick={() => setEditingAccount(a)}>{a.username} 설정</button></p>)}<form key={editingAccount?.username ?? "new-account"} onSubmit={account}>{editingAccount && <p role="status"><strong>{editingAccount.username} 수정 중</strong></p>}<label>계정 아이디<input name="username" defaultValue={editingAccount?.username ?? ""} readOnly={!!editingAccount} required autoComplete="off"/></label><label>표시 이름<input name="displayLabel" defaultValue={editingAccount?.displayLabel ?? ""} required/></label><label>역할<select name="role" defaultValue={editingAccount?.role ?? "parking"}><option value="parking">주차</option><option value="space">공간</option></select></label><label>새 비밀번호 (선택)<input name="password" type="password" minLength={4} autoComplete="new-password"/></label><label className="ta-admin__check"><input name="active" type="checkbox" defaultChecked={editingAccount?.active ?? false}/>활성화</label><button className="ta-admin__primary" disabled={!!pending.account}>계정 저장</button>{editingAccount && <button type="button" className="ta-admin__secondary" disabled={!!pending.account} onClick={() => setEditingAccount(null)}>새 계정 입력으로 돌아가기</button>}</form></section>}</div></div>}</section></main>;
}
