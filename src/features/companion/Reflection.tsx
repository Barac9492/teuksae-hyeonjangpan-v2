import { runtimeStorageKey, useRuntime } from '../rehearsal/runtime';
import { useEffect, useState } from 'react';
import { SERVICE_DAYS, WEEKDAYS } from './dawn';
import { saveReflection } from './shareText';
import { Community } from './Community';

export const REFLECTION_DRAFTS_KEY = 'teuksae:reflection-drafts:v1';

type DraftLoad = { drafts: Record<string, string>; error: string };

function loadDrafts(): DraftLoad {
  if (typeof window === 'undefined') return { drafts: {}, error: '' };
  try {
    const raw = window.localStorage.getItem(runtimeStorageKey(REFLECTION_DRAFTS_KEY));
    if (!raw) return { drafts: {}, error: '' };
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('invalid reflection drafts');
    const drafts: Record<string, string> = {};
    for (const day of SERVICE_DAYS) {
      const value = (saved as Record<string, unknown>)[String(day)];
      if (typeof value === 'string') drafts[String(day)] = value.slice(0, 1000);
    }
    return { drafts, error: '' };
  } catch {
    return { drafts: {}, error: '이 기기에 저장된 임시 묵상을 읽지 못했어요. 현재 입력은 이 화면에만 유지됩니다.' };
  }
}

export function Reflection() {
  const runtime = useRuntime();
  const [initialDrafts] = useState(loadDrafts);
  const [day, setDay] = useState(String(runtime.rehearsal ? runtime.eventDay + 5 : 5));
  useEffect(() => { if (runtime.rehearsal) setDay(String(runtime.eventDay + 5)); }, [runtime.rehearsal, runtime.eventDay]);
  const [drafts, setDrafts] = useState<Record<string, string>>(initialDrafts.drafts);
  const [storageError, setStorageError] = useState(initialDrafts.error);
  const [message, setMessage] = useState('');
  const text = drafts[day] ?? '';
  const updateDraft = (value: string) => {
    const next = { ...drafts, [day]: value };
    setDrafts(next);
    setMessage('');
    try {
      window.localStorage.setItem(runtimeStorageKey(REFLECTION_DRAFTS_KEY), JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('자동 저장하지 못했어요. 내용은 현재 화면에만 남아 있으며 새로고침하거나 닫으면 사라질 수 있어요. 필요한 내용은 직접 복사해주세요.');
    }
  };
  return <section aria-label="특새 묵상 나눔">
    <h2>오늘 말씀에서 마음에 남은 것</h2>
    <p className="tc-footnote">마음에 남은 말씀, 오늘 해보고 싶은 작은 실천을 적어보세요.</p>
    <label className="tc-field-label" htmlFor="tc-reflection-day">묵상할 예배일</label>
    <select className="tc-text-input" id="tc-reflection-day" value={day} onChange={(e) => { setDay(e.target.value); setMessage(''); }}>
      {SERVICE_DAYS.map((d, i) => <option key={d} value={d}>10월 {d}일({WEEKDAYS[i]})</option>)}
    </select>
    <label className="tc-field-label" htmlFor="tc-reflection">나의 묵상</label>
    <div className="tc-paper-field"><textarea id="tc-reflection" maxLength={1000} value={text} onChange={(e) => updateDraft(e.target.value)} placeholder="오늘 말씀을 내 하루에 어떻게 이어가고 싶나요?" /></div>
    <p className="tc-footnote">{text.length} / 1000 · 이 기기에 자동 임시저장됩니다.</p>
    {storageError && <p role="alert" className="tc-form-status">{storageError}</p>}
    <button className="tc-secondary" type="button" disabled={!text.trim()} onClick={() => { try { saveReflection(text.trim(), `10/${day}`); setMessage('묵상 파일 다운로드를 요청했어요. 기기의 다운로드 폴더를 확인해주세요.'); } catch { setMessage('파일 저장을 요청하지 못했어요. 자동 저장 상태를 확인하고 필요한 내용은 직접 복사해주세요.'); } }}>묵상 파일로 저장</button>
    <p className="tc-lock-note">묵상 초안은 이 기기에만 저장됩니다.</p><details className="tc-footnote"><summary>ⓘ 저장·공개 안내</summary><p>자동 저장 초안과 파일 저장은 공개 접수 전까지 서버로 전송되지 않습니다. 같은 기기와 브라우저를 쓰는 사람은 초안을 볼 수 있고, 브라우저 데이터를 지우면 초안도 사라집니다. 원할 때만 아래에서 전체 공개에 별도로 동의해주세요.</p></details>
    <Community kind="reflection" text={text} eventDay={Number(day) - 5} payloadKey={JSON.stringify([day, text])} />
    {message && <p role="status" className="tc-form-status">{message}</p>}
  </section>;
}
