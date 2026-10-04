import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../features/admin';
const now=Date.parse('2026-10-05T04:00:00+09:00');
const session={authenticated:true,username:'TEST',role:'space',displayName:'합성 담당',expiresAt:'2030-01-01T00:00:00Z',sessionId:'fixture',capabilities:{liveOperations:true}};
function setup(live=true) {
 vi.spyOn(Date,'now').mockReturnValue(now);
 let resources=['access','hall','gym'].map((id,i)=>({id:'space.songrim.'+id,label:['입장 단계','본당','체육관'][i],category:'space',state:'closed',version:1,updatedAt:new Date(now).toISOString(),occupancyPercent:null as number|null}));
 const writes:Record<string,unknown>[]=[];let delay:(()=>Promise<void>)|undefined;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url).endsWith('/session'))return new Response(JSON.stringify({...session,capabilities:{liveOperations:live}}));
  if(init?.method==='POST'){const body=JSON.parse(String(init.body));writes.push(body);resources=resources.map(r=>r.id===body.resourceId?{...r,state:body.state,version:r.version+1}:r);return new Response(JSON.stringify({resource:resources.find(r=>r.id===body.resourceId)}));}
  if(delay)await delay();return new Response(JSON.stringify({resources,publicResources:resources,history:[],canManageAccounts:false}));
 });
 return {writes,change:(id:string,state:string)=>{resources=resources.map(r=>r.id.endsWith(id)?{...r,state,version:r.version+1}:r);},delay:(fn?:()=>Promise<void>)=>{delay=fn;}};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const card=()=>screen.getByLabelText('입장 단계 상태').closest('article')!;
async function warn(){await screen.findByLabelText('입장 단계 상태');fireEvent.change(screen.getByLabelText('입장 단계 상태'),{target:{value:'hall_open'}});fireEvent.click(within(card()).getByRole('button',{name:'상태 저장'}));const warning=await screen.findByRole('alert',{name:'입장 안내 차이 확인'});await waitFor(()=>expect(screen.getByRole('button',{name:'차이를 확인하고 저장'})).toBeEnabled());return warning;}
it('warns before POST, focuses warning, cancels with draft intact, and confirms only once',async()=>{
 const env=setup();render(<AdminApp/>);const warning=await warn();expect(warning).toHaveFocus();expect(env.writes).toEqual([]);
 fireEvent.click(within(warning).getByRole('button',{name:'돌아가서 수정'}));expect(screen.queryByRole('alert',{name:'입장 안내 차이 확인'})).toBeNull();expect(screen.getByLabelText('입장 단계 상태')).toHaveValue('hall_open');
 fireEvent.click(within(card()).getByRole('button',{name:'상태 저장'}));await screen.findByRole('alert',{name:'입장 안내 차이 확인'});
 const confirm=screen.getByRole('button',{name:'차이를 확인하고 저장'});fireEvent.click(confirm);fireEvent.click(confirm);
 await waitFor(()=>expect(env.writes).toHaveLength(1));expect(env.writes[0]).toMatchObject({resourceId:'space.songrim.access',state:'hall_open',expectedVersion:1});
 expect(env.writes[0]).toHaveProperty('requestId');expect(env.writes.every(w=>w.resourceId==='space.songrim.access')).toBe(true);
});
it('requires a new acknowledgement when a related resource version changes',async()=>{
 const env=setup();render(<AdminApp/>);await warn();env.change('hall','full');fireEvent.click(screen.getByRole('button',{name:'차이를 확인하고 저장'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'차이를 확인하고 저장'})).toBeEnabled());
 expect(within(screen.getByRole('table',{name:'공개 현황 한눈에 보기'})).getByText('입장 마감')).toBeVisible();
 expect(screen.getByText('다른 현황이 바뀌었습니다. 아래 차이를 다시 확인해주세요.')).toBeVisible();
 expect(env.writes).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'차이를 확인하고 저장'}));await waitFor(()=>expect(env.writes).toHaveLength(1));
});
it('does not write when target version changes and retains the selected draft for conflict review',async()=>{
 const env=setup();render(<AdminApp/>);await warn();env.change('access','school_open');fireEvent.click(screen.getByRole('button',{name:'차이를 확인하고 저장'}));
 await screen.findByText('다른 담당자가 먼저 변경했습니다. 최신 상태를 확인하고 비교해주세요.');expect(env.writes).toHaveLength(0);expect(screen.getByLabelText('입장 단계 상태')).toHaveValue('hall_open');expect(within(card()).getByRole('button',{name:'최신 상태 확인'})).toBeEnabled();
 fireEvent.click(within(card()).getByRole('button',{name:'최신 상태 확인'}));await waitFor(()=>expect(within(card()).getByRole('button',{name:'상태 저장'})).toBeEnabled());
 fireEvent.click(within(card()).getByRole('button',{name:'상태 저장'}));await screen.findByRole('alert',{name:'입장 안내 차이 확인'});await waitFor(()=>expect(screen.getByRole('button',{name:'차이를 확인하고 저장'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'차이를 확인하고 저장'}));await waitFor(()=>expect(env.writes).toHaveLength(1));expect(env.writes[0].expectedVersion).toBe(2);
});
it.each(['cancel','tab'])('cancels a pending confirmation read on %s',async action=>{
 const env=setup();render(<AdminApp/>);await warn();let resolve!:()=>void;env.delay(()=>new Promise<void>(r=>{resolve=r;}));fireEvent.click(screen.getByRole('button',{name:'차이를 확인하고 저장'}));
 await waitFor(()=>expect(resolve).toBeTypeOf('function'));
 if(action==='cancel')fireEvent.click(screen.getByRole('button',{name:'돌아가서 수정'}));else fireEvent.click(screen.getByRole('tab',{name:'안내'}));
 await act(async()=>{env.delay();resolve();});expect(env.writes).toHaveLength(0);
});
it('clears acknowledgement after editing the draft, then saves only the new selection',async()=>{
 const env=setup();render(<AdminApp/>);await warn();fireEvent.change(screen.getByLabelText('입장 단계 상태'),{target:{value:'school_open'}});
 expect(screen.queryByRole('alert',{name:'입장 안내 차이 확인'})).toBeNull();fireEvent.click(within(card()).getByRole('button',{name:'상태 저장'}));await waitFor(()=>expect(env.writes).toHaveLength(1));expect(env.writes[0].state).toBe('school_open');
});
it('warns for a facility edit that conflicts with the saved entry stage',async()=>{
 const env=setup();render(<AdminApp/>);await screen.findByLabelText('본당 사용률·상태');await userEvent.selectOptions(screen.getByLabelText('본당 사용률·상태'),'50');const row=screen.getByLabelText('본당 사용률·상태').closest('article')!;fireEvent.click(within(row).getByRole('button',{name:'상태 저장'}));await screen.findByRole('alert',{name:'입장 안내 차이 확인'});expect(env.writes).toHaveLength(0);
});
it('shows existing differences without granting write controls to read-only accounts',async()=>{
 const env=setup(false);env.change('access','hall_open');render(<AdminApp/>);expect(await screen.findByText('마지막 저장된 입장 안내에 차이가 있습니다')).toBeVisible();expect(screen.getByLabelText('입장 단계 상태')).toBeDisabled();expect(within(card()).getByRole('button',{name:'현황 확인/저장'})).toBeDisabled();expect(env.writes).toHaveLength(0);
});
it('updates the admin public disclosure at worship and after-service boundaries without a save',async()=>{
 const env=setup();render(<AdminApp/>);await screen.findByRole('table',{name:'공개 현황 한눈에 보기'});
 const publicTable=()=>within(screen.getByRole('table',{name:'공개 현황 한눈에 보기'}));
 expect(publicTable().getAllByText('공개 중(최근 확인)')).toHaveLength(3);
 for(const [time,text] of [['04:40:00','마지막 기록 표시 중'],['05:50:00','마지막 기록 표시 중']]) {
  vi.mocked(Date.now).mockReturnValue(Date.parse(`2026-10-05T${time}+09:00`));fireEvent(window,new Event('focus'));
  expect(publicTable().getAllByText(text)).toHaveLength(3);
 }
 vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-11T04:40:00+09:00'));fireEvent(window,new Event('focus'));expect(publicTable().getAllByText('마지막 기록 표시 중')).toHaveLength(3);expect(env.writes).toHaveLength(0);
});

it('does not write when the pre-save status refresh fails',async()=>{
 const env=setup();render(<AdminApp/>);await screen.findByLabelText('입장 단계 상태');env.delay(async()=>{throw new Error('offline fixture');});
 fireEvent.change(screen.getByLabelText('입장 단계 상태'),{target:{value:'hall_open'}});fireEvent.click(within(card()).getByRole('button',{name:'상태 저장'}));
 await screen.findByText('오프라인입니다. 최신 상태를 불러오지 못했습니다.');expect(env.writes).toHaveLength(0);expect(screen.getByLabelText('입장 단계 상태')).toHaveValue('hall_open');
});
