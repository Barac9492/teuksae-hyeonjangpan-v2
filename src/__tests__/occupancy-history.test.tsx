import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { LiveParkingPanel, useLiveOperations } from '../features/companion/LiveOperations';
function Harness(){const operations=useLiveOperations();return <LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>;}
beforeEach(() => { vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-10-06T04:40:00+09:00')); });
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
function mock(percent: unknown, updatedAt=new Date().toISOString(), state='busy'){
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({enabled:true,resources:[{id:'parking.songrim',category:'parking',state,version:2,updatedAt,occupancyPercent:percent,lastFullAt:'2026-10-04T19:00:00Z'}]})));
}
it('displays an explicit operator estimate and historical full time for Songrim',async()=>{
 mock(70);render(<Harness/>);expect(await screen.findByText('70%')).toHaveClass('tc-status-value--warn');expect(screen.getByText('송림주차장')).toBeVisible();expect(screen.getByText(/최근 만차·만석 기록/)).toBeVisible();
});
it('uses green at 0%',async()=>{
 mock(0,new Date().toISOString(),'available');render(<Harness/>);expect(await screen.findByText('0%')).toHaveClass('tc-status-value--good');
});
it('uses red at 100%',async()=>{
 mock(100,new Date().toISOString(),'full');render(<Harness/>);expect(await screen.findByText('100%')).toHaveClass('tc-status-value--stop');
});
it('never displays stale percentages but retains labelled history',async()=>{
 mock(70,new Date(Date.now()-11*60000).toISOString());render(<Harness/>);expect(await screen.findByText(/10분 경과/)).toBeVisible();expect(screen.queryByText(/70%/)).not.toBeInTheDocument();expect(screen.getByText(/최근 만차·만석 기록/)).toBeVisible();
});
it('fails closed on invalid percentages',async()=>{
 mock(101);render(<Harness/>);expect(await screen.findByText('송림주차장')).toBeVisible();expect(screen.queryByText(/101%/)).not.toBeInTheDocument();expect(screen.queryByText('혼잡')).not.toBeInTheDocument();
});
it('shows an unknown estimate neutrally even when an old state says busy',async()=>{
 mock(null,new Date().toISOString(),'busy');render(<Harness/>);expect(await screen.findByText('사용률 확인 전')).toBeVisible();expect(screen.queryByText('혼잡')).not.toBeInTheDocument();
});
it('keeps an explicit closed label when there is no percentage',async()=>{
 mock(null,new Date().toISOString(),'closed');render(<Harness/>);expect(await screen.findByText('닫힘')).toBeVisible();
});

it.each([[65,'busy'],[40,'full'],[0,'closed']])('fails closed on malformed step/state %s %s',async(percent,state)=>{
 mock(percent,new Date().toISOString(),String(state));render(<Harness/>);expect(await screen.findByText('송림주차장')).toBeVisible();expect(screen.queryByText(String(percent)+'%')).not.toBeInTheDocument();
});

function mockPrevious(firstFullAt: string | null, closedAt: string | null, date='2026-10-05') {
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({enabled:true,resources:[{id:'parking.songrim',category:'parking',state:'busy',version:2,updatedAt:'2026-10-05T19:00:00Z',occupancyPercent:70,previousDay:{date,firstFullAt,closedAt}}]})));
}
it('shows date-labelled prior full and closing times even when current occupancy is stale',async()=>{
 mockPrevious('2026-10-04T19:20:00Z','2026-10-04T20:10:00Z');render(<Harness/>);
 expect(await screen.findByText(/10\/05 주차 기록 · 첫 만차 04:20 · 마감 05:10/)).toBeVisible();
});
it('distinguishes missing history from a claim that parking never closed',async()=>{
 mockPrevious(null,null);render(<Harness/>);
 expect(await screen.findByText(/첫 만차 기록 없음 · 마감 기록 없음/)).toBeVisible();
});
it('does not label timestamps from another Korea day as the prior day history',async()=>{
 mockPrevious('2026-10-05T19:20:00Z',null);render(<Harness/>);
 expect(await screen.findByText('송림주차장')).toBeVisible();
 expect(screen.queryByText(/10\/05 주차 기록/)).not.toBeInTheDocument();
});
