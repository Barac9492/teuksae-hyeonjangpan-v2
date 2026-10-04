import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CommunityModeration } from '../features/admin/CommunityModeration';
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const base={kind:'prayer',createdAt:'2026-10-05T00:00:00Z',eventDay:null,status:'pending',version:4};
const plain={...base,id:'plain',text:'평안한 하루',masking:{required:false,supported:true,held:false,publicText:'평안한 하루',policyVersion:'test-v1',matches:[]}};
const flagged={...base,id:'flagged',text:'자살예방과 폭행 중단',masking:{required:true,supported:true,held:false,publicText:'**예방과 ** 중단',policyVersion:'test-v1',matches:[{start:0,end:2,term:'자살'},{start:6,end:8,term:'폭행'}]}};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('opens a distinct queue and confirms exactly one transformed preview before posting',async()=>{
 const writes:Record<string,unknown>[]=[];
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));writes.push(b);return response({id:b.id,status:'approved',version:5});}
  return response({items:String(url).includes('status=mask_review')?[flagged]:[plain],trashSupported:true,nextCursor:null});
 });render(<CommunityModeration kind="prayer"/>);await screen.findByText(plain.text);
 await userEvent.click(screen.getByRole('button',{name:'별도 검토 · 가림 게시'}));
 const card=await screen.findByRole('article',{name:'기도 flagged'});expect(card.querySelectorAll('mark')).toHaveLength(2);expect(within(card).getByText(flagged.masking.publicText)).toBeVisible();
 expect(screen.queryByText(plain.text)).toBeNull();expect(screen.queryByRole('button',{name:'검토 대기 항목 모두 선택'})).toBeNull();
 await userEvent.click(screen.getByRole('checkbox',{name:'flagged 선택'}));expect(screen.queryByRole('button',{name:'선택 공개 승인'})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'가림 처리본 게시'}));expect(writes).toHaveLength(0);
 expect(screen.getByLabelText('게시할 가림 처리본')).toHaveTextContent(flagged.masking.publicText);
 await userEvent.click(screen.getByRole('button',{name:'확인 후 가림 처리본 게시'}));await screen.findByText('1개 중 1개 완료.');
 expect(writes).toEqual([{id:'flagged',decision:'masked_approved',expectedVersion:4,maskPolicyVersion:'test-v1',reviewedPublicText:flagged.masking.publicText}]);expect(fetch.mock.calls.some(([url])=>String(url).includes('status=mask_review'))).toBe(true);
});
it('mixed ordinary selection excludes flagged rows and cannot bypass with a manual selection',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(response({items:[plain,flagged],trashSupported:true,nextCursor:null}));render(<CommunityModeration kind="prayer"/>);await screen.findByText(plain.text);
 await userEvent.click(screen.getByRole('button',{name:'검토 대기 항목 모두 선택'}));expect(screen.getByRole('checkbox',{name:'plain 선택'})).toBeChecked();expect(screen.getByRole('checkbox',{name:'flagged 선택'})).not.toBeChecked();
 await userEvent.click(screen.getByRole('checkbox',{name:'flagged 선택'}));expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();
});
it('held approved items are described as private review work, and cancel sends nothing',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response({items:[{...flagged,status:'approved',masking:{...flagged.masking,held:true}}],trashSupported:true,nextCursor:null}));render(<CommunityModeration kind="prayer"/>);
 await screen.findByText('기도 · 공개 보류 · 가림 재검토 필요');expect(screen.queryByText('확정되어 지금 앱에 공개된 내용입니다.')).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'가림 처리본 게시'}));await userEvent.click(screen.getByRole('button',{name:'취소'}));expect(fetch.mock.calls.every(([,init])=>init?.method!=='POST')).toBe(true);
});
it('missing policy support disables approval and never presents original as a public preview',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(response({items:[{...flagged,masking:{...flagged.masking,supported:false}}],trashSupported:true,nextCursor:null}));render(<CommunityModeration kind="prayer"/>);await screen.findByText('가림 정책 업데이트 후 승인할 수 있습니다.');expect(screen.queryByText('공개 표시 미리보기')).toBeNull();await userEvent.click(screen.getByRole('checkbox',{name:'flagged 선택'}));expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();
});
