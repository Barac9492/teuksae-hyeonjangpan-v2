import { useEffect, useRef, useState } from 'react';

type Clock = { elapsed: number; startedAt: number | null };
const format = (ms: number) => { const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; };

export function PrayerTimer() {
  const [minutes, setMinutes] = useState(1);
  const [clock, setClock] = useState<Clock>({ elapsed: 0, startedAt: null });
  const latest = useRef(clock); latest.current = clock;
  const [now, setNow] = useState(Date.now());
  const target = minutes * 60000;
  const elapsed = Math.min(target, clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt)));
  const done = elapsed >= target;
  const running = clock.startedAt !== null && !done;
  useEffect(() => {
    if (clock.startedAt === null) return;
    const tick = () => {
      const time = Date.now(); setNow(time);
      const current = latest.current;
      if (current.startedAt !== null && current.elapsed + Math.max(0, time - current.startedAt) >= target) {
        const finished = { elapsed: target, startedAt: null }; latest.current = finished; setClock(finished);
      }
    };
    tick(); const timer = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick); window.addEventListener('pageshow', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); };
  }, [clock.startedAt, target]);
  const update = (next: Clock) => { latest.current = next; setNow(Date.now()); setClock(next); };
  const start = () => { const current = latest.current; if (current.startedAt !== null) return; update({ elapsed: current.elapsed >= target ? 0 : current.elapsed, startedAt: Date.now() }); };
  const pause = () => { const current = latest.current; if (current.startedAt === null) return; update({ elapsed: Math.min(target, current.elapsed + Math.max(0, Date.now() - current.startedAt)), startedAt: null }); };
  return <section className="tc-prayer-timer" aria-label="기도 타이머">
    <h2>기도 타이머</h2>
    <p>정한 시간만큼 조용히 기도해요. 남은 시간이 줄어드는 타이머입니다.</p>
    <label>기도 시간<select aria-label="기도 시간" value={minutes} disabled={running || elapsed > 0} onChange={e => setMinutes(Number(e.target.value))}>{[1, 3, 5, 10, 20, 30].map(n => <option key={n} value={n}>{n}분</option>)}</select></label>
    <div className="tc-prayer-timer__time" role="timer" aria-label="남은 기도 시간"><small>남은 시간</small><strong>{format(target - elapsed)}</strong></div>
    <p role="status">{done ? `${minutes}분 기도를 마쳤어요. 아멘.` : running ? '기도 중 · 천천히 숨을 고르며 하나님 앞에 머물러요.' : elapsed > 0 ? '일시정지 · 이어서 기도할 수 있어요.' : '준비되면 기도 시작을 눌러주세요.'}</p>
    <div className="tc-timer-actions">{running ? <button type="button" className="tc-secondary" onClick={pause}>일시정지</button> : <button type="button" className="tc-primary" onClick={start}>{done ? '다시 기도하기' : elapsed > 0 ? '이어서 기도' : '기도 시작'}</button>}<button type="button" className="tc-secondary" onClick={() => update({ elapsed: 0, startedAt: null })}>초기화</button></div>
    <small>시간을 바꾸려면 초기화를 눌러주세요. 소리·진동 없이 끝나요. 다른 탭이나 잠금 화면에서도 시간은 흐릅니다. 앱을 닫거나 새로고침하면 초기화됩니다.</small>
  </section>;
}
