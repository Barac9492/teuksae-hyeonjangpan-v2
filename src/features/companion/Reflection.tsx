import { useState } from 'react';
import { SERVICE_DAYS, WEEKDAYS } from './dawn';
import { saveReflection, shareText } from './shareText';

export function Reflection() {
  const [day, setDay] = useState('5');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const text = drafts[day] ?? '';
  return <section aria-label="특새 묵상 나눔">
    <h2>오늘 말씀에서 마음에 남은 것</h2>
    <p className="tc-footnote">마음에 남은 말씀, 오늘 해보고 싶은 작은 실천을 적어보세요.</p>
    <label className="tc-field-label" htmlFor="tc-reflection-day">묵상할 예배일</label>
    <select className="tc-text-input" id="tc-reflection-day" value={day} onChange={(e) => { setDay(e.target.value); setConsent(false); setMessage(''); }}>
      {SERVICE_DAYS.map((d, i) => <option key={d} value={d}>10월 {d}일({WEEKDAYS[i]})</option>)}
    </select>
    <label className="tc-field-label" htmlFor="tc-reflection">나의 묵상</label>
    <div className="tc-paper-field"><textarea id="tc-reflection" maxLength={1000} value={text} onChange={(e) => { setDrafts((current) => ({ ...current, [day]: e.target.value })); setConsent(false); setMessage(''); }} placeholder="오늘 말씀을 내 하루에 어떻게 이어가고 싶나요?" /></div>
    <p className="tc-footnote">{text.length} / 1000 · 새로고침하면 지워져요. 남기려면 파일로 저장해주세요.</p>
    <button className="tc-secondary" type="button" disabled={!text.trim()} onClick={() => { try { saveReflection(text.trim(), `10/${day}`); setMessage('묵상 파일 다운로드를 요청했어요. 기기의 다운로드 폴더를 확인해주세요.'); } catch { setMessage('저장하지 못했어요. 내용을 직접 복사해주세요.'); } }}>묵상 파일로 저장</button>
    <label className="tc-checkbox"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>이 묵상을 내가 선택한 사람에게 나눌게요.<small>다음 버튼을 누른 뒤 기기의 공유 메뉴에서 앱과 받는 사람을 직접 선택합니다.</small></span></label>
    <button className="tc-primary" type="button" disabled={!consent || !text.trim()} onClick={async () => setMessage(await shareText(`10월 ${day}일 특새 묵상`, text.trim()))}>묵상 공유 메뉴 열기</button>
    <p className="tc-lock-note">교회나 앱 서버에 제출되지 않아요. 공개 게시판에도 올라가지 않습니다.</p>
    {message && <p role="status" className="tc-form-status">{message}</p>}
  </section>;
}
