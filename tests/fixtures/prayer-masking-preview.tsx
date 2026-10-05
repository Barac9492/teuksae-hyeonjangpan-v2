// Local visual fixture only. No real submissions or admin session.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CommunityModeration } from '../../src/features/admin/CommunityModeration';
import '../../src/features/admin/admin.css';
const base={kind:'prayer',createdAt:'2026-10-05T01:00:00Z',eventDay:null,version:4};
const items=[{...base,id:'synthetic-new',status:'pending',text:'자살예방과 폭행 피해 회복을 위한 합성 예시입니다.',masking:{required:true,supported:true,editingSupported:true,sourceHash:'a'.repeat(64),terms:['자살','폭행','성폭행'],held:false,publicText:'**예방과 ** 피해 회복을 위한 합성 예시입니다.',policyVersion:'visual-fixture',matches:[{start:0,end:2,term:'자살'},{start:6,end:8,term:'폭행'}]}},{...base,id:'synthetic-held',status:'approved',text:'성폭행 피해 회복을 위한 합성 예시입니다.',masking:{required:true,supported:true,editingSupported:true,sourceHash:'a'.repeat(64),terms:['자살','폭행','성폭행'],held:true,publicText:'** 피해 회복을 위한 합성 예시입니다.',policyVersion:'visual-fixture',matches:[{start:0,end:3,term:'성폭행'}]}}];
window.fetch=async(url,init)=>{
 if(init?.method==='POST'){const b=JSON.parse(String(init.body));return new Response(JSON.stringify(b.action==='publicationPreview'?{...b,previewToken:'synthetic-only',previewExpires:Date.now()+600000}:{error:'합성 미리보기에서는 게시하지 않습니다.'}),{status:b.action==='publicationPreview'?200:403});}
 return new Response(JSON.stringify({items:String(url).includes('mask_review')?items:[],nextCursor:null,trashSupported:true}));
};
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="ta-admin" style={{maxWidth:1000,margin:'auto',padding:20}}><p>로컬 합성 데이터 · 실제 제출 내용 아님</p><CommunityModeration kind="prayer"/></main></React.StrictMode>);
