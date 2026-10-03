import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus } from '../features/companion/LiveOperations';
const now = Date.parse('2026-09-30T04:40:00+09:00');
const ids = ['space.songrim.access', 'space.songrim.hall', 'space.songrim.gym', 'space.dream.f3', 'space.dream.f7', 'space.dream.f11', 'parking.songrim', 'parking.calvary', ...[1,2,3,4,5].map(f => 'parking.dream.b'+f)];
afterEach(cleanup);
it.each(['songrim','dream'] as const)('removes public status metadata for %s while keeping current readings', venue => {
 const operations = {enabled:true,offline:false,confirmed:true,lastSync:now,now,resources:ids.map(id => ({id,label:id,category:id.startsWith('parking') ? 'parking' as const : 'space' as const,state:id.endsWith('access') ? 'school_open' as const : 'busy' as const,version:1,updatedAt:new Date(now-60000).toISOString(),...(id.endsWith('access') ? {} : {occupancyPercent:70}),lastFullAt:new Date(now-86400000).toISOString(),lastClosedAt:new Date(now-86400000).toISOString(),previousDay:{date:'2026-09-29',firstFullAt:'2026-09-28T19:20:00Z',closedAt:'2026-09-28T20:10:00Z'}}))};
 const view=render(<><LiveWorshipStatus venue={venue} operations={operations}/><LiveParkingPanel venue={venue} setVenue={()=>{}} operations={operations}/></>);
 expect(view.container.textContent).not.toMatch(/조회일|한국 시간|마지막 확인 후|최근 닫힘|최근 만차|주차 기록|확인 날짜·시각/);
 expect(screen.getAllByText('70% · 혼잡').length).toBeGreaterThan(0);
 operations.resources.forEach(r => {r.updatedAt=new Date(now-11*60000).toISOString();});
 view.rerender(<><LiveWorshipStatus venue={venue} operations={operations}/><LiveParkingPanel venue={venue} setVenue={()=>{}} operations={operations}/></>);
 expect(view.container.textContent).not.toMatch(/조회일|한국 시간|10분 경과|최근 닫힘|최근 만차|주차 기록/);
 expect(screen.queryByText(/70%/)).not.toBeInTheDocument();
 expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
});
