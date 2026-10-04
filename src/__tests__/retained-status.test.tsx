import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveParkingPanel, LiveWorshipStatus, useLiveOperations } from '../features/companion/LiveOperations';
import type { ComponentProps } from 'react';
import { RuntimeProvider } from '../features/rehearsal/RuntimeProvider';
import { isFreshStatus, lastConfirmedText } from '../features/companion/statusPresentation';
type Ops = ComponentProps<typeof LiveWorshipStatus>['operations'];
const now = Date.parse('2026-10-06T04:10:00+09:00');
function resources(at: number): Ops['resources'] { return [
 {id:'space.songrim.access',label:'송림 입장 단계',category:'space',state:'hall_open',version:1,updatedAt:new Date(at).toISOString()},
 {id:'space.songrim.hall',label:'본당',category:'space',state:'busy',occupancyPercent:70,version:1,updatedAt:new Date(at).toISOString()},
 {id:'space.songrim.gym',label:'체육관',category:'space',state:'closed',occupancyPercent:null,version:1,updatedAt:new Date(at).toISOString()},
 {id:'parking.dream',label:'드림센터 주차장',category:'parking',state:'available',occupancyPercent:40,guideFloor:null,version:1,updatedAt:new Date(at).toISOString()},
]; }
const ops = (age: number): Ops => ({mode:'before',enabled:true,offline:false,confirmed:true,lastSync:now,now,resources:resources(now-age)});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each([599999,600000,600001,3600000,7*86400000])('retains all saved values at age %s; age changes disclosure only',age=>{
 const o=ops(age);render(<><LiveWorshipStatus venue="songrim" operations={o}/><LiveParkingPanel venue="dream" operations={o} setVenue={()=>{}}/></>);
 for(const value of ['본당 입장 가능','70% · 혼잡','닫힘','40% · 이용 가능'])expect(screen.getByText(value)).toBeVisible();
 expect(screen.getByText('70% · 혼잡')).toHaveClass(age>600000?'tc-status-value--neutral':'tc-status-value--warn');
 if(age>600000) expect(screen.getAllByText(/마지막 확인 .*마지막 기록/)).toHaveLength(4);
});
it.each([
 ['checking','확인 중'],['closed','닫힘'],['school_open','교문 개방'],['gym_open','체육관 개방'],['hall_open','본당 입장 가능'],['hall_closed','본당 입장 마감'],
] as const)('preserves explicit saved access state %s after a week', (state,text)=>{
 const o=ops(7*86400000);o.resources=[{...o.resources[0],state}];render(<LiveWorshipStatus venue="songrim" operations={o}/>);
 expect(screen.getByText(text)).toHaveClass('tc-status-value--neutral');
});
it.each([['checking','사용률 확인 전'],['closed','닫힘'],['full','만차']] as const)('preserves explicit Dream state %s', (state,text)=>{
 const o=ops(86400000);o.resources=[{...o.resources[3],state,occupancyPercent:null,guideFloor:null}];render(<LiveParkingPanel venue="dream" operations={o} setVenue={()=>{}}/>);expect(screen.getByText(text)).toBeVisible();
});
it('preserves explicit full even without an occupancy estimate',()=>{
 const o=ops(86400000);o.resources=[{...o.resources[1],state:'full',occupancyPercent:null}];render(<LiveWorshipStatus venue="songrim" operations={o}/>);expect(screen.getByText('입장 마감')).toBeVisible();
});
it.each([null,'invalid',new Date(now+1).toISOString()])('does not fabricate a reading from timestamp %s',updatedAt=>{
 const o=ops(0);o.resources=o.resources.map(r=>({...r,updatedAt}));render(<LiveWorshipStatus venue="songrim" operations={o}/>);
 expect(screen.getAllByText('확인 필요')).toHaveLength(4);expect(screen.queryByText('본당 입장 가능')).toBeNull();expect(screen.getAllByText('아직 확인 기록 없음')).toHaveLength(4);
});
it('marks even a two-minute-old prior-day reading with its date rather than today’s freshness',()=>{
 const time=Date.parse('2026-10-06T00:01:00+09:00'),saved='2026-10-05T23:59:00+09:00';
 expect(isFreshStatus(saved,time)).toBe(false);expect(lastConfirmedText(saved,time)).toBe('마지막 확인 10. 5. 23:59 (한국) · 마지막 기록');
 expect(lastConfirmedText('2025-10-05T04:00:00+09:00',time)).toContain('2025.');
});
function Harness(){const o=useLiveOperations();return <><LiveWorshipStatus venue="songrim" operations={o}/><LiveParkingPanel venue="dream" operations={o} setVenue={()=>{}}/></>;}
const flush=async()=>{await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});};
it.each([true,false])('retains readings across offline midnight and recovers after failure, managed=%s',async managed=>{
 const start=Date.parse('2026-10-05T23:59:00+09:00');vi.useFakeTimers();vi.setSystemTime(start);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 let mode='ok';let rows=resources(start);let calls=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{calls++;if(mode==='fail')throw new Error('synthetic failure');return {ok:true,json:async()=>({enabled:mode!=='disabled',resources:mode==='disabled'?[]:rows})};}));
 render(managed?<RuntimeProvider publicDayBoundaries><Harness/></RuntimeProvider>:<Harness/>);await flush();expect(screen.getByText('40% · 이용 가능')).toBeVisible();
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);fireEvent(window,new Event('offline'));const before=calls;
 vi.setSystemTime(Date.parse('2026-10-06T00:01:00+09:00'));fireEvent(window,new Event('focus'));fireEvent(window,new Event('pageshow'));await flush();
 expect(calls).toBe(before);expect(screen.getByText('본당 입장 가능')).toHaveClass('tc-status-value--neutral');expect(screen.getByText('40% · 이용 가능')).toHaveClass('tc-status-value--neutral');expect(screen.getAllByText('연결 확인 중')).toHaveLength(2);expect(screen.getAllByText('마지막 확인 10. 5. 23:59 (한국) · 마지막 기록')).toHaveLength(4);
 mode='fail';vi.spyOn(navigator,'onLine','get').mockReturnValue(true);fireEvent(window,new Event('online'));await flush();expect(screen.getByText('40% · 이용 가능')).toBeVisible();
 mode='disabled';fireEvent(window,new Event('pageshow'));await flush();expect(screen.getByText('40% · 이용 가능')).toHaveClass('tc-status-value--neutral');expect(screen.getAllByText('연결 확인 중')).toHaveLength(2);
 mode='ok';rows=resources(Date.now()).map(r=>r.id==='parking.dream'?{...r,occupancyPercent:20}:r);fireEvent(window,new Event('pageshow'));await flush();expect(screen.queryByText('40% · 이용 가능')).toBeNull();expect(screen.getByText('20% · 이용 가능')).toHaveClass('tc-status-value--good');expect(screen.queryByText('연결 확인 중')).toBeNull();
});
it.each([true,false])('retains space and parking through both service boundaries and failed refresh, managed=%s',async managed=>{
 const start=Date.parse('2026-10-06T04:39:00+09:00');vi.useFakeTimers();vi.setSystemTime(start);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);let fail=false;let calls=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{calls++;if(fail)throw new Error('synthetic failure');return {ok:true,json:async()=>({enabled:true,resources:resources(start)})};}));
 render(managed?<RuntimeProvider publicDayBoundaries><Harness/></RuntimeProvider>:<Harness/>);await flush();
 for(const time of ['04:40:00','05:50:00']) {
  const before=calls;fail=time==='05:50:00';vi.setSystemTime(Date.parse(`2026-10-06T${time}+09:00`));fireEvent(window,new Event('pageshow'));await flush();
  expect(calls).toBeGreaterThan(before);expect(screen.getByText('본당 입장 가능')).toBeVisible();expect(screen.getByText('40% · 이용 가능')).toBeVisible();expect(screen.queryByText('예배 중',{exact:true})).toBeNull();
 }
 expect(screen.getByText('40% · 이용 가능')).toHaveClass('tc-status-value--neutral');expect(screen.getAllByText('연결 확인 중')).toHaveLength(2);
});
