import { describe, it, expect } from 'vitest';
import { formatReview, scoreWord } from './reviewBadge';

describe('formatReview (/10 presentation of a /5 source)', () => {
  it('scales the raw /5 rating to /10', () => {
    expect(formatReview({ rate: 4.4, count: 756, type: 'TRIPADVISOR', outOf: 5 })).toEqual({
      score: '8.8',                      // 4.4 / 5 → 8.8 / 10
      outOf: 10,
      fillPct: 88,
      label: 'TripAdvisor',
      count: 756,
      meta: 'TripAdvisor · 756 reviews',
      title: '8.8 / 10 on TripAdvisor from 756 reviews',
    });
  });

  it('maps the ends of the scale correctly', () => {
    expect(formatReview({ rate: 5, count: 10, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('10.0');
    expect(formatReview({ rate: 2.5, count: 10, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('5.0');
    expect(formatReview({ rate: 3.6, count: 10, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('7.2');
  });

  it('defaults the source scale to /5 when outOf is missing', () => {
    expect(formatReview({ rate: 4, count: 1, type: 'TRIPADVISOR' }).score).toBe('8.0');
  });

  it('prefers the STORED 10-point score when present', () => {
    // The DB is the source of truth: use rating10 verbatim, not a re-derivation.
    const r = formatReview({ rate: 4.3, rating10: 8.6, count: 100, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.score).toBe('8.6');
    expect(r.fillPct).toBe(86);
  });

  it('falls back to rate × 2 when no stored 10-point value is given', () => {
    expect(formatReview({ rate: 4.4, count: 1, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('8.8');
  });

  it('groups the review count with thousands separators', () => {
    const r = formatReview({ rate: 4.1, count: 12456, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.meta).toBe('TripAdvisor · 12,456 reviews');
    expect(r.title).toContain('12,456 reviews');
  });

  it('drops the count from meta/title when it is missing', () => {
    const r = formatReview({ rate: 4.2, count: 0, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.meta).toBe('TripAdvisor');
    expect(r.title).toBe('8.4 / 10 on TripAdvisor');
  });

  it('labels a non-TripAdvisor source generically', () => {
    const r = formatReview({ rate: 4, count: 5, type: 'HOTELBEDS', outOf: 5 });
    expect(r.label).toBe('Guest rating');
    expect(r.meta).toBe('Guest rating · 5 reviews');
  });

  it('clamps the fill to 0–100 even if the source returns something odd', () => {
    expect(formatReview({ rate: 9, count: 1, type: 'TRIPADVISOR', outOf: 5 }).fillPct).toBe(100);
    expect(formatReview({ rate: 9, count: 1, type: 'TRIPADVISOR', outOf: 5 }).score).toBe('10.0');
  });

  it('returns null for an unrated hotel — never a "0" badge', () => {
    expect(formatReview({ rate: 0, count: 3, type: 'TRIPADVISOR', outOf: 5 })).toBeNull();
    expect(formatReview({ rate: null, count: 3 })).toBeNull();
    expect(formatReview({ rate: 'n/a', count: 3 })).toBeNull();
    expect(formatReview(null)).toBeNull();
    expect(formatReview(undefined)).toBeNull();
    expect(formatReview({})).toBeNull();
  });
});

describe('scoreWord', () => {
  it('describes a /10 score in words', () => {
    expect(scoreWord('9.2')).toBe('Excellent');
    expect(scoreWord('8.8')).toBe('Very good');
    expect(scoreWord('7.1')).toBe('Good');
    expect(scoreWord('6.4')).toBe('Pleasant');
    expect(scoreWord('5.0')).toBe('Fair');
  });
  it('is safe on junk input', () => {
    expect(scoreWord('')).toBe('');
    expect(scoreWord(undefined)).toBe('');
  });
});
