/**
 * ONE AVAILABILITY VOCABULARY, for the results grid, the hotel page and the date matrix.
 *
 * Until now each surface invented its own. Results keeps a `loading` boolean next to a
 * `filtering` boolean next to a `facetsStatus` of 'loading' | 'ok' | 'error'; the hotel page
 * keeps `{loading:true}` / `{error:'...'}` / `{rooms:[...]}` object shapes, one per block.
 * Three dialects for one question, and none of them can say the two things that actually
 * matter to a shopper: "this exists but we could not price it", and "we do not know".
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. A timeout, a 500, a dropped connection, a malformed
 * payload or a missing price must never be shown as "unavailable". Only a source that
 * positively answered "none" makes something UNAVAILABLE. That is easy to agree with and easy
 * to forget inside a catch block at the end of a long day, so it is built into the shape here
 * rather than written on a wiki: `unavailable()` will not construct a value without naming the
 * sources that confirmed it, and `fromFailure()` cannot return UNAVAILABLE at all.
 *
 * WHY A SEPARATE VALIDATION FLAG. "Is there a holiday here" and "is this price one we will
 * honour" are different questions with different answers, and squashing them into one status
 * is how a cached contract price ends up looking like a live quote. So `state` answers the
 * first and `validation` answers the second: INDICATIVE for a price from the contracts cache,
 * LIVE_CONFIRMED for one a supplier just quoted. A surface can show a price and still be
 * honest that nobody has confirmed it yet.
 */

/** What we know about whether a thing can be booked. */
export const AVAILABILITY = Object.freeze({
  /** A live check is in flight. Any previously known price stays visible underneath. */
  CHECKING: 'CHECKING',
  /** Bookable, with a price. */
  AVAILABLE: 'AVAILABLE',
  /** Every relevant source positively answered "none". The only confirmed negative. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** It exists and may well be bookable, but no usable price came back. */
  PRICE_UNKNOWN: 'PRICE_UNKNOWN',
  /** We could not find out. A timeout, a 5xx, a network drop, an unreadable payload. */
  SOURCE_ERROR: 'SOURCE_ERROR',
  /** Each part exists on its own, but no combination of them forms a bookable trip. */
  NO_VALID_COMBINATION: 'NO_VALID_COMBINATION',
});

/** How much a price on screen is worth. Orthogonal to the state above. */
export const VALIDATION = Object.freeze({
  /** From the contracts cache or a from-price. Shown, but nobody has stood behind it yet. */
  INDICATIVE: 'INDICATIVE',
  /** A supplier quoted this, just now, for exactly these dates and this party. */
  LIVE_CONFIRMED: 'LIVE_CONFIRMED',
});

/**
 * Why a source could not answer. Kept as a code rather than a sentence so the machine can
 * reason about it (a timeout is worth retrying, a 400 is not) and the surface can pick its
 * own wording in its own language.
 */
export const CAUSE = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  RATE_LIMITED: 'RATE_LIMITED',
  /** The supplier or our API answered, but with a failure. */
  UPSTREAM: 'UPSTREAM',
  /** A 200 whose body we could not read as an availability answer. */
  MALFORMED: 'MALFORMED',
  /** We asked something the supplier refused to answer — a bad request, usually ours. */
  REJECTED: 'REJECTED',
  UNKNOWN: 'UNKNOWN',
});

const EMPTY = Object.freeze([]);

/** Normalise the various ways callers will hand us a list of source names. */
const names = (v) => {
  if (!v) return EMPTY;
  const list = (Array.isArray(v) ? v : [v]).map((s) => String(s || '').trim()).filter(Boolean);
  return list.length ? Object.freeze([...new Set(list)]) : EMPTY;
};

const make = (state, fields) => Object.freeze({
  state,
  validation: null,
  price: null,
  currency: null,
  cause: null,
  sources: EMPTY,
  confirmedBy: EMPTY,
  /** A short machine-readable note ("no flights from CRL"), never a finished sentence. */
  detail: null,
  ...fields,
});

/* ─────────────────────────── constructors ─────────────────────────── */

/**
 * A live check is running.
 *
 * `keep` is the value being refreshed. Its price is carried forward so a surface can dim the
 * old number instead of blanking the row, which is the difference between "updating" and
 * "we lost your holiday". A customer's chosen date, room or flight must stay legible while we
 * re-check it.
 */
export function checking({ keep = null, sources } = {}) {
  return make(AVAILABILITY.CHECKING, {
    price: keep?.price ?? null,
    currency: keep?.currency ?? null,
    // A price being re-checked is, by definition, no longer confirmed.
    validation: keep?.price != null ? VALIDATION.INDICATIVE : null,
    sources: names(sources ?? keep?.sources),
  });
}

/** Bookable, at this price. Defaults to INDICATIVE: claiming a live quote is opt-in. */
export function available({ price = null, currency = 'EUR', validation = VALIDATION.INDICATIVE, sources, detail = null } = {}) {
  // A price of null is not an available offer, it is an unpriced one. Callers that reach here
  // with nothing to show have found PRICE_UNKNOWN and are told so rather than quietly
  // rendering "AVAILABLE" above an empty space.
  if (price == null || !Number.isFinite(Number(price))) {
    return priceUnknown({ sources, detail: detail || 'available-without-price' });
  }
  return make(AVAILABILITY.AVAILABLE, {
    price: Number(price), currency, validation, sources: names(sources), detail,
  });
}

/**
 * Confirmed not bookable.
 *
 * `confirmedBy` is required and must name the sources that positively answered "none". This
 * is the guard rail: a catch block has no such list to offer, so the only way to reach
 * UNAVAILABLE is to have actually been told. Called without it, this returns SOURCE_ERROR and
 * complains in development rather than silently telling a customer their holiday is gone.
 */
export function unavailable({ confirmedBy, sources, detail = null } = {}) {
  const confirmed = names(confirmedBy);
  if (!confirmed.length) {
    if (import.meta.env?.DEV) {
      console.error(
        '[availability] unavailable() needs confirmedBy: which sources actually answered "none"? '
        + 'Returning SOURCE_ERROR instead, because an unproven negative must never reach a customer.',
      );
    }
    return sourceError({ cause: CAUSE.UNKNOWN, sources, detail: detail || 'unconfirmed-negative' });
  }
  return make(AVAILABILITY.UNAVAILABLE, {
    confirmedBy: confirmed, sources: names(sources ?? confirmedBy), detail,
  });
}

/** It is there; we just have no price for it. Never to be drawn as "unavailable". */
export function priceUnknown({ sources, detail = null } = {}) {
  return make(AVAILABILITY.PRICE_UNKNOWN, { sources: names(sources), detail });
}

/** We could not find out. */
export function sourceError({ cause = CAUSE.UNKNOWN, sources, detail = null } = {}) {
  return make(AVAILABILITY.SOURCE_ERROR, { cause, sources: names(sources), detail });
}

/**
 * The parts exist but do not fit together: flights on those dates, rooms in that hotel, and
 * no pairing of the two that makes a trip of the requested length. Distinct from UNAVAILABLE
 * because the honest next step is different — this one has alternatives to offer.
 */
export function noValidCombination({ sources, detail = null } = {}) {
  return make(AVAILABILITY.NO_VALID_COMBINATION, { sources: names(sources), detail });
}

/* ─────────────────────────── failures ─────────────────────────── */

/**
 * Read a thrown thing as a cause code. Mirrors the branches the hotel page already used for
 * its wording, so the two cannot drift apart: timeout, network, 429, 5xx, then everything
 * else. 4xx is called out separately because a rejected request is our bug, not a supplier
 * outage, and it should be findable in the logs rather than blamed on the supplier.
 */
export function classifyFailure(err) {
  const status = err?.response?.status ?? err?.status ?? null;
  const message = String(err?.message || err || '');

  if (err?.code === 'ECONNABORTED' || /timeout/i.test(message)) return CAUSE.TIMEOUT;
  if (err?.code === 'ERR_NETWORK' || /network error/i.test(message)) return CAUSE.NETWORK;
  if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return CAUSE.TIMEOUT;
  if (status === 429) return CAUSE.RATE_LIMITED;
  if (status >= 500) return CAUSE.UPSTREAM;
  if (status >= 400) return CAUSE.REJECTED;
  if (err instanceof SyntaxError || /json|unexpected token/i.test(message)) return CAUSE.MALFORMED;
  return CAUSE.UNKNOWN;
}

/**
 * The one line a catch block needs. Cannot return UNAVAILABLE, by construction — which is the
 * whole point of routing every failure through here.
 */
export function fromFailure(err, { sources, detail = null } = {}) {
  return sourceError({ cause: classifyFailure(err), sources, detail });
}

/** Worth offering a retry? A timeout or a wobbling supplier, yes. Our own bad request, no. */
export function isRetryable(value) {
  if (value?.state !== AVAILABILITY.SOURCE_ERROR) return false;
  return value.cause === CAUSE.TIMEOUT
    || value.cause === CAUSE.NETWORK
    || value.cause === CAUSE.RATE_LIMITED
    || value.cause === CAUSE.UPSTREAM
    || value.cause === CAUSE.UNKNOWN;
}

/* ─────────────────────────── combining ─────────────────────────── */

// How sure a state makes us, for picking a winner. Only used inside the combinators below.
const rank = (order) => (value) => {
  const i = order.indexOf(value?.state);
  return i === -1 ? order.length : i;
};

/**
 * ALTERNATIVES — several ways to get the same thing. Three suppliers quoting one hotel, or
 * four airports serving one route. One working option is enough.
 *
 * The order matters and is the rule-5 argument in miniature: UNAVAILABLE sits last, so a list
 * where one supplier said "none" and another timed out comes back SOURCE_ERROR. We do not
 * know, and the one source that might have said yes never answered.
 *
 * PRICE_UNKNOWN outranks SOURCE_ERROR because it carries more knowledge: something is there.
 */
const ANY_ORDER = [
  AVAILABILITY.AVAILABLE,
  AVAILABILITY.CHECKING,
  AVAILABILITY.PRICE_UNKNOWN,
  AVAILABILITY.SOURCE_ERROR,
  AVAILABILITY.NO_VALID_COMBINATION,
  AVAILABILITY.UNAVAILABLE,
];

export function anyOf(values) {
  const list = (values || []).filter(Boolean);
  if (!list.length) return sourceError({ cause: CAUSE.UNKNOWN, detail: 'no-sources-consulted' });

  const by = rank(ANY_ORDER);
  const winner = list.reduce((best, v) => {
    if (by(v) !== by(best)) return by(v) < by(best) ? v : best;
    // Same state: for two available offers, the cheaper one is the offer.
    if (v.state === AVAILABILITY.AVAILABLE && best.state === AVAILABILITY.AVAILABLE) {
      return v.price < best.price ? v : best;
    }
    return best;
  });

  const sources = names(list.flatMap((v) => v.sources));
  return Object.freeze({
    ...winner,
    sources,
    // Only meaningful on a confirmed negative, and then it is every source that said "none".
    confirmedBy: winner.state === AVAILABILITY.UNAVAILABLE
      ? names(list.flatMap((v) => v.confirmedBy))
      : EMPTY,
  });
}

/**
 * COMPONENTS — the parts a single trip needs at once. A package is a flight AND a room; lose
 * either and there is no holiday.
 *
 * UNAVAILABLE leads here, unlike in `anyOf`, and that is not a contradiction of rule 5. A
 * confirmed "no rooms at this hotel" is a fact we were actually told, and it settles the
 * package no matter what the flight search is still doing. Reporting it at once is both
 * truthful and faster than making someone watch a spinner finish for a trip that cannot
 * happen. What rule 5 forbids is inferring that fact from a failure, which no branch here does.
 *
 * NO_VALID_COMBINATION outranks UNAVAILABLE only because it is the more specific of the two
 * negatives and leads to a better next screen.
 */
const ALL_ORDER = [
  AVAILABILITY.NO_VALID_COMBINATION,
  AVAILABILITY.UNAVAILABLE,
  AVAILABILITY.CHECKING,
  AVAILABILITY.SOURCE_ERROR,
  AVAILABILITY.PRICE_UNKNOWN,
  AVAILABILITY.AVAILABLE,
];

export function allOf(values) {
  const list = (values || []).filter(Boolean);
  if (!list.length) return sourceError({ cause: CAUSE.UNKNOWN, detail: 'no-components-supplied' });

  const by = rank(ALL_ORDER);
  const winner = list.reduce((worst, v) => (by(v) < by(worst) ? v : worst));
  const sources = names(list.flatMap((v) => v.sources));

  if (winner.state !== AVAILABILITY.AVAILABLE) {
    return Object.freeze({
      ...winner,
      sources,
      confirmedBy: winner.state === AVAILABILITY.UNAVAILABLE
        ? names(list.flatMap((v) => v.confirmedBy))
        : EMPTY,
    });
  }

  // Every component is bookable: the trip costs the sum of its parts, and it is only as
  // confirmed as its least-confirmed leg. A live room next to a cached fare is not a live
  // package price, and saying so is the entire reason validation is tracked separately.
  const everyLegLive = list.every((v) => v.validation === VALIDATION.LIVE_CONFIRMED);
  return available({
    price: list.reduce((sum, v) => sum + v.price, 0),
    currency: list.find((v) => v.currency)?.currency || 'EUR',
    validation: everyLegLive ? VALIDATION.LIVE_CONFIRMED : VALIDATION.INDICATIVE,
    sources,
  });
}

/* ─────────────────────────── reading a value ─────────────────────────── */

export const isChecking = (v) => v?.state === AVAILABILITY.CHECKING;
/** Can a customer put this in a basket right now? */
export const isBookable = (v) => v?.state === AVAILABILITY.AVAILABLE;
/** Is there a number worth putting on screen, even a dimmed or indicative one? */
export const hasPrice = (v) => v?.price != null && Number.isFinite(v.price);
/** A settled no. UNAVAILABLE and NO_VALID_COMBINATION; never a failure. */
export const isConfirmedNegative = (v) => v?.state === AVAILABILITY.UNAVAILABLE
  || v?.state === AVAILABILITY.NO_VALID_COMBINATION;
/** We do not know, and should say so rather than guess in either direction. */
export const isUnknown = (v) => v?.state === AVAILABILITY.SOURCE_ERROR
  || v?.state === AVAILABILITY.PRICE_UNKNOWN;
export const isLiveConfirmed = (v) => v?.validation === VALIDATION.LIVE_CONFIRMED;

/**
 * The i18n key a surface should render for this state, so the three of them cannot end up
 * describing the same situation three different ways. The strings themselves live in the
 * locale files; this only fixes which one is asked for.
 */
export function messageKey(value) {
  switch (value?.state) {
    case AVAILABILITY.CHECKING: return 'availability.checking';
    case AVAILABILITY.AVAILABLE: return null;               // a price speaks for itself
    case AVAILABILITY.UNAVAILABLE: return 'availability.unavailable';
    case AVAILABILITY.PRICE_UNKNOWN: return 'availability.priceUnknown';
    case AVAILABILITY.NO_VALID_COMBINATION: return 'availability.noValidCombination';
    case AVAILABILITY.SOURCE_ERROR:
      return value.cause === CAUSE.TIMEOUT ? 'availability.error.timeout'
        : value.cause === CAUSE.NETWORK ? 'availability.error.network'
          : value.cause === CAUSE.RATE_LIMITED ? 'availability.error.rateLimited'
            : 'availability.error.generic';
    default: return 'availability.checking';
  }
}
