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
};
type History = {
    id: string;
    resourceId: string;
    beforeState: string;
    afterState: string;
    actorUsername: string;
    actorLabel: string;
    sessionLabel: string;
    createdAt: string;
};
type Operations = {
    resources: Resource[];
    history: History[];
    canManageAccounts: boolean;
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
    requestId?: string;
};
type Screen = 'checking' | 'login' | 'dashboard' | 'unavailable';
type ApiSession = Partial<Session> & {
    authenticated?: boolean;
};
const noCapabilities: Capabilities = { liveOperations: false, photoReview: false, prayerInbox: false, sharingModeration: false };
const normal = ['checking', 'closed', 'available', 'busy', 'full'];
const parseJson = async (r: Response): Promise<Record<string, unknown>> => { try {
    return await r.json() as Record<string, unknown>;
}
catch {
    return {};
} };
const valid = (x: ApiSession): x is ApiSession & Required<Pick<Session, 'username' | 'role' | 'displayName' | 'expiresAt' | 'sessionId'>> => x.authenticated === true && typeof x.username === 'string' && ['superadmin', 'parking', 'space'].includes(String(x.role)) && typeof x.displayName === 'string' && typeof x.expiresAt === 'string' && typeof x.sessionId === 'string';
const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '시간 확인 불가' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(d); };
const stale = (value: string | null) => !!value && (!Number.isFinite(new Date(value).getTime()) || Date.now() - new Date(value).getTime() > 600000);
const choices = (r: Resource) => r.id === 'space.songrim.access' ? ['checking', 'closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed'] : normal;
const label = (r: Resource, state: string) => { if (state === 'checking')
    return '현장 확인 전'; if (r.id === 'space.songrim.access')
    return ({ closed: '학교 개방 전', school_open: '학교만 개방', gym_open: '체육관 먼저 개방', hall_open: '본당 입장 중', hall_closed: '본당 입장 마감' }[state] ?? state); if (state === 'closed')
    return r.category === 'parking' ? '이용 불가' : '미개방'; if (state === 'available')
    return '이용 가능'; if (state === 'busy')
    return '혼잡'; if (state === 'full')
    return r.category === 'parking' ? '만차' : '입장 마감'; return state; };
const group = (r: Resource) => r.id.startsWith('parking.songrim') ? '송림본당' : r.id.startsWith('parking.dream') ? '드림센터' : r.id.startsWith('space.songrim') ? '송림본당' : r.id.startsWith('space.dream') ? '드림센터' : r.category === 'parking' ? '주차' : '공간';
export function AdminApp() {
    const [screen, setScreen] = useState<Screen>('checking');
    const [session, setSession] = useState<Session | null>(null);
    const [operations, setOperations] = useState<Operations | null>(null);
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [conflicts, setConflicts] = useState<Record<string, Resource>>({});
    const [pending, setPending] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState('');
    const authEpoch = useRef(0);
    const operationsRequestSeq = useRef(0);
    const clear = useCallback((m = '') => { authEpoch.current++; setSession(null); setOperations(null); setAccounts(null); setEditingAccount(null); setDrafts({}); setConflicts({}); setPending({}); setMessage(m); setScreen('login'); }, []);
    const unavailable = useCallback((m = '서버와 연결할 수 없습니다. 저장 여부를 확인할 수 없습니다.') => { setMessage(m); setScreen('unavailable'); }, []);
    const current = (e: number) => e === authEpoch.current;
    const mergeOperations = useCallback((next: Operations) => setOperations(old => { if (!old)
        return next; const known = new Map(old.resources.map(r => [r.id, r])); return { ...next, resources: next.resources.map(r => { const prior = known.get(r.id); return prior && prior.version > r.version ? prior : r; }) }; }), []);
    const loadOperations = useCallback(async (quiet = false) => { const auth = authEpoch.current, read = ++operationsRequestSeq.current; try {
        const r = await fetch('/api/admin/operations', { credentials: 'same-origin', cache: 'no-store' }), body = await parseJson(r);
        if (!current(auth) || read !== operationsRequestSeq.current)
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
        setScreen('dashboard');
        return next;
    }
    catch {
        if (current(auth) && read === operationsRequestSeq.current) {
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
    } setSession({ username: body.username, role: body.role, displayName: body.displayName, expiresAt: body.expiresAt, sessionId: body.sessionId, capabilities: { ...noCapabilities, ...body.capabilities } }); setMessage(''); setScreen('dashboard'); const ok = await loadOperations(); if (ok && body.role === 'superadmin')
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
    useEffect(() => { if (screen !== 'dashboard')
        return; const i = window.setInterval(() => void loadOperations(true), 20000); return () => window.clearInterval(i); }, [loadOperations, screen]);
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
    const review = async (id: string) => { const fresh = await loadOperations(true); if (fresh)
        setDrafts(old => { const d = old[id], r = fresh.resources.find(x => x.id === id); return d && r ? { ...old, [id]: { ...d, baseVersion: r.version } } : old; }); setConflicts(old => { const n = { ...old }; delete n[id]; return n; }); };
    const save = async (r: Resource) => { const d = drafts[r.id] ?? { state: r.state, baseVersion: r.version }; if (conflicts[r.id]) {
        setMessage('최신 상태를 확인하고 비교한 뒤 다시 저장해주세요.');
        return;
    } const requestId = d.requestId ?? crypto.randomUUID(); if (!d.requestId)
        setDrafts(old => ({ ...old, [r.id]: { ...d, requestId } })); const e = authEpoch.current; setPending(old => ({ ...old, [r.id]: true })); try {
        const response = await fetch('/api/admin/operations', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceId: r.id, state: d.state, expectedVersion: d.baseVersion, requestId }) }), body = await parseJson(response);
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
        void loadOperations(true);
    }
    catch {
        if (current(e))
            setMessage('저장 여부를 확인할 수 없습니다. 입력은 유지되었습니다.');
    }
    finally {
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
    return <main className="ta-admin" lang="ko"><header className="ta-admin__header"><a className="ta-admin__brand" href="/"><strong>우리</strong><span>특새 관리자</span></a><a className="ta-admin__back" href="/">앱으로 돌아가기</a></header><section className="ta-admin__content" aria-live="polite">{screen === 'checking' && <div className="ta-admin__card"><h1>세션을 확인하고 있어요</h1></div>}{screen === 'unavailable' && <div className="ta-admin__card"><h1>지금은 열 수 없어요</h1><p role="alert">{message}</p><button className="ta-admin__primary" onClick={() => void check()}>다시 시도</button><a className="ta-admin__checkpoint" href="/admin">관리자 페이지 다시 열기</a></div>}{screen === 'login' && <div className="ta-admin__card"><h1>로그인</h1><p>공용 계정은 개인 신원을 확인하지 않습니다. 현장 기록에 표시할 입력 담당자 이름/표시를 입력해주세요.</p>{message && <p className="ta-admin__alert" role="alert">{message}</p>}<form onSubmit={login}><label>아이디<input name="username" autoComplete="username" required/></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required/></label><label>입력 담당자 이름/표시<input name="displayName" minLength={1} maxLength={30} required/></label><button className="ta-admin__primary" disabled={!!pending.login}>{pending.login ? '확인 중…' : '로그인'}</button></form></div>}{screen === 'dashboard' && session && <div className="ta-admin__dashboard"><div className="ta-admin__dashboard-head"><div><p className="ta-admin__eyebrow">{{superadmin: "슈퍼 어드민", parking: "주차팀 관리자", space: "예배 공간 관리자"}[session.role]}</p><h1>현장 운영</h1>{session.role === "superadmin" && <p><a href="#team-accounts">팀 계정 관리로 이동</a></p>}<p><strong>{session.displayName}</strong> · {session.username} · 세션 {session.sessionId}</p><p className="ta-admin__expiry">만료 {date(session.expiresAt)} · 로그아웃은 이 기기에서만 적용됩니다.</p></div><button className="ta-admin__secondary" disabled={!!pending.logout} onClick={() => void logout()}>{pending.logout ? '처리 중…' : '로그아웃'}</button></div>{message && <p className="ta-admin__alert" role="alert">{message}</p>}{!session.capabilities.liveOperations && <p className="ta-admin__alert">이 계정에는 현장 운영 권한이 없습니다.</p>}{operations && Object.entries(operations.resources.reduce<Record<string, Resource[]>>((a, r) => { const k = `${r.category}:${group(r)}`; (a[k] ??= []).push(r); return a; }, {})).map(([key, rs]) => <section className="ta-admin__group" key={key}><h2>{rs[0].category === 'parking' ? '주차' : '공간'} · {group(rs[0])}</h2>{rs.map(r => { const d = drafts[r.id], value = d?.state ?? r.state, conflict = conflicts[r.id]; return <article className="ta-admin__resource" key={r.id}><div><h3>{r.label}</h3><p>현재: <strong>{label(r, r.state)}</strong> · {r.updatedAt ? date(r.updatedAt) : '현장 확인 기록 없음'}</p>{stale(r.updatedAt) && <p className="ta-admin__stale">10분 이상 지난 상태입니다. 현장을 다시 확인해주세요.</p>}</div><label>상태<select aria-label={`${r.label} 상태`} value={value} disabled={!!pending[r.id] || !session.capabilities.liveOperations} onChange={e => setDrafts(old => old[r.id] ? { ...old, [r.id]: { ...old[r.id], state: e.target.value, requestId: undefined } } : { ...old, [r.id]: { state: e.target.value, baseVersion: r.version } })}>{choices(r).map(x => <option key={x} value={x}>{label(r, x)}</option>)}</select></label>{conflict && <div className="ta-admin__conflict"><p>최신 상태: <strong>{label(r, conflict.state)}</strong>. 내 입력은 저장되지 않았습니다.</p><button className="ta-admin__secondary" onClick={() => void review(r.id)}>최신 상태 확인</button></div>}<button className="ta-admin__primary" disabled={!!pending[r.id] || !!conflict || !session.capabilities.liveOperations} onClick={() => void save(r)}>{pending[r.id] ? '저장 중…' : value === r.state ? '현황 확인/저장' : '상태 저장'}</button></article>; })}</section>)}{operations?.history.length ? <section className="ta-admin__group"><h2>최근 변경 기록</h2>{operations.history.map(h => <p key={h.id}>{date(h.createdAt)} · {h.actorLabel} ({h.actorUsername}) · 세션 {h.sessionLabel} · {h.resourceId}: {h.beforeState} → {h.afterState}</p>)}</section> : null}{session.role === 'superadmin' && operations?.canManageAccounts && <section className="ta-admin__accounts" id="team-accounts"><h2>팀 계정 관리</h2><p>계정 변경 시 해당 계정의 기존 세션이 해제될 수 있습니다. 비밀번호는 화면이나 기록에 표시되지 않습니다.</p>{accounts?.filter(a => a.role !== "superadmin").map(a => <p key={a.username}>{a.displayLabel} ({a.username}) · {a.role === 'parking' ? '주차' : '공간'} · {a.active ? '활성' : '비활성'} · {a.hasPassword ? '비밀번호 설정됨' : '비밀번호 없음'} <button type="button" className="ta-admin__secondary" disabled={!!pending.account} onClick={() => setEditingAccount(a)}>{a.username} 설정</button></p>)}<form key={editingAccount?.username ?? "new-account"} onSubmit={account}><label>계정 아이디<input name="username" defaultValue={editingAccount?.username ?? ""} required autoComplete="off"/></label><label>표시 이름<input name="displayLabel" defaultValue={editingAccount?.displayLabel ?? ""} required/></label><label>역할<select name="role" defaultValue={editingAccount?.role ?? "parking"}><option value="parking">주차</option><option value="space">공간</option></select></label><label>새 비밀번호 (선택)<input name="password" type="password" minLength={4} autoComplete="new-password"/></label><label className="ta-admin__check"><input name="active" type="checkbox" defaultChecked={editingAccount?.active ?? false}/>활성화</label><button className="ta-admin__primary" disabled={!!pending.account}>계정 저장</button></form></section>}</div>}</section></main>;
}
