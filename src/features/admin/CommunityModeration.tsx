import { useCallback, useEffect, useRef, useState } from 'react';
import './CommunityModeration.css';

type Item = {
  id: string; kind: 'prayer' | 'photo' | 'reflection'; text: string; createdAt: string;
  eventDay: string | number | null; status: 'pending' | 'approved' | 'rejected'; version: number; photoUrl?: string;
};
type Decision = 'approved' | 'rejected' | 'deleted';
const endpoint = '/api/admin/community';
const statusLabel = { pending: '검토 대기', approved: '공개 중', rejected: '비공개' };
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
    && ['pending', 'approved', 'rejected'].includes(String(x.status)) && Number.isInteger(x.version) && Number(x.version) >= 0
    && (x.photoUrl === undefined || typeof x.photoUrl === 'string');
}
function reviewItems(value: unknown): Item[] | null {
  if (!Array.isArray(value)) return null;
  // Deleted rows may be redacted tombstones, not valid reviewable items.
  const visible = value.filter(item => !(item && typeof item === 'object' && item.status === 'deleted'));
  return visible.every(validItem) ? visible : null;
}
async function request(init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', ...init });
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
}

export function CommunityModeration() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const active = useRef(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    const epoch = generation.current;
    setBusy(true); setError(''); setNotice(''); setReviewId(null); setConsent(false); setItems(null);
    try {
      const body = await request();
      const visible = reviewItems(body.items);
      if (!visible) throw new Error('검토 목록의 서버 응답 형식이 올바르지 않습니다.');
      if (active.current && epoch === generation.current) { setItems(visible); setBrokenImages({}); setLoadedImages({}); }
    } catch (cause) {
      if (active.current && epoch === generation.current) setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.');
    } finally {
      if (epoch === generation.current) { lock.current = false; if (active.current) setBusy(false); }
    }
  }, []);
  useEffect(() => {
    const epochRef = generation;
    active.current = true; void load();
    return () => { active.current = false; epochRef.current++; lock.current = false; };
  }, [load]);
  const decide = async (item: Item, decision: Decision) => {
    if (lock.current || error || (decision === 'approved' && (reviewId !== item.id || !consent || item.kind === 'photo' && (!loadedImages[item.id] || brokenImages[item.id])))) return;
    lock.current = true; const epoch = generation.current;
    setBusy(true); setNotice(''); setReviewId(null); setConsent(false);
    try {
      await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, decision, expectedVersion: item.version }) });
      if (!active.current || epoch !== generation.current) return;
      // Never retain purged content after a successful privacy action.
      setItems(null);
      const body = await request();
      const visible = reviewItems(body.items);
      if (!visible) throw new Error('처리 후 목록을 확인하지 못했습니다. 새로고침해주세요.');
      if (active.current && epoch === generation.current) { setItems(visible); setBrokenImages({}); setLoadedImages({}); setNotice('서버 처리 후 최신 목록을 확인했습니다.'); }
    } catch (cause) {
      if (active.current && epoch === generation.current) {
        setItems(null);
        setError(`${cause instanceof Error ? cause.message : '연결 오류가 발생했습니다.'} 처리 결과를 단정할 수 없습니다. 새로고침 후 확인해주세요.`);
      }
    } finally {
      if (epoch === generation.current) { lock.current = false; if (active.current) setBusy(false); }
    }
  };
  return <section className="community-moderation" aria-labelledby="community-review-heading" aria-busy={busy}>
    <div className="community-moderation__header"><h2 id="community-review-heading">커뮤니티 공개 검토</h2><button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void load()}>검토 목록 새로고침</button></div>
    <p>검토 대기 및 최근 게시물 최대 100개입니다. 공개 승인한 기도·묵상·사진은 로그인 없이 누구나 인터넷에서 볼 수 있으며 복사·저장될 수 있습니다.</p>
    <p className="community-moderation__warning">사진 속 얼굴, 특히 아동·청소년의 공개 동의와 보호자 동의를 확인하세요. 기도 내용에 이름·연락처·건강 등 민감한 정보가 없는지 확인하세요. 비공개 처리는 이미지와 내용을 제거합니다. 삭제도 되돌릴 수 없으며, 이미 다른 사람이 저장한 사본까지 회수하지는 못합니다.</p>
    {error && <p role="alert" className="ta-admin__alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">검토 목록 처리 중…</p>}
    {items?.length === 0 && <p>현재 검토 목록에 게시물이 없습니다.</p>}
    {items?.map(item => {
      const source = photoSource(item.photoUrl);
      const imageUnavailable = item.kind === 'photo' && (!source || brokenImages[item.id]);
      return <article key={item.id} className="community-moderation__item" aria-label={`${item.kind === 'photo' ? '사진' : item.kind === 'reflection' ? '묵상' : '기도'} ${item.id}`}>
        <h3>{item.kind === 'photo' ? '사진' : item.kind === 'reflection' ? '묵상' : '기도'} · {statusLabel[item.status]}</h3>
        <p><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time> (한국 시간) · 행사일 {item.eventDay == null ? '미지정' : typeof item.eventDay === 'number' ? `${item.eventDay + 1}일차` : item.eventDay} · 버전 {item.version}</p>
        {item.kind === 'photo' && source && !brokenImages[item.id] && <img src={source} alt="공개 검토용 제출 사진" loading="lazy" onLoad={() => setLoadedImages(old => ({ ...old, [item.id]: true }))} onError={() => setBrokenImages(old => ({ ...old, [item.id]: true }))} />}
        {item.kind === 'photo' && !imageUnavailable && !loadedImages[item.id] && <p>사진을 불러온 뒤 공개 승인할 수 있습니다.</p>}
        {imageUnavailable && <p>이미지를 표시할 수 없습니다. 제거되었거나 접근할 수 없는 사진입니다.</p>}
        <p className="community-moderation__text">{item.text || '남아 있는 내용이 없습니다.'}</p>
        <div className="community-moderation__actions">
          {item.status === 'pending' && <><button type="button" className="ta-admin__primary" disabled={busy || !!imageUnavailable || item.kind === 'photo' && !loadedImages[item.id] || !item.text.trim() && item.kind !== 'photo'} onClick={() => { setReviewId(item.id); setConsent(false); }}>공개 승인 검토</button><button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void decide(item, 'rejected')}>비공개 처리</button></>}
          {item.status === 'approved' && <button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void decide(item, 'deleted')}>공개 철회 및 삭제</button>}
          {item.status === 'rejected' && <button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void decide(item, 'deleted')}>비공개 항목 삭제</button>}
        </div>
        {reviewId === item.id && <div className="community-moderation__confirmation">
          <p><strong>이 게시물을 인터넷에 공개할까요?</strong> 위의 실제 사진과 내용을 검토한 뒤 공개해주세요.</p>
          <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />개인정보와 얼굴·아동·보호자의 공개 동의를 확인했습니다.</label>
          <div className="community-moderation__actions"><button type="button" className="ta-admin__primary" disabled={busy || !consent || !!imageUnavailable || item.kind === 'photo' && !loadedImages[item.id]} onClick={() => void decide(item, 'approved')}>확인 후 공개 승인</button><button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => { setReviewId(null); setConsent(false); }}>공개 검토 취소</button></div>
        </div>}
      </article>;
    })}
  </section>;
}
