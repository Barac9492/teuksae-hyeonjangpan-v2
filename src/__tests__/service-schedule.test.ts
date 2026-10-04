import { describe, expect, it } from 'vitest';
import { canPublishPublicRequest, servicePeriod } from '../features/companion/serviceSchedule';
const at = (day: number, time: string) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T${time}+09:00`);
describe('Asia/Seoul service boundaries', () => {
  it.each([5, 6, 7, 8, 9, 10])('uses exact boundaries on October %s', day => {
    for (const [time, mode] of [['04:39:59', 'before'], ['04:40:00', 'worship'], ['05:49:59', 'worship'], ['05:50:00', 'after']] as const) {
      expect(servicePeriod(at(day, time))).toMatchObject({ eventDay: day, mode });
      expect(servicePeriod(Date.parse(new Date(at(day, time)).toISOString())).mode).toBe(mode);
    }
    expect(servicePeriod(at(day, '04:39:59')).nextChange).toBe(at(day, '04:40:00'));
    expect(servicePeriod(at(day, '04:40:00')).nextChange).toBe(at(day, '05:50:00'));
  });
  it('resets every Seoul midnight and never gates non-event dates', () => {
    expect(servicePeriod(Date.parse('2026-10-04T14:59:59Z')).mode).toBe('outside');
    expect(servicePeriod(Date.parse('2026-10-04T15:00:00Z'))).toMatchObject({eventDay:5,mode:'before'});
    expect(servicePeriod(at(5,'23:59:59')).mode).toBe('after');
    expect(servicePeriod(at(6,'00:00:00'))).toMatchObject({eventDay:6,mode:'before'});
    for (const date of ['2026-10-04T04:40:00+09:00','2026-10-11T04:40:00+09:00','2027-10-05T04:40:00+09:00']) expect(servicePeriod(Date.parse(date)).mode).toBe('outside');
  });
  it('rejects responses across worship, whole suspended services, midnight, and backward clock changes', () => {
    expect(canPublishPublicRequest(at(5,'04:39:59'),at(5,'04:40:00'))).toBe(false);
    expect(canPublishPublicRequest(at(5,'04:39:59'),at(5,'05:50:00'))).toBe(false);
    expect(canPublishPublicRequest(at(5,'23:59:59'),at(6,'00:00:00'))).toBe(false);
    expect(canPublishPublicRequest(at(5,'05:50:00'),at(5,'04:39:59'))).toBe(false);
    expect(canPublishPublicRequest(at(5,'05:50:00'),at(5,'05:50:01'))).toBe(true);
  });
});
