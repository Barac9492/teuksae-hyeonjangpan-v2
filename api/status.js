import { handlePublicStatus } from '../server/admin-auth.js';

// Actual official event schedule (Oct5-Oct10 KST). All-date rehearsal availability: this is no
// longer used to gate visibility of live status, history, or parking-day records below — it is
// kept only as the truthful schedule reference for any caller that needs the real event dates
// (e.g. countdown/calendar display elsewhere), so schedule-accurate surfaces are not affected by
// removing the eligibility gates in this file.
export const EVENT_START = Date.parse('2026-10-05T00:00:00+09:00');
export const EVENT_END = Date.parse('2026-10-11T00:00:00+09:00');

// A record is safe to surface if it is a finite timestamp that is not in the future relative to
// `now`. This is the only eligibility rule left: no calendar/event-window restriction, so any
// real recorded reading remains usable regardless of date. Future-timestamp and malformed-value
// safety, and offline/staleness handling (elsewhere, client-side), are unaffected.
function validTimestamp(value, now) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now;
}

function eventParkingDay(value, now) {
  if (!value || typeof value !== 'object' || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return undefined;
  return {
    ...value,
    firstFullAt: validTimestamp(value.firstFullAt, now) ? value.firstFullAt : null,
    closedAt: validTimestamp(value.closedAt, now) ? value.closedAt : null,
  };
}

export function filterEventResources(resources, now = Date.now()) {
  if (!Array.isArray(resources)) return [];
  return resources.map((resource) => {
    if (!resource || typeof resource !== 'object') return resource;
    // No calendar eligibility gate: any finite, not-in-the-future reading is current, and any
    // finite, not-in-the-future history timestamp is kept, regardless of the official event dates.
    const current = validTimestamp(resource.updatedAt, now);
    const filtered = {
      ...resource,
      state: current ? resource.state : 'checking',
      updatedAt: current ? resource.updatedAt : null,
      lastClosedAt: validTimestamp(resource.lastClosedAt, now) ? resource.lastClosedAt : null,
      lastFullAt: validTimestamp(resource.lastFullAt, now) ? resource.lastFullAt : null,
    };
    if (Object.prototype.hasOwnProperty.call(resource, 'occupancyPercent')) filtered.occupancyPercent = current ? resource.occupancyPercent : null;
    const previousDay = eventParkingDay(resource.previousDay, now);
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
  return handlePublicStatus(req, boundary, env, fetcher, now);
}

export default function handler(req, res) { return handleStatus(req, res); }
