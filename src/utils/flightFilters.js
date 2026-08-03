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

  return {
    outbound: bandFacet(outDeparture),
    // A return-time filter on a one-way search can only ever empty the list.
    return: hasReturn ? bandFacet(retDeparture) : [],
    // Useless when everything is direct, and when nothing is.
    direct: directCount > 0 && directCount < total ? { count: directCount } : null,
    hasReturn,
  };
}

/**
 * Apply the traveller's selection.
 *
 * An empty band selection means "no constraint" — the conventional reading of an
 * all-unticked checkbox group, and the reason the modal opens showing everything.
 *
 * @param {Array} flights
 * @param {{outbound?:Set<string>|Array, return?:Set<string>|Array, direct?:boolean}} sel
 */
export function applyFlightFilters(flights, sel = {}) {
  const list = Array.isArray(flights) ? flights : [];
  const out = toSet(sel.outbound);
  const ret = toSet(sel.return);

  return list.filter((f) => {
    if (sel.direct && stopsOf(f) !== 0) return false;
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
  { id: 'price',     label: 'Price' },
  { id: 'duration',  label: 'Duration' },
  { id: 'departure', label: 'Departure' },
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
