import { requestWithDeadline, RequestTimeoutError } from '../../lib/requestDeadline';
import { prayerBoards } from '../companion/prayerBoards';

export type ExportKind = 'photo' | 'prayer';
export type ExportOptions = { kind: ExportKind; from?: string; to?: string; includeTrash?: boolean; signal: AbortSignal; onProgress?: (text: string) => void };
export type ExportItem = { id: string; kind: ExportKind | 'reflection'; text: string; createdAt: string; status: 'pending' | 'approved' | 'rejected' | 'archived' | 'trashed'; prayerBoard?: keyof typeof prayerBoards | null; photoUrl?: string | null; publicationHeld?: boolean; masking?: { held: boolean; required?: boolean } };
export const MAX_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO = 20 * 1024 * 1024;
export const PHOTO_TIMEOUT_MS = 60_000;
function downloadError(error: unknown): never {
  if (error instanceof RequestTimeoutError) throw new Error('다운로드 응답이 늦어 파일 준비를 중단했습니다. 파일은 저장되지 않았으며 게시물은 변경하지 않았습니다. 연결을 확인하고 다시 시도해주세요.');
  throw error;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const narrow = () => new Error('내보내기 한도를 초과했습니다. 업로드 날짜 범위를 줄여 다시 시도해주세요.');
const malformed = () => new Error('내보내기 응답 형식이 올바르지 않습니다. 파일을 만들지 않았습니다.');
const checkAbort = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('취소됨', 'AbortError'); };
export function validItem(value: unknown, kind: ExportKind): value is ExportItem {
  if (!value || typeof value !== 'object') return false;
  const x = value as ExportItem;
  return typeof x.id === 'string' && uuid.test(x.id) && (kind === 'photo' ? x.kind === 'photo' : x.kind === 'prayer' || x.kind === 'reflection')
    && typeof x.text === 'string' && x.text.length <= 100_000 && typeof x.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x.createdAt) && Number.isFinite(Date.parse(x.createdAt))
    && ['pending','approved','rejected','archived','trashed'].includes(x.status) && (x.status !== 'archived' || x.kind === 'photo')
    && (x.prayerBoard == null || Object.hasOwn(prayerBoards, x.prayerBoard)) && (x.photoUrl == null || typeof x.photoUrl === 'string')
    && (x.publicationHeld === undefined || typeof x.publicationHeld === 'boolean') && (x.masking === undefined || (!!x.masking && typeof x.masking.held === 'boolean' && (x.masking.required === undefined || typeof x.masking.required === 'boolean')));
}
export function seoulDay(value: string): string { return new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0,10); }
export function validateDates(from = '', to = '') {
  for (const day of [from,to]) if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day)) throw new Error('올바른 업로드 날짜를 입력해주세요.');
  if (from && to && from > to) throw new Error('시작일은 종료일보다 늦을 수 없습니다.');
}
async function boundedBytes(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) throw narrow();
  if (!response.body) throw malformed();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) { checkAbort(signal); const part = await reader.read(); checkAbort(signal); if (part.done) break; size += part.value.length; if (size > limit) throw narrow(); chunks.push(part.value); }
    const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk,offset); offset += chunk.length; } return result;
  } finally { signal.removeEventListener('abort',abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function requireOk(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '세션 또는 권한을 확인할 수 없습니다. 다시 로그인해주세요.' : '파일 준비 중 서버 요청에 실패했습니다. 다시 시도해주세요.');
}
export async function collectItems(options: ExportOptions): Promise<ExportItem[]> {
  validateDates(options.from,options.to); checkAbort(options.signal);
  const scopes = ['all', options.kind === 'photo' ? 'archived' : 'mask_review', ...(options.includeTrash ? ['trashed'] : [])];
  const items = new Map<string,ExportItem>(); let pages = 0;
  for (const status of scopes) {
    let cursor: string | null = null; const cursors = new Set<string>();
    do {
      checkAbort(options.signal); if (++pages > 2000) throw new Error('전체 목록 조회가 2,000페이지 한도를 넘어 파일 준비를 중단했습니다. 날짜를 좁혀도 전체 목록 조회는 필요하므로 이 도구로 내보낼 수 없습니다. 운영 담당자에게 별도 내보내기를 요청해주세요.');
      const query = new URLSearchParams({ kind: options.kind, status }); if (cursor) query.set('cursor',cursor);
      const body: unknown = await requestWithDeadline(async signal => {
        const response = await fetch('/api/admin/community?' + query, { signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); requireOk(response);
        return JSON.parse(new TextDecoder().decode(await boundedBytes(response, 8 * 1024 * 1024, signal)));
      }, { signal: options.signal }).catch(downloadError);
      checkAbort(options.signal);
      if (!body || typeof body !== 'object') throw malformed();
      const data = body as { items?: unknown; nextCursor?: unknown };
      if (!Array.isArray(data.items) || data.items.length > 100 || !Object.hasOwn(data,'nextCursor') || !(data.nextCursor === null || typeof data.nextCursor === 'string' && data.nextCursor.length > 0 && data.nextCursor.length <= 4096)) throw malformed();
      for (const item of data.items) {
        if (!validItem(item,options.kind)) throw malformed();
        const day = seoulDay(item.createdAt);
        if ((!options.from || day >= options.from) && (!options.to || day <= options.to)) {
          items.set(item.id.toLowerCase(),item);
          if (items.size > 10000) throw narrow();
        }
      }
      cursor = data.nextCursor;
      if (cursor) { if (cursors.has(cursor)) throw malformed(); cursors.add(cursor); }
      options.onProgress?.('목록 ' + pages + '페이지 확인 · 날짜 범위 내 ' + items.size + '건');
    } while (cursor);
  }
  return [...items.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function csvCell(value: string): string {
  let first = 0;
  while (first < value.length && (value.charCodeAt(first) <= 32 || value.charCodeAt(first) === 127 || /\s/.test(value[first]))) first++;
  const safe = /^[=+@-]/.test(value.slice(first)) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function makeCsv(rows: string[][]): string { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
export function statusText(item: ExportItem): string {
  const labels = { pending: '검토 대기', approved: '공개 중', rejected: '비공개', archived: '비공개 보관', trashed: '휴지통' };
  return (item.masking?.held || item.publicationHeld) ? (item.status === 'approved' ? '검토 필요 (공개 보류)' : labels[item.status] + ' · 검토 필요 (공개 보류)') : item.status === 'pending' && item.masking?.required ? '민감 표현 가림 검토 필요' : labels[item.status];
}
export function prayerCsv(items: ExportItem[]): string {
  return makeCsv([['종류','업로드 일시 (한국시간)','상태','기도 게시판','원문 (개인정보 포함 가능)','비고'], ...items.map(item => [item.kind === 'reflection' ? '묵상' : '기도', seoulTimestamp(item.createdAt), statusText(item), item.kind === 'prayer' ? prayerBoards[item.prayerBoard ?? 'general'].title : '', item.text, item.status === 'rejected' && item.text === '' ? '비공개 처리 시 내용이 삭제되어 남아 있지 않음' : ''])]);
}
function seoulTimestamp(value: string) { return new Date(Date.parse(value) + 9 * 3600000).toISOString().replace('T',' ').replace('Z',' +09:00'); }
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0;
}
export type ZipEntry = { name: string; bytes: Uint8Array };
export function makeZip(entries: ZipEntry[]): Blob {
  const local: BlobPart[] = []; const central: BlobPart[] = []; let offset = 0; let centralSize = 0;
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9._-]+$/.test(entry.name)) throw malformed();
    const name = encoder.encode(entry.name); const crc = crc32(entry.bytes);
    const header = new Uint8Array(30 + name.length); const h = new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(12,33,true); h.setUint32(14,crc,true); h.setUint32(18,entry.bytes.length,true); h.setUint32(22,entry.bytes.length,true); h.setUint16(26,name.length,true); header.set(name,30);
    const record = new Uint8Array(46 + name.length); const c = new DataView(record.buffer);
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(14,33,true); c.setUint32(16,crc,true); c.setUint32(20,entry.bytes.length,true); c.setUint32(24,entry.bytes.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true); record.set(name,46);
    local.push(header,entry.bytes as BlobPart); central.push(record); offset += header.length + entry.bytes.length; centralSize += record.length;
  }
  if (offset + centralSize + 22 > MAX_BYTES || entries.length > 65535) throw narrow();
  const end = new Uint8Array(22); const e = new DataView(end.buffer); e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true); e.setUint32(12,centralSize,true); e.setUint32(16,offset,true);
  return new Blob([...local,...central,end], { type: 'application/zip' });
}
export type ExportResult = { blob: Blob; filename: string; count: number; unavailable: number };
export async function prepareCommunityExport(options: ExportOptions): Promise<ExportResult | null> {
  const items = await collectItems(options); checkAbort(options.signal); if (!items.length) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  if (options.kind === 'prayer') { const blob = new Blob([prayerCsv(items)], { type: 'text/csv;charset=utf-8' }); if (blob.size > MAX_BYTES) throw narrow(); return { blob, filename: 'prayers-' + stamp + '.csv', count: items.length, unavailable: 0 }; }
  const entries: ZipEntry[] = []; let total = 0; let unavailable = 0;
  const manifest = [['파일명','업로드 일시 (한국시간)','상태','사진 설명','다운로드 결과']];
  for (const item of items) {
    checkAbort(options.signal); let name = ''; let reason = '저장된 PNG 포함';
    if (!item.photoUrl) { unavailable++; reason = item.status === 'rejected' ? '비공개 처리 시 사진이 삭제되어 남아 있지 않음' : '이미지 없음 (삭제·준비 상태 등으로 API에서 제공하지 않음)'; }
    else {
      name = seoulDay(item.createdAt) + '-' + item.id.toLowerCase() + '.png';
      const bytes = await requestWithDeadline(async signal => {
        const response = await fetch('/api/community/photo?id=' + encodeURIComponent(item.id), { signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); requireOk(response);
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/png') throw malformed();
        const data = await boundedBytes(response,Math.min(MAX_PHOTO,MAX_BYTES-total),signal);
        if (data.length < 8 || ![137,80,78,71,13,10,26,10].every((value,index) => data[index] === value)) throw malformed(); return data;
      }, { signal: options.signal, timeoutMs: PHOTO_TIMEOUT_MS }).catch(downloadError);
      checkAbort(options.signal); total += bytes.length; if (total > MAX_BYTES) throw narrow(); entries.push({ name,bytes });
    }
    manifest.push([name,seoulTimestamp(item.createdAt),statusText(item),item.text,reason]);
    options.onProgress?.('사진 ' + (entries.length + unavailable) + '/' + items.length + '건 확인 · 이미지 없음 ' + unavailable + '건');
  }
  if (!entries.length) throw new Error('대상 ' + items.length + '건 모두 다운로드할 이미지가 없습니다. 비공개·삭제·준비 상태 등으로 API에서 이미지를 제공하지 않아 ZIP을 만들지 않았습니다.');
  entries.push({ name: 'photos.csv', bytes: encoder.encode(makeCsv(manifest)) }); checkAbort(options.signal);
  options.onProgress?.('ZIP 파일을 준비하고 있습니다.');
  const blob = makeZip(entries); checkAbort(options.signal);
  return { blob, filename: 'photos-' + stamp + '.zip', count: items.length, unavailable };
}
