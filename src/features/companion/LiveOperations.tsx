import { foregroundPolling } from './polling';
import { useRuntime } from '../rehearsal/runtime';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FloorStack } from './worship';
import type { FloorItem } from './worship';
import { PageHeading, StatusRow, VenueSwitch } from './ui';
import type { ValueTone, Venue } from './ui';
import { ParkingNotice } from './EventNotice';
import { noticeServiceDay } from './officialNotice';

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
type LiveResource = { id: string; label: string; category: Category; state: LiveResourceState; version: number; updatedAt: string | null; occupancyPercent?: number | null; guideFloor?: number | null; lastClosedAt?: string | null; lastFullAt?: string | null; previousDay?: ParkingDay };
type StatusResponse = { enabled: boolean; resources: LiveResource[] };
type Freshness = 'fresh' | 'unconfirmed' | 'stale' | 'invalid' | 'future' | 'offline';

// All-date rehearsal availability: no calendar/event-window gate hides features. The real event
// schedule stays accurate elsewhere (e.g. countdown/calendar exports outside this file); this
// file only decides what is safe to show as a *current* reading, using finite/not-future
// timestamp safety, independent of the official event dates.
const REFRESH_MS = 20_000;
const FRESH_MS = 10 * 60_000;
const defaults: LiveResource[] = [
  { id: 'space.songrim.access', label: '학교 출입', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.songrim.hall', label: '본당 1·2층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.songrim.gym', label: '체육관', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f3', label: '3층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f7', label: '7층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'space.dream.f11', label: '11층', category: 'space', state: 'checking', version: 0, updatedAt: null },
  { id: 'parking.songrim', label: '송림주차장', category: 'parking', state: 'checking', version: 0, updatedAt: null },
  { id: 'parking.dream', label: '드림센터 주차장', category: 'parking', state: 'checking', version: 0, updatedAt: null, guideFloor: null },
];
const byId = new Map(defaults.map((resource) => [resource.id, resource]));
const normalStates = new Set<LiveResourceState>(['checking', 'closed', 'available', 'busy', 'full']);
const accessStates = new Set<LiveResourceState>(['checking', 'closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed']);
const hasOccupancySchema = (resource: LiveResource) => resource.id !== 'parking.dream' && resource.id !== 'space.songrim.access' && Object.prototype.hasOwnProperty.call(resource, 'occupancyPercent');
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
  if (raw.id === 'parking.dream') {
    if (raw.occupancyPercent != null || (raw.state === 'available' ? !Number.isInteger(raw.guideFloor) || Number(raw.guideFloor) < 1 || Number(raw.guideFloor) > 5 : !['checking','closed','full'].includes(raw.state as string) || raw.guideFloor != null)) return null;
  }
  return { ...fallback, guideFloor: raw.guideFloor as number | null, previousDay: parkingDay(raw.previousDay), ...(Object.prototype.hasOwnProperty.call(raw, 'occupancyPercent') ? { occupancyPercent: raw.occupancyPercent as number | null } : {}), lastClosedAt: raw.lastClosedAt as string | null | undefined, lastFullAt: raw.lastFullAt as string | null | undefined, state: raw.state as LiveResourceState, version: raw.version as number, updatedAt: raw.updatedAt as string | null };
}

function freshness(updatedAt: string | null, now: number, offline: boolean, enabled: boolean): Freshness {
  if (offline) return 'offline';
  if (!enabled || !updatedAt) return 'unconfirmed';
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return 'invalid';
  if (time > now) return 'future';
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

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveOperations(active = true) {
  const runtime = useRuntime();
  const [response, setResponse] = useState<StatusResponse | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState<number | null>(null);
  useEffect(() => {
    if (!active || runtime.managed) return undefined;
    const polling = foregroundPolling(async signal => {
      try {
        const result = await fetch('/api/status', { cache: 'no-store', headers: { accept: 'application/json' }, signal });
        const body = await result.json().catch(() => null) as unknown;
        if (signal.aborted) return;
        setNow(Date.now());
        if (!result.ok || !body || typeof body !== 'object' || (body as { enabled?: unknown }).enabled !== true || !Array.isArray((body as { resources?: unknown }).resources)) { setResponse(current => ({ enabled: false, resources: current?.resources ?? [] })); return; }
        const resources = (body as { resources: unknown[] }).resources.map(validResource).filter((item): item is LiveResource => item !== null);
        setResponse({ enabled: true, resources }); setOffline(false); setLastSync(Date.now());
      } catch { if (!signal.aborted || signal.reason?.message === 'timeout') setOffline(true); }
    }, REFRESH_MS, () => setOffline(true));
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { polling.stop(); window.clearInterval(clock); };
  }, [active, runtime.managed]);
  useEffect(() => {
    if (!runtime.managed) return;
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, [runtime.managed]);
  const effectiveResponse = useMemo(() => runtime.managed ? { enabled: runtime.status?.enabled === true, resources: (runtime.status?.resources ?? []).map(validResource).filter((r): r is LiveResource => r !== null) } : response, [runtime.managed, runtime.status, response]);
  const effectiveOffline = runtime.managed ? runtime.offline : offline;
  const resources = useMemo(() => { const remote = new Map((effectiveResponse?.resources ?? []).map((resource) => [resource.id, resource])); return defaults.map((fallback) => remote.get(fallback.id) ?? fallback); }, [effectiveResponse]);
  const effectiveNow = runtime.managed ? Math.max(now, runtime.lastSync ?? now) : now;
  const confirmed = resources.some((resource) => freshness(resource.updatedAt, effectiveNow, effectiveOffline, effectiveResponse?.enabled === true) === 'fresh');
  return { resources, enabled: effectiveResponse?.enabled === true, offline: effectiveOffline, now: effectiveNow, confirmed, lastSync: runtime.managed ? runtime.lastSync : lastSync, rehearsal: runtime.rehearsal };
}


type Operations = Omit<ReturnType<typeof useLiveOperations>, 'rehearsal'> & { rehearsal?: boolean };

function hasFreshDisplayedResource(ids: string[], operations: Operations): boolean {
  return operations.resources.some(resource => ids.includes(resource.id)
    && freshness(resource.updatedAt, operations.now, operations.offline, operations.enabled) === 'fresh');
}

function liveItem(id: string, operations: Operations): FloorItem {
  const resource = (operations.resources.find((item) => item.id === id) ?? byId.get(id)!);
  const status = freshness(resource.updatedAt, operations.now, operations.offline, operations.enabled);
  const capacity = hasOccupancySchema(resource);
  const value = status !== 'fresh' ? '확인 필요' : resource.id === 'parking.dream' ? resource.state === 'available' && resource.guideFloor != null ? `B${resource.guideFloor}층으로 안내 중` : resource.state === 'full' ? '전체 만차' : stateText(resource) : capacity ? resource.state === 'closed' ? stateText(resource) : resource.occupancyPercent == null ? '사용률 확인 전' : `${resource.occupancyPercent}% · ${stateText(resource)}` : stateText(resource);
  const tone = status !== 'fresh' ? 'neutral' : capacity ? resource.state === 'closed' ? stateTone(resource.state) : resource.occupancyPercent == null ? 'neutral' : occupancyTone(resource.occupancyPercent) : stateTone(resource.state);
  return { key: id, label: resource.label, value, tone };
}

/** Songrim's current step, only when the access value is fresh. */
// eslint-disable-next-line react-refresh/only-export-components
export function liveStage(operations: Operations): number | null {
  const access = operations.resources.find((item) => item.id === 'space.songrim.access')!;
  if (freshness(access.updatedAt, operations.now, operations.offline, operations.enabled) !== 'fresh') return null;
  const order: LiveResourceState[] = ['closed', 'school_open', 'gym_open', 'hall_open', 'hall_closed'];
  const index = order.indexOf(access.state);
  return index === -1 ? null : index;
}

export function LiveNotice({ enabled, offline, confirmed, guidance = false }: { enabled: boolean; offline: boolean; confirmed: boolean; guidance?: boolean }) {
  if (offline) return <div className="tc-live-notice tc-live-notice--offline" role="status"><strong>연결 확인 중</strong><span>마지막 안내를 실제 현황으로 표시하지 않습니다.</span></div>;
  if (!enabled || !confirmed) return <div className="tc-live-notice" role="status"><strong>현장팀 확인 전</strong><span>현재 표시된 장소에 최근 확인된 현황이 없습니다.</span></div>;
  return <div className="tc-live-notice tc-live-notice--active"><strong>현장팀 확인 현황</strong><details><summary aria-label="현황 안내 자세히 보기">ⓘ 현황 안내</summary><p>{guidance ? '현재 안내 층과 전체 만차 여부는 현장 주차팀이 직접 확인한 정보입니다. 주차 여유 대수나 자동 감지 결과가 아닙니다.' : '최근 10분 안에 현장팀이 확인한 항목만 현재 현황으로 표시합니다. 사용률은 운영자 추정이며 실측 수용률이 아닙니다. 초록 0~60% · 주황 70~90% · 빨강 100% · 회색 확인 필요'}</p></details></div>;
}

function StatusList({ items }: { items: FloorItem[] }) {
  return <div className="tc-status-list">{items.map((item) => <StatusRow key={item.key} name={item.label} extra={item.sub} value={item.value} tone={item.tone} />)}</div>;
}

export function LiveWorshipStatus({ venue, operations }: { venue: Venue; operations: Operations }) {
  const ids = venue === 'songrim' ? ['space.songrim.access', 'space.songrim.hall', 'space.songrim.gym'] : ['space.dream.f11', 'space.dream.f7', 'space.dream.f3'];
  const items = ids.map((id) => liveItem(id, operations));
  return <><LiveNotice enabled={operations.enabled} offline={operations.offline} confirmed={hasFreshDisplayedResource(ids, operations)} />{venue === 'songrim' ? <StatusList items={items} /> : <FloorStack items={items} variant="above" />}</>;
}

export function LiveParkingPanel({ venue, setVenue, operations, art }: { venue: Venue; setVenue: (venue: Venue) => void; operations: Operations; art?: ReactNode }) {
  const ids = venue === 'songrim' ? ['parking.songrim'] : ['parking.dream'];
  const items = ids.map((id) => liveItem(id, operations));
  return (
    <section id="tc-panel-parking" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-parking">
      <PageHeading eyebrow="도착하기 전에" title="주차 안내" art={art}>예배 장소별 주차 안내를 확인하세요.</PageHeading>
      <div className="tc-section tc-section--topless">
        <VenueSwitch venue={venue} onChange={setVenue} label="주차 장소" />
        <ParkingNotice venue={venue} day={noticeServiceDay(operations.now)} />
        <p className="tc-panel-note">현장 주차팀이 저장한 안내입니다. 화면이 열려 있으면 20초마다 자동 확인하며, 앱으로 돌아오거나 연결이 복구되면 바로 확인합니다. 마지막 현장 확인이 10분을 넘으면 확인 필요로 표시합니다.</p>
        {venue === 'dream' && <p className="tc-panel-note">드림센터 전체를 하나의 주차장으로 안내합니다. 표시된 층은 주차팀이 현재 안내하는 층입니다. 층이 차면 담당자가 안내 층을 변경합니다. 실제 이동은 현장 안내를 따라주세요.</p>}
        <LiveNotice guidance={venue === 'dream'} enabled={operations.enabled} offline={operations.offline} confirmed={hasFreshDisplayedResource(ids, operations)} />
        <StatusList items={items} />
        {venue === 'songrim' && <div className="tc-quiet"><strong>학교 출입과 예배당 입장은 달라요.</strong><p>학교 문이 열려 차량이 들어가도 본당·체육관은 아직 닫혀 있을 수 있습니다.</p></div>}
        <p className="tc-panel-note">실제와 조금 차이가 있을 수 있습니다.</p>
        <p className="tc-safety"><span aria-hidden="true">🚗</span> 운전 중 화면을 조작하지 마세요. 동승자가 확인하거나 안전하게 정차한 뒤 이용해주세요.</p>
      </div>
    </section>
  );
}
