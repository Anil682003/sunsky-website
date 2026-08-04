import { describe, it, expect } from 'vitest';
import { DURATION_BANDS, bandByLabel, bandForNights, lengthsInBand } from './durations';

describe('bandForNights', () => {
  it('puts a stay in the band whose label the home page would show', () => {
    // The whole point of sharing this: pick "6-10 days" on the home page, land on the hotel
    // detail page with nights=7, and the Duration field still reads "6-10 days".
    expect(bandForNights(7).label).toBe('6-10 days');
    expect(bandForNights(4).label).toBe('2-5 days');
    expect(bandForNights(14).label).toBe('11-16 days');
    expect(bandForNights(21).label).toBe('17-24 days');
  });

  it('covers every band boundary', () => {
    for (const b of DURATION_BANDS) {
      expect(bandForNights(b.minNights).label).toBe(b.label);
      expect(bandForNights(b.maxNights).label).toBe(b.label);
    }
  });

  it('never leaves the field with no label to show', () => {
    // Anything can arrive in the URL; the field must still render something sensible.
    expect(bandForNights(1).label).toBe('2-5 days');       // below the first band
    expect(bandForNights(400).label).toBe('25+ days');     // above the last
    for (const junk of [null, undefined, 'seven', NaN, {}]) {
      expect(bandForNights(junk).label).toBe('6-10 days'); // the default week
    }
  });
});

describe('lengthsInBand', () => {
  it('offers each exact length inside the band', () => {
    expect(lengthsInBand(bandByLabel('6-10 days'))).toEqual([6, 7, 8, 9, 10]);
    expect(lengthsInBand(bandByLabel('2-5 days'))).toEqual([2, 3, 4, 5]);
  });

  it('caps the open-ended top band instead of printing eleven buttons', () => {
    const top = lengthsInBand(bandByLabel('25+ days'));
    expect(top[0]).toBe(25);
    expect(top.length).toBeLessThanOrEqual(8);
  });

  it('always contains the band\'s own default length', () => {
    // Otherwise picking a band would highlight nothing in the exact-length row.
    for (const b of DURATION_BANDS) {
      expect(lengthsInBand(b)).toContain(b.nights);
    }
  });

  it('survives a missing band', () => {
    expect(lengthsInBand(null)).toEqual([]);
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
