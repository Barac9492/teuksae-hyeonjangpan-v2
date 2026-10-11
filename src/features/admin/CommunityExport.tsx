import { useEffect, useId, useRef, useState } from 'react';
import { prepareCommunityExport, type ExportKind } from './communityExportData';
import './CommunityExport.css';

export function CommunityExport({ kind }: { kind: ExportKind }) {
  const id = useId();
  const [from,setFrom] = useState(''); const [to,setTo] = useState(''); const [includeTrash,setIncludeTrash] = useState(false);
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [error,setError] = useState('');
  const [ready,setReady] = useState<{ url: string; filename: string } | null>(null);
  const controller = useRef<AbortController | null>(null); const url = useRef<string | null>(null);
  const revoke = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = null; };
  useEffect(() => () => { controller.current?.abort(); controller.current = null; revoke(); }, []);
  function reset() { revoke(); setReady(null); setMessage(''); setError(''); }
  async function prepare() {
    if (controller.current) return;
    reset(); const active = new AbortController(); controller.current = active; setBusy(true); setMessage('전체 목록을 확인하고 있습니다.');
    try {
      const result = await prepareCommunityExport({ kind,from,to,includeTrash,signal: active.signal,onProgress: text => { if (controller.current === active) setMessage(text); } });
      if (controller.current !== active) return;
      if (active.signal.aborted) throw new DOMException('취소됨', 'AbortError');
      if (!result) { setMessage('선택한 업로드 날짜에 해당하는 게시물이 없습니다.'); return; }
      const next = URL.createObjectURL(result.blob); url.current = next; setReady({url:next,filename:result.filename});
      setMessage(result.count + '건을 담은 파일을 준비했습니다'  + (kind === 'photo' ? ' · 사진 ' + (result.count-result.unavailable) + '건 포함 · 이미지 없음 ' + result.unavailable + '건 (photos.csv에 사유 표시)'  : '') + '. 아래 링크를 눌러 저장해주세요.');
    } catch (reason) {
      if (controller.current === active) {
        setMessage(''); setError(active.signal.aborted ? '파일 준비를 취소했습니다.' : reason instanceof Error ? reason.message : '파일을 준비하지 못했습니다. 다시 시도해주세요.');
      }
    } finally { if (controller.current === active) { controller.current = null; setBusy(false); } }
  }
  return <section className="community-export" aria-labelledby={id+'-heading'}>
    <h2 id={id+'-heading'}>{kind === 'photo' ? '사진 일괄 다운로드' : '기도제목 다운로드'}</h2>
    <p>전체 페이지의 공개·검토 대기·비공개 게시물과 {kind === 'photo' ? '비공개 보관 사진' : '공개 보류 기도 및 이전 묵상'}을 포함합니다. 휴지통은 선택한 경우만 포함합니다.</p>
    <p>관리자 보관용입니다. {kind === 'photo' ? '비공개 사진과 설명' : '개인정보가 포함될 수 있는 기도 원문'}을 외부에 공유하지 마세요.</p>
    <fieldset disabled={busy}><legend>업로드 날짜 (한국시간, 비워두면 전체 기간)</legend><div className="community-export__dates">
      <label htmlFor={id+'-from'}>시작일<input id={id+'-from'} type="date" value={from} onChange={event => { reset(); setFrom(event.target.value); }}/></label>
      <label htmlFor={id+'-to'}>종료일<input id={id+'-to'} type="date" value={to} onChange={event => { reset(); setTo(event.target.value); }}/></label>
    </div><label className="community-export__check"><input type="checkbox" checked={includeTrash} onChange={event => { reset(); setIncludeTrash(event.target.checked); }}/>휴지통 포함</label></fieldset>
    <p className="community-export__note">파일을 만드는 동안 승인·삭제된 내용은 일부 반영되지 않을 수 있습니다. 검토가 없는 시간에 받아주세요. {kind === 'photo' && '저장된 PNG와 photos.csv 목록을 ZIP으로 받습니다. 카메라 원본이 아니며 삭제된 사진을 복원하지 않습니다. '}최대 10,000건·200MiB(약 210MB)까지입니다.{kind === 'photo' && ' 사진 한 장은 20MiB까지입니다. 사진이 많으면 PC에서 받아주세요.'}</p>
    <div className="community-export__actions"><button type="button" className="ta-admin__secondary" disabled={busy} onClick={() => void prepare()}>{busy ? '파일 준비 중…' : '파일 준비하기'}</button>{busy && <button type="button" className="ta-admin__secondary" onClick={() => controller.current?.abort()}>취소</button>}</div>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {ready && <a className="community-export__download" href={ready.url} download={ready.filename}>{kind === 'photo' ? 'ZIP 파일 저장' : 'CSV 파일 저장'}</a>}
  </section>;
}
