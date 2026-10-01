// Which flight a Flight + Hotel price opens on, on the website (spec 3.6).
//
// NO ROUTING PREFERENCE. This file used to mirror the old §23 rule: direct, then 1 stop, then
// 2 stops, and a direct at ANY price beat a cheaper stopover. The master spec (26 Sep 2026)
// forbids exactly that: the default is the cheapest valid package, never a routing type, so a
// direct flight wins only when it is also the cheapest. Departure time, duration, layover,
// airline and stop count are not ranking criteria.
//
// ONE HARD CEILING STAYS: at most one stop in each direction. The spec never sells two
// connections in one direction. Until the backend can tell a through-stop (same aircraft) from a
// real connection (spec 9.2), the stop count is the only evidence the page has, and a direction
// with two stops is outside every routing policy the spec allows. Counted PER DIRECTION, never
// added across the two: one stop out and one back is still within the rule.
//
// The admin package-fares engine (flightSelection.service.js) applies the same rule, so a
// results card and the hotel page it opens still land on the same flight.
export const MAX_STOPS_PER_DIRECTION = 1;

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
 * Index of the flight the package price should open on: the CHEAPEST one within the stop
 * ceiling, whatever its routing. Returns 0 when nothing qualifies, so the caller always has a
 * valid selection.
 */
export function pickPriorityIndex(flights, { maxStops = MAX_STOPS_PER_DIRECTION } = {}) {
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
