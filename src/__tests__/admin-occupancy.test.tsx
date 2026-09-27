import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('saves an explicit estimate and clears it to null without fabricating occupancy',async()=>{
 const session={authenticated:true,username:'TEST',role:'parking',displayName:'담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'S-test',capabilities:{liveOperations:true}};
 let resource={id:'parking.calvary',label:'갈보리교회 주차',category:'parking',state:'checking',version:0,updatedAt:null as string|null,occupancyPercent:null as number|null};
 const writes:Record<string,unknown>[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
   let body:unknown;
   if(String(url).endsWith('/session'))body=session;
   else if(init?.method==='POST') {const payload=JSON.parse(String(init.body));writes.push(payload);resource={...resource,occupancyPercent:payload.occupancyPercent,version:resource.version+1,updatedAt:new Date().toISOString()};body={resource};}
   else body={resources:[resource],history:[],canManageAccounts:false};
   return new Response(JSON.stringify(body));
 });
 const user=userEvent.setup();render(<AdminApp/>);
 const input=await screen.findByLabelText('갈보리교회 주차 사용률');expect(input).toHaveValue(null);
 await user.type(input,'65');await user.click(screen.getByRole('button',{name:'현황 확인/저장'}));
 await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0].occupancyPercent).toBe(65);
 await waitFor(()=>expect(screen.getByRole('button',{name:'현황 확인/저장'})).toBeEnabled());
 await user.clear(input);await user.click(screen.getByRole('button',{name:'현황 확인/저장'}));
 await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1].occupancyPercent).toBeNull();
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
