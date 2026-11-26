import { describe, it, expect, afterEach } from 'vitest';
import { roundPrice, normalizeRule, LEGACY_RULE } from './roundingRule';
import { ruleFromMeta, setRoundingRuleForTest, roundSelling, roundingApplies } from './pricingRounding';
import { perPersonFrom, roundPackage, ceilEuro } from './priceRounding';
import { sellingEuros } from './tripPrice';
import { moneyCompact, moneyFull } from './money';

afterEach(() => setRoundingRuleForTest(null));

// The same table as the admin's services/pricing/roundingRule.test.js (the file is a verbatim copy).
describe('roundingRule (verbatim copy of the admin rule)', () => {
  it('LEGACY is exactly the old whole-euro rounding up', () => {
    const old = (x) => Math.ceil(Math.round(x * 100) / 100);
    for (const x of [0, 1, 1.01, 100, 100.004, 100.005, 501.1, 646.99999999, 1260.37, 2231.04, 0.5, 999.995]) {
      expect(roundPrice(x, LEGACY_RULE)).toBe(old(x));
    }
  });
  it('the four strategies, and 2 decimals keeps the cent', () => {
    expect(roundPrice(630.5, { strategy: 'ceil', decimals: 0 })).toBe(631);
    expect(roundPrice(630.4, { strategy: 'round', decimals: 0 })).toBe(630);
    expect(roundPrice(630.9, { strategy: 'floor', decimals: 0 })).toBe(630);
    expect(roundPrice(630.5, { strategy: 'banker', decimals: 0 })).toBe(630);
    expect(roundPrice(631.5, { strategy: 'banker', decimals: 0 })).toBe(632);
    expect(roundPrice(1260.37, { strategy: 'ceil', decimals: 2 })).toBe(1260.37);
    expect(roundPrice(630.41, { strategy: 'ceil', decimals: 1 })).toBe(630.5);
    expect(normalizeRule({ strategy: 'x', decimals: 9 })).toEqual(LEGACY_RULE);
  });
});

describe('the rule the page was served with', () => {
  it('reads the <meta> the server writes; anything else is legacy', () => {
    expect(ruleFromMeta('{"apply":true,"strategy":"ceil","decimals":2}')).toEqual({ strategy: 'ceil', decimals: 2 });
    expect(ruleFromMeta('{"apply":false,"strategy":"ceil","decimals":2}')).toBeNull();
    expect(ruleFromMeta('not json')).toBeNull();
    expect(ruleFromMeta(null)).toBeNull();
    expect(roundingApplies()).toBe(false);
  });

  it('no rule: every helper exactly as before', () => {
    expect(ceilEuro(630.5)).toBe(631);
    expect(sellingEuros(630.5)).toBe(631);
    expect(roundPackage(500.2, 130.3)).toBe(631);
    expect(perPersonFrom(963, 2)).toBe(482);
  });

  // Levent, 26 Nov 2026: "For a confirmed SUNSKY total of € 963,00 for two adults, the green panel
  // should show € 481,50 p.p. It currently shows € 482 p.p. ... The € 17 p.p. price decrease is
  // correct." Pricing Logic: Always Round Up, 2 decimals.
  it('Levent\'s case: € 963,00 for 2 adults is € 481,50 p.p.; the € 17 p.p. decrease stays € 17', () => {
    setRoundingRuleForTest({ strategy: 'ceil', decimals: 2 });
    const now = perPersonFrom(963, 2);
    const was = perPersonFrom(997, 2);
    expect(now).toBe(481.5);
    expect(moneyCompact(now)).toBe('€ 481,50');
    expect(moneyCompact(Math.abs(now - was))).toBe('€ 17');
    expect(moneyFull(963)).toBe('€ 963,00');
    expect(moneyFull(997)).toBe('€ 997,00');
    expect(sellingEuros(1260.37)).toBe(1260.37);
    expect(roundSelling(1261.001)).toBe(1261);
  });
});
