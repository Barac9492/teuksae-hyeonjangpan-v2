import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
it('uses one discrete occupancy control and saves the canonical state with the estimate',async()=>{
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 let resource={id:'parking.songrim',label:'송림주차장',category:'parking',state:'checking',version:0,updatedAt:null as string|null,occupancyPercent:null as number|null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
   let body:unknown;
   if(String(url).endsWith('/session'))body=session;
   else if(init?.method==='POST') {const payload=JSON.parse(String(init.body));writes.push(payload);resource={...resource,state:payload.state,occupancyPercent:payload.occupancyPercent,version:resource.version+1,updatedAt:new Date().toISOString()};body={resource};}
   else body={resources:[resource],history:[],canManageAccounts:false};
   return new Response(JSON.stringify(body));
 });
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText('송림주차장 사용률·상태');
 expect(screen.queryByLabelText('송림주차장 상태')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('송림주차장 사용률')).not.toBeInTheDocument();
 await user.selectOptions(select,'70');await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({state:'busy',occupancyPercent:70});
 await waitFor(()=>expect(screen.getByRole('button',{name:'현황 확인/저장'})).toBeEnabled());
 await user.selectOptions(select,'checking');await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]).toMatchObject({state:'checking',occupancyPercent:null});
 await user.selectOptions(select,'closed');await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(3));expect(writes[2]).toMatchObject({state:'closed',occupancyPercent:null});
});
it('hides estimate inputs when schema field is absent and retains state writes',async()=>{
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 const resource={id:'parking.songrim',label:'송림 주차',category:'parking',state:'checking',version:0,updatedAt:null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  const body=String(url).endsWith('/session')?session:init?.method==='POST'?(writes.push(JSON.parse(String(init.body))),{resource}):{resources:[resource],history:[],canManageAccounts:false};
  return new Response(JSON.stringify(body));
 });
 const user=userEvent.setup();render(<AdminApp/>);
 await screen.findByLabelText('송림 주차 상태');
 expect(screen.queryByLabelText('송림 주차 사용률')).not.toBeInTheDocument();
 expect(screen.getByText(/DB 마이그레이션 적용 대기/)).toBeVisible();
 await user.selectOptions(screen.getByLabelText('송림 주차 상태'),'busy');await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0].state).toBe('busy');expect(writes[0].occupancyPercent).toBeNull();
});

it.each(['available', 'busy', 'full'])('requires explicit selection before saving legacy %s with null occupancy', async state => {
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 const resource={id:'parking.songrim',label:'송림주차장',category:'parking',state,version:4,updatedAt:null,occupancyPercent:null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>new Response(JSON.stringify(String(url).endsWith('/session')?session:init?.method==='POST'?(writes.push(JSON.parse(String(init.body))),{resource}):{resources:[resource],history:[],canManageAccounts:false})));
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText('송림주차장 사용률·상태');
 expect(select).toHaveValue('unselected');
 expect(screen.getByRole('button',{name:'상태 저장'})).toBeDisabled();
 expect(writes).toHaveLength(0);
 await user.selectOptions(select,'checking');
 await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(1));
 expect(writes[0]).toMatchObject({state:'checking',occupancyPercent:null,expectedVersion:4});
});


it.each([
 {name:'capacity',role:'parking',resource:{id:'parking.songrim',label:'송림주차장',category:'parking',state:'busy',version:4,updatedAt:new Date(Date.now()-11*60_000).toISOString(),occupancyPercent:70},label:'송림주차장 사용률·상태',same:'70',expected:{state:'busy',occupancyPercent:70}},
 {name:'state-only',role:'space',resource:{id:'space.songrim.access',label:'송림본당 개방 단계',category:'space',state:'hall_open',version:5,updatedAt:null},label:'송림본당 개방 단계 상태',same:'hall_open',expected:{state:'hall_open',occupancyPercent:null}},
 {name:'guideFloor',role:'parking',resource:{id:'parking.dream',label:'드림센터 주차장',category:'parking',state:'available',version:6,updatedAt:new Date(Date.now()-11*60_000).toISOString(),occupancyPercent:null,guideFloor:2},label:'드림센터 현재 주차 안내',same:'2',expected:{state:'available',occupancyPercent:null,guideFloor:2}},
])('does not prefill stale or missing $name values and allows explicitly reselecting the same value',async({role,resource,label,same,expected})=>{
 const session={authenticated:true,username:'TEST',role,displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>new Response(JSON.stringify(String(url).endsWith('/session')?session:init?.method==='POST'?(writes.push(JSON.parse(String(init.body))),{resource:{...resource,updatedAt:new Date().toISOString(),version:resource.version+1}}):{resources:[resource],history:[],canManageAccounts:false})));
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText(label);
 expect(select).toHaveValue('unselected');
 expect(select.querySelector('option[value="unselected"]')).toHaveTextContent(/기존: .*현장 확인 후 다시 선택/);
 const save=select.closest('article')!.querySelector('button')!;
 expect(save).toBeDisabled();
 await user.selectOptions(select,same);
 expect(save).toBeEnabled();
 await user.click(save);
 await waitFor(()=>expect(writes).toHaveLength(1));
 expect(writes[0]).toMatchObject({...expected,expectedVersion:resource.version});
});

it('keeps a fresh saved value prefilled and permits no-change reconfirmation',async()=>{
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 const resource={id:'parking.songrim',label:'송림주차장',category:'parking',state:'busy',version:8,updatedAt:new Date(Date.now()-60_000).toISOString(),occupancyPercent:70};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>new Response(JSON.stringify(String(url).endsWith('/session')?session:init?.method==='POST'?(writes.push(JSON.parse(String(init.body))),{resource}):{resources:[resource],history:[],canManageAccounts:false})));
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText('송림주차장 사용률·상태');
 expect(select).toHaveValue('70');
 const save=screen.getByRole('button',{name:'현황 확인/저장'});
 expect(save).toBeEnabled();await user.click(save);
 await waitFor(()=>expect(writes).toHaveLength(1));
 expect(writes[0]).toMatchObject({state:'busy',occupancyPercent:70,expectedVersion:8});
});


it('expires an unsaved selection after ten minutes when the saved resource is stale',async()=>{
 vi.useFakeTimers();const now=Date.parse('2026-10-05T04:00:00+09:00');vi.setSystemTime(now);
 let poll:(()=>void)|undefined;
 vi.spyOn(window,'setInterval').mockImplementation(((handler:TimerHandler,delay:number)=>{if(delay===20000)poll=handler as()=>void;return 9876;}) as typeof window.setInterval);
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 const resource={id:'parking.songrim',label:'송림주차장',category:'parking',state:'busy',version:9,updatedAt:new Date(now-11*60_000).toISOString(),occupancyPercent:70};
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>new Response(JSON.stringify(String(url).endsWith('/session')?session:{resources:[resource],history:[],canManageAccounts:false})));
 render(<AdminApp/>);await act(async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();});
 const select=screen.getByLabelText('송림주차장 사용률·상태');
 fireEvent.change(select,{target:{value:'70'}});
 expect(select).toHaveValue('70');expect(screen.getByRole('button',{name:'현황 확인/저장'})).toBeEnabled();
 vi.setSystemTime(now+600001);
 await act(async()=>{poll?.();await Promise.resolve();await Promise.resolve();await Promise.resolve();});
 expect(select).toHaveValue('unselected');
 expect(screen.getByText('선택한 지 10분이 지나 다시 확인 후 선택해주세요')).toBeVisible();
 expect(screen.getByRole('button',{name:'현황 확인/저장'})).toBeDisabled();
 fireEvent.change(select,{target:{value:'70'}});
 expect(select).toHaveValue('70');expect(screen.queryByText('선택한 지 10분이 지나 다시 확인 후 선택해주세요')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'현황 확인/저장'})).toBeEnabled();
});
