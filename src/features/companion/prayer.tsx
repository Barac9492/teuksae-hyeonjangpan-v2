import { useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { SermonPrayerAction } from './SermonCard';

import { PageHeading } from './ui';
import { Community } from './Community';
import { PrayerTimer } from './PrayerTimer';

type PrayerView = 'write' | 'read';
export type PrayerPanelHandle = { open: (view: SermonPrayerAction) => void };

export function PrayerPanel({ onPreview, ref, onReturnToSermon }: { onPreview: (text: string) => void; ref?: Ref<PrayerPanelHandle>; onReturnToSermon?: () => void }) {
  const [view, setView] = useState<PrayerView>('read');
  const [text, setText] = useState('');
  const timerDetails = useRef<HTMLDetailsElement>(null);
  useImperativeHandle(ref, () => ({ open: (next) => {
    setView(next);
    if (next === 'read' && timerDetails.current) timerDetails.current.open = true;
    requestAnimationFrame(() => document.getElementById(next === 'write' ? 'tc-prayer' : 'tc-prayer-timer')?.focus());
  } }), []);
  const warmth = Math.min(1, text.length / 120);
  return (
    <section id="tc-panel-prayer" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-prayer">
      {onReturnToSermon && <div className="tc-sermon-return"><button type="button" onClick={onReturnToSermon}><span aria-hidden="true">← </span>말씀으로 돌아가기</button><p>시간을 확인하고 직접 시작해주세요. 작성한 내용은 공개 버튼을 눌러야 접수돼요.</p></div>}
      <PageHeading eyebrow="세대를 잇는 기도" title="서로를 위해 기도해요" art={<span className="tc-candle" style={{ '--warmth': warmth } as React.CSSProperties}><i /></span>}><span className="tc-generation-direction">젊은 세대는 <strong>어른 세대를 위해,</strong></span><span className="tc-generation-direction">어른 세대는 <strong>젊은 세대를 위해.</strong></span></PageHeading>
      <div className="tc-section tc-section--topless">
        <div className="tc-subtabs" role="group" aria-label="기도 메뉴">
          <button type="button" aria-pressed={view === 'read'} onClick={() => setView('read')}>함께 기도하기</button>
          <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>기도제목 올리기</button>
        </div>
        <details ref={timerDetails} className="tc-prayer-clock" hidden={view !== 'read'}><summary>조용히 기도하기 · 타이머</summary><PrayerTimer /></details>
        {view === 'write' ? (
          <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) onPreview(text.trim()); }}>
            <label className="tc-field-label" htmlFor="tc-prayer">어떤 마음으로 기도하고 있나요?</label>
            <div className="tc-paper-field">
              <textarea id="tc-prayer" maxLength={600} value={text} onChange={(event) => { setText(event.target.value); }} placeholder="지금 마음에 있는 기도 제목을 적어주세요." required />
            </div>
            <div className="tc-form-meta"><span>이름·연락처는 쓰지 않아도 돼요.</span><span>{text.length} / 600</span></div>
            <button className="tc-primary" type="submit">입력 내용 미리보기 <span aria-hidden="true">→</span></button>
            <p className="tc-footnote">다른 사람의 실명·연락처·민감한 사정은 적지 말아주세요.</p>
          </form>
        ) : null}
        <Community kind="prayer" text={text} payloadKey={text} showComposer={view === 'write'} defaultPublic />
        {view === 'read' && <>
          <button type="button" className="tc-primary" onClick={() => { setView('write'); window.setTimeout(() => document.getElementById('tc-prayer')?.focus(), 0); }}>기도제목 올리기 <span aria-hidden="true">→</span></button>
        </>}
      </div>
    </section>
  );
}
