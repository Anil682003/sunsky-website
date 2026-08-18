// Departure airports the agency sells from — the Belgian/Benelux catchment plus the two
// German/French border fields Belgian travellers routinely drive to.
//
// This list used to exist TWICE and the two copies disagreed: the hero search offered
// ANR/OST/LGG/LIL, the hotel page offered RTM/NRN/DUS, and neither offered the other's.
// A traveller could therefore pick an airport on one screen that the next screen could not
// represent, so the choice was silently dropped back to Brussels. One list, one truth.
//
// `popular` drives the short list shown first in the picker; everything else sits under
// "All airports". Codes are IATA and go straight to the flight supplier as `from`.

export const DEPARTURE_AIRPORTS = [
  { code: 'BRU', label: 'Brussels Airport',          city: 'Brussels',  country: '🇧🇪', popular: true },
  { code: 'CRL', label: 'Brussels South Charleroi',  city: 'Charleroi', country: '🇧🇪', popular: true },
  { code: 'AMS', label: 'Amsterdam Schiphol',        city: 'Amsterdam', country: '🇳🇱', popular: true },
  { code: 'EIN', label: 'Eindhoven',                 city: 'Eindhoven', country: '🇳🇱', popular: true },
  { code: 'ANR', label: 'Antwerp',                   city: 'Antwerp',   country: '🇧🇪' },
  { code: 'OST', label: 'Ostend-Bruges',             city: 'Ostend',    country: '🇧🇪' },
  { code: 'LGG', label: 'Liège',                     city: 'Liège',     country: '🇧🇪' },
  { code: 'RTM', label: 'Rotterdam The Hague',       city: 'Rotterdam', country: '🇳🇱' },
  { code: 'NRN', label: 'Weeze (Niederrhein)',       city: 'Weeze',     country: '🇩🇪' },
  { code: 'DUS', label: 'Düsseldorf',                city: 'Düsseldorf',country: '🇩🇪' },
  { code: 'LIL', label: 'Lille',                     city: 'Lille',     country: '🇫🇷' },
];

// Where a search departs from unless the traveller says otherwise.
export const DEFAULT_ORIGIN = 'BRU';

export const AIRPORT_CODES = DEPARTURE_AIRPORTS.map((a) => a.code);
export const POPULAR_AIRPORTS = DEPARTURE_AIRPORTS.filter((a) => a.popular);
export const OTHER_AIRPORTS   = DEPARTURE_AIRPORTS.filter((a) => !a.popular);

const BY_CODE = new Map(DEPARTURE_AIRPORTS.map((a) => [a.code, a]));

/** Airport name for a code — falls back to the code itself so an unknown one still prints. */
export const airportLabel = (code) => BY_CODE.get(String(code || '').toUpperCase())?.label || code || '';

/** Short name for tight spaces (chips, the collapsed search bar). */
export const airportCity = (code) => BY_CODE.get(String(code || '').toUpperCase())?.city || code || '';

/**
 * Normalise anything arriving from a URL. An origin the agency doesn't fly from would be
 * handed to the supplier verbatim and come back empty with no explanation, so an unknown
 * code falls back to the default rather than being trusted.
 */
export const normaliseOrigin = (code) => {
  const c = String(code || '').trim().toUpperCase();
  return BY_CODE.has(c) ? c : DEFAULT_ORIGIN;
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
