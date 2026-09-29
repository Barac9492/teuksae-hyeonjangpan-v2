import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('uses one discrete occupancy control and saves the canonical state with the estimate',async()=>{
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 let resource={id:'parking.calvary',label:'갈보리교회 주차',category:'parking',state:'checking',version:0,updatedAt:null as string|null,occupancyPercent:null as number|null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
   let body:unknown;
   if(String(url).endsWith('/session'))body=session;
   else if(init?.method==='POST') {const payload=JSON.parse(String(init.body));writes.push(payload);resource={...resource,state:payload.state,occupancyPercent:payload.occupancyPercent,version:resource.version+1,updatedAt:new Date().toISOString()};body={resource};}
   else body={resources:[resource],history:[],canManageAccounts:false};
   return new Response(JSON.stringify(body));
 });
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText('갈보리교회 주차 사용률·상태');
 expect(screen.queryByLabelText('갈보리교회 주차 상태')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('갈보리교회 주차 사용률')).not.toBeInTheDocument();
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
 const resource={id:'parking.calvary',label:'갈보리교회 주차',category:'parking',state,version:4,updatedAt:null,occupancyPercent:null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>new Response(JSON.stringify(String(url).endsWith('/session')?session:init?.method==='POST'?(writes.push(JSON.parse(String(init.body))),{resource}):{resources:[resource],history:[],canManageAccounts:false})));
 const user=userEvent.setup();render(<AdminApp/>);
 const select=await screen.findByLabelText('갈보리교회 주차 사용률·상태');
 expect(select).toHaveValue('unselected');
 await user.click(screen.getByRole('button',{name:'상태 저장'}));
 expect(writes).toHaveLength(0);
 expect(screen.getByRole('alert')).toHaveTextContent('직접 선택');
 await user.selectOptions(select,'checking');
 await user.click(screen.getByRole('button',{name:'상태 저장'}));
 await waitFor(()=>expect(writes).toHaveLength(1));
 expect(writes[0]).toMatchObject({state:'checking',occupancyPercent:null,expectedVersion:4});
});
