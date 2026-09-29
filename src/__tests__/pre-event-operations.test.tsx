import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus, liveStage } from '../features/companion/LiveOperations';
afterEach(cleanup);
const operations = (time: string) => ({ enabled: true, offline: false, confirmed: true, lastSync: null, now: Date.parse(time), resources: [
  { id: 'space.songrim.access', label: '학교 출입', category: 'space' as const, state: 'hall_open' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z' },
  ...['space.songrim.hall', 'space.songrim.gym'].map(id => ({ id, label: id, category: 'space' as const, state: 'checking' as const, version: 0, updatedAt: null })),
  ...['parking.songrim', 'parking.calvary'].map(id => ({ id, label: id, category: 'parking' as const, state: 'full' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z', occupancyPercent: 100, previousDay: {date: '2026-09-27', firstFullAt: '2026-09-26T19:00:00Z', closedAt: null} })),
] });
it('shows a clearly-labelled pre-event rehearsal preview with live fresh values before the Korea event day', () => {
 const ops = operations('2026-10-04T23:59:59+09:00');
 render(<><LiveWorshipStatus venue="songrim" operations={ops}/><LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/></>);
 expect(screen.getAllByText('사전 점검 중')).toHaveLength(2);
 expect(screen.getAllByText(/실제 특새 운영 현황이 아닙니다/).length).toBeGreaterThan(0);
 expect(screen.queryByText('특새 기간에 현장 정보가 표시됩니다')).not.toBeInTheDocument();
 // Rehearsal timestamps are current (not tied to the real event dates), so fresh values may show.
 expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
 // Parking history is still tied to real event dates, so no prior-day record can exist yet.
 expect(screen.queryByText(/09\/27/)).not.toBeInTheDocument();
 expect(liveStage(ops)).toBeNull();
});
it('does not turn a recent pre-event rehearsal into opening-day live data', () => {
 const ops = operations('2026-10-05T00:00:00+09:00');
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/>);
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
 expect(screen.queryByText(/09\/27/)).not.toBeInTheDocument();
 expect(screen.getAllByText('확인 필요')).toHaveLength(2);
 expect(liveStage(ops)).toBeNull();
});
