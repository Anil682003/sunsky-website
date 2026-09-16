import { describe, it, expect } from 'vitest';
import { formatReview, scoreWord, scoreBand } from './reviewBadge';

describe('formatReview (/10 presentation of a /5 source)', () => {
  it('scales the raw /5 rating to /10', () => {
    expect(formatReview({ rate: 4.4, count: 756, type: 'TRIPADVISOR', outOf: 5 })).toEqual({
      score: '8.8',                      // 4.4 / 5 → 8.8 / 10
      outOf: 10,
      fillPct: 88,
      label: 'TripAdvisor',
      count: 756,
      meta: 'TripAdvisor · 756 beoordelingen',
      title: '8.8 / 10 op TripAdvisor op basis van 756 beoordelingen',
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
    expect(r.meta).toBe('TripAdvisor · 12.456 beoordelingen');
    expect(r.title).toContain('12.456 beoordelingen');
  });

  it('drops the count from meta/title when it is missing', () => {
    const r = formatReview({ rate: 4.2, count: 0, type: 'TRIPADVISOR', outOf: 5 });
    expect(r.meta).toBe('TripAdvisor');
    expect(r.title).toBe('8.4 / 10 op TripAdvisor');
  });

  it('labels a non-TripAdvisor source generically', () => {
    const r = formatReview({ rate: 4, count: 5, type: 'HOTELBEDS', outOf: 5 });
    expect(r.label).toBe('Gastenbeoordeling');
    expect(r.meta).toBe('Gastenbeoordeling · 5 beoordelingen');
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
    expect(scoreWord('9.2')).toBe('Uitstekend');
    expect(scoreWord('8.8')).toBe('Zeer goed');
    expect(scoreWord('7.1')).toBe('Goed');
    expect(scoreWord('6.4')).toBe('Prima');
    expect(scoreWord('5.0')).toBe('Redelijk');
  });
  it('is safe on junk input', () => {
    expect(scoreWord('')).toBe('');
    expect(scoreWord(undefined)).toBe('');
  });
});

describe('scoreBand', () => {
  it('never celebrates a middling score the way it celebrates a great one', () => {
    // The whole point of banding: these two must not render identically.
    expect(scoreBand('9.4')).toBe('high');
    expect(scoreBand('6.4')).toBe('mid');
    expect(scoreBand('9.4')).not.toBe(scoreBand('6.4'));
  });

  it('agrees with the word at every boundary', () => {
    // A green badge reading "Redelijk" would be a contradiction on screen. Matched on the
    // BAND rather than on the Dutch word, so this keeps testing the agreement itself and not
    // the translation — it would still hold if the wording were reworded tomorrow.
    const pairs = [['9.0', 'high'], ['8.0', 'high'], ['7.9', 'mid'], ['6.0', 'mid'], ['5.9', 'low']];
    for (const [score, expected] of pairs) {
      expect(scoreWord(score)).not.toBe('');   // every banded score is worded
      expect(scoreBand(score)).toBe(expected);
    }
  });

  it('falls back to the neutral band on junk rather than to green', () => {
    for (const bad of ['', null, undefined, 'abc']) expect(scoreBand(bad)).toBe('mid');
  });
});
