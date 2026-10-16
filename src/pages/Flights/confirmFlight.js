import axiosInstance from '../../services/axiosInstance';

/**
 * Flights Only: confirming a cached flight before the traveller can book it (UI-16).
 *
 * The list now comes from the flight cache, which answers in milliseconds instead of the ten or
 * so seconds a live Airtürk search takes. The price it shows is real but INDICATIVE, and a cached
 * flight carries no bookable keys at all (`flightKeys` is always `[]`). So exactly one live search
 * runs, on Select, to re-find that itinerary leg by leg and hand back the keys.
 *
 * The one rule worth stating plainly: **a failed check is not a sold-out flight.** The supplier
 * being unreachable, a timeout, a 502 — none of those say anything about whether the seat exists.
 * Telling a traveller "no longer available" when we simply could not ask sends them away from a
 * flight they could have bought. Everything that is not a definite NOT_AVAILABLE from the server
 * is reported as a check that did not happen, with a retry.
 */

/** What `readConfirm` can return. */
export const CONFIRMED = 'confirmed';
export const PRICE_CHANGED = 'priceChanged';
export const NOT_AVAILABLE = 'notAvailable';
export const SOURCE_ERROR = 'sourceError';

/**
 * The body the confirm endpoint needs to find this exact itinerary again.
 *
 * The legs go back as the list returned them, untouched: the server matches on airline, flight
 * number and local departure to the minute, so a reconstructed or reformatted leg would simply
 * not be found and a perfectly good flight would read as NOT_AVAILABLE.
 *
 * `totalPrice` is the supplier's party total, not the per-person figure the cards show, because
 * it is the number the server compares against to decide CONFIRMED versus PRICE_CHANGED.
 *
 * @param flight  a flight from `mapAirtuerkFlight` (its `confirm` block carries the raw legs)
 * @param s       the search that produced it: { from, to, depISO, retISO, tripType, adults, … }
 */
export function confirmBody(flight, s) {
  const raw = flight?.confirm || {};
  const body = {
    from: s?.from?.code,
    to: s?.to?.code,
    depdate: s?.depISO,
    adults: s?.adults,
    children: s?.children,
    infants: s?.infants,
    totalPrice: flight?.totalPrice,
  };
  if (s?.tripType === 'roundtrip' && s?.retISO) body.retdate = s.retISO;

  // A round trip sends both halves; a one-way sends `legs`, which is the shape the contract
  // names for it. Sending an empty `inbound` on a one-way would make the server look for a
  // return that was never offered.
  if (raw.outbound?.legs?.length) {
    body.outbound = { legs: raw.outbound.legs };
    if (raw.inbound?.legs?.length) body.inbound = { legs: raw.inbound.legs };
  } else if (raw.legs?.length) {
    body.legs = raw.legs;
  }
  return body;
}

/** True when we have enough of the original itinerary to ask about it at all. */
export const canConfirm = (flight) => {
  const raw = flight?.confirm || {};
  return Boolean(raw.outbound?.legs?.length || raw.legs?.length);
};

/**
 * Turn an answer (or a failure) into one of four outcomes.
 *
 * Deliberately total: anything unrecognised falls through to SOURCE_ERROR rather than being
 * guessed at, because the only two wrong answers that cost a sale are "sold out" when it is not
 * and "confirmed" when there is nothing to book.
 *
 * @param data  the parsed response body, or null
 * @param err   the thrown error, when the request failed
 */
export function readConfirm(data, err) {
  if (err) {
    // 502 is the server's own SOURCE_ERROR. A timeout, an abort or a network failure tell us
    // just as little, so they land in the same place.
    return { kind: SOURCE_ERROR, status: err?.response?.status ?? null };
  }

  const status = data?.status;

  if (status === 'CONFIRMED' || status === 'PRICE_CHANGED') {
    const flight = data?.flight;
    // A confirmation without bookable keys cannot be carried into checkout. Treating it as a
    // success would push the traveller to a payment screen holding nothing to reserve.
    const keys = Array.isArray(flight?.flightKeys) ? flight.flightKeys : [];
    if (!flight || !keys.length) return { kind: SOURCE_ERROR, status: null, reason: 'NO_KEYS' };

    if (status === 'CONFIRMED') return { kind: CONFIRMED, flight };

    const livePrice = Number(data?.livePrice);
    return {
      kind: PRICE_CHANGED,
      flight,
      livePrice: Number.isFinite(livePrice) ? livePrice : null,
      difference: Number.isFinite(Number(data?.difference)) ? Number(data.difference) : null,
    };
  }

  if (status === 'NOT_AVAILABLE') {
    return { kind: NOT_AVAILABLE, reason: data?.reason || null };
  }

  if (status === 'SOURCE_ERROR') return { kind: SOURCE_ERROR, status: null };

  // `success: false`, an empty body, or a status we do not know: not a reason to say sold out.
  return { kind: SOURCE_ERROR, status: null, reason: 'UNEXPECTED' };
}

/**
 * Ask the server to confirm one flight. Never throws: the outcome is the return value, so the
 * page has one thing to branch on and no error path that could end up showing "sold out".
 */
export async function confirmFlight(flight, s, { signal } = {}) {
  if (!canConfirm(flight)) return { kind: SOURCE_ERROR, status: null, reason: 'NO_ITINERARY' };
  try {
    const { data } = await axiosInstance.post(
      '/flight-availability/cached-search/confirm',
      confirmBody(flight, s),
      { signal },
    );
    return readConfirm(data, null);
  } catch (err) {
    return readConfirm(null, err);
  }
}

export default confirmFlight;
