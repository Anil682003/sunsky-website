import { describe, it, expect } from 'vitest';
import { formatMoney, moneyCompact, moneyFull, moneyDiscount, formatAmount, NBSP, MINUS } from './money';

// The brief's own examples, with the no-break space written out.
const e = (s) => s.replace(/ /g, NBSP);

describe('money: the SUNSKY price notation', () => {
  it('full: always two decimals, period for thousands, comma for decimals', () => {
    expect(moneyFull(100)).toBe(e('€ 100,00'));
    expect(moneyFull(100.5)).toBe(e('€ 100,50'));
    expect(moneyFull(10000)).toBe(e('€ 10.000,00'));
    expect(moneyFull(2587)).toBe(e('€ 2.587,00'));
    expect(moneyFull(647)).toBe(e('€ 647,00'));
  });

  it('compact: whole euros without ,00, cents with two digits', () => {
    expect(moneyCompact(647)).toBe(e('€ 647'));
    expect(moneyCompact(647.5)).toBe(e('€ 647,50'));
    expect(moneyCompact(12345)).toBe(e('€ 12.345'));
    expect(moneyCompact(2.25)).toBe(e('€ 2,25'));
  });

  it('discounts: −€ 50,00, whatever sign the amount arrives with', () => {
    expect(moneyDiscount(50)).toBe(`${MINUS}${e('€ 50,00')}`);
    expect(moneyDiscount(-50)).toBe(`${MINUS}${e('€ 50,00')}`);
    expect(formatMoney(-12.4)).toBe(`${MINUS}${e('€ 12,40')}`);
  });

  it('change badges can carry a plus sign', () => {
    expect(moneyCompact(2, { sign: true })).toBe(`+${e('€ 2')}`);
    expect(moneyCompact(-2.25, { sign: true })).toBe(`${MINUS}${e('€ 2,25')}`);
    expect(moneyCompact(0, { sign: true })).toBe(e('€ 0'));
  });

  it('formats only: never rounds a price up or down to the euro', () => {
    expect(moneyCompact(630.5)).toBe(e('€ 630,50'));
    expect(moneyFull(484.4)).toBe(e('€ 484,40'));
    expect(moneyFull(646.999999999)).toBe(e('€ 647,00'));   // float noise settled to the cent
  });

  it('no amount prints nothing, never € 0', () => {
    expect(moneyFull(null)).toBeNull();
    expect(moneyFull(undefined)).toBeNull();
    expect(moneyFull('')).toBeNull();
    expect(moneyCompact(NaN)).toBeNull();
  });

  it('the amount stays on one line (no-break space) and digits-only is available', () => {
    expect(moneyFull(1).includes(' ')).toBe(false);
    expect(formatAmount(2587, 'full')).toBe('2.587,00');
    expect(formatAmount(647, 'compact')).toBe('647');
  });
});
