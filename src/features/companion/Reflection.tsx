import { useState } from 'react';
import { SERVICE_DAYS, WEEKDAYS } from './dawn';
import { saveReflection } from './shareText';
import { Community } from './Community';

export function Reflection() {
  const [day, setDay] = useState('5');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const text = drafts[day] ?? '';
  return <section aria-label="특새 묵상 나눔">
    <h2>오늘 말씀에서 마음에 남은 것</h2>
    <p className="tc-footnote">마음에 남은 말씀, 오늘 해보고 싶은 작은 실천을 적어보세요.</p>
    <label className="tc-field-label" htmlFor="tc-reflection-day">묵상할 예배일</label>
    <select className="tc-text-input" id="tc-reflection-day" value={day} onChange={(e) => { setDay(e.target.value); setMessage(''); }}>
      {SERVICE_DAYS.map((d, i) => <option key={d} value={d}>10월 {d}일({WEEKDAYS[i]})</option>)}
    </select>
    <label className="tc-field-label" htmlFor="tc-reflection">나의 묵상</label>
    <div className="tc-paper-field"><textarea id="tc-reflection" maxLength={1000} value={text} onChange={(e) => { setDrafts((current) => ({ ...current, [day]: e.target.value })); setMessage(''); }} placeholder="오늘 말씀을 내 하루에 어떻게 이어가고 싶나요?" /></div>
    <p className="tc-footnote">{text.length} / 1000 · 새로고침하면 지워져요. 남기려면 파일로 저장해주세요.</p>
    <button className="tc-secondary" type="button" disabled={!text.trim()} onClick={() => { try { saveReflection(text.trim(), `10/${day}`); setMessage('묵상 파일 다운로드를 요청했어요. 기기의 다운로드 폴더를 확인해주세요.'); } catch { setMessage('저장하지 못했어요. 내용을 직접 복사해주세요.'); } }}>묵상 파일로 저장</button>
    <p className="tc-lock-note">작성과 파일 저장은 비공개입니다. 원할 때만 아래에서 전체 공개에 동의해 접수해주세요.</p>
    <Community kind="reflection" text={text} eventDay={Number(day) - 5} payloadKey={JSON.stringify([day, text])} />
    {message && <p role="status" className="tc-form-status">{message}</p>}
  </section>;
}
