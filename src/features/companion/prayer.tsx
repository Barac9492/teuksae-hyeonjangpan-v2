import { useEffect, useRef, useState } from 'react';
import { PageHeading } from './ui';

type PrayerView = 'write' | 'read';

const QUIET_SECONDS = 60;
const quietPrompts = ['천천히 숨을 들이쉬어요', '내쉬면서 어깨의 힘을 풀어요', '지금 마음에 떠오르는 이름을 올려드려요', '말없이 그 곁에 머물러요'];

/** One quiet minute: a circle that slowly fills like the sky before sunrise. */
function QuietMinute() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!running) return undefined;
    startRef.current = Date.now() - elapsed * 1000;
    const timer = window.setInterval(() => {
      const next = Math.min(QUIET_SECONDS, (Date.now() - startRef.current) / 1000);
      setElapsed(next);
      if (next >= QUIET_SECONDS) setRunning(false);
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const done = elapsed >= QUIET_SECONDS;
  const progress = elapsed / QUIET_SECONDS;
  const prompt = done ? '아멘' : running || elapsed > 0 ? quietPrompts[Math.min(quietPrompts.length - 1, Math.floor(progress * quietPrompts.length))] : '1분 동안, 함께 고요히';
  const circumference = 2 * Math.PI * 70;
  return (
    <div className="tc-quiet-minute" data-running={running || undefined} style={{ '--dawn': progress } as React.CSSProperties}>
      <div className="tc-quiet-minute__sky" aria-hidden="true" />
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" className="tc-quiet-minute__track" />
        <circle cx="80" cy="80" r="70" className="tc-quiet-minute__bar" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
      </svg>
      <div className="tc-quiet-minute__center">
        <strong aria-live="polite">{prompt}</strong>
        <span>{done ? '1분을 함께했어요' : `${Math.ceil(QUIET_SECONDS - elapsed)}초`}</span>
      </div>
      <button
        type="button"
        className="tc-secondary"
        onClick={() => {
          if (done) { setElapsed(0); setRunning(true); return; }
          setRunning((current) => !current);
        }}
      >
        {done ? '한 번 더' : running ? '잠시 멈춤' : elapsed > 0 ? '이어서' : '고요히 시작하기'}
      </button>
    </div>
  );
}

export function PrayerPanel({ onPreview }: { onPreview: (text: string, sharing: boolean) => void }) {
  const [view, setView] = useState<PrayerView>('write');
  const [text, setText] = useState('');
  const [sharing, setSharing] = useState(false);
  const warmth = Math.min(1, text.length / 120);
  return (
    <section id="tc-panel-prayer" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-prayer">
      <PageHeading eyebrow="하나님 앞에 내려놓는 마음" title="함께 기도해요" art={<span className="tc-candle" style={{ '--warmth': warmth } as React.CSSProperties}><i /></span>}>잘 정리된 말이 아니어도 괜찮아요.</PageHeading>
      <div className="tc-section tc-section--topless">
        <div className="tc-subtabs" role="group" aria-label="기도 메뉴">
          <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>기도 제목 쓰기</button>
          <button type="button" aria-pressed={view === 'read'} onClick={() => setView('read')}>함께 머물기</button>
        </div>
        {view === 'write' ? (
          <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) onPreview(text.trim(), sharing); }}>
            <label className="tc-field-label" htmlFor="tc-prayer">어떤 마음으로 기도하고 있나요?</label>
            <div className="tc-paper-field">
              <textarea id="tc-prayer" maxLength={600} value={text} onChange={(event) => setText(event.target.value)} placeholder="지금 마음에 있는 기도 제목을 적어주세요." required />
            </div>
            <div className="tc-form-meta"><span>이름·연락처는 쓰지 않아도 돼요.</span><span>{text.length} / 600</span></div>
            <label className="tc-checkbox">
              <input type="checkbox" checked={sharing} onChange={(event) => setSharing(event.target.checked)} />
              <span>함께 읽는 기도로 나누는 의향이 있어요.<small>선택하지 않으면 비공개입니다. 이 시안에서는 선택해도 공개되지 않아요.</small></span>
            </label>
            <button className="tc-primary" type="submit">입력 내용 미리보기 <span aria-hidden="true">→</span></button>
            <p className="tc-lock-note"><span aria-hidden="true">🔒</span> 내 화면에서만 보여요. 서버로 보내거나 저장하지 않아요.</p>
            <p className="tc-footnote">다른 사람의 실명·연락처·민감한 사정은 적지 말아주세요.</p>
          </form>
        ) : (
          <>
            <QuietMinute />
            <div className="tc-empty">
              <span aria-hidden="true">“</span>
              <h2>동의한 마음만,<br />조심스럽게 나눕니다.</h2>
              <p>아직 공개된 기도 제목이 없습니다.<br />이 화면은 서버와 연결되지 않았습니다.</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
