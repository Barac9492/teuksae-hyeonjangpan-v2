import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';
import { Community } from '../features/companion/Community';
import { RuntimeProvider } from '../features/rehearsal/RuntimeProvider';
import { foregroundPolling } from '../features/companion/polling';
import { RECEIPTS_KEY } from '../features/companion/communityClient';
const at = (time: string, day = 6) => Date.parse(`2026-10-${String(day).padStart(2,'0')}T${time}+09:00`);
const response = (body: unknown) => ({ ok:true, json:async()=>body });
const flush = async () => { await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();}); };
const tick = async(ms:number)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});};
function deferred<T>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
const status = (version=1) => ({enabled:true,resources:[
  {id:'space.songrim.hall',category:'space',state:'available',version,updatedAt:new Date(Date.now()).toISOString()},
  {id:'parking.songrim',category:'parking',state:'busy',occupancyPercent:70,version,updatedAt:new Date(Date.now()).toISOString()},
  {id:'parking.dream',category:'parking',state:'available',guideFloor:2,version,updatedAt:new Date(Date.now()).toISOString()},
]});
const feed = (kind='prayer',text='latest public content') => ({enabled:true,items:[{id:'item',kind,text,createdAt:new Date(Date.now()).toISOString(),eventDay:1}],photoCountToday:3,today:'2026-10-06'});
const network = () => vi.fn(async(url:string)=>response(url==='/api/status'?status():feed(new URL(url,'http://localhost').searchParams.get('kind')??'prayer')));
const tab = (name:string)=>fireEvent.click(screen.getByRole('tab',{name}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(at('04:39:59'));vi.spyOn(navigator,'onLine','get').mockReturnValue(true);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');window.history.replaceState({},'','/');localStorage.clear();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('continuous public use through service times',()=>{
  it.each([true,false])('transitions all tabs on time, with managed runtime=%s',async managed=>{
    const fetcher=network();vi.stubGlobal('fetch',fetcher);
    render(managed?<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>:<CompanionApp/>);await flush();
    expect(screen.getByText('이용 가능')).toBeVisible();tab('기도');expect(within(screen.getByRole('tabpanel',{name:'기도'})).getByText('latest public content')).toBeVisible();
    await tick(1000);const count=fetcher.mock.calls.length;
    for(const name of ['예배','주차','기도','나눔','사진']){
      tab(name);await flush();expect(document.querySelector('[data-service-mode="worship"]')).toBeVisible();
      if(['기도','사진'].includes(name))expect(within(screen.getByRole('tabpanel',{name})).getByText('latest public content')).toBeVisible();
    }
    tab('주차');expect(screen.getByText('70% · 혼잡')).toBeVisible();expect(within(screen.getByRole('tabpanel',{name:'주차'})).queryByText('예배 중',{exact:true})).toBeNull();
    tab('사진');expect(screen.getByText('오늘 사진 참여 3건')).toBeVisible();
    await tick(69*60000+59000);expect(fetcher.mock.calls.length).toBeGreaterThan(count);expect(document.querySelector('[data-service-mode="worship"]')).toBeVisible();
    await tick(1000);await flush();expect(document.querySelector('[data-service-mode="after"]')).toBeVisible();
    expect(fetcher.mock.calls.length).toBeGreaterThan(count);tab('기도');expect(within(screen.getByRole('tabpanel',{name:'기도'})).getByText('latest public content')).toBeVisible();
    tab('주차');expect(screen.getByText('70% · 혼잡')).toBeVisible();expect(within(screen.getByRole('tabpanel',{name:'주차'})).getByText(/06:45까지 출차/)).toBeVisible();
    tab('예배');expect(screen.getByText('이용 가능')).toBeVisible();expect(screen.getByRole('heading',{name:'지금 예배 공간은'})).toBeVisible();
  });
  it.each(['04:40:00','05:49:59'])('fresh entry at %s loads current status and feeds immediately',async time=>{
    vi.setSystemTime(at(time));const fetcher=network();vi.stubGlobal('fetch',fetcher);render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();
    expect(document.querySelector('[data-service-mode="worship"]')).toBeVisible();expect(screen.getByText('이용 가능')).toBeVisible();expect(fetcher).toHaveBeenCalled();
    fireEvent(window,new Event('online'));fireEvent(window,new Event('pageshow'));fireEvent(document,new Event('visibilitychange'));await flush();expect(fetcher).toHaveBeenCalled();
  });
  it.each(['transport','body'] as const)('aborts pending %s on hidden transition and rejects stale late content after resume',async phase=>{
    const pending: {resolve:(x:unknown)=>void;signal:AbortSignal}[]=[];let delayed=true;
    const fetcher=vi.fn(async(url:string,init:RequestInit)=>{
      if(delayed){const d=deferred<unknown>();pending.push({resolve:d.resolve,signal:init.signal as AbortSignal});return phase==='body'?{ok:true,json:()=>d.promise}:d.promise;}
      return response(url==='/api/status'?status(3):feed(new URL(url,'http://localhost').searchParams.get('kind')??'prayer','new after service'));
    });vi.stubGlobal('fetch',fetcher);render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();
    expect(pending.length).toBe(3);await tick(1000);expect(pending.every(p=>!p.signal.aborted)).toBe(true);
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');fireEvent(document,new Event('visibilitychange'));expect(pending.every(p=>p.signal.aborted)).toBe(true);visibility.mockReturnValue('visible');
    delayed=false;await act(async()=>{vi.setSystemTime(at('05:50:00'));fireEvent(window,new Event('pageshow'));});await flush();tab('기도');expect(within(screen.getByRole('tabpanel',{name:'기도'})).getByText('new after service')).toBeVisible();
    await act(async()=>{for(const p of pending)p.resolve(phase==='body'?feed('prayer','late old content'):response(feed('prayer','late old content')));});await flush();
    expect(screen.queryByText('late old content')).not.toBeInTheDocument();expect(within(screen.getByRole('tabpanel',{name:'기도'})).getByText('new after service')).toBeVisible();
  });
  it('gates manual refresh/online/resume while hidden or offline and fetches after-service data on return',async()=>{
    const visible=vi.spyOn(document,'visibilityState','get');const online=vi.spyOn(navigator,'onLine','get');const fetcher=network();vi.stubGlobal('fetch',fetcher);render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();
    visible.mockReturnValue('hidden');fireEvent(document,new Event('visibilitychange'));await tick(1000);const count=fetcher.mock.calls.length;
    online.mockReturnValue(false);fireEvent(window,new Event('offline'));await act(async()=>{vi.setSystemTime(at('05:50:00'));fireEvent(window,new Event('pageshow'));});await flush();expect(fetcher).toHaveBeenCalledTimes(count);
    online.mockReturnValue(true);fireEvent(window,new Event('online'));await flush();expect(fetcher).toHaveBeenCalledTimes(count);
    visible.mockReturnValue('visible');fireEvent(document,new Event('visibilitychange'));await flush();expect(fetcher.mock.calls.length).toBeGreaterThan(count);expect(document.querySelector('[data-service-mode="after"]')).toBeVisible();
  });
  it('accepts a same-day response across 04:40 before the boundary timer runs',async()=>{
    const pending=deferred<unknown>();const fetcher=vi.fn(async(url:string)=>({ok:true,json:()=>url==='/api/status'?pending.promise:Promise.resolve(feed(new URL(url,'http://localhost').searchParams.get('kind')??'prayer'))}));
    vi.stubGlobal('fetch',fetcher);render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();
    // No advanceTimers or browser event: response publication must check Date.now itself.
    await act(async()=>{vi.setSystemTime(at('04:40:00'));pending.resolve(status(99));});await flush();
    expect(screen.getByText('이용 가능')).toBeVisible();
    fireEvent(window,new Event('pageshow'));await flush();expect(document.querySelector('[data-service-mode="worship"]')).toBeVisible();
  });
  it('does not turn preview date selection into a production clock override',async()=>{
    vi.setSystemTime(at('04:40:00'));window.history.replaceState({},'', '/?preview=1');const fetcher=network();vi.stubGlobal('fetch',fetcher);
    render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();
    fireEvent.click(screen.getByRole('button',{name:'상황 바꿔보기'}));fireEvent.change(screen.getByLabelText('미리 볼 예배일'),{target:{value:'5'}});await flush();expect(fetcher).toHaveBeenCalled();
  });
  it('shows offline state on fresh worship entry and resumes only after reconnecting after service',async()=>{
    vi.setSystemTime(at('04:40:00'));const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);const fetcher=network();vi.stubGlobal('fetch',fetcher);
    render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();expect(screen.getByText('오프라인 · 최신 현황을 확인할 수 없습니다.')).toBeVisible();expect(fetcher).not.toHaveBeenCalled();
    await act(async()=>{vi.setSystemTime(at('05:50:00'));fireEvent(window,new Event('pageshow'));});await flush();expect(fetcher).not.toHaveBeenCalled();expect(document.querySelector('[data-service-mode="after"]')).toBeVisible();
    online.mockReturnValue(true);fireEvent(window,new Event('online'));await flush();expect(fetcher).toHaveBeenCalled();expect(screen.queryByText('오프라인 · 최신 현황을 확인할 수 없습니다.')).not.toBeInTheDocument();
  });
  it('allows publishing and privacy withdrawal while public feeds refresh during worship',async()=>{
    vi.setSystemTime(at('04:40:00'));localStorage.setItem(RECEIPTS_KEY,JSON.stringify([{id:'privacy-withdrawal',kind:'prayer',token:'secret-delete-token'}]));
    const actions:string[]=[];
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
      if(init?.method==='POST'){const body=JSON.parse(init.body as string);actions.push(body.action ?? 'submit');return response(body.action==='delete'?{deleted:true}:{id:'new-local',token:'synthetic-receipt',status:'approved'});}
      return response(feed());
    });vi.stubGlobal('fetch',fetcher);
    render(<Community kind="prayer" text="synthetic draft" payloadKey="draft" defaultPublic/>);await flush();
    expect(screen.getByRole('button',{name:'기도제목 공개로 올리기'})).toBeEnabled();
    fireEvent.click(screen.getByText(/내 제출 기록 \(/));fireEvent.click(screen.getByRole('button',{name:'제출 철회·삭제'}));await flush();expect(actions).toEqual(['delete']);expect(screen.getByText(/삭제됨/)).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'기도제목 공개로 올리기'}));await flush();expect(actions).toEqual(['delete','submit']);
    const count=fetcher.mock.calls.length;await tick(30000);expect(fetcher.mock.calls.length).toBeGreaterThan(count);
  });
  it.each(['04:39:59','04:40:00','05:49:59','05:50:00'])('continues exactly 20-second foreground polling at %s',async time=>{
    vi.setSystemTime(at(time));const load=vi.fn(async()=>{});const poll=foregroundPolling(load,20000,undefined,true,false,{publicSchedule:true});await flush();expect(load).toHaveBeenCalledTimes(1);await tick(19999);expect(load).toHaveBeenCalledTimes(1);await tick(1);expect(load).toHaveBeenCalledTimes(2);poll.stop();
  });
  it('keeps admin polling active during worship',async()=>{
    vi.setSystemTime(at('04:40:00'));const load=vi.fn(async()=>{});const poll=foregroundPolling(load,20000);await flush();await tick(20000);expect(load).toHaveBeenCalledTimes(2);poll.stop();
  });
  it('retains holiday departure rules in after-service mode and resets at Seoul midnight',async()=>{
    vi.setSystemTime(at('05:50:00',5));vi.stubGlobal('fetch',network());render(<RuntimeProvider publicDayBoundaries><CompanionApp/></RuntimeProvider>);await flush();tab('주차');expect(within(screen.getByRole('tabpanel',{name:'주차'})).getByText(/자율 출차 불가 · 선입선출/)).toBeVisible();
    await act(async()=>{vi.setSystemTime(at('00:00:00',6));fireEvent(window,new Event('pageshow'));});await flush();expect(document.querySelector('[data-service-mode]')).not.toBeInTheDocument();expect(within(screen.getByRole('tabpanel',{name:'주차'})).getByText(/06:45까지 출차/)).toBeVisible();
  });
});
