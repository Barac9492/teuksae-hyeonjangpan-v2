// User-supplied final official notice, confirmed on 2026-10-03.
// These are published schedule rules, never current occupancy or opening state.
export const OPENING_NOTICE = '송림 본당 및 드림센터 개방 시간: 새벽 3시 50분 전후';
export const HOLIDAY_PARKING = '송림 종일 주차 가능 · 자율 출차 불가 · 선입선출. 중간 출차가 필요하면 드림센터를 이용해주세요.';
export const WEEKDAY_PARKING = '학교 수업을 위해 송림학교 운동장 차량은 06:45까지 출차해주세요.';

/** Actual October date, using Korea time; null outside the six service days. */
export function noticeServiceDay(now: number): number | null {
  if (!Number.isFinite(now)) return null;
  const date = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
  const day = Number(date.slice(8));
  return date.startsWith('2026-10-') && day >= 5 && day <= 10 ? day : null;
}

export function songrimParkingNotice(day: number | null): string {
  if (day === 5 || day === 9) return `10월 ${day}일 공휴일에도 새벽예배는 정상 진행합니다. ${HOLIDAY_PARKING}`;
  if (day === 6 || day === 7 || day === 8) return `10월 ${day}일 평일 안내 · ${WEEKDAY_PARKING}`;
  if (day === 10) return '10월 10일(토) 송림 출차는 현장 안내를 따라주세요.';
  return `평일 10월 6–8일: ${WEEKDAY_PARKING} 공휴일 10월 5일·9일: ${HOLIDAY_PARKING} 10월 10일(토) 출차는 현장 안내를 확인해주세요.`;
}

export function calendarNotice(day: number, place: string): string {
  const parking = place.includes('드림센터')
    ? '중간 출차가 필요하면 드림센터를 이용해주세요. 주차 가능 여부는 현장 안내를 확인해주세요.'
    : songrimParkingNotice(day);
  return ['하나님 마음에 합한 사람 (사도행전 13:22) · 이찬수 담임목사', OPENING_NOTICE, '04:20 온라인 생중계 · 04:30 준비기도 · 04:40 예배 시작', parking].join('\\n');
}
