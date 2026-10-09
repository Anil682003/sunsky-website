// The per-person package price on a results card: exact hotel stay + the party's flight,
// rounded once as a whole (rule 10), then per person.
//
// The flight fare from GET /flight-availability/package-fares is already the WHOLE party's
// flight (SUNSKY build order, step 9): every traveller at the fare of their own age, infants on
// a lap. It is added as it is. Dividing it by the adults and multiplying by the party again
// priced every child twice.

import { roundPackage, perPersonFrom } from './priceRounding';

/**
 * @param {number} exactStay       the hotel stay, unrounded
 * @param {number|null} partyFlight the party's flight total, or null when none is cached
 * @param {number} partySize       everyone travelling (adults + children)
 * @returns {number|null} null when there is no flight or no hotel price to add it to
 */
export function packagePerPerson(exactStay, partyFlight, partySize) {
  if (partyFlight == null || !Number.isFinite(Number(partyFlight))) return null;
  if (!Number.isFinite(exactStay) || exactStay <= 0) return null;
  return perPersonFrom(roundPackage(exactStay, Number(partyFlight)), partySize);
}

export default packagePerPerson;
