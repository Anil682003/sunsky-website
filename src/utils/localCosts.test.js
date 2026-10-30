import { describe, it, expect } from 'vitest';
import { localCost, localCostOfPackage, localCostOfCacheRow, localCostOfRate, LOCAL_COST } from './localCosts';

describe('localCost', () => {
  it('a known €12.40 stays €12.40: exact to the cent, never rounded up', () => {
    expect(localCost({ known: 12.4, currency: 'EUR' })).toEqual({ kind: LOCAL_COST.KNOWN, amount: 12.4, currency: 'EUR' });
    expect(localCost({ known: '12.40' }).amount).toBe(12.4);
    expect(localCost({ known: 12.404 }).amount).toBe(12.4);
  });

  it('nothing known, zero or negative is no answer, never € 0', () => {
    for (const v of [undefined, null, {}, { known: 0 }, { known: -3 }, { known: '' }, { known: null }, { known: 'abc' }, { known: 0.001 }]) {
      expect(localCost(v)).toBeNull();
    }
  });

  it('a range is a range: min and max p.p. per night, the kind of cost, no total', () => {
    const r = localCost({ min: 7, max: 10, cost: 'touristTax' });
    expect(r).toEqual({ kind: LOCAL_COST.RANGE, min: 7, max: 10, currency: 'EUR', cost: 'touristTax' });
    expect('amount' in r).toBe(false);
    // An unknown kind of cost is said as "other", never dropped.
    expect(localCost({ min: 7, max: 10, cost: 'whatever' }).cost).toBe('other');
  });

  it('a range that cannot be said honestly is no answer', () => {
    expect(localCost({ min: 10, max: 7 })).toBeNull();          // upside down
    expect(localCost({ min: 0, max: 0 })).toBeNull();           // nothing
    expect(localCost({ min: 7 })).toBeNull();                   // half a range
    expect(localCost({ min: 7, max: 10, currency: 'TRY' })).toBeNull();  // the strings are in euros
  });
});

describe('localCostOfPackage (Flight + Hotel, /packages)', () => {
  it('reads the package localCosts', () => {
    expect(localCostOfPackage({ sunskyPayableTotal: 1098, localCosts: { known: 12.4, currency: 'EUR' } }))
      .toEqual({ kind: 'known', amount: 12.4, currency: 'EUR' });
  });
  it('absent = none known', () => {
    expect(localCostOfPackage({ sunskyPayableTotal: 1098 })).toBeNull();
    expect(localCostOfPackage(null)).toBeNull();
  });
});

describe('localCostOfCacheRow (Hotel only, /contracts/cheapest)', () => {
  it('reads taxExcluded in the row currency', () => {
    expect(localCostOfCacheRow({ totalAmount: 501, taxExcluded: 12.4, currency: 'EUR' }))
      .toEqual({ kind: 'known', amount: 12.4, currency: 'EUR' });
  });
  it('0 or absent (every Hotelbeds-cache row) is nothing', () => {
    expect(localCostOfCacheRow({ totalAmount: 501, taxExcluded: 0 })).toBeNull();
    expect(localCostOfCacheRow({ totalAmount: 501 })).toBeNull();
  });
});

describe('localCostOfRate (live check, Hotelbeds taxes)', () => {
  const tax = (over) => ({ included: false, amount: '12.40', currency: 'EUR', clientAmount: '12.40', clientCurrency: 'EUR', type: 'TAXESANDFEES', ...over });

  it('only taxes with included false are payable locally', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax(), tax({ included: true, amount: '30.00' })], allIncluded: false } }))
      .toEqual({ kind: 'known', amount: 12.4, currency: 'EUR' });
  });

  it('adds several local taxes, to the cent', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax({ amount: '5.10' }), tax({ amount: '7.30' })] } }).amount).toBe(12.4);
  });

  it('reads the flat array the admin sends for a multi-room combination', () => {
    expect(localCostOfRate({ taxes: [tax({ amount: 6.2 }), tax({ amount: 6.2 })] }).amount).toBe(12.4);
  });

  it('all included, only included taxes, or no taxes at all: nothing', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax()], allIncluded: true } })).toBeNull();
    expect(localCostOfRate({ taxes: { taxes: [tax({ included: true })] } })).toBeNull();
    expect(localCostOfRate({ taxes: null })).toBeNull();
    expect(localCostOfRate({})).toBeNull();                       // Diana, W2M
    expect(localCostOfRate(null)).toBeNull();
  });

  it('a local tax without an amount makes the sum unknown: nothing, not an understated total', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax(), { included: false, percent: '10', type: 'TAX' }] } })).toBeNull();
  });

  it('keeps the tax its own currency; the client amount only stands in for a missing amount', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax({ amount: '450.00', currency: 'TRY', clientAmount: '12.40' })] } }))
      .toEqual({ kind: 'known', amount: 450, currency: 'TRY' });
    expect(localCostOfRate({ taxes: { taxes: [tax({ amount: undefined, currency: undefined })] } }))
      .toEqual({ kind: 'known', amount: 12.4, currency: 'EUR' });
  });

  it('taxes in two currencies are added in the client currency, or not at all', () => {
    expect(localCostOfRate({ taxes: [tax({ amount: '200', currency: 'TRY', clientAmount: '5.50' }), tax({ amount: '6.90', clientAmount: '6.90' })] }))
      .toEqual({ kind: 'known', amount: 12.4, currency: 'EUR' });
    expect(localCostOfRate({ taxes: [tax({ amount: '200', currency: 'TRY', clientAmount: undefined }), tax()] })).toBeNull();
  });

  it('a zero local tax is no cost', () => {
    expect(localCostOfRate({ taxes: { taxes: [tax({ amount: '0.00', clientAmount: '0.00' })] } })).toBeNull();
  });
});
