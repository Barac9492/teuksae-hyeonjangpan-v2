import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus } from '../features/companion/LiveOperations';
import type { ComponentProps } from 'react';
type Ops = ComponentProps<typeof LiveWorshipStatus>['operations'];
const now = Date.parse('2026-09-29T16:00:00+09:00');
const ids = ['parking.songrim','parking.calvary','parking.dream.b1','parking.dream.b2','parking.dream.b3','parking.dream.b4','parking.dream.b5','space.songrim.access','space.songrim.hall','space.songrim.gym','space.dream.f11','space.dream.f7','space.dream.f3'];
function ops(freshId: string, time = now - 60_000): Ops {
 return { now, enabled: true, offline: false, confirmed: true, lastSync: now, resources: ids.map(id => ({id,label:id,category:id.startsWith('parking')?'parking':'space',state:'available',version:1,occupancyPercent:40,updatedAt:new Date(id===freshId?time:now-3_600_000).toISOString()})) };
}
afterEach(cleanup);
it('does not borrow fresh parking from another venue, and recomputes on venue switch',()=>{
 const operations=ops('parking.dream.b1');
 const view=render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
 expect(screen.getByText('현장팀 확인 전')).toBeVisible();
 view.rerender(<LiveParkingPanel venue="dream" setVenue={()=>{}} operations={operations}/>);
 expect(screen.getByText('현장팀 확인 현황')).toBeVisible();
});
it('does not borrow parking freshness for worship at the same venue',()=>{
 render(<LiveWorshipStatus venue="dream" operations={ops('parking.dream.b1')}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
});
it('does not borrow worship freshness for parking at the same venue',()=>{
 render(<LiveParkingPanel venue="dream" setVenue={()=>{}} operations={ops('space.dream.f11')}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
});
it('worship notice switches with the selected venue',()=>{
 const operations=ops('space.dream.f11');
 const view=render(<LiveWorshipStatus venue="songrim" operations={operations}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
 view.rerender(<LiveWorshipStatus venue="dream" operations={operations}/>);
 expect(screen.getByText('현장팀 확인 현황')).toBeVisible();
});
it.each([now-600_001,now+1,NaN])('does not confirm displayed stale/future/invalid time %s',time=>{
 const operations=ops('parking.songrim');
 operations.resources[0].updatedAt=Number.isNaN(time)?'invalid':new Date(time).toISOString();
 render(<LiveParkingPanel venue="songrim" setVenue={()=>{}} operations={operations}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
});
it('keeps offline and disabled responses unconfirmed',()=>{
 const operations=ops('space.dream.f11');
 const view=render(<LiveWorshipStatus venue="dream" operations={{...operations,offline:true}}/>);
 expect(screen.getByText('연결 확인 중')).toBeVisible();
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
 view.rerender(<LiveWorshipStatus venue="dream" operations={{...operations,enabled:false}}/>);
 expect(screen.queryByText('현장팀 확인 현황')).not.toBeInTheDocument();
});
