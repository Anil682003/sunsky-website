import { describe, it, expect } from 'vitest';
import { roomDelta } from './roomDelta';

/**
 * UI-04: room and board differences are measured against the rate the page is quoting, and may
 * be negative. The acceptance criteria are all about the sign and the rounding, so they are
 * tested on the arithmetic rather than through the page.
 */
describe('roomDelta', () => {
  it('a dearer room is a surcharge', () => {
    const { diff, perPerson } = roomDelta({ rowPrice: 1200, basePrice: 1000, rooms: 1, pax: 2 });
    expect(diff).toBe(200);
    expect(perPerson).toBe(100);
  });

  it('a cheaper room is a saving, not another surcharge', () => {
    // The old code compared against the group's cheapest, so this case could not arise and the
    // row showed its own total instead. Picking a dearer room must make the cheaper one read
    // as money back.
    const { diff, perPerson } = roomDelta({ rowPrice: 1000, basePrice: 1200, rooms: 1, pax: 2 });
    expect(diff).toBe(-200);
    expect(perPerson).toBe(100);
  });

  it('the row that IS the baseline has no difference at all', () => {
    const { diff, perPerson } = roomDelta({ rowPrice: 980, basePrice: 980, rooms: 1, pax: 2 });
    expect(diff).toBe(0);
    expect(perPerson).toBe(0);
  });

  it('per person is rounded UP, in both directions', () => {
    // €101 over 2 people is €50.50. Up, both ways: never understate a surcharge, never
    // overstate a saving by rounding it down to nothing.
    expect(roomDelta({ rowPrice: 1101, basePrice: 1000, pax: 2 }).perPerson).toBe(51);
    expect(roomDelta({ rowPrice: 1000, basePrice: 1101, pax: 2 }).perPerson).toBe(51);
  });

  it('a one-euro difference never disappears', () => {
    // Math.round(1 / 3) is 0, which is how a real difference becomes "Same price".
    const { diff, perPerson } = roomDelta({ rowPrice: 1001, basePrice: 1000, pax: 3 });
    expect(diff).toBe(1);
    expect(perPerson).toBe(1);
  });

  it('infants do not divide the difference', () => {
    // 2 adults + 1 child + 1 lap infant: the caller passes 3, not 4. €300 over 3 is €100;
    // dividing by the infant too would have quoted €75 for an upgrade costing €100 each.
    expect(roomDelta({ rowPrice: 1300, basePrice: 1000, pax: 3 }).perPerson).toBe(100);
    expect(roomDelta({ rowPrice: 1300, basePrice: 1000, pax: 4 }).perPerson).toBe(75);
  });

  it('two rooms: the whole-euro unit is one room\'s stay, on both sides', () => {
    // 1000.5 per room rounds up to 1001, twice = 2002; 1200.5 → 1201 twice = 2402.
    const { diff, perPerson } = roomDelta({ rowPrice: 2401, basePrice: 2001, rooms: 2, pax: 4 });
    expect(diff).toBe(2402 - 2002);
    expect(perPerson).toBe(100);
  });

  it('the difference matches the two totals a traveller can read on screen', () => {
    // Rounding each side first, then subtracting, is what keeps this true. Subtracting the
    // exact prices and rounding afterwards gives 101 here, which matches neither printed total.
    const row = roomDelta({ rowPrice: 1100.4, basePrice: 1000.4, rooms: 1, pax: 1 });
    expect(row.rowTotal).toBe(1101);
    expect(row.diff).toBe(1101 - 1001);
    expect(row.perPerson).toBe(100);
  });

  it('no baseline means no figure is invented', () => {
    for (const basePrice of [null, undefined, NaN, 'abc']) {
      const { diff, perPerson, rowTotal } = roomDelta({ rowPrice: 1200, basePrice, pax: 2 });
      expect(diff).toBeNull();
      expect(perPerson).toBeNull();
      // The row still knows its own price, which is what the screen falls back to.
      expect(rowTotal).toBe(1200);
    }
  });

  it('a missing party count never inflates the figure', () => {
    // Dividing by 0 would be Infinity; the floor of 1 makes it the whole difference instead.
    expect(roomDelta({ rowPrice: 1200, basePrice: 1000, pax: 0 }).perPerson).toBe(200);
  });
});
