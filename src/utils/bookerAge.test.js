// The main booker must be 18 on the day of booking (Levent, 24 Nov 2026).
import { describe, it, expect } from 'vitest';
import { ageOn, bookerUnderage } from './bookerAge';

describe('bookerUnderage', () => {
  it('18 today books; 17 does not; a missing or bad date is left to the required rule', () => {
    expect(bookerUnderage('2008-11-24', '2026-11-24')).toBe(false);
    expect(bookerUnderage('2008-11-25', '2026-11-24')).toBe(true);
    expect(bookerUnderage('1990-01-01', '2026-11-24')).toBe(false);
    expect(bookerUnderage('', '2026-11-24')).toBe(false);
    expect(ageOn('2030-01-01', '2026-11-24')).toBeNull();
  });
});
