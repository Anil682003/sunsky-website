import { describe, it, expect } from 'vitest';
import { packagePerPerson } from './packageCardPrice';

// BRU → AYT, 3 Nov 2026, as GET /package-fares answers on production.
describe('packagePerPerson', () => {
  it('adds the party flight once: 2 adults + 2 children', () => {
    // hotel €1000 + flight €443.96 (4 seats) = €1444 → €361 per person, not €1000 + €887.92
    expect(packagePerPerson(1000, 443.96, 4)).toBe(361);
  });

  it('2 adults, unchanged', () => {
    expect(packagePerPerson(1000, 221.98, 2)).toBe(611);   // ⌈1221.98⌉ = 1222 / 2
  });

  it('an infant pays the infant fare, not an adult seat', () => {
    // 2 adults + infant + child = 3 × 110.99 + 16.99
    expect(packagePerPerson(1000, 349.96, 4)).toBe(338);   // 1350 / 4 = 337.5 → 338
  });

  it('no flight, or no hotel price, gives no package price', () => {
    expect(packagePerPerson(1000, null, 2)).toBeNull();
    expect(packagePerPerson(NaN, 200, 2)).toBeNull();
    expect(packagePerPerson(0, 200, 2)).toBeNull();
  });
});
