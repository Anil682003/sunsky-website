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
      city: a.city || prev?.city || code,
      country: a.country || a.flag || prev?.country || '',
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
