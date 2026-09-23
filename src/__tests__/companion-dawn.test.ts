import { describe, expect, it } from 'vitest';
import { buildCalendar, dawnPhase, seoulDayDiff, serviceTime, wakeTimeText } from '../features/companion/dawn';

describe('dawn helpers', () => {
  it('places each service at 04:40 Seoul time', () => {
    expect(new Date(serviceTime(5)).toISOString()).toBe('2026-10-04T19:40:00.000Z');
    expect(new Date(serviceTime(10)).toISOString()).toBe('2026-10-09T19:40:00.000Z');
  });
  it('moves from before, through six dawns, to after', () => {
    expect(dawnPhase(Date.parse('2026-09-24T00:00:00Z')).phase).toBe('before');
    const during = dawnPhase(Date.parse('2026-10-06T00:00:00Z'));
    expect(during).toMatchObject({ phase: 'during', nextIndex: 2, doneCount: 2 });
    expect(dawnPhase(Date.parse('2026-10-09T19:41:00Z')).phase).toBe('after');
    expect(seoulDayDiff(Date.parse('2026-09-24T00:00:00Z'), serviceTime(5))).toBe(11);
  });
  it('computes wake time and a calendar without an invented end time', () => {
    expect(wakeTimeText(70)).toBe('03:30');
    const ics = buildCalendar(70, '송림본당 (이매)', Date.parse('2026-09-24T00:00:00Z'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    expect(ics).toContain('DTSTART:20261004T194000Z');
    expect(ics).toContain('TRIGGER:-PT70M');
    expect(ics).not.toMatch(/DTEND|DURATION/);
  });
});
