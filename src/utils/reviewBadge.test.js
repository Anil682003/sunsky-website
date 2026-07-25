import { describe, it, expect } from 'vitest';
import { formatReview } from './reviewBadge';

describe('formatReview', () => {
  it('builds the badge values from a normal rating', () => {
    expect(formatReview({ rate: 4.4, count: 756, type: 'TRIPADVISOR', outOf: 5 })).toEqual({
      score: '4.4',
      fillPct: 88,                       // 4.4 / 5
      label: 'TripAdvisor',
      meta: 'TripAdvisor · 756 reviews',
      title: '4.4 of 5 on TripAdvisor from 756 reviews',
    });
  });

  it('groups the review count with thousands separators', () => {
    const r = formatReview({ rate: 4.1, count: 12456, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.meta).toBe('TripAdvisor · 12,456 reviews');
    expect(r.title).toContain('12,456 reviews');
  });

  it('always shows one decimal place in the score', () => {
    expect(formatReview({ rate: 5, count: 10, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('5.0');
    expect(formatReview({ rate: 3.25, count: 10, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('3.3');
  });

  it('drops the count from meta and title when it is missing', () => {
    const r = formatReview({ rate: 4.2, count: 0, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.meta).toBe('TripAdvisor');
    expect(r.title).toBe('4.2 of 5 on TripAdvisor');
  });

  it('labels a non-TripAdvisor source generically', () => {
    const r = formatReview({ rate: 4, count: 5, type: 'HOTELBEDS', outOf: 5 });
    expect(r.label).toBe('Guest rating');
    expect(r.meta).toBe('Guest rating · 5 reviews');
  });

  it('clamps the fill to 0–100 even if the API returns something odd', () => {
    expect(formatReview({ rate: 9, count: 1, type: 'TRIPADVISOR', outOf: 5 }).fillPct).toBe(100);
  });

  it('honours a non-5 scale if one is ever sent', () => {
    // Defensive: TripAdvisor is /5 today, but the maths should follow outOf.
    expect(formatReview({ rate: 5, count: 1, type: 'X', outOf: 10 }).fillPct).toBe(50);
  });

  it('defaults the scale to 5 when outOf is absent or invalid', () => {
    expect(formatReview({ rate: 4, count: 1, type: 'TRIPADVISOR' }).fillPct).toBe(80);
    expect(formatReview({ rate: 4, count: 1, type: 'TRIPADVISOR', outOf: 0 }).fillPct).toBe(80);
  });

  it('returns null for an unrated hotel — never a "0 stars" badge', () => {
    expect(formatReview({ rate: 0, count: 3, type: 'TRIPADVISOR', outOf: 5 })).toBeNull();
    expect(formatReview({ rate: null, count: 3 })).toBeNull();
    expect(formatReview({ rate: 'n/a', count: 3 })).toBeNull();
    expect(formatReview(null)).toBeNull();
    expect(formatReview(undefined)).toBeNull();
    expect(formatReview({})).toBeNull();
  });
});
