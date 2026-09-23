import { describe, expect, it } from 'vitest';
import { STALE_MINUTES, deriveVenuePresentation, isVenueStale } from '../domain/venue';
import type { VenueStatus } from '../domain/types';

const baseVenue: VenueStatus = {
  id: 'dream',
  name: '드림센터',
  state: 'open',
  description: '테스트',
  updatedAt: '2026-08-24T00:00:00.000Z',
  updatedBy: '담당자',
};

describe('venue stale presentation', () => {
  it('marks stale venue as checking after 10 minutes', () => {
    const now = new Date('2026-08-24T00:11:00.000Z');
    const result = deriveVenuePresentation(baseVenue, now);

    expect(result.stale).toBe(true);
    expect(result.effectiveState).toBe('checking');
  });

  it('keeps current state within freshness window', () => {
    const venue: VenueStatus = {
      ...baseVenue,
      id: 'gym',
      name: '체육관',
      state: 'recommended',
      updatedAt: '2026-08-24T00:05:30.000Z',
    };

    const now = new Date('2026-08-24T00:10:00.000Z');
    expect(isVenueStale(venue.updatedAt, now)).toBe(false);
    expect(deriveVenuePresentation(venue, now).effectiveState).toBe('recommended');
  });

  it('treats invalid timestamp as stale and shows checking', () => {
    const venue: VenueStatus = {
      ...baseVenue,
      updatedAt: 'not-a-valid-timestamp',
    };

    expect(isVenueStale(venue.updatedAt)).toBe(true);
    expect(deriveVenuePresentation(venue).effectiveState).toBe('checking');
  });

  it('is fresh exactly at the stale boundary', () => {
    const updatedAt = '2026-08-24T00:00:00.000Z';
    const exactlyAtBoundary = new Date(
      Date.parse(updatedAt) + STALE_MINUTES * 60 * 1000,
    );

    expect(isVenueStale(updatedAt, exactlyAtBoundary)).toBe(false);
    expect(deriveVenuePresentation({ ...baseVenue, updatedAt }, exactlyAtBoundary).stale).toBe(
      false,
    );
  });

  it('is stale one millisecond past the stale boundary', () => {
    const updatedAt = '2026-08-24T00:00:00.000Z';
    const justPastBoundary = new Date(
      Date.parse(updatedAt) + STALE_MINUTES * 60 * 1000 + 1,
    );

    expect(isVenueStale(updatedAt, justPastBoundary)).toBe(true);
    expect(deriveVenuePresentation({ ...baseVenue, updatedAt }, justPastBoundary).effectiveState).toBe(
      'checking',
    );
  });
});
