import { requestWithDeadline } from '../../lib/requestDeadline';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './CommunityModeration.css';
import { PrayerPublicationEditor } from './PrayerPublicationEditor';

type Masking = { editingSupported?:boolean; sourceHash?:string; terms?:string[]; required: boolean; supported: boolean; held: boolean; publicText: string; policyVersion: string; matches: {start:number;end:number;term:string}[] };
type Item = {
  id: string; kind: 'prayer' | 'photo' | 'reflection'; text: string; createdAt: string;
  eventDay: string | number | null; status: 'pending' | 'approved' | 'rejected' | 'trashed' | 'archived'; version: number; photoUrl?: string; publicationMode?:'auto'|'manual'|null; reviewedPublicText?:string|null; masking?: Masking;
};
type Decision = 'approved' | 'rejected' | 'deleted' | 'trashed' | 'restored' | 'archived' | 'unarchived';
type Filter = 'mask_review' | 'all' | 'pending' | 'approved' | 'rejected' | 'trashed' | 'archived';
const endpoint = '/api/admin/community';
const statusLabel = { pending: '검토 대기', approved: '공개 중', rejected: '비공개', trashed: '휴지통', archived: '비공개 보관' };
const kindName = (kind: Item['kind']) => kind === 'photo' ? '사진' : kind === 'reflection' ? '묵상' : '기도';
// Text is shown in full on the card itself; only photos need an explicit open + loaded image.
const isText = (item: Item) => item.kind !== 'photo';
const reviewStatus = (item: Item) => item.masking?.held ? 'pending' : item.status;
function originalText(item: Item) {
  if (!item.masking?.matches.length) return item.text;
  let end = 0;
  const parts = item.masking.matches.map((match, index) => { const before = item.text.slice(end,match.start); end = match.end; return <span key={index}>{before}<mark>{item.text.slice(match.start,match.end)}</mark></span>; });
  return <>{parts}{item.text.slice(end)}</>;
}
const groupOrder = ['pending', 'approved', 'rejected', 'trashed', 'archived'] as const;
const timestamp = (value: string) => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value))
  : '시간 확인 불가';
function photoSource(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
function validMasking(value: unknown, text: string): value is Masking {
  if (!value || typeof value !== 'object') return false;
  const m = value as Masking;
  if (typeof m.required !== 'boolean' || typeof m.supported !== 'boolean' || typeof m.held !== 'boolean' || typeof m.publicText !== 'string' || typeof m.policyVersion !== 'string' || !Array.isArray(m.matches)) return false;
  if (m.editingSupported === true && (typeof m.sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(m.sourceHash) || !Array.isArray(m.terms) || !m.terms.length || !m.terms.every(t=>typeof t==='string'&&t.length>0))) return false;
  let end = 0;
  for (const match of m.matches) {
    if (!Number.isInteger(match.start) || !Number.isInteger(match.end) || match.start < end || match.end <= match.start || match.end > text.length || text.slice(match.start,match.end) !== match.term) return false;
    end = match.end;
  }
  return m.required === (m.matches.length > 0);
}
function validItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const x = value as Record<string, unknown>;
  return typeof x.id === 'string' && ['prayer', 'photo', 'reflection'].includes(String(x.kind)) && typeof x.text === 'string'
    && typeof x.createdAt === 'string' && (x.eventDay === null || ['string', 'number'].includes(typeof x.eventDay))
    && ['pending', 'approved', 'rejected', 'trashed', 'archived'].includes(String(x.status)) && Number.isInteger(x.version) && Number(x.version) >= 0
    && (x.status !== 'archived' || x.kind === 'photo')
    && (x.masking === undefined || validMasking(x.masking, x.text as string))
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
  const idPrefix = useId();
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
  const [archiveSupported, setArchiveSupported] = useState(false);
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
        setItems(nextItems); setNextCursor(next); setIsLaterPage(!!cursor); setTrashSupported(body.trashSupported === true); setArchiveSupported(body.archiveSupported === true);
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
  const canApprove = (item: Item) => reviewStatus(item) === 'pending' && contentRendered(item) && (item.kind === 'photo' || !!item.text.trim())
    && (item.kind !== 'prayer' || item.masking?.supported === true && !item.masking.required && !item.masking.held);
  const canMaskApprove = (item: Item) => reviewStatus(item) === 'pending' && item.masking?.supported === true && (item.masking.required || item.masking.held);
  const displayedPending = (items ?? []).filter(canApprove);
  const chosenContentRendered = chosen.every(contentRendered);
  const canArchive = (item: Item) => item.kind === 'photo' && ['pending','approved'].includes(item.status) && contentRendered(item);
  const canUnarchive = (item: Item) => item.kind === 'photo' && item.status === 'archived' && contentRendered(item);
  const run = async (decision: Decision) => {
    if (decision === 'archived' && (!archiveSupported || !chosen.every(canArchive)) || decision === 'unarchived' && (!archiveSupported || !chosen.every(canUnarchive))) return;
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
        const expected = ['restored','unarchived'].includes(decision) ? 'pending' : decision;
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
        if (active.current && epoch === generation.current) { setItems(reviewItems(body)); setNextCursor(pageCursor(body)); setIsLaterPage(false); setArchiveSupported(body.archiveSupported === true); setTrashSupported(body.trashSupported === true); }
      } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '최신 목록을 확인하지 못했습니다.'); }
    }
    if (epoch === generation.current) { lock.current = false; operation.current = null; if (active.current) setBusy(false); }
  };
  const title = trash ? '휴지통' : kind === 'photo' ? '사진 승인' : '기도카드 승인';
  const subject = kind === 'photo' ? '사진' : kind === 'prayer' ? '기도' : '내용';
  const counts = { pending: 0, approved: 0, rejected: 0, trashed: 0, archived: 0 };
  for (const item of items ?? []) counts[reviewStatus(item)]++;
  const groupTitle = (status: Item['status']) => ({ pending: `확정이 필요한 ${subject} · 검토 대기`, approved: `확정되어 공개 중인 ${subject}`, rejected: `비공개 처리한 ${subject}`, trashed: `휴지통의 ${subject}`, archived: '비공개 보관 사진' }[status]);
  const toggleSelect = (item: Item, checked: boolean) => { setSelected(old => { const next = { ...old }; if (checked) next[item.id] = item.version; else delete next[item.id]; return next; }); setConfirmation(null); };
  const renderItem = (item: Item) => {
    const source = photoSource(item.photoUrl), unavailable = item.kind === 'photo' && (!source || brokenImages[item.id]);
    const selectable = isText(item) || !!opened[item.id];
    const checkbox = <input type="checkbox" aria-label={`${item.id} 선택`} checked={selected[item.id] === item.version} disabled={busy || !selectable} onChange={e => toggleSelect(item, e.target.checked)} />;
    const meta = <p className="community-moderation__meta"><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time> · 한국 시간 · 버전 {item.version}</p>;
    const className = `community-moderation__item community-moderation__item--${reviewStatus(item)}${isText(item) ? ' community-moderation__item--text' : ''}${selected[item.id] === item.version ? ' community-moderation__item--selected' : ''}`;
    // Compact text card: checkbox beside the full text so a page can be read and picked in one pass.
    if (isText(item)) return <article key={item.id} className={className} aria-label={`${kindName(item.kind)} ${item.id}`}>
      <label className="community-moderation__pick">{checkbox}<span className="community-moderation__sr">선택</span></label>
      <div className="community-moderation__body">
        <h4>{kindName(item.kind)} · {item.masking?.held ? '공개 보류 · 가림 재검토 필요' : statusLabel[item.status]}</h4>{meta}
        {item.kind === 'prayer' && <strong className="community-moderation__label">작성 원문</strong>}
        <p className="community-moderation__text">{originalText(item) || '남아 있는 내용이 없습니다.'}</p>
        {item.kind === 'prayer' && !item.masking?.supported && <p role="status">가림 정책 업데이트 후 승인할 수 있습니다.</p>}
        {canMaskApprove(item) && (item.masking?.editingSupported ? <PrayerPublicationEditor key={`${item.id}:${item.version}`} id={item.id} version={item.version} original={item.text} automaticText={item.masking.publicText} sourceHash={item.masking.sourceHash!} policyVersion={item.masking.policyVersion} terms={item.masking.terms!} disabled={busy} request={request} onPublished={()=>{void load(filter);}}/> : <p role="status">공개 문구 검토 업데이트 후 게시할 수 있습니다.</p>)}
        {item.status === 'approved' && !item.masking?.held && typeof item.reviewedPublicText === 'string' && <div className="community-moderation__mask-preview"><strong>현재 공개 문구 · {item.publicationMode === 'manual' ? '직접 수정' : '자동 가림'}</strong><p className="community-moderation__text">{item.reviewedPublicText}</p></div>}
        {item.masking?.held && !item.masking.required && <p>정책이 변경되어 공개를 보류했습니다. 원문과 미리보기를 확인한 뒤 별도 게시 동작으로 확정해주세요.</p>}
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
    {!trash && kind === 'prayer' && <div role="group" aria-label="기도 검토 트랙" className="community-moderation__actions"><button type="button" className="ta-admin__secondary" aria-pressed={filter !== 'mask_review'} disabled={busy} onClick={() => void load('all')}>일반 검토</button><button type="button" className="ta-admin__secondary" aria-pressed={filter === 'mask_review'} disabled={busy} onClick={() => void load('mask_review')}>별도 검토 · 공개 문구</button></div>}
    {filter === 'mask_review' && <p>지정 표현이 있거나 가림 정책이 바뀐 기도입니다. 검토 전까지 공개되지 않습니다. 원문과 공개 표시를 확인한 뒤 한 건씩 게시해주세요.</p>}
    {!trash && filter !== 'mask_review' && <label>검토 상태<select aria-label="검토 상태" value={filter} disabled={busy} onChange={e => void load(e.target.value as Filter)}><option value="all">전체 (검토 대기 먼저)</option><option value="pending">검토 대기</option><option value="approved">공개 중</option><option value="rejected">{kind === 'photo' ? '반려 · 원본 삭제됨' : '비공개'}</option>{kind === 'photo' && <option value="archived">비공개 보관</option>}</select></label>}
    {!trash && kind === 'photo' && <p>비공개 보관은 사진과 내용을 유지하고 공개를 중단합니다. 보관 목록은 최고 관리자만 볼 수 있으며, 검토 대기로 돌려보낸 뒤 다시 승인해야 공개됩니다. 제출자의 철회·삭제와 기존 정리 기준은 그대로 적용됩니다.</p>}
    <p>{trash ? '휴지통 항목은 공개되지 않습니다. 복원하면 검토 대기로 돌아가며, 다시 승인해야 공개됩니다. 이전 영구 삭제·비공개 처리로 지운 내용은 복원할 수 없습니다.' : filter === 'archived' ? '내용을 펼쳐 확인한 사진만 선택해주세요. 선택한 사진을 검토 대기로 돌려보내거나 휴지통으로 옮길 수 있습니다. 페이지·필터를 바꾸면 선택이 해제됩니다.' : filter === 'mask_review' ? '각 게시물의 원문과 공개 표시를 확인한 뒤 ‘공개 미리보기 확인’을 누른 뒤 게시를 확정해주세요. 체크박스는 휴지통 이동·삭제 선택에만 사용합니다.' : `여러 개 승인: ${kind === 'prayer' ? '① 내용 읽기' : '① 내용 펼치기(사진)'} → ② 확인한 항목 선택 → ③ 선택 공개 승인. 선택은 현재 페이지에만 적용되며 탭·페이지·필터·새로고침 시 해제됩니다.`}</p>
    {!trash && <details className="community-moderation__warning"><summary>공개·개인정보 검토 안내</summary><p>공개 승인한 기도·묵상·사진은 로그인 없이 누구나 인터넷에서 볼 수 있으며 복사·저장될 수 있습니다. 사진 속 얼굴, 특히 아동·청소년의 공개 동의와 보호자 동의를 확인하세요. 기도 내용에 이름·연락처·건강 등 민감한 정보가 없는지 확인하세요. 기도카드 목록에는 묵상 나눔도 포함됩니다.</p></details>}
    {!trash && !trashSupported && items && <p role="status">휴지통 기능은 DB 업데이트 후 사용할 수 있습니다.</p>}
    {!trash && kind === 'photo' && !archiveSupported && items && <p role="status">비공개 보관 기능은 DB 업데이트 후 사용할 수 있습니다.</p>}
    {error && <p role="alert" className="ta-admin__alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {results.length > 0 && <details className="community-moderation__results" open={results.some(r => r.message !== '완료')}><summary>항목별 처리 결과 {results.length}개</summary><ul>{results.map(r => <li key={r.id}>{r.id}: {r.message}</li>)}</ul></details>}
    {busy && <p role="status">{progress.total ? `선택 항목 처리 중… ${progress.completed} / ${progress.total}개` : '검토 목록 처리 중…'}</p>}
    {items?.length === 0 && <p>현재 검토 목록에 게시물이 없습니다.</p>}
    {!!items?.length && <div className="community-moderation__batch"><strong>현재 페이지 {items.length}개 · 선택 {chosen.length}개</strong><div className="community-moderation__actions">
      {photoItems.length > 0 && <button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => { if (allExpanded) { setOpened({}); setSelected(old => Object.fromEntries(Object.entries(old).filter(([id]) => !photoItems.some(item => item.id === id)))); } else setOpened(Object.fromEntries(photoItems.map(item => [item.id, true]))); setConfirmation(null); }}>{allExpanded ? '현재 페이지 내용 모두 접기' : '현재 페이지 내용 모두 펼치기'}</button>}
      {!['mask_review','archived'].includes(filter) && <button type="button" className="ta-admin__secondary" disabled={busy || displayedPending.length === 0} onClick={() => { setSelected(Object.fromEntries(displayedPending.map(item => [item.id, item.version]))); setConfirmation(null); }}>{photoItems.length > 0 ? '펼친 검토 대기 항목 모두 선택' : '검토 대기 항목 모두 선택'}</button>}

      {!trash && <button className="ta-admin__secondary" disabled={busy || !trashSupported || !chosen.length || !chosenContentRendered || !chosen.every(x => ['pending','approved','archived'].includes(x.status))} onClick={() => setConfirmation('trashed')}>선택 휴지통으로 이동</button>}
      {!trash && kind === 'photo' && filter !== 'archived' && <button className="ta-admin__secondary" disabled={busy || !archiveSupported || !chosen.length || !chosen.every(canArchive)} onClick={() => setConfirmation('archived')}>선택 비공개 보관</button>}
      {!trash && kind === 'photo' && filter === 'archived' && <button className="ta-admin__primary" disabled={busy || !archiveSupported || !chosen.length || !chosen.every(canUnarchive)} onClick={() => setConfirmation('unarchived')}>선택 검토 대기로 이동</button>}
      {trash && <button className="ta-admin__primary" disabled={busy || !chosen.length} onClick={() => setConfirmation('restored')}>선택 복원</button>}
      <button className="ta-admin__secondary" disabled={busy || !chosen.length} onClick={() => {setSelected({});setConfirmation(null);}}>선택 해제</button><details><summary>영구 삭제</summary><button className="ta-admin__secondary" disabled={busy || !chosen.length || !chosenContentRendered} onClick={() => setConfirmation('deleted')}>선택 영구 삭제</button></details>
    </div></div>}

    {!!items?.length && !trash && <p className="community-moderation__summary">현재 페이지: 확정 필요 {counts.pending} · 공개 중 {counts.approved} · 비공개 {counts.rejected}{kind === 'photo' && ` · 비공개 보관 ${counts.archived}`}</p>}
    {items && groupOrder.map(status => {
      const group = items.filter(item => reviewStatus(item) === status);
      const alwaysShow = status === 'pending' && !trash && (filter === 'all' || filter === 'pending' || filter === 'mask_review');
      if (!group.length && !alwaysShow) return null;
      const headingId = `${idPrefix}-group-${status}`;
      return <section key={status} className={`community-moderation__group community-moderation__group--${status}`} aria-labelledby={headingId}>
        <h3 id={headingId}>{filter === 'mask_review' && status === 'pending' ? '공개 문구 확인이 필요한 기도 · 별도 검토' : groupTitle(status)} <span className="community-moderation__count">{group.length}개</span></h3>
        {status === 'approved' && <p className="community-moderation__group-note">확정되어 지금 앱에 공개된 내용입니다. 문제가 있으면 선택해 휴지통으로 옮기세요.</p>}
        {!group.length && <p className="community-moderation__empty">지금 확정할 {subject}{subject === '기도' ? '가' : '이'} 없습니다.</p>}
        {!!group.length && <div className={`community-moderation__grid${kind === 'prayer' ? ' community-moderation__grid--list' : ''}`}>{group.map(renderItem)}</div>}
      </section>;
    })}
    {!!items?.length && !trash && !['mask_review','archived'].includes(filter) && <div className="community-moderation__approve-bar" aria-label="일괄 승인 도구">
      <strong>{chosen.length}개 선택됨</strong>
      {!trash && <button className="ta-admin__primary" disabled={busy || !chosen.length || !chosen.every(canApprove)} onClick={() => setConfirmation('approved')}>선택 공개 승인</button>}
    </div>}
    {confirmation && <div ref={confirmationPanel} className="community-moderation__confirmation" role="region" aria-label="선택 항목 확인"><p><strong>{chosen.length}개를 {confirmation === 'approved' ? '인터넷에 공개합니다. 개인정보와 얼굴·아동·보호자의 공개 동의를 모두 확인했나요?' : confirmation === 'archived' ? '비공개 보관합니다. 현재 공개 중인 사진도 공개 목록과 이미지 주소에서 접근을 중단합니다. 사진과 내용은 유지됩니다. 이미 저장된 사본은 회수할 수 없습니다.' : confirmation === 'unarchived' ? '검토 대기로 돌려보냅니다. 자동 공개되지 않으며, 다시 확인하고 승인해야 공개됩니다.' : confirmation === 'restored' ? '검토 대기로 복원합니다. 자동 공개되지 않습니다.' : confirmation === 'deleted' ? '영구 삭제합니다. 내용과 사진은 제거되며 복원할 수 없습니다. 이미 저장된 사본은 회수할 수 없습니다.' : '휴지통으로 옮깁니다. 공개를 중단하고 복원용 내용을 보관합니다.'}</strong></p><button className="ta-admin__primary" disabled={busy} onClick={() => void run(confirmation)}>확인 후 {confirmation === 'approved' ? '일괄 공개 승인' : confirmation === 'archived' ? '비공개 보관' : confirmation === 'unarchived' ? '검토 대기로 이동' : confirmation === 'restored' ? '복원' : confirmation === 'deleted' ? '영구 삭제' : '휴지통 이동'}</button><button className="ta-admin__secondary" disabled={busy} onClick={() => setConfirmation(null)}>취소</button></div>}
    {items && <p className="community-moderation__page-note">현재 페이지 {items.length}개 · {nextCursor ? '다음 페이지에 항목이 더 있습니다. 100개가 넘어도 계속 검토할 수 있습니다.' : '마지막 페이지입니다.'}</p>}
    {items && <div className="community-moderation__actions community-moderation__pages">{isLaterPage && <button className="ta-admin__secondary" disabled={busy} onClick={() => void load(filter)}>첫 페이지로</button>}{nextCursor && <button className="ta-admin__secondary" disabled={busy} onClick={() => void load(filter, nextCursor)}>다음 페이지</button>}</div>}
  </section>;
}
