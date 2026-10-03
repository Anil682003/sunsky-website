// How a party splits into flight fare types, using the SAME boundaries as the server's
// paxCounts (sunsky-admin backend/website/services/priceValidation.service.js) and the package
// fares (build order, step 9): under 2 an infant (on a lap), under 12 a child, otherwise an
// adult, measured on the travel date. Every page that asks for a flight price uses this, so the
// hotel page, the checkout and the booking all quote the same fare for the same family.

/**
 * @param {number} searchedAdults how many adults the search itself described (their rows carry
 *   no searched date of birth, so they are counted, not derived)
 * @param {number[]} childAges ages of the searched children, in search order
 * @returns {{adults:number, children:number, infants:number, childAges:number[]}}
 */
export function splitFareTypes(searchedAdults, childAges = []) {
  const ages = (childAges || []).map(Number).filter((a) => Number.isFinite(a) && a >= 0);
  const adults = searchedAdults + ages.filter((a) => a >= 12).length;
  const babies = ages.filter((a) => a < 2).length;
  // One infant per adult lap: any more fly in a seat of their own at the child fare, as
  // airlines do (and as the server's paxCounts and the package fares count them). Not a refusal.
  const seated = adults > 0 ? Math.max(0, babies - adults) : 0;
  return {
    adults,
    children: ages.filter((a) => a >= 2 && a < 12).length + seated,
    infants: babies - seated,
    // Hotelbeds wants an age for every non-adult in the room, infants included.
    childAges: ages.filter((a) => a < 12),
  };
}

export default splitFareTypes;
