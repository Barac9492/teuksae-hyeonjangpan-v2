import { requestWithDeadline } from '../../lib/requestDeadline';
import { useCallback, useEffect, useRef, useState } from 'react';
import './CommunityModeration.css';

type Item = {
  id: string; kind: 'prayer' | 'photo' | 'reflection'; text: string; createdAt: string;
  eventDay: string | number | null; status: 'pending' | 'approved' | 'rejected' | 'trashed'; version: number; photoUrl?: string;
};
type Decision = 'approved' | 'rejected' | 'deleted' | 'trashed' | 'restored';
type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'trashed';
const endpoint = '/api/admin/community';
const statusLabel = { pending: '검토 대기', approved: '공개 중', rejected: '비공개', trashed: '휴지통' };
const kindName = (kind: Item['kind']) => kind === 'photo' ? '사진' : kind === 'reflection' ? '묵상' : '기도';
// Text is shown in full on the card itself; only photos need an explicit open + loaded image.
const isText = (item: Item) => item.kind !== 'photo';
const groupOrder = ['pending', 'approved', 'rejected', 'trashed'] as const;
const timestamp = (value: string) => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value))
  : '시간 확인 불가';
function photoSource(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
function validItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const x = value as Record<string, unknown>;
  return typeof x.id === 'string' && ['prayer', 'photo', 'reflection'].includes(String(x.kind)) && typeof x.text === 'string'
    && typeof x.createdAt === 'string' && (x.eventDay === null || ['string', 'number'].includes(typeof x.eventDay))
    && ['pending', 'approved', 'rejected', 'trashed'].includes(String(x.status)) && Number.isInteger(x.version) && Number(x.version) >= 0
    && (x.photoUrl === undefined || typeof x.photoUrl === 'string');
}
function reviewItems(body: Record<string, unknown>): Item[] {
  if (!Array.isArray(body.items)) throw new Error('검토 목록의 서버 응답 형식이 올바르지 않습니다.');
  // The legacy adminList RPC retains deletion tombstones. They are not reviewable content.
  const visible = body.items.filter(item => !(item && typeof item === 'object' && item.status === 'deleted'));
  if (!visible.every(validItem)) throw new Error('검토 목록의 서버 응답 형식이 올바르지 않습니다.');
  return visible;
}
async function request(init?: RequestInit, url = endpoint): Promise<Record<string, unknown>> {
  return requestWithDeadline(async signal => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init, signal });
    let body: Record<string, unknown> | null = null;
    try { const json: unknown = await response.json(); if (json && typeof json === 'object' && !Array.isArray(json)) body = json as Record<string, unknown>; } catch { /* Non-JSON endpoints must not look empty. */ }
    if (!response.ok) {
      const descriptions: Record<number, string> = {
        401: '세션이 만료되었습니다. 다시 로그인해주세요.',
        403: '커뮤니티 검토는 최고 관리자만 사용할 수 있습니다.',
        409: '다른 관리자가 먼저 변경했습니다. 목록을 새로고침하고 내용을 다시 검토해주세요.',
        404: '커뮤니티 검토 API를 찾을 수 없습니다. 서버 배포 상태를 확인해주세요.',
      };
      const detail = typeof body?.error === 'string' ? ` (${body.error})` : '';
      throw new Error(`${descriptions[response.status] ?? '서버가 요청을 처리하지 못했습니다.'} [${response.status}]${detail}`);
    }
    if (!body) throw new Error('서버 응답을 확인할 수 없습니다. 목록을 새로고침해주세요.');
    return body;
  }, { signal: init?.signal ?? undefined });
}
function listUrl(filter: Filter, cursor: string | null, kind?: 'prayer' | 'photo') {
  const query = new URLSearchParams();
  if (kind) query.set('kind', kind);
  if (filter !== 'all') query.set('status', filter);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `${endpoint}?${query}` : endpoint;
}
function pageCursor(body: Record<string, unknown>): string | null {
  if (body.nextCursor === undefined || body.nextCursor === null) return null;
  if (typeof body.nextCursor !== 'string' || !body.nextCursor) throw new Error('검토 목록의 페이지 응답이 올바르지 않습니다.');
  return body.nextCursor;
}

// A selection always refers to the exact version rendered on this page.
export function CommunityModeration({ kind, trash = false }: { kind?: 'prayer' | 'photo'; trash?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>(trash ? 'trashed' : 'all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLaterPage, setIsLaterPage] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState<Decision | null>(null);
  const [trashSupported, setTrashSupported] = useState(false);
  const [results, setResults] = useState<{ id: string; message: string }[]>([]);
  const confirmationPanel = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (confirmation) confirmationPanel.current?.scrollIntoView?.({ block: 'nearest' }); }, [confirmation]);
  const active = useRef(false), lock = useRef(false), generation = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const resetSelection = () => { setSelected({}); setOpened({}); setLoadedImages({}); setBrokenImages({}); setConfirmation(null); };
  const load = useCallback(async (nextFilter: Filter, cursor: string | null = null) => {
    if (lock.current) return;
    lock.current = true; const epoch = ++generation.current;
    const controller = new AbortController(); operation.current = controller;
    setFilter(nextFilter); setBusy(true); setError(''); setNotice(''); setItems(null); setNextCursor(null); resetSelection();
    try {
      const body = await request({ signal: controller.signal }, listUrl(nextFilter, cursor, kind));
      const nextItems = reviewItems(body), next = pageCursor(body);
      if (active.current && epoch === generation.current) {
        setItems(nextItems); setNextCursor(next); setIsLaterPage(!!cursor); setTrashSupported(body.trashSupported === true);
      }
    } catch (cause) { if (active.current && epoch === generation.current) setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.'); }
    finally { if (epoch === generation.current) { lock.current = false; operation.current = null; if (active.current) setBusy(false); } }
  }, [kind]);
  useEffect(() => {
    active.current = true; void load(trash ? 'trashed' : 'all');
    const epochRef = generation;
    return () => { active.current = false; epochRef.current++; operation.current?.abort(); lock.current = false; };
  }, [load, trash]);
  const chosen = (items ?? []).filter(item => selected[item.id] === item.version);
  const photoItems = (items ?? []).filter(item => !isText(item));
  const allExpanded = photoItems.length > 0 && photoItems.every(item => opened[item.id]);
  // Rejected photos have no stored image left to inspect; opening the row is the whole review.
  const contentRendered = (item: Item) => isText(item) || !!opened[item.id] && (item.status === 'rejected' && !photoSource(item.photoUrl) || !!photoSource(item.photoUrl) && !!loadedImages[item.id] && !brokenImages[item.id]);
  const displayedPending = (items ?? []).filter(item => item.status === 'pending' && contentRendered(item));
  const canApprove = (item: Item) => item.status === 'pending' && contentRendered(item) && (item.kind === 'photo' || !!item.text.trim());
  const chosenContentRendered = chosen.every(contentRendered);
  const run = async (decision: Decision) => {
    if (lock.current || error || confirmation !== decision || !chosen.length || decision === 'approved' && !chosen.every(canApprove) || ['trashed','deleted'].includes(decision) && !chosenContentRendered) return;
    lock.current = true; const epoch = ++generation.current;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setNotice(''); setConfirmation(null); setResults([]); setProgress({ completed: 0, total: chosen.length });
    const outcomes: {id: string; message: string}[] = []; let succeeded = 0;
    // Existing version-checked single-item contract: no unbounded/hidden batch RPC.
    for (const item of chosen) {
      if (!active.current || epoch !== generation.current) break;
      try {
        const body = await request({ method: 'POST', signal: controller.signal, headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:item.id, decision, expectedVersion:item.version}) });
        const expected = decision === 'restored' ? 'pending' : decision;
        if (body.id !== item.id || body.status !== expected || !Number.isInteger(body.version) || Number(body.version) <= item.version) throw new Error('처리 응답을 확인할 수 없습니다.');
        succeeded++; outcomes.push({id:item.id, message:'완료'});
        if (active.current) setItems(old => old?.filter(x => x.id !== item.id) ?? null);
      } catch (cause) {
        outcomes.push({id:item.id, message:`${cause instanceof Error ? cause.message : '연결 오류'} 새로고침 후 다시 검토하세요.`});
        // Stop on uncertain/auth/network failures; a conflict is item-specific.
        if (!(cause instanceof Error && cause.message.includes('[409]'))) {
          for (const remaining of chosen.slice(outcomes.length)) outcomes.push({id:remaining.id,message:'미처리 · 앞선 오류로 중단했습니다.'});
          break;
        }
      }
      if (active.current && epoch === generation.current) setProgress({ completed: outcomes.length, total: chosen.length });
    }
    if (active.current && epoch === generation.current) {
      resetSelection(); setItems(null); setNextCursor(null); setResults(outcomes); setProgress({ completed: 0, total: 0 });
      const failed = chosen.length - succeeded;
      setNotice(`${chosen.length}개 중 ${succeeded}개 완료.${failed > 0 ? ` ${failed}개는 처리 결과를 확인해주세요.` : ''}`);
      try {
        const body = await request({signal:controller.signal}, listUrl(filter, null, kind));
        if (active.current && epoch === generation.current) { setItems(reviewItems(body)); setNextCursor(pageCursor(body)); setIsLaterPage(false); }
      } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '최신 목록을 확인하지 못했습니다.'); }
    }
    if (epoch === generation.current) { lock.current = false; operation.current = null; if (active.current) setBusy(false); }
  };
  const title = trash ? '휴지통' : kind === 'photo' ? '사진 승인' : '기도카드 승인';
  const subject = kind === 'photo' ? '사진' : kind === 'prayer' ? '기도' : '내용';
  const counts = { pending: 0, approved: 0, rejected: 0, trashed: 0 };
  for (const item of items ?? []) counts[item.status]++;
  const groupTitle = (status: Item['status']) => ({ pending: `확정이 필요한 ${subject} · 검토 대기`, approved: `확정되어 공개 중인 ${subject}`, rejected: `비공개 처리한 ${subject}`, trashed: `휴지통의 ${subject}` }[status]);
  const toggleSelect = (item: Item, checked: boolean) => { setSelected(old => { const next = { ...old }; if (checked) next[item.id] = item.version; else delete next[item.id]; return next; }); setConfirmation(null); };
  const renderItem = (item: Item) => {
    const source = photoSource(item.photoUrl), unavailable = item.kind === 'photo' && (!source || brokenImages[item.id]);
    const selectable = isText(item) || !!opened[item.id];
    const checkbox = <input type="checkbox" aria-label={`${item.id} 선택`} checked={selected[item.id] === item.version} disabled={busy || !selectable} onChange={e => toggleSelect(item, e.target.checked)} />;
    const meta = <p className="community-moderation__meta"><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time> · 한국 시간 · 버전 {item.version}</p>;
    const className = `community-moderation__item community-moderation__item--${item.status}${isText(item) ? ' community-moderation__item--text' : ''}${selected[item.id] === item.version ? ' community-moderation__item--selected' : ''}`;
    // Compact text card: checkbox beside the full text so a page can be read and picked in one pass.
    if (isText(item)) return <article key={item.id} className={className} aria-label={`${kindName(item.kind)} ${item.id}`}>
      <label className="community-moderation__pick">{checkbox}<span className="community-moderation__sr">선택</span></label>
      <div className="community-moderation__body">
        <h4>{kindName(item.kind)} · {statusLabel[item.status]}</h4>{meta}
        <p className="community-moderation__text">{item.text || '남아 있는 내용이 없습니다.'}</p>
      </div>
    </article>;
    return <article key={item.id} className={className} aria-label={`${kindName(item.kind)} ${item.id}`}>
      <h4>{kindName(item.kind)} · {statusLabel[item.status]}</h4>{meta}
      <details open={!!opened[item.id]} onToggle={e => { const open = e.currentTarget.open; setOpened(old => ({...old,[item.id]:open})); if (!open) { setSelected(old => {const next={...old};delete next[item.id];return next;});setConfirmation(null); } }}><summary>내용 보기 · {item.text.slice(0, 35) || '사진'}</summary>
        {opened[item.id] && <>{source && !brokenImages[item.id] && <img src={source} alt="공개 검토용 제출 사진" loading="lazy" onLoad={() => setLoadedImages(old => ({...old,[item.id]:true}))} onError={() => {setBrokenImages(old => ({...old,[item.id]:true}));setSelected(old => {const next={...old};delete next[item.id];return next;});setConfirmation(null);}} />}
        {unavailable && <p>이미지를 표시할 수 없습니다. 공개 승인할 수 없습니다.</p>}
        <p className="community-moderation__text">{item.text || '남아 있는 내용이 없습니다.'}</p>
        </>}
      </details>
      <label className="community-moderation__select">{checkbox}{opened[item.id] ? '내용 확인 후 선택' : '내용을 펼친 후 선택'}</label>
    </article>;
  };
  return <section className="community-moderation" aria-labelledby="community-review-heading" aria-busy={busy}>
    <div className="community-moderation__header"><h2 id="community-review-heading">{title}</h2><button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void load(filter)}>검토 목록 새로고침</button></div>
    {!trash && <label>검토 상태<select aria-label="검토 상태" value={filter} disabled={busy} onChange={e => void load(e.target.value as Filter)}><option value="all">전체 (검토 대기 먼저)</option><option value="pending">검토 대기</option><option value="approved">공개 중</option><option value="rejected">비공개</option></select></label>}
    <p>{trash ? '휴지통 항목은 공개되지 않습니다. 복원하면 검토 대기로 돌아가며, 다시 승인해야 공개됩니다. 이전 영구 삭제·비공개 처리로 지운 내용은 복원할 수 없습니다.' : `여러 개 승인: ${kind === 'prayer' ? '① 내용 읽기' : '① 내용 펼치기(사진)'} → ② 확인한 항목 선택 → ③ 선택 공개 승인. 선택은 현재 페이지에만 적용되며 탭·페이지·필터·새로고침 시 해제됩니다.`}</p>
    {!trash && <details className="community-moderation__warning"><summary>공개·개인정보 검토 안내</summary><p>공개 승인한 기도·묵상·사진은 로그인 없이 누구나 인터넷에서 볼 수 있으며 복사·저장될 수 있습니다. 사진 속 얼굴, 특히 아동·청소년의 공개 동의와 보호자 동의를 확인하세요. 기도 내용에 이름·연락처·건강 등 민감한 정보가 없는지 확인하세요. 기도카드 목록에는 묵상 나눔도 포함됩니다.</p></details>}
    {!trash && !trashSupported && items && <p role="status">휴지통 기능은 DB 업데이트 후 사용할 수 있습니다.</p>}
    {error && <p role="alert" className="ta-admin__alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {results.length > 0 && <details className="community-moderation__results" open={results.some(r => r.message !== '완료')}><summary>항목별 처리 결과 {results.length}개</summary><ul>{results.map(r => <li key={r.id}>{r.id}: {r.message}</li>)}</ul></details>}
    {busy && <p role="status">{progress.total ? `선택 항목 처리 중… ${progress.completed} / ${progress.total}개` : '검토 목록 처리 중…'}</p>}
    {items?.length === 0 && <p>현재 검토 목록에 게시물이 없습니다.</p>}
    {!!items?.length && <div className="community-moderation__batch"><strong>현재 페이지 {items.length}개 · 선택 {chosen.length}개</strong><div className="community-moderation__actions">
      {photoItems.length > 0 && <button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => { if (allExpanded) { setOpened({}); setSelected(old => Object.fromEntries(Object.entries(old).filter(([id]) => !photoItems.some(item => item.id === id)))); } else setOpened(Object.fromEntries(photoItems.map(item => [item.id, true]))); setConfirmation(null); }}>{allExpanded ? '현재 페이지 내용 모두 접기' : '현재 페이지 내용 모두 펼치기'}</button>}
      <button type="button" className="ta-admin__secondary" disabled={busy || displayedPending.length === 0} onClick={() => { setSelected(Object.fromEntries(displayedPending.map(item => [item.id, item.version]))); setConfirmation(null); }}>{photoItems.length > 0 ? '펼친 검토 대기 항목 모두 선택' : '검토 대기 항목 모두 선택'}</button>

      {!trash && <button className="ta-admin__secondary" disabled={busy || !trashSupported || !chosen.length || !chosenContentRendered || !chosen.every(x => ['pending','approved'].includes(x.status))} onClick={() => setConfirmation('trashed')}>선택 휴지통으로 이동</button>}
      {trash && <button className="ta-admin__primary" disabled={busy || !chosen.length} onClick={() => setConfirmation('restored')}>선택 복원</button>}
      <button className="ta-admin__secondary" disabled={busy || !chosen.length} onClick={() => {setSelected({});setConfirmation(null);}}>선택 해제</button><details><summary>영구 삭제</summary><button className="ta-admin__secondary" disabled={busy || !chosen.length || !chosenContentRendered} onClick={() => setConfirmation('deleted')}>선택 영구 삭제</button></details>
    </div></div>}

    {!!items?.length && !trash && <p className="community-moderation__summary" role="status">현재 페이지: 확정 필요 {counts.pending} · 공개 중 {counts.approved} · 비공개 {counts.rejected}</p>}
    {items && groupOrder.map(status => {
      const group = items.filter(item => item.status === status);
      const alwaysShow = status === 'pending' && !trash && (filter === 'all' || filter === 'pending');
      if (!group.length && !alwaysShow) return null;
      const headingId = `community-group-${status}`;
      return <section key={status} className={`community-moderation__group community-moderation__group--${status}`} aria-labelledby={headingId}>
        <h3 id={headingId}>{groupTitle(status)} <span className="community-moderation__count">{group.length}개</span></h3>
        {status === 'approved' && <p className="community-moderation__group-note">확정되어 지금 앱에 공개된 내용입니다. 문제가 있으면 선택해 휴지통으로 옮기세요.</p>}
        {!group.length && <p className="community-moderation__empty">지금 확정할 {subject}{subject === '기도' ? '가' : '이'} 없습니다.</p>}
        {!!group.length && <div className={`community-moderation__grid${kind === 'prayer' ? ' community-moderation__grid--list' : ''}`}>{group.map(renderItem)}</div>}
      </section>;
    })}
    {!!items?.length && !trash && <div className="community-moderation__approve-bar" aria-label="일괄 승인 도구">
      <strong>{chosen.length}개 선택됨</strong>
      {!trash && <button className="ta-admin__primary" disabled={busy || !chosen.length || !chosen.every(canApprove)} onClick={() => setConfirmation('approved')}>선택 공개 승인</button>}
    </div>}
    {confirmation && <div ref={confirmationPanel} className="community-moderation__confirmation" role="region" aria-label="선택 항목 확인"><p><strong>{chosen.length}개를 {confirmation === 'approved' ? '인터넷에 공개합니다. 개인정보와 얼굴·아동·보호자의 공개 동의를 모두 확인했나요?' : confirmation === 'restored' ? '검토 대기로 복원합니다. 자동 공개되지 않습니다.' : confirmation === 'deleted' ? '영구 삭제합니다. 내용과 사진은 제거되며 복원할 수 없습니다. 이미 저장된 사본은 회수할 수 없습니다.' : '휴지통으로 옮깁니다. 공개를 중단하고 복원용 내용을 보관합니다.'}</strong></p><button className="ta-admin__primary" disabled={busy} onClick={() => void run(confirmation)}>확인 후 {confirmation === 'approved' ? '일괄 공개 승인' : confirmation === 'restored' ? '복원' : confirmation === 'deleted' ? '영구 삭제' : '휴지통 이동'}</button><button className="ta-admin__secondary" disabled={busy} onClick={() => setConfirmation(null)}>취소</button></div>}
    {items && <p className="community-moderation__page-note">현재 페이지 {items.length}개 · {nextCursor ? '다음 페이지에 항목이 더 있습니다. 100개가 넘어도 계속 검토할 수 있습니다.' : '마지막 페이지입니다.'}</p>}
    {items && <div className="community-moderation__actions community-moderation__pages">{isLaterPage && <button className="ta-admin__secondary" disabled={busy} onClick={() => void load(filter)}>첫 페이지로</button>}{nextCursor && <button className="ta-admin__secondary" disabled={busy} onClick={() => void load(filter, nextCursor)}>다음 페이지</button>}</div>}
  </section>;
}
