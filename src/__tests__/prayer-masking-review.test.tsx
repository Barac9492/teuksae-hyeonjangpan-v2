import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CommunityModeration } from '../features/admin/CommunityModeration';
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const base={kind:'prayer',createdAt:'2026-10-05T00:00:00Z',eventDay:null,status:'pending',version:4};
const mask={supported:true,editingSupported:true,sourceHash:'a'.repeat(64),terms:['자살','폭행'],held:false,policyVersion:'test-v1'};
const plain={...base,id:'plain',text:'평안한 하루',masking:{...mask,required:false,publicText:'평안한 하루',matches:[]}};
const flagged={...base,id:'flagged',text:'자살예방과 폭행 중단',masking:{...mask,required:true,publicText:'**예방과 ** 중단',matches:[{start:0,end:2,term:'자살'},{start:6,end:8,term:'폭행'}]}};
function fixture(items:unknown[]=[flagged],failPublish=false){
 const writes:Record<string,unknown>[]=[];let published=false;
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));writes.push(b);if(b.action==='publicationPreview')return response({...b,previewToken:'signed',previewExpires:Date.now()+600000});if(failPublish)return response({error:'preview_changed'},409);published=true;return response({id:b.id,status:'approved',version:5});}
  return response({items:published?[]:items,trashSupported:true,nextCursor:null});
 });return {writes,fetch};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('automatic mode obtains an exact server preview and publishes only after explicit confirmation',async()=>{
 const {writes}=fixture();render(<CommunityModeration kind="prayer"/>);
 await userEvent.click(await screen.findByRole('button',{name:'별도 검토 · 공개 문구'}));
 const card=await screen.findByRole('article',{name:'기도 flagged'});expect(card.querySelectorAll('mark')).toHaveLength(2);
 expect(within(card).getByText(flagged.masking.publicText)).toBeVisible();expect(screen.queryByRole('button',{name:'선택 공개 승인'})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'공개 미리보기 확인'}));expect(writes).toHaveLength(1);expect(writes[0].action).toBe('publicationPreview');
 expect(screen.getByLabelText('게시할 공개 문구')).toHaveTextContent(flagged.masking.publicText);
 await userEvent.dblClick(screen.getByRole('button',{name:'확인 후 공개 문구 게시'}));await screen.findByText('현재 검토 목록에 게시물이 없습니다.');
 expect(writes.filter(b=>b.decision==='reviewed_approved')).toHaveLength(1);expect(writes[1]).toMatchObject({id:'flagged',decision:'reviewed_approved',expectedVersion:4,publicationMode:'auto',sourceHash:mask.sourceHash,maskPolicyVersion:'test-v1',reviewedPublicText:flagged.masking.publicText,previewToken:'signed'});
});
it('manual draft is public-only, blocks remaining terms, and survives mode switching and confirmation cancel',async()=>{
 const {writes}=fixture();render(<CommunityModeration kind="prayer"/>);await screen.findByRole('article');
 await userEvent.click(screen.getByRole('radio',{name:'직접 수정'}));const input=screen.getByRole('textbox',{name:'공개할 문구만 수정'});
 expect(input).toHaveValue(flagged.text);expect(screen.getByRole('button',{name:'공개 미리보기 확인'})).toBeDisabled();
 await userEvent.clear(input);await userEvent.type(input,'평안과 회복을 위한 합성 기도');
 await userEvent.click(screen.getByRole('radio',{name:'자동 가림'}));expect(screen.getByText(flagged.masking.publicText)).toBeVisible();
 await userEvent.click(screen.getByRole('radio',{name:'직접 수정'}));expect(screen.getByRole('textbox')).toHaveValue('평안과 회복을 위한 합성 기도');
 expect(screen.getByRole('article').querySelector('mark')?.textContent).toBe('자살');
 await userEvent.click(screen.getByRole('button',{name:'공개 미리보기 확인'}));expect(screen.getByRole('textbox')).toBeDisabled();expect(screen.getByRole('radio',{name:'자동 가림'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'확인 취소 · 초안 유지'}));expect(screen.getByRole('textbox')).toHaveValue('평안과 회복을 위한 합성 기도');expect(writes.every(b=>!b.decision)).toBe(true);
 await userEvent.clear(screen.getByRole('textbox'));expect(screen.getByRole('button',{name:'공개 미리보기 확인'})).toBeDisabled();
});
it('conflict keeps manual draft but invalidates confirmation',async()=>{
 fixture([flagged],true);render(<CommunityModeration kind="prayer"/>);await screen.findByRole('article');await userEvent.click(screen.getByRole('radio',{name:'직접 수정'}));await userEvent.clear(screen.getByRole('textbox'));await userEvent.type(screen.getByRole('textbox'),'회복을 바랍니다');await userEvent.click(screen.getByRole('button',{name:'공개 미리보기 확인'}));await userEvent.click(screen.getByRole('button',{name:'확인 후 공개 문구 게시'}));await screen.findByRole('alert');expect(screen.getByRole('textbox')).toHaveValue('회복을 바랍니다');expect(screen.queryByRole('button',{name:'확인 후 공개 문구 게시'})).toBeNull();
});
it('ordinary bulk selection cannot include flagged rows',async()=>{
 fixture([plain,flagged]);render(<CommunityModeration kind="prayer"/>);await screen.findByText(plain.text);await userEvent.click(screen.getByRole('button',{name:'검토 대기 항목 모두 선택'}));expect(screen.getByRole('checkbox',{name:'plain 선택'})).toBeChecked();expect(screen.getByRole('checkbox',{name:'flagged 선택'})).not.toBeChecked();await userEvent.click(screen.getByRole('checkbox',{name:'flagged 선택'}));expect(screen.getByRole('button',{name:'선택 공개 승인'})).toBeDisabled();
});
it('missing new database capability disables separate publishing',async()=>{
 fixture([{...flagged,masking:{...flagged.masking,editingSupported:false}}]);render(<CommunityModeration kind="prayer"/>);await screen.findByText('공개 문구 검토 업데이트 후 게시할 수 있습니다.');expect(screen.queryByRole('button',{name:'공개 미리보기 확인'})).toBeNull();
});
it('current manual public text is labeled separately from unchanged original',async()=>{
 fixture([{...flagged,status:'approved',publicationMode:'manual',reviewedPublicText:'회복을 위한 기도'}]);render(<CommunityModeration kind="prayer"/>);await screen.findByText('현재 공개 문구 · 직접 수정');expect(screen.getByText('회복을 위한 기도')).toBeVisible();expect(screen.getByRole('article').querySelectorAll('mark')).toHaveLength(2);await waitFor(()=>expect(screen.queryByRole('textbox')).toBeNull());
});
