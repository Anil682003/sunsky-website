/**
 * The airport an airport transfer starts from: where the outbound flight LANDS.
 *
 * The checkout used to search (and book) transfers from the hotel's destination code. For
 * Istanbul that is `IST`, Istanbul Airport, while AJet and Pegasus land at Sabiha Gökçen (SAW),
 * about 80 km away: on 4 Nov 2026 a DUS→SAW package was offered, priced and booked a shuttle
 * from the wrong airport. A destination code is not even always an airport (Bodrum is `BOD`,
 * its airport `BJV`).
 *
 * In order of trust:
 *   1. `outTo`, the arrival of the last outbound leg as the hotel page split the flight;
 *   2. the last outbound leg of the raw legs (round trips split down the middle, as the
 *      pickup time is), for a booking handed over before `outTo` existed;
 *   3. the destination code, the old behaviour, when there is no flight to read.
 * Only a three-letter code counts as an airport; `outTo` can carry "SAW Istanbul".
 */
const iata = (v) => {
  const s = String(v ?? '').trim().split(/\s+/)[0].toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
};

export function transferAirport({ outTo, legs, tripType, destination } = {}) {
  const all = Array.isArray(legs) ? legs : [];
  const outLegs = tripType === 'roundtrip' ? all.slice(0, Math.ceil(all.length / 2)) : all;
  return iata(outTo) || iata(outLegs[outLegs.length - 1]?.to) || destination || null;
}
