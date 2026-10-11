import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectItems, crc32, csvCell, makeCsv, makeZip, prayerCsv, prepareCommunityExport, seoulDay, statusText, validItem, validateDates, MAX_BYTES, PHOTO_TIMEOUT_MS, type ExportItem } from '../features/admin/communityExportData';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
const item = (n = 1, overrides: Partial<ExportItem> = {}): ExportItem => ({id:id(n),kind:'prayer',text:'테스트 기도',createdAt:'2026-10-05T15:00:00Z',status:'approved',...overrides});
const response = (items: unknown[], nextCursor: string | null = null) => new Response(JSON.stringify({items,nextCursor}));
const options = () => ({kind:'prayer' as const,signal:new AbortController().signal});
const readBlob = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result as ArrayBuffer); reader.onerror=reject; reader.readAsArrayBuffer(blob); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('export pagination and validation', () => {
  it('reads all pages, mask review, optional trash and deduplicates UUIDs', async () => {
    const fetcher = vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response(Array.from({length:20},(_,i)=>item(i+1)),'page2')).mockResolvedValueOnce(response(Array.from({length:5},(_,i)=>item(i+21)))).mockResolvedValueOnce(response([item(1,{masking:{held:true}}),item(26)])).mockResolvedValueOnce(response([item(27,{status:'trashed'})]));
    const rows = await collectItems({...options(),includeTrash:true}); expect(rows).toHaveLength(27); expect(rows.find(row=>row.id===id(1))?.masking?.held).toBe(true);
    expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual(['/api/admin/community?kind=prayer&status=all','/api/admin/community?kind=prayer&status=all&cursor=page2','/api/admin/community?kind=prayer&status=mask_review','/api/admin/community?kind=prayer&status=trashed']);
  });
  it('always includes private photo archive but not trash by default',async()=>{
    const mock = vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',prayerBoard:null})])).mockResolvedValueOnce(response([item(2,{kind:'photo',status:'archived'})]));
    expect(await collectItems({...options(),kind:'photo'})).toHaveLength(2); expect(String(mock.mock.calls[1][0])).toContain('status=archived');
  });
  it.each([{items:[]},{items:[],nextCursor:3},{items:[item(1,{kind:'photo'})],nextCursor:null},{items:[item(1,{id:'bad'})],nextCursor:null},{items:[item(1,{status:'unknown' as ExportItem['status']})],nextCursor:null}])('rejects malformed page %j',async body=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(body))); await expect(collectItems(options())).rejects.toThrow('응답 형식');
  });
  it('rejects repeated cursors instead of looping',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async()=>response([],'same'));await expect(collectItems(options())).rejects.toThrow('응답 형식');});
  it.each([401,403,500])('fails closed for HTTP %s',async status=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status}));await expect(collectItems(options())).rejects.toThrow();});
  it('rejects malformed JSON',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>'));await expect(collectItems(options())).rejects.toThrow();});
  it('validates legacy reflection and default prayer boards without inventing fields',()=>{
    expect(validItem(item(1,{kind:'reflection',prayerBoard:null}),'prayer')).toBe(true); expect(prayerCsv([item(1,{kind:'reflection',prayerBoard:null}),item(2)])).toContain('묵상');expect(prayerCsv([item()])).toContain('함께 나누는 기도');
  });
  it('applies inclusive Korean upload dates, not event dates',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{createdAt:'2026-10-05T14:59:59Z'}),item(2),item(3,{createdAt:'2026-10-06T15:00:00Z'})])).mockResolvedValueOnce(response([]));
    expect((await collectItems({...options(),from:'2026-10-06',to:'2026-10-06'})).map(row=>row.id)).toEqual([id(2)]);expect(seoulDay('2026-10-05T15:00:00Z')).toBe('2026-10-06');
    expect(()=>validateDates('2026-10-09','2026-10-08')).toThrow();expect(()=>validateDates('2026-02-30')).toThrow();
  });
  it('cancels even when fetch ignores AbortSignal',async()=>{
    vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(()=>{})); const controller=new AbortController();const pending=collectItems({...options(),signal:controller.signal});controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
  it('bounds page count',async()=>{let n=0;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>response([],String(++n)));await expect(collectItems(options())).rejects.toThrow('날짜를 좁혀도 전체 목록 조회는 필요');});
});
describe('CSV and ZIP',()=>{
  it.each(['=1','+cmd','-1','@SUM(A1)','  =1','\u0001=1','\tplain','\rplain','\nplain'])('neutralizes spreadsheet formula or control prefix %j', value=>expect(csvCell(value)).toBe('"\''+value+'"'));
  it('preserves quoted multiline text and uses BOM and CRLF',()=>{expect(makeCsv([['a,"b"\nc','한글']])).toBe('\uFEFF"a,""b""\nc","한글"\r\n');});
  it('never calls held approved content public',()=>{expect(statusText(item(1,{masking:{held:true}}))).not.toContain('공개 중');expect(statusText(item(1,{publicationHeld:true}))).toContain('검토 필요');});
  it('writes STORE ZIP records, UTF8 flags, CRC, directory offsets and EOCD',async()=>{
    const data=new TextEncoder().encode('123456789');expect(crc32(data)).toBe(0xcbf43926);
    const bytes=new Uint8Array(await readBlob(makeZip([{name:'photos.csv',bytes:data}])));const view=new DataView(bytes.buffer);
    expect(view.getUint32(0,true)).toBe(0x04034b50);expect(view.getUint16(6,true)).toBe(0x800);expect(view.getUint16(8,true)).toBe(0);expect(view.getUint32(14,true)).toBe(0xcbf43926);
    const end=bytes.length-22;expect(view.getUint32(end,true)).toBe(0x06054b50);expect(view.getUint16(end+10,true)).toBe(1);const directory=view.getUint32(end+16,true);expect(view.getUint32(directory,true)).toBe(0x02014b50);expect(view.getUint32(directory+42,true)).toBe(0);expect(new TextDecoder().decode(bytes.subarray(40,49))).toBe('123456789');
  });
  it('constructs photo URL from UUID only and reports known missing photos',async()=>{
    const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);const mock=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',photoUrl:'https://evil.invalid/secret'}),item(2,{kind:'photo',status:'rejected'})])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response(png,{headers:{'content-type':'image/png'}}));
    const result=await prepareCommunityExport({...options(),kind:'photo'});expect(result?.unavailable).toBe(1);expect(result?.filename).toMatch(/\.zip$/);expect(mock.mock.calls[2][0]).toBe('/api/community/photo?id='+id(1));expect(mock.mock.calls[2][1]).toMatchObject({credentials:'same-origin',cache:'no-store',redirect:'error'});
    expect(new TextDecoder().decode(await readBlob(result!.blob))).toContain('photos.csv');
  });
  it.each(['wrong-type','wrong-signature','too-large','fetch-failure'])('fails the entire photo export for %s',async scenario=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',photoUrl:'/ignored'})])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response('not a png',{status:scenario==='fetch-failure'?500:200,headers:{'content-type':scenario==='wrong-type'?'text/html':'image/png','content-length':scenario==='too-large'?String(MAX_BYTES+1):'9'}}));
    await expect(prepareCommunityExport({...options(),kind:'photo'})).rejects.toThrow();
  });
  it('does not create a manifest-only ZIP when every photo is unavailable',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',status:'rejected'})])).mockResolvedValueOnce(response([]));await expect(prepareCommunityExport({...options(),kind:'photo'})).rejects.toThrow('대상 1건 모두 다운로드할 이미지가 없습니다');});
  it('returns no file for empty results',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async()=>response([]));expect(await prepareCommunityExport(options())).toBeNull();});
});


describe('review regression boundaries',()=>{
  it('scans more than 10,000 excluded rows and exports matching dates within the page cap',async()=>{
    let page=0;
    vi.spyOn(globalThis,'fetch').mockImplementation(async url=>{
      if (String(url).includes('status=mask_review')) return response([]);
      const index=page++;
      return index<501 ? response(Array.from({length:20},(_,n)=>item(index*20+n+1,{createdAt:'2026-10-01T00:00:00Z'})),String(page)) : response([item(20000)]);
    });
    const rows=await collectItems({...options(),from:'2026-10-06',to:'2026-10-06'});expect(rows.map(row=>row.id)).toEqual([id(20000)]);
  });
  it('caps matching unique rows at 10,000',async()=>{
    let page=0;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{const index=page++;return response(Array.from({length:20},(_,n)=>item(index*20+n+1)),String(page));});
    await expect(collectItems(options())).rejects.toThrow('업로드 날짜 범위를 줄여');
  });
  it('explains deleted rejected text in a separate note while leaving original empty',()=>{
    const csv=prayerCsv([item(1,{status:'rejected',text:''})]);expect(csv).toContain('"원문 (개인정보 포함 가능)","비고"');expect(csv).toContain(',"","비공개 처리 시 내용이 삭제되어 남아 있지 않음"');
    expect(prayerCsv([item(1,{status:'rejected',text:'남아 있는 원문'})])).not.toContain('내용이 삭제되어');
  });
  it('labels pending sensitive text review and rejects malformed masking.required',()=>{
    const row=item(1,{status:'pending',masking:{held:false,required:true}});expect(statusText(row)).toBe('민감 표현 가림 검토 필요');expect(validItem(row,'prayer')).toBe(true);
    expect(validItem({...row,masking:{held:false,required:'yes'}},'prayer')).toBe(false);
    expect(statusText(item(1,{masking:{held:true,required:true}}))).toContain('공개 보류');
  });
  it('includes the specific rejected photo deletion reason in the ZIP manifest',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',photoUrl:'/ignored'}),item(2,{kind:'photo',status:'rejected',text:''})])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'content-type':'image/png'}}));
    const output=await prepareCommunityExport({...options(),kind:'photo'});expect(new TextDecoder().decode(await readBlob(output!.blob))).toContain('비공개 처리 시 사진이 삭제되어 남아 있지 않음');
  });
  it.each(['fetch','body'])('cancels photo %s without a partial result',async phase=>{
    let started!:()=>void;const start=new Promise<void>(resolve=>{started=resolve;});
    const controller=new AbortController();
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',photoUrl:'/ignored'})])).mockResolvedValueOnce(response([])).mockImplementationOnce(async()=>{started();return phase==='fetch'?new Promise<Response>(()=>{}):new Response(new ReadableStream<Uint8Array>(),{headers:{'content-type':'image/png'}});});
    const pending=prepareCommunityExport({...options(),kind:'photo',signal:controller.signal});const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});await start;controller.abort();await assertion;
  });
  it('allows photo responses beyond 15 seconds and times out at 60 seconds with read-only wording',async()=>{
    vi.useFakeTimers();let started!:()=>void;const start=new Promise<void>(resolve=>{started=resolve;});
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([item(1,{kind:'photo',photoUrl:'/ignored'})])).mockResolvedValueOnce(response([])).mockImplementationOnce(()=>{started();return new Promise<Response>(()=>{});});
    const pending=prepareCommunityExport({...options(),kind:'photo'});const assertion=expect(pending).rejects.toThrow('파일은 저장되지 않았으며 게시물은 변경하지 않았습니다');let settled=false;void pending.then(()=>{settled=true;},()=>{settled=true;});
    await start;await vi.advanceTimersByTimeAsync(15_001);expect(settled).toBe(false);await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS-15_001);await assertion;
  });
  it('writes multi-entry ZIP directory offsets and CRCs for every stored file',async()=>{
    const entries=[{name:'a.png',bytes:new Uint8Array([1,2,3])},{name:'b.png',bytes:new Uint8Array([4,5])},{name:'photos.csv',bytes:new TextEncoder().encode(makeCsv([['목록']]))}];
    const bytes=new Uint8Array(await readBlob(makeZip(entries)));const view=new DataView(bytes.buffer);const end=bytes.length-22;expect(view.getUint16(end+10,true)).toBe(3);let directory=view.getUint32(end+16,true);let expectedOffset=0;
    for(const entry of entries){expect(view.getUint32(directory,true)).toBe(0x02014b50);expect(view.getUint32(directory+42,true)).toBe(expectedOffset);expect(view.getUint32(directory+16,true)).toBe(crc32(entry.bytes));expect(view.getUint32(expectedOffset,true)).toBe(0x04034b50);const size=view.getUint16(directory+28,true);expect(new TextDecoder().decode(bytes.subarray(directory+46,directory+46+size))).toBe(entry.name);expect([...bytes.subarray(expectedOffset+30+size,expectedOffset+30+size+entry.bytes.length)]).toEqual([...entry.bytes]);expectedOffset+=30+size+entry.bytes.length;directory+=46+size;}
    expect(directory).toBe(end);
  });
});
