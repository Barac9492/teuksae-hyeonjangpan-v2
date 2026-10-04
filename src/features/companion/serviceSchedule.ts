/** The six 2026 services use Asia/Seoul (UTC+09:00, no DST in 2026).
 * Explicit offsets keep browser/host timezone and preview controls out of policy.
 */
export type ServiceMode = 'outside' | 'before' | 'worship' | 'after';
const DAYS = [5, 6, 7, 8, 9, 10];
const at = (day: number, time: string) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T${time}+09:00`);
const boundaries = DAYS.flatMap(day => [at(day, '00:00:00'), at(day, '04:40:00'), at(day, '05:50:00')]).concat(at(11, '00:00:00'));
export function servicePeriod(now = Date.now()) {
  const date = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const day = Number(date.slice(8));
  const eventDay = date.startsWith('2026-10-') && DAYS.includes(day) ? day : null;
  const mode: ServiceMode = eventDay === null ? 'outside' : now < at(day, '04:40:00') ? 'before' : now < at(day, '05:50:00') ? 'worship' : 'after';
  return { mode, eventDay, key: `${date}:${mode}`, nextChange: boundaries.find(time => time > now) ?? Infinity };
}

/** Check at dispatch AND after decoding: transports can ignore AbortSignal. */
export function canPublishPublicRequest(startedAt: number, now = Date.now()) {
  const period = servicePeriod(now);
  return period.mode !== 'worship' && servicePeriod(startedAt).key === period.key;
}

/** Exact boundary timeout plus resume/clock-change checks. No fetches here. */
export function watchServiceClock(tick: () => void) {
  let timer: number;
  let stopped = false;
  const update = () => {
    if (stopped) return;
    window.clearTimeout(timer);
    tick();
    timer = window.setTimeout(update, Math.min(30000, Math.max(1, servicePeriod().nextChange - Date.now())));
  };
  document.addEventListener('visibilitychange', update);
  for (const event of ['pageshow', 'focus', 'online']) window.addEventListener(event, update);
  update();
  return () => {
    stopped = true; window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', update);
    for (const event of ['pageshow', 'focus', 'online']) window.removeEventListener(event, update);
  };
}
