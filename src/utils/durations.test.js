import { describe, it, expect } from 'vitest';
import {
  DURATION_BANDS, bandByLabel, bandForNights, daysInBand, daysToNights, nightsToDays,
} from './durations';

describe('daysToNights / nightsToDays', () => {
  it('treats N days as N-1 nights (arrive day 1, leave day N)', () => {
    expect(daysToNights(7)).toBe(6);   // "7 days" is a 6-night stay
    expect(daysToNights(2)).toBe(1);
    expect(nightsToDays(6)).toBe(7);
    expect(nightsToDays(1)).toBe(2);
  });
  it('never goes below one night', () => {
    expect(daysToNights(1)).toBe(1);
    expect(daysToNights(0)).toBe(1);
  });
  it('round-trips', () => {
    for (const d of [2, 5, 7, 14, 28]) expect(nightsToDays(daysToNights(d))).toBe(d);
  });
});

describe('bandForNights', () => {
  it('puts a stay in the band whose label the home page would show (matched on days = nights+1)', () => {
    // Pick "6-10 days" on the home page → land on detail with nights=6, field still reads "6-10 days".
    expect(bandForNights(6).label).toBe('6-10 days');   // 7 days
    expect(bandForNights(3).label).toBe('2-5 days');    // 4 days
    expect(bandForNights(13).label).toBe('11-16 days'); // 14 days
    expect(bandForNights(20).label).toBe('17-24 days'); // 21 days
  });

  it('covers every band boundary (in nights)', () => {
    for (const b of DURATION_BANDS) {
      expect(bandForNights(daysToNights(b.minDays)).label).toBe(b.label);
      expect(bandForNights(daysToNights(b.maxDays)).label).toBe(b.label);
    }
  });

  it('never leaves the field with no label to show', () => {
    expect(bandForNights(1).label).toBe('2-5 days');       // 2 days — first band
    expect(bandForNights(400).label).toBe('25+ days');     // above the last
    for (const junk of [null, undefined, 'seven', NaN, {}]) {
      expect(bandForNights(junk).label).toBe('6-10 days'); // the default week
    }
  });
});

describe('daysInBand', () => {
  it('offers each exact DAY length inside the band', () => {
    expect(daysInBand(bandByLabel('6-10 days'))).toEqual([6, 7, 8, 9, 10]);
    expect(daysInBand(bandByLabel('2-5 days'))).toEqual([2, 3, 4, 5]);
  });

  it('caps the open-ended top band instead of printing eleven buttons', () => {
    const top = daysInBand(bandByLabel('25+ days'));
    expect(top[0]).toBe(25);
    expect(top.length).toBeLessThanOrEqual(8);
  });

  it('always contains the band\'s own representative length', () => {
    for (const b of DURATION_BANDS) {
      expect(daysInBand(b)).toContain(b.days);
    }
  });

  it('survives a missing band', () => {
    expect(daysInBand(null)).toEqual([]);
  });
});

describe('bandByLabel', () => {
  it('round-trips every label', () => {
    for (const b of DURATION_BANDS) expect(bandByLabel(b.label)).toEqual(b);
  });
  it('falls back to the week band on an unknown label', () => {
    expect(bandByLabel('nonsense').label).toBe('6-10 days');
  });
});
