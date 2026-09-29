import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FloorStack } from './worship';
import type { FloorItem } from './worship';
import { PageHeading, StatusRow, VenueSwitch } from './ui';
import type { ValueTone, Venue } from './ui';

export type LiveResourceState = 'checking' | 'closed' | 'available' | 'busy' | 'full' | 'school_open' | 'gym_open' | 'hall_open' | 'hall_closed';
type Category = 'parking' | 'space';
type ParkingDay = { date: string; firstFullAt: string | null; closedAt: string | null };
const koreaDate = (time: number) => new Date(time + 9 * 60 * 60_000).toISOString().slice(0, 10);
function parkingDay(value: unknown): ParkingDay | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return undefined;
  const dayStart = Date.parse(v.date + 'T00:00:00+09:00');
  if (!Number.isFinite(dayStart) || koreaDate(dayStart) !== v.date) return undefined;
  for (const key of ['firstFullAt', 'closedAt']) {
    const t = v[key];
    if (t !== null && (typeof t !== 'string' || !Number.isFinite(Date.parse(t)) || koreaDate(Date.parse(t)) !== v.date)) return undefined;
  }
  return v as ParkingDay;
}
type LiveResource = { id: string; label: string; category: Category; state: LiveResourceState; version: number; updatedAt: string | null; occupancyPercent?: number | null; lastClosedAt?: string | null; lastFullAt?: string | null; previousDay?: ParkingDay };
type StatusResponse = { enabled: boolean; resources: LiveResource[] };
type Freshness = 'fresh' | 'unconfirmed' | 'stale' | 'invalid' | 'future' | 'offline';

const EVENT_START = Date.parse('2026-10-05T00:00:00+09:00');
const EVENT_END = Date.parse('2026-10-11T00:00:00+09:00');
type EventPhase = 'before' | 'active' | 'after';
function eventPhase(now: number): EventPhase {
  if (now < EVENT_START) return 'before';
  if (now < EVENT_END) return 'active';
  return 'after';
}
const eventActive = (now: number) => eventPhase(now) === 'active';
const eventNotice = '특새 기간에 현장 정보가 표시됩니다';

const REFRESH_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8_000;
const FRESH_MS = 10 * 60_000;
const defaults: LiveResource[] = [
  { id: 'space.songrim.access', label: '학교 출입', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.songrim.hall', label: '본당 1·2층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.songrim.gym', label: '체육관', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f3', label: '3층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f7', label: '7층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f11', label: '11층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'parking.songrim', label: '송림본당 주차', category: 'parking', state: 'checking', version: 0, updatedAt: null },
  { id: 'parking.calvary', label: '갈보리교회 주차', category: 'parking', state: 'checking', version: 0, updatedAt: null },
  ...[1, 2, 3, 4, 5].map((floor) => ({ id: `parking.dream.b${floor}`, label: `B${floor}`, category: 'parking' as const, state: 'checking' as const, version: 0, updatedAt: null })),
];
const byId = new Map(defaults.map((resource) => [resource.id, resource]));
const normalStates = new Set<LiveResourceState>(['checking', 'closed', 'available', 'busy', 'full']);
const accessStates = new Set<LiveResourceState>(['checking', 'closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed']);
const hasOccupancySchema = (resource: LiveResource) => resource.id !== 'space.songrim.access' && Object.prototype.hasOwnProperty.call(resource, 'occupancyPercent');
const occupancyTone = (percent: number): ValueTone => percent <= 60 ? 'good' : percent <= 90 ? 'warn' : percent === 100 ? 'stop' : 'neutral';

function validResource(value: unknown): LiveResource | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const fallback = typeof raw.id === 'string' ? byId.get(raw.id) : undefined;
  if (!fallback || raw.category !== fallback.category || !Number.isInteger(raw.version) || (raw.version as number) < 0 || typeof raw.state !== 'string') return null;
  const states = fallback.id === 'space.songrim.access' ? accessStates : normalStates;
  if (!states.has(raw.state as LiveResourceState)) return null;
  if (raw.updatedAt !== null && (typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt)))) return null;
  if (raw.occupancyPercent != null && (typeof raw.occupancyPercent !== 'number' || !Number.isInteger(raw.occupancyPercent) || raw.occupancyPercent < 0 || raw.occupancyPercent > 100 || raw.occupancyPercent % 10 !== 0 || raw.id === 'space.songrim.access')) return null;
  if (typeof raw.occupancyPercent === 'number' && raw.state !== (raw.occupancyPercent === 100 ? 'full' : raw.occupancyPercent >= 70 ? 'busy' : 'available')) return null;
  for (const key of ['lastClosedAt', 'lastFullAt']) if (raw[key] != null && (typeof raw[key] !== 'string' || !Number.isFinite(Date.parse(raw[key] as string)))) return null;
  return { ...fallback, previousDay: parkingDay(raw.previousDay), ...(Object.prototype.hasOwnProperty.call(raw, 'occupancyPercent') ? { occupancyPercent: raw.occupancyPercent as number | null } : {}), lastClosedAt: raw.lastClosedAt as string | null | undefined, lastFullAt: raw.lastFullAt as string | null | undefined, state: raw.state as LiveResourceState, version: raw.version as number, updatedAt: raw.updatedAt as string | null };
}

function freshness(updatedAt: string | null, now: number, offline: boolean, enabled: boolean): Freshness {
  if (offline) return 'offline';
  if (!enabled || !updatedAt) return 'unconfirmed';
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return 'invalid';
  if (time > now) return 'future';
  // Once the real event has started, a check-in timestamped before it started is rehearsal
  // data that must not be carried over as live opening-day status.
  if (now >= EVENT_START && time < EVENT_START) return 'unconfirmed';
  return now - time <= FRESH_MS ? 'fresh' : 'stale';
}
function stateText(resource: LiveResource): string {
  if (resource.state === 'full') return resource.category === 'parking' ? '만차' : '입장 마감';
  return ({ checking: '확인 중', closed: '닫힘', available: '이용 가능', busy: '혼잡', school_open: '학교 개방', gym_open: '체육관 개방', hall_open: '본당 입장 가능', hall_closed: '본당 입장 마감' })[resource.state] ?? '확인 중';
}
function stateTone(state: LiveResourceState): ValueTone {
  if (state === 'available' || state === 'school_open' || state === 'gym_open' || state === 'hall_open') return 'good';
  if (state === 'busy') return 'warn';
  if (state === 'full' || state === 'closed' || state === 'hall_closed') return 'stop';
  return 'neutral';
}
function historyClock(time: string): string { return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(time)); }
function clockText(updatedAt: string): string { return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(updatedAt)); }
function historyTime(value: string): string { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(value)); }

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveOperations(active = true) {
  const [response, setResponse] = useState<StatusResponse | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    let mounted = true;
    let sequence = 0;
    let controller: AbortController | null = null;
    const load = async () => {
      if (!navigator.onLine) { if (mounted) setOffline(true); return; }
      controller?.abort(); controller = new AbortController();
      const request = ++sequence;
      const timeout = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      try {
        const result = await fetch('/api/status', { headers: { accept: 'application/json' }, signal: controller.signal });
        const body = await result.json().catch(() => null) as unknown;
        if (!mounted || request !== sequence) return;
        setNow(Date.now());
        if (!result.ok || !body || typeof body !== 'object' || (body as { enabled?: unknown }).enabled !== true || !Array.isArray((body as { resources?: unknown }).resources)) {
          setResponse((current) => ({ enabled: false, resources: current?.resources ?? [] }));
          return;
        }
        const resources = (body as { resources: unknown[] }).resources.map(validResource).filter((item): item is LiveResource => item !== null);
        setResponse({ enabled: true, resources }); setOffline(false); setLastSync(Date.now());
      } catch {
        if (mounted && request === sequence) setOffline(true);
      } finally { window.clearTimeout(timeout); }
    };
    void load();
    const refresh = window.setInterval(() => { void load(); }, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const goOffline = () => setOffline(true);
    const goOnline = () => { setOffline(false); void load(); };
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
    return () => { mounted = false; controller?.abort(); window.clearInterval(refresh); window.clearInterval(clock); window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, [active]);
  const resources = useMemo(() => { const remote = new Map((response?.resources ?? []).map((resource) => [resource.id, resource])); return defaults.map((fallback) => remote.get(fallback.id) ?? fallback); }, [response]);
  const confirmed = eventActive(now) && resources.some((resource) => freshness(resource.updatedAt, now, offline, response?.enabled === true) === 'fresh');
  return { resources, enabled: response?.enabled === true, offline, now, confirmed, lastSync };
}


type Operations = ReturnType<typeof useLiveOperations>;

function liveItem(id: string, operations: Operations): FloorItem {
  const resource = operations.resources.find((item) => item.id === id)!;
  const status = freshness(resource.updatedAt, operations.now, operations.offline, operations.enabled);
  const capacity = hasOccupancySchema(resource);
  const value = status !== 'fresh' ? '확인 필요' : capacity ? resource.state === 'closed' ? stateText(resource) : resource.occupancyPercent == null ? '사용률 확인 전' : `${resource.occupancyPercent}%` : stateText(resource);
  const sub = status === 'fresh' && resource.updatedAt ? `${clockText(resource.updatedAt)} 확인` : status === 'offline' ? '연결 확인 전' : status === 'stale' ? '마지막 확인 후 10분 경과' : status === 'future' || status === 'invalid' ? '확인 시각 오류' : '현장팀 확인 전';
  const previous = resource.category === 'parking' && resource.previousDay && resource.previousDay.date >= '2026-10-05' && resource.previousDay.date < koreaDate(operations.now) ? resource.previousDay : undefined;
  const priorLabel = previous ? `${previous.date === koreaDate(operations.now - 86400000) ? '전날 ' : ''}${previous.date.slice(5).replace('-', '/')} 주차 기록` : '';
  const priorHistory = previous ? `${priorLabel} · 첫 만차 ${previous.firstFullAt ? historyClock(previous.firstFullAt) : '기록 없음'} · 마감 ${previous.closedAt ? historyClock(previous.closedAt) : '기록 없음'}` : '';
  const history = [priorHistory,resource.lastClosedAt && Date.parse(resource.lastClosedAt) >= EVENT_START && Date.parse(resource.lastClosedAt) <= operations.now ? `최근 닫힘·입장 마감 기록 ${historyTime(resource.lastClosedAt)}` : '', resource.lastFullAt && Date.parse(resource.lastFullAt) >= EVENT_START && Date.parse(resource.lastFullAt) <= operations.now ? `최근 만차·만석 기록 ${historyTime(resource.lastFullAt)}` : ''].filter(Boolean).join(' · ');
  const tone = status !== 'fresh' ? 'neutral' : capacity ? resource.state === 'closed' ? stateTone(resource.state) : resource.occupancyPercent == null ? 'neutral' : occupancyTone(resource.occupancyPercent) : stateTone(resource.state);
  return { key: id, label: resource.label, sub: history ? `${sub} · ${history}` : sub, value, tone };
}

/** Songrim's current step, only when the access value is fresh. */
// eslint-disable-next-line react-refresh/only-export-components
export function liveStage(operations: Operations): number | null {
  const access = operations.resources.find((item) => item.id === 'space.songrim.access')!;
  if (!eventActive(operations.now)) return null;
  if (freshness(access.updatedAt, operations.now, operations.offline, operations.enabled) !== 'fresh') return null;
  const order: LiveResourceState[] = ['closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed'];
  const index = order.indexOf(access.state);
  return index === -1 ? null : index;
}

export function LiveNotice({ enabled, offline, confirmed }: { enabled: boolean; offline: boolean; confirmed: boolean }) {
  if (offline) return <div className="tc-live-notice tc-live-notice--offline" role="status"><strong>연결 확인 중</strong><span>마지막 안내를 실제 현황으로 표시하지 않습니다.</span></div>;
  if (!enabled || !confirmed) return <div className="tc-live-notice" role="status"><strong>현장팀 확인 전</strong><span>아직 공개된 현장 현황이 없습니다.</span></div>;
  return <div className="tc-live-notice tc-live-notice--active"><strong>현장팀 확인 현황</strong><details><summary aria-label="현황 안내 자세히 보기">ⓘ 현황 안내</summary><p>각 항목은 마지막 확인 시각 기준입니다. 사용률은 운영자 추정이며 실측 수용률이 아닙니다. 초록 0~60% · 주황 70~90% · 빨강 100% · 회색 확인 필요</p></details></div>;
}

/** Shown on the live parking/worship panels before the real event starts: an inspection/rehearsal
 * preview, never to be mistaken for actual 특새 operating status. */
export function PreEventNotice() {
  return <div className="tc-live-notice tc-live-notice--preview" role="status"><strong>사전 점검 중</strong><span>실제 특새 운영 현황이 아닙니다. 행사 전 점검용 화면입니다.</span></div>;
}

function StatusList({ items }: { items: FloorItem[] }) {
  return <div className="tc-status-list">{items.map((item) => <StatusRow key={item.key} name={item.label} extra={item.sub} value={item.value} tone={item.tone} />)}</div>;
}

export function LiveWorshipStatus({ venue, operations }: { venue: Venue; operations: Operations }) {
  const phase = eventPhase(operations.now);
  if (phase === 'after') return <p className="tc-live-notice" role="status">{eventNotice}</p>;
  const ids = venue === 'songrim' ? ['space.songrim.access', 'space.songrim.hall', 'space.songrim.gym'] : ['space.dream.f11', 'space.dream.f7', 'space.dream.f3'];
  const items = ids.map((id) => liveItem(id, operations));
  return <>{phase === 'before' ? <PreEventNotice /> : <LiveNotice enabled={operations.enabled} offline={operations.offline} confirmed={operations.confirmed} />}{venue === 'songrim' ? <StatusList items={items} /> : <FloorStack items={items} variant="above" />}</>;
}

export function LiveParkingPanel({ venue, setVenue, operations, art }: { venue: Venue; setVenue: (venue: Venue) => void; operations: Operations; art?: ReactNode }) {
  const ids = venue === 'songrim' ? ['parking.songrim', 'parking.calvary'] : ['parking.dream.b1', 'parking.dream.b2', 'parking.dream.b3', 'parking.dream.b4', 'parking.dream.b5'];
  const items = ids.map((id) => liveItem(id, operations));
  const phase = eventPhase(operations.now);
  return (
    <section id="tc-panel-parking" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-parking">
      <PageHeading eyebrow="도착하기 전에" title="주차 안내" art={art}>예배 장소별 주차 안내를 확인하세요.</PageHeading>
      {phase === 'active' && <details className="tc-guidelines"><summary>ⓘ 주차 기록 안내</summary><p>전날 기록은 운영자 입력 이력입니다. 마감은 운영 중에서 닫힘으로 바뀐 기록이며, 오늘도 같은 시각에 마감된다는 뜻은 아닙니다.</p></details>}
      <div className="tc-section tc-section--topless">
        <VenueSwitch venue={venue} onChange={setVenue} label="주차 장소" />
        {venue === 'songrim' && <p className="tc-panel-note">갈보리교회는 예배 장소 선택지가 아닌 별도 주차 안내 구역입니다. 이용 가능 여부는 현장 안내를 확인해주세요.</p>}
        {phase === 'after' ? <p className="tc-live-notice" role="status">{eventNotice}</p> : <>
          {phase === 'before' ? <PreEventNotice /> : <LiveNotice enabled={operations.enabled} offline={operations.offline} confirmed={operations.confirmed} />}
          {venue === 'songrim' ? <StatusList items={items} /> : <FloorStack items={items} variant="below" />}
        </>}
        {venue === 'songrim' && <div className="tc-quiet"><strong>학교 출입과 예배당 입장은 달라요.</strong><p>학교 문이 열려 차량이 들어가도 본당·체육관은 아직 닫혀 있을 수 있습니다.</p></div>}
        <p className="tc-safety"><span aria-hidden="true">🚗</span> 운전 중 화면을 조작하지 마세요. 동승자가 확인하거나 안전하게 정차한 뒤 이용해주세요.</p>
      </div>
    </section>
  );
}
