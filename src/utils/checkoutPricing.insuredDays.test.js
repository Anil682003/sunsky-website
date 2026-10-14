import { describe, it, expect } from 'vitest';
import { insuredDays, priceInsurance } from './checkoutPricing';

/**
 * A one-way flight has no hotel nights, so `booking.nights` is 0. The insurance panel printed
 * "0 reisdagen" and "x 0 dagen" beside a total of EUR 4, which read as a pricing bug to the
 * client. The PRICE was always right: both this module and the server's
 * `priceInsuranceOption` floor the day count at one. Only the label read the raw number.
 *
 * These tests pin the label and the charge to the same function so they cannot drift apart
 * again.
 */
describe('insuredDays', () => {
  it('floors a dateless trip at one day', () => {
    // The one-way flight case that caused the report.
    expect(insuredDays(0)).toBe(1);
    expect(insuredDays(null)).toBe(1);
    expect(insuredDays(undefined)).toBe(1);
    expect(insuredDays('')).toBe(1);
  });

  it('passes a real trip length through untouched', () => {
    expect(insuredDays(1)).toBe(1);
    expect(insuredDays(7)).toBe(7);
    expect(insuredDays('14')).toBe(14);
  });

  it('never returns a negative or fractional day count', () => {
    expect(insuredDays(-3)).toBe(1);
    expect(insuredDays(NaN)).toBe(1);
  });
});

describe('the label matches the charge', () => {
  const option = { enabled: true, mode: 'perPersonPerDay', value: 4 };

  /**
   * THE REGRESSION. EUR 4.00 per traveller per day, two travellers, a one-way flight: the
   * charge is 4 x 2 x 1 = 8, so the panel must say ONE day, never zero. Printing a day count
   * that cannot produce the total shown is what made this look like a billing fault.
   */
  it('a one-way flight is charged, and labelled, as one day', () => {
    const nights = 0;
    expect(insuredDays(nights)).toBe(1);
    expect(priceInsurance(option, { pax: 2, nights })).toBe(8);
  });

  it('the displayed count always reproduces the total', () => {
    for (const nights of [0, 1, 3, 7, 21]) {
      const pax = 2;
      const days = insuredDays(nights);
      expect(priceInsurance(option, { pax, nights })).toBe(option.value * pax * days);
    }
  });

  it('a per-person option ignores the day count entirely', () => {
    // Guards against "fixing" the label by multiplying days into a mode that has none.
    expect(priceInsurance({ enabled: true, mode: 'perPerson', value: 9 }, { pax: 3, nights: 0 })).toBe(27);
    expect(priceInsurance({ enabled: true, mode: 'perPerson', value: 9 }, { pax: 3, nights: 7 })).toBe(27);
  });
});
