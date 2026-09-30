import { describe, it, expect } from 'vitest';
import { ceilEuro, roundHotelStay, roundPackage, roundStayTotal, perPersonFrom } from './priceRounding';

// Real amounts from a live cache response (TIA, 6 nights, 2 adults).
describe('whole-euro rounding (rule 10)', () => {
  it('rounds up to a whole euro, once', () => {
    expect(ceilEuro(255.12)).toBe(256);
    expect(ceilEuro(260.34)).toBe(261);
    expect(ceilEuro(256)).toBe(256);
    expect(ceilEuro(42.52 * 6)).toBe(256);          // float noise: 255.11999999999998
    expect(ceilEuro(256.00000000000003)).toBe(256); // never €1 extra for noise
  });

  it('rounds a hotel stay per room', () => {
    expect(roundHotelStay(255.12, 1)).toBe(256);
    expect(roundHotelStay(510.24, 2)).toBe(512);    // 256 × 2, not 511
  });

  it('rounds a package once, as a whole', () => {
    // exact hotel 255.12 + flight 178.74 = 433.86 → 434 (rounding the hotel first gives 435)
    expect(roundPackage(255.12, 178.74)).toBe(434);
    expect(roundStayTotal(255.12, 178.74, 1)).toBe(434);
    expect(roundStayTotal(255.12, 0, 1)).toBe(256);  // no flight → hotel only
    expect(roundStayTotal(255.12, null, 1)).toBe(256);
  });

  it('derives per person from the rounded total, rounded up', () => {
    expect(perPersonFrom(261, 2)).toBe(131);
    expect(perPersonFrom(434, 2)).toBe(217);
  });
});
