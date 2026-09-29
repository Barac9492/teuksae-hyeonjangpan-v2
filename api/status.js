import { handlePublicStatus } from '../server/admin-auth.js';

export const EVENT_START = Date.parse('2026-10-05T00:00:00+09:00');
export const EVENT_END = Date.parse('2026-10-11T00:00:00+09:00');
// Preopening: rehearsal parking/status readings become publicly visible from this instant,
// but only as long as the live event window has not started yet (see currentTimestamp below).
export const PREOPEN_START = Date.parse('2026-09-29T00:00:00+09:00');

function eventTimestamp(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= EVENT_START && time < EVENT_END;
}

// Governs only the live current-state fields (state/updatedAt/occupancyPercent).
// Before the event starts, a fresh preopening rehearsal reading (Sep29 KST or later, not in
// the future relative to `now`) is treated as current. Once the event starts, this reverts to
// the original strict event-window check so rehearsal readings never carry into the event.
function currentTimestamp(value, now) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (now >= EVENT_START) return time >= EVENT_START && time < EVENT_END;
  return time >= PREOPEN_START && time <= now;
}

function eventParkingDay(value) {
  if (!value || typeof value !== 'object' || typeof value.date !== 'string' || value.date < '2026-10-05' || value.date > '2026-10-10') return undefined;
  return {
    ...value,
    firstFullAt: eventTimestamp(value.firstFullAt) ? value.firstFullAt : null,
    closedAt: eventTimestamp(value.closedAt) ? value.closedAt : null,
  };
}

export function filterEventResources(resources, now = Date.now()) {
  if (!Array.isArray(resources)) return [];
  return resources.map((resource) => {
    if (!resource || typeof resource !== 'object') return resource;
    // Pre-event history (lastClosedAt/lastFullAt/previousDay) intentionally stays on the
    // original strict event-only window; only the live current reading gets the preopening relief.
    const current = currentTimestamp(resource.updatedAt, now);
    const filtered = {
      ...resource,
      state: current ? resource.state : 'checking',
      updatedAt: current ? resource.updatedAt : null,
      lastClosedAt: eventTimestamp(resource.lastClosedAt) ? resource.lastClosedAt : null,
      lastFullAt: eventTimestamp(resource.lastFullAt) ? resource.lastFullAt : null,
    };
    if (Object.prototype.hasOwnProperty.call(resource, 'occupancyPercent')) filtered.occupancyPercent = current ? resource.occupancyPercent : null;
    const previousDay = eventParkingDay(resource.previousDay);
    if (previousDay) filtered.previousDay = previousDay;
    else delete filtered.previousDay;
    return filtered;
  });
}

export function filterPublicStatus(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || body.enabled !== true) return body;
  return { ...body, resources: filterEventResources(body.resources, now) };
}

export async function handleStatus(req, res, env = process.env, fetcher = fetch, now = Date.now()) {
  const boundary = {
    get statusCode() { return res.statusCode; },
    set statusCode(value) { res.statusCode = value; },
    setHeader(name, value) { return res.setHeader(name, value); },
    end(payload) {
      if (res.statusCode !== 200) return res.end(payload);
      try { return res.end(JSON.stringify(filterPublicStatus(JSON.parse(String(payload)), now))); }
      catch { res.statusCode = 503; return res.end(JSON.stringify({ enabled: false })); }
    },
  };
  return handlePublicStatus(req, boundary, env, fetcher);
}

export default function handler(req, res) { return handleStatus(req, res); }
