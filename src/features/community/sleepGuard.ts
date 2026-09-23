/** 카풀 운전자의 잠을 지키는 계산. 은혜보다 안전이 먼저다. */
export interface SleepPlanInput {
  arriveAt: string; // "04:20"
  driveMinutes: number;
  prepMinutes: number;
  bedtime: string; // "22:30"
}

export type SleepVerdict = "ok" | "short" | "danger";

export interface SleepPlan {
  departAt: string;
  wakeAt: string;
  sleepMinutes: number;
  verdict: SleepVerdict;
  message: string;
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function clock(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function planDriverNight(input: SleepPlanInput): SleepPlan | null {
  const arrive = parseClock(input.arriveAt);
  const bed = parseClock(input.bedtime);
  if (arrive === null || bed === null) return null;
  const drive = Math.min(180, Math.max(0, Math.round(input.driveMinutes)));
  const prep = Math.min(120, Math.max(0, Math.round(input.prepMinutes)));

  const depart = arrive - drive;
  const wake = depart - prep;
  // 취침은 전날 밤, 기상은 새벽. 자정을 넘긴 거리로 계산한다.
  let sleep = ((wake - bed) % 1440 + 1440) % 1440;
  if (sleep > 720) sleep = 0; // 취침 시각이 기상보다 늦으면 잠이 없다.

  let verdict: SleepVerdict = "ok";
  let message = `잠 ${formatDuration(sleep)}. 5시간 이상입니다.`;
  if (sleep < 300) {
    verdict = "danger";
    message = `잠 ${formatDuration(sleep)}. 5시간 아래면 졸음운전 위험이 큽니다. 취침을 당기거나, 다른 차를 타거나, 온라인으로 드리는 것도 방법입니다.`;
  } else if (sleep < 360) {
    verdict = "short";
    message = `잠 ${formatDuration(sleep)}. 5시간은 넘지만 여유가 적습니다. 취침을 30분 당기면 6시간이 됩니다.`;
  }

  return {
    departAt: clock(depart),
    wakeAt: clock(wake),
    sleepMinutes: sleep,
    verdict,
    message,
  };
}
