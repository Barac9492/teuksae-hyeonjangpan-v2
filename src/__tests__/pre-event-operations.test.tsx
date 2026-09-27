import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus, liveStage } from '../features/companion/LiveOperations';
afterEach(cleanup);
const operations = (time: string) => ({ enabled: true, offline: false, confirmed: true, lastSync: null, now: Date.parse(time), resources: [
  { id: 'space.songrim.access', label: '학교 출입', category: 'space' as const, state: 'hall_open' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z' },
  ...['parking.songrim', 'parking.calvary'].map(id => ({ id, label: id, category: 'parking' as const, state: 'full' as const, version: 1, updatedAt: '2026-10-04T14:59:00Z', occupancyPercent: 100, previousDay: {date: '2026-09-27', firstFullAt: '2026-09-26T19:00:00Z', closedAt: null} })),
] });
it('hides rehearsal status and parking history before the Korea event day', () => {
 const ops = operations('2026-10-04T23:59:59+09:00');
 render(<><LiveWorshipStatus venue="songrim" operations={ops}/><LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={ops}/></>);
 expect(screen.getAllByText('특새 기간에 현장 정보가 표시됩니다')).toHaveLength(2);
 expect(screen.queryByText(/09\/27/)).not.toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
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
