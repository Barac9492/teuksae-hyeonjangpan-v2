import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveParkingPanel, useLiveOperations } from '../features/companion/LiveOperations';
function Harness(){const operations=useLiveOperations();return <LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>;}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function mock(percent: unknown, updatedAt=new Date().toISOString(), state='busy'){
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({enabled:true,resources:[{id:'parking.calvary',category:'parking',state,version:2,updatedAt,occupancyPercent:percent,lastFullAt:'2026-01-01T00:00:00Z'}]})));
}
it('displays an explicit operator estimate and historical full time for Calvary',async()=>{
 mock(0);render(<Harness/>);expect(await screen.findByText('혼잡 · 0% (운영자 추정)')).toBeVisible();expect(screen.getByText('갈보리교회 주차')).toBeVisible();expect(screen.getByText(/최근 만차·만석 기록/)).toBeVisible();
});
it('never displays stale percentages but retains labelled history',async()=>{
 mock(90,new Date(Date.now()-11*60000).toISOString());render(<Harness/>);expect(await screen.findByText(/10분 경과/)).toBeVisible();expect(screen.queryByText(/90%/)).not.toBeInTheDocument();expect(screen.getByText(/최근 만차·만석 기록/)).toBeVisible();
});
it('fails closed on invalid percentages',async()=>{
 mock(101);render(<Harness/>);expect(await screen.findByText('갈보리교회 주차')).toBeVisible();expect(screen.queryByText(/101%/)).not.toBeInTheDocument();expect(screen.queryByText('혼잡')).not.toBeInTheDocument();
});
it('does not invent a percentage for null',async()=>{
 mock(null);render(<Harness/>);expect(await screen.findByText('혼잡')).toBeVisible();expect(screen.queryByText(/% \(운영자 추정\)/)).not.toBeInTheDocument();
});
