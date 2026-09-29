import { useRuntime } from './runtime';
export function RehearsalBanner({ publicView = false }: { publicView?: boolean }) {
  const runtime = useRuntime();
  if (!runtime.rehearsal) return null;
  return <aside className="rehearsal-banner" aria-label="리허설 안내"><strong>리허설 · 실제 현장 안내가 아닙니다</strong><p>테스트 데이터는 실제 운영 데이터와 분리됩니다. 10월 5일 00:00(한국 시간)에 실제 운영으로 자동 전환됩니다.</p><p>승인한 테스트 글·사진도 이 링크에서 누구나 볼 수 있습니다. 실제 개인정보는 올리지 마세요.</p>{!publicView && <p>리허설 계정 변경은 실제 운영 계정에 반영되지 않습니다.</p>}{publicView && <label>미리 볼 행사일 <select value={runtime.eventDay} onChange={e => runtime.setEventDay(Number(e.target.value))}>{['월', '화', '수', '목', '금', '토'].map((day, i) => <option key={day} value={i}>10월 {i + 5}일({day})</option>)}</select><small>콘텐츠 날짜만 바뀝니다. 현황 확인 시각과 접수 시각은 실제 시간입니다.</small></label>}</aside>;
}
