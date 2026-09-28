import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  dobToParts, partsToDob, daysInMonth, validateDob, allDobsValid, DOB_ERROR,
} from './childDob';

// The date of birth decides how a passenger is classified and priced, so "looks like a date"
// is not good enough. These are the checks the specification lists, one test each.

afterEach(() => { vi.useRealTimers(); });

describe('splitting and assembling', () => {
  it('round-trips a date through its three fields', () => {
    expect(dobToParts('2018-08-14')).toEqual({ day: 14, month: 8, year: 2018 });
    expect(partsToDob({ day: 14, month: 8, year: 2018 })).toBe('2018-08-14');
  });

  it('pads single digits, so the ISO string is always the same shape', () => {
    expect(partsToDob({ day: 5, month: 3, year: 2021 })).toBe('2021-03-05');
  });

  it('gives back empty parts for anything unusable', () => {
    for (const junk of ['', null, undefined, 'yesterday', '14/08/2018', '2018-8-14']) {
      expect(dobToParts(junk)).toEqual({ day: '', month: '', year: '' });
    }
  });

  // Half-entered is the normal state of a three-field control, not an error.
  it('yields nothing while a part is still missing', () => {
    expect(partsToDob({ day: 14, month: 8 })).toBe('');
    expect(partsToDob({ month: 8, year: 2018 })).toBe('');
    expect(partsToDob({})).toBe('');
    expect(partsToDob()).toBe('');
  });
});

describe('the day list follows the month', () => {
  it('knows the short months', () => {
    expect(daysInMonth(1, 2021)).toBe(31);
    expect(daysInMonth(4, 2021)).toBe(30);
    expect(daysInMonth(2, 2021)).toBe(28);
  });

  it('knows leap years', () => {
    expect(daysInMonth(2, 2020)).toBe(29);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2, 1900)).toBe(28);   // divisible by 100, not by 400
  });

  // February with no year yet still has to offer the 29th, or someone born on it cannot
  // pick their own birthday until they have chosen the year first.
  it('allows 29 February before a year has been picked', () => {
    expect(daysInMonth(2, '')).toBe(29);
  });

  it('falls back to 31 with no month at all, rather than hiding days', () => {
    expect(daysInMonth('', '')).toBe(31);
  });
});

describe('validation', () => {
  it('accepts a real date and reports the age at the travel date, not today', () => {
    const r = validateDob('2018-08-14', { travelDate: '2026-08-13' });
    expect(r.ok).toBe(true);
    expect(r.age).toBe(7);          // turns 8 the day after travel
    expect(validateDob('2018-08-14', { travelDate: '2026-08-14' }).age).toBe(8);
  });

  it('rejects an incomplete date', () => {
    expect(validateDob('')).toEqual({ ok: false, code: DOB_ERROR.INCOMPLETE });
    expect(validateDob(null)).toEqual({ ok: false, code: DOB_ERROR.INCOMPLETE });
  });

  // A Date built from an impossible day rolls over silently: 2018-02-31 becomes 3 March.
  // Without the round-trip check this would validate, and the passenger record would carry a
  // birthday nobody entered.
  it('rejects a date that does not exist', () => {
    expect(validateDob('2018-02-31').code).toBe(DOB_ERROR.IMPOSSIBLE);
    expect(validateDob('2021-02-29').code).toBe(DOB_ERROR.IMPOSSIBLE);
    expect(validateDob('2018-04-31').code).toBe(DOB_ERROR.IMPOSSIBLE);
    expect(validateDob('2018-13-01').code).toBe(DOB_ERROR.IMPOSSIBLE);
  });

  it('accepts 29 February in a leap year', () => {
    expect(validateDob('2020-02-29', { travelDate: '2026-06-01' }).ok).toBe(true);
  });

  it('rejects a birthday in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00'));
    expect(validateDob('2026-09-29').code).toBe(DOB_ERROR.FUTURE);
    expect(validateDob('2030-01-01').code).toBe(DOB_ERROR.FUTURE);
    // Today itself is a real birthday, if a very new one.
    expect(validateDob('2026-09-28', { travelDate: '2026-12-01' }).ok).toBe(true);
  });
});

describe('the gate on Save Changes', () => {
  const travel = '2026-10-10';

  it('passes when every child in every room has a usable date', () => {
    expect(allDobsValid([
      { adults: 2, children: 1, dobs: ['2018-08-14'] },
      { adults: 2, children: 2, dobs: ['2015-01-02', '2019-11-30'] },
    ], travel)).toBe(true);
  });

  it('fails on a single missing date, wherever it is', () => {
    expect(allDobsValid([
      { adults: 2, children: 1, dobs: ['2018-08-14'] },
      { adults: 2, children: 1, dobs: [''] },
    ], travel)).toBe(false);
  });

  it('fails on an impossible date', () => {
    expect(allDobsValid([{ adults: 2, children: 1, dobs: ['2018-02-31'] }], travel)).toBe(false);
  });

  it('ignores dates left over from children who have since been removed', () => {
    // Dropping a child from 2 to 1 leaves the second date in the array. It belongs to nobody,
    // so it must not be able to block the save.
    expect(allDobsValid([{ adults: 2, children: 1, dobs: ['2018-08-14', ''] }], travel)).toBe(true);
  });

  it('passes a room with no children at all', () => {
    expect(allDobsValid([{ adults: 2, children: 0, dobs: [] }], travel)).toBe(true);
    expect(allDobsValid([], travel)).toBe(true);
  });
});
