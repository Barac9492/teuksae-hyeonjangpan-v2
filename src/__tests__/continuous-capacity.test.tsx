import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
import { LiveParkingPanel, LiveWorshipStatus } from '../features/companion/LiveOperations';
const now=Date.parse('2026-10-06T04:45:00+09:00');
afterEach(()=>{cleanup();vi.restoreAllMocks();});
for(const id of ['parking.dream','space.songrim.f4','space.songrim.gym.f1','space.songrim.gym.f2']) {
 it.each(Array.from({length:11},(_,i)=>i*10))(`${id} saves and publicly renders exact %s%% without changing other resources`,async percent=>{
  vi.spyOn(Date,'now').mockReturnValue(now);
  const category=id.startsWith('parking')?'parking' as const:'space' as const,label=category==='parking'?'드림센터 주차장':id.endsWith('gym.f1')?'체육관 1층':id.endsWith('gym.f2')?'체육관 2층':'본당 4층';
  const resource={id,label,category,state:'checking' as string,version:0,updatedAt:null as string|null,occupancyPercent:null as number|null};
  const session={authenticated:true,username:'LOCAL',role:category,displayName:'합성 검증',sessionId:'synthetic',expiresAt:'2030-01-01T00:00:00Z',capabilities:{liveOperations:true}};
  const writes:Record<string,unknown>[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
   if(String(url).endsWith('/session'))return new Response(JSON.stringify(session));
   if(init?.method==='POST'){const payload=JSON.parse(String(init.body));writes.push(payload);Object.assign(resource,{state:payload.state,occupancyPercent:payload.occupancyPercent,version:1,updatedAt:new Date(now).toISOString()});return new Response(JSON.stringify({resource}));}
   return new Response(JSON.stringify({resources:[resource],history:[],canManageAccounts:false}));
  });
  const view=render(<AdminApp/>);const select=await screen.findByLabelText(label+' 사용률·상태');
  expect(select).toHaveValue('unselected');expect(select.querySelectorAll('option')).toHaveLength(14);
  fireEvent.change(select,{target:{value:String(percent)}});fireEvent.click(select.closest('article')!.querySelector('button')!);await waitFor(()=>expect(writes).toHaveLength(1));
  const state=percent===100?'full':percent>=70?'busy':'available';
  expect(writes[0]).toMatchObject({resourceId:id,expectedVersion:0,state,occupancyPercent:percent});if(category==='parking')expect(writes[0].guideFloor).toBeNull();
  await waitFor(()=>expect(select).toHaveValue(String(percent)));view.unmount();
  const operations={mode:'worship' as const,now,enabled:true,offline:false,confirmed:true,lastSync:now,resources:[{...resource,state:state as 'full'|'busy'|'available'}]};
  render(category==='parking'?<LiveParkingPanel venue="dream" setVenue={()=>{}} operations={operations}/>:<LiveWorshipStatus venue="songrim" operations={operations}/>);
  const text=percent===100?(category==='parking'?'만차':'입장 마감'):percent>=70?'혼잡':'이용 가능';
  expect(screen.getByText(`${percent}% · ${text}`)).toBeVisible();expect(screen.queryByText(/층으로 안내 중/)).toBeNull();
 });
}
