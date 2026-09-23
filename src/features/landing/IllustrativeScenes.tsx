import { type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { photos } from './content';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function AccessibleDialog({ open, title, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    window.setTimeout(() => first?.focus(), 0);
    return () => {
      if (dialog.open) dialog.close();
      returnFocusRef.current?.focus();
    };
  }, [open]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;
  return (
    <dialog ref={dialogRef} className="wa-dialog" aria-modal="true" aria-labelledby="wa-dialog-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="wa-dialog-bar"><p className="wa-kicker">예시 보기</p><button type="button" className="wa-icon-button" onClick={onClose} aria-label="닫기">닫기</button></div>
      <h2 id="wa-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

function TableIllustration() {
  return <svg className="wa-table-art" viewBox="0 0 760 420" role="img" aria-labelledby="wa-table-art-title">
    <title id="wa-table-art-title">예배 전 나눌 수 있는 낱개 포장 티백, 사탕, 비스킷 일러스트</title>
    <defs><linearGradient id="packet-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#edf6ff"/><stop offset="1" stopColor="#c5dfff"/></linearGradient></defs>
    <rect width="760" height="420" rx="30" fill="url(#packet-bg)"/>
    <ellipse cx="388" cy="342" rx="272" ry="29" fill="#526f8b" opacity=".10"/>
    <g transform="translate(134 66) rotate(-9 90 126)"><rect width="182" height="255" rx="12" fill="#fff" stroke="#9bb3c8" strokeWidth="2"/><path d="M15 18h152M15 237h152" stroke="#d3dde5" strokeWidth="6" strokeDasharray="4 4"/><path d="M91 60v36l-30 20v62h61v-62L91 96" fill="#edf3e7" stroke="#6d8b61" strokeWidth="2"/><path d="M92 130c-23-5-23 22 0 25 22-6 22-26 0-25Z" fill="#849f77"/><text x="91" y="210" textAnchor="middle" fill="#355b41" fontSize="22" fontFamily="sans-serif">티백</text></g>
    <g transform="translate(370 102) rotate(10 116 108)"><path d="M0 0h236l-5 12 5 12-5 12v178l5 12-5 12 5 12H0l5-12-5-12 5-12V36L0 24l5-12Z" fill="#faf0da" stroke="#d6b976" strokeWidth="2"/><rect x="17" y="24" width="202" height="200" rx="9" fill="#fffbf2"/><rect x="43" y="60" width="145" height="95" rx="13" fill="#d5a962"/><path d="M55 73h120v69H55Z" fill="none" stroke="#efd096" strokeWidth="3" strokeDasharray="4 7"/><g fill="#aa793d"><circle cx="79" cy="92" r="3"/><circle cx="117" cy="92" r="3"/><circle cx="153" cy="92" r="3"/><circle cx="79" cy="121" r="3"/><circle cx="117" cy="121" r="3"/><circle cx="153" cy="121" r="3"/></g><text x="117" y="198" textAnchor="middle" fill="#73582c" fontSize="21" fontFamily="sans-serif">낱개 포장 비스킷</text></g>
    <g transform="translate(290 290) rotate(-7)"><path d="M0 6 35 19v40L0 74 8 40Z" fill="#91bbe5"/><path d="m151 6-35 13v40l35 15-8-34Z" fill="#91bbe5"/><rect x="29" y="12" width="96" height="55" rx="20" fill="#fff" stroke="#699acb" strokeWidth="2"/><text x="77" y="48" textAnchor="middle" fill="#386b9c" fontSize="19" fontFamily="sans-serif">사탕</text></g>
  </svg>;
}

function SharingGuidelines() {
  return <aside className="wa-sharing-rules" aria-label="예배 전 나눔 안내">
    <h3>본당 앞 나눔 테이블 안내</h3>
    <p><strong>티백과 낱개 포장된 사탕·캔디·과자·비스킷만</strong> 나눌 수 있어요.</p>
    <ul><li>미개봉 제품으로 준비하고, 소비기한과 알레르기 표시를 확인해주세요.</li><li>직접 만든 음식, 포장을 뜯은 간식, 컵에 따른 음료는 나누지 않아요.</li></ul>
  </aside>;
}

const initialNotices = [
  { id: 1, title: '기다리시는 분들을 위해 티백을 놓아둘게요', meta: '본당 입장 대기 · 나눔 테이블 · 예시', body: '본당에 줄 서서 기다리는 분들이 가져가실 수 있도록 테이블 위에 낱개 밀봉된 티백을 놓아두는 공지 예시입니다. 실제 나눔 공지가 아닙니다.' },
  { id: 2, title: '낱개 포장 비스킷을 준비했어요', meta: '본당 입장 대기 · 나눔 테이블 · 예시', body: '본당 입장을 기다리는 동안 함께 나누려고 테이블 위에 낱개 포장 비스킷을 놓아두는 공지 예시입니다. 제품의 알레르기 표시를 확인해주세요. 실제 나눔 공지가 아닙니다.' },
];

export function SharingScene() {
  const [notices, setNotices] = useState(initialNotices);
  const [opened, setOpened] = useState<(typeof initialNotices)[number] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saved, setSaved] = useState(false);

  function addNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('notice-title') ?? '').trim();
    const body = String(data.get('notice-body') ?? '').trim();
    if (!title || !body) return;
    setNotices((items) => [...items, { id: Date.now(), title, meta: '이번 세션에만 보이는 예시', body }]);
    event.currentTarget.reset();
    setSaved(true);
    setShowForm(false);
  }

  function reset() {
    setNotices(initialNotices);
    setSaved(false);
    setShowForm(false);
  }

  return (
    <section className="wa-section wa-sharing" id="wa-sharing" aria-labelledby="wa-sharing-title">
      <div className="wa-section-copy"><p className="wa-kicker">우리 나눔</p><h2 id="wa-sharing-title">기다리는 동안,<br />함께 나눠요.</h2><span className="wa-example-label">예시 화면</span><p>본당 입장을 기다리는 동안, 테이블 위에 포장 간식을 놓아 서로 나눠요.</p></div>
      <div className="wa-sharing-layout">
        <TableIllustration />
        <div className="wa-notice-column">
          <SharingGuidelines />
          <div className="wa-list-heading"><span>나눔 안내</span><span>모두 예시</span></div>
          {notices.map((notice) => <button type="button" className="wa-notice" key={notice.id} onClick={() => setOpened(notice)}><span>{notice.meta}</span><strong>{notice.title}</strong><i aria-hidden="true">보기</i></button>)}
          <div className="wa-inline-actions"><button type="button" className="wa-primary" onClick={() => { setShowForm(true); setSaved(false); }}>나눔 예시 만들기</button>{notices.length > initialNotices.length && <button type="button" className="wa-link-button" onClick={reset}>예시 초기화</button>}</div>
          {saved && <p className="wa-success" role="status">이 브라우저 화면에만 추가했습니다. 전송되지 않았습니다.</p>}
          {showForm && <form className="wa-local-form" aria-label="나눔 예시 체험" onSubmit={addNotice}>
            <div className="wa-form-intro"><strong>예시 체험</strong><button type="button" onClick={() => setShowForm(false)}>취소</button></div>
            <p>실제 이름, 연락처, 개인 사연을 입력하지 마세요. 저장하거나 전송하지 않습니다.</p>
            <label>안내 제목<input name="notice-title" maxLength={36} required /></label>
            <label>짧은 안내<textarea name="notice-body" maxLength={120} required /></label>
            <label className="wa-rules-confirm"><input type="checkbox" name="sharing-rules" required />본당 대기줄의 테이블에서 안내된 낱개 포장 제품만 나누는 내용입니다.</label>
            <button className="wa-primary" type="submit">화면에만 추가</button>
          </form>}
        </div>
      </div>
      <AccessibleDialog open={opened !== null} title={opened?.title ?? ''} onClose={() => setOpened(null)}><p className="wa-dialog-meta">{opened?.meta}</p><p>{opened?.body}</p><p className="wa-dialog-note">예시 콘텐츠이며 실제 교회 공지가 아닙니다.</p></AccessibleDialog>
    </section>
  );
}

const postcards = [
  { question: '진로를 아직 정하지 못했어요. 뒤처지는 것 같을 때 어른들은 어떻게 견뎠나요?', answer: '저도 오래 헤맸습니다. 빨리 정하는 것보다 오늘 할 수 있는 작은 경험을 쌓는 일이 더 도움이 됐어요.' },
  { question: '친구에게 먼저 미안하다고 말하는 게 왜 이렇게 어려울까요?', answer: '용기는 두렵지 않은 마음보다, 두려워도 관계를 소중히 여겨 한 걸음 내딛는 쪽에 가까웠어요.' },
  { question: '기도해도 마음이 복잡한 날에는 어떻게 하세요?', answer: '잘 정리된 말 대신 “오늘은 복잡해요”라고 그대로 말씀드려요. 그리고 믿을 만한 어른에게도 도움을 청합니다.' },
];

export function PostcardScene() {
  const [index, setIndex] = useState(0);
  const [turned, setTurned] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localCard, setLocalCard] = useState<{ question: string; answer: string } | null>(null);
  const activeCards = localCard ? [...postcards, localCard] : postcards;
  const card = activeCards[index] ?? activeCards[0];
  const isLocalCard = localCard !== null && index === postcards.length;

  function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get('sample-question') ?? '').trim();
    const answer = String(data.get('sample-answer') ?? '').trim();
    if (!question || !answer) return;
    setLocalCard({ question, answer });
    setIndex(postcards.length);
    setTurned(false);
    setSaved(true);
    setShowForm(false);
    event.currentTarget.reset();
  }

  function resetCard() {
    setLocalCard(null);
    setIndex(0);
    setTurned(false);
    setSaved(false);
  }

  return (
    <section className="wa-section wa-postcards" id="wa-postcards" aria-labelledby="wa-postcards-title">
      <div className="wa-postcard-copy"><p className="wa-kicker">우리 엽서</p><h2 id="wa-postcards-title">묻고 싶었던 이야기.<br />함께 읽는 답장.</h2><span className="wa-example-label">가상 엽서 예시</span><p>서로의 질문과 살아온 경험을 엽서 한 장에 담아 함께 읽습니다.</p><div className="wa-card-controls"><button type="button" onClick={() => { setIndex((index + activeCards.length - 1) % activeCards.length); setTurned(false); }} aria-label="이전 엽서">이전</button><span>{index + 1} / {activeCards.length}</span><button type="button" onClick={() => { setIndex((index + 1) % activeCards.length); setTurned(false); }} aria-label="다음 엽서">다음</button>{localCard && <button type="button" onClick={resetCard}>내 예시 지우기</button>}</div></div>
      <div className="wa-postcard-stage">
        <button type="button" className={`wa-postcard${turned ? ' is-turned' : ''}`} onClick={() => setTurned((value) => !value)} aria-pressed={turned} aria-label={turned ? '질문 면 보기' : '답장 면 보기'}>
          <span className="wa-stamp" aria-hidden="true">우리<br />엽서</span><span className="wa-example-tag">{isLocalCard ? '내가 쓴 가상 예시' : '가상 예시'}</span><small>{turned ? '어른의 답장' : '청소년의 질문'}</small><strong>{turned ? card.answer : card.question}</strong><span className="wa-turn-hint">{turned ? '질문으로 돌아가기' : '답장 펼쳐보기'}</span>
        </button>
        <button type="button" className="wa-primary" onClick={() => { setShowForm(true); setSaved(false); }}>엽서 예시 써보기</button>
        {saved && <p className="wa-success" role="status">예시를 화면에서 확인했습니다. 저장되거나 전송되지 않았습니다.</p>}
        {showForm && <form className="wa-local-form wa-card-form" aria-label="엽서 예시 체험" onSubmit={saveCard}>
          <div className="wa-form-intro"><strong>예시 체험</strong><button type="button" onClick={() => setShowForm(false)}>취소</button></div>
          <p>실제 개인 고민, 이름, 학교, 연락처를 입력하지 마세요. 이 체험은 내용을 저장하지 않습니다.</p>
          <label>가상의 질문<textarea name="sample-question" maxLength={100} required /></label>
          <label>가상의 답장<textarea name="sample-answer" maxLength={140} required /></label>
          <button className="wa-primary" type="submit">전송 없이 확인</button>
        </form>}
      </div>
    </section>
  );
}

function DawnArtwork() {
  return <svg viewBox="0 0 700 520" role="img" aria-label="새벽빛이 들어오는 예배 공간을 그린 일러스트"><defs><linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c9e1ff"/><stop offset=".65" stopColor="#f4f7fb"/><stop offset="1" stopColor="#fff"/></linearGradient></defs><rect width="700" height="520" fill="url(#dawn)"/><circle cx="542" cy="135" r="62" fill="#fff" opacity=".92"/><path d="M0 360 136 284l112 55 135-109 95 75 95-39 127 80v174H0Z" fill="#1d1d1f" opacity=".12"/><path d="M100 520V335h500v185" fill="#f8f8fa"/><path d="M225 520V385h250v135" fill="#fff"/><path d="M350 350v-82M314 298h72" stroke="#3779ba" strokeWidth="12" strokeLinecap="round"/><path d="M155 462h390" stroke="#a7bfd6" strokeWidth="8" strokeLinecap="round"/></svg>;
}

interface GalleryItem { kind: 'image' | 'art'; src?: string; alt: string; caption: string; }
const galleryItems: GalleryItem[] = [
  { kind: 'image', src: photos.worship.image, alt: photos.worship.alt, caption: photos.worship.caption },
  { kind: 'image', src: photos.family.image, alt: photos.family.alt, caption: photos.family.caption },
  { kind: 'art', alt: '새벽빛이 들어오는 예배 공간 일러스트', caption: '새벽 예배의 빛 · 자체 제작 일러스트' },
];

export function PhotoScene() {
  const [opened, setOpened] = useState<GalleryItem | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL?.(localPreview); }, [localPreview]);

  function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('JPG, PNG, WebP 이미지만 선택할 수 있습니다.'); event.currentTarget.value = ''; return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('8MB 이하 이미지만 선택할 수 있습니다.'); event.currentTarget.value = ''; return;
    }
    const url = URL.createObjectURL?.(file);
    if (!url) { setError('이 브라우저에서는 미리보기를 만들 수 없습니다.'); return; }
    setLocalPreview(url); setFileName(file.name);
  }

  function resetPreview() {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setLocalPreview(null); setFileName(''); setError('');
  }

  return (
    <section className="wa-section wa-photos" id="wa-photos" aria-labelledby="wa-photos-title">
      <div className="wa-photo-head"><div><p className="wa-kicker">우리 사진</p><h2 id="wa-photos-title">오늘의 새벽을<br />함께 남겨요.</h2></div><div className="wa-photo-intro"><span className="wa-example-label">사진 구성 예시</span><p>함께 예배한 순간을 한 장씩 모아 오래 기억합니다.</p></div></div>
      <div className="wa-gallery">
        {galleryItems.map((item, itemIndex) => <figure className={`wa-gallery-item wa-gallery-item-${itemIndex + 1}`} key={item.caption}><button type="button" onClick={() => setOpened(item)} aria-label={`${item.caption} 크게 보기`}>{item.kind === 'image' ? <img src={item.src} alt={item.alt} loading="lazy" /> : <DawnArtwork />}</button><figcaption>{item.caption}</figcaption></figure>)}
      </div>
      <div className="wa-upload">
        <div><p className="wa-kicker">예시 체험 · 로컬 미리보기</p><h3>내 사진이 이 자리에 놓인다면</h3><p>실제 게시 기능이 아닙니다. JPG, PNG, WebP · 최대 8MB</p></div>
        <label className="wa-primary wa-file-label">사진 선택<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} /></label>
        {error && <p className="wa-error" role="alert">{error}</p>}
        {localPreview && <figure className="wa-local-preview"><img src={localPreview} alt="선택한 사진의 로컬 미리보기"/><figcaption>{fileName} · 이 화면에만 표시됨, 전송되지 않음</figcaption><button type="button" className="wa-link-button" onClick={resetPreview}>미리보기 지우기</button></figure>}
      </div>
      <AccessibleDialog open={opened !== null} title="사진 크게 보기" onClose={() => setOpened(null)}>{opened?.kind === 'image' ? <img className="wa-dialog-image" src={opened.src} alt={opened.alt} /> : <DawnArtwork />}<p className="wa-dialog-meta">{opened?.caption}</p></AccessibleDialog>
    </section>
  );
}
