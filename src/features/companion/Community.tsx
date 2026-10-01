import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { communityRequest, deleteToken, photoBase64, readReceipts, safePhotoUrl, saveReceipt, validateFeed } from './communityClient';
import type { CommunityFeed, CommunityKind, Receipt } from './communityClient';
import './community.css';
const storageWarning = '삭제 기록을 이 기기에 저장하지 못했어요. 이 화면에서는 확인·삭제할 수 있지만 새로고침하거나 닫으면 삭제 권한을 잃을 수 있어요. 먼저 내 제출 기록에서 확인하거나 삭제해주세요.';
const statusLabels: Record<string, string> = { pending: '검수 대기', approved: '공개 중', rejected: '반려', deleted: '삭제됨' };

export function Community({ kind, text, eventDay = null, file, payloadKey, showComposer = true, defaultPublic = false }: {
  kind: CommunityKind; text: string; eventDay?: number | null; file?: File | null; payloadKey: string; showComposer?: boolean; defaultPublic?: boolean;
}) {
  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [feedError, setFeedError] = useState('');
  const consentDetailsId = useId();
  const [consentKey, setConsentKey] = useState<string | null>(null);
  const [publicChoice, setPublicChoice] = useState(defaultPublic);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [records, setRecords] = useState(readReceipts);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const attempt = useRef<{ key: string; requestId: string; token: string; done: boolean } | null>(null);
  const key = JSON.stringify([kind, text, eventDay, payloadKey]);
  const publicByDefault = kind === 'prayer' && defaultPublic;
  const compactConsent = publicByDefault || kind === 'photo';
  const canShare = publicByDefault ? publicChoice && submittedKey !== key : consentKey === key;
  const currentKey = useRef(key); currentKey.current = key;
  useEffect(() => { setConsentKey(null); attempt.current = null; }, [key]);
  const refresh = useCallback(async () => {
    try { const next = validateFeed(await communityRequest(undefined, kind)); setFeed(next); setFeedError(''); }
    catch (error) { setFeedError(error instanceof Error ? error.message : '정보를 불러오지 못했어요.'); }
  }, [kind]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 30000);
    const onVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  const remember = (receipt: Receipt, replaceId?: string) => {
    if (!saveReceipt(receipt, replaceId)) setStorageFailed(true);
    setRecords(readReceipts());
  };
  const submit = async () => {
    if (locked.current || !canShare || !feed || feedError || (kind !== 'photo' ? !text.trim() : !file)) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      if (!attempt.current || attempt.current.key !== key || attempt.current.done) attempt.current = { key, requestId: crypto.randomUUID(), token: deleteToken(), done: false };
      const a = attempt.current;
      const imageBase64 = kind === 'photo' && file ? await photoBase64(file) : undefined;
      // Write the capability before the request: an interrupted response must not silently lose it.
      remember({ id: a.requestId, kind, token: a.token });
      setStatuses(s => ({ ...s, [a.requestId]: '접수 확인 중 · 응답이 없으면 같은 내용으로 재시도해주세요' }));
      const result = await communityRequest({ requestId: a.requestId, kind, text: text.trim(), eventDay, consent: true, deleteToken: a.token, ...(imageBase64 ? { imageBase64 } : {}) });
      if (typeof result.id !== 'string' || typeof result.status !== 'string' || !Object.hasOwn(statusLabels, result.status)) throw new Error('접수 응답을 확인하지 못했어요. 같은 내용으로 다시 시도하면 중복 접수를 방지합니다.');
      remember({ id: result.id, kind, token: a.token }, a.requestId);
      a.done = true;
      setSubmittedKey(key);
      setStatuses(s => ({ ...s, [result.id as string]: statusLabels[result.status as string] }));
      setMessage(result.status === 'pending' ? '서버에 접수했어요. 관리자가 검수한 뒤에만 공개됩니다.' : `이 요청의 기존 접수 상태를 확인했어요: ${statusLabels[result.status as string]}`);
      if (currentKey.current === key) setConsentKey(null);
      void refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '접수 여부를 확인하지 못했어요. 같은 내용으로 다시 시도해주세요.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const receiptAction = async (record: Receipt, action: 'status' | 'delete') => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const result = await communityRequest({ action, id: record.id, deleteToken: record.token });
      const status = typeof result.status === 'string' && Object.hasOwn(statusLabels, result.status) ? statusLabels[result.status] : action === 'delete' && result.deleted === true ? '삭제됨' : undefined;
      if (!status) throw new Error('처리 결과를 확인하지 못했어요. 다시 확인해주세요.');
      setStatuses(s => ({ ...s, [record.id]: status }));
      if (action === 'delete') { setMessage('서버의 제출 기록 삭제 결과를 확인했어요. 외부에 저장된 사본은 회수할 수 없어요.'); void refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '처리하지 못했어요.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const submitButton = (
      <button type="button" className="tc-primary" disabled={busy || !canShare || !feed || !!feedError || (kind !== 'photo' ? !text.trim() : !file)} onClick={() => void submit()}>{busy ? '처리 중…' : publicByDefault ? submittedKey === key ? '접수 완료 · 검수 후 게시' : '기도제목 공개로 올리기' : kind === 'photo' ? '사진 공개하기' : '공개 접수하기 · 검수 후 게시'}</button>
  );
  const visibleItems = !feed ? [] : feed.items.filter(item => item.kind === kind);
  const composer = showComposer && <>
      <div className={`tc-community-compose${compactConsent ? ' tc-community-compose--compact' : ''}`}>
        {!compactConsent && <><h3>앱에 들어온 모든 분께 공개하기</h3><p>특정 사람에게 보내는 메시지가 아닙니다. 접수 후 관리자 검수가 끝나면 앱에 들어온 누구나 볼 수 있습니다.</p></>}
        {publicByDefault
          ? <label className="tc-checkbox"><input type="checkbox" aria-describedby={consentDetailsId} checked={publicChoice} disabled={busy} onChange={e => setPublicChoice(e.target.checked)} /><span>함께 나누기 · 공개</span></label>
          : <label className="tc-checkbox"><input type="checkbox" aria-describedby={consentDetailsId} checked={consentKey === key} disabled={busy} onChange={e => setConsentKey(e.target.checked ? key : null)} /><span>{compactConsent ? '함께 나누기 · 공개' : '모두에게 공개하는 데 동의합니다.'}</span></label>}
        {compactConsent
          ? <p id={consentDetailsId} hidden>{kind === 'photo' ? '관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 정보·사진은 당사자 동의를, 미성년자는 보호자 동의를 확인했습니다. 내 제출 기록에서 삭제할 수 있고 관리자도 검수·삭제할 수 있습니다. 프레임을 입힌 PNG만 전송합니다. 최대 3MB이며 원본 EXIF는 포함하지 않습니다.' : '공개를 원하지 않으면 선택을 해제하고 미리보기에서 기도 카드를 저장할 수 있어요. 관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 실명이나 민감한 사정은 적지 말아주세요. 다른 사람의 정보는 당사자 동의를, 미성년자는 보호자 동의를 확인해주세요. 내 제출 기록에서 삭제할 수 있고 관리자도 검수·삭제할 수 있습니다.'}</p>
          : <>
            <details id={consentDetailsId} className="tc-footnote"><summary>공개 범위와 삭제 한계 자세히 보기</summary><p>관리자는 검수 대기 내용도 읽을 수 있습니다. 승인 후에는 로그인 없이 앱에 들어온 누구나 볼 수 있고, 캡처·외부 저장 사본은 삭제 후에도 남을 수 있습니다. 다른 사람의 정보·사진은 당사자 동의를, 미성년자는 보호자 동의를 확인했습니다.</p></details>
            <p className="tc-footnote">내 제출 기록에서 삭제 가능. 관리자도 검수·삭제할 수 있습니다.</p>
            {submitButton}
          </>}
      </div>
      {compactConsent && submitButton}
      {kind === 'photo' && <p className="tc-community-publish-note">관리자 검수 후 앱에 들어온 누구나 볼 수 있어요. 함께 나온 분의 동의를 확인해주세요.</p>}
    </>;
  return <section className={`tc-community${kind === 'photo' ? ' tc-community--photo' : ''}`} aria-label={kind === 'photo' ? '공개 사진 나눔' : kind === 'reflection' ? '공개 묵상 나눔' : '공개 기도 나눔'}>
    {kind === 'photo' && composer}
    <header><h2>{kind === 'photo' ? '함께 남긴 새벽 사진' : kind === 'reflection' ? '함께 나누는 묵상' : '함께 나누는 기도'}</h2>
      {kind === 'photo' && <><strong className="tc-community-count">{feed && !feedError ? `오늘 사진 참여 ${feed.photoCountToday}건` : feedError ? '오늘 사진 참여 건수 확인 불가' : '오늘 사진 참여 건수 확인 중'}</strong><details className="tc-footnote"><summary>ⓘ 참여 수 안내</summary><p>한국 시간 실제 접수일 기준입니다. 같은 사람의 여러 제출도 각각 셉니다. 검수 대기·공개 사진을 포함하고 반려·삭제는 제외합니다. 사진에 선택한 행사 날짜와는 무관해요.{feed && !feedError && ` (${feed.today})`}</p></details></>}
    </header>
    {feedError ? <p role="alert">{feedError} 이전 정보는 최신이 아닐 수 있어요. <button type="button" className="tc-line-action" onClick={() => void refresh()}>다시 불러오기</button></p> : !feed ? <p role="status">공개 나눔 정보를 불러오는 중이에요.</p> : null}
    {kind !== 'photo' && composer}
    {storageFailed && <p role="alert">{storageWarning}</p>}
    {message && <p role="status">{message}</p>}
    {feed && !feedError && (visibleItems.length ? <ul className="tc-community-wall">{visibleItems.map(item => <li key={item.id}>{kind === 'photo' && safePhotoUrl(item.photoUrl) && <a href={safePhotoUrl(item.photoUrl)!} target="_blank" rel="noopener noreferrer"><img src={safePhotoUrl(item.photoUrl)!} alt="공개 동의 후 승인된 새벽 사진" loading="lazy" /></a>}{kind === 'reflection' && item.eventDay !== null && <strong>10월 {item.eventDay + 5}일 묵상</strong>}<p>{item.text}</p><small>검수 후 공개</small></li>)}</ul> : <p className="tc-community-empty">아직 승인되어 공개된 {kind === 'photo' ? '사진이' : kind === 'reflection' ? '묵상이' : '기도제목이'} 없어요. 접수한 내용은 검수 후 보입니다.</p>)}
    <details className="tc-community-receipts"><summary>내 제출 기록 ({records.filter(r => r.kind === kind).length})</summary><p>이 브라우저에 남은 삭제 권한으로 조회합니다. 저장소를 지우면 삭제 권한을 잃을 수 있어요.</p>
      {records.filter(r => r.kind === kind).map((r, index) => <div key={r.id}><strong>제출 {index + 1}</strong><span> · {statuses[r.id] ?? '상태를 확인해주세요'}</span><button type="button" disabled={busy} onClick={() => void receiptAction(r, 'status')}>상태 확인</button><button type="button" disabled={busy || statuses[r.id] === '삭제됨'} onClick={() => void receiptAction(r, 'delete')}>제출 철회·삭제</button></div>)}
    </details>
  </section>;
}
