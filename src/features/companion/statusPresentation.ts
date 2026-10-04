import { servicePeriod } from './serviceSchedule';

export const STATUS_FRESH_MS = 10 * 60_000;
export function isFreshStatus(updatedAt: string | null, now: number) {
  if (!updatedAt) return false;
  const time = Date.parse(updatedAt);
  return Number.isFinite(time) && time <= now && now - time <= STATUS_FRESH_MS;
}
export function lastConfirmedText(updatedAt: string | null, now: number) {
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt)) || Date.parse(updatedAt) > now) return '아직 확인 기록 없음';
  const sameDay = new Date(Date.parse(updatedAt) + 9 * 3600000).toISOString().slice(0, 10) === new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false, ...(!sameDay ? { month: 'numeric', day: 'numeric' } as const : {}) }).format(new Date(updatedAt));
  return `마지막 확인 ${time} (한국)${isFreshStatus(updatedAt, now) ? '' : ' · 10분 경과'}`;
}
export function publicStatusDisclosure(category: 'space' | 'parking', updatedAt: string | null, now: number) {
  const { mode } = servicePeriod(now);
  if (mode === 'worship') return '예배 중 · 05:50까지 현황 표시·갱신 중지';
  if (mode === 'after' && category === 'space') return '예배 후 · 귀가 안내 표시';
  return isFreshStatus(updatedAt, now) ? '공개 중(10분 이내)' : '확인 필요';
}
export function publicSaveDisclosure(category: 'space' | 'parking', now: number) {
  const { mode } = servicePeriod(now);
  if (mode === 'worship') return '예배 중에는 현황 표시·갱신을 멈춥니다. 05:50부터 주차 현황과 귀가 안내를 표시합니다.';
  if (mode === 'after' && category === 'space') return '예배 후 첫 화면에는 출입 현황 대신 귀가 안내를 표시합니다.';
  return '공개 앱이 열려 있고 연결되어 있으면 다음 자동 확인 때 반영합니다(20초 주기).';
}
