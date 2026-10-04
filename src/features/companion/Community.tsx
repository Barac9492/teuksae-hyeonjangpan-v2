import { canPublishPublicRequest, servicePeriod } from './serviceSchedule';
import { useServiceClock } from './useServiceClock';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { communityRequest, finishSubmission, finishSubmissionForReceipt, photoBase64, readReceipts, safePhotoUrl, saveReceipt, submissionAttempt, validateFeed } from './communityClient';
import { foregroundPolling } from './polling';
import type { FeedCursor, CommunityFeed, CommunityKind, Receipt } from './communityClient';
import './community.css';
const storageWarning = '삭제 기록을 이 기기에 저장하지 못했어요. 이 화면에서는 확인·삭제할 수 있지만 새로고침하거나 닫으면 삭제 권한을 잃을 수 있어요. 먼저 내 제출 기록에서 확인하거나 삭제해주세요.';
const statusLabels: Record<string, string> = { pending: '검수 대기', approved: '공개 중', rejected: '반려', deleted: '삭제됨', trashed: '휴지통 (비공개)', archived: '관리자 비공개 보관 중' };

export function Community({ kind, text, eventDay = null, file, payloadKey, showComposer = true, defaultPublic = false }: {
  kind: CommunityKind; text: string; eventDay?: number | null; file?: File | null; payloadKey: string; showComposer?: boolean; defaultPublic?: boolean;
}) {
  const now = useServiceClock();
  const period = servicePeriod(now);
  const paused = period.mode === 'worship';
  const [storedFeed, setFeed] = useState<CommunityFeed | null>(null);
  const [feedPeriod, setFeedPeriod] = useState('');
  const feed = !paused && feedPeriod === period.key ? storedFeed : null;
  const [feedError, setFeedError] = useState('');
  const [cursors, setCursors] = useState<(FeedCursor | null)[]>([null]);
  const [page, setPage] = useState(0);
  const cursor = cursors[page];
  const pollingRef = useRef<ReturnType<typeof foregroundPolling> | null>(null);
  const consentDetailsId = useId();
  const [consentKey, setConsentKey] = useState<string | null>(null);
  const [publicChoice, setPublicChoice] = useState(defaultPublic);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [consentResetMessage, setConsentResetMessage] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [records, setRecords] = useState(readReceipts);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const active = useRef(false);
  const actionGeneration = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const feedGeneration = useRef(0);
  const feedRequest = useRef<AbortController | null>(null);
  const key = JSON.stringify([kind, text, eventDay, payloadKey]);
  // Retry identity follows the transmitted payload, not raw editor text. Keep
  // the photo render identity: different image bytes must never share a retry.
  const submissionKey = JSON.stringify([kind, text.trim(), eventDay, kind === 'photo' ? payloadKey : null]);
  const publicByDefault = kind === 'prayer' && defaultPublic;
  const compactConsent = publicByDefault || kind === 'photo';
  const canShare = publicByDefault ? publicChoice && submittedKey !== key : consentKey === key;
  const currentKey = useRef(key); currentKey.current = key;
  const consentWasGiven = useRef(false); consentWasGiven.current = consentKey !== null;
  useEffect(() => {
    if (kind === 'photo' && consentWasGiven.current) setConsentResetMessage('사진·메모·날짜가 바뀌어 공개 동의를 다시 선택해주세요.');
    setConsentKey(null);
  }, [key, kind]);
  const refresh = useCallback(async (supersede = false) => {
    const startedAt = Date.now();
    if (servicePeriod(startedAt).mode === 'worship' || document.visibilityState === 'hidden' || !navigator.onLine || !active.current || (feedRequest.current && !supersede)) return;
    feedRequest.current?.abort();
    const controller = new AbortController();
    feedRequest.current = controller;
    const epoch = ++feedGeneration.current;
    try {
      const next = validateFeed(await communityRequest(undefined, kind, { signal: controller.signal, cursor }));
      if (!controller.signal.aborted && canPublishPublicRequest(startedAt) && active.current && epoch === feedGeneration.current) { setFeedPeriod(servicePeriod(startedAt).key); setFeed(next); setFeedError(''); }
    } catch (error) {
      if (canPublishPublicRequest(startedAt) && active.current && epoch === feedGeneration.current) {
        // Hide stale public content/counts as soon as freshness cannot be verified.
        setFeed(null);
        setFeedError(error instanceof Error ? error.message : '정보를 불러오지 못했어요.');
      }
    } finally { if (epoch === feedGeneration.current) feedRequest.current = null; }
  }, [kind, cursor]);
  const invalidateFeed = () => {
    feedGeneration.current++;
    feedRequest.current?.abort(); feedRequest.current = null;
    setFeed(null);
  };
  useEffect(() => {
    const feedEpoch = feedGeneration, actionEpoch = actionGeneration;
    active.current = true;
    return () => {
      active.current = false; feedEpoch.current++; actionEpoch.current++;
      feedRequest.current?.abort(); feedRequest.current = null;
      actionRequest.current?.abort(); actionRequest.current = null; locked.current = false;
    };
  }, []);
  useEffect(() => {
    const invalidate = () => {
      feedGeneration.current++; feedRequest.current?.abort(); feedRequest.current = null;
      setFeed(null);
    };
    const polling = foregroundPolling(async signal => {
      const cancel = () => { feedGeneration.current++; feedRequest.current?.abort(); feedRequest.current = null; };
      signal.addEventListener('abort', cancel, { once: true });
      try { await refresh(); } finally { signal.removeEventListener('abort', cancel); }
    }, 30000, () => { invalidate(); setFeedError('오프라인입니다. 연결되면 자동으로 다시 확인합니다.'); }, true, true, { publicSchedule: true, onPeriodChange: () => { invalidate(); setFeedError(''); } });
    pollingRef.current = polling;
    const onHidden = () => { if (document.visibilityState === 'hidden') invalidate(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => { polling.stop(); pollingRef.current = null; document.removeEventListener('visibilitychange', onHidden); };
  }, [refresh]);
  const turnPage = (next: number) => { invalidateFeed(); setFeedError(''); setPage(next); };
  const remember = (receipt: Receipt, replaceId?: string) => {
    if (!saveReceipt(receipt, replaceId)) setStorageFailed(true);
    setRecords(readReceipts());
  };
  const submit = async () => {
    if (servicePeriod().mode === 'worship' || locked.current || !canShare || !feed || feedError || (kind !== 'photo' ? !text.trim() : !file)) return;
    locked.current = true; setBusy(true); setMessage('');
    const epoch = ++actionGeneration.current;
    const controller = new AbortController(); actionRequest.current = controller;
    const isCurrent = () => active.current && epoch === actionGeneration.current;
    let attemptedId: string | undefined;
    try {
      const a = submissionAttempt(submissionKey); attemptedId = a.requestId;
      const imageBase64 = kind === 'photo' && file ? a.imageBase64 ?? await photoBase64(file, controller.signal) : undefined;
      if (!isCurrent()) return;
      if (servicePeriod().mode === 'worship') throw new Error('예배 중에는 공개 접수를 잠시 멈춥니다. 05:50 이후 다시 시도해주세요.');
      // Returning to the same photo/date/memo can regenerate different grain
      // pixels. Replay the first transmitted bytes along with its request ID,
      // only in memory until confirmation; never persist the image in receipts.
      if (imageBase64 !== undefined) a.imageBase64 = imageBase64;
      // Write the capability before the request: abort/timeout does not prove the
      // server rolled back. A retry uses the same request ID and deletion token.
      remember({ id: a.requestId, kind, token: a.token });
      setStatuses(s => ({ ...s, [a.requestId]: '접수 확인 중 · 응답이 없으면 같은 내용으로 재시도해주세요' }));
      const result = await communityRequest({ requestId: a.requestId, kind, text: text.trim(), eventDay, consent: true, deleteToken: a.token, ...(imageBase64 ? { imageBase64 } : {}) }, undefined, { signal: controller.signal });
      if (!isCurrent()) return;
      if (typeof result.id !== 'string' || typeof result.status !== 'string' || !Object.hasOwn(statusLabels, result.status)) throw new Error('접수 응답을 확인하지 못했어요. 같은 내용으로 다시 시도하면 중복 접수를 방지합니다.');
      remember({ id: result.id, kind, token: a.token }, a.requestId);
      finishSubmission(a);
      setSubmittedKey(key);
      setStatuses(s => ({ ...s, [result.id as string]: result.publicationHeld === true ? '공개 보류 · 가림 검토 대기' : statusLabels[result.status as string] }));
      setMessage(result.status === 'pending' ? '서버에 접수했어요. 내 제출 기록에서 현재 상태를 확인할 수 있어요.' : `이 요청의 기존 접수 상태를 확인했어요: ${result.publicationHeld === true ? '공개 보류 · 가림 검토 대기' : statusLabels[result.status as string]}`);
      if (currentKey.current === key) setConsentKey(null);
      void refresh(true);
    } catch (error) {
      if (isCurrent()) {
        const id = attemptedId;
        if (id) setStatuses(s => ({ ...s, [id]: '접수 여부 확인 필요 · 상태 확인 또는 같은 내용으로 재시도' }));
        setMessage(error instanceof Error ? error.message : '접수 여부를 확인하지 못했어요. 같은 내용으로 다시 시도해주세요.');
      }
    } finally {
      if (isCurrent()) { locked.current = false; actionRequest.current = null; setBusy(false); }
    }
  };
  const receiptAction = async (record: Receipt, action: 'status' | 'delete') => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const epoch = ++actionGeneration.current;
    const controller = new AbortController(); actionRequest.current = controller;
    const isCurrent = () => active.current && epoch === actionGeneration.current;
    if (action === 'delete') invalidateFeed();
    try {
      const result = await communityRequest({ action, id: record.id, deleteToken: record.token }, undefined, { signal: controller.signal });
      if (!isCurrent()) return;
      const status = typeof result.status === 'string' && Object.hasOwn(statusLabels, result.status) ? result.publicationHeld === true ? '공개 보류 · 가림 검토 대기' : statusLabels[result.status] : action === 'delete' && result.deleted === true ? '삭제됨' : undefined;
      if (!status) throw new Error('처리 결과를 확인하지 못했어요. 다시 확인해주세요.');
      // A pending status may still need an exact-byte retry to finish uploading.
      // Approved/terminal results and confirmed withdrawal no longer need pixels.
      if (record.kind === 'photo' && (['approved', 'rejected', 'deleted', 'trashed', 'archived'].includes(String(result.status)) || (action === 'delete' && result.deleted === true))) {
        const resolvedKeys = finishSubmissionForReceipt(record.id);
        // A confirmed old request is no longer an uncertain retry. Require a
        // new choice before submitting it again, but never reset another draft.
        if (resolvedKeys.includes(submissionKey) && currentKey.current === key) setConsentKey(null);
      }
      setStatuses(s => ({ ...s, [record.id]: status }));
      if (action === 'delete') { setMessage('서버의 제출 기록 삭제 결과를 확인했어요. 외부에 저장된 사본은 회수할 수 없어요.'); void refresh(true); }
      else {
        setMessage('서버에 접수했어요. 내 제출 기록에서 현재 상태를 확인할 수 있어요.');
        if (result.status === 'deleted' || result.status === 'rejected' || result.status === 'trashed' || result.status === 'archived') { invalidateFeed(); void refresh(true); }
      }
    } catch (error) {
      if (isCurrent()) {
        setStatuses(s => ({ ...s, [record.id]: '처리 결과 확인 필요 · 상태를 다시 확인해주세요' }));
        setMessage(`${error instanceof Error ? error.message : '처리하지 못했어요.'} 상태 확인으로 결과를 확인해주세요. 같은 제출 기록으로 철회·삭제를 다시 시도할 수 있어요.`);
        if (action === 'delete') { invalidateFeed(); setFeedError('삭제 결과와 최신 공개 목록을 확인하지 못했어요.'); }
      }
    } finally {
      if (isCurrent()) { locked.current = false; actionRequest.current = null; setBusy(false); }
    }
  };
  const submitButton = (
      <button type="button" className="tc-primary" disabled={paused || busy || !canShare || !feed || !!feedError || (kind !== 'photo' ? !text.trim() : !file)} onClick={() => void submit()}>{busy ? '처리 중…' : publicByDefault ? submittedKey === key ? '접수 완료' : '기도제목 공개로 올리기' : kind === 'photo' ? '사진 공개하기' : '공개 접수하기 · 검수 후 게시'}</button>
  );
  const visibleItems = !feed ? [] : feed.items.filter(item => item.kind === kind);
  const composer = showComposer && <>
      <div className={`tc-community-compose${compactConsent ? ' tc-community-compose--compact' : ''}`}>
        {!compactConsent && <><h3>앱에 들어온 모든 분께 공개하기</h3><p>특정 사람에게 보내는 메시지가 아닙니다. 접수 후 관리자 검수가 끝나면 앱에 들어온 누구나 볼 수 있습니다.</p></>}
        {publicByDefault
          ? <label className="tc-checkbox"><input type="checkbox" aria-describedby={consentDetailsId} checked={publicChoice} disabled={busy} onChange={e => setPublicChoice(e.target.checked)} /><span>함께 나누기 · 공개</span></label>
          : <label className="tc-checkbox"><input type="checkbox" aria-describedby={consentDetailsId} checked={consentKey === key} disabled={busy} onChange={e => { setConsentKey(e.target.checked ? key : null); if (kind === 'photo') setConsentResetMessage(''); }} /><span>{compactConsent ? '함께 나누기 · 공개' : '모두에게 공개하는 데 동의합니다.'}</span></label>}
        {compactConsent
          ? <p id={consentDetailsId} hidden>{kind === 'photo' ? '관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 정보·사진은 당사자 동의를, 미성년자는 보호자 동의를 확인했습니다. 내 제출 기록에서 삭제할 수 있고 관리자도 검수·삭제할 수 있습니다. 프레임을 입힌 PNG만 전송합니다. 최대 3MB이며 원본 EXIF는 포함하지 않습니다.' : '공개를 원하지 않으면 선택을 해제하고 미리보기에서 기도 카드를 저장할 수 있어요. 관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 실명이나 민감한 사정은 적지 말아주세요. 다른 사람의 정보는 당사자 동의를, 미성년자는 보호자 동의를 확인해주세요. 내 제출 기록에서 삭제할 수 있고 관리자도 검수·삭제할 수 있습니다.'}</p>
          : <>
            <details id={consentDetailsId} className="tc-footnote"><summary>공개 범위와 삭제 한계 자세히 보기</summary><p>관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 정보·사진은 당사자 동의를, 미성년자는 보호자 동의를 확인했습니다.</p></details>
            <p className="tc-footnote">내 제출 기록에서 삭제 가능. 관리자도 검수·삭제할 수 있습니다.</p>
            {submitButton}
          </>}
      </div>
      {kind === 'prayer' && <p className="tc-community-publish-note">어린이도 함께 보는 공간입니다. 일부 표현은 관리자가 확인한 뒤 **로 가려 공개합니다. 원문은 보관됩니다.</p>}
      {compactConsent && submitButton}
      {kind === 'photo' && consentResetMessage && <p className="tc-community-publish-note" role="status">{consentResetMessage}</p>}
      {kind === 'photo' && <p className="tc-community-publish-note">관리자 검수 후 앱에 들어온 누구나 볼 수 있어요. 함께 나온 분의 동의를 확인해주세요.</p>}
    </>;
  return <section className={`tc-community${kind === 'photo' ? ' tc-community--photo' : ''}`} aria-label={kind === 'photo' ? '공개 사진 나눔' : kind === 'reflection' ? '공개 묵상 나눔' : '공개 기도 나눔'}>
    {paused && <p className="tc-quiet" role="status"><strong>예배 중</strong> · 공개 목록과 접수는 05:50에 재개합니다. 작성 중인 내용과 내 제출 기록은 유지됩니다.</p>}
    {kind === 'photo' && composer}
    <header><h2>{kind === 'photo' ? '함께 남긴 새벽 사진' : kind === 'reflection' ? '함께 나누는 묵상' : '함께 나누는 기도'}</h2>
      {kind === 'photo' && !paused && <><strong className="tc-community-count">{feed && !feedError ? `오늘 사진 참여 ${feed.photoCountToday}건` : feedError ? '오늘 사진 참여 건수 확인 불가' : '오늘 사진 참여 건수 확인 중'}</strong><details className="tc-footnote"><summary>ⓘ 참여 수 안내</summary><p>한국 시간 실제 접수일 기준입니다. 같은 사람의 여러 제출도 각각 셉니다. 검수 대기·공개 사진을 포함하고 반려·삭제는 제외합니다. 사진에 선택한 행사 날짜와는 무관해요.{feed && !feedError && ` (${feed.today})`}</p></details></>}
    </header>
    {!paused && (feedError ? <p role="alert">{feedError} 최신 여부를 확인할 수 없어 이전 게시물과 참여 건수를 숨겼어요. <button type="button" className="tc-line-action" onClick={() => void refresh(true)}>다시 불러오기</button></p> : !feed ? <p role="status">공개 나눔 정보를 불러오는 중이에요.</p> : null)}
    {kind !== 'photo' && composer}
    {storageFailed && <p role="alert">{storageWarning}</p>}
    {message && <p role="status">{message}</p>}
    {feed && !feedError && (visibleItems.length ? <ul className="tc-community-wall">{visibleItems.map(item => <li key={item.id}>{kind === 'photo' && safePhotoUrl(item.photoUrl) && <a href={safePhotoUrl(item.photoUrl)!} target="_blank" rel="noopener noreferrer"><img src={safePhotoUrl(item.photoUrl)!} alt="공개 동의 후 승인된 새벽 사진" loading="lazy" /></a>}{kind === 'reflection' && item.eventDay !== null && <strong>10월 {item.eventDay + 5}일 묵상</strong>}<p>{item.text}</p></li>)}</ul> : <p className="tc-community-empty">아직 승인되어 공개된 {kind === 'photo' ? '사진이' : kind === 'reflection' ? '묵상이' : '기도제목이'} 없어요. 접수한 내용은 검수 후 보입니다.</p>)}
    {!paused && <nav className="tc-community-pages" aria-label="공개 나눔 페이지">
      <button type="button" className="tc-secondary" disabled={page === 0} onClick={() => turnPage(page - 1)}>이전 페이지</button>
      <span>{page + 1}페이지</span>
      <button type="button" className="tc-secondary" disabled={!feed?.nextCursor || !!feedError} onClick={() => { if (!feed?.nextCursor) return; setCursors(old => [...old.slice(0, page + 1), feed.nextCursor!]); turnPage(page + 1); }}>다음 페이지</button>
      {page > 0 && <button type="button" className="tc-line-action" onClick={() => { setCursors([null]); turnPage(0); }}>최신 나눔으로</button>}
    </nav>}
    <details className="tc-community-receipts"><summary>내 제출 기록 ({records.filter(r => r.kind === kind).length})</summary><p>이 브라우저에 남은 삭제 권한으로 조회합니다. 저장소를 지우면 삭제 권한을 잃을 수 있어요.</p>
      {records.filter(r => r.kind === kind).map((r, index) => <div key={r.id}><strong>제출 {index + 1}</strong><span> · {statuses[r.id] ?? '상태를 확인해주세요'}</span><button type="button" disabled={busy} onClick={() => void receiptAction(r, 'status')}>상태 확인</button><button type="button" disabled={busy || statuses[r.id] === '삭제됨'} onClick={() => void receiptAction(r, 'delete')}>제출 철회·삭제</button></div>)}
    </details>
  </section>;
}
