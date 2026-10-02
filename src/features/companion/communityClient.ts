import { requestWithDeadline } from '../../lib/requestDeadline';
import { runtimeStorageKey } from '../rehearsal/runtime';
export type CommunityKind = 'prayer' | 'photo' | 'reflection';
export type Receipt = { id: string; kind: CommunityKind; token: string };
export type CommunityItem = { id: string; kind: CommunityKind; text: string; createdAt: string; eventDay: number | null; photoUrl?: string };
export type CommunityFeed = { enabled: true; items: CommunityItem[]; photoCountToday: number; today: string };
export const RECEIPTS_KEY = 'woori-community-receipts-v1';
// Content and images never enter browser storage. In-memory receipts survive panel switches.
let receipts: Receipt[] = [];
let receiptNamespace = runtimeStorageKey(RECEIPTS_KEY);
export function readReceipts(): Receipt[] {
  const currentNamespace = runtimeStorageKey(RECEIPTS_KEY);
  if (receiptNamespace !== currentNamespace) { receipts = []; receiptNamespace = currentNamespace; }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(runtimeStorageKey(RECEIPTS_KEY)) ?? '[]');
    if (Array.isArray(saved)) for (const r of saved) {
      if (r && typeof r.id === 'string' && (r.kind === 'prayer' || r.kind === 'photo' || r.kind === 'reflection') && typeof r.token === 'string' && !receipts.some(x => x.id === r.id)) receipts.push({ id: r.id, kind: r.kind, token: r.token });
    }
  } catch { /* Memory remains available when storage is disabled. */ }
  return [...receipts];
}
export function saveReceipt(receipt: Receipt, replaceId?: string): boolean {
  receipts = readReceipts().filter(r => r.id !== receipt.id && r.id !== replaceId);
  receipts.push(receipt);
  try { localStorage.setItem(runtimeStorageKey(RECEIPTS_KEY), JSON.stringify(receipts)); return true; } catch { return false; }
}
export type SubmissionAttempt = { key: string; requestId: string; token: string; done: boolean; imageBase64?: string };
// Only unresolved attempts are kept in memory across tab switches. Never persist
// payload text/photos: localStorage still contains only the deletion capability.
const unresolvedAttempts = new Map<string, SubmissionAttempt>();
export function submissionAttempt(key: string): SubmissionAttempt {
  const scopedKey = `${runtimeStorageKey(RECEIPTS_KEY)}:${key}`;
  let attempt = unresolvedAttempts.get(scopedKey);
  if (!attempt || attempt.done) {
    attempt = { key, requestId: crypto.randomUUID(), token: deleteToken(), done: false };
    unresolvedAttempts.set(scopedKey, attempt);
  }
  return attempt;
}
export function finishSubmission(attempt: SubmissionAttempt) {
  attempt.done = true;
  delete attempt.imageBase64;
  for (const [key, value] of unresolvedAttempts) if (value === attempt) unresolvedAttempts.delete(key);
}
export function finishSubmissionForReceipt(id: string) {
  const keys: string[] = [];
  for (const attempt of unresolvedAttempts.values()) {
    if (attempt.requestId === id) { keys.push(attempt.key); finishSubmission(attempt); }
  }
  return keys;
}
export async function communityRequest(body?: object, kind?: CommunityKind, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return requestWithDeadline(async requestSignal => {
    const response = await fetch(body ? '/api/community' : `/api/community?kind=${kind}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal: requestSignal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    if (response?.status === 409) throw new Error('요청 내용이 기존 접수와 충돌했습니다. 내 제출 기록에서 접수 여부를 확인해주세요.');
    if (!response?.ok) throw new Error('공개 나눔 서버에 연결하지 못했어요. 접수 여부를 확인하거나 다시 시도해주세요.');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || ('enabled' in result && result.enabled === false)) throw new Error('지금은 공개 나눔을 이용할 수 없어요.');
    return result as Record<string, unknown>;
  }, { signal });
}
export function validateFeed(value: Record<string, unknown>): CommunityFeed {
  if (value.enabled !== true || !Array.isArray(value.items) || !Number.isInteger(value.photoCountToday) || Number(value.photoCountToday) < 0 || typeof value.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.today)) throw new Error('공개 나눔 정보를 확인하지 못했어요.');
  if (value.items.some(item => !item || typeof item.id !== 'string' || typeof item.text !== 'string' || !['photo', 'prayer', 'reflection'].includes(item.kind))) throw new Error('공개 나눔 정보를 확인하지 못했어요.');
  return value as CommunityFeed;
}
export function safePhotoUrl(url?: string): string | null {
  if (!url) return null;
  try { const parsed = new URL(url, window.location.origin); return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/') ? parsed.pathname + parsed.search : null; } catch { return null; }
}
export function deleteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function photoBase64(file: File, signal?: AbortSignal): Promise<string> {
  if (file.size > 3 * 1024 * 1024 || file.size === 0 || file.type !== 'image/png') throw new Error('공개 접수용 PNG는 3MB 이하여야 해요. 더 작은 사진을 선택해주세요.');
  return requestWithDeadline(requestSignal => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => { reader.abort(); reject(new DOMException('Request cancelled', 'AbortError')); };
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onloadend = () => requestSignal.removeEventListener('abort', cancel);
    requestSignal.addEventListener('abort', cancel, { once: true });
    reader.readAsDataURL(file);
  }), { signal });
}
