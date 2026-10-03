import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PrayerTimer } from '../features/companion/PrayerTimer';
import { foregroundPolling } from '../features/companion/polling';
import { Community } from '../features/companion/Community';
import { AdminApp } from '../features/admin';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('counts down selected duration using wall time, pauses, resumes, resets and finishes quietly', () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T01:00:00Z'));
 render(<PrayerTimer />);
 fireEvent.change(screen.getByLabelText('기도 시간'), {target:{value:'3'}});
 const timer = screen.getByRole('timer'); expect(timer).toHaveTextContent('03:00');
 fireEvent.click(screen.getByRole('button',{name:'기도 시작'}));
 act(()=>vi.advanceTimersByTime(30000)); expect(timer).toHaveTextContent('02:30');
 fireEvent.click(screen.getByRole('button',{name:'일시정지'}));
 act(()=>vi.advanceTimersByTime(30000)); expect(timer).toHaveTextContent('02:30');
 fireEvent.click(screen.getByRole('button',{name:'이어서 기도'}));
 act(()=> { vi.setSystemTime(Date.now()+160000); document.dispatchEvent(new Event('visibilitychange')); });
 expect(timer).toHaveTextContent('00:00');expect(screen.getByRole('status')).toHaveTextContent('3분 기도를 마쳤어요');
 expect(document.querySelector('audio')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'초기화'}));
 expect(timer).toHaveTextContent('03:00'); expect(screen.getByLabelText('기도 시간')).toBeEnabled();
});
it('ignores repeated starts and clears all scheduled work on timer unmount', () => {
 vi.useFakeTimers(); const view=render(<PrayerTimer />);const start=screen.getByRole('button',{name:'기도 시작'});
 act(()=> { start.click(); start.click(); start.click(); });
 act(()=>vi.advanceTimersByTime(1000));expect(screen.getByRole('timer')).toHaveTextContent('00:59');
 fireEvent.click(screen.getByRole('button',{name:'초기화'}));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('timer')).toHaveTextContent('01:00');
 view.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('polls only in foreground, skips overlapping requests, aborts on hide and immediately resumes/recovers', async () => {
 vi.useFakeTimers();let visibility='visible';let online=true;
 vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility as DocumentVisibilityState);
 vi.spyOn(navigator,'onLine','get').mockImplementation(()=>online);
 const signals:AbortSignal[]=[]; let finish:()=>void=()=>{};
 const load=vi.fn((signal:AbortSignal)=>{signals.push(signal);return new Promise<void>(resolve=>{finish=resolve;signal.addEventListener('abort',()=>resolve());});});
 const offline=vi.fn();const polling=foregroundPolling(load,20000,offline);
 expect(load).toHaveBeenCalledTimes(1);await polling.refresh();expect(load).toHaveBeenCalledTimes(1);
 visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));expect(signals[0].aborted).toBe(true);
 await vi.advanceTimersByTimeAsync(40000);expect(load).toHaveBeenCalledTimes(1);
 visibility='visible';document.dispatchEvent(new Event('visibilitychange'));expect(load).toHaveBeenCalledTimes(2);
 online=false;window.dispatchEvent(new Event('offline'));expect(offline).toHaveBeenCalled();
 online=true;window.dispatchEvent(new Event('online'));expect(load).toHaveBeenCalledTimes(3);
 finish();await Promise.resolve();polling.stop();expect(vi.getTimerCount()).toBe(0);
});
it('times out stalled polling and allows a later retry', async () => {
 vi.useFakeTimers();const load=vi.fn((signal:AbortSignal)=>new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve())));
 const polling=foregroundPolling(load,20000);await vi.advanceTimersByTimeAsync(8000);expect(load.mock.calls[0][0].reason.message).toBe('timeout');
 await vi.advanceTimersByTimeAsync(12000);expect(load).toHaveBeenCalledTimes(2);polling.stop();
});
it('loads bounded pages, keeps selected page on refresh, retains composer and page but hides unverified cards on error', async () => {
 const first={createdAt:'2026-10-03T00:00:00Z',id:'00000000-0000-4000-8000-000000000012'};
 const requests:string[]=[];let fail=false;
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=> {requests.push(String(url));if(fail)throw new Error('offline');const second=String(url).includes('beforeId=');return response({enabled:true,today:'2026-10-03',photoCountToday:0,nextCursor:second?null:first,items:Array.from({length:second?1:12},(_,i)=>({id:`${second?'older':'new'}-${i}`,kind:'prayer',text:`${second?'older':'new'} ${i}`,createdAt:first.createdAt,eventDay:null}))});});
 const user=userEvent.setup();render(<Community kind="prayer" text="내 입력" payloadKey="내 입력" defaultPublic />);
 await screen.findByText('new 11');expect(document.querySelectorAll('.tc-community-wall li')).toHaveLength(12);
 await user.click(screen.getByRole('button',{name:'다음 페이지'}));await screen.findByText('older 0');expect(document.querySelectorAll('.tc-community-wall li')).toHaveLength(1);
 expect(requests.at(-1)).toContain('beforeId=');expect(screen.getByRole('checkbox',{name:'함께 나누기 · 공개'})).toBeChecked();
 act(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>expect(requests).toHaveLength(3));expect(requests.at(-1)).toContain('beforeId=');
 fail=true;act(()=>window.dispatchEvent(new Event('online')));await screen.findByRole('alert');expect(screen.queryByText('older 0')).not.toBeInTheDocument();expect(screen.getByText('2페이지')).toBeVisible();expect(screen.getByRole('checkbox',{name:'함께 나누기 · 공개'})).toBeChecked();
 await user.click(screen.getByRole('button',{name:'이전 페이지'}));fail=false;
 act(()=>window.dispatchEvent(new Event('online')));await screen.findByText('new 11');
});
it('shows Songrim first, removes retired inputs and writes one Dream guidance with a stable version',async()=>{
 const session={authenticated:true,username:'LOCAL',role:'parking',displayName:'검증',sessionId:'S-LOCAL',expiresAt:'2030-01-01T00:00:00Z',capabilities:{liveOperations:true}};
 let resources=[{id:'parking.calvary',label:'갈보리',category:'parking',state:'checking',version:0,updatedAt:null},{id:'parking.dream.b1',label:'드림 B1',category:'parking',state:'checking',version:0,updatedAt:null},{id:'parking.dream',label:'드림센터 주차장',category:'parking',state:'checking',version:2,updatedAt:null,guideFloor:null,occupancyPercent:null},{id:'parking.songrim',label:'송림주차장',category:'parking',state:'checking',version:0,updatedAt:null}];
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url).endsWith('/session'))return response(session);
  if(init?.method==='POST'){const body=JSON.parse(String(init.body));writes.push(body);resources=resources.map(r=>r.id===body.resourceId?{...r,...body,version:r.version+1}:r);return response({resource:resources.find(r=>r.id===body.resourceId)});}
  return response({resources,history:[],canManageAccounts:false});
 });
 const user=userEvent.setup();render(<AdminApp/>);await screen.findByLabelText('드림센터 현재 주차 안내');
 expect(screen.queryByText('갈보리')).not.toBeInTheDocument();expect(screen.queryByText('드림 B1')).not.toBeInTheDocument();
 expect(document.querySelector('.ta-admin__resource h3')).toHaveTextContent('송림주차장');
 expect(screen.getByLabelText('드림센터 현재 주차 안내')).toHaveValue('unselected');
 expect(within(screen.getByRole('heading',{name:'드림센터 주차장'}).closest('article')!).getByRole('button',{name:/현황 확인|상태 저장/})).toBeDisabled();
 await user.selectOptions(screen.getByLabelText('드림센터 현재 주차 안내'),'2');
 const card=screen.getByRole('heading',{name:'드림센터 주차장'}).closest('article')!;
 const save=within(card).getByRole('button',{name:/현황 확인|상태 저장/});act(()=>{save.click();save.click();});
 await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({resourceId:'parking.dream',guideFloor:2,state:'available',expectedVersion:2,occupancyPercent:null});
});

it.each([
 ['available',2,0,'B2층으로 안내 중'],
 ['full',null,0,'전체 만차'],
 ['closed',null,0,'닫힘'],
 ['available',6,0,'확인 필요'],
 ['available',null,0,'확인 필요'],
 ['available',2,11*60000,'확인 필요'],
 ['available',2,-60000,'확인 필요'],
] as const)('Dream guidance fails closed for state=%s floor=%s age=%s',async(state,guideFloor,age,text)=>{
 const { LiveParkingPanel,useLiveOperations }=await import('../features/companion/LiveOperations');
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>response({enabled:true,resources:[{id:'parking.dream',category:'parking',state,guideFloor,version:1,updatedAt:new Date(Date.now()-age).toISOString(),occupancyPercent:null}]}));
 function View(){const operations=useLiveOperations();return <LiveParkingPanel venue="dream" setVenue={()=>{}} operations={operations}/>;}
 await act(async()=>{render(<View/>);});await waitFor(()=>expect(screen.getByText(text,{exact:true})).toBeVisible());
 if(text==='확인 필요')expect(screen.queryByText(/B\d층으로 안내 중/)).not.toBeInTheDocument();
});
