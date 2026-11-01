/**
 * What the traveller typed into the checkout, held for a few minutes across a sign-in.
 *
 * THE PROBLEM. The checkout keeps its trip in router state and everything typed into it in
 * React state. A guest who discovers halfway down the form that they already have an account
 * is sent to /login, /register or /forgot-password; the trip travels with them as `resume`,
 * but the names, dates of birth, address and choices they had already filled in did not, so
 * signing in brought them back to the right holiday and an empty form. This is the fallback
 * for that hop. The in-page sign-in modal never unmounts the checkout and needs none of it.
 *
 * FOUR RULES DECIDE EVERYTHING HERE:
 *
 * 1. sessionStorage, NOT localStorage. This is in-flight state for one checkout in one tab,
 *    the same reasoning as analytics/redirectHandoff.js. It dies with the tab, it is never
 *    sent anywhere, and an abandoned checkout does not sit on a shared computer waiting for
 *    the next person to open the site.
 *
 * 2. IT EXPIRES 30 MINUTES AFTER THE LAST SAVE. Long enough to find a password, read a reset
 *    code out of an email and come back; short enough that a draft never outlives the visit it
 *    belonged to. Past the window the record is deleted rather than ignored, and `purgeDraft()`
 *    runs when this module is first imported, exactly as paxStore does with its 48 hours.
 *
 * 3. A DRAFT BELONGS TO ONE TRIP. It is filed under a fingerprint of the trip it was typed
 *    for, and a checkout for any other trip gets nothing back and deletes it. Restoring a
 *    family of four into a booking for two, or one trip's extras and insurance into another,
 *    would be worse than an empty form: the traveller would have no reason to check it.
 *
 * 4. AN ALLOW-LIST, NOT A COPY. `normalise` builds every record from a fixed list of fields and
 *    copies nothing else, on the way in AND on the way out. Card numbers, the CVC, passwords,
 *    tokens and consents are never on that list, so they cannot be stored even if a caller
 *    passes the whole checkout state by mistake. A ticked consent in particular has to be
 *    given again: "I agreed" is worth nothing if it was restored rather than clicked.
 *
 * 5. A SIGNED-IN CUSTOMER'S DRAFT IS THEIRS ALONE. It is filed with the account it was typed
 *    under (see mayRead), and signing out clears it (Navbar).
 *
 * Storage is best-effort throughout: blocked or full storage means the traveller re-types the
 * form, which is exactly where they stood before this existed.
 */

export const DRAFT_KEY = 'sunsky.checkoutDraft.v1';

/** How long a draft survives without being saved again. Sliding: each save restarts it. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** Shape of the stored record. A record of any other version is deleted, never migrated. */
const VERSION = 1;

/** The checkout has five steps (Checkout.jsx STEPS), numbered 0 to 4. */
const LAST_STEP = 4;

// Generous ceilings. They only stop nonsense from being written, never a real party.
const MAX_TRAVELLERS = 40;
const MAX_TEXT = 200;
const MAX_WISH = 500;
const MAX_NOTE = 1000;
const MAX_BAG_KG = 1000;
const MAX_BAG_DIR = 12;

const PRIV_KEYS = [
  'firstName', 'lastName', 'dateOfBirth', 'gender', 'nationality', 'email', 'phone',
  'street', 'houseNumber', 'boxNumber', 'city', 'postalCode', 'country', 'emergencyPhone',
];
const PRO_KEYS = ['legalName', 'vatNumber'];
const TRAVELLER_KEYS = ['gender', 'firstName', 'lastName', 'nationality', 'dateOfBirth'];
const PAY_METHODS = ['card', 'ideal', 'bancontact', 'paypal'];
const NOTE_KINDS = ['general', 'assistance'];

/** A bag selection is keyed `travellerIndex:direction`, as Checkout.jsx's bagKey builds it. */
const BAG_KEY = /^\d+:[a-z]+$/i;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A string, cut to `max` characters. Anything that is not a string is the empty answer.
 *
 * Not whitespace-trimmed: this is a draft, and a street name typed as far as "Kerkstraat "
 * should come back exactly as it was left. Cut by code point so a name ending in an emoji or
 * an astral-plane character is never stored as half a character.
 */
const str = (v, max = MAX_TEXT) => {
  if (typeof v !== 'string') return '';
  return v.length <= max ? v : Array.from(v).slice(0, max).join('');
};

const bool = (v) => v === true;

/** A whole number in [lo, hi], from a number or a string of digits; null for anything else. */
const intIn = (v, lo, hi) => {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,6}$/.test(v)) n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** A bag weight in kilos, or null. Zero is not a bag. */
const kg = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_BAG_KG ? v : null);

/** Exactly `keys` out of `src`, each as a string, whatever else `src` carries. */
const pick = (src, keys, max) => Object.fromEntries(keys.map((k) => [k, str(isObj(src) ? src[k] : '', max)]));

/**
 * Baggage the traveller added, in the checkout's own shape.
 *
 * An entry that adds nothing (no cabin bag and no checked weight) is left out: the checkout's
 * setBag deletes those keys itself, so leaving one out restores exactly what was on screen.
 */
const normaliseBags = (src) => {
  const out = {};
  if (!isObj(src)) return out;
  let n = 0;
  for (const [key, sel] of Object.entries(src)) {
    if (n >= MAX_TRAVELLERS * 4) break;
    if (!BAG_KEY.test(key) || !isObj(sel)) continue;
    const [rawIdx, dir] = key.split(':');
    const idx = intIn(rawIdx, 0, MAX_TRAVELLERS - 1);
    if (idx === null || dir.length > MAX_BAG_DIR) continue;
    const cabin = sel.cabin === true || sel.cabin === false ? sel.cabin : kg(sel.cabin);
    const checked = kg(sel.checked);
    if (!cabin && checked === null) continue;
    out[`${idx}:${dir}`] = { cabin, checked };
    n += 1;
  }
  return out;
};

/**
 * The only shape a draft can have, built field by field from whatever it was handed.
 *
 * Travellers are kept as SLOTS, one per row, with a blank row standing in for anything that
 * is not a traveller. Travel insurance, baggage and the special-assistance note are all keyed
 * by traveller index, so dropping a bad row would slide every later traveller up a place and
 * file one person's cover and bags against the next.
 */
const normalise = (raw) => {
  const d = isObj(raw) ? raw : {};
  const step = intIn(d.step, 0, LAST_STEP) ?? 0;
  // The furthest step reached can never be behind the step on screen; the stepper would offer
  // a jump back to a step it believes was never visited.
  const furthest = Math.max(step, intIn(d.furthest, 0, LAST_STEP) ?? 0);

  const travellers = Array.isArray(d.travellers)
    ? d.travellers.slice(0, MAX_TRAVELLERS).map((t) => ({
      ...pick(t, TRAVELLER_KEYS),
      dobLocked: bool(isObj(t) && t.dobLocked),
    }))
    : [];

  const travelIns = {};
  if (isObj(d.travelIns)) {
    for (const [k, v] of Object.entries(d.travelIns)) {
      const i = intIn(k, 0, MAX_TRAVELLERS - 1);
      if (i !== null && typeof v === 'boolean') travelIns[i] = v;
    }
  }

  const noteFor = Array.isArray(d.noteFor)
    ? [...new Set(d.noteFor.map((i) => intIn(i, 0, MAX_TRAVELLERS - 1)).filter((i) => i !== null))]
    : [];

  return {
    step,
    furthest,
    isCompany: bool(d.isCompany),
    priv: pick(d.priv, PRIV_KEYS),
    pro: pick(d.pro, PRO_KEYS),
    leadIsBooker: bool(d.leadIsBooker),
    travellers,
    cancelIns: bool(d.cancelIns),
    travelIns,
    bags: normaliseBags(d.bags),
    transferId: str(d.transferId) || null,
    hotelWish: str(d.hotelWish, MAX_WISH),
    noteKind: NOTE_KINDS.includes(d.noteKind) ? d.noteKind : 'general',
    noteFor,
    noteText: str(d.noteText, MAX_NOTE),
    supportCode: str(d.supportCode) || null,
    payMethod: PAY_METHODS.includes(d.payMethod) ? d.payMethod : 'card',
    idealBank: str(d.idealBank),
  };
};

/** One fingerprint value as text: the empty string for nothing, JSON for lists and objects. */
const text = (v) => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * A stable string that names the trip a checkout is for, or null when there is no trip.
 *
 * Built from what the supplier would be asked to book: the hotel and its rate, the flight's
 * bookable keys and every leg's number and minute, the transfer's rate and route, and the
 * search behind the quote (dates, party, airports). Two trips that differ in any of those are
 * two different fingerprints, because the whole list is JSON-encoded in a fixed order rather
 * than glued together. The same booking object always gives the same string, and a number
 * that came back from history state as text ("2" for 2) still matches.
 *
 * Not hashed: a hash can collide, and a collision here would hand one trip's travellers to
 * another. The values are identifiers the tab already holds in router state.
 *
 * Counts and labels (the kind, the party size) qualify a trip but cannot name one, so a
 * booking with nothing else, such as the checkout's own empty shell, has no fingerprint and
 * nothing is ever saved against it.
 */
export function draftFingerprint(booking) {
  if (!isObj(booking)) return null;
  try {
    const api = isObj(booking.api) ? booking.api : {};
    const hotel = isObj(api.hotel) ? api.hotel : {};
    const flight = isObj(api.flight) ? api.flight : {};
    const transfer = isObj(api.transfer) ? api.transfer : {};
    const search = isObj(booking.search) ? booking.search : {};
    const legs = Array.isArray(flight.legs)
      ? flight.legs.map((l) => [text(l?.flightNumber), text(l?.departure)])
      : [];

    // What can name a trip on its own.
    const ids = [
      text(booking.hotelCode || hotel.hotelCode), text(hotel.rateKey),
      text(hotel.roomCode), text(hotel.boardCode), text(hotel.checkin), text(hotel.checkout),
      text(flight.flightKeys), text(legs),
      text(flight.from), text(flight.to), text(flight.depdate), text(flight.retdate),
      text(transfer.rateKey), text(transfer.fromCode), text(transfer.toCode),
      text(transfer.outbound), text(transfer.inbound), text(transfer.vehicleCode),
      text(transfer.flightNumber),
      text(search.checkin), text(search.checkout), text(search.origin), text(search.destination),
      text(search.childDobs),
    ];
    if (!ids.some(Boolean)) return null;

    // What only tells two versions of the same trip apart.
    const qualifiers = [
      text(booking.kind), text(booking.adults), text(hotel.rooms), text(flight.tripType),
      text(transfer.transferType), text(transfer.direction),
      text(search.adults), text(search.children), text(search.rooms),
    ];
    return JSON.stringify([VERSION, ...qualifiers, ...ids]);
  } catch {
    // A booking that cannot be read (a cycle, a hostile getter) is not one to save against.
    return null;
  }
}

/* ── storage ────────────────────────────────────────────────────────────────── */

// Read inside every try: in a browser with site data blocked, touching sessionStorage at all
// throws, and on the server there is none.
const storage = () => globalThis.sessionStorage;

const readText = () => {
  try { return storage()?.getItem(DRAFT_KEY) ?? null; } catch { return null; }
};

const removeRecord = () => {
  try { storage()?.removeItem(DRAFT_KEY); } catch { /* blocked storage: nothing to remove from */ }
};

/**
 * Is this record still good to read?
 *
 * A record with no timestamp is treated as expired: its age cannot be established, and
 * guessing in favour of keeping someone's personal details is the wrong way round. A
 * timestamp more than a window in the FUTURE is just as unestablished (a clock that was set
 * wrong), so it fails too; a few minutes of clock correction either way does not.
 */
const isLive = (rec) => {
  if (!isObj(rec) || rec.v !== VERSION) return false;
  if (typeof rec.fp !== 'string' || !rec.fp || !isObj(rec.data)) return false;
  if (typeof rec.at !== 'number' || !Number.isFinite(rec.at)) return false;
  const age = Date.now() - rec.at;
  return age < DRAFT_TTL_MS && age > -DRAFT_TTL_MS;
};

/** The stored record if it is still good; otherwise null, and whatever was stored is gone. */
const readLive = () => {
  const raw = readText();
  if (raw === null) return null;
  let rec = null;
  try { rec = JSON.parse(raw); } catch { /* unparseable: deleted below like any other dud */ }
  if (isLive(rec)) return rec;
  removeRecord();
  return null;
};

/**
 * Delete an expired (or unreadable) draft. Returns true if something was removed.
 *
 * Runs on import as well as on every read, so the 30 minutes are enforced by the clock rather
 * than by someone happening to open the checkout again.
 */
export function purgeDraft() {
  if (readText() === null) return false;
  return readLive() === null;
}

/**
 * The draft typed for THIS trip, normalised, or null.
 *
 * A draft filed under another trip is deleted on sight rather than left for later: it cannot
 * be shown here, and the next checkout this tab opens is no more likely to be its trip. With
 * no trip at all (the checkout's empty shell) nothing is read and nothing is deleted, because
 * that render says nothing about which trip the draft belongs to.
 */
export function loadDraft(booking, { owner = GUEST } = {}) {
  const fp = draftFingerprint(booking);
  if (!fp) return null;
  const rec = readLive();
  if (!rec) return null;
  if (rec.fp !== fp || !mayRead(rec.owner, owner)) {
    removeRecord();
    return null;
  }
  return normalise(rec.data);
}

/**
 * WHO a draft belongs to. A signed-in customer's draft carries what their account filled in
 * (address, date of birth, phone), so it is only ever given back to that same account: not to
 * the guest who opens the checkout after they signed out on a shared computer, and not to the
 * next account to sign in, whose prefill only fills EMPTY fields and would keep the first
 * person's details. A GUEST's draft is given back to anyone in this tab, because that is
 * exactly the hop it exists for: a guest who signs in or creates an account mid-booking.
 */
const GUEST = 'guest';
const ownerOf = (v) => (v === null || v === undefined || v === '' ? GUEST : String(v));
const mayRead = (stored, current) => {
  const s = ownerOf(stored);
  return s === GUEST || s === ownerOf(current);
};

/**
 * Remember what has been typed for this trip, and restart the 30 minutes.
 *
 * `owner` is the signed-in account's id, or nothing for a guest (see mayRead). Returns true
 * when the draft was written. Nothing is written for a booking with no fingerprint, and a
 * failed write leaves the form exactly as it is on screen.
 */
export function saveDraft(booking, data, { owner = GUEST } = {}) {
  const fp = draftFingerprint(booking);
  if (!fp) return false;
  try {
    storage().setItem(DRAFT_KEY, JSON.stringify({
      v: VERSION, at: Date.now(), fp, owner: ownerOf(owner), data: normalise(data),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Forget the draft outright: the booking was paid for, or the customer signed out. */
export function clearDraft() {
  removeRecord();
}

// Enforce the window at load: an expired draft is deleted as the site opens, whatever page the
// tab lands on and whether or not anything asks for it.
purgeDraft();
