/* ════════════════════════════════════════════════════════════════
   Shared flight data — a single deterministic generator consumed by
   both the Flights results page and the FlightDetail page, so the two
   screens never disagree about a flight. No randomness (stable across
   renders); all variety is derived from the flight index + route.
   ════════════════════════════════════════════════════════════════ */

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
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};
const todayPlus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
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
  const tripType = get('tripType', 'roundtrip') === 'oneway' ? 'oneway' : 'roundtrip';
  const depISO = get('date') || todayPlus(30);
  let retISO = get('returnDate');
  if (tripType === 'roundtrip' && !retISO) retISO = addDaysISO(depISO, 7);
  if (tripType === 'oneway') retISO = '';
  const adults = Math.max(1, parseInt(get('adults', '1'), 10) || 1);
  const children = Math.max(0, parseInt(get('children', '0'), 10) || 0);
  const infants = Math.max(0, parseInt(get('infants', '0'), 10) || 0);
  const cabin = CABIN_MULT[get('cabin')] ? get('cabin') : 'Economy';
  const direct = get('direct') === 'true';
  return {
    from, to, tripType, depISO, retISO,
    adults, children, infants, pax: adults + children + infants,
    cabin, direct,
    depLabel: fmtDate(depISO), retLabel: fmtDate(retISO),
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

/* Build a price breakdown + fare facts from a flight (used by detail + checkout). */
export function fareBreakdown(flight) {
  const pax = flight.pax || 1;
  const perPersonBase = Math.round(flight.price * 0.74);
  const taxes = Math.round(flight.price * 0.17);
  const surcharge = flight.price - perPersonBase - taxes; // remainder
  const discount = flight.origPrice > flight.price ? flight.origPrice - flight.price : 0;
  return {
    pax,
    baseFare: perPersonBase * pax,
    taxes: taxes * pax,
    surcharge: surcharge * pax,
    discount: discount * pax,
    total: flight.price * pax,
    perPerson: flight.price,
  };
}
