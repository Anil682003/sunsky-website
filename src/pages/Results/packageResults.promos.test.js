// Offers on Flight + Hotel (Levent, 12 Nov 2026): the filter goes to the admin as `offers`, a
// package keeps its hotel price's offers for the card, and the counts add up over the groups.
import { describe, it, expect } from 'vitest';
import { packageBody, mapPackage, mergePromoFacets } from './packageResults';

describe('package offers', () => {
  const fp = { adults: '2', children: '0', rooms: '1', checkIn: '2027-06-01', checkOut: '2027-06-08' };
  it('the filter is sent as offers, and only when set', () => {
    expect(packageBody({ fp, filters: { promos: ['EARLY_BOOKING', 'CHILD_DISCOUNT'] } }).offers).toBe('EARLY_BOOKING,CHILD_DISCOUNT');
    expect('offers' in packageBody({ fp, filters: {} })).toBe(false);
  });
  it('a package card keeps the offers of its hotel price', () => {
    expect(mapPackage({ hotelCode: '1', sunskyPayableTotal: 900, offers: ['CHILD_DISCOUNT'] }, 'x').promos).toEqual(['CHILD_DISCOUNT']);
    expect(mapPackage({ hotelCode: '1', sunskyPayableTotal: 900 }, 'x').promos).toEqual([]);
  });
  it('counts are summed over the destination groups', () => {
    expect(mergePromoFacets([{ promoFacets: { EARLY_BOOKING: 2 } }, { promoFacets: { EARLY_BOOKING: 1, CHILD_DISCOUNT: 4 } }, {}]))
      .toEqual({ EARLY_BOOKING: 3, CHILD_DISCOUNT: 4 });
  });
});

describe('package room facilities', () => {
  const fp = { adults: '2', children: '0', rooms: '1', checkIn: '2027-06-01', checkOut: '2027-06-08' };
  it('sent as roomFeatures, and only when set', () => {
    expect(packageBody({ fp, filters: { roomFeatures: ['PRIVATE_POOL'] } }).roomFeatures).toBe('PRIVATE_POOL');
    expect('roomFeatures' in packageBody({ fp, filters: {} })).toBe(false);
  });
});
