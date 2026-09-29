import { useEffect, useState } from 'react';
import { useRuntime } from './runtime';
export function RehearsalReset() {
  const { rehearsal } = useRuntime();
  const [allowed, setAllowed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    if (!rehearsal) return;
    let alive = true;
    const check = async () => {
      try { const r = await fetch('/api/admin/rehearsal', { credentials: 'same-origin', cache: 'no-store' }); const b = await r.json(); if (alive) setAllowed(r.ok && b.rehearsal === true && b.canReset === true); }
      catch { if (alive) setAllowed(false); }
    };
    const refresh = () => { setAllowed(false); void check(); };
    void check(); const timer = window.setInterval(() => { void check(); }, 20000);
    window.addEventListener('woori-admin-session-change', refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('woori-admin-session-change', refresh); };
  }, [rehearsal]);
  if (!rehearsal) return null;
  const reset = async () => {
    if (!allowed || confirmation !== '리허설 초기화' || busy) return;
    setBusy(true); setResult('');
    try {
      const r = await fetch('/api/admin/rehearsal', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) });
      const body: unknown = await r.json();
      if (!r.ok || !body || typeof body !== 'object' || !('reset' in body) || body.reset !== true) throw new Error('초기화하지 못했습니다. 권한과 연결을 확인해주세요.');
      setResult('리허설 데이터를 초기화했습니다. 계정과 로그인은 유지됩니다. 새로 불러옵니다.');
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setResult(e instanceof Error ? e.message : '초기화하지 못했습니다.'); setBusy(false); }
  };
  return <section className="rehearsal-reset" aria-label="리허설 초기화"><button type="button" disabled={!allowed || busy} onClick={() => setConfirming(true)}>리허설 데이터 초기화</button>{!allowed && <p>최고 관리자 로그인 후에만 초기화할 수 있습니다.</p>}{confirming && <div><p>서버의 테스트 게시물·사진·현황·이력을 초기화합니다. 계정과 로그인 세션, 각 기기에 저장한 메모·파일은 유지됩니다. 사진은 즉시 비공개 처리 후 저장소에서 순차 삭제됩니다. 되돌릴 수 없습니다.</p><label>확인 문구 입력: 리허설 초기화<input value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} /></label><button type="button" disabled={busy} onClick={() => { setConfirming(false); setConfirmation(''); }}>취소</button><button type="button" disabled={!allowed || busy || confirmation !== '리허설 초기화'} onClick={() => void reset()}>테스트 데이터 삭제 확정</button></div>}{result && <p role="status">{result}</p>}</section>;
}
