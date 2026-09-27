import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveParkingPanel, useLiveOperations } from '../features/companion/LiveOperations';
function Harness(){const operations=useLiveOperations();return <LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>;}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function mock(percent: unknown, updatedAt=new Date().toISOString(), state='busy'){
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({enabled:true,resources:[{id:'parking.calvary',category:'parking',state,version:2,updatedAt,occupancyPercent:percent,lastFullAt:'2026-01-01T00:00:00Z'}]})));
}
it('displays an explicit operator estimate and historical full time for Calvary',async()=>{
 mock(70);render(<Harness/>);expect(await screen.findByText('70%')).toHaveClass('tc-status-value--warn');expect(screen.getByText('갈보리교회 주차')).toBeVisible();expect(screen.getByText(/최근 만차·만석 기록/)).toBeVisible();
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
 mock(101);render(<Harness/>);expect(await screen.findByText('갈보리교회 주차')).toBeVisible();expect(screen.queryByText(/101%/)).not.toBeInTheDocument();expect(screen.queryByText('혼잡')).not.toBeInTheDocument();
});
it('shows an unknown estimate neutrally even when an old state says busy',async()=>{
 mock(null,new Date().toISOString(),'busy');render(<Harness/>);expect(await screen.findByText('사용률 확인 전')).toBeVisible();expect(screen.queryByText('혼잡')).not.toBeInTheDocument();
});
it('keeps an explicit closed label when there is no percentage',async()=>{
 mock(null,new Date().toISOString(),'closed');render(<Harness/>);expect(await screen.findByText('닫힘')).toBeVisible();
});

it.each([[65,'busy'],[40,'full'],[0,'closed']])('fails closed on malformed step/state %s %s',async(percent,state)=>{
 mock(percent,new Date().toISOString(),String(state));render(<Harness/>);expect(await screen.findByText('갈보리교회 주차')).toBeVisible();expect(screen.queryByText(String(percent)+'%')).not.toBeInTheDocument();
});
