import { useState } from 'react';
import { PageHeading } from './ui';
import { Community } from './Community';
import { PrayerTimer } from './PrayerTimer';

type PrayerView = 'write' | 'read';

export function PrayerPanel({ onPreview }: { onPreview: (text: string) => void }) {
  const [view, setView] = useState<PrayerView>('read');
  const [text, setText] = useState('');
  const warmth = Math.min(1, text.length / 120);
  return (
    <section id="tc-panel-prayer" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-prayer">
      <PageHeading eyebrow="하나님 앞에 내려놓는 마음" title="기도 나누기" art={<span className="tc-candle" style={{ '--warmth': warmth } as React.CSSProperties}><i /></span>}>앱을 찾은 모든 분과 기도제목을 나누고, 서로를 위해 함께 기도해요.</PageHeading>
      <div className="tc-section tc-section--topless">
        <div className="tc-subtabs" role="group" aria-label="기도 메뉴">
          <button type="button" aria-pressed={view === 'read'} onClick={() => setView('read')}>함께 기도하기</button>
          <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>기도제목 올리기</button>
        </div>
        <div hidden={view !== 'read'}><PrayerTimer /></div>
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
