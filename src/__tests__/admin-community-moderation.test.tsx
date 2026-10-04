import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityModeration } from '../features/admin/CommunityModeration';
import { AdminApp } from '../features/admin';
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const prayer={id:'prayer-1',kind:'prayer',text:'로컬 기도',createdAt:'2026-10-05T00:00:00Z',eventDay:0,status:'pending',version:3,masking:{supported:true,required:false,held:false,publicText:'로컬 기도',policyVersion:'test-policy',matches:[]}};
const photo={...prayer,id:'photo-1',kind:'photo',text:'로컬 사진',photoUrl:'/api/community/photo?id=photo-1'};
type Row=typeof prayer & {photoUrl?:string};
function setup(items: unknown[]=[prayer],options:{get?:()=>Promise<Response>;post?:(body:Record<string,unknown>)=>Promise<Response>;trash?:boolean;kind?:'photo'|'prayer'}={}){
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  if(init?.method==='POST'){const body=JSON.parse(String(init.body));return options.post?options.post(body):response({id:body.id,status:body.decision==='restored'?'pending':body.decision,version:body.expectedVersion+1});}
  return options.get?options.get():response({items,nextCursor:null,trashSupported:true});
 });const view=render(<CommunityModeration kind={options.kind} trash={options.trash}/>);return {fetch,...view};
}
// Text cards are readable in place; only photos are opened before selection.
async function open(item:Row=prayer){if(item.kind==='photo')await userEvent.click(await screen.findByText(`내용 보기 · ${item.text}`));return screen.findByRole('checkbox',{name:`${item.id} 선택`});}
async function select(item:Row=prayer){await userEvent.click(await open(item));}
const posts=(fetch:ReturnType<typeof setup>['fetch'])=>fetch.mock.calls.filter(([,init])=>init?.method==='POST');
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('explicit page-scoped moderation',()=>{
 it('requires opening content, explicit selection, and batch publication confirmation',async()=>{
  const {fetch}=setup();await screen.findByText(prayer.text,{selector:'.community-moderation__text'});expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();await select();await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));expect(posts(fetch)).toHaveLength(0);
  expect(screen.getByRole('region',{name:'선택 항목 확인'})).toHaveTextContent('공개 동의를 모두 확인');
  await userEvent.click(screen.getByRole('button',{name:'확인 후 일괄 공개 승인'}));await screen.findByText('1개 중 1개 완료.');expect(screen.queryByText(/0개는 처리 결과를 확인해주세요/)).not.toBeInTheDocument();
  expect(JSON.parse(String(posts(fetch)[0][1]?.body))).toEqual({id:prayer.id,decision:'approved',expectedVersion:3});expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();
 });
 it('cancels without a write and clears selection when content is closed',async()=>{const {fetch}=setup();await select();await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));await userEvent.click(screen.getByRole('button',{name:'취소'}));expect(posts(fetch)).toHaveLength(0);await userEvent.click(screen.getByRole('checkbox',{name:`${prayer.id} 선택`}));await waitFor(()=>expect(screen.getByText(/선택 0개/)).toBeVisible());});
 it('clears a photo selection when the photo is closed',async()=>{setup([photo]);await select(photo);fireEvent.load(screen.getByAltText('공개 검토용 제출 사진'));await userEvent.click(screen.getByText(`내용 보기 · ${photo.text}`));await waitFor(()=>expect(screen.getByText(/선택 0개/)).toBeVisible());});
 it('only sends explicitly selected visible items and prevents repeated clicks',async()=>{
  let finish!:(r:Response)=>void;const other={...prayer,id:'other',text:'다른 기도'};
  const {fetch}=setup([prayer,other],{post:()=>new Promise(resolve=>{finish=resolve;})});await select();await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));await userEvent.dblClick(screen.getByRole('button',{name:'확인 후 일괄 공개 승인'}));expect(posts(fetch)).toHaveLength(1);expect(JSON.parse(String(posts(fetch)[0][1]?.body)).id).toBe(prayer.id);
  await act(async()=>finish(response({id:prayer.id,status:'approved',version:4})));await screen.findByText(/1개 중 1개 완료/);
 });
 it('reports a per-item conflict, continues other selected items and requires new review',async()=>{
  const other={...prayer,id:'other',text:'다른 기도'};const {fetch}=setup([prayer,other],{post:async body=>body.id===prayer.id?response({},409):response({id:body.id,status:'approved',version:4})});await select();await select(other);await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));await userEvent.click(screen.getByRole('button',{name:'확인 후 일괄 공개 승인'}));await screen.findByText(/2개 중 1개 완료/);expect(screen.getByText(/다른 관리자가 먼저 변경/)).toBeVisible();expect(posts(fetch)).toHaveLength(2);expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();
 });
 it.each([401,403,500])('stops the batch on POST %s without claiming success',async code=>{const other={...prayer,id:'other',text:'다른 기도'};const {fetch}=setup([prayer,other],{post:async()=>response({},code)});await select();await select(other);await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));await userEvent.click(screen.getByRole('button',{name:'확인 후 일괄 공개 승인'}));await screen.findByText(/2개 중 0개 완료/);expect(posts(fetch)).toHaveLength(1);expect(screen.getByText(/미처리/)).toBeVisible();});
 it('does not accept malformed successful POST responses',async()=>{setup([prayer],{post:async()=>response({})});await select();await userEvent.click(screen.getByRole('button',{name:'선택 공개 승인'}));await userEvent.click(screen.getByRole('button',{name:'확인 후 일괄 공개 승인'}));await screen.findByText(/처리 응답을 확인할 수 없습니다/);expect(screen.getByText(/1개 중 0개 완료/)).toBeVisible();});
 it.each([401,403,404,500])('shows GET %s as an error rather than an empty queue',async code=>{setup([],{get:async()=>response({},code)});await screen.findByRole('alert');expect(screen.queryByText('현재 검토 목록에 게시물이 없습니다.')).not.toBeInTheDocument();});
 it.each([{items:[{bad:true}]},{items:null},{items:[prayer],nextCursor:22}])('rejects malformed list/cursor %j',async body=>{setup([],{get:async()=>response(body)});await screen.findByRole('alert');});
 it('excludes old deleted tombstones without rejecting other valid rows',async()=>{setup([{status:'deleted'},prayer]);await select();expect(screen.queryByRole('alert')).not.toBeInTheDocument();});
 it('shows an empty queue for only terminal tombstones',async()=>{setup([{status:'deleted'}]);await screen.findByText('현재 검토 목록에 게시물이 없습니다.');});
 it('requires loaded actual photo for approval, trash and permanent deletion; failed preview clears selection',async()=>{setup([photo]);await select(photo);const image=screen.getByAltText('공개 검토용 제출 사진');expect(image).toHaveAttribute('loading','lazy');expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();expect(screen.getByRole('button',{name:'선택 휴지통으로 이동'})).toBeDisabled();await userEvent.click(screen.getByText('영구 삭제',{exact:true}));expect(screen.getByRole('button',{name:'선택 영구 삭제'})).toBeDisabled();fireEvent.load(image);expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeEnabled();expect(screen.getByRole('button',{name:'선택 휴지통으로 이동'})).toBeEnabled();expect(screen.getByRole('button',{name:'선택 영구 삭제'})).toBeEnabled();fireEvent.error(image);expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();expect(screen.getByRole('checkbox')).not.toBeChecked();});
 it('never embeds an external photo URL or batch-processes it as reviewed',async()=>{setup([{...photo,photoUrl:'https://external.invalid/image'}]);await select(photo);expect(screen.queryByRole('img')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();expect(screen.getByRole('button',{name:'선택 휴지통으로 이동'})).toBeDisabled();await userEvent.click(screen.getByText('영구 삭제',{exact:true}));expect(screen.getByRole('button',{name:'선택 영구 삭제'})).toBeDisabled();});
 it('allows permanent deletion of a rejected photo whose image is already removed',async()=>{const rejected={...photo,status:'rejected',photoUrl:undefined};setup([rejected]);await select(rejected);await userEvent.click(screen.getByText('영구 삭제',{exact:true}));expect(screen.getByRole('button',{name:'선택 영구 삭제'})).toBeEnabled();expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();});
 it('clears selection on page, filter and refresh; never selects future pages',async()=>{let reads=0;setup([prayer],{get:async()=>response({items:[prayer],nextCursor:reads++===0?'next':null,trashSupported:true})});await select();await userEvent.click(screen.getByRole('button',{name:'다음 페이지'}));await waitFor(()=>expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled());await select();await userEvent.selectOptions(screen.getByRole('combobox'),'pending');await waitFor(()=>expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled());await select();await userEvent.click(screen.getByRole('button',{name:'검토 목록 새로고침'}));await waitFor(()=>expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled());});
 it.each([['trashed','선택 휴지통으로 이동','확인 후 휴지통 이동'],['deleted','선택 영구 삭제','확인 후 영구 삭제']])('confirms %s and preserves expected version',async(decision,start,end)=>{const {fetch}=setup();await select();if(decision==='deleted')await userEvent.click(screen.getByText('영구 삭제',{exact:true}));await userEvent.click(screen.getByRole('button',{name:start}));expect(posts(fetch)).toHaveLength(0);await userEvent.click(screen.getByRole('button',{name:end}));await screen.findByText(/1개 중 1개 완료/);expect(JSON.parse(String(posts(fetch)[0][1]?.body))).toEqual({id:prayer.id,decision,expectedVersion:3});});
 it('restores to pending with no approval action in trash',async()=>{const {fetch}=setup([{...prayer,status:'trashed'}],{trash:true});await select();expect(screen.queryByRole('button',{name:'선택 공개 승인'})).not.toBeInTheDocument();await userEvent.click(screen.getByRole('button',{name:'선택 복원'}));expect(screen.getByRole('region',{name:'선택 항목 확인'})).toHaveTextContent('자동 공개되지');await userEvent.click(screen.getByRole('button',{name:'확인 후 복원'}));await screen.findByText(/1개 중 1개 완료/);expect(JSON.parse(String(posts(fetch)[0][1]?.body)).decision).toBe('restored');});
 it('disables recoverable deletion on the legacy backend',async()=>{setup([],{get:async()=>response({items:[prayer]})});await select();expect(screen.getByRole('button',{name:'선택 휴지통으로 이동'})).toBeDisabled();await screen.findByText(/DB 업데이트 후/);});
 it('does not accept a late read after unmount',async()=>{let finish!:(r:Response)=>void;const {unmount}=setup([],{get:()=>new Promise(r=>{finish=r;})});await waitFor(()=>expect(finish).toBeTypeOf('function'));unmount();await act(async()=>finish(response({items:[prayer]})));expect(screen.queryByText(prayer.text)).not.toBeInTheDocument();});
 it.each(['parking','space'])('does not request or expose community to %s',async role=>{const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>response(String(url).endsWith('/session')?{authenticated:true,username:'TEAM',role,displayName:'담당',expiresAt:'2030-01-01',sessionId:'S-team',capabilities:{liveOperations:true}}:{resources:[],history:[],canManageAccounts:false}));render(<AdminApp/>);await screen.findByRole('heading',{name:'예배·주차 현황판'});expect(screen.queryByRole('tab',{name:'사진 승인'})).not.toBeInTheDocument();expect(fetch.mock.calls.some(([u])=>String(u).includes('/community'))).toBe(false);});
});


describe('fast page review controls',()=>{
 it('expands every item and selects only displayed pending items',async()=>{
  const approved={...prayer,id:'approved',text:'이미 공개',status:'approved' as const,version:7};
  setup([prayer,photo,approved]);
  await screen.findByRole('button',{name:'현재 페이지 내용 모두 펼치기'});
  expect(screen.getByText('로컬 기도',{selector:'.community-moderation__text'})).toBeVisible();
  expect(screen.queryByText('로컬 사진',{selector:'.community-moderation__text'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'현재 페이지 내용 모두 펼치기'}));
  expect(screen.getByText('로컬 사진',{selector:'.community-moderation__text'})).toBeVisible();
  const image=screen.getByAltText('공개 검토용 제출 사진');expect(image).toHaveAttribute('src',new URL(photo.photoUrl,window.location.origin).href);
  await userEvent.click(screen.getByRole('button',{name:'펼친 검토 대기 항목 모두 선택'}));
  expect(screen.getByRole('checkbox',{name:'prayer-1 선택'})).toBeChecked();
  expect(screen.getByRole('checkbox',{name:'photo-1 선택'})).not.toBeChecked();
  expect(screen.getByRole('checkbox',{name:'approved 선택'})).not.toBeChecked();
  expect(screen.getByText(/선택 1개/)).toBeVisible();
  fireEvent.load(image);
  await userEvent.click(screen.getByRole('button',{name:'펼친 검토 대기 항목 모두 선택'}));
  expect(screen.getByRole('checkbox',{name:'photo-1 선택'})).toBeChecked();
  expect(screen.getByText(/선택 2개/)).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'현재 페이지 내용 모두 접기'}));
  expect(screen.getByText(/선택 1개/)).toBeVisible();
  expect(screen.getByRole('checkbox',{name:'prayer-1 선택'})).toBeChecked();
  expect(screen.getByRole('checkbox',{name:'photo-1 선택'})).toBeDisabled();
 });
});

describe('prayer review at a glance',()=>{
 const long={...prayer,id:'long',text:'첫 줄 기도 제목입니다. 서른다섯 글자를 훨씬 넘는 아주 긴 기도 내용이 끝까지 그대로 보여야 합니다.\n둘째 줄도 보여야 합니다.'};
 const approved={...prayer,id:'approved',text:'이미 공개된 기도',status:'approved' as const,version:7};
 const rejected={...prayer,id:'rejected',text:'숨긴 기도 내용',status:'rejected' as const,version:2};
 it('shows full prayer text without expanding and allows direct selection',async()=>{
  setup([long],{kind:'prayer'});
  const text=await screen.findByText((_,el)=>el?.classList.contains('community-moderation__text')===true&&el.textContent===long.text);
  expect(text).toBeVisible();
  expect(screen.queryByText(/^내용 보기/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'현재 페이지 내용 모두 펼치기'})).not.toBeInTheDocument();
  const box=screen.getByRole('checkbox',{name:'long 선택'});expect(box).toBeEnabled();
  await userEvent.click(box);expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeEnabled();
 });
 it('separates items needing confirmation from already published and private ones',async()=>{
  setup([prayer,approved,rejected],{kind:'prayer'});
  const pending=await screen.findByRole('region',{name:/확정이 필요한 기도/});
  const published=screen.getByRole('region',{name:/확정되어 공개 중인 기도/});
  const hidden=screen.getByRole('region',{name:/비공개 처리한 기도/});
  expect(within(pending).getByText('로컬 기도')).toBeVisible();expect(within(pending).queryByText('이미 공개된 기도')).not.toBeInTheDocument();
  expect(within(published).getByText('이미 공개된 기도')).toBeVisible();expect(within(published).queryByText('로컬 기도')).not.toBeInTheDocument();
  expect(within(hidden).getByText('숨긴 기도 내용')).toBeVisible();
  expect(screen.getByText(/확정 필요 1 · 공개 중 1 · 비공개 1/)).toBeVisible();
  await userEvent.click(screen.getByRole('button',{name:'검토 대기 항목 모두 선택'}));
  expect(screen.getByRole('checkbox',{name:'prayer-1 선택'})).toBeChecked();expect(screen.getByRole('checkbox',{name:'approved 선택'})).not.toBeChecked();
 });
 it('says clearly when nothing needs confirmation',async()=>{setup([approved],{kind:'prayer'});const pending=await screen.findByRole('region',{name:/확정이 필요한 기도/});expect(within(pending).getByText('지금 확정할 기도가 없습니다.')).toBeVisible();});
});
