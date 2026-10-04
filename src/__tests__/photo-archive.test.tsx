import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {CommunityModeration} from '../features/admin/CommunityModeration';
const photo={id:'photo-a',kind:'photo',text:'합성 사진 A',createdAt:'2026-10-05T00:00:00Z',eventDay:0,status:'pending',version:3,photoUrl:'/api/community/photo?id=photo-a'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function setup(rows=[photo],options:{supported?:boolean;post?:(body:Record<string,unknown>)=>Promise<Response>;cursor?:string}={}){
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));return options.post?options.post(b):response({id:b.id,status:b.decision==='unarchived'?'pending':b.decision,version:b.expectedVersion+1});}
  return response({items:rows,archiveSupported:options.supported!==false,trashSupported:true,nextCursor:options.cursor??null});
 });render(<CommunityModeration kind="photo"/>);return fetch;
}
async function select(id='photo-a') {const box=await screen.findByRole('checkbox',{name:`${id} 선택`});const article=box.closest('article')!;await userEvent.click(article.querySelector('summary')!);await waitFor(()=>expect(article.querySelector('img')).toBeTruthy());fireEvent.load(article.querySelector('img')!);await userEvent.click(box);}
const posts=(fetch:ReturnType<typeof setup>)=>fetch.mock.calls.filter(([,i])=>i?.method==='POST').map(([,i])=>JSON.parse(String(i?.body)));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it.each(['pending','approved'])('archives selected %s photos only after explicit confirm; cancel writes nothing',async status=>{
 const fetch=setup([{...photo,status}]);await select();await userEvent.click(screen.getByRole('button',{name:'선택 비공개 보관'}));expect(screen.getByRole('region',{name:'선택 항목 확인'})).toHaveTextContent('현재 공개 중인 사진도');expect(posts(fetch)).toHaveLength(0);
 await userEvent.click(screen.getByRole('button',{name:'취소'}));expect(posts(fetch)).toHaveLength(0);
 await userEvent.click(screen.getByRole('button',{name:'선택 비공개 보관'}));await userEvent.dblClick(screen.getByRole('button',{name:'확인 후 비공개 보관'}));await screen.findByText('1개 중 1개 완료.');expect(posts(fetch)).toEqual([{id:photo.id,decision:'archived',expectedVersion:3}]);
});
it('dedicated archive filter clears selection and returns photos to pending without approval action',async()=>{
 const fetch=setup([{...photo,status:'archived'}]);await screen.findByRole('combobox');await userEvent.selectOptions(screen.getByRole('combobox'),'archived');await select();expect(screen.queryByRole('button',{name:'선택 공개 승인'})).not.toBeInTheDocument();expect(fetch.mock.calls.some(([u])=>String(u).includes('kind=photo&status=archived'))).toBe(true);
 await userEvent.click(screen.getByRole('button',{name:'선택 검토 대기로 이동'}));expect(screen.getByRole('region',{name:'선택 항목 확인'})).toHaveTextContent('자동 공개되지');await userEvent.click(screen.getByRole('button',{name:'확인 후 검토 대기로 이동'}));await screen.findByText('1개 중 1개 완료.');expect(posts(fetch)[0].decision).toBe('unarchived');
});
it('requires loaded photo and current DB archive capability',async()=>{setup([photo],{supported:false});await select();expect(screen.getByRole('button',{name:'선택 비공개 보관'})).toBeDisabled();expect(screen.getByText('비공개 보관 기능은 DB 업데이트 후 사용할 수 있습니다.')).toBeVisible();});
it('unopened and broken images cannot be archived',async()=>{setup();await screen.findByRole('checkbox');expect(screen.getByRole('checkbox')).toBeDisabled();await select();fireEvent.error(screen.getByAltText('공개 검토용 제출 사진'));expect(screen.getByRole('button',{name:'선택 비공개 보관'})).toBeDisabled();});
it.each([409,503])('reports partial failures (%s) and never acts on unselected or unseen photos',async code=>{
 const rows=[photo,{...photo,id:'photo-b',text:'합성 B'},{...photo,id:'photo-c',text:'합성 C'}];let n=0;
 const fetch=setup(rows,{cursor:'unseen-next-page',post:async b=>++n===1?response({error:'충돌'},code):response({id:b.id,status:'archived',version:4})});
 await select('photo-a');await select('photo-b');await userEvent.click(screen.getByRole('button',{name:'선택 비공개 보관'}));await userEvent.click(screen.getByRole('button',{name:'확인 후 비공개 보관'}));await screen.findByText(/2개 중/);
 expect(posts(fetch).map(b=>b.id)).toEqual(code===409?['photo-a','photo-b']:['photo-a']);expect(screen.getByText(code===409?'2개 중 1개 완료. 1개는 처리 결과를 확인해주세요.':'2개 중 0개 완료. 2개는 처리 결과를 확인해주세요.')).toBeVisible();
 expect(screen.getAllByRole('checkbox').every(x=>!(x as HTMLInputElement).checked)).toBe(true);
});
it('page/filter changes clear archive selection',async()=>{const fetch=setup([photo],{cursor:'next'});await select();await userEvent.click(screen.getByRole('button',{name:'다음 페이지'}));await waitFor(()=>expect(screen.getByRole('checkbox')).not.toBeChecked());expect(posts(fetch)).toHaveLength(0);await select();await userEvent.selectOptions(screen.getByRole('combobox'),'approved');await waitFor(()=>expect(screen.getByRole('checkbox')).not.toBeChecked());expect(posts(fetch)).toHaveLength(0);});
