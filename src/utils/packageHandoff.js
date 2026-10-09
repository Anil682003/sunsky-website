// The package a results card (or a matrix date) priced, carried to the hotel page so the live
// check asks about THAT package: its flight dates, arrival airport and exact flights, not the
// cheapest live fare of the hotel stay dates (7 Oct 2026).
//
// A package's flight dates are not its stay dates: an overnight flight lands the day after it
// leaves, and an early-morning return leaves the hotel the evening before. Searching flights on
// the stay dates priced a different flight than the card had, sometimes on the wrong day.
//
// The card opens the hotel page in a NEW TAB, so everything rides in the query string:
//   pkgOut / pkgBack  the legs of each direction, `AIRLINE|NUMBER|YYYY-MM-DDTHH:MM` joined by `~`
//   pkgDep / pkgRet   the flight departure dates (outbound, return)
//   pkgFrom / pkgTo   the departure and arrival airports
//   pkgFlight         the flight price the card was priced with (the whole party)
//   pkgDays           the trip length in days
// The stay is `checkIn` / `checkOut`, as before.

const up = (s) => String(s ?? '').trim().toUpperCase();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const isIata = (v) => /^[A-Z]{3}$/.test(up(v));
/** Nights between two dates, read off the dates themselves (never a separately stated count). */
const nightsOf = (ci, co) => (isDate(ci) && isDate(co) ? Math.round((Date.parse(co) - Date.parse(ci)) / 86_400_000) : null);
/** A leg's local departure to the minute ("2026-12-11T18:35"), or '' when it has none. */
const minuteOf = (v) => {
  const s = String(v ?? '').trim().replace(' ', 'T');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : '';
};

/**
 * A flight number without its airline prefix or leading zeros, so "TK0123", "TK 123" and "123"
 * are one flight (the same rule as the admin's cachedFlights.service flightNumberKey).
 */
export function flightNumberKey(airline, flightNo) {
  let n = up(flightNo).replace(/[^A-Z0-9]/g, '');
  const a = up(airline);
  if (a && n.startsWith(a) && n.length > a.length) n = n.slice(a.length);
  return n.replace(/^0+(?=\d)/, '');
}

/** One direction's legs for the URL. '' when a leg has no airline, number or departure time. */
export function encodeLegs(legs) {
  if (!Array.isArray(legs) || !legs.length) return '';
  const parts = legs.map((l) => {
    const airline = up(l?.airline);
    const number = flightNumberKey(airline, l?.flightNumber ?? l?.flightNo);
    const dep = minuteOf(l?.departure);
    return airline && number && dep ? `${airline}|${number}|${dep}` : null;
  });
  return parts.every(Boolean) ? parts.join('~') : '';
}

/** The legs back from the URL; [] when anything in it is unreadable. */
export function decodeLegs(s) {
  if (!s) return [];
  const legs = String(s).split('~').map((p) => {
    const [airline, flightNumber, departure] = p.split('|');
    return up(airline) && flightNumber && minuteOf(departure)
      ? { airline: up(airline), flightNumber: String(flightNumber), departure: minuteOf(departure) }
      : null;
  });
  return legs.every(Boolean) ? legs : [];
}

/**
 * The same flights, leg by leg: airline, flight number and local departure to the minute (the
 * rule the admin's confirm endpoint matches on).
 */
export function legsMatch(pkgLegs = [], liveLegs = []) {
  if (!pkgLegs.length || pkgLegs.length !== liveLegs.length) return false;
  return pkgLegs.every((p, i) => {
    const l = liveLegs[i];
    if (up(p.airline) !== up(l?.airline)) return false;
    if (flightNumberKey(p.airline, p.flightNumber ?? p.flightNo) !== flightNumberKey(l?.airline, l?.flightNumber ?? l?.flightNo)) return false;
    const pd = minuteOf(p.departure);
    return !!pd && pd === minuteOf(l?.departure);
  });
}

/**
 * A package from the admin's package search (a /packages hotel) or the hotel page's matrix (a
 * cell), in the one shape this page reads. Null when it does not carry a complete round trip.
 */
export function packageFromOffer(offer) {
  const f = offer?.flight;
  const outLegs = f?.outbound?.legs || [];
  const backLegs = f?.inbound?.legs || [];
  const depdate = String(f?.outbound?.departureDate || '').slice(0, 10);
  const retdate = String(f?.inbound?.departureDate || '').slice(0, 10);
  const pkg = {
    from: up(offer?.departureAirport || f?.outbound?.origin),
    to: up(offer?.arrivalAirport || f?.outbound?.destination),
    depdate, retdate,
    checkin: offer?.stay?.checkin || null,
    checkout: offer?.stay?.checkout || null,
    nights: nightsOf(offer?.stay?.checkin, offer?.stay?.checkout),
    travelDays: Number(offer?.travelDays ?? f?.travelDays) || null,
    outLegs: decodeLegs(encodeLegs(outLegs)),
    backLegs: decodeLegs(encodeLegs(backLegs)),
    flightPrice: Number(offer?.components?.flight ?? f?.price),
  };
  if (!Number.isFinite(pkg.flightPrice) || pkg.flightPrice <= 0) pkg.flightPrice = null;
  return validPackage(pkg) ? pkg : null;
}

const validPackage = (p) => !!p && isIata(p.from) && isIata(p.to) && isDate(p.depdate) && isDate(p.retdate)
  && isDate(p.checkin) && isDate(p.checkout) && p.nights > 0 && p.outLegs.length > 0 && p.backLegs.length > 0;

/** The URL parameters of a package (see the top of this file). {} when it cannot be carried. */
export function packageParams(offer) {
  const p = packageFromOffer(offer);
  if (!p) return {};
  const out = {
    pkgOut: encodeLegs(p.outLegs), pkgBack: encodeLegs(p.backLegs),
    pkgDep: p.depdate, pkgRet: p.retdate, pkgFrom: p.from, pkgTo: p.to,
  };
  if (p.flightPrice != null) out.pkgFlight = String(p.flightPrice);
  if (p.travelDays) out.pkgDays = String(p.travelDays);
  return out;
}

/** The package back from the hotel page's URL (`get` reads one parameter); null when there is none. */
export function packageFromParams(get) {
  const g = (k) => String(get(k) ?? '').trim();
  if (!g('pkgOut')) return null;
  const checkin = g('checkIn');
  const checkout = g('checkOut');
  const pkg = {
    from: up(g('pkgFrom')), to: up(g('pkgTo')),
    depdate: g('pkgDep'), retdate: g('pkgRet'),
    checkin, checkout,
    nights: nightsOf(checkin, checkout),
    travelDays: Number(g('pkgDays')) || null,
    outLegs: decodeLegs(g('pkgOut')), backLegs: decodeLegs(g('pkgBack')),
    flightPrice: Number(g('pkgFlight')) > 0 ? Number(g('pkgFlight')) : null,
  };
  return validPackage(pkg) ? pkg : null;
}

/** Whether a package answers this stay: the live check of exactly its check-in and check-out. */
export const packageApplies = (pkg, checkin, checkout) =>
  !!pkg && pkg.checkin === checkin && pkg.checkout === checkout;

/**
 * The flight question of a stay: the package's flight dates and arrival airport when the stay is
 * the package's, else the stay dates and the hotel's destination (every other day, as before).
 */
export function flightQuestion(pkg, checkin, checkout, destination) {
  return packageApplies(pkg, checkin, checkout)
    ? { depdate: pkg.depdate, retdate: pkg.retdate, to: pkg.to }
    : { depdate: checkin, retdate: checkout, to: destination };
}

/** A flight of the page (outLegs / retLegs) that is the package's flight, both ways. */
export const flightIsPackage = (f, pkg) =>
  !!pkg && legsMatch(pkg.outLegs, f?.outLegs || []) && legsMatch(pkg.backLegs, f?.retLegs || []);

/** The body of POST /flight-availability/cached-search/confirm for a package's flight. */
export function confirmBody(pkg, party) {
  const legs = (ls) => ls.map((l) => ({ airline: l.airline, flightNumber: l.flightNumber, departure: l.departure }));
  return {
    from: pkg.from, to: pkg.to, depdate: pkg.depdate, retdate: pkg.retdate,
    adults: party.adults, children: party.children, infants: party.infants,
    outbound: { legs: legs(pkg.outLegs) }, inbound: { legs: legs(pkg.backLegs) },
    ...(pkg.flightPrice != null ? { totalPrice: pkg.flightPrice } : {}),
  };
}

/** What the confirm endpoint said about the package flight. */
export const PACKAGE_FLIGHT = Object.freeze({
  CONFIRMED: 'CONFIRMED',           // on sale (at the card's price or another one)
  NOT_AVAILABLE: 'NOT_AVAILABLE',   // the supplier answered, and not with this flight
  UNKNOWN: 'UNKNOWN',               // the check failed: says nothing about the flight
});

/**
 * PURE. The live list with the package flight in it: the confirmed flight added when the list
 * does not already hold it (the search is capped; the confirm is not), duplicates of one flight
 * collapsed to the cheapest, cheapest first.
 *
 * @param {object[]} flights     the page's flights (transformFlights)
 * @param {object[]} confirmed   the confirm endpoint's flight, through the same transform ([] when none)
 * @param {object}   pkg
 * @param {Function} sigOf       what makes two fares one flight (the page's flightSig)
 * @param {string|null} confirmStatus  the endpoint's status (null when the call failed)
 * @returns {{ flights: object[], pkgSig: string|null, status: string }}
 */
export function mergePackageFlight(flights, confirmed, pkg, sigOf, confirmStatus) {
  const seen = new Set();
  const list = [...flights, ...confirmed.filter((f) => flightIsPackage(f, pkg))]
    .sort((a, b) => a.totalPrice - b.totalPrice)
    .filter((f) => { const s = sigOf(f); if (seen.has(s)) return false; seen.add(s); return true; });
  const hit = list.find((f) => flightIsPackage(f, pkg));
  const status = hit ? PACKAGE_FLIGHT.CONFIRMED
    : confirmStatus === 'NOT_AVAILABLE' ? PACKAGE_FLIGHT.NOT_AVAILABLE
      : PACKAGE_FLIGHT.UNKNOWN;
  return { flights: list, pkgSig: hit ? sigOf(hit) : null, status };
}

/**
 * PURE. The package matrix's cells as the price strip's days, keyed by the STAY check-in (the
 * day the rest of the page prices: rooms, checkout). Two flight dates with one stay keep the
 * cheaper. A cell without a price is kept as a day to check (SOURCE_ERROR) or a day with nothing
 * to sell (NO_VALID_COMBINATION), never as a price.
 */
export function matrixDays(cells) {
  const byIso = new Map();
  for (const c of Array.isArray(cells) ? cells : []) {
    if (!c?.date) continue;
    const priced = c.state === 'AVAILABLE' && Number(c.sunskyPayableTotal) > 0;
    const pkg = priced ? packageFromOffer(c) : null;
    const iso = pkg?.checkin || c.stay?.checkin || c.date;
    const day = {
      iso,
      departure: c.date,
      price: priced ? Number(c.sunskyPayableTotal) : 0,
      perPerson: priced ? Number(c.pricePerPerson) || null : null,
      nights: pkg?.nights || Number(c.stay?.nights) || null,
      travelDays: Number(c.travelDays) || null,
      state: c.state,
      cheapest: !!c.cheapest,
      currency: c.currency || 'EUR',
      pkg,
    };
    const had = byIso.get(iso);
    if (!had || (day.price > 0 && (!(had.price > 0) || day.price < had.price))) byIso.set(iso, day);
  }
  return [...byIso.values()].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}
