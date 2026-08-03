// Everything a traveller needs to know about ONE rate, pulled out of the shapes the
// supplier actually sends us.
//
// Two sources, both under-used until now:
//
//   • cancellationPolicies[] — `{amount, from}` means "cancelling ON OR AFTER `from`
//     costs `amount`". So a policy dated in the FUTURE is the opposite of bad news: it
//     is free cancellation up to that moment. The detail page used to print
//     "Non-refundable" for every rate that carried a policy at all, which mislabels the
//     flexible rates (the ones people pay MORE for) as the strictest kind.
//
//   • rateKey — a pipe-delimited string that already carries the occupancy and the rate
//     class. Parsing it costs nothing and saves a round trip.
//       20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|RO|PKGNRFEUXX|1~2~0||N@07~…~NRF~~D88…
//                                             board ↑   class ↑       ↑ rooms~adults~children
//
// Nothing here throws on a malformed input: every field is optional and every consumer
// treats null as "don't show that line".

/** Board code → what to actually put in front of a traveller, plus a one-line gloss. */
const BOARD_MEANING = {
  RO: { label: 'Room only', gloss: 'No meals included' },
  SC: { label: 'Self catering', gloss: 'Kitchen facilities, no meals' },
  BB: { label: 'Bed & breakfast', gloss: 'Breakfast included' },
  HB: { label: 'Half board', gloss: 'Breakfast and dinner' },
  FB: { label: 'Full board', gloss: 'Breakfast, lunch and dinner' },
  AI: { label: 'All inclusive', gloss: 'All meals and selected drinks' },
  UAI: { label: 'Ultra all inclusive', gloss: 'All meals, premium drinks and extras' },
};

/**
 * Board presentation for a rate.
 * Falls back to whatever name the supplier sent (title-cased) so an unknown code still
 * reads like English rather than "PKGNRFEUXX".
 */
export function boardInfo(boardCode, boardName) {
  const code = String(boardCode || '').trim().toUpperCase();
  const known = BOARD_MEANING[code];
  if (known) return { code, ...known };
  const raw = String(boardName || '').trim();
  return {
    code: code || null,
    label: raw ? titleCase(raw) : 'Standard rate',
    gloss: null,
  };
}

/** "BED AND BREAKFAST" → "Bed and breakfast" — supplier names arrive SHOUTING. */
function titleCase(s) {
  const lower = String(s).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * What the cancellation policies mean RIGHT NOW.
 *
 * @param {Array<{amount?:string|number, from?:string}>} policies
 * @param {number|null} price   the rate's own price, to tell a full-value penalty from a partial one
 * @param {Date} now            injectable so tests don't depend on the wall clock
 * @returns {{kind:'free'|'partial'|'none'|'unknown', until:Date|null, amount:number|null, full:boolean}}
 *   free    — cancel for nothing up to `until`
 *   partial — a penalty applies from `until`, but it is less than the full price
 *   none    — the penalty window has already opened; cancelling costs money today
 *   unknown — the supplier told us nothing
 */
export function cancellationState(policies, price = null, now = new Date()) {
  if (!Array.isArray(policies) || policies.length === 0) {
    return { kind: 'unknown', until: null, amount: null, full: false };
  }

  // Earliest deadline first — that is the one that ends the free window.
  const parsed = policies
    .map((p) => ({ amount: toNumber(p?.amount), at: toDate(p?.from) }))
    .filter((p) => p.at != null)
    .sort((a, b) => a.at - b.at);

  if (parsed.length === 0) return { kind: 'unknown', until: null, amount: null, full: false };

  const first = parsed[0];
  // A penalty at or above the rate is a 100% charge — say "non-refundable", not "€8,720 fee".
  const full = first.amount != null && price != null && first.amount >= price - 0.01;

  if (first.at > now) return { kind: 'free', until: first.at, amount: first.amount, full };
  return { kind: full ? 'none' : 'partial', until: first.at, amount: first.amount, full };
}

/**
 * Pull the facts the rateKey encodes. Every field is null when the key is absent or
 * shaped differently than expected — positions are verified by content, never trusted
 * blind, because a supplier adding a segment must not silently shift "adults" onto a
 * contract id.
 *
 * @returns {{rooms:number|null, adults:number|null, children:number|null,
 *            nonRefundable:boolean|null, rateClass:string|null, packageRate:boolean}}
 */
export function parseRateKey(rateKey) {
  const empty = { rooms: null, adults: null, children: null, nonRefundable: null, rateClass: null, packageRate: false };
  if (!rateKey || typeof rateKey !== 'string') return empty;

  const parts = rateKey.split('|');
  if (parts.length < 3) return empty;

  // Occupancy is the one segment shaped exactly `rooms~adults~children`.
  let rooms = null, adults = null, children = null;
  for (const seg of parts) {
    const m = /^(\d+)~(\d+)~(\d+)$/.exec(seg.trim());
    if (m) { rooms = +m[1]; adults = +m[2]; children = +m[3]; break; }
  }

  // The rate class is the segment carrying the pricing-plan letters (PKG / B2B / NRF …).
  const rateClass = parts.find((s) => /^[A-Z]{6,}$/.test(s.trim())) || null;

  // NRF appears in the rate class and again as its own token late in the key. Look for it
  // as a WHOLE token so a hotel code that happens to contain the letters can't trip it.
  const nrfToken = /(^|[|~])NRF([|~]|$)/.test(rateKey);
  const norToken = /(^|[|~])NOR([|~]|$)/.test(rateKey);
  const nonRefundable = nrfToken ? true : (norToken ? false : null);

  return {
    rooms, adults, children, rateClass,
    nonRefundable,
    packageRate: /^PKG/.test(rateClass || ''),
  };
}

/**
 * Everything the room card wants to render for one rate, in one call.
 *
 * @param {object} rate    a mapped live room (see HotelDetail's availability mapper)
 * @param {object} ctx     {nights, adults, children, now}
 */
export function rateDetails(rate, ctx = {}) {
  const nights = Math.max(1, Number(ctx.nights) || 1);
  const key = parseRateKey(rate?.rateKey);
  const price = toNumber(rate?.price);

  // Occupancy: the rateKey is authoritative (it is what will be booked); the search
  // params are the fallback for suppliers that don't encode it.
  const adults = key.adults ?? (Number(ctx.adults) || null);
  const children = key.children ?? (Number(ctx.children) || 0);
  const guests = adults != null ? adults + (children || 0) : null;

  const cancel = cancellationState(rate?.cancellation, price, ctx.now);
  // The rateKey's NRF flag and the policy dates should agree; when they don't, believe the
  // dates — they are what the supplier will actually enforce.
  const nonRefundable = cancel.kind === 'none' ? true
    : cancel.kind === 'free' ? false
    : key.nonRefundable;

  return {
    board: boardInfo(rate?.boardCode, rate?.board),
    rooms: key.rooms,
    adults,
    children,
    guests,
    perNight: price != null ? price / nights : null,
    perGuestNight: price != null && guests ? price / nights / guests : null,
    cancel,
    nonRefundable,
    packageRate: key.packageRate,
    rateClass: key.rateClass,
  };
}

function toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default rateDetails;
