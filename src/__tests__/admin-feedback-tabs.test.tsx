import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {AdminApp} from '../features/admin';
import {REQUEST_TIMEOUT_MS} from '../lib/requestDeadline';
const session={authenticated:true,username:'ADMIN',role:'superadmin',displayName:'로컬',sessionId:'S-QA',expiresAt:'2030-01-01',capabilities:{liveOperations:true}};
const reply=(body:unknown)=>new Response(JSON.stringify(body));
const resources=[{id:'parking.songrim',category:'parking',label:'송림 주차',state:'checking',version:0,updatedAt:null},{id:'space.songrim.hall',category:'space',label:'송림 본당',state:'checking',version:0,updatedAt:null}];
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
it('shows explicit empty recovery and working moderation independent of empty operations',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>reply(String(url).endsWith('/session')?session:String(url).includes('/community')?{items:[]}:{resources:[],history:[],canManageAccounts:true,accounts:[]}));render(<AdminApp/>);
 await screen.findByRole('heading',{name:'표시할 현황이 없습니다'});expect(screen.getByRole('button',{name:'현황 다시 불러오기'})).toBeEnabled();await userEvent.click(screen.getByRole('tab',{name:'기도카드 승인'}));await screen.findByText('현재 검토 목록에 게시물이 없습니다.');
});
it('bounds history to ten and keeps it out of operational panels; tabs support keyboard',async()=>{
 const history=Array.from({length:27},(_,i)=>({id:String(i),resourceId:'parking.songrim',beforeState:'checking',afterState:'busy',actorUsername:'ADMIN',actorLabel:'담당',sessionLabel:'S-QA',createdAt:'2026-10-03T00:00:00Z'}));
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>reply(String(url).endsWith('/session')?session:{resources,history,canManageAccounts:true,accounts:[]}));render(<AdminApp/>);
 await screen.findByLabelText('송림 본당 상태');expect(screen.queryByRole('heading',{name:'최근 변경 기록'})).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole('tab',{name:'변경 기록'}));expect(document.querySelectorAll('.ta-admin__history p')).toHaveLength(10);expect(document.querySelector('.ta-admin__history')!).toHaveTextContent('송림 주차: 현장 확인 전 → 혼잡');expect(document.querySelector('.ta-admin__history')!).not.toHaveTextContent('parking.songrim: checking → busy');await userEvent.click(screen.getByRole('button',{name:'다음 기록'}));await userEvent.click(screen.getByRole('button',{name:'다음 기록'}));expect(document.querySelectorAll('.ta-admin__history p')).toHaveLength(7);expect(screen.getByRole('button',{name:'다음 기록'})).toBeDisabled();
 fireEvent.keyDown(screen.getByRole('tab',{name:'변경 기록'}),{key:'Home'});expect(screen.getByRole('tab',{name:'현황판'})).toHaveAttribute('aria-selected','true');expect(screen.queryByRole('heading',{name:'최근 변경 기록'})).not.toBeInTheDocument();
});
it.each(['fetch','body'])('releases a hung operations %s after the deadline instead of a title-only screen',async phase=>{
 vi.useFakeTimers();const never=()=>new Promise<Response>(()=>{});
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).endsWith('/session')?reply(session):phase==='fetch'?never():({ok:true,status:200,json:()=>new Promise(()=>{})} as unknown as Response));render(<AdminApp/>);
 await act(async()=>{await Promise.resolve();await Promise.resolve();});expect(screen.getByText(/현황을 불러오는 중/)).toBeVisible();
 await act(async()=>{await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS+1);});expect(screen.getByRole('heading',{name:'지금은 열 수 없어요'})).toBeVisible();expect(screen.getByRole('button',{name:'다시 시도'})).toBeEnabled();
});
it('preserves unsaved resource drafts across tabs',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>reply(String(url).endsWith('/session')?session:{resources,history:[],canManageAccounts:true,accounts:[]}));render(<AdminApp/>);await screen.findByLabelText('송림 본당 상태');await userEvent.selectOptions(screen.getByLabelText('송림 본당 상태'),'busy');await userEvent.click(screen.getByRole('tab',{name:'주차'}));await userEvent.click(screen.getByRole('tab',{name:'현황판'}));await waitFor(()=>expect(screen.getByLabelText('송림 본당 상태')).toHaveValue('busy'));
});
