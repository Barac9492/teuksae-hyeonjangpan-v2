import { servicePeriod } from './serviceSchedule';

// Freshness controls the disclosure/tone, never expiration of a saved reading.
export const STATUS_FRESH_MS = 10 * 60_000;
const koreaDay = (time: number) => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
export function hasConfirmedStatus(updatedAt: string | null, now: number) {
  if (!updatedAt) return false;
  const time = Date.parse(updatedAt);
  return Number.isFinite(time) && time <= now;
}
export function isFreshStatus(updatedAt: string | null, now: number) {
  return hasConfirmedStatus(updatedAt, now) && now - Date.parse(updatedAt!) <= STATUS_FRESH_MS && koreaDay(Date.parse(updatedAt!)) === koreaDay(now);
}
export function lastConfirmedText(updatedAt: string | null, now: number, lastKnown = false) {
  if (!hasConfirmedStatus(updatedAt, now)) return '아직 확인 기록 없음';
  const savedDay = koreaDay(Date.parse(updatedAt!)), today = koreaDay(now);
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false, ...(savedDay !== today ? { month: 'numeric', day: 'numeric' } as const : {}), ...(savedDay.slice(0,4) !== today.slice(0,4) ? { year: 'numeric' } as const : {}) }).format(new Date(updatedAt!));
  return `마지막 확인 ${time} (한국)${lastKnown || !isFreshStatus(updatedAt, now) ? ' · 마지막 기록' : ''}`;
}
export function publicStatusDisclosure(category: 'space' | 'parking', updatedAt: string | null, now: number) {
  const { mode } = servicePeriod(now);
  if (mode === 'worship') return '예배 중 · 05:50까지 현황 표시·갱신 중지';
  if (mode === 'after' && category === 'space') return '예배 후 · 귀가 안내 표시';
  return isFreshStatus(updatedAt, now) ? '공개 중(최근 확인)' : hasConfirmedStatus(updatedAt, now) ? '마지막 기록 표시 중' : '확인 기록 없음';
}
export function publicSaveDisclosure(category: 'space' | 'parking', now: number) {
  const { mode } = servicePeriod(now);
  if (mode === 'worship') return '예배 중에는 현황 표시·갱신을 멈춥니다. 05:50부터 주차 현황과 귀가 안내를 표시합니다.';
  if (mode === 'after' && category === 'space') return '예배 후 첫 화면에는 출입 현황 대신 귀가 안내를 표시합니다.';
  return '공개 앱이 열려 있고 연결되어 있으면 다음 자동 확인 때 반영합니다(20초 주기).';
}
