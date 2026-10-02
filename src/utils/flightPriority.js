// Which flight a Flight + Hotel price opens on, on the website (spec 3.6).
//
// NO ROUTING PREFERENCE. This file used to mirror the old §23 rule: direct, then 1 stop, then
// 2 stops, and a direct at ANY price beat a cheaper stopover. The master spec (26 Sep 2026)
// forbids exactly that: the default is the cheapest valid package, never a routing type, so a
// direct flight wins only when it is also the cheapest. Departure time, duration, layover,
// airline and stop count are not ranking criteria.
//
// NO ROUTING RULE OF ITS OWN EITHER. Which flights a package may use is the destination
// airport's Flight connection Policy for Package Holidays, set in the admin (GeoData → Airports)
// and applied by the backend before the flights reach this page: the hotel page and checkout ask
// /flight-availability/search with `package: true`, and only the allowed flights come back
// (Levent, 2 Oct 2026: "fully controlled from the backend configuration"). This file used to
// cap every package at one stop per direction itself; a second, hard-coded copy of the rule
// would only drift from the setting, so it is gone.
//
// The admin package-fares engine (flightSelection.service.js) picks the same way — cheapest
// valid flight — so a results card and the hotel page it opens land on the same flight.

/**
 * Stops in the worse direction of a normalised flight card. The hotel page's cards already
 * carry `stops` as the larger of the two directions; a card with per-direction legs is counted
 * per direction, and a bare `legs` list (one direction) falls back to legs - 1.
 */
export function flightStops(f) {
  if (Number.isFinite(f?.stops)) return f.stops;
  const perDirection = [f?.outLegs, f?.retLegs]
    .filter(Array.isArray)
    .map((legs) => Math.max(0, legs.length - 1));
  if (perDirection.length) return Math.max(...perDirection);
  const legs = Array.isArray(f?.legs) ? f.legs.length : null;
  return legs != null ? Math.max(0, legs - 1) : 0;
}

/**
 * Index of the flight the package price should open on: the CHEAPEST priced one, whatever its
 * routing (the backend has already removed every routing the airport's policy does not allow).
 * `maxStops` is only for a caller that wants to narrow further. Returns 0 when nothing
 * qualifies, so the caller always has a valid selection.
 */
export function pickPriorityIndex(flights, { maxStops = Infinity } = {}) {
  if (!Array.isArray(flights) || !flights.length) return 0;
  let bestIdx = -1;
  let bestPrice = Infinity;
  flights.forEach((f, i) => {
    if (flightStops(f) > maxStops) return;
    // Number(null) is 0, which would make an unpriced flight the "cheapest" of all.
    const raw = f?.totalPrice ?? f?.price;
    const price = raw == null || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(price)) return;
    if (price < bestPrice) {
      bestIdx = i;
      bestPrice = price;
    }
  });
  return bestIdx >= 0 ? bestIdx : 0;
}

/** The flight itself (or null). */
export function pickPriorityFlight(flights, opts) {
  if (!Array.isArray(flights) || !flights.length) return null;
  return flights[pickPriorityIndex(flights, opts)] || null;
}
