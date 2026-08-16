// Filtering and sorting for the "Choose your flights" modal.
//
// WHY THIS EXISTS. The modal shipped as a mock: a hardcoded flight list, checkboxes whose
// only effect was to draw a tick, and a <select> with no handler. Tick "Morning" on the
// return and a 12:45 return still sat at the top of the list, because nothing ever read the
// boxes. This module is the missing half — and it is separate from the page so the banding
// rules can be tested without mounting a 2000-line component.
//
// TWO RULES DRIVE EVERYTHING HERE:
//
//   1. Bucket by the SAME clock the card prints. HotelDetail's `fmtTime` renders
//      `new Date(iso).getHours()` — the viewer's local hour. If this module bucketed by UTC
//      instead, a card reading "07:00" could be filed under Early morning and vanish when the
//      traveller ticks Morning. `hourOf` below is deliberately the same derivation.
//
//   2. A filter that cannot change the result set is noise. `flightFacets` returns only the
//      options that some flight matches AND that some flight fails — an option every flight
//      satisfies is as useless as one no flight satisfies. That is what keeps a one-way
//      search from showing a "Departure time return" group, and an all-direct result set from
//      showing a "Direct flights" box that does nothing.

export const TIME_BANDS = [
  { id: 'early',     label: 'Early morning', range: '00:00 – 06:59', from: 0,  to: 6  },
  { id: 'morning',   label: 'Morning',       range: '07:00 – 11:59', from: 7,  to: 11 },
  { id: 'afternoon', label: 'Afternoon',     range: '12:00 – 17:59', from: 12, to: 17 },
  { id: 'evening',   label: 'Evening',       range: '18:00 – 23:59', from: 18, to: 23 },
];

/** Minutes in a day. The departure-time sliders run 0 … 1439 (00:00 … 23:59). */
export const DAY_START = 0;
export const DAY_END = 1439;

/** "Any time" — the range that constrains nothing, and the value both sliders reset to. */
export const FULL_DAY = [DAY_START, DAY_END];

/**
 * The hour a traveller sees on the card, or null when the value is unusable.
 * Mirrors HotelDetail's `fmtTime`: real date first, "HH:MM" text as the fallback.
 */
export function hourOf(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.getHours();
  const m = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Which of the four bands an hour falls in — `null` when the time could not be read. */
export function bandOf(value) {
  const h = hourOf(value);
  if (h == null) return null;
  return TIME_BANDS.find((b) => h >= b.from && h <= b.to)?.id ?? null;
}

/**
 * Minutes past midnight for a departure, on the same local clock `hourOf` reads —
 * `null` when the value cannot be read. This is what the departure-time sliders filter on.
 */
export function minuteOf(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  const m = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 545 → "09:05". The sliders print their handles with this. */
export function fmtClock(minutes) {
  const m = Math.max(DAY_START, Math.min(DAY_END, Math.round(Number(minutes) || 0)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A range that covers the whole day constrains nothing — the untouched slider. */
const isWholeDay = (r) => !r || (numAt(r, 0) <= DAY_START && numAt(r, 1) >= DAY_END);
const numAt = (r, i) => {
  const n = Number(Array.isArray(r) ? r[i] : r?.[i === 0 ? 'from' : 'to']);
  return Number.isFinite(n) ? n : (i === 0 ? DAY_START : DAY_END);
};

const outDeparture = (f) => f?.outLegs?.[0]?.departure ?? null;
const retDeparture = (f) => f?.retLegs?.[0]?.departure ?? null;

/** Shortest ground stop we will call a turnaround. Long connections top out around 5h. */
const MIN_TURNAROUND_MS = 6 * 60 * 60 * 1000;

/**
 * Split a flat leg list into outbound and return.
 *
 * Some suppliers return a round trip as ONE flight with every leg concatenated and no
 * direction marker. Rendered as-is that reads "BRU → BRU · 1 stop" — the traveller is shown
 * a trip that departs and lands at the same airport, with the return half missing entirely.
 * It also silently disables the return-time filter, because there is no `retLegs[0]` to
 * read a departure hour from.
 *
 * The split point is the LONGEST ground gap between one leg landing and the next taking
 * off. A connection is hours; a holiday is days — so the stay is unmistakable, and unlike
 * matching on the destination airport this needs no knowledge of the itinerary.
 *
 * Returns the legs untouched as a single direction when the trip does not come back to
 * where it started, or when no gap is long enough to be a stay (a genuine A→…→A routing).
 */
export function splitRoundTrip(legs, origin = null) {
  const list = Array.isArray(legs) ? legs : [];
  const whole = { outLegs: list, retLegs: [] };
  if (list.length < 2) return whole;

  const first = String(list[0]?.from || '').toUpperCase();
  const last = String(list[list.length - 1]?.to || '').toUpperCase();
  if (!first || first !== last) return whole;              // never returns home → one direction
  if (origin && first !== String(origin).toUpperCase()) return whole;

  let atIdx = -1, longest = -Infinity;
  for (let i = 0; i < list.length - 1; i += 1) {
    const arr = new Date(list[i]?.arrival).getTime();
    const dep = new Date(list[i + 1]?.departure).getTime();
    if (Number.isNaN(arr) || Number.isNaN(dep)) continue;
    const gap = dep - arr;
    if (gap > longest) { longest = gap; atIdx = i; }
  }

  if (atIdx < 0 || longest < MIN_TURNAROUND_MS) return whole;
  return { outLegs: list.slice(0, atIdx + 1), retLegs: list.slice(atIdx + 1) };
}

/* Collapse fares a traveller cannot tell apart.
 *
 * Airtuerk prices one row per bookable fare class, so the SAME physical flight comes back
 * several times over: identical aircraft, identical times, identical baggage, a few euros
 * apart. Rendered one card each, the change-flight modal showed four cards that differed in
 * nothing — two of them at the very same price. That is not a choice, it is a list to scroll
 * past, and it buries the itineraries that genuinely ARE different.
 *
 * Rows with the same itinerary AND the same baggage are one option; only the cheapest
 * survives. Baggage is in the signature on purpose: a hand-luggage fare and a 20kg fare on
 * the same aircraft are different things to buy, so both keep their card.
 *
 * Pass a list already sorted cheapest-first — the first row of each group is the one kept,
 * and its `flightKeys` are what the booking is ultimately made with.
 */
export function dedupeFares(sorted) {
  const legSig = (l) => [
    String(l?.airline || '').toUpperCase(),
    String(l?.flightNumber || ''),
    String(l?.from || '').toUpperCase(),
    String(l?.to || '').toUpperCase(),
    String(l?.departure || ''),
    String(l?.arrival || ''),
  ].join('|');
  const fareSig = (f) => [
    (f.outLegs || []).map(legSig).join('>'),
    (f.retLegs || []).map(legSig).join('>'),
    f.baggage?.checkedKg ?? '',
    f.baggage?.checkedPieces ?? '',
    f.baggage?.handKg ?? '',
  ].join('~');
  // A feed that sends neither flight numbers nor departure times has no itinerary to compare,
  // and collapsing on an empty signature would throw away every option but one. Those rows
  // pass through untouched — this only ever acts on fares it can actually identify.
  const identifiable = (f) => (f?.outLegs || []).some((l) => l?.departure || l?.flightNumber);

  const seen = new Set();
  return (Array.isArray(sorted) ? sorted : []).filter((f) => {
    if (!identifiable(f)) return true;
    const sig = fareSig(f);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/** Stops across the whole trip — a trip is "direct" only when BOTH directions are. */
export function stopsOf(f) {
  if (!f) return 0;
  if (Number.isFinite(f.stops)) return f.stops;
  const out = Math.max(0, (f.outLegs?.length || 0) - 1);
  const ret = Math.max(0, (f.retLegs?.length || 0) - 1);
  return Math.max(out, ret);
}

/** Total minutes in the air across both directions — the "Duration" sort key. */
export function durationOf(f) {
  const sum = (legs) => (legs || []).reduce((s, l) => s + (Number(l?.duration) || 0), 0);
  return sum(f?.outLegs) + sum(f?.retLegs);
}

/**
 * Does this fare carry HOLD baggage?
 *
 * "Baggage included" on a flight filter means a checked bag — the thing a traveller pays extra
 * for later if it is missing. A cabin bag is not it: every fare in this feed allows one, so a
 * filter that counted cabin bags would match everything and decide nothing.
 *
 * A fare whose baggage the supplier never described is neither included nor excluded. It is
 * kept out of BOTH counts and matches NEITHER option, because filing an unknown allowance
 * under "included" is the kind of guess that meets travellers at the airport check-in desk.
 */
export function baggageOf(f) {
  const b = f?.baggage;
  if (!b) return 'unknown';
  const kg = Number(b.checkedKg) || 0;
  const pieces = Number(b.checkedPieces) || 0;
  // Some feeds send the allowance fields but leave every one at 0 — that is a stated
  // hand-luggage fare, not silence, so it counts as excluded.
  if (kg > 0 || pieces > 0) return 'included';
  const stated = b.checkedKg != null || b.checkedPieces != null || b.handKg != null;
  return stated ? 'excluded' : 'unknown';
}

/** Every airline that operates a leg of this trip, upper-cased, no repeats. */
export function airlinesOf(f) {
  const codes = [...(f?.outLegs || []), ...(f?.retLegs || [])]
    .map((l) => String(l?.airline || '').trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(codes)];
}

/**
 * Which filter options are worth showing, with live counts.
 *
 * An option is offered only when it would actually change the list: at least one flight
 * matches it and at least one does not. That single rule removes the dead controls —
 * the return-time group on a one-way, and the "Direct flights" box when every result is
 * already direct.
 *
 * @returns {{outbound:Array, return:Array, direct:{count:number}|null, hasReturn:boolean}}
 */
export function flightFacets(flights) {
  const list = Array.isArray(flights) ? flights : [];
  const total = list.length;
  const hasReturn = list.some((f) => f?.retLegs?.length);

  const bandFacet = (pick) => {
    const counts = new Map();
    for (const f of list) {
      const id = bandOf(pick(f));
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    // Every readable flight in ONE band → ticking it changes nothing, ticking any other
    // empties the list. Either way the group is not a choice; don't render it.
    const present = TIME_BANDS.filter((b) => counts.get(b.id));
    if (present.length < 2) return [];
    return present.map((b) => ({ ...b, count: counts.get(b.id) }));
  };

  const directCount = list.filter((f) => stopsOf(f) === 0).length;

  // ── Flight type: direct / with stop(s) / all ──
  // Offered only when the set actually holds both kinds. On an all-direct result set the
  // three rows would read "12 / 0 / 12" — two of them dead, and "All flights" identical to
  // the one above it.
  const stopsCount = total - directCount;
  const type = directCount > 0 && stopsCount > 0
    ? { direct: directCount, stops: stopsCount, all: total }
    : null;

  // ── Baggage: hold luggage in the fare, or not ──
  // Fares whose allowance the supplier never sent are counted in neither, and the group is
  // offered only when both answers exist among the flights that DID state one.
  const withBags = list.filter((f) => baggageOf(f) === 'included').length;
  const withoutBags = list.filter((f) => baggageOf(f) === 'excluded').length;
  const baggage = withBags > 0 && withoutBags > 0
    ? { included: withBags, excluded: withoutBags }
    : null;

  // ── Airlines, busiest first ──
  // A flight counts under every airline that flies any of its legs, which is how a
  // traveller reads the list: tick AJet and you keep the trips AJet is part of.
  const airlineCounts = new Map();
  for (const f of list) {
    for (const code of airlinesOf(f)) airlineCounts.set(code, (airlineCounts.get(code) || 0) + 1);
  }
  const airlines = airlineCounts.size > 1
    ? [...airlineCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    : [];

  // ── Departure-time spans ──
  // The slider bounds are the real earliest and latest departure in the set, not a decorative
  // 00:00–23:59: dragging into an hour no flight leaves in is a move that can only ever empty
  // the list. A span of one minute is not a range, so that group is dropped.
  const spanOf = (pick) => {
    const mins = list.map((f) => minuteOf(pick(f))).filter((m) => m != null);
    if (!mins.length) return null;
    const min = Math.min(...mins), max = Math.max(...mins);
    return max > min ? { min, max } : null;
  };

  return {
    outbound: bandFacet(outDeparture),
    // A return-time filter on a one-way search can only ever empty the list.
    return: hasReturn ? bandFacet(retDeparture) : [],
    // Useless when everything is direct, and when nothing is.
    direct: directCount > 0 && directCount < total ? { count: directCount } : null,
    type,
    baggage,
    airlines,
    outboundSpan: spanOf(outDeparture),
    returnSpan: hasReturn ? spanOf(retDeparture) : null,
    total,
    hasReturn,
  };
}

/**
 * Apply the traveller's selection.
 *
 * Every group is "no constraint" until it is touched: an all-unticked checkbox group, a
 * slider still spanning the whole day, `type: 'all'`, `baggage: 'any'`. That is the
 * conventional reading, and the reason the modal opens showing everything.
 *
 * Groups AND together; options within a group OR. A flight whose departure time or baggage
 * cannot be read fails a group that HAS been narrowed — the alternative is quietly showing a
 * flight as matching a rule nobody can prove it meets.
 *
 * @param {Array} flights
 * @param {{
 *   outbound?:Set<string>|Array, return?:Set<string>|Array, direct?:boolean,
 *   type?:'all'|'direct'|'stops', baggage?:'any'|'included'|'excluded',
 *   airlines?:Array<string>, outboundRange?:Array<number>, returnRange?:Array<number>
 * }} sel
 */
export function applyFlightFilters(flights, sel = {}) {
  const list = Array.isArray(flights) ? flights : [];
  const out = toSet(sel.outbound);
  const ret = toSet(sel.return);
  const airlines = new Set((sel.airlines || []).map((c) => String(c).toUpperCase()));
  const outRange = isWholeDay(sel.outboundRange) ? null : sel.outboundRange;
  const retRange = isWholeDay(sel.returnRange) ? null : sel.returnRange;

  const inRange = (value, range) => {
    const m = minuteOf(value);
    if (m == null) return false;
    return m >= numAt(range, 0) && m <= numAt(range, 1);
  };

  return list.filter((f) => {
    // `direct: true` is the old boolean form of `type: 'direct'`; both still work.
    const type = sel.direct ? 'direct' : (sel.type || 'all');
    if (type === 'direct' && stopsOf(f) !== 0) return false;
    if (type === 'stops' && stopsOf(f) === 0) return false;

    if (sel.baggage && sel.baggage !== 'any' && baggageOf(f) !== sel.baggage) return false;

    if (airlines.size && !airlinesOf(f).some((c) => airlines.has(c))) return false;

    if (outRange && !inRange(outDeparture(f), outRange)) return false;
    if (retRange && !inRange(retDeparture(f), retRange)) return false;

    if (out.size) {
      const b = bandOf(outDeparture(f));
      if (!b || !out.has(b)) return false;
    }
    if (ret.size) {
      const b = bandOf(retDeparture(f));
      if (!b || !ret.has(b)) return false;
    }
    return true;
  });
}

export const SORTS = [
  { id: 'price',     label: 'Price (lowest first)' },
  { id: 'duration',  label: 'Duration (shortest first)' },
  { id: 'departure', label: 'Departure (earliest first)' },
];

/**
 * Sort a copy — never in place, because the caller's array is the fetch result that
 * `selectedFlight` indexes into.
 *
 * Flights whose sort key is unreadable sink to the bottom rather than scrambling the
 * order around them.
 */
export function sortFlights(flights, key = 'price') {
  const list = Array.isArray(flights) ? [...flights] : [];
  const rank = {
    price: (f) => numOr(f?.totalPrice),
    duration: (f) => numOr(durationOf(f)),
    departure: (f) => {
      const t = new Date(outDeparture(f)).getTime();
      if (!Number.isNaN(t)) return t;
      // Text-only times still sort sensibly within a single day.
      const h = hourOf(outDeparture(f));
      return h == null ? Infinity : h;
    },
  }[key] || ((f) => numOr(f?.totalPrice));

  return list.sort((a, b) => rank(a) - rank(b));
}

function numOr(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function toSet(v) {
  if (v instanceof Set) return v;
  return new Set(Array.isArray(v) ? v : []);
}
