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
  const grown = ages.filter((a) => a >= 12).length;
  return {
    adults: searchedAdults + grown,
    children: ages.filter((a) => a >= 2 && a < 12).length,
    infants: ages.filter((a) => a < 2).length,
    // Hotelbeds wants an age for every non-adult in the room, infants included.
    childAges: ages.filter((a) => a < 12),
  };
}

export default splitFareTypes;
