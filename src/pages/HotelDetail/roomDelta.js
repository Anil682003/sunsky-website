import { roundHotelStay, perPersonFrom } from '../../utils/priceRounding';

/**
 * What one room row costs compared with the rate the page is currently quoting
 * (UI-04 / Ch1 §8, Ch2 §6, Ch3 §6).
 *
 * The baseline is the CURRENT selection, not the cheapest rate in the row's own room. Comparing
 * against the cheapest answered a question nobody asks: a traveller looking at a sea-view room
 * wants to know what moving there costs them from where they stand, not how it relates to the
 * cheapest rate in that same room. It also made every figure a surcharge, so a room that would
 * save them money looked like another thing to pay for and the way back down was invisible.
 *
 * Both sides are rounded to whole euros BEFORE subtracting, deliberately. The figures either
 * side of the difference are the ones printed elsewhere on the page, and subtracting exact
 * prices then rounding can produce a difference that does not match the two totals a traveller
 * can see for themselves.
 *
 * @param rowPrice   exact stay price of the row being drawn
 * @param basePrice  exact stay price of the quoted rate, or null when there is none
 * @param rooms      rooms booked (the whole-euro rounding unit is one room's stay)
 * @param pax        travellers who pay a share — adults + children, never lap infants
 * @returns {{ diff: number|null, perPerson: number|null, rowTotal: number }}
 *          `diff`/`perPerson` are null when there is no baseline to measure against;
 *          `perPerson` is the rounded-up absolute difference, so read the sign off `diff`.
 */
export function roomDelta({ rowPrice, basePrice, rooms = 1, pax = 1 }) {
  const rowTotal = roundHotelStay(rowPrice, rooms);

  if (basePrice == null || !Number.isFinite(Number(basePrice))) {
    return { diff: null, perPerson: null, rowTotal };
  }

  const diff = rowTotal - roundHotelStay(basePrice, rooms);

  // Rounded UP on the absolute value: a €1 saving must not print as €0, and a €1 surcharge must
  // not round itself away. `perPersonFrom` ceils, the same whole-euro rule the totals follow.
  return { diff, perPerson: perPersonFrom(Math.abs(diff), pax), rowTotal };
}

export default roomDelta;
