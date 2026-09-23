/** Time helpers for the six dawn services (2026-10-05 ~ 10-10, 04:40 KST). */

export const SERVICE_DAYS = [5, 6, 7, 8, 9, 10] as const;
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토'] as const;

/** 04:40 KST on October `day` expressed as a UTC timestamp. */
export function serviceTime(day: number): number {
  return Date.UTC(2026, 9, day, 4 - 9, 40);
}

export type DawnPhase =
  | { phase: 'before'; next: number; doneCount: 0 }
  | { phase: 'during'; next: number; nextIndex: number; doneCount: number }
  | { phase: 'after'; doneCount: 6 };

export function dawnPhase(now: number): DawnPhase {
  const times = SERVICE_DAYS.map(serviceTime);
  if (now < times[0]) return { phase: 'before', next: times[0], doneCount: 0 };
  const nextIndex = times.findIndex((time) => time > now);
  if (nextIndex === -1) return { phase: 'after', doneCount: 6 };
  return { phase: 'during', next: times[nextIndex], nextIndex, doneCount: nextIndex };
}

/** Calendar-day difference in Seoul time (for a D-day label). */
export function seoulDayDiff(from: number, to: number): number {
  const day = (ms: number) => Math.floor((ms + 9 * 3_600_000) / 86_400_000);
  return day(to) - day(from);
}

export function countdownParts(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** "03:25" for a number of minutes before 04:40. */
export function wakeTimeText(minutesBefore: number): string {
  const total = ((4 * 60 + 40 - minutesBefore) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Builds an .ics file with the six services and an alarm at the wake-up time.
 * No end time is set on purpose: the service end time has not been announced.
 */
export function buildCalendar(minutesBefore: number, place: string, created = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//woori-dawn//teuksae 2026//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const day of SERVICE_DAYS) {
    const start = serviceTime(day);
    lines.push(
      'BEGIN:VEVENT',
      `UID:teuksae-2026-10-${String(day).padStart(2, '0')}@woori-dawn`,
      `DTSTAMP:${stamp(created)}`,
      `DTSTART:${stamp(start)}`,
      'SUMMARY:가을특별새벽부흥회 · 04:40 예배 시작',
      `LOCATION:${place}`,
      'DESCRIPTION:하나님 마음에 합한 사람 (사도행전 13:22)\\n04:40은 예배 시작 시각입니다. 학교·예배 공간 개방 시각은 현장 안내를 확인해주세요.',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:일어날 시간이에요 · 특별새벽부흥회',
      `TRIGGER:-PT${minutesBefore}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
