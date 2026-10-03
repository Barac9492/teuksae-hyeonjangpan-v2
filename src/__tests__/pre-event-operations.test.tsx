import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus, liveStage } from '../features/companion/LiveOperations';
afterEach(cleanup);
const operations = (time: string) => ({ enabled: true, offline: false, confirmed: true, lastSync: null, now: Date.parse(time), resources: [
  { id: 'space.songrim.access', label: '학교 출입', category: 'space' as const, state: 'hall_open' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z' },
  ...['space.songrim.hall', 'space.songrim.gym'].map(id => ({ id, label: id, category: 'space' as const, state: 'checking' as const, version: 0, updatedAt: null })),
  ...['parking.songrim'].map(id => ({ id, label: id, category: 'parking' as const, state: 'full' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z', occupancyPercent: 100, previousDay: {date: '2026-09-27', firstFullAt: '2026-09-26T19:00:00Z', closedAt: null} })),
] });
it('shows ordinary dated operations before the event without a separate inspection mode', () => {
 const ops = operations('2026-10-04T23:59:59+09:00');
 render(<><LiveWorshipStatus venue="songrim" operations={ops}/><LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/></>);
 expect(screen.queryByText('사전 점검 중')).not.toBeInTheDocument();
 expect(screen.queryByText(/실제 특새 운영 현황이 아닙니다/)).not.toBeInTheDocument();
 expect(screen.queryByText(/조회일/)).not.toBeInTheDocument();
 expect(screen.queryByText(/확인 \(한국 시간\)/)).not.toBeInTheDocument();
 expect(screen.queryByText('특새 기간에 현장 정보가 표시됩니다')).not.toBeInTheDocument();
 // All-date rehearsal availability: fresh readings show current values regardless of the
 // official event dates (no calendar eligibility gate), even though per-row history copy
 // is no longer rendered publicly.
 expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
 expect(screen.queryByText(/갈보리/)).not.toBeInTheDocument();
 expect(liveStage(ops)).toBe(3);
});
it('keeps a fresh reading current across the calendar event boundary, since date eligibility gates were removed', () => {
 const ops = operations('2026-10-05T00:00:00+09:00');
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/>);
 expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
 expect(liveStage(ops)).toBe(3);
});
it('does not hide live status after the official event end date, since date-based hiding was removed', () => {
 const ops = operations('2026-10-12T00:10:00+09:00');
 ops.resources.forEach(resource => { if (resource.updatedAt) resource.updatedAt = new Date(Date.parse('2026-10-12T00:10:00+09:00') - 60_000).toISOString(); });
 render(<LiveWorshipStatus venue="songrim" operations={ops}/>);
 expect(screen.queryByText('특새 기간에 현장 정보가 표시됩니다')).not.toBeInTheDocument();
 expect(screen.getByText('본당 입장 가능')).toBeInTheDocument();
 expect(liveStage(ops)).toBe(3);
});

it('falls back to a checking state on stale data across Korea midnight, without claiming a current value', () => {
 const ops = operations('2026-09-30T00:15:00+09:00');
 ops.resources.forEach(resource => { resource.updatedAt = '2026-09-29T14:59:00Z'; });
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/>);
 expect(screen.queryByText(/조회일/)).not.toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
 expect(screen.getAllByText('확인 필요')).toHaveLength(1);
 expect(screen.queryByText(/갈보리/)).not.toBeInTheDocument();
});
it('does not claim a current value while offline', () => {
 const ops = {...operations('2026-10-04T23:59:59+09:00'), offline: true};
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/>);
 expect(screen.queryByText(/확인 \(한국 시간\)/)).not.toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
 expect(screen.getAllByText('확인 필요')).toHaveLength(1);
 expect(screen.queryByText(/갈보리/)).not.toBeInTheDocument();
 expect(liveStage(ops)).toBeNull();
});
it('does not present a future timestamp as a confirmed reading', () => {
 const ops = operations('2026-10-04T23:58:00+09:00');
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/>);
 // A future updatedAt fails freshness (status 'future'), so the public value falls back to
 // the unconfirmed state instead of showing the raw percentage.
 expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
 expect(screen.queryByText(/23:59 확인/)).not.toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
});
