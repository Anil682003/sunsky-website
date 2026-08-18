// Sunsky flight priority (§23) on the website — the browser-side mirror of the admin
// flightSelection.service.js, so the Detail page's DEFAULT flight (and therefore the package
// from-price it shows) matches the Results from-price: direct → 1-stop → 2-stop, cheapest
// WITHIN the best class. A cheaper connection never beats a direct; a direct at any price wins.
//
// Proven on live data (BRU→AYT): the absolute-cheapest was a €924 2-stop while a direct existed,
// so defaulting to flights[0] (cheapest-first) would show the wrong from-price. This fixes it.
export const MAX_STOPS = 2;

/** Stops for a normalised flight card: explicit `stops`, else derived from leg count. */
export function flightStops(f) {
  if (Number.isFinite(f?.stops)) return f.stops;
  const legs = Array.isArray(f?.legs) ? f.legs.length : null;
  return legs != null ? Math.max(0, legs - 1) : 0;
}

/**
 * Index of the flight the from-price should use (§23). Walks all options once, preferring the
 * fewest stops (≤ maxStops), then the lowest price within that class. Returns 0 when nothing is
 * eligible (all > maxStops or no prices), so the caller always has a valid selection.
 */
export function pickPriorityIndex(flights, { maxStops = MAX_STOPS } = {}) {
  if (!Array.isArray(flights) || !flights.length) return 0;
  let bestIdx = -1;
  let bestStops = Infinity;
  let bestPrice = Infinity;
  flights.forEach((f, i) => {
    const stops = flightStops(f);
    if (stops > maxStops) return;
    const price = Number(f?.totalPrice ?? f?.price);
    if (!Number.isFinite(price)) return;
    if (stops < bestStops || (stops === bestStops && price < bestPrice)) {
      bestIdx = i; bestStops = stops; bestPrice = price;
    }
  });
  return bestIdx >= 0 ? bestIdx : 0;
}

/** The §23-priority flight itself (or null). */
export function pickPriorityFlight(flights, opts) {
  if (!Array.isArray(flights) || !flights.length) return null;
  return flights[pickPriorityIndex(flights, opts)] || null;
}
