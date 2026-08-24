/* ════════════════════════════════════════════════════════════════
   Shared flight data — a single deterministic generator consumed by
   both the Flights results page and the FlightDetail page, so the two
   screens never disagree about a flight. No randomness (stable across
   renders); all variety is derived from the flight index + route.
   ════════════════════════════════════════════════════════════════ */

import { airportName, airlineName, flightNumber } from '../../utils/flightNames';

const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const CABIN_MULT = { Economy: 1, 'Premium Economy': 1.55, Business: 2.8, First: 4.2 };

const AIRLINES = [
  { name: 'British Airways', code: 'BA', color: '#1d4d8f' },
  { name: 'Emirates',        code: 'EK', color: '#d71921' },
  { name: 'Lufthansa',       code: 'LH', color: '#05164d' },
  { name: 'KLM',             code: 'KL', color: '#00a1de' },
  { name: 'Turkish Airlines',code: 'TK', color: '#c70a0c' },
  { name: 'Qatar Airways',   code: 'QR', color: '#5c0632' },
  { name: 'easyJet',         code: 'U2', color: '#ff6600' },
  { name: 'TUI Airways',     code: 'BY', color: '#003580' },
  { name: 'Jet2',            code: 'LS', color: '#e4022d' },
  { name: 'Vueling',         code: 'VY', color: '#ffce00' },
];
const AIRCRAFT = ['Airbus A320neo', 'Boeing 737-800', 'Airbus A321', 'Boeing 787-9', 'Airbus A350-900', 'Boeing 777-300ER'];
const TERMINALS = ['Terminal 1', 'Terminal 2', 'Terminal 3', 'Terminal 5', 'Main Terminal'];
const LAYOVERS = [
  { city: 'Dubai', code: 'DXB' }, { city: 'Istanbul', code: 'IST' },
  { city: 'Doha', code: 'DOH' }, { city: 'Frankfurt', code: 'FRA' },
  { city: 'Amsterdam', code: 'AMS' }, { city: 'Munich', code: 'MUC' },
];
const DEP_TIMES = [375, 520, 690, 860, 585, 1300, 1370, 85, 970, 1170, 785, 420]; // minutes from midnight

const fmtMin = (total) => {
  const day = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  return { time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, day };
};
const durLabel = (min) => `${Math.floor(min / 60)}h ${pad(min % 60)}m`;

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return `${WK[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtDateShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MO[d.getMonth()]}`;
};
// Local parts, never toISOString(): these dates are local calendar days, and converting one
// to UTC rolls it back a day in any zone ahead of UTC — a default return date, and the
// default departure, both landed a day early for a traveller east of Greenwich.
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return localISO(d);
};
const todayPlus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localISO(d);
};

/* "London Heathrow (LHR)" / "Phuket, Thailand (HKT)" → {code, city, name} */
export function parseAirport(str, fallbackCode = 'DEP') {
  if (!str || typeof str !== 'string') return { code: fallbackCode, city: fallbackCode, name: fallbackCode };
  const m = str.match(/\(([A-Za-z]{3})\)/);
  const code = m ? m[1].toUpperCase() : str.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || fallbackCode;
  const labelPart = str.replace(/\s*\([^)]*\)\s*/, '').trim();
  const city = (labelPart.split(',')[0] || code).trim();
  return { code, city, name: labelPart || city };
}

/* Normalise the URLSearchParams from the Hero flight search into a context. */
export function buildContext(params) {
  const get = (k, d = '') => params.get(k) || d;
  const from = parseAirport(get('from'), 'LON');
  const to = parseAirport(get('to'), 'DXB');
  // A multi-city trip reaches this page as its FIRST flight plus the whole chain in `legs`;
  // the results below are that first flight, so like a one-way it has no return to price.
  const wanted = get('tripType', 'roundtrip');
  const tripType = wanted === 'oneway' || wanted === 'multicity' ? wanted : 'roundtrip';
  const depISO = get('date') || todayPlus(30);
  let retISO = get('returnDate');
  if (tripType === 'roundtrip' && !retISO) retISO = addDaysISO(depISO, 7);
  if (tripType !== 'roundtrip') retISO = '';
  const adults = Math.max(1, parseInt(get('adults', '1'), 10) || 1);
  const children = Math.max(0, parseInt(get('children', '0'), 10) || 0);
  const infants = Math.max(0, parseInt(get('infants', '0'), 10) || 0);
  const cabin = CABIN_MULT[get('cabin')] ? get('cabin') : 'Economy';
  const direct = get('direct') === 'true';
  // "BRU-AYT-2026-08-17|AYT-IST-2026-08-22" → one entry per flight. Empty for every other
  // trip type, so a caller can read it without having to ask which type this is first.
  const legs = (get('legs') || '')
    .split('|')
    .map((leg) => /^([A-Za-z]{3})-([A-Za-z]{3})-(\d{4}-\d{2}-\d{2})$/.exec(leg.trim()))
    .filter(Boolean)
    .map((m) => ({ from: m[1].toUpperCase(), to: m[2].toUpperCase(), date: m[3] }));

  return {
    from, to, tripType, depISO, retISO, legs,
    adults, children, infants, pax: adults + children + infants,
    cabin, direct,
    depLabel: fmtDate(depISO), retLabel: fmtDate(retISO),
  };
}

/**
 * A multi-city trip, split into the searches that can actually price it: ONE PER FLIGHT.
 *
 * The supplier prices a route at a time — one way, or out and back — so a three-flight trip
 * is three one-way searches, not one request. Each context is the parent search with its own
 * route and date swapped in, so everything downstream (the mapper, the cards, the filters)
 * goes on working on a plain one-way and needs to know nothing about multi-city.
 *
 * Because of that split the fares are separate one-ways added together, NOT a single
 * through-fare. The screens say so where the total is shown; a real through-fare would need
 * the supplier to price the whole itinerary in one call.
 */
export function legContexts(ctx) {
  const place = (code) => ({ code, city: airportName(code), name: airportName(code) });
  return (ctx.legs || []).map((leg, i) => ({
    ...ctx,
    tripType: 'oneway',
    from: place(leg.from),
    to: place(leg.to),
    depISO: leg.date,
    retISO: '',
    depLabel: fmtDate(leg.date),
    retLabel: '',
    legIndex: i,
  }));
}

/**
 * The fares chosen for each leg, assembled into ONE trip for the detail page and checkout.
 *
 * Shaped like any other mapped flight so the screens after this one need no special case:
 * `out` is the first flight and `legs` is all of them, the party total is the sum of the
 * legs' own totals, and every leg's bookable key rides along in `flightKeys` — the same
 * array a round trip already fills with two.
 */
export function combineTrip(flights, ctx) {
  const picked = flights.filter(Boolean);
  if (!picked.length) return null;
  const legs = picked.map((f) => f.out).filter(Boolean);
  // Summed from the legs' own per-adult fares, so the headline stays the same measure the
  // cards showed — not the party total divided by heads, which under-reports an adult on
  // any party carrying a child.
  const price = picked.reduce((s, f) => s + (Number(f.price) || 0), 0);
  const totalPrice = picked.reduce((s, f) => s + flightTotal(f), 0);
  return {
    id: `multi-${(ctx.legs || []).map((l) => `${l.from}${l.to}`).join('-')}`,
    out: legs[0] || null,
    ret: null,
    legs,
    price, origPrice: price, totalPrice,
    // No single fare priced this trip, so there are no supplier rows to state for it. The
    // fare summary shows the total and the legs it is made of instead of inventing a split.
    fareBreakdown: [],
    fareName: null,
    baggage: null,
    currency: picked[0]?.currency || 'EUR',
    cabin: null,
    pax: ctx.pax,
    tripType: 'multicity',
    totalMin: legs.reduce((s, l) => s + (l.durMin || 0), 0),
    flightKeys: picked.flatMap((f) => (Array.isArray(f.flightKeys) ? f.flightKeys : [])),
    flightKey: null,
    // What each flight cost on its own — the trip total is only honest if it can be shown
    // as the sum it is.
    legFares: picked.map((f) => ({
      price: Number(f.price) || 0,
      total: flightTotal(f),
      fareName: f.fareName || null,
    })),
    badge: '',
    live: picked.every((f) => f.live),
  };
}

export function paxLabel(ctx) {
  const parts = [];
  if (ctx.adults) parts.push(`${ctx.adults} Adult${ctx.adults > 1 ? 's' : ''}`);
  if (ctx.children) parts.push(`${ctx.children} Child${ctx.children > 1 ? 'ren' : ''}`);
  if (ctx.infants) parts.push(`${ctx.infants} Infant${ctx.infants > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function makeLeg(i, salt, dir, dep, arr, depISO, stopsN, durMin, depMin) {
  const airline = AIRLINES[(i + salt) % AIRLINES.length];
  const arrInfo = fmtMin(depMin + durMin);
  const depInfo = fmtMin(depMin);
  const stopsLabel = stopsN === 0 ? 'Non-stop' : `${stopsN} Stop${stopsN > 1 ? 's' : ''}`;
  const lay = stopsN > 0 ? LAYOVERS[(i + salt) % LAYOVERS.length] : null;
  return {
    dir,
    airline: airline.name, airlineCode: airline.code, color: airline.color,
    flightNo: `${airline.code} ${100 + ((i * 37 + salt * 13) % 880)}`,
    aircraft: AIRCRAFT[(i + salt) % AIRCRAFT.length],
    fromCode: dep.code, fromCity: dep.city, fromName: dep.name,
    fromTerminal: TERMINALS[(i + salt) % TERMINALS.length],
    toCode: arr.code, toCity: arr.city, toName: arr.name,
    toTerminal: TERMINALS[(i + salt + 2) % TERMINALS.length],
    depTime: depInfo.time, depDay: depInfo.day,
    arrTime: arrInfo.time, arrDay: arrInfo.day,
    depDateISO: depISO,
    durMin, durLabel: durLabel(durMin),
    stops: stopsN, stopsLabel,
    layover: lay ? { city: lay.city, code: lay.code, durLabel: durLabel(90 + ((i + salt) % 5) * 55) } : null,
  };
}

const outDurFor = (stops, i) => stops === 0 ? 360 + (i * 23) % 200
  : stops === 1 ? 660 + (i * 31) % 220
  : 1020 + (i * 19) % 240;

export function generateFlights(ctx) {
  const n = 16;
  const mult = CABIN_MULT[ctx.cabin] || 1;
  const list = [];
  for (let i = 0; i < n; i++) {
    let outStops = ctx.direct ? 0 : (i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : (i % 5 === 4 ? 2 : 1));
    const outDur = outDurFor(outStops, i);
    const outDepMin = DEP_TIMES[i % DEP_TIMES.length];
    const out = makeLeg(i, 0, 'out', ctx.from, ctx.to, ctx.depISO, outStops, outDur, outDepMin);

    let ret = null;
    if (ctx.tripType === 'roundtrip') {
      let retStops = ctx.direct ? 0 : ((i + 1) % 3 === 0 ? 0 : (i + 2) % 4 === 0 ? 2 : 1);
      const retDur = outDurFor(retStops, i + 3);
      const retDepMin = DEP_TIMES[(i + 5) % DEP_TIMES.length];
      ret = makeLeg(i, 4, 'ret', ctx.to, ctx.from, ctx.retISO, retStops, retDur, retDepMin);
    }

    const stopsPenalty = (out.stops + (ret ? ret.stops : 0)) * 14;
    const raw = (175 + (i * 43) % 470) * mult - stopsPenalty * mult;
    const price = Math.max(95, Math.round(raw / 5) * 5);
    const origPrice = Math.round((price * 1.09) / 5) * 5;
    const totalMin = out.durMin + (ret ? ret.durMin : 0);

    list.push({
      id: `${ctx.from.code}-${ctx.to.code}-${i + 1}`,
      out, ret, price, origPrice,
      currency: '€', cabin: ctx.cabin, pax: ctx.pax,
      tripType: ctx.tripType, totalMin, badge: '',
    });
  }

  // badges — computed across the full set
  if (list.length) {
    const cheapest = list.reduce((a, b) => (b.price < a.price ? b : a));
    cheapest.badge = 'Cheapest';
    const fastest = list.reduce((a, b) => (b.totalMin < a.totalMin ? b : a));
    if (fastest !== cheapest && !fastest.badge) fastest.badge = 'Fastest';
    const value = list
      .filter((f) => f.out.stops === 0 && !f.badge)
      .reduce((a, b) => (a == null || b.price < a.price ? b : a), null);
    if (value) value.badge = 'Best Value';
  }
  return list;
}

/* Map a raw Airtürk flight (from /flight-availability/search) to the card shape
   used across the flight results + detail screens. Defensive about datetime
   formats and roundtrip leg splitting. */
export function mapAirtuerkFlight(af, ctx, idx) {
  const segs = Array.isArray(af?.legs) ? af.legs.filter(Boolean) : [];
  if (!segs.length) return null;
  const toCode = (ctx.to.code || '').toUpperCase();
  const colorFor = (code) => AIRLINES.find((a) => a.code === code)?.color || '#1f4fd8';
  const timeOf = (s) => { const d = new Date(s); if (!isNaN(d.getTime())) return `${pad(d.getHours())}:${pad(d.getMinutes())}`; const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? `${pad(Number(m[1]))}:${m[2]}` : '--:--'; };
  const dayOf  = (s) => { const d = new Date(s); return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 86400000); };
  const durBetween = (a, b) => { const da = new Date(a), db = new Date(b); if (isNaN(da.getTime()) || isNaN(db.getTime())) return null; const mins = Math.round((db - da) / 60000); return mins > 0 ? mins : null; };

  let outSegs = segs, retSegs = [];
  if (ctx.tripType === 'roundtrip' && segs.length > 1) {
    let splitIdx = segs.findIndex((s) => (s.to || '').toUpperCase() === toCode);
    if (splitIdx < 0 || splitIdx >= segs.length - 1) splitIdx = Math.floor(segs.length / 2) - 1;
    outSegs = segs.slice(0, splitIdx + 1);
    retSegs = segs.slice(splitIdx + 1);
  }

  // `dir` matters: the baggage tab labels each block by it, and a live leg used to carry no
  // direction at all, so both halves of a round trip were headed "Return".
  const buildLeg = (ls, depDateISO, fromFb, toFb, dir, bag) => {
    if (!ls.length) return null;
    const a = ls[0], b = ls[ls.length - 1];
    const depDay = dayOf(a.departure), arrDay = dayOf(b.arrival);
    const dayOffset = (depDay != null && arrDay != null) ? Math.max(0, arrDay - depDay) : 0;
    let durMin = durBetween(a.departure, b.arrival);
    if (durMin == null) durMin = ls.reduce((s, x) => s + (Number(x.duration) || 0), 0) || null;
    const stops = ls.length - 1;
    const fromCode = String(a.from || fromFb.code || '').toUpperCase();
    const toCode2 = String(b.to || toFb.code || '').toUpperCase();
    // Real connections, measured from the gap between one segment landing and the next
    // taking off. Live legs used to report `layover: null` however many stops they had, so
    // a 1-stop fare showed a connection count and never said where, or for how long.
    const layovers = ls.slice(1).map((s, i) => {
      const code = String(s.from || ls[i].to || '').toUpperCase();
      if (!code) return null;
      const wait = durBetween(ls[i].arrival, s.departure);
      return { code, city: airportName(code), durLabel: wait ? `${Math.floor(wait / 60)}h ${pad(wait % 60)}m` : null };
    }).filter(Boolean);
    return {
      dir,
      airline: airlineName(a.airline), airlineCode: a.airline || '--', color: colorFor(a.airline),
      flightNo: flightNumber(a),
      // Airtuerk sends no aircraft type. The screens omit the chip rather than print a blank.
      aircraft: '',
      depTime: timeOf(a.departure), arrTime: timeOf(b.arrival), arrDay: dayOffset,
      fromCode, toCode: toCode2,
      fromCity: airportName(fromCode), toCity: airportName(toCode2),
      fromName: airportName(fromCode), toName: airportName(toCode2),
      // No terminal in the feed either - an empty string, never a guessed "Terminal 1".
      fromTerminal: '', toTerminal: '',
      depDateISO: depDateISO || ctx.depISO,
      durMin: durMin || 0, durLabel: durMin ? `${Math.floor(durMin / 60)}h ${pad(durMin % 60)}m` : '—',
      stops, stopsLabel: stops === 0 ? 'Non-stop' : `${stops} Stop${stops > 1 ? 's' : ''}`,
      layover: layovers[0] || null,
      layovers,
      // The supplier's real allowance for THIS direction. The baggage tab reads it off the
      // leg; it was never wired up, so every live fare fell through to "confirmed with your
      // fare" even when Airtuerk had stated the kilos.
      baggage: bag || null,
    };
  };

  const out = buildLeg(outSegs, ctx.depISO, ctx.from, ctx.to, 'out', af?.outbound?.baggage || af?.baggage);
  const ret = retSegs.length ? buildLeg(retSegs, ctx.retISO, ctx.to, ctx.from, 'ret', af?.inbound?.baggage || af?.baggage) : null;
  // Airtuerk's `totalPrice` is the PARTY total: parseOption() sums (base + tax) x quantity
  // across every passenger type, and a round trip adds both directions on top. The cards,
  // the detail page and the checkout all speak PER PERSON, so it is divided here — once —
  // instead of being shown as a per-person figure and then multiplied by the party again,
  // which is what made a 2-traveller fare read at exactly double on both lines of the card.
  // The exact supplier total rides along untouched: it is the number the server re-prices
  // against, so it must never be reconstructed from a rounded per-person figure.
  const totalPrice = Number(af.totalPrice) || 0;
  const paxCount = Math.max(1, Number(ctx.pax) || 1);
  const fareRows = Array.isArray(af.fareBreakdown) ? af.fareBreakdown : [];
  // The headline is the fare for ONE ADULT, taken from the supplier's own per-passenger-type
  // rows (a round trip carries an ADT row per direction, so they sum to the full adult trip).
  // Splitting the party total by headcount instead would quietly under-report the adult fare
  // on any party carrying a child or a lap infant, who are fared far lower.
  const perAdult = adultFare({ fareBreakdown: fareRows });
  const price = Math.round(perAdult != null ? perAdult : totalPrice / paxCount);
  return {
    id: `air-${ctx.from.code}-${ctx.to.code}-${idx + 1}`,
    out, ret, price, origPrice: price, totalPrice,
    fareBreakdown: fareRows,
    baggage: af.baggage || null,
    // The airline's own name for this fare — ECOJET, SUNVALUE, Saver. It is what actually
    // separates two fares on the same flight (and tracks the baggage allowance), and it is
    // what the screens show where they used to print a cabin class the supplier never stated.
    fareName: af.fareName || null,
    // Cabin class is NOT claimed for a live fare: the search never sends the traveller's
    // cabin choice to Airtuerk and the response never states one back, so printing the
    // dropdown value here asserted "Business" over whatever the supplier actually priced.
    currency: af.currency || 'EUR', cabin: null, pax: ctx.pax,
    tripType: ctx.tripType, totalMin: (out?.durMin || 0) + (ret?.durMin || 0),
    // Opaque Airtuerk bookable key(s) — required by the live reservation flow.
    // Round trips carry two keys (outbound + return); one-way carries one.
    flightKey: af.flightKey || null,
    flightKeys: Array.isArray(af.flightKeys) && af.flightKeys.length
      ? af.flightKeys
      : (af.flightKey ? [af.flightKey] : []),
    badge: '', live: true,
  };
}

/* Assign Cheapest / Fastest badges across a mapped set (mutates in place). */
export function badgeFlights(list) {
  if (!list.length) return list;
  const cheapest = list.reduce((a, b) => (b.price < a.price ? b : a));
  cheapest.badge = 'Cheapest';
  const fastest = list.reduce((a, b) => (b.totalMin < a.totalMin ? b : a));
  if (fastest !== cheapest && !fastest.badge) fastest.badge = 'Fastest';
  return list;
}

/* Build a price breakdown + fare facts from a flight (used by detail + checkout). */
/** The whole-trip fare for ONE adult, from the supplier's per-passenger-type rows. */
export function adultFare(flight) {
  const rows = Array.isArray(flight?.fareBreakdown) ? flight.fareBreakdown : [];
  const adt = rows.filter((r) => r && r.paxType === 'ADT' && Number(r.quantity) > 0);
  if (!adt.length) return null;
  const sum = adt.reduce((s, r) => s + (Number(r.totalPerPax) || 0), 0);
  return sum > 0 ? sum : null;
}

export function fareBreakdown(flight) {
  const pax = Math.max(1, flight.pax || 1);
  // A LIVE fare carries the supplier's exact party total; the sample generator prices per
  // person, so there the total is still price x pax.
  const total = Number.isFinite(flight.totalPrice) ? flight.totalPrice : flight.price * pax;
  const rows = Array.isArray(flight.fareBreakdown) ? flight.fareBreakdown : [];
  // The supplier states a real base fare per passenger type; everything above it is tax and
  // carrier surcharge, taken as the REMAINDER so the rows always add up to the amount that
  // will be charged. This used to invent the split with fixed 74% / 17% ratios and print the
  // leftover as an "airline fuel surcharge" - a line item no supplier field ever described.
  // When the fare states nothing, nothing is claimed: the summary shows the total alone.
  const stated = rows.length
    ? rows.reduce((s, r) => s + (Number(r.basePrice) || 0) * (Number(r.quantity) || 0), 0)
    : 0;
  const known = stated > 0 && stated <= total;
  const discount = flight.origPrice > flight.price ? (flight.origPrice - flight.price) * pax : 0;
  return {
    pax,
    baseFare: known ? stated : null,
    taxes: known ? total - stated : null,
    discount,
    total,
    // Unrounded on purpose: the checkout multiplies this back by the traveller count, so a
    // rounded figure would drift from the total the server charges.
    perPerson: total / pax,
    perAdult: adultFare(flight),
  };
}

/** The party total for a mapped flight — the supplier's own figure when it has one. */
export function flightTotal(flight) {
  return Number.isFinite(flight?.totalPrice)
    ? flight.totalPrice
    : (flight?.price || 0) * Math.max(1, flight?.pax || 1);
}
