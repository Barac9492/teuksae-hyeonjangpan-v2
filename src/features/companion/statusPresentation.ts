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
export function publicStatusDisclosure(_category: 'space' | 'parking', updatedAt: string | null, now: number) {
  return isFreshStatus(updatedAt, now) ? '공개 중(최근 확인)' : hasConfirmedStatus(updatedAt, now) ? '마지막 기록 표시 중' : '확인 기록 없음';
}
export function publicSaveDisclosure() {
  return '공개 앱이 열려 있고 연결되어 있으면 다음 자동 확인 때 반영합니다(20초 주기).';
}
