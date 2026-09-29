import { handlePublicStatus } from '../server/admin-auth.js';
import { isRehearsal } from '../server/runtime.js';

export const EVENT_START = Date.parse('2026-10-05T00:00:00+09:00');
export const EVENT_END = Date.parse('2026-10-11T00:00:00+09:00');

function eventTimestamp(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= EVENT_START && time < EVENT_END;
}

function eventParkingDay(value) {
  if (!value || typeof value !== 'object' || typeof value.date !== 'string' || value.date < '2026-10-05' || value.date > '2026-10-10') return undefined;
  return {
    ...value,
    firstFullAt: eventTimestamp(value.firstFullAt) ? value.firstFullAt : null,
    closedAt: eventTimestamp(value.closedAt) ? value.closedAt : null,
  };
}

export function filterEventResources(resources) {
  if (!Array.isArray(resources)) return [];
  return resources.map((resource) => {
    if (!resource || typeof resource !== 'object') return resource;
    const current = eventTimestamp(resource.updatedAt);
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

export function filterPublicStatus(body) {
  if (!body || typeof body !== 'object' || body.enabled !== true) return body;
  return { ...body, resources: filterEventResources(body.resources) };
}

export async function handleStatus(req, res, env = process.env, fetcher = fetch, now = Date.now()) {
  const boundary = {
    get statusCode() { return res.statusCode; },
    set statusCode(value) { res.statusCode = value; },
    setHeader(name, value) { return res.setHeader(name, value); },
    end(payload) {
      if (res.statusCode !== 200) return res.end(payload);
      try {
        const data = JSON.parse(String(payload));
        return res.end(JSON.stringify(isRehearsal(env, now) ? data : filterPublicStatus(data)));
      }
      catch { res.statusCode = 503; return res.end(JSON.stringify({ enabled: false })); }
    },
  };
  return handlePublicStatus(req, boundary, env, fetcher, now);
}

export default function handler(req, res) { return handleStatus(req, res); }
