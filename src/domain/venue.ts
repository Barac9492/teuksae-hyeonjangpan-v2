import type { VenueState, VenueStatus } from './types';

export const STALE_MINUTES = 10;
const STALE_MS = STALE_MINUTES * 60 * 1000;

export interface VenuePresentation {
  effectiveState: VenueState;
  stale: boolean;
}

export const VENUE_STATE_LABELS: Record<VenueState, string> = {
  preparing: '준비 중',
  open: '입장 가능',
  recommended: '여유 있음',
  busy: '혼잡',
  full: '입장 마감',
  checking: '확인 중',
};

export function isVenueStale(updatedAtIso: string, now: Date = new Date()): boolean {
  const updated = Date.parse(updatedAtIso);
  if (Number.isNaN(updated)) {
    return true;
  }
  return now.getTime() - updated > STALE_MS;
}

export function deriveVenuePresentation(
  venue: VenueStatus,
  now: Date = new Date(),
): VenuePresentation {
  const stale = isVenueStale(venue.updatedAt, now);
  if (stale) {
    return { effectiveState: 'checking', stale: true };
  }
  return { effectiveState: venue.state, stale: false };
}

export function formatUpdatedLabel(updatedAtIso: string): string {
  const date = new Date(updatedAtIso);
  if (Number.isNaN(date.getTime())) {
    return '시간 확인 필요';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
