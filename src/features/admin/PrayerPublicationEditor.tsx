import { useEffect, useId, useRef, useState } from 'react';

type Mode = 'auto' | 'manual';
type Preview = { id:string; expectedVersion:number; publicationMode:Mode; reviewedPublicText:string; sourceHash:string; maskPolicyVersion:string; previewExpires:number; previewToken:string };
type Props = {
  id:string; version:number; original:string; automaticText:string; sourceHash:string; policyVersion:string; terms:string[]; disabled:boolean;
  request:(init:RequestInit)=>Promise<Record<string,unknown>>; onPublished:()=>void;
};
/** Drafts are memory-only. Changing mode/canceling confirmation preserves the manual draft. */
export function PrayerPublicationEditor(props:Props) {
  const {id,version,original,automaticText,sourceHash,policyVersion,terms,disabled,request,onPublished}=props;
  const label=useId(),lock=useRef(false),active=useRef(true);
  const [mode,setMode]=useState<Mode>('auto'),[draft,setDraft]=useState(original),[preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const text=mode==='auto'?automaticText:draft;
  const invalid=!text.trim()||[...text].length>600||terms.some(term=>text.includes(term));
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{if(draft===original)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[draft,original]);
  const prepare=async()=>{
    if(lock.current||disabled||invalid)return;lock.current=true;setBusy(true);setError('');
    try {
      const fields={id,expectedVersion:version,publicationMode:mode,reviewedPublicText:text,sourceHash,maskPolicyVersion:policyVersion};
      const data=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publicationPreview',...fields})});
      if(Object.entries(fields).some(([key,value])=>data[key]!==value)||typeof data.previewToken!=='string'||!Number.isSafeInteger(data.previewExpires))throw new Error('공개 미리보기를 확인하지 못했습니다.');
      if(active.current)setPreview({...fields,previewToken:data.previewToken as string,previewExpires:data.previewExpires as number});
    } catch(e){if(active.current)setError(e instanceof Error?e.message:'미리보기를 확인하지 못했습니다.');}
    finally{lock.current=false;if(active.current)setBusy(false);}
  };
  const publish=async()=>{
    if(lock.current||disabled||!preview)return;lock.current=true;setBusy(true);setError('');
    try {
      const data=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'reviewed_approved',...preview})});
      if(data.id!==id||data.status!=='approved'||data.version!==version+1)throw new Error('게시 결과를 확인하지 못했습니다.');
      if(active.current)onPublished();
    } catch(e){if(active.current){setPreview(null);setError(`${e instanceof Error?e.message:'게시 결과를 확인하지 못했습니다.'} 초안은 이 화면에 남아 있습니다. 목록에서 처리 결과를 확인해주세요.`);}}
    finally{lock.current=false;if(active.current)setBusy(false);}
  };
  return <div className="community-moderation__mask-preview" aria-label="공개 문구 검토">
    <fieldset disabled={disabled||busy||!!preview}><legend>공개 방식</legend>
      <label><input type="radio" name={label} checked={mode==='auto'} onChange={()=>{setMode('auto');setPreview(null);setError('');}}/> 자동 가림</label>
      <label><input type="radio" name={label} checked={mode==='manual'} onChange={()=>{setMode('manual');setPreview(null);setError('');}}/> 직접 수정</label>
    </fieldset>
    {mode==='manual'&&<><label htmlFor={label}>공개할 문구만 수정</label><textarea id={label} value={draft} maxLength={1200} disabled={disabled||busy||!!preview} onChange={e=>{setDraft(e.target.value);setPreview(null);setError('');}}/><p>{[...draft].length}/600자 · 작성 원문은 바뀌지 않습니다.</p></>}
    <strong>{invalid?'수정 중인 공개 문구 · 게시 불가':'공개 표시 미리보기'}</strong><p className="community-moderation__text">{text}</p>
    <p>모드를 바꾸거나 확인을 취소해도 이 화면에서는 수정 초안을 유지합니다. 목록을 새로고침하거나 화면을 나가면 초안은 저장되지 않습니다.</p>
    {invalid&&<p role="status">공개 문구를 1~600자로 입력하고 지정 표현을 수정하거나 자동 가림을 선택해주세요.</p>}
    {error&&<p role="alert">{error}</p>}
    {!preview&&<button type="button" className="ta-admin__primary" disabled={disabled||busy||invalid} onClick={()=>void prepare()}>공개 미리보기 확인</button>}
    {preview&&<div role="region" aria-label="공개 문구 최종 확인" className="community-moderation__confirmation">
      <strong>{preview.publicationMode==='auto'?'자동 가림':'직접 수정'} · 아래 문구 그대로 공개합니다.</strong>
      <p className="community-moderation__text" aria-label="게시할 공개 문구">{preview.reviewedPublicText}</p>
      <p>원문과 공개 문구, 공개 동의를 확인했나요?</p>
      <button type="button" className="ta-admin__primary" disabled={disabled||busy} onClick={()=>void publish()}>확인 후 공개 문구 게시</button>
      <button type="button" className="ta-admin__secondary" disabled={busy} onClick={()=>{setPreview(null);setError('');}}>확인 취소 · 초안 유지</button>
    </div>}
  </div>;
}
