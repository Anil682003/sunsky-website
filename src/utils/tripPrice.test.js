import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  INFANT_MAX_AGE, PRODUCT, MAIN_PRICE, PRICE_KIND,
  productOf, isInfantAge, countParty, countedTravellers,
  perPersonFromTotal, allowsFromPerPerson, mainPrice,
  sellingEuros, localEuros, formatEuros,
} from './tripPrice';

// The guards deliberately console.error in development, and the invalid-party cases below trip
// them on purpose. Silenced so a passing run stays readable; asserted where it is the point.
let spy;
beforeAll(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { spy.mockRestore(); });

describe('countParty', () => {
  it('counts adults and children, and leaves infants out of the divisor', () => {
    const p = countParty({ adults: 2, children: 2, childAges: '8,1' });
    expect(p).toMatchObject({
      adults: 2, children: 1, infants: 1, travellers: 4, counted: 3,
    });
  });

  it('reads the csv the URL carries and an array alike', () => {
    expect(countParty({ adults: 2, children: 2, childAges: '8,1' }).counted).toBe(3);
    expect(countParty({ adults: 2, children: 2, childAges: [8, 1] }).counted).toBe(3);
    expect(countParty({ adults: '2', children: '2', childAges: ' 8 , 1 ' }).counted).toBe(3);
  });

  // Guessing "infant" for a blank age would shrink the divisor and advertise a per-person price
  // below the real one. Counting the child is the only safe direction.
  it('counts a child whose age nobody gave us', () => {
    expect(countParty({ adults: 2, children: 1 }).counted).toBe(3);
    expect(countParty({ adults: 2, children: 2, childAges: '8' }).counted).toBe(4);
    expect(countParty({ adults: 2, children: 1, childAges: '' }).counted).toBe(3);
  });

  it('takes an explicit infant count when no ages are given', () => {
    expect(countParty({ adults: 2, children: 1, infants: 1 })).toMatchObject({
      children: 0, infants: 1, counted: 2, travellers: 3,
    });
    // ...and an infant with no child slot still makes the party of three it is.
    expect(countParty({ adults: 2, infants: 1 })).toMatchObject({ infants: 1, counted: 2, travellers: 3 });
  });

  it('prefers real ages over a stated infant count', () => {
    expect(countParty({ adults: 2, children: 1, childAges: '8', infants: 1 }).counted).toBe(3);
  });

  it('never divides by rooms: rooms are carried, not counted', () => {
    expect(countParty({ adults: 5, rooms: 2 }).counted).toBe(5);
    expect(countParty({ adults: 5, rooms: 2 }).rooms).toBe(2);
    expect(countParty({ adults: 2 }).rooms).toBe(1);   // missing rooms is one room
  });

  it('marks an infants-only party invalid (spec 2.4)', () => {
    expect(countParty({ adults: 0, children: 1, childAges: '1' })).toMatchObject({ counted: 0, valid: false });
    expect(countParty({}).valid).toBe(false);
    expect(countParty({ adults: 1 }).valid).toBe(true);
  });

  it('survives junk', () => {
    // An unreadable adult count is 0 adults, and two unreadable ages are two children whose
    // age nobody knows, so they count. Never a thrown error inside a price cell.
    expect(countParty({ adults: 'two', children: null, childAges: 'x,y' })).toMatchObject({
      adults: 0, children: 2, infants: 0, counted: 2,
    });
    expect(countParty({ adults: 2, children: -1 }).counted).toBe(2);
    expect(countParty(undefined).valid).toBe(false);
  });
});

describe('isInfantAge', () => {
  it('is 0 and 1 only', () => {
    expect(INFANT_MAX_AGE).toBe(1);
    expect(isInfantAge(0)).toBe(true);
    expect(isInfantAge(1)).toBe(true);
    expect(isInfantAge('1')).toBe(true);
    expect(isInfantAge(2)).toBe(false);
    expect(isInfantAge(null)).toBe(false);   // an unknown age is not an infant
    expect(isInfantAge('')).toBe(false);
  });
});

/* The spec's own table, verbatim (master spec 2.4). If one of these moves, the headline price
   on every card and every matrix cell moved with it. */
describe('perPersonFromTotal: the spec table', () => {
  const cases = [
    ['2 adults',                    1200, { adults: 2 },                                        600],
    ['2 adults + infant',           1300, { adults: 2, children: 1, childAges: '1' },           650],
    ['2 adults + child',            1500, { adults: 2, children: 1, childAges: '8' },           500],
    ['5 adults, 2 rooms',           1900, { adults: 5, rooms: 2 },                              380],
    ['5 adults + infant, 2 rooms',  1950, { adults: 5, children: 1, childAges: '0', rooms: 2 }, 390],
    ['3 counted travellers',        1501, { adults: 3 },                                        501],
  ];

  it.each(cases)('%s: %i -> %i p.p.', (_label, total, party, expected) => {
    expect(perPersonFromTotal(total, party)).toBe(expected);
  });

  // The rounding is per person and upward, so the p.p. figure must never be multiplied back.
  it('leaves the full price alone: 1501 stays 1501 even though 3 x 501 is 1503', () => {
    const shown = mainPrice({ total: 1501, party: { adults: 3 } });
    expect(shown.average).toBe(501);
    expect(shown.total).toBe(1501);
    expect(shown.average * 3).toBeGreaterThan(shown.total);
  });

  it('divides the ROUNDED total, not the cents', () => {
    // 501.10 is a 502 package (spec 2.3), so two adults pay 251 each, not 250.55 -> 251.
    expect(perPersonFromTotal(501.10, { adults: 2 })).toBe(251);
  });

  it('returns null rather than dividing by zero', () => {
    expect(perPersonFromTotal(1300, { adults: 0, children: 1, childAges: '1' })).toBeNull();
    expect(perPersonFromTotal(1300, {})).toBeNull();
    expect(perPersonFromTotal(null, { adults: 2 })).toBeNull();
    expect(perPersonFromTotal('n/a', { adults: 2 })).toBeNull();
  });

  it('countedTravellers is the same divisor', () => {
    expect(countedTravellers({ adults: 2, children: 1, childAges: '1' })).toBe(2);
    expect(countedTravellers({ adults: 5, rooms: 2 })).toBe(5);
  });
});

describe('allowsFromPerPerson', () => {
  it('is exactly two adults in one room', () => {
    expect(allowsFromPerPerson({ adults: 2, rooms: 1 })).toBe(true);
    expect(allowsFromPerPerson({ adults: 2 })).toBe(true);           // rooms defaults to one
    expect(allowsFromPerPerson({ adults: '2', rooms: '1' })).toBe(true);
  });

  it('is not two adults in two rooms', () => {
    expect(allowsFromPerPerson({ adults: 2, rooms: 2 })).toBe(false);
  });

  it('is not a party with a child or an infant', () => {
    expect(allowsFromPerPerson({ adults: 2, children: 1, childAges: '8' })).toBe(false);
    expect(allowsFromPerPerson({ adults: 2, children: 1, childAges: '1' })).toBe(false);
    expect(allowsFromPerPerson({ adults: 2, children: 1 })).toBe(false);
  });

  it('is not one adult, three adults or five', () => {
    for (const adults of [1, 3, 4, 5]) expect(allowsFromPerPerson({ adults })).toBe(false);
  });
});

describe('mainPrice', () => {
  it('shows "From X p.p." only for 2 adults + 1 room', () => {
    const r = mainPrice({ total: 1200, party: { adults: 2, rooms: 1 }, product: PRODUCT.PACKAGE });
    expect(r).toMatchObject({
      variant: MAIN_PRICE.FROM_PER_PERSON,
      amount: 600,
      total: 1200,
      average: 600,
      i18nKey: 'price.from',
      // The main line is already per person: repeating it as an "average" would say nothing.
      secondaryKey: null,
    });
  });

  it('shows the trip total for a package with a child', () => {
    const r = mainPrice({ total: 1500, party: { adults: 2, children: 1, childAges: '8' }, product: PRODUCT.PACKAGE });
    expect(r).toMatchObject({
      variant: MAIN_PRICE.TOTAL_TRIP, amount: 1500, total: 1500, average: 500,
      i18nKey: 'price.totalTrip', secondaryKey: 'price.average', counted: 3,
    });
  });

  it('shows the stay total for Hotel Only', () => {
    const r = mainPrice({ total: 1900, party: { adults: 5, rooms: 2 }, product: PRODUCT.HOTEL_ONLY });
    expect(r).toMatchObject({
      variant: MAIN_PRICE.TOTAL_STAY, amount: 1900, average: 380, i18nKey: 'price.totalStay',
    });
  });

  it('keeps an infant out of the average and its cost in the total', () => {
    const r = mainPrice({ total: 1300, party: { adults: 2, children: 1, childAges: '1' } });
    expect(r.variant).toBe(MAIN_PRICE.TOTAL_TRIP);   // an infant forfeits the p.p. headline
    expect(r.total).toBe(1300);
    expect(r.average).toBe(650);
  });

  it('treats a missing or unknown product as a package, like searchStore does', () => {
    expect(mainPrice({ total: 999, party: { adults: 3 } }).i18nKey).toBe('price.totalTrip');
    expect(mainPrice({ total: 999, party: { adults: 3 }, product: 'nonsense' }).i18nKey).toBe('price.totalTrip');
    expect(productOf(undefined)).toBe(PRODUCT.PACKAGE);
    expect(productOf('hotel_only')).toBe(PRODUCT.HOTEL_ONLY);
  });

  it('rounds the total up to a whole euro before anything else', () => {
    expect(mainPrice({ total: 501.10, party: { adults: 2 } })).toMatchObject({ total: 502, amount: 251 });
  });

  it('shows nothing rather than something wrong', () => {
    expect(mainPrice({ total: null, party: { adults: 2 } })).toBeNull();
    expect(mainPrice({ total: 1200, party: { adults: 0, children: 1, childAges: '1' } })).toBeNull();
    expect(mainPrice({})).toBeNull();
  });

  it('uses the same product spellings the site already stores', () => {
    expect(PRODUCT.PACKAGE).toBe('package');
    expect(PRODUCT.HOTEL_ONLY).toBe('hotel_only');
  });
});

describe('display rounding (spec 2.3)', () => {
  it('rounds a SUNSKY selling price UP to a whole euro', () => {
    expect(sellingEuros(501.10)).toBe(502);
    expect(sellingEuros(199.36)).toBe(200);
    expect(sellingEuros(202.14)).toBe(203);
    expect(sellingEuros(990)).toBe(990);
  });

  // A total arrives as a sum of floats. Charging an extra euro for 0.00000000001 is a bug
  // report, not a rounding rule.
  it('does not invent a euro out of float noise', () => {
    expect(sellingEuros(500 + 0.1 + 0.2 - 0.3)).toBe(500);
    expect(sellingEuros(0.1 + 0.2)).toBe(1);   // a real 0.30 still rounds up
  });

  it('keeps a local cost exactly as it is', () => {
    expect(localEuros(12.40)).toBe(12.4);
    expect(localEuros(12.404)).toBe(12.4);
    expect(localEuros(7)).toBe(7);
    expect(localEuros(2.005)).toBe(2.01);
  });

  it('never rounds a local cost up to a euro', () => {
    for (const v of [0.5, 5.01, 12.4, 99.99]) expect(localEuros(v)).toBe(v);
  });

  it('returns null for something that is not money', () => {
    expect(sellingEuros(null)).toBeNull();
    expect(sellingEuros('free')).toBeNull();
    expect(localEuros(undefined)).toBeNull();
  });
});

describe('formatEuros', () => {
  it('formats a selling price as whole euros and a local cost to the cent', () => {
    expect(formatEuros(1060, PRICE_KIND.SELLING, { locale: 'en-GB' })).toBe('1,060');
    expect(formatEuros(501.10, PRICE_KIND.SELLING, { locale: 'en-GB' })).toBe('502');
    expect(formatEuros(12.4, PRICE_KIND.LOCAL, { locale: 'en-GB' })).toBe('12.40');
    expect(formatEuros(12.4, PRICE_KIND.LOCAL, { locale: 'nl-BE' })).toBe('12,40');
  });

  // The one guard that stops a local cost being silently rounded up: the caller must say which
  // kind of money it is holding, and a caller that does not gets the safe one plus a shout.
  it('demands a kind, and falls back to keeping the cents', () => {
    expect(formatEuros(12.4, undefined, { locale: 'en-GB' })).toBe('12.40');
    expect(spy).toHaveBeenCalled();
    expect(formatEuros(12.4, 'SELLINGISH', { locale: 'en-GB' })).toBe('12.40');
  });

  it('returns null for something that is not money', () => {
    expect(formatEuros(null, PRICE_KIND.SELLING)).toBeNull();
  });
});
