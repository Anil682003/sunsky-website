/**
 * The travelling company, remembered between visits.
 *
 * Who is travelling barely changes — a family of four is a family of four next Tuesday too —
 * yet every entry point started the traveller back at "2 adults, no children" and asked for
 * each child's birthday again. This keeps the last committed party so a search resumed on the
 * home page, on the results list or straight on a hotel page starts from the answers already
 * given.
 *
 * THREE RULES DECIDE EVERYTHING HERE:
 *
 * 1. A LINK ALWAYS WINS. This is a fallback, never an override. If the address bar carries an
 *    occupancy the page uses that and does not look here at all, otherwise opening a friend's
 *    "2 adults" hotel link would silently re-price it for the visitor's own three-and-a-child
 *    and quote a holiday nobody asked for. Callers enforce this; see `hasPaxParams`.
 *
 * 2. IT EXPIRES AFTER 48 HOURS. A child's date of birth is personal data belonging to someone
 *    who cannot consent, so it is not kept indefinitely on the strength of being convenient.
 *    Past the window the whole record — dates included — is deleted from the browser rather
 *    than merely ignored, which is why `purgePax()` runs when this module is first imported:
 *    any page of the site, even one that never asks for an occupancy, clears an expired record
 *    as it loads. The window slides on each save, so it measures time AWAY from the site.
 *
 * 3. DATES ARE THE TRUTH, AGES ARE DERIVED. Ages are stored only so a child whose birthday was
 *    never filled in still has something to price against; wherever a date exists the age is
 *    recomputed for the check-in actually being searched (`agesForCheckIn`). A stored age is a
 *    snapshot of a date that keeps moving — a nine-year-old saved on Friday is ten by the time
 *    the trip they are restored into departs.
 *
 * Storage is best-effort throughout: blocked (Safari private mode) or full storage means the
 * traveller re-types their party, which is exactly where they stood before this existed.
 */

import { ageAtCheckIn } from './childDob';

const KEY = 'sunsky.pax';

/** How long a stored party survives without being re-saved. */
export const PAX_TTL_MS = 48 * 60 * 60 * 1000;

/** Matches CHILD_AGE_DEFAULT on the pages: HotelBeds rejects a child with no age at all. */
const DEFAULT_CHILD_AGE = 8;

const MAX_ADULTS = 30;    // generous ceilings; these only reject nonsense, not real parties
const MAX_CHILDREN = 20;
const MAX_ROOMS = 10;

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Split a stored per-child list into SLOTS — one entry per child, blanks kept.
 *
 * Deliberately not filtered. These lists are read by index against the child count, so
 * dropping the empty entry for a child whose birthday was never given would slide every later
 * child up a place: child 2's date would be filed against child 1, and a nine-year-old would
 * be priced as a four-year-old. The blank is the answer "not given yet" and has to survive.
 */
const slots = (v) => String(v ?? '').split(',').map((s) => s.trim());

/**
 * Normalise whatever was stored (or is about to be) into a record the pages can trust.
 *
 * The lists are forced to agree with the child count, because half a party is worse than none:
 * a page handed two birthdays for three children pads the third with a default age, and the
 * traveller is never shown that it happened. Returns null when the counts themselves are
 * unusable — an older format, a hand-edited value, a half-written entry.
 */
const normalise = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const adults = int(raw.adults, NaN);
  const children = int(raw.children, NaN);
  const rooms = int(raw.rooms, 1);
  if (!Number.isFinite(adults) || adults < 1 || adults > MAX_ADULTS) return null;
  if (!Number.isFinite(children) || children < 0 || children > MAX_CHILDREN) return null;
  const nRooms = Math.min(MAX_ROOMS, Math.max(1, rooms));

  // One entry per child, in the order they were collected. A blank date is kept as a blank so
  // the picker reopens on the child it belongs to rather than shifting everyone up a row.
  const dobs = slots(raw.childDobs);
  const ages = slots(raw.childAges);
  const childDobs = Array.from({ length: children }, (_, i) => (dobs[i] || ''));
  const childAges = Array.from({ length: children }, (_, i) => {
    const a = int(ages[i], NaN);
    return Number.isFinite(a) && a >= 0 && a < 18 ? String(a) : String(DEFAULT_CHILD_AGE);
  });

  return {
    adults: String(adults),
    children: String(children),
    rooms: String(nRooms),
    // Empty rather than a string of commas when nothing was typed — every consumer tests
    // this value for truthiness before splitting it.
    childDobs: childDobs.some(Boolean) ? childDobs.join(',') : '',
    childAges: children ? childAges.join(',') : '',
  };
};

/** Read the raw record, with its timestamp. Null if absent, unparseable or storage is blocked. */
const readRaw = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
};

/**
 * Delete an expired record.
 *
 * Runs on import as well as on every read, so the 48 hours are enforced by the clock rather
 * than by someone happening to open the occupancy panel. Returns true if something was
 * removed. A record with no timestamp is treated as expired: it predates this format and its
 * age cannot be established, and guessing in favour of keeping personal data is the wrong way
 * round.
 */
export const purgePax = () => {
  const raw = readRaw();
  if (!raw) return false;
  const at = Number(raw.at);
  if (Number.isFinite(at) && Date.now() - at < PAX_TTL_MS) return false;
  try { localStorage.removeItem(KEY); } catch { /* blocked storage: nothing to remove from */ }
  return true;
};

/**
 * The last committed party, or null if there is none, it has expired, or it is unusable.
 *
 * @returns {{adults: string, children: string, rooms: string, childAges: string, childDobs: string}|null}
 */
export const loadPax = () => {
  if (purgePax()) return null;
  return normalise(readRaw());
};

/**
 * Remember this party, and restart the 48 hours.
 *
 * Called with the values a page has just COMMITTED — not with a draft the traveller is still
 * typing, and not with a page's own defaults, which would keep a record alive (and its dates
 * with it) purely because someone browsed. Rejected input leaves whatever was stored alone.
 */
export const savePax = (pax) => {
  const rec = normalise(pax);
  if (!rec) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...rec, at: Date.now() }));
  } catch { /* full or blocked — the party still stands for this session */ }
  return rec;
};

/** Forget the party outright. */
export const clearPax = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing to remove from */ }
};

/**
 * Does this query string state its own occupancy?
 *
 * The three counts are treated as ONE answer: a link carrying `adults` but no `rooms` is still
 * a link that says who is travelling, and pairing its two adults with a remembered second room
 * would invent a party neither the sender nor the visitor chose.
 *
 * @param {URLSearchParams} params
 */
export const hasPaxParams = (params) =>
  !!params && (params.has('adults') || params.has('children') || params.has('rooms'));

/**
 * The stored children's ages, recomputed for the check-in being searched.
 *
 * A restored date of birth is worth more than the age filed beside it: the age was true for a
 * departure that may now be months away, and the supplier prices on how old the child is when
 * they arrive. Where a date was never entered the stored age stands in, and failing that the
 * default — a price needs some age, and this one is at least the traveller's own last answer.
 *
 * @param {object} pax     a record from `loadPax()`
 * @param {string} checkIn ISO date the party will travel on
 * @returns {string} csv of ages, one per child ('' when there are none)
 */
export const agesForCheckIn = (pax, checkIn) => {
  const n = int(pax?.children, 0);
  if (!n) return '';
  const dobs = slots(pax.childDobs);
  const stored = slots(pax.childAges);
  return Array.from({ length: n }, (_, i) => {
    const fromDob = ageAtCheckIn(dobs[i], checkIn);
    if (fromDob != null) return String(fromDob);
    return stored[i] || String(DEFAULT_CHILD_AGE);
  }).join(',');
};

// Enforce the window at load: a returning visitor's expired dates are deleted as the site
// opens, whatever page they land on and whether or not anything asks for them.
purgePax();
