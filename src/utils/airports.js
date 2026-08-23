// Departure airports the agency sells FROM. These are the §25 Sunsky master airports.
//
// The list is now MASTER DATA held in the admin dashboard (`terminals.isDeparture`) and
// fetched at runtime — the spec (§25) forbids hard-coding it in frontend components. The
// array below is a SEED/fallback: it is the same §25 list, so the site is correct offline
// and in tests, and `setDepartureAirports()` overrides it once the admin list loads (an
// airport the team adds in the dashboard then appears with no website release).
//
// Codes are IATA and go straight to the flight supplier as `from`.
const SEED_DEPARTURE_AIRPORTS = [
  { code: 'BRU', label: 'Brussels Airport',          city: 'Brussels',   country: '🇧🇪', popular: true },
  { code: 'CRL', label: 'Brussels South Charleroi',  city: 'Charleroi',  country: '🇧🇪', popular: true },
  { code: 'AMS', label: 'Amsterdam Schiphol',        city: 'Amsterdam',  country: '🇳🇱', popular: true },
  { code: 'EIN', label: 'Eindhoven',                 city: 'Eindhoven',  country: '🇳🇱', popular: true },
  { code: 'ANR', label: 'Antwerp',                   city: 'Antwerp',    country: '🇧🇪' },
  { code: 'OST', label: 'Ostend-Bruges',             city: 'Ostend',     country: '🇧🇪' },
  { code: 'LGG', label: 'Liège',                     city: 'Liège',      country: '🇧🇪' },
  { code: 'RTM', label: 'Rotterdam The Hague',       city: 'Rotterdam',  country: '🇳🇱' },
  { code: 'GRQ', label: 'Groningen',                 city: 'Groningen',  country: '🇳🇱' },
  { code: 'MST', label: 'Maastricht',                city: 'Maastricht', country: '🇳🇱' },
  { code: 'DUS', label: 'Düsseldorf',                city: 'Düsseldorf', country: '🇩🇪' },
  { code: 'NRN', label: 'Weeze (Niederrhein)',       city: 'Weeze',      country: '🇩🇪' },
  { code: 'CGN', label: 'Cologne/Bonn',              city: 'Cologne',    country: '🇩🇪' },
  { code: 'BRE', label: 'Bremen',                    city: 'Bremen',     country: '🇩🇪' },
  { code: 'PAD', label: 'Paderborn',                 city: 'Paderborn',  country: '🇩🇪' },
  { code: 'FMO', label: 'Münster/Osnabrück',         city: 'Münster',    country: '🇩🇪' },
  { code: 'FRA', label: 'Frankfurt',                 city: 'Frankfurt',  country: '🇩🇪' },
  { code: 'DTM', label: 'Dortmund',                  city: 'Dortmund',   country: '🇩🇪' },
  { code: 'LIL', label: 'Lille',                     city: 'Lille',      country: '🇫🇷' },
];

// Where a search departs from unless the traveller says otherwise.
export const DEFAULT_ORIGIN = 'BRU';

// The seed is exported (back-compat) AND drives the initial picker/tests. `POPULAR_AIRPORTS`
// / `OTHER_AIRPORTS` / `AIRPORT_CODES` stay static snapshots of the seed so existing imports
// and tests keep working; live/fetched data is served through `useDepartureAirports()`.
export const DEPARTURE_AIRPORTS = SEED_DEPARTURE_AIRPORTS;
export const AIRPORT_CODES = SEED_DEPARTURE_AIRPORTS.map((a) => a.code);
export const POPULAR_AIRPORTS = SEED_DEPARTURE_AIRPORTS.filter((a) => a.popular);
export const OTHER_AIRPORTS = SEED_DEPARTURE_AIRPORTS.filter((a) => !a.popular);

// ── City names for the picker ────────────────────────────────────────────────
// The picker lists airports as CITY + IATA code ("Brussels BRU"), never the terminal's own
// name ("Brussels Airport"): the code already says WHICH airport it is, so repeating
// "Airport" on every row costs width and tells the traveller nothing.
//
// The dashboard writes its terminals as "City, Airport name" ("Brussel, Brussel Nationale
// Airport"), so the city is usually right there in front of the comma — and in the agency's
// own wording and language, which is what the traveller should read ("Brussel", "Keulen",
// "Rijsel"). The city shown is therefore:
//   1. the part before the comma, when the name carries one,
//   2. else an explicit label below, for airports whose name is not their city at all
//      (Brussels South Charleroi is in Charleroi; CDG and Orly are both Paris),
//   3. else the name with the airport words stripped off it,
//   4. else whatever the source called the city, else the code itself.
// The map is keyed by IATA, so an airport the team renames in the dashboard still reads right.
const CITY_LABELS = {
  CRL: 'Charleroi',
  OST: 'Ostend',
  RTM: 'Rotterdam',
  MST: 'Maastricht',
  CGN: 'Cologne',
  BVA: 'Beauvais',
  CDG: 'Paris',
  ORY: 'Paris',
  LYS: 'Lyon',
  MRS: 'Marseille',
  NCE: 'Nice',
  TLS: 'Toulouse',
  BOD: 'Bordeaux',
  NTE: 'Nantes',
  HHN: 'Hahn',
  LHR: 'London',
  LGW: 'London',
  STN: 'London',
  LTN: 'London',
  LCY: 'London',
};

// "Antwerp International Airport" → "Antwerp", "Amsterdam Schiphol Airport" → "Amsterdam",
// "Weeze (Niederrhein)" → "Weeze", "Münster/Osnabrück" → "Münster".
const AIRPORT_WORDS = /\s+(?:international|intl\.?|airport|airfield|aeroport|aéroport|flughafen|luchthaven|schiphol)\b.*$/i;

export function cityFromName(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')   // drop "(Deurne)"
    .split(',')[0]                // "Brussel, Brussel Nationale Airport" → "Brussel"
    .split('/')[0]                // "Cologne/Bonn" → "Cologne"
    .replace(AIRPORT_WORDS, '')   // drop "… Airport" and everything after it
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The city an airport is listed under in the picker (see CITY_LABELS above). */
export function displayCity({ code, name, label, city } = {}) {
  const c = String(code || '').toUpperCase();
  const src = String(name || label || '');
  // A source that writes "City, Airport name" has already said what the city is called —
  // trust it over the curated label, which would otherwise translate the agency's own list.
  if (src.includes(',')) return cityFromName(src) || CITY_LABELS[c] || city || c;
  return CITY_LABELS[c] || cityFromName(src) || city || c;
}

// ── Country flags ────────────────────────────────────────────────────────────
// Airports carry their country as a flag EMOJI (🇧🇪). Windows ships no flag glyphs, so that
// emoji renders there as the bare letters "BE" — the picker draws a real flag image instead
// and needs the ISO code back out of the emoji the list was built from.
export function isoFromFlagEmoji(flag) {
  const letters = [...String(flag || '')]
    .map((ch) => ch.codePointAt(0))
    .filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
    .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65));
  return letters.length === 2 ? letters.join('') : '';
}

/** ISO country code for an airport record, however that record carries its country. */
export const airportIso = (a) =>
  String(a?.countryIso || '').toUpperCase() || isoFromFlagEmoji(a?.country || a?.flag);

// ── Runtime registry: seeded, overridable by the admin master list ───────────
let _registry = SEED_DEPARTURE_AIRPORTS.slice();
let _byCode = new Map(_registry.map((a) => [a.code, a]));

/**
 * Replace/extend the departure-airport registry from the admin master list. Merges onto the
 * seed so a partial admin response never drops a known airport, and keeps the label/city/flag
 * the dashboard provides. Safe to call repeatedly; ignores an empty list.
 * @param {{code,name?,label?,city?,flag?,country?,popular?,sortOrder?}[]} list
 */
export function setDepartureAirports(list) {
  if (!Array.isArray(list) || !list.length) return;
  const merged = new Map(_byCode);
  for (const a of list) {
    if (!a || !a.code) continue;
    const code = String(a.code).toUpperCase();
    const prev = merged.get(code);
    merged.set(code, {
      code,
      label: a.label || a.name || prev?.label || code,
      // The dashboard's own `city` is derived from the terminal name and can still read as
      // an airport ("Antwerp International"), so the curated/derived city wins over it.
      city: displayCity({ code, name: a.name || a.label, city: a.city || prev?.city }) || code,
      country: a.country || a.flag || prev?.country || '',
      countryIso: String(a.countryIso || prev?.countryIso || '').toUpperCase()
        || isoFromFlagEmoji(a.country || a.flag) || '',
      popular: a.popular ?? prev?.popular ?? false,
      sortOrder: a.sortOrder ?? prev?.sortOrder ?? 999,
      available: a.available,   // §26 validity when annotated, else undefined
    });
  }
  _registry = [...merged.values()].sort((x, y) => (x.sortOrder ?? 999) - (y.sortOrder ?? 999));
  _byCode = new Map(_registry.map((a) => [a.code, a]));
}

/** The current registry (seed until the admin list loads). */
export function getDepartureAirports() { return _registry; }

/** Airport name for a code — falls back to the code itself so an unknown one still prints. */
export const airportLabel = (code) => _byCode.get(String(code || '').toUpperCase())?.label || code || '';

/** Short name for tight spaces (chips, the collapsed search bar). */
export const airportCity = (code) => _byCode.get(String(code || '').toUpperCase())?.city || code || '';

/**
 * Normalise anything arriving from a URL. An origin the agency doesn't fly from would be
 * handed to the supplier verbatim and come back empty with no explanation, so an unknown
 * code falls back to the default rather than being trusted.
 */
export const normaliseOrigin = (code) => {
  const c = String(code || '').trim().toUpperCase();
  return _byCode.has(c) ? c : DEFAULT_ORIGIN;
};

/**
 * How an airport is written into the flight search's From/To fields:
 * "Brussel, Brussel Nationale Airport (BRU)".
 *
 * The code in brackets is the part that matters — utils/flightData's `parseAirport` reads it
 * back out, and it is what the supplier is ultimately asked to fly. The city is written first
 * because the field shows the head of the string as its headline ("Brussel (BRU)") and the
 * whole of it as the hint beneath.
 *
 * Takes the shape /website/geo/airports returns: {code, name, city}. An entry with no airport
 * name of its own (the curated destination shortlist: "Hurghada", Egypt) is written as the
 * city alone rather than repeating it twice.
 */
export const airportToValue = (a) => {
  if (!a?.code) return '';
  const label = a.name && a.city && a.name !== a.city
    ? `${a.city}, ${a.name}`
    : (a.city || a.name || a.code);
  return `${label} (${a.code})`;
};
