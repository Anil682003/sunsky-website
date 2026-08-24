/**
 * The last search the traveller ran, remembered for a week.
 *
 * Someone shopping for a holiday comes back three or four times before they book, and every
 * visit started them at an empty destination field, no dates and the default departure
 * airport — so they re-entered the same trip each time. This keeps what they last searched
 * for and puts it back in the home-page form, whether or not they have an account: it lives
 * in the browser, so a guest is remembered exactly like a signed-in visitor.
 *
 * FOUR RULES DECIDE WHAT IS KEPT AND FOR HOW LONG:
 *
 * 1. WHO IS TRAVELLING IS NOT STORED HERE. The party lives in utils/paxStore on a deliberate
 *    48-hour window, because it holds children's dates of birth — personal data belonging to
 *    someone who cannot consent to it being kept. Copying the party in here would quietly
 *    stretch that window to a week. This module holds the TRIP: where, when, how long, how
 *    they are getting there. The two restore independently and keep their own clocks.
 *
 * 2. A LINK ALWAYS WINS. This is a fallback for an empty form, never an override. A visitor
 *    arriving on a shared search must see the search they were sent, not last week's.
 *
 * 3. A DEPARTURE DATE IN THE PAST IS DROPPED, NOT RESTORED. A week is long enough for the
 *    date to have been and gone, and quietly reinstating it either errors or prices a trip
 *    that cannot be taken. Everything else survives — the destination and the party are still
 *    right, so the traveller only has to pick new dates.
 *
 * 4. IT EXPIRES AFTER SEVEN DAYS, and the window slides on each save, so it measures time
 *    away from the site. Past it the record is deleted from the browser rather than ignored,
 *    which is why `purgeSearch()` runs on import.
 *
 * Storage is best-effort: blocked (Safari private mode) or full storage means the traveller
 * fills the form in again, which is exactly where they stood before this existed.
 */

const KEY = 'sunsky.lastSearch';

/** How long a remembered search survives without being re-saved. */
export const SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Ceilings that reject nonsense (a hand-edited record, a truncated write) without rejecting real searches. */
const MAX_COUNTRIES = 20;
const MAX_PLACES = 40;
const MAX_ORIGINS = 30;

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

/** Today in the browser's own timezone — the traveller's "today", not UTC's. */
const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A stored date is only worth restoring while it is still in the future (rule 3). */
const futureDate = (v) => (isIsoDate(v) && v >= todayISO() ? v : '');

/**
 * Keep only the fields the picker actually needs to rebuild a selection.
 *
 * Whatever the destination modal handed over may carry flags, counts and nested lists that
 * were true when it was open; storing the shape wholesale would put a week-old copy of that
 * back into the form. `code` is what the search sends and `name` is what the field shows.
 */
const cleanCountries = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((c) => c && (c.code || c.id))
    .slice(0, MAX_COUNTRIES)
    .map((c) => ({ id: c.id ?? null, code: str(c.code, 8), name: str(c.name) }));

const cleanPlaces = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((p) => p && p.code && (p.type === 'city' || p.type === 'region'))
    .slice(0, MAX_PLACES)
    .map((p) => ({
      type: p.type,
      code: str(p.code, 8),
      name: str(p.name),
      countryId: p.countryId ?? null,
      countryCode: str(p.countryCode, 8),
    }));

const cleanOrigins = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((c) => typeof c === 'string' && /^[A-Za-z]{3}$/.test(c))
    .slice(0, MAX_ORIGINS)
    .map((c) => c.toUpperCase());

/**
 * Normalise a record on the way in or out.
 *
 * Returns null only when there is nothing worth restoring — a record with neither a
 * destination nor a date would put the traveller back exactly where an empty form does.
 */
const normalise = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const countries = cleanCountries(raw.countries);
  const places = cleanPlaces(raw.places);
  const flex = Number(raw.flexDays);

  const rec = {
    mode: raw.mode === 'flight' ? 'flight' : 'package',

    // Package tab
    countries,
    places,
    date: isIsoDate(raw.date) ? raw.date : '',
    flexDays: Number.isFinite(flex) && flex >= 0 && flex <= 3 ? Math.floor(flex) : 0,
    duration: str(raw.duration, 40),
    transport: raw.transport === 'hotel_only' ? 'hotel_only' : 'package',
    origins: cleanOrigins(raw.origins),

    // Flight tab — free text as typed, since the field itself is a label ("Brussels (BRU)").
    flightFrom: str(raw.flightFrom),
    flightTo: str(raw.flightTo),
    flightDate: isIsoDate(raw.flightDate) ? raw.flightDate : '',
    flightReturnDate: isIsoDate(raw.flightReturnDate) ? raw.flightReturnDate : '',
    cabinClass: str(raw.cabinClass, 30),
    tripType: raw.tripType === 'oneway' ? 'oneway' : 'roundtrip',
    directOnly: raw.directOnly === true,
  };

  const hasTrip = rec.countries.length || rec.places.length || rec.date;
  const hasFlight = rec.flightTo || rec.flightDate;
  return hasTrip || hasFlight ? rec : null;
};

/** Read the raw record with its timestamp. Null if absent, unparseable, or storage is blocked. */
const readRaw = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
};

/**
 * Delete an expired record.
 *
 * Runs on import as well as on every read, so the week is enforced by the clock rather than
 * by someone happening to open the home page. A record with no timestamp is treated as
 * expired: it predates this format and its age cannot be established.
 */
export const purgeSearch = () => {
  const raw = readRaw();
  if (!raw) return false;
  const at = Number(raw.at);
  if (Number.isFinite(at) && Date.now() - at < SEARCH_TTL_MS) return false;
  try { localStorage.removeItem(KEY); } catch { /* blocked storage: nothing to remove from */ }
  return true;
};

/**
 * The last search, ready to drop into the form — or null if there is none, it has expired, or
 * nothing in it is still worth restoring.
 *
 * Dates that have since passed come back empty (rule 3) while the rest of the trip survives.
 */
export const loadSearch = () => {
  if (purgeSearch()) return null;
  const rec = normalise(readRaw());
  if (!rec) return null;
  return {
    ...rec,
    date: futureDate(rec.date),
    flightDate: futureDate(rec.flightDate),
    // A return that is now in the past is meaningless even if the outbound survived.
    flightReturnDate: futureDate(rec.flightReturnDate),
  };
};

/**
 * Remember this search, and restart the week.
 *
 * Called with what the traveller has just SEARCHED — not with a draft they are still filling
 * in, and not with the page's own defaults, which would keep a record alive purely because
 * someone visited. Rejected input leaves whatever was stored alone.
 */
export const saveSearch = (search) => {
  const rec = normalise(search);
  if (!rec) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...rec, at: Date.now() }));
  } catch { /* full or blocked — the search still stands for this session */ }
  return rec;
};

/** Forget the last search outright. */
export const clearSearch = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing to remove from */ }
};

/**
 * Does this query string already describe a search?
 *
 * Rule 2: when it does, the address bar is the answer and nothing here is consulted, so a
 * shared link opens the trip it was sent for.
 *
 * @param {URLSearchParams} params
 */
export const hasSearchParams = (params) =>
  !!params && ['destination', 'countries', 'cities', 'regions', 'checkIn', 'to', 'date']
    .some((k) => params.has(k));

// Enforce the window at load, whatever page the visitor lands on.
purgeSearch();
