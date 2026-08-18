import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axiosInstance, { SUPPLIER_TIMEOUT } from '../../services/axiosInstance';
import { fetchFavouriteCodes, addFavourite, removeFavourite } from '../../api';
import { rememberDestCode } from '../../utils/favDest';
import HotelImg from '../../components/HotelImg/HotelImg';
import HotelPhotoFallback from '../../components/HotelPhotoFallback/HotelPhotoFallback';
import { groupRoomsByBoard, boardCount } from '../../utils/roomBoards';
import { nightsToDays } from '../../utils/durations';
import { rateDetails, boardInfo, decodeEntities } from '../../utils/rateDetails';
import {
  splitRoundTrip, flightFacets, applyFlightFilters, sortFlights, SORTS, dedupeFares,
  fmtClock, FULL_DAY,
} from '../../utils/flightFilters';
import { formatReview, scoreWord, scoreBand } from '../../utils/reviewBadge';
import { airportName, airlineName, flightNumber } from '../../utils/flightNames';
import { DEPARTURE_AIRPORTS, AIRPORT_CODES, DEFAULT_ORIGIN, normaliseOrigin } from '../../utils/airports';
import AirlineMark from '../../components/AirlineMark/AirlineMark';
import RatingMarks from '../../components/RatingMarks/RatingMarks';
import ShareSheet from '../../components/ShareSheet/ShareSheet';
import StayBar from '../../components/StayBar/StayBar';
import { ratingLabel } from '../../utils/rating';
import { dobsMatchAges } from '../../utils/childDob';
import { loadPax, savePax, hasPaxParams, agesForCheckIn } from '../../utils/paxStore';
import { earliestCheckInISO, departsTooSoon, MIN_LEAD_HOURS } from '../../utils/leadTime';
import {
  categoriseFacilities, popularFacilities, nearbyDistances, glanceFacts,
} from '../../utils/facilityCategories';
import { copyText } from '../../utils/copyText';
import { roomNameFromCode } from '../../utils/roomNames';
import { weatherIcon } from '../../utils/weatherIcons';
import { useToast } from '../../context/ToastContext';
import './HotelDetail.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';

/* Turn a failed supplier call into something a traveller can act on.
 * axios reports its own internals — "timeout of 15000ms exceeded", "Network Error",
 * "Request failed with status code 502" — and these were being printed verbatim on the
 * booking page. A shopper cannot do anything with a millisecond count; they need to know
 * whether to wait, retry, or change their dates. `what` names the thing being searched. */
const friendlyError = (e, what) => {
  const msg = String(e?.message || '');
  const status = e?.response?.status;
  if (e?.code === 'ECONNABORTED' || /timeout/i.test(msg)) {
    // Say what we could not do and what happens next — nothing else. The old wording
    // ("taking longer than usual. Suppliers can be slow at busy times") narrated our own
    // plumbing at a shopper who neither knows nor cares what a supplier is, described the
    // failure as merely slow while showing it as an error, and then asked them to repeat
    // the thing that had just failed. Nothing here is the traveller's to fix.
    return `We couldn’t load live ${what} prices just now. Your dates are saved — try once more, or pick another date above.`;
  }
  if (e?.code === 'ERR_NETWORK' || /network error/i.test(msg)) {
    return `We couldn’t reach our ${what} prices. Check your connection and try again.`;
  }
  if (status === 429) return `Too many searches at once. Wait a few seconds, then try again.`;
  if (status >= 500) return `Live ${what} prices are unavailable right now. Please try again shortly.`;
  // Our own API writes its messages for people; anything else is an internal string.
  const fromServer = e?.response?.data?.message;
  return fromServer || `We couldn’t load ${what} prices for these dates. Please try again.`;
};
// Hotelbeds 400s on a child with no age, so a newly-added child gets this until asked.
const CHILD_AGE_DEFAULT = 8;
// Live flight quotes older than this are not re-used — a fare cached at page-open time
// should not still be answering an airport switch made ten minutes later.
const FLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;

/* Normalise a raw /flight-availability/search response into the card shape, cheapest first.
 * Pure — the SAME code path serves the traveller's chosen airport and every alternative the
 * fallback probe prices, so a probed fare can never disagree with the fare shown after
 * clicking that alternative. `originCode` matters: the round-trip split and the one-way
 * pairing below both key on which airport counts as "home". */
function transformFlights(data, originCode) {
  const raw = data?.results?.airtuerk?.flights || [];
  const home = String(originCode || '').toUpperCase();
  // The API's bookable keys are `flightKey`/`flightKeys` — they are REQUIRED
  // for live price verification and the Airtuerk reservation. (The old code
  // read a non-existent `offerKey` field, so packages booked from this page
  // carried no keys at all.)
  const keysOf = (x) => (Array.isArray(x?.flightKeys) && x.flightKeys.length
    ? x.flightKeys
    : [x?.flightKey].filter(Boolean));

  // Each round-trip flight already carries its own direction split in
  // `outbound`/`inbound`. Read those directly — the previous code re-derived
  // the split from the flat `legs` array (out + return concatenated) and, since
  // every round-trip's first leg departs the origin, filed EVERY flight as an
  // outbound with none inbound. The card then took legs[0].from → legs[last].to,
  // i.e. BRU → …→ BRU, printing "BRU → BRU · 1 stop" for a direct return trip.
  let flights = raw
    .map((f) => {
      let outLegs = f.outbound?.legs?.length ? f.outbound.legs : (f.legs || []);
      let retLegs = f.inbound?.legs?.length ? f.inbound.legs : [];
      if (!outLegs.length) return null;
      // Airtuerk marks the split on SOME round trips and not others. When it doesn't,
      // every leg arrives in one array — the card then reads legs[0].from → legs[last].to
      // and prints "BRU → BRU · 1 stop" with the return half missing, and the return-time
      // filter has no departure to read. Recover the split from the stay-length gap.
      if (!retLegs.length) {
        const split = splitRoundTrip(outLegs, home);
        outLegs = split.outLegs; retLegs = split.retLegs;
      }
      return {
        totalPrice: f.totalPrice || 0,
        currency: f.currency || 'EUR',
        outLegs, retLegs,
        stops: Math.max(outLegs.length - 1, retLegs.length - 1, 0),
        fareBreakdown: f.fareBreakdown || [],
        flightKeys: keysOf(f),
        // The fare's real allowance, straight from the supplier. Absent on an older cached
        // response, which is why the card treats "no baggage object" as "say nothing" rather
        // than as "nothing included".
        baggage: f.baggage || null,
      };
    })
    .filter(Boolean);

  // Fallback for a supplier that returns separate one-way flights (no per-flight
  // outbound/inbound): pair each outbound with each inbound by origin airport.
  if (!flights.some((f) => f.retLegs.length)) {
    const outs = [], ins = [];
    raw.forEach((f) => {
      const legs = f.legs || [];
      if (!legs.length) return;
      if ((legs[0].from || '').toUpperCase() === home) outs.push(f);
      else if ((legs[legs.length - 1].to || '').toUpperCase() === home) ins.push(f);
    });
    if (outs.length && ins.length) {
      flights = [];
      for (const ob of outs) for (const ib of ins) {
        flights.push({
          totalPrice: (ob.totalPrice || 0) + (ib.totalPrice || 0),
          currency: ob.currency || 'EUR',
          outLegs: ob.legs || [], retLegs: ib.legs || [],
          stops: Math.max((ob.legs || []).length - 1, (ib.legs || []).length - 1, 0),
          fareBreakdown: [...(ob.fareBreakdown || []), ...(ib.fareBreakdown || [])],
          flightKeys: [...keysOf(ob), ...keysOf(ib)],
        });
      }
    }
  }
  // A fare that leaves within the next 24 hours cannot be booked, confirmed and ticketed in
  // time, so it is not offered — even on a date the strip allows. The date floor removes
  // today; this removes the 06:00 departure tomorrow morning, which the floor cannot see.
  const bookable = flights.filter((f) => !departsTooSoon(f.outLegs?.[0]?.departure));
  bookable.sort((a, b) => a.totalPrice - b.totalPrice);
  // One card per thing a traveller can actually choose between — the supplier's duplicate
  // fare classes for the same aircraft, times and baggage collapse to their cheapest.
  return dedupeFares(bookable);
}
// "Care (Meals)" options. `match` tests the supplier's board name/code on a live room.
const BOARD_PREFS = [
  { id: '',   label: 'No preference' },
  { id: 'RO', label: 'Room only',      match: /room\s*only|^RO$|self.?cater/i },
  { id: 'BB', label: 'Bed & breakfast', match: /breakfast|^BB$/i },
  { id: 'HB', label: 'Half board',      match: /half\s*board|^HB$/i },
  { id: 'FB', label: 'Full board',      match: /full\s*board|^FB$/i },
  { id: 'AI', label: 'All inclusive',   match: /all\s*inclusive|^AI$/i },
];
// Trip lengths the Duration filter offers, in nights.

// The quick chips under the bar, in nights — printed as nights+1 days, so 5→"6 days".

const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calDay  = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? '' : WK[d.getDay()]; };
const calDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? iso : `${d.getDate()} ${MO[d.getMonth()]}`; };
// The confirmation voice — "Saturday 07 September 2026". Written out in full for the
// availability recap, where "7 Sep" is too terse to be checked against a passport or a
// day off work. Assembled from local parts rather than toLocaleDateString because en-GB
// slips a comma in after the weekday on some engines and drops the leading zero.
const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')} ${MOL[d.getMonth()]} ${d.getFullYear()}`;
};
// NB: formatted from the LOCAL date parts, not toISOString(). The input is parsed at local
// midnight, so serialising through UTC handed back the previous day for every traveller east
// of Greenwich (IST: "20 Mar + 7 nights" → 26 Mar) — a whole night short in the availability
// search, the checkout payload and the shared link.
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// Nights between two ISO dates (checkout − checkin), or null if either is missing/invalid.
// Parsed in UTC so an offset boundary can't shift the count. This is the SOURCE OF TRUTH for the
// stay length — the searched dates decide the nights, never a hardcoded default. N nights shows
// as N+1 days on the label (see durations.js).
const nightsBetween = (ci, co) => {
  if (!ci || !co) return null;
  const a = Date.parse(`${ci}T00:00:00Z`);
  const b = Date.parse(`${co}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : null;
};
// The trip length worded the way the traveller searched for it. The page counts a stay in
// NIGHTS, but every filter, chip and heading on the site speaks DAYS ("7 days" = 6 nights),
// so a raw nights figure printed under a "days" label reads back a day short — someone who
// searched "7 days" was shown "6 days" on the fare strip and the availability card while the
// dates beside them spanned the full week. ONE function prints trip length on this page, and
// it converts. Anything measuring the stay itself (a nightly rate, an insurance multiplier)
// keeps using `nights` directly — that arithmetic is in nights and must stay in nights.
/**
 * "15 – 21 Sep 2026", or "28 Sep – 4 Oct 2026" when the stay crosses a month, or both years
 * when it crosses a new year. One line for a travel period reads faster than a Departure box
 * and a Return box holding one date each — they were always read together anyway.
 */
const rangeLabel = (fromISO, toISO) => {
  const a = new Date(fromISO + 'T00:00:00'), b = new Date(toISO + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '';
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  const left = sameMonth
    ? `${a.getDate()}`
    : `${a.getDate()} ${MO[a.getMonth()]}${sameYear ? '' : ` ${a.getFullYear()}`}`;
  return `${left} – ${b.getDate()} ${MO[b.getMonth()]} ${b.getFullYear()}`;
};

/** "6 nights / 7 days" — the two counts travellers check a stay against. */
const stayLabel = (nights) => {
  const n = Number(nights) || 0;
  return `${n} night${n === 1 ? '' : 's'} / ${nightsToDays(n)} day${nightsToDays(n) === 1 ? '' : 's'}`;
};

const dayLabel = (nights) => {
  const d = nightsToDays(nights);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
};
// The floor for the fare strip and every date field on this page: 24 hours from now, in
// BELGIAN time (see utils/leadTime.js). The strip pages backwards to that day and no further,
// because a departure inside a day cannot be confirmed with the supplier and turned into
// documents in time — and it is measured in Brussels rather than on the traveller's own clock,
// so the same dates are offered wherever they are sitting.
const todayISO = () => earliestCheckInISO();
// Days shown at once. The cache endpoint returns exactly this many, forward from the check-in
// it is given, so a "week" of the strip and one request are the same thing.
const CAL_DAYS = 7;
// Where a day the traveller picks gets parked: dead centre, three days visible either side.
const CAL_CENTRE = Math.floor(CAL_DAYS / 2);
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(s);
};
const fmtDur = (min) => { const m = Number(min); if (!m || m <= 0) return ''; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
/**
 * Calendar days between take-off and touchdown, for the "+1 day" beside an arrival time.
 * An overnight flight lands at 01:50 the NEXT morning; printing that bare next to a 12:35
 * departure reads as a trip that arrives before it left.
 */
const dayOffset = (from, to) => {
  const a = new Date(from), b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(b) - day(a)) / 86400000);
};
const fmtDateLong = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d.getTime())) return ''; return `${WK[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}. ${d.getFullYear()}`; };
/** "1 Sep" — short enough to sit inside a chip. Takes a Date (cancellation deadlines are parsed). */
const fmtDay = (d) => (d instanceof Date && !isNaN(d.getTime())) ? `${d.getDate()} ${MO[d.getMonth()]}` : '';

/* ── tiny SVG helper ── */
const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);

const ICON = {
  pin:   <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></S>,
  cal:   <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  users: <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>,
  plane: <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></S>,
  board: <S><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
  moon:  <S><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></S>,
  check: <S sw={2.5}><path d="M20 6L9 17l-5-5" /></S>,
  share: <S><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></S>,
  heart: <S><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></S>,
  gallery: <S><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></S>,
  bed:   <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  shield:<S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  noTransfer: <S><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /></S>,
  car:   <S><path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11" /><path d="M3 16v-3a2 2 0 012-2h14a2 2 0 012 2v3" /><circle cx="7" cy="16" r="1.6" /><circle cx="17" cy="16" r="1.6" /><path d="M3 19h18" /></S>,
  clock: <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  /* Which way the live price moved. A circled arrow rather than a bare one: these sit inside
     a coloured pill at 8-11px, where an unenclosed stroke reads as a speck. */
  arrowDown: <S sw={2.4}><circle cx="12" cy="12" r="9.5" /><path d="M12 7.6v8.8" /><path d="M8.4 12.8L12 16.4l3.6-3.6" /></S>,
  arrowUp:   <S sw={2.4}><circle cx="12" cy="12" r="9.5" /><path d="M12 16.4V7.6" /><path d="M8.4 11.2L12 7.6l3.6 3.6" /></S>,
  arrow: <S sw={2.5}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></S>,
  arrowBack: <S><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 010 8h-1" /></S>,
  warn:  <S><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></S>,
  info:  <S><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  tag:   <S><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></S>,
  bag:   <S><path d="M6 9a6 6 0 0112 0v9a2 2 0 01-2 2H8a2 2 0 01-2-2z" /><path d="M9 9V6a3 3 0 016 0v3" /><line x1="10" y1="13" x2="14" y2="13" /></S>,
  checkedBag: <S><rect x="5" y="7" width="14" height="13" rx="2" /><path d="M9 7V4h6v3" /><line x1="10" y1="11" x2="10" y2="16" /><line x1="14" y1="11" x2="14" y2="16" /></S>,
  seat:  <S><path d="M5 4v9a3 3 0 003 3h6" /><path d="M5 16l-1 4M14 16l1 4" /><path d="M19 20a2 2 0 01-2-2v-2a3 3 0 00-3-3" /></S>,
  lock:  <S><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></S>,
  spark: <S><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.6-6.2 4.6 2.4-7.4L2 9.4h7.6z" /></S>,
};

/**
 * What a fare actually includes, from the supplier's own allowance.
 *
 * The comment that used to sit here said the response "carries no baggage/service fields" and
 * that a cabin bag, checked bag, meal and seat "are the standard inclusion" — so the card
 * printed all four on every fare. Checking the live Airtuerk response showed the first half
 * false and the second half unknowable: it DOES send `baggage` (kilos), `baggagePiece`,
 * `handLuggage` and `cabinClass` on the same object as the flightKey, and it sends nothing at
 * all about meals or seats.
 *
 * So: baggage is stated from data, and the meal/seat claims are gone. `0` from this supplier
 * means "not included" and earns no chip; a missing baggage object means the supplier told us
 * nothing, and the strip stays empty rather than inventing a reassurance.
 */
function fareInclusions(baggage) {
  if (!baggage) return [];
  const out = [];
  const hasChecked = baggage.checkedKg > 0 || baggage.checkedPieces > 0;

  if (baggage.checkedKg > 0) {
    out.push({ icon: ICON.checkedBag, label: `Checked baggage ${baggage.checkedKg} kg`, ok: true });
  } else if (baggage.checkedPieces > 0) {
    // Some carriers price by piece rather than weight; say whichever one the fare uses.
    out.push({
      icon: ICON.checkedBag,
      label: `Checked baggage ${baggage.checkedPieces} ${baggage.checkedPieces === 1 ? 'piece' : 'pieces'}`,
      ok: true,
    });
  }

  // Cabin baggage.
  //
  // With a real figure we print it. Without one we still say "included" WHENEVER THE FARE
  // CARRIES HOLD BAGGAGE, because no airline sells you a 25kg hold allowance and then refuses
  // you a cabin bag — the two travel together. Airtuerk reports handLuggage as 0 on every
  // option we have seen, which reads as "not itemised" rather than "not permitted".
  //
  // But note what is NOT claimed: no weight. The inference "a hold-baggage fare allows a cabin
  // bag" is safe; "and it is 7kg" is not, and inventing that number is exactly the habit this
  // whole change removed. If Tursys ever populates handLuggage, the real figure appears here
  // automatically and this branch stops being used.
  if (baggage.handKg > 0) {
    out.unshift({ icon: ICON.bag, label: `Cabin bag ${baggage.handKg} kg`, ok: true });
  } else if (hasChecked) {
    out.unshift({ icon: ICON.bag, label: 'Cabin bag included', ok: true });
  }

  return out;
}

const TAB_ICON = {
  Prices: <S sw={2}><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5z" /><path d="M6 9.01V9" /></S>,
  Information: <S sw={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  Facilities: <S sw={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></S>,
  Weather: <S sw={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></S>,
  Map: <S sw={2}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></S>,
  Reviews: <S sw={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></S>,
};

/* ── static demo data (from the design) ── */
const TABS = ['Prices', 'Information', 'Facilities' /*, 'Weather', 'Map', 'Reviews' */];
// PRICE_DAYS / PRICE_MIN / PRICE_MAX / FLIGHTS removed: the fare strip and the flight list
// now render live data or an honest empty state. The demo week (7 hardcoded March fares with
// invented "was" prices) and the two hardcoded TUI fly / Transavia itineraries were shown
// whenever a call failed, the hotel was full, or a filter was edited — indistinguishable from
// real results, and both fed the checkout hand-off.
// MODAL_FLIGHTS / SIDEBAR_FILTERS removed: the modal now renders the live result set and
// builds its filter groups from `flightFacets`, so a hardcoded flight list and a fixed list
// of filter options can no longer disagree with what was actually searched.
// MEAL_PLANS / ROOM_TYPES / STAYS removed with the demo room list. ROOM_TYPES in particular
// carried invented scarcity ("Only 2 available!", "Only 1 room available!") on rooms that had
// never been searched — urgency applied to stock nobody had checked.
// FACILITIES / MORE_FACILITIES / FAC_ICON removed with the demo facility list. They were 18
// invented amenity strings ("Free WiFi", "Swimming pool") shown whenever /hotels/bulk had not
// answered — and not one of them matched a real Hotelbeds name, which calls the pool "Outdoor
// freshwater pool" and the wifi "Wi-fi". The tab now renders the hotel's own facilities or an
// honest empty state, so a page can no longer promise a spa the hotel does not have.
//
// WEATHER removed for the same reason: twelve hardcoded Mediterranean months that took no
// input, so a Brussels hotel and a Bodrum resort both claimed 31°C in July. There is no
// weather feed anywhere in the estate; until one exists the block stays out.

// Icon vocabulary for the facility categories and the popular row. Keys are the `icon` values
// `facilityCategories.js` emits, so the mapping lives in one place and a new category cannot
// silently render blank.
const FAC_SVG = {
  concierge:     <S sw={2}><path d="M3 21h18" /><path d="M5 21v-7a7 7 0 0114 0v7" /><path d="M12 7V4" /><circle cx="12" cy="3" r="1" /></S>,
  restaurant:    <S sw={2}><path d="M3 2v7a2 2 0 002 2h1a2 2 0 002-2V2" /><path d="M6 11v11" /><path d="M18 2c-1.7 1.3-2.5 3.3-2.5 6 0 2 .8 3 2.5 3v11" /></S>,
  pool:          <S sw={2}><path d="M2 19c1.4-1.3 3.1-1.3 4.5 0s3.1 1.3 4.5 0 3.1-1.3 4.5 0 3.1 1.3 4.5 0" /><path d="M2 14c1.4-1.3 3.1-1.3 4.5 0s3.1 1.3 4.5 0 3.1-1.3 4.5 0 3.1 1.3 4.5 0" /><path d="M8 14V5a2 2 0 114 0" /><path d="M16 14V5" /></S>,
  beach:         <S sw={2}><path d="M12 3a9 9 0 019 9H3a9 9 0 019-9z" /><path d="M12 12v7a3 3 0 006 0" /></S>,
  slide:         <S sw={2}><path d="M4 20c5 0 4-14 9-14h7" /><path d="M2 20h20" /><circle cx="17" cy="4" r="2" /></S>,
  spa:           <S sw={2}><path d="M12 2s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></S>,
  gym:           <S sw={2}><path d="M6.5 6.5l11 11" /><path d="M4 8l-2 2 4 4-2 2" /><path d="M20 16l2-2-4-4 2-2" /></S>,
  kids:          <S sw={2}><circle cx="9" cy="6" r="3" /><path d="M6 21v-6l-2-3 3-3h4l3 3-2 3v6" /><circle cx="18" cy="8" r="2" /><path d="M16 21v-5l2-2 2 2v5" /></S>,
  entertainment: <S sw={2}><path d="M2 8s2-2 4-2 3 2 3 4-1 6-4 6-3-3-3-4" /><path d="M22 8s-2-2-4-2-3 2-3 4 1 6 4 6 3-3 3-4" /></S>,
  parking:       <S sw={2}><path d="M5 17h14" /><path d="M6 17v-4l2-5h8l2 5v4" /><circle cx="8" cy="17" r="1.6" /><circle cx="16" cy="17" r="1.6" /></S>,
  shuttle:       <S sw={2}><path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2a.8.8 0 00-.8 1.3L8 11l-2 3H3l2 4 4 2 3-2v-3l3.7 4a.8.8 0 001.3-.8z" /></S>,
  shop:          <S sw={2}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></S>,
  garden:        <S sw={2}><path d="M12 22V12" /><path d="M12 12C12 8 9 5 5 5c0 4 3 7 7 7z" /><path d="M12 15c0-3 2.5-5.5 6-5.5 0 3.5-2.5 6-6 5.5z" /></S>,
  business:      <S sw={2}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></S>,
  leaf:          <S sw={2}><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8a7 7 0 01-10 10z" /><path d="M2 22c1.5-3 3.5-5 6.5-7" /></S>,
  info:          <S sw={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  bar:           <S sw={2}><path d="M8 22h8" /><path d="M12 15v7" /><path d="M3 4h18l-9 11z" /></S>,
  wifi:          <S sw={2}><path d="M5 12.55a11 11 0 0114.08 0" /><path d="M1.42 9a16 16 0 0121.16 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></S>,
  city:          <S sw={2}><path d="M3 21h18" /><path d="M5 21V7l7-4v18" /><path d="M12 9h7v12" /><path d="M8 10h1M8 14h1M15 13h1M15 17h1" /></S>,
  harbour:       <S sw={2}><circle cx="12" cy="5" r="2" /><path d="M12 22V7" /><path d="M5 12a7 7 0 0014 0" /><path d="M8 9h8" /></S>,
  bus:           <S sw={2}><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 11h16" /><path d="M7 20v-2M17 20v-2" /><circle cx="8" cy="16" r="1" /><circle cx="16" cy="16" r="1" /></S>,
  golf:          <S sw={2}><path d="M12 20V4l7 4-7 4" /><ellipse cx="12" cy="21" rx="5" ry="1.6" /></S>,
  ski:           <S sw={2}><path d="M3 20l16-6" /><path d="M5 21l15-6" /><circle cx="15" cy="5" r="2" /><path d="M13 9l3 3-2 3" /></S>,
  plane:         <S sw={2}><path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2a.8.8 0 00-.8 1.3L8 11l-2 3H3l2 4 4 2 3-2v-3l3.7 4a.8.8 0 001.3-.8z" /></S>,
  bed:           <S sw={2}><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M2 17h20" /><path d="M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" /></S>,
  accessible:    <S sw={2}><circle cx="12" cy="4" r="2" /><path d="M9 8h6l-1 5h-3l3 8" /><path d="M12 13a5 5 0 11-4.5 7" /></S>,
  shield:        <S sw={2}><path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-4z" /><polyline points="9 12 11 14 15 10" /></S>,
  check:         <S sw={2.5}><polyline points="20 6 9 17 4 12" /></S>,
};

// "Hotel at a glance" tiles.
const GLANCE_SVG = {
  star:   <S sw={2}><polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" /></S>,
  bed:    <S sw={2}><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M2 17h20" /><path d="M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" /></S>,
  board:  <S sw={2}><path d="M3 2v7a2 2 0 002 2h1a2 2 0 002-2V2" /><path d="M6 11v11" /><path d="M18 2c-1.7 1.3-2.5 3.3-2.5 6 0 2 .8 3 2.5 3v11" /></S>,
  floors: <S sw={2}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></S>,
  reno:   <S sw={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></S>,
  cal:    <S sw={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
};

// Weather shapes, keyed by whatever weatherIcon() resolves a condition code to.
const WX_SVG = {
  sun:         <S sw={2}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" /></S>,
  moon:        <S sw={2}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></S>,
  partly:      <S sw={2}><circle cx="8" cy="8" r="3.2" /><path d="M8 1.5v1.6M2.6 8H1.5M3.9 3.9l-.8-.8M12.9 3.9l.8-.8" /><path d="M17.5 20H8.2a4.2 4.2 0 010-8.4 5.4 5.4 0 0110.3 1.6 3.4 3.4 0 01-1 6.8z" /></S>,
  partlyNight: <S sw={2}><path d="M13.5 6.4A4.6 4.6 0 018.2 1.6a4.8 4.8 0 105.3 4.8z" /><path d="M17.5 20H8.2a4.2 4.2 0 010-8.4 5.4 5.4 0 0110.3 1.6 3.4 3.4 0 01-1 6.8z" /></S>,
  cloud:       <S sw={2}><path d="M17.5 19H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 19z" /></S>,
  rain:        <S sw={2}><path d="M17.5 15H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 15z" /><path d="M9 18.5l-1 2.5M14 18.5l-1 2.5" /></S>,
  heavyRain:   <S sw={2}><path d="M17.5 14H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 14z" /><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" /></S>,
  storm:       <S sw={2}><path d="M17.5 14H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 14z" /><path d="M13 16l-3 4h4l-3 4" /></S>,
  snow:        <S sw={2}><path d="M17.5 14H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 14z" /><path d="M9 18v.01M12 20v.01M15 18v.01M10.5 21v.01M13.5 21v.01" /></S>,
  fog:         <S sw={2}><path d="M17.5 12H7.5a4.5 4.5 0 010-9 6 6 0 0111.4 1.8A3.6 3.6 0 0117.5 12z" /><path d="M4 16h16M6 20h12" /></S>,
};

const WX_FACT_SVG = {
  wave:    <S sw={2}><path d="M2 16c1.4-1.3 3.1-1.3 4.5 0s3.1 1.3 4.5 0 3.1-1.3 4.5 0 3.1 1.3 4.5 0" /><path d="M2 10c1.4-1.3 3.1-1.3 4.5 0s3.1 1.3 4.5 0 3.1-1.3 4.5 0 3.1 1.3 4.5 0" /></S>,
  uv:      <S sw={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" /></S>,
  sunrise: <S sw={2}><path d="M12 3v5M8.5 6.5L12 3l3.5 3.5" /><path d="M2 18h20M5 14a7 7 0 0114 0" /></S>,
  sunset:  <S sw={2}><path d="M12 8V3M8.5 4.5L12 8l3.5-3.5" /><path d="M2 18h20M5 14a7 7 0 0114 0" /></S>,
};

// The UV number alone means nothing to most people; the WHO band does.
function uvLabel(uv) {
  const n = Number(uv);
  if (!Number.isFinite(n)) return null;
  const band = n < 3 ? 'Low' : n < 6 ? 'Moderate' : n < 8 ? 'High' : n < 11 ? 'Very high' : 'Extreme';
  return `${Math.round(n)} · ${band}`;
}

// WeatherAPI returns "06:24 AM"; drop the leading zero so it reads like a clock.
const tidyTime = (t) => String(t || '').replace(/^0/, '');

const COPY_SVG  = <S size={14} sw={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></S>;
const PHONE_SVG = <S sw={2}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></S>;
const FAX_SVG   = <S sw={2}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V2H8v5" /><line x1="6" y1="13" x2="6.01" y2="13" /></S>;
const RATINGS = [
  { l: 'Location', v: 9.6 }, { l: 'Cleanliness', v: 9.4 }, { l: 'Service', v: 9.2 },
  { l: 'Rooms', v: 9.1 }, { l: 'Food', v: 8.9 },
];
const REVIEWS = [
  { n: 'Anna K.', init: 'AK', d: 'March 2026', s: 9.5, t: 'Absolutely stunning hotel! The views from our room were breathtaking and the staff went above and beyond.' },
  { n: 'Marco B.', init: 'MB', d: 'February 2026', s: 9.2, t: 'Perfect adults-only getaway. The spa treatments were world-class and the private beach felt truly exclusive.' },
  { n: 'Sophie L.', init: 'SL', d: 'January 2026', s: 9.4, t: 'We celebrated our anniversary here and it was magical. The attention to detail and the incredible cocktail bar made this trip unforgettable.' },
];
/* NB: there is deliberately no stock-photo fallback here any more. A hotel with no images
   used to borrow five Unsplash beaches, so the page showed a property the traveller was
   never going to stay in. Missing photos now render <HotelPhotoFallback> instead. */

/* ── Photo categories ──────────────────────────────────────────────────────
   Hotelbeds image-type dictionary — the SAME codes the admin dashboard's
   Gallery tab groups by (IMAGE_TYPE_LABELS in hotel.controller.js). Every
   image row from /hotels/bulk carries `imageTypeCode`; unknown/null codes
   fold into General so nothing is ever dropped. */
const PHOTO_TYPES = {
  GEN:  'General',
  RES:  'Exterior',
  HAB:  'Rooms',
  PIS:  'Pool',
  PLY:  'Beach',
  TER:  'Terrace',
  JAR:  'Garden',
  REST: 'Restaurant',
  BAR:  'Bar',
  SPA:  'Spa',
  GIM:  'Gym',
  DEP:  'Sports & Leisure',
  LOB:  'Lobby',
  COM:  'Common Areas',
  SAL:  'Meeting Rooms',
  CON:  'Conference Rooms',
};
// Hotelbeds stores beach photos as PLA (playa); the dashboard dictionary says PLY.
// Fold the live code into the canonical one so beach photos never show as "Pla".
const PHOTO_TYPE_ALIAS = { PLA: 'PLY' };
const PHOTO_TYPE_ORDER = Object.keys(PHOTO_TYPES); // overview → sleep → water → outdoors → food → wellness → indoors
const PHOTO_TYPE_ICONS = {
  GEN:  <S><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></S>,
  RES:  <S><path d="M3 21h18" /><path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /></S>,
  HAB:  <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M2 17h20" /><path d="M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" /></S>,
  PIS:  <S><path d="M2 6c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" /><path d="M2 12c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" /><path d="M2 18c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" /></S>,
  PLY:  <S><path d="M12 2a9 9 0 019 9H3a9 9 0 019-9z" /><path d="M12 11v8a3 3 0 006 0" /><path d="M12 2v2" /></S>,
  TER:  <S><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>,
  JAR:  <S><path d="M7 21h10" /><path d="M12 21V11" /><path d="M12 11C12 7 9 4 4 4c0 5 3 8 8 7z" /><path d="M12 14c0-3 2.5-5.5 7-5.5 0 4-2.5 6.5-7 5.5z" /></S>,
  REST: <S><path d="M3 2v7a2 2 0 002 2h4a2 2 0 002-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 00-5 5v6a2 2 0 002 2h3z" /><path d="M21 15v7" /></S>,
  BAR:  <S><path d="M8 22h8" /><path d="M12 15v7" /><path d="M12 15a5 5 0 005-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 005 5z" /></S>,
  SPA:  <S><path d="M12 2s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></S>,
  GIM:  <S><path d="M6.5 6.5l11 11" /><path d="M21 21l-1-1M3 3l1 1" /><path d="M18 22l4-4M2 6l4-4" /><path d="M3 10l7-7M14 21l7-7" /></S>,
  LOB:  <S><path d="M19 9V6a2 2 0 00-2-2H7a2 2 0 00-2 2v3" /><path d="M3 16a2 2 0 002 2h14a2 2 0 002-2v-5a2 2 0 00-4 0v2H7v-2a2 2 0 00-4 0z" /><path d="M5 18v2M19 18v2" /></S>,
  COM:  <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></S>,
  SAL:  <S><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M12 16v4M8 20h8" /></S>,
  DEP:  <S><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></S>,
  CON:  <S><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></S>,
};

/* ── Flight card sub-component — a boarding-pass row per direction ── */
const layoverMin = (a, b) => {
  if (!a?.arrival || !b?.departure) return null;
  const da = new Date(a.arrival), db = new Date(b.departure);
  if (isNaN(da) || isNaN(db)) return null;
  const m = Math.round((db - da) / 60000);
  return m > 0 ? m : null;
};
const stopsLabel = (n) => (n <= 0 ? 'Direct' : `${n} stop${n > 1 ? 's' : ''}`);


// One direction, summarised across its legs: airline of the first leg, endpoints, total
// gate-to-gate time and stop count. The middle "via" line names the layover airports.
function Journey({ dir, legs }) {
  if (!legs?.length) return null;
  const first = legs[0], last = legs[legs.length - 1];
  const durMin = legs.reduce((s, l) => s + (Number(l.duration) || 0), 0);
  const stops = legs.length - 1;
  const vias = legs.slice(1).map((l) => airportName(l.from));
  const overnight = dayOffset(first.departure, last.arrival);
  return (
    <div className="bp-journey">
      <div className="bp-jhead">
        <span className="bp-dir">{dir === 'Return' ? ICON.arrowBack : ICON.plane}<span>{dir}</span></span>
        <span className="bp-jdate">{fmtDateLong(first.departure)}</span>
        <span className="bp-airline">
          <AirlineMark code={first.airline} className="bp-airmark" nameClassName="bp-airname" />
          <span className="bp-flno">{flightNumber(first)}</span>
        </span>
      </div>
      <div className="bp-route">
        <div className="bp-end">
          <div className="bp-time">{fmtTime(first.departure)}</div>
          <div className="bp-city" title={airportName(first.from)}>{airportName(first.from)}</div>
          <div className="bp-code">{first.from}</div>
        </div>
        <div className="bp-mid">
          <div className="bp-dur">{fmtDur(durMin)}</div>
          <div className="bp-track"><span className="bp-plane">{ICON.plane}</span></div>
          <div className={`bp-stops${stops ? ' has' : ''}`}>{stopsLabel(stops)}</div>
        </div>
        <div className="bp-end bp-end-r">
          <div className="bp-time">
            {fmtTime(last.arrival)}
            {overnight > 0 && <sup className="bp-nextday">+{overnight} day{overnight > 1 ? 's' : ''}</sup>}
          </div>
          <div className="bp-city" title={airportName(last.to)}>{airportName(last.to)}</div>
          <div className="bp-code">{last.to}</div>
        </div>
      </div>
      {stops > 0 && <div className="bp-via">{ICON.clock} Via {vias.join(', ')}</div>}
    </div>
  );
}

// The per-segment timeline shown when a card is expanded (airline, flight number, each
// leg's own gate times, and the layover between legs).
function JourneyTimeline({ label, legs }) {
  if (!legs?.length) return null;
  return (
    <div className="fd-journey">
      <div className="fd-dir"><span className="fd-dir-label">{label}</span><span className="fd-dir-date">{fmtDateLong(legs[0].departure)}</span></div>
      {legs.map((leg, i) => (
        <div key={i} className="fd-seg-wrap">
          {i > 0 && (() => {
            const lay = layoverMin(legs[i - 1], leg);
            return lay ? <div className="fd-layover">{ICON.clock} {fmtDur(lay)} layover in {airportName(leg.from)}</div> : null;
          })()}
          <div className="fd-segment">
            <div className="fd-seg-timeline"><div className="fd-dot" /><div className="fd-line" /><div className="fd-dot" /></div>
            <div className="fd-seg-body">
              <div className="fd-seg-row"><span className="fd-seg-airport">{airportName(leg.from)} <em>{leg.from}</em></span><span className="fd-seg-time">{fmtTime(leg.departure)}</span></div>
              <div className="fd-seg-meta"><span className="fd-seg-air"><AirlineMark code={leg.airline} className="fd-seg-mark" />{flightNumber(leg)}</span><span className="fd-seg-dur">{fmtDur(leg.duration)}</span></div>
              <div className="fd-seg-row"><span className="fd-seg-airport">{airportName(leg.to)} <em>{leg.to}</em></span><span className="fd-seg-time">{fmtTime(leg.arrival)}</span></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Flight-filter controls ─────────────────────────────────────────────────────
   Airlines beyond this many hide behind "Show more" — the rail is 250px and a charter
   destination can come back with a dozen carriers. */
const AIRLINES_COLLAPSED = 4;

/**
 * The ⓘ beside a filter group's title. Native `title` rather than a scripted tooltip: it
 * survives inside the modal's own scroll container, needs no positioning logic, and is
 * already what a keyboard and a screen reader read.
 */
function FilterHint({ text }) {
  return (
    <span className="mf-hint" title={text} aria-label={text} role="img">
      <S size={13} sw={2}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></S>
    </span>
  );
}

/**
 * Departure-time range — two handles over one track.
 *
 * The bounds are the earliest and latest departure in the RESULT SET, not a decorative
 * 00:00–23:59: a handle dragged into an hour nothing departs in can only empty the list, and
 * seeing the real span is itself the answer to "when do these flights actually leave?".
 *
 * Both inputs sit on top of each other (`.mf-range`, pointer-events on the thumbs only) so
 * neither handle can block the other, and each clamps against its twin so they cannot cross.
 */
function TimeRangeFilter({ title, hint, span, value, onChange }) {
  const [from, to] = value;
  const pct = (v) => ((v - span.min) / Math.max(1, span.max - span.min)) * 100;
  const setFrom = (v) => onChange([Math.min(Number(v), to), to]);
  const setTo = (v) => onChange([from, Math.max(Number(v), from)]);
  const touched = from > span.min || to < span.max;

  return (
    <div className="modal-filter-group">
      <div className="modal-filter-title">
        {title}
        <FilterHint text={hint} />
        {touched && (
          <button type="button" className="mf-link" onClick={() => onChange(null)}>Reset</button>
        )}
      </div>
      <div className="mf-range-ends">
        <span>{fmtClock(span.min)}</span>
        <span>{fmtClock(span.max)}</span>
      </div>
      <div className="mf-range-wrap">
        <div className="mf-range-track">
          <div className="mf-range-fill" style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }} />
        </div>
        <input type="range" className="mf-range" min={span.min} max={span.max} step={5}
          value={from} onChange={(e) => setFrom(e.target.value)}
          aria-label={`${title} — earliest`} />
        <input type="range" className="mf-range" min={span.min} max={span.max} step={5}
          value={to} onChange={(e) => setTo(e.target.value)}
          aria-label={`${title} — latest`} />
      </div>
      <div className={`mf-range-value${touched ? ' on' : ''}`}>{fmtClock(from)} – {fmtClock(to)}</div>
    </div>
  );
}

/**
 * One direction as a COLUMN, for the page's headline flight card: the badge and date, then the
 * carrier on its own line, then the route, then what the fare carries.
 *
 * The stacked `Journey` above puts all three on one line, which works in a list of options
 * where the itinerary is scanned. Here there are only two directions and the card is the width
 * of the page, so they sit side by side and each gets room to be read rather than scanned.
 */
function JourneyColumn({ dir, legs, chips }) {
  if (!legs?.length) return null;
  const first = legs[0], last = legs[legs.length - 1];
  const durMin = legs.reduce((s, l) => s + (Number(l.duration) || 0), 0);
  const stops = legs.length - 1;
  const vias = legs.slice(1).map((l) => airportName(l.from));
  const overnight = dayOffset(first.departure, last.arrival);

  return (
    <div className="fc-leg">
      <div className="bp-jhead">
        <span className="bp-dir">{dir === 'Return' ? ICON.arrowBack : ICON.plane}<span>{dir}</span></span>
        <span className="bp-jdate">{fmtDateLong(first.departure)}</span>
      </div>

      {/* The carrier on its own line: at this size the name is a heading, not a footnote to
          the route. */}
      <div className="bp-airrow">
        <AirlineMark code={first.airline} className="bp-airmark" nameClassName="bp-airname" />
        <span className="bp-flno">{flightNumber(first)}</span>
      </div>

      <div className="bp-route">
        <div className="bp-end">
          <div className="bp-time">{fmtTime(first.departure)}</div>
          <div className="bp-city" title={airportName(first.from)}>{airportName(first.from)}</div>
          <div className="bp-code">{first.from}</div>
        </div>
        <div className="bp-mid">
          <div className="bp-dur">{fmtDur(durMin)}</div>
          <div className="bp-track"><span className="bp-plane">{ICON.plane}</span></div>
          <div className={`bp-stops${stops ? ' has' : ''}`}>{stopsLabel(stops)}</div>
        </div>
        <div className="bp-end bp-end-r">
          <div className="bp-time">
            {fmtTime(last.arrival)}
            {overnight > 0 && <sup className="bp-nextday">+{overnight} day{overnight > 1 ? 's' : ''}</sup>}
          </div>
          <div className="bp-city" title={airportName(last.to)}>{airportName(last.to)}</div>
          <div className="bp-code">{last.to}</div>
        </div>
      </div>

      {stops > 0 && <div className="bp-via">{ICON.clock} Via {vias.join(', ')}</div>}

      {/* The allowance is a term of the FARE, so it is the same both ways — printed under each
          direction because that is where a traveller checks it, and never printed at all when
          the supplier told us nothing. */}
      {chips.length > 0 && (
        <div className="bp-incl" aria-label="Included in this fare">
          {chips.map((x) => (
            <span key={x.label} className={`bp-chip${x.ok ? ' bp-chip-inc' : ''}`}>{x.icon}{x.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Flight details: a dialog with two tabs ─────────────────────────────────────
   "View flight details" used to unfold an accordion under the card, which pushed the page
   around and left the itinerary competing with the card it came from. It is a dialog now, and
   the baggage moved out of the itinerary into a tab of its own: a chip reading "Checked
   baggage 20 kg" beside a route is the shortest possible answer to a question that actually
   has several parts to it.

   WHAT THE SUPPLIER STATES, AND WHAT IT DOES NOT. Airtuerk returns one allowance for the
   FARE — hold weight or pieces, and hand luggage — and nothing per leg, no dimensions, and
   nothing at all about a personal item. So the table prints the fare's allowance against
   every flight in the journey and says so underneath; there is no personal-item column and no
   "40 x 30 x 15", because those would be numbers we invented, and a baggage table is read at
   a check-in desk. */

/** Cabin-bag cell. A stated weight when there is one, otherwise the safe inference. */
const cabinAllowance = (b) => {
  if (b?.handKg > 0) return { ok: true, main: `${b.handKg} kg`, sub: 'Included' };
  // No airline sells a hold allowance and then refuses a cabin bag; the WEIGHT is the part
  // that cannot be claimed, so it is not claimed.
  if (b && (b.checkedKg > 0 || b.checkedPieces > 0)) return { ok: true, main: 'Included', sub: 'Weight set by airline' };
  return { ok: false, main: 'Not stated', sub: 'Airline rules apply' };
};

/** Hold-baggage cell. Kilos or pieces, whichever the fare is sold in. */
const checkedAllowance = (b) => {
  if (b?.checkedKg > 0) return { ok: true, main: `${b.checkedKg} kg`, sub: 'Included' };
  if (b?.checkedPieces > 0) {
    return { ok: true, main: `${b.checkedPieces} piece${b.checkedPieces === 1 ? '' : 's'}`, sub: 'Included' };
  }
  if (b) return { ok: false, main: 'Not included', sub: 'Can be added at booking' };
  return { ok: false, main: 'Not stated', sub: 'Airline rules apply' };
};

const AllowanceCell = ({ ok, main, sub }) => (
  <span className={`fdm-allow${ok ? ' on' : ''}`}>
    <span className="fdm-allow-main">{ok && ICON.check}{main}</span>
    <em>{sub}</em>
  </span>
);

/** One direction of the itinerary: every leg, with the layover between them. */
function DetailsJourney({ dir, legs }) {
  if (!legs?.length) return null;
  return (
    <div className="fdm-journey">
      <div className="fdm-jhead">
        <span className="bp-dir">{dir === 'Return' ? ICON.arrowBack : ICON.plane}<span>{dir}</span></span>
        <span className="fdm-jdate">{fmtDateLong(legs[0].departure)}</span>
      </div>
      <div className="fdm-legs">
        {legs.map((leg, i) => {
          const lay = i > 0 ? layoverMin(legs[i - 1], leg) : null;
          const overnight = dayOffset(leg.departure, leg.arrival);
          return (
            <div className="fdm-leg-wrap" key={`${leg.flightNumber || i}-${i}`}>
              {lay != null && (
                <div className="fdm-layover">
                  {ICON.clock}
                  <span><b>{fmtDur(lay)} layover</b> in {airportName(leg.from)}</span>
                </div>
              )}
              <div className="fdm-leg">
                <div className="fdm-point">
                  <div className="fdm-time">{fmtTime(leg.departure)}</div>
                  <div className="fdm-place">{airportName(leg.from)}</div>
                  <div className="fdm-code">{leg.from}</div>
                </div>
                <div className="fdm-mid">
                  <div className="fdm-dur">{fmtDur(leg.duration)}</div>
                  <div className="bp-track"><span className="bp-plane">{ICON.plane}</span></div>
                </div>
                <div className="fdm-point fdm-point-r">
                  <div className="fdm-time">
                    {fmtTime(leg.arrival)}
                    {overnight > 0 && <sup className="bp-nextday">+{overnight} day{overnight > 1 ? 's' : ''}</sup>}
                  </div>
                  <div className="fdm-place">{airportName(leg.to)}</div>
                  <div className="fdm-code">{leg.to}</div>
                </div>
                <div className="fdm-carrier">
                  <AirlineMark code={leg.airline} className="bp-airmark" nameClassName="bp-airname" />
                  <span className="bp-flno">{flightNumber(leg)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One direction's baggage, a row per flight. */
function BaggageTable({ dir, legs, baggage }) {
  if (!legs?.length) return null;
  const cabin = cabinAllowance(baggage);
  const checked = checkedAllowance(baggage);
  return (
    <div className="fdm-bagblock">
      <div className="fdm-jhead">
        <span className="bp-dir">{dir === 'Return' ? ICON.arrowBack : ICON.plane}<span>{dir}</span></span>
        <span className="fdm-jdate">{fmtDateLong(legs[0].departure)}</span>
      </div>
      <div className="fdm-tablewrap">
        <table className="fdm-table">
          <thead>
            <tr>
              <th>Flight</th>
              <th>Airline</th>
              <th>Route</th>
              <th><span className="fdm-th">{ICON.bag}Cabin bag<em>overhead locker</em></span></th>
              <th><span className="fdm-th">{ICON.checkedBag}Checked baggage<em>hold luggage</em></span></th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr key={`${leg.flightNumber || i}-${i}`}>
                <td className="fdm-td-flno">{flightNumber(leg)}</td>
                <td>
                  <span className="fdm-td-air">
                    <AirlineMark code={leg.airline} className="bp-airmark" nameClassName="bp-airname" />
                  </span>
                </td>
                <td className="fdm-td-route">
                  {airportName(leg.from)} ({leg.from}) <span className="fdm-arrow">→</span> {airportName(leg.to)} ({leg.to})
                </td>
                <td><AllowanceCell {...cabin} /></td>
                <td><AllowanceCell {...checked} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The dialog itself. `flight` carries the legs and the fare's single baggage allowance.
 */
function FlightDetailsModal({ flight, onClose }) {
  const [tab, setTab] = useState('info');
  const out = flight?.outLegs || [];
  const ret = flight?.retLegs || [];

  // A dialog over a scrolling page has to hold the page still underneath it, and Escape has
  // to close it — this is the only way out other than the two buttons.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="modal-overlay show fdm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fdm" role="dialog" aria-modal="true" aria-label="Flight details">
        <div className="fdm-head">
          <div>
            <div className="fdm-title">Flight info &amp; baggage</div>
            <div className="fdm-sub">Your selected flight</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <S sw={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
          </button>
        </div>

        <div className="fdm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'info'}
            className={`fdm-tab${tab === 'info' ? ' on' : ''}`} onClick={() => setTab('info')}>
            {ICON.plane}Flight info
          </button>
          <button type="button" role="tab" aria-selected={tab === 'bags'}
            className={`fdm-tab${tab === 'bags' ? ' on' : ''}`} onClick={() => setTab('bags')}>
            {ICON.checkedBag}Baggage information
          </button>
        </div>

        <div className="fdm-body">
          {tab === 'info' ? (
            <>
              <DetailsJourney dir="Outbound" legs={out} />
              <DetailsJourney dir="Return" legs={ret} />
              <div className="fdm-note">
                {ICON.info}
                <span>Times are shown in local time. Flight durations include estimated taxi and boarding times.</span>
              </div>
            </>
          ) : (
            <>
              <BaggageTable dir="Outbound" legs={out} baggage={flight?.baggage} />
              <BaggageTable dir="Return" legs={ret} baggage={flight?.baggage} />
              {/* The allowance the supplier sends belongs to the FARE, not to a leg, so it is
                  the same on every row above. Saying so is the difference between a table a
                  traveller can rely on and one that merely looks thorough. */}
              <div className="fdm-note">
                {ICON.info}
                <span>
                  This allowance is per traveller and covers the whole journey, so it applies to
                  every flight listed. Sizes, and anything carried on top of it, are set by the
                  airline — check their conditions before you fly.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="fdm-foot">
          <button type="button" className="fdm-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Loading skeletons ──────────────────────────────────────────────────────────
   Each one mirrors the real card's geometry, so the block doesn't jump when the data
   lands. A shared `.sk-sh` shimmer drives the sweep; `aria-busy` + a visually-hidden
   caption keep the wait announced to a screen reader instead of silently blank. */
const Sk = ({ w, h = 12, r = 6, style }) => (
  <span className="sk-sh" style={{ width: w, height: h, borderRadius: r, ...style }} />
);

function FlightCardSkeleton() {
  return (
    <div className="flight-card sk-card" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k}>
          {k === 1 && <div className="bp-tear" />}
          <div className="bp-journey">
            <div className="bp-jhead"><Sk w={86} h={20} r={999} /><Sk w={110} /><span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}><Sk w={23} h={23} r={7} /><Sk w={92} /></span></div>
            <div className="bp-route">
              <div><Sk w={78} h={26} r={8} /><Sk w={64} style={{ marginTop: 8 }} /></div>
              <div className="bp-mid"><Sk w={52} h={10} /><Sk w="100%" h={2} r={2} /><Sk w={44} h={10} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}><Sk w={78} h={26} r={8} /><Sk w={64} style={{ marginTop: 8 }} /></div>
            </div>
          </div>
        </div>
      ))}
      <div className="bp-incl">{[74, 104, 92, 88].map((w, i) => <Sk key={i} w={w} h={26} r={999} />)}</div>
      <div className="flight-bottom"><Sk w={132} h={30} r={999} /><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Sk w={62} h={20} /><Sk w={84} h={32} r={999} /></span></div>
    </div>
  );
}

/**
 * Rooms are the one wait on this page that is genuinely slow — a live round-trip to the supplier,
 * seconds not milliseconds. Three grey card outlines held that wait silently, and a shimmer that
 * long stops reading as "loading" and starts reading as "broken": nothing on screen ever said
 * what was happening or that it was still happening.
 *
 * So the rooms get a named wait instead of a skeleton. The doors fill left-to-right on a loop, so
 * there is always visible forward motion, and the caption cycles through what is actually going on
 * — purely in CSS, so a slow supplier costs no timers and no re-renders.
 */
function RoomsLoading() {
  return (
    <div className="rooms-loading" role="status" aria-busy="true">
      <span className="sr-only">Checking live room availability…</span>
      <div className="rl-head" aria-hidden="true">
        <span className="rl-badge">{ICON.bed}</span>
        <div className="rl-copy">
          <div className="rl-title">Finding your rooms<i className="rl-dot" /><i className="rl-dot" /><i className="rl-dot" /></div>
          {/* Stacked and cross-faded on one 10.5s loop; the box is sized by the first line so the
              others can sit on top of it without the card changing height mid-wait. */}
          <div className="rl-lines">
            <span>Knocking on the hotel&apos;s door</span>
            <span>Reading back today&apos;s live rates</span>
            <span>Sorting the boards, cheapest first</span>
          </div>
        </div>
      </div>
      <div className="rl-doors" aria-hidden="true">
        {[0, 1, 2, 3].map((d) => <span key={d} className="rl-door" style={{ '--d': d }} />)}
      </div>
    </div>
  );
}

/* While a section is loading it shows ONLY its placeholders — no heading, no status line.
   The shapes already say "something is coming"; the extra "Checking live room availability…"
   line and the step heading above it were three separate things all announcing the same wait,
   and with three sections loading at once the page read as a stack of status messages.
   The label stays for screen readers via .sr-only — visually silent, still announced, since
   removing it would leave a non-sighted user with no signal at all. */
function SkeletonBlock({ label, children }) {
  return (
    <div className="sk-wrap" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * `banner` turns the card into the page's ONE headline flight: a titled blue band across the
 * top saying which fare this is and why it was chosen. Only the on-page card passes it — the
 * modal lists many cards and a banner on each would be noise, so there it stays undefined and
 * the card renders exactly as before.
 *
 * A banner also suppresses the green `cheapest` frame, because the band already says in words
 * what the frame said in colour, and both at once made the card shout twice.
 */
function FlightCard({ f, selected, cheapest, banner, option, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  // The headline card opens the details as a DIALOG; the list cards inside the change-flight
  // modal keep the inline accordion, because a dialog on top of a dialog is a trap.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const out = f.outLegs || [];
  const ret = f.retLegs || [];
  const hasDetails = out.length > 0;
  const fareIncludes = fareInclusions(f.baggage);

  const detailsBtn = (
    <button className="flight-details-btn" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }} disabled={!hasDetails}>
      {expanded ? 'Hide flight details' : 'View flight details'}
      <S size={13} sw={2.4} className={expanded ? 'fdb-caret up' : 'fdb-caret'}><path d="M6 9l6 6 6-6" /></S>
    </button>
  );

  // ── The page's ONE headline flight ──
  // Two directions side by side under a blue band that says, in words, why this flight and not
  // another. Side by side rather than stacked because there are only ever two of them here and
  // the card is the full width of the page: each direction gets its own column, its own
  // carrier line and its own allowance, instead of being scanned as a list.
  if (banner) {
    return (
      <div className={`flight-card bannered${expanded ? ' expanded' : ''}`}>
        <div className="fc-banner">
          <div className="fc-banner-main">
            <div className="fc-banner-title">{ICON.spark}<span>{banner.title}</span></div>
            <div className="fc-banner-sub">{banner.sub}</div>
          </div>
          {banner.note && (
            <div className="fc-banner-note">{ICON.info}<span>{banner.note}</span></div>
          )}
        </div>

        {/* One column per direction. A one-way has no second column to fill, so the outbound
            takes the whole width rather than leaving half the card blank. */}
        <div className={`fc-legs${ret.length ? '' : ' fc-legs-one'}`}>
          <JourneyColumn dir="Outbound" legs={out} chips={fareIncludes} />
          {ret.length > 0 && <JourneyColumn dir="Return" legs={ret} chips={fareIncludes} />}
        </div>

        <div className="flight-bottom">
          <button className="flight-details-btn" onClick={() => setDetailsOpen(true)} disabled={!hasDetails}>
            View flight details
            <S size={13} sw={2.4} className="fdb-caret"><path d="M6 9l6 6 6-6" /></S>
          </button>
          <div className="bp-buy">
            {f.price != null && (
              <div className="bp-price">
                <b className="live-price">€{f.price.toLocaleString('en-GB')}</b>
                <span className="bp-price-cap">Total for all travellers</span>
              </div>
            )}
            <div className="flight-selected-badge fc-selected-lg">{ICON.check} Selected</div>
          </div>
        </div>

        {f.warning && <div className="flight-warning">{ICON.warn} {f.warning}</div>}
        {detailsOpen && <FlightDetailsModal flight={f} onClose={() => setDetailsOpen(false)} />}
      </div>
    );
  }

  // ── The modal's layout: itinerary on the left, one price rail on the right ──
  // Same journeys, same chips, same details panel as the page card — what changes is that
  // every fact about CHOOSING this flight (is it the one I have, what does it cost me to
  // switch, is it the cheapest) is gathered into a single column instead of being spread
  // along a footer.
  if (option) {
    const { impact } = option;      // € this flight adds to the package vs the one selected now
    return (
      <div className={`flight-card option${selected ? ' selected' : ''}${cheapest && !selected ? ' cheapest' : ''}${expanded ? ' expanded' : ''}`}>
        <div className="fc-status">
          <span className={`fc-radio${selected ? ' on' : ''}`} aria-hidden="true">
            {selected && <S size={12} sw={3.2}><path d="M20 6L9 17l-5-5" /></S>}
          </span>
          <span className="fc-status-label">{selected ? 'Currently selected' : 'Alternative flight'}</span>
        </div>

        <div className="fc-split">
          <div className="fc-main">
            <div className="bp-body">
              <Journey dir="Outbound" legs={out} />
              {ret.length > 0 && (<><div className="bp-tear" /><Journey dir="Return" legs={ret} /></>)}
            </div>
            {fareIncludes.length > 0 && (
              <div className="bp-incl" aria-label="Included in this fare">
                {fareIncludes.map((x) => (
                  <span key={x.label} className={`bp-chip${x.ok ? ' bp-chip-inc' : ''}`}>{x.icon}{x.label}</span>
                ))}
              </div>
            )}
            <div className="fc-main-foot">{detailsBtn}</div>
          </div>

          <div className="fc-rail">
            {selected && <div className="flight-selected-badge">{ICON.check} Selected</div>}
            {f.delta === 0 && <span className="bp-delta bp-delta-best">{ICON.spark} Lowest fare</span>}
            {f.price != null && (
              <>
                <b className="live-price">€{f.price.toLocaleString('en-GB')}</b>
                <span className="bp-price-cap">Total for all travellers</span>
              </>
            )}
            {/* What choosing this flight does to the package total. The figure is measured
                against the flight currently selected — not against the cheapest — because
                that is the price the traveller is holding and the one that would change. */}
            {impact != null && (
              <div className={`fc-impact${impact === 0 ? ' same' : impact > 0 ? ' up' : ' down'}`}>
                {impact === 0
                  ? <>{ICON.check}<span>No change to your package price</span></>
                  : (
                    <>
                      <S size={14} sw={2.4}>{impact > 0
                        ? <path d="M12 19V5M5 12l7-7 7 7" />
                        : <path d="M12 5v14M19 12l-7 7-7-7" />}</S>
                      <span>
                        <b>{impact > 0 ? '+' : '−'} €{Math.abs(Math.round(impact)).toLocaleString('en-GB')}</b>
                        <em>to your package price</em>
                      </span>
                    </>
                  )}
              </div>
            )}
            <span className="fc-taxes">
              Flight price incl. taxes &amp; fees
              <FilterHint text="The fare covers every traveller on this booking, with taxes and airline fees already included. Hotel and extras are priced separately." />
            </span>
            {!selected && (
              <button className="flight-select-btn fc-select" onClick={onSelect}>Select this flight</button>
            )}
          </div>
        </div>

        {f.warning && <div className="flight-warning">{ICON.warn} {f.warning}</div>}
        {expanded && hasDetails && (
          <div className="fd-panel">
            <div className="fd-journeys">
              <JourneyTimeline label="Outbound" legs={out} />
              <JourneyTimeline label="Return" legs={ret} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    // Green is this page's SELECTED colour — it is what the chosen room wears, and what the
    // "Selected" badge on this very card has always been. So the green frame follows
    // `selected`, and exactly one card can hold it at a time.
    //
    // `cheapest` used to draw that green frame independently, which meant the cheapest fare
    // sat in green whether or not it was chosen: pick any other flight and two cards were lit
    // at once, the green one on a flight the traveller had just moved away from. It now marks
    // the best price in BLUE, and steps aside entirely on the selected card — the fare is
    // still named in words by the "Lowest fare" chip, which is the honest place for it.
    <div className={`flight-card${banner ? ' bannered' : ''}${selected ? ' selected' : ''}${cheapest && !selected && !banner ? ' cheapest' : ''}${expanded ? ' expanded' : ''}`}>
      {banner && (
        <div className="fc-banner">
          <div className="fc-banner-main">
            <div className="fc-banner-title">{banner.title}</div>
            <div className="fc-banner-sub">{banner.sub}</div>
          </div>
          {banner.note && (
            <div className="fc-banner-note">{ICON.info}<span>{banner.note}</span></div>
          )}
        </div>
      )}
      <div className="bp-body">
        <Journey dir="Outbound" legs={out} />
        {ret.length > 0 && (<><div className="bp-tear" /><Journey dir="Return" legs={ret} /></>)}
      </div>

      {/* What this fare ACTUALLY includes, from the supplier's own allowance.
          This strip used to be a fixed four — "Cabin bag · Checked baggage · Meal on board ·
          Seat included" — printed identically on every fare, which told travellers a
          hand-luggage-only fare included a checked bag and a meal. Baggage allowance is a term
          of the airline's contract, not decoration.
          Airtuerk returns `baggage` in KILOS and `baggagePiece` as a count; 0 means not
          included. It sends no meal or seat field at all, so those two claims are gone rather
          than guessed. When the supplier tells us nothing the strip renders nothing — silence
          is honest, an unearned tick is not. */}
      {fareIncludes.length > 0 && (
        <div className="bp-incl" aria-label="Included in this fare">
          {fareIncludes.map((x) => (
            <span key={x.label} className={`bp-chip${x.ok ? ' bp-chip-inc' : ''}`}>{x.icon}{x.label}</span>
          ))}
        </div>
      )}

      <div className="flight-bottom">
        <button className="flight-details-btn" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }} disabled={!hasDetails}>
          {expanded ? 'Hide flight details' : 'View flight details'}
        </button>
        <div className="bp-buy">
          <div className="bp-price">
            {f.price != null && <b className="live-price">€{f.price.toLocaleString('en-GB')}</b>}
            {/* WHO the figure covers. A fare this size is read as per person by anyone who
                doesn't ask, and being wrong about that on the way into a checkout is the
                expensive kind of wrong. */}
            {f.price != null && <span className="bp-price-cap">Total for all travellers</span>}
            {/* What this fare costs ON TOP of the cheapest one on offer. Absolute prices are
                hard to rank at a glance when every card reads "€1,969"; the gap is the number
                the traveller is actually deciding on. `delta === 0` is the cheapest itself.
                Suppressed under a banner, which already names the fare in words. */}
            {!banner && f.delta === 0 && <span className="bp-delta bp-delta-best">{ICON.spark} Lowest fare</span>}
            {f.delta > 0 && <span className="bp-delta">+€{Math.round(f.delta).toLocaleString('en-GB')}</span>}
          </div>
          <span className="flight-incl">{ICON.check} All-in fare</span>
          {selected
            ? <div className="flight-selected-badge">{ICON.check} Selected</div>
            : <button className="flight-select-btn" onClick={onSelect}>Select</button>}
        </div>
      </div>
      {f.warning && <div className="flight-warning">{ICON.warn} {f.warning}</div>}

      {expanded && hasDetails && (
        <div className="fd-panel">
          <div className="fd-journeys">
            <JourneyTimeline label="Outbound" legs={out} />
            <JourneyTimeline label="Return" legs={ret} />
          </div>
        </div>
      )}
    </div>
  );
}

// The TripAdvisor rating, shown in the hero next to the star rating. `review` is the
// normalised shape from the availability API — { rate, count, type, outOf } — or null, in
// which case the badge renders nothing at all (an unrated hotel shows no empty widget).
//
// The rating is drawn as five circles filled proportionally to `rate/outOf` (TripAdvisor's own
// convention), with the numeric score and, when we have it, the review count. `count === 0`
// means "rated, but the count wasn't returned" — we show the score without a misleading "0".
function GuestRating({ review }) {
  const r = formatReview(review);
  if (!r) return null;
  // The band drives the colour, so the badge can never celebrate a score its own word calls
  // "Fair". `title` keeps the full sentence available to screen readers and on hover.
  return (
    <span className={`sd-rating sd-rating-${scoreBand(r.score)}`} title={r.title}>
      <span className="sd-rating-badge">
        {r.score}<span className="sd-rating-outof">/{r.outOf}</span>
      </span>
      {/* Two lines, nothing else. A proportional meter lived here briefly and was a mistake:
          in a flex column it stretched to the width of the review-count line, so it read as a
          stray rule floating between the verdict and the source rather than as a scale. */}
      <span className="sd-rating-body">
        <span className="sd-rating-word">{scoreWord(r.score)}</span>
        <span className="sd-rating-meta">
          <span className="sd-rating-src">{r.label}</span>
          {r.count > 0 && <span className="sd-rating-count">{r.count.toLocaleString('en-GB')} reviews</span>}
        </span>
      </span>
    </span>
  );
}

// A mosaic tile. HotelImg already steps down through the smaller CDN sizes; when even the
// last one fails the tile used to `display:none` itself and leave a navy gap in the hero —
// now it swaps in the illustrated fallback, so the mosaic keeps its five-tile composition.
// `onFail` tells the page which sources are dead, so a hotel whose WHOLE set 404s (they
// exist: 18684 carries 31 rows and the CDN serves none of them) collapses to one panel
// instead of five near-identical illustrations.
function HeroPhoto({ src, seed, onFail, ...rest }) {
  // Derive-during-render (same pattern as HotelImg): a new src un-breaks the tile without
  // an effect and its extra render pass.
  const [broken, setBroken] = useState({ src, failed: false });
  const failed = broken.src === src && broken.failed;
  if (broken.src !== src) setBroken({ src, failed: false });

  if (!src || failed) return <HotelPhotoFallback variant="tile" seed={seed} />;
  return <HotelImg src={src} onError={() => { setBroken({ src, failed: true }); onFail?.(src); }} {...rest} />;
}

export default function HotelDetail() {
  const { hotelCode } = useParams();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pageRef = useRef(null);

  // The results card opens this page in a NEW TAB, which cannot carry react-router's
  // in-memory `state` — so every field falls back to a URL query param. `qp` reads those.
  const qp = (key) => searchParams.get(key) || '';

  // Hotel identity: from the clicked card when navigating in-app, else rebuilt from the URL.
  const hotel = state?.hotel || {
    hotelCode,
    name:        qp('name'),
    img:         qp('img'),
    loc:         qp('loc'),
    stars:       qp('stars'),
    currency:    qp('currency'),
    totalAmount: Number(qp('total')) || undefined,
  };

  // Full content record (images, description, facilities). Handed over in-app; when the page
  // is opened cold we fetch it ourselves so the gallery/description are real, not the demo set.
  const [fetchedInfo, setFetchedInfo] = useState(null);
  // Whether that fetch has finished (either way). The hero needs it to tell "no photos yet,
  // still loading" from "this hotel genuinely has none" — the first shows a skeleton, the
  // second the illustrated fallback, and flashing the fallback mid-load would look broken.
  const [infoSettled, setInfoSettled] = useState(!!state?.info || !hotelCode);
  useEffect(() => {
    if (state?.info || !hotelCode) return;
    let cancelled = false;
    fetch(`${CONTRACTS_API}/hotels/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotelCodes: [String(hotelCode)] }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const rec = d?.data?.[0]; if (cancelled) return; if (rec) setFetchedInfo(rec); setInfoSettled(true); })
      .catch(() => { if (!cancelled) setInfoSettled(true); /* keep whatever the URL gave us */ });
    return () => { cancelled = true; };
  }, [hotelCode, state?.info]);
  const info = state?.info || fetchedInfo;

  // Header / booking facts, preferring the richest source available.
  // The REAL name from the hotel-info record (bulk) wins over the carried-in name, because the
  // price cache often has no hotelName and the card then passes a "Hotel {code}" placeholder —
  // which must never override the actual name once the info loads.
  const carriedName = hotel?.name && !/^Hotel\s+\d+$/i.test(hotel.name.trim()) ? hotel.name.trim() : '';
  const hotelName = info?.name?.trim() || carriedName || `Hotel ${hotelCode}`;
  // Never invent a rating: unknown star data renders NO stars (the old `|| 5`
  // fallback showed budget hotels as "5-star").
  const stars = Number(hotel?.stars) || Number(info?.stars) || 0;
  // Star (hotel) vs key (apartment) rating. Apartments are rated in keys, not stars — the bulk
  // info record carries the kind; fall back to a star rating from the star count.
  const dispRating = info?.rating || (stars > 0 ? { kind: 'star', value: stars } : null);
  // Prefer the clean geo city (info.cityName) over the raw supplier text (info.city) and over
  // hotel.loc — the latter is the SEARCH SCOPE label (e.g. "Costa del Sol" for a multi-city
  // search), not necessarily this hotel's own city.
  const locLabel = info?.cityName || info?.city || hotel?.loc || 'Greece, Zakynthos, Agios Sostis';
  // The hotel's district ("Gumbet", "Taksim"), shown next to the city — skipped when it just
  // repeats the city name.
  const zoneLabel = info?.zoneName && info.zoneName.toLowerCase() !== String(locLabel).toLowerCase()
    ? info.zoneName
    : '';
  const currency = hotel?.currency || '€';
  const ccy = currency === 'EUR' ? '€' : currency;
  // ── the "Compare the lowest prices" bar edits the search IN PLACE ───────────
  // Every field starts at what the traveller searched (router state → URL param) and
  // an entry in `ovr` overrides it. Keeping the override separate means an untouched
  // filter still reflects the original search, and "reset" is just clearing the key.
  const [ovr, setOvr] = useState({});
  // Stay length: the searched check-in/check-out dates are the source of truth (a "7 day" search
  // is checkOut − checkIn = 6 nights). Only when no dates are present do we fall back to an
  // explicit nights value, then to 6 (a one-week "7 day" default). This stops the page inventing
  // a 7-night stay for a 6-night search and pushing the checkout a day late.
  const paramNights = nightsBetween(state?.checkIn || qp('checkIn'), state?.checkOut || qp('checkOut'))
    ?? (Number(state?.nights || qp('nights')) || 6);
  const nights = ovr.nights ?? paramNights;
  // NOTE: the page-wide "from" figure is `fromPP` (see below). There is deliberately no
  // hardcoded fallback price — a cold visit shows "Pick a date", never an invented number.

  // real photos from the bulk hotel record (fallback to demo gallery). Kept as the CANONICAL
  // (default-size) URLs; each <HotelImg> below requests the size its box needs and falls back
  // safely if that size is missing — so the array is also safe to hand to checkout/favourites
  // as a plain reference.
  //
  // MASTER-FIRST: sorted by the admin's visualOrder (the promoted master image has the lowest
  // value), so the hero and the first gallery tile are always the master image.
  const imgOrder = (im) => im?.visualOrder ?? im?.order ?? 999;
  const realImages = Array.isArray(info?.images) && info.images.length
    ? [...info.images].sort((a, b) => imgOrder(a) - imgOrder(b)).map((im) => im.url).filter(Boolean)
    : null;
  //
  // When the record has none, the only honest candidate left is the thumbnail the results
  // card carried in; with neither, `images` is EMPTY and the hero paints the illustrated
  // fallback rather than someone else's hotel.
  const cardImg = typeof hotel?.img === 'string' && hotel.img.trim() ? hotel.img.trim() : null;
  const images = realImages && realImages.length ? realImages.slice(0, 30) : (cardImg ? [cardImg] : []);

  // Sources the CDN refused, collected from the tiles. A record can list photos that do not
  // exist at any size (18684: 31 rows, none served), and five separate "this one failed"
  // illustrations read as a broken page — so when the whole mosaic is dead we treat the hotel
  // as photo-less and show the single panel.
  const [deadImages, setDeadImages] = useState(() => new Set());
  const markDead = (src) => setDeadImages((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  const mosaic = images.slice(0, 5);
  const mosaicDead = mosaic.length > 0 && mosaic.every((src) => deadImages.has(src));

  const photoCount = realImages?.length || images.length;
  const hasPhotos = images.length > 0 && !mosaicDead;
  // Still waiting on /hotels/bulk and nothing to show meanwhile — skeleton, not fallback.
  const photosLoading = !hasPhotos && !mosaicDead && !infoSettled;
  // One photo (or none) can't fill a five-tile mosaic, so the panel goes full-bleed instead.
  const soloPhoto = !photosLoading && (!hasPhotos || images.length < 2);
  // What checkout, favourites and the share card should use as the thumbnail — nothing at all
  // when the set is dead, so they draw their own stand-in instead of a broken <img>.
  const heroImage = hasPhotos ? images[0] : undefined;

  // Group the real photos by imageTypeCode (the admin dashboard's categories: General,
  // Rooms, Pool, Beach, Bar…). Demo/fallback images carry no type, so `photoCats` stays
  // null there and the categorized explorer simply isn't offered.
  const photoCats = (() => {
    if (!Array.isArray(info?.images) || !info.images.length) return null;
    const by = new Map();
    const sorted = [...info.images].sort((a, b) => (a.order ?? a.visualOrder ?? 999) - (b.order ?? b.visualOrder ?? 999));
    for (const im of sorted) {
      if (!im?.url) continue;
      const raw = PHOTO_TYPE_ALIAS[im.imageTypeCode] || im.imageTypeCode;
      const code = typeof PHOTO_TYPES[raw] === 'string' ? raw : 'GEN';
      if (!by.has(code)) by.set(code, []);
      by.get(code).push(im.url);
    }
    if (!by.size) return null;
    return [...by.entries()]
      .map(([code, imgs]) => ({ code, label: PHOTO_TYPES[code], imgs }))
      .sort((a, b) => PHOTO_TYPE_ORDER.indexOf(a.code) - PHOTO_TYPE_ORDER.indexOf(b.code));
  })();

  // Search context (for the live calendar + availability calls). URL params are the
  // fallback so a new tab / shared link still prices the same stay.
  const destination  = state?.destination || qp('destination');
  const paramCheckIn  = state?.checkIn  || qp('checkIn');
  const paramCheckOut = state?.checkOut || qp('checkOut');
  // Today is the floor for EVERY departure date on this page. Clamped here, at the single place
  // the whole page reads its check-in from, rather than at each consumer: a bookmarked or shared
  // link months old used to leave the search bar advertising a departure that had already
  // happened while the price strip quietly showed this week — two different stays on one screen,
  // and a flight search run for a date no airline will sell.
  const today = todayISO();
  const notBeforeToday = (iso) => (iso && iso < today ? today : iso);
  const rawCheckIn   = ovr.checkIn ?? paramCheckIn;
  const baseCheckIn  = notBeforeToday(rawCheckIn);
  const checkInWasPast = !!rawCheckIn && baseCheckIn !== rawCheckIn;
  // Check-out follows check-in + nights once EITHER has been edited; an untouched bar
  // keeps the searched check-out verbatim (it may not be checkIn+nights apart). A clamped
  // check-in counts as an edit — keeping the old check-out verbatim would put it BEFORE the
  // check-in and price a negative stay.
  const baseCheckOut = (ovr.checkIn != null || ovr.nights != null || checkInWasPast)
    ? (baseCheckIn ? addDaysISO(baseCheckIn, nights) : paramCheckOut)
    : paramCheckOut;
  // The party last committed anywhere on the site, kept for 48 hours (utils/paxStore). It is
  // consulted ONLY when neither the router state nor the address bar says who is travelling —
  // a shared or favourited link states its own occupancy and must keep it, or opening someone
  // else's "2 adults" hotel would re-price it for the visitor's own family. `hasPaxParams`
  // treats the three counts as one answer, so a link carrying only `adults` still owns all of
  // them rather than borrowing a remembered second room.
  const linkOwnsPax = state?.adults != null || state?.children != null || state?.rooms != null
    || hasPaxParams(searchParams);
  const [storedPax] = useState(() => (linkOwnsPax ? null : loadPax()));
  const sAdults   = String(ovr.adults   ?? state?.adults   ?? (qp('adults')   || storedPax?.adults   || '2'));
  const sChildren = String(ovr.children ?? state?.children ?? (qp('children') || storedPax?.children || '0'));
  const sRooms    = String(ovr.rooms ?? state?.rooms  ?? (qp('rooms')  || storedPax?.rooms  || '1'));
  // Numeric party size, for the places that recap the search back to the traveller rather than
  // send it to a supplier. Defaults match sAdults/sChildren/sRooms above.
  const availAdults   = Number(sAdults)   || 2;
  const availChildren = Number(sChildren) || 0;
  const availRooms    = Number(sRooms)    || 1;
  // children's ages (csv) — HotelBeds requires an age per child for availability.
  // A restored party contributes ages RECOMPUTED for the date being searched rather than the
  // ones filed 48 hours ago: the stored figure was true for whatever departure was open then,
  // and a child who has had a birthday since is a year older to the hotel.
  const storedChildAges = storedPax ? agesForCheckIn(storedPax, baseCheckIn) : '';
  const paramChildAges = String(ovr.childAges ?? state?.childAges ?? (qp('childAges') || storedChildAges));
  // Trim/pad the age list to the chosen child count — HB 400s on a child with no age.
  const sChildAges = (() => {
    const n = parseInt(sChildren, 10) || 0;
    if (!n) return '';
    const ages = paramChildAges.split(',').map((a) => a.trim()).filter(Boolean);
    return Array.from({ length: n }, (_, i) => ages[i] || String(CHILD_AGE_DEFAULT)).join(',');
  })();
  // The birthdays behind those ages, as typed in the search bar. Nothing on this page prices
  // on them — the supplier takes the age — but the checkout books on the date, so they ride
  // along rather than being asked for a second time. Only kept while they still agree with
  // the ages actually being priced (`dobsMatchAges`), never padded with a guess.
  const paramChildDobs = String(ovr.childDobs ?? state?.childDobs ?? (qp('childDobs') || storedPax?.childDobs || ''));
  const sChildDobs = (() => {
    const n = parseInt(sChildren, 10) || 0;
    if (!n || !paramChildDobs) return '';
    const dobs = paramChildDobs.split(',').map((d) => d.trim()).filter(Boolean);
    if (dobs.length !== n) return '';
    return dobsMatchAges(dobs.join(','), sChildAges, baseCheckIn) ? dobs.join(',') : '';
  })();
  // Remember the party for the next visit — but only once it has been EDITED here (`ovr`),
  // never on arrival. A hotel link opened from a share, a favourite or a crawler carries
  // somebody else's occupancy, and writing that on sight would overwrite the visitor's own
  // family with two strangers and throw their children's birthdays away.
  const paxEdited = ovr.adults != null || ovr.children != null || ovr.rooms != null
    || ovr.childAges != null || ovr.childDobs != null;
  useEffect(() => {
    if (!paxEdited) return;
    savePax({ adults: sAdults, children: sChildren, rooms: sRooms, childAges: sChildAges, childDobs: sChildDobs });
  }, [paxEdited, sAdults, sChildren, sRooms, sChildAges, sChildDobs]);
  // Departure airport — priority order: an in-page edit, then the airport chosen on the
  // results page (URL — the card opens in a new tab, so only the query string arrives),
  // then the default. `normaliseOrigin` guards the URL value: an airport we don't sell
  // from would be handed to the supplier verbatim and come back empty with no explanation.
  const origin = normaliseOrigin(ovr.origin ?? state?.origin ?? qp('origin') ?? DEFAULT_ORIGIN);
  // How the traveller gets there, decided on the results page and honoured here: own
  // transport runs NO flight (or transfer) search at all — a supplier call for a flight
  // the traveller said they don't want. Links that predate the parameter (bookmarks,
  // favourites, OG shares) keep the historic behaviour: flights shown.
  const transport = ovr.transport ?? ((state?.transport || qp('transport')) === 'hotel_only' ? 'hotel_only' : 'package');
  // Board preference: '' = no preference, else a boardRank key the room list filters on.
  const boardPref = ovr.board ?? '';

  const [activeTab, setActiveTab] = useState('Prices');
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState({});
  const isAuth = useSelector((s) => s.auth?.isAuthenticated);
  const { showToast } = useToast();

  // Reflect whether this hotel is already in the user's favourites.
  useEffect(() => {
    if (!isAuth || !hotelCode) return;
    let active = true;
    fetchFavouriteCodes().then((set) => { if (active) setSaved(set.has(String(hotelCode))); });
    return () => { active = false; };
  }, [isAuth, hotelCode]);

  const handleSave = () => {
    if (!isAuth) { showToast('Sign in to save favourites', 'info'); navigate('/login'); return; }
    const was = saved;
    setSaved(!was); // optimistic
    // Remember the destination code so Favourites can re-open this hotel with live prices.
    if (!was) rememberDestCode(hotelCode, destination);
    const req = was
      ? removeFavourite(hotelCode)
      : addFavourite({ hotelCode, hotelName, destination: locLabel, stars, imageUrl: heroImage, destinationCode: destination });
    req
      .then(() => showToast(was ? 'Removed from favourites' : 'Saved to favourites', 'success'))
      .catch(() => {
        setSaved(was); // revert on failure
        showToast('Couldn’t update favourites. Please try again.', 'error');
      });
  };
  // The chosen departure DAY, held as an ISO date rather than a strip index. The strip pages a
  // week at a time now, so position 3 means a different date after every page — only the date
  // itself survives paging, and it stays selected even when it scrolls out of view.
  const [selectedISO, setSelectedISO] = useState(null);
  const [liveChecked, setLiveChecked] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState(0);
  // The modal selects into `selectedFlight` directly — it used to hold its own separate
  // index, so picking a flight there changed nothing on the page behind it.
  const [modalOpen, setModalOpen] = useState(false);
  // Lightbox now carries its OWN photo list, so it can show either the full set
  // (mosaic tiles) or one category from the explorer: { imgs, i, label|null }.
  const [lightbox, setLightbox] = useState(null);
  // Full-screen categorized photo explorer (only offered when photoCats exists).
  const [explorer, setExplorer] = useState(false);
  const [explorerCat, setExplorerCat] = useState('ALL');
  const [showAllFac, setShowAllFac] = useState(false);
  // Which category cards have had their "+N more" opened, keyed by category key.
  const roomRailRef = useRef(null);
  // null = never asked · {loading} · {error} · {data} — the block is simply absent until asked.
  const [weather, setWeather] = useState(null);
  const [openCats, setOpenCats] = useState(() => new Set());
  // Which value the copy buttons last put on the clipboard, so exactly one shows "Copied".
  const [copied, setCopied] = useState(null);
  const [reviewsSeen, setReviewsSeen] = useState(false);

  // ── Facility + location derivations ──────────────────────────────────────────
  // The supplier's own grouping is far coarser than anything worth showing a guest (one group
  // called "Facilities" carries a third of a resort's rows), so the raw list is re-bucketed
  // into travel-shaped categories. All four are pure functions of the same array.
  const rawFacilities = info?.facilities;
  const { categories: facCategories, total: facTotal } = useMemo(
    () => categoriseFacilities(rawFacilities), [rawFacilities],
  );
  const popularFacs = useMemo(() => popularFacilities(rawFacilities), [rawFacilities]);
  const nearby = useMemo(() => nearbyDistances(rawFacilities), [rawFacilities]);
  const glance = useMemo(() => glanceFacts(rawFacilities), [rawFacilities]);

  const toggleCat = (key) => setOpenCats((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Weather is fetched only once the Information tab is actually opened, and only once per
  // hotel. Most visitors never leave the Prices tab, and the upstream plan is metered — asking
  // on page load would spend a call for every hotel anyone glances at.
  // "Have we asked yet" is a ref, not the state below, and the difference is the whole bug:
  // with `weather` in the dep array, setting it to {loading} re-ran this effect, whose cleanup
  // flipped `cancelled` on the request still in flight — so the answer arrived and was thrown
  // away, and the block never appeared. The ref keeps the guard out of the dependency graph.
  const weatherAsked = useRef(null);
  useEffect(() => {
    if (activeTab !== 'Information' || !info?.latitude || !info?.longitude) return undefined;
    const key = `${info.latitude},${info.longitude}`;
    if (weatherAsked.current === key) return undefined;
    weatherAsked.current = key;

    let cancelled = false;
    setWeather({ loading: true });
    axiosInstance
      .get('/weather', { params: { lat: info.latitude, lon: info.longitude } })
      .then(({ data }) => {
        if (cancelled) return;
        setWeather(data?.success && data?.data ? { data: data.data } : { error: true });
      })
      .catch(() => { if (!cancelled) setWeather({ error: true }); });
    return () => { cancelled = true; };
  }, [activeTab, info?.latitude, info?.longitude]);

  const copyValue = async (value, key) => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  };
  // `.live` holds the chosen rate's index in the flat live-rooms array. The old per-stay /
  // per-meal keys went with the demo room list.
  const [selectedRoom, setSelectedRoom] = useState({});

  // live data: 7-day calendar + per-day availability
  // null = never asked (no dates yet) · [] = asked, nothing on offer · [...] = live prices.
  // `calError` separates "the price service failed" from "this hotel is genuinely full",
  // because the traveller needs a different answer to each and the old code showed a
  // hardcoded demo week for both.
  // Fare-strip cache. `byDate` accumulates EVERY week the traveller has paged through, so
  // stepping back to a week already seen costs nothing and the picked day stays priceable after
  // it scrolls out of view. `scope` records the search those prices were quoted under — change
  // the hotel, the party or the length of stay and the whole map is dropped rather than mixing
  // prices for two different stays in one strip.
  const [cal, setCal] = useState({ scope: '', byDate: {} });
  // First day of the visible week. `base` pins it to the departure date it was paged from, so
  // editing the search snaps the strip back to the new date with no effect and no stale offset.
  const [win, setWin] = useState({ base: null, start: null });
  const [calError, setCalError]     = useState(false);
  const [calReload, setCalReload]   = useState(0);      // bumped by the Try again button
  const [calLoading, setCalLoading] = useState(false);
  const [liveRooms, setLiveRooms]   = useState(null);   // {loading?|error?|rooms[]|cheapest}
  const [checkedEmpty, setCheckedEmpty] = useState(new Set());
  // The hotel's TripAdvisor rating: { rate, count, type, outOf } or null. Primary source is the
  // harvested store, served on the bulk hotel-info record (`info.review`) — no live call. This
  // state is only a FALLBACK for a hotel the harvest hasn't covered yet: if the traveller picks
  // a date, the availability response carries a live rating we adopt (see checkAvailability).
  const [review, setReview]         = useState(null);
  const [liveFlights, setLiveFlights] = useState(null); // {loading?|error?|flights[]|cheapest}

  // Scroll-reveal.
  //
  // `.reveal` starts at opacity:0 and only becomes visible once this observer adds `.vis`. It
  // therefore MUST re-run whenever new `.reveal` nodes can appear, or those nodes sit invisible
  // forever — at full height, because opacity does not remove them from layout. That is exactly
  // what happened to the flights and overview sections: they mount only after the availability
  // check, long after this effect last ran on [activeTab], so the page showed the rooms and then
  // several hundred pixels of blank space where two invisible sections were still taking up room.
  // (room-section and transfer-section had been hand-patched with a literal `vis` to dodge this;
  // the deps below fix the cause, so new sections don't need to remember that trick.)
  //
  // Re-running is cheap and idempotent: the query skips anything already revealed, and each
  // element is unobserved the moment it fires.
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.reveal:not(.vis)') || [];
    if (!els.length) return undefined;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // `checkedEmpty`, not the `dayUnavailable` derived from it further down the component: a
    // const referenced above its declaration is a temporal-dead-zone ReferenceError thrown on
    // every render, which blanks the whole page. Same failure mode as the `sel` outage. The
    // underlying state changes at exactly the same moments, so the effect still re-runs when a
    // day's availability flips.
  }, [activeTab, liveChecked, checkedEmpty, transport, liveRooms, liveFlights]);

  // lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  // lightbox: scroll lock + keyboard nav
  // No photos at all → nothing to open (the hero panel is an illustration, not a picture).
  const openLightbox  = (imgs, i = 0, label = null) => { if (imgs?.length) setLightbox({ imgs, i, label }); };
  const closeLightbox = () => setLightbox(null);
  const prevImg = (e) => { e?.stopPropagation(); setLightbox((lb) => lb && { ...lb, i: (lb.i - 1 + lb.imgs.length) % lb.imgs.length }); };
  const nextImg = (e) => { e?.stopPropagation(); setLightbox((lb) => lb && { ...lb, i: (lb.i + 1) % lb.imgs.length }); };
  useEffect(() => {
    if (!lightbox) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') prevImg();
      else if (e.key === 'ArrowRight') nextImg();
    };
    window.addEventListener('keydown', onKey);
    // Closing the lightbox must NOT unlock scroll if the explorer is still open underneath.
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = explorer ? 'hidden' : ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, explorer]);

  // explorer: scroll lock + Escape (only when the lightbox isn't open above it)
  const openExplorer = (cat = 'ALL') => { setExplorerCat(cat); setExplorer(true); };
  useEffect(() => {
    if (!explorer) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !lightbox) setExplorer(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer, lightbox]);

  // animate rating bars once Reviews tab is opened
  useEffect(() => { if (activeTab === 'Reviews') setReviewsSeen(true); }, [activeTab]);

  // preload gallery images so the lightbox and tiles paint instantly
  useEffect(() => {
    images.forEach((src) => { const im = new window.Image(); im.src = src; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // ── the paged fare strip ──
  // The cache endpoint always returns CAL_DAYS days FORWARD from the check-in it is handed, so
  // paging is nothing more than asking again from a different day. Today is the hard floor: the
  // traveller can step back as far as the current week and no further.
  // `today` / `notBeforeToday` are defined up with baseCheckIn — the clamp has to happen before
  // anything reads the check-in, not just before the strip does.
  // The DEFAULT window (arriving from results, or after a search edit drops the pick) centres
  // the searched day — three days either side to compare against, exactly like pickDay does —
  // instead of parking it as the leftmost bar. Near-today departures sit as close to centre as
  // the floor allows.
  const winStart = (win.base === baseCheckIn && win.start) ? win.start : notBeforeToday(addDaysISO(baseCheckIn, -CAL_CENTRE));
  const canPageBack = !!winStart && winStart > today;
  // ONE DAY per press, not one week: the strip walks along the calendar the way the traveller
  // reads it, so stepping back off Monday the 4th lands on Sunday the 3rd rather than skipping a
  // week out of view.
  const pageDay = (delta) => {
    if (!winStart) return;
    const next = notBeforeToday(addDaysISO(winStart, delta));
    if (next === winStart) return;           // already against the floor — nothing to redraw
    setWin({ base: baseCheckIn, start: next });
  };

  // Prices only compare within one search, so this is the identity the cached days belong to.
  // `calReload` is part of it, which is what makes the "Try again" button re-fetch.
  const calScope = [hotelCode, destination, nights, sAdults, sChildren, sRooms, calReload].join('|');

  // Every day already asked for, so stepping never re-requests one. A ref rather than state
  // because writing it must not itself re-run the effect that reads it.
  const askedRef = useRef({ scope: '', days: new Set() });

  useEffect(() => {
    if (!hotelCode || !destination || !winStart) { setCalError(false); return; }
    const asked = askedRef.current;
    if (asked.scope !== calScope) { asked.scope = calScope; asked.days = new Set(); }

    let cancelled = false;
    const roomsN = Math.max(1, parseInt(sRooms, 10) || 1);

    // One request, covering CAL_DAYS days forward from `blockStart`.
    const load = (blockStart, visible) => {
      for (let k = 0; k < CAL_DAYS; k++) asked.days.add(addDaysISO(blockStart, k));
      const qs = new URLSearchParams({
        // checkOut is derived from the block, not from the original search: the endpoint reads
        // the stay length off this pair, so sending the searched check-out would re-price a
        // stepped-to day at the wrong number of nights.
        hotelCode: String(hotelCode), destination, checkIn: blockStart, checkOut: addDaysISO(blockStart, nights),
        adults: sAdults, children: sChildren, rooms: String(roomsN), source: 'combined',
        maxAdultsPerRoom: String(Math.ceil((parseInt(sAdults, 10) || 1) / roomsN)),
        maxChildrenPerRoom: String(Math.ceil((parseInt(sChildren, 10) || 0) / roomsN)),
      });
      if (visible) { setCalLoading(true); setCalError(false); }
      fetch(`${CONTRACTS_API}/contracts/hotel-price-calendar?${qs.toString()}`)
        // A 4xx/5xx that returns an HTML error page used to land in .catch() looking exactly
        // like a network failure; check the status so a real outage is reported as one.
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((j) => {
          // Days are keyed by date, so a block that arrives after the traveller has stepped on
          // is still worth keeping — only a stale SEARCH is discarded.
          if (askedRef.current.scope !== calScope) return;
          const rows = Array.isArray(j?.calendar) ? j.calendar : [];
          setCal((prev) => {
            const keep = prev.scope === calScope;
            const byDate = keep ? { ...prev.byDate } : {};
            for (const c of rows) if (c?.date) byDate[c.date] = c;
            return { scope: calScope, byDate };
          });
        })
        .catch(() => {
          // Let a failed block be retried rather than remembered as "asked and empty".
          for (let k = 0; k < CAL_DAYS; k++) asked.days.delete(addDaysISO(blockStart, k));
          if (visible && !cancelled) setCalError(true);
        })
        .finally(() => { if (visible && !cancelled) setCalLoading(false); });
    };

    // Cover a week either side of the visible seven days, so a run of single-day steps never
    // waits on the network. Blocks are laid end to end from the first uncovered day.
    // Clamped inline rather than through the render-scoped helper: that helper is a new function
    // every render, so depending on it would re-run this effect on every single one.
    const back = addDaysISO(winStart, -CAL_DAYS);
    const first = back < today ? today : back;
    const last = addDaysISO(winStart, CAL_DAYS * 2 - 1);
    const blocks = [];
    for (let d = first; d <= last; d = addDaysISO(d, 1)) {
      if (asked.days.has(d)) continue;
      blocks.push(d);
      d = addDaysISO(d, CAL_DAYS - 1);       // this block covers the next CAL_DAYS days
    }

    // The block holding the days actually on screen goes first and owns the loading state; the
    // neighbours are only pre-warming, so they wait a beat rather than tripling the work of
    // every page view for travellers who never touch the arrows.
    const onScreen = blocks.find((b) => b <= winStart && winStart < addDaysISO(b, CAL_DAYS));
    if (onScreen) load(onScreen, true);
    const rest = blocks.filter((b) => b !== onScreen);
    const warm = rest.length ? setTimeout(() => rest.forEach((b) => load(b, false)), 500) : null;

    return () => { cancelled = true; if (warm) clearTimeout(warm); };
  }, [hotelCode, destination, winStart, nights, sAdults, sChildren, sRooms, calScope, today]);

  // Live prices only. There is deliberately NO demo fallback: this strip used to drop to a
  // hardcoded week of March 2026 fares whenever the call failed OR the hotel was genuinely
  // full, rendered identically to real data — so an outage and a sold-out hotel both looked
  // like seven bookable days, and the day the traveller clicked carried no date to price.
  // Only the days priced under the CURRENT search count; anything left from a previous one is
  // ignored rather than shown next to freshly quoted days.
  const byDate = cal.scope === calScope ? cal.byDate : {};
  const winDates = winStart ? Array.from({ length: CAL_DAYS }, (_, i) => addDaysISO(winStart, i)) : [];
  const usingLive = winDates.some((iso) => byDate[iso]);
  const priceDays = usingLive
    ? winDates.map((iso) => {
      const c = byDate[iso];
      // A day the cache hasn't costed comes back null; 0 is the page's word for "no price
      // yet", which the strip renders as "Check live price".
      return { iso, day: calDay(iso), date: calDate(iso), price: Math.round(c?.price ?? 0), currency: c?.currency || 'EUR', nights };
    })
    : [];
  // Why the strip is empty, so the copy can say something true.
  const calState = usingLive ? 'live'
    : !winStart ? 'nodates'
    : calError ? 'failed'
    : 'none';
  // Bar heights scale across the PRICED days only. Including the un-costed ones dragged the
  // floor to 0, which flattened every real price into the top of the range.
  const priced = priceDays.filter((p) => p.price > 0).map((p) => p.price);
  const pMin = priced.length ? Math.min(...priced) : 0;
  const pMax = priced.length ? Math.max(...priced) : 1;
  const priceVaries = pMin !== pMax;
  // Which day carries the "Lowest price" flag. Days routinely TIE at the cheapest figure, and
  // matching on price alone badged every one of them — three bars all shouting "lowest" tells
  // the traveller nothing. The earliest day at that price wins the flag.
  const lowIdx = priceDays.findIndex((p) => p.price > 0 && p.price === pMin);
  // The strip opens with the traveller's OWN departure date already selected, so the check
  // button is there for the date they searched instead of asking them to re-pick it. Derived
  // rather than stored: an explicit pick always wins, and because `applyFilter` clears the
  // pick, editing the search falls back to whatever the new departure date is — no effect, no
  // extra render pass, nothing to keep in sync.
  const pickedISO = selectedISO ?? notBeforeToday(baseCheckIn);
  // Position of the picked day IN THE VISIBLE WEEK, for the highlight alone. -1 once the
  // traveller has paged away from it, which correctly leaves no bar selected on screen.
  const pickedIdx = priceDays.findIndex((p) => p.iso === pickedISO);
  // The picked day itself is read from the whole cache, NOT the visible week, so paging never
  // silently drops the traveller's chosen date out of the action card and the checkout hand-off.
  const pickedEntry = pickedISO ? byDate[pickedISO] : null;
  const pd = (pickedISO && Object.keys(byDate).length)
    ? {
      iso: pickedISO, day: calDay(pickedISO), date: calDate(pickedISO),
      price: Math.round(pickedEntry?.price ?? 0), currency: pickedEntry?.currency || 'EUR',
      lowest: !!pickedEntry?.isLowest, nights,
    }
    : null;

  // The picked day was live-checked and came back with NO bookable rooms. It stays selected
  // on screen (pickDay refuses re-picks, not the original selection), so the action card must
  // say so — not quote the stale cache estimate under a green "available" tick.
  const dayUnavailable = !!(pd && checkedEmpty.has(pd.iso));
  // Whether the picked day carries a cache estimate at all. A lavender (un-cached) day has
  // price 0 — every card that would print "from €{pd.price}" must check this first, or a
  // failed live check quotes "from €0" as if it were a fare.
  const pdEstimate = Number(pd?.price) > 0;

  const filtersTouched = Object.keys(ovr).length > 0;
  // ── the one "from" figure the page quotes ────────────────────────────────────
  // Everything headline-priced (hero chip, Book card, mobile bar, share text, the checkout
  // hand-off) reads this, so those can never disagree with each other.
  //
  // It follows what the traveller actually asked for: the day they picked, else the cheapest
  // day the calendar just returned. Once ANY filter is touched it will NOT fall back to the
  // total the results card arrived with — that number priced the search they just changed, and
  // showing it beside a re-priced calendar quotes two different stays at once. When there is
  // nothing true to quote it is null and the UI says so, rather than inventing a figure (this
  // used to read a hardcoded 765 on a cold visit).
  const paxCount = Math.max(1, (Number(sAdults) || 1) + (Number(sChildren) || 0));
  const stayFrom = (() => {
    // The supplier was asked about the picked day and said no. Whatever the cache once
    // estimated for it is not a price anyone can pay — the hero chip, Book card and mobile
    // bar all read this figure, and each of them would otherwise quote €X beside the red
    // "not available" card.
    if (dayUnavailable) return null;
    if (Number(pd?.price) > 0) return Number(pd.price);
    if (usingLive && pMin > 0) return pMin;
    if (!filtersTouched && Number(hotel?.totalAmount) > 0) return Number(hotel.totalAmount);
    return null;
  })();
  // Per person — the calendar prices a whole stay for the whole party.
  const fromPP = stayFrom != null ? Math.round(stayFrom / paxCount) : null;

  // ── the meal plans that exist on the SELECTED day ────────────────────────────
  // Live availability is authoritative but it is a SUPPLIER hit, made only when the traveller
  // asks for it. The cache's own `cheapest` endpoint answers the narrower question for free:
  // asked for one hotel on one date it returns `boardFacets` — e.g. {"RO":1,"BB":1} — so the
  // picker can name this hotel's real meal plans for the day on show without calling a
  // supplier at all. (Verified per hotel: 130163 sells RO+BB where 300984 sells only RO.)
  const [dateBoards, setDateBoards] = useState(null);
  const pickedIso = pd?.iso || baseCheckIn;
  useEffect(() => {
    if (!hotelCode || !destination || !pickedIso) { setDateBoards(null); return; }
    const roomsN = Math.max(1, parseInt(sRooms, 10) || 1);
    const qs = new URLSearchParams({
      destinations: destination, hotelCodes: String(hotelCode),
      checkIn: pickedIso, checkOut: addDaysISO(pickedIso, nights),
      adults: sAdults, children: sChildren, rooms: String(roomsN),
      pageSize: '1', source: 'combined',
    });
    let cancelled = false;
    fetch(`${CONTRACTS_API}/contracts/cheapest?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setDateBoards(Object.keys(j?.boardFacets || {})); })
      .catch(() => { if (!cancelled) setDateBoards(null); });
    return () => { cancelled = true; };
  }, [hotelCode, destination, pickedIso, nights, sAdults, sChildren, sRooms]);

  // ── shareable link ──────────────────────────────────────────────────────────
  // A shared link must re-open the SAME stay, so the whole search context rides in
  // the query string (this page reads those as its fallback when there's no in-app
  // router state) — same contract as the Results card's deep link, minus the long
  // image URL, which the page re-fetches anyway. Dates follow the day the traveller
  // has actually picked in the calendar, not just the one they arrived with.
  const shareCheckIn  = pd?.iso || baseCheckIn;
  const shareCheckOut = pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut;
  const shareUrl = (() => {
    const qs = new URLSearchParams();
    const put = (k, v) => { if (v != null && String(v).trim() !== '' && String(v) !== 'undefined') qs.set(k, String(v)); };
    put('checkIn', shareCheckIn);   put('checkOut', shareCheckOut);
    put('adults', sAdults);         put('children', sChildren);
    put('rooms', sRooms);           put('childAges', sChildAges);
    put('nights', nights);          put('destination', destination);
    // the recipient sees the same trip: same transport mode, same departure airport
    put('transport', transport);    put('origin', origin);
    // display fallbacks, so the recipient never sees "Hotel 123456" while the record loads
    put('name', hotelName);         put('loc', locLabel);
    put('stars', stars || '');      put('currency', hotel?.currency || '');
    put('total', hotel?.totalAmount);
    // `siteOrigin`, NOT `origin` — that name is the departure airport in this component,
    // and shadowing it here put the airport param above into a temporal dead zone.
    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const q = qs.toString();
    return `${siteOrigin}/hotel/${hotelCode}${q ? `?${q}` : ''}`;
  })();

  // Editing the bar changed only component state, so the address bar disagreed with the screen:
  // a refresh threw the edits away and Back left the page instead of undoing them. Push the
  // edited context into the URL (replace, so one Back still leaves the hotel) — the page already
  // reads these params as its cold-start fallback, which is what makes a refresh survive.
  useEffect(() => {
    if (!filtersTouched || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const set = (k, v) => { if (v != null && String(v).trim() !== '') url.searchParams.set(k, String(v)); };
    set('checkIn', baseCheckIn);  set('checkOut', baseCheckOut);
    set('adults', sAdults);       set('children', sChildren);
    set('rooms', sRooms);         set('childAges', sChildAges);
    set('nights', nights);
    set('transport', transport);  set('origin', origin);
    // The birthdays survive a refresh with everything else, and LEAVE the URL the moment they
    // stop matching the ages being priced — a stale date is worse than none (see childDob.js).
    if (sChildDobs) url.searchParams.set('childDobs', sChildDobs);
    else url.searchParams.delete('childDobs');
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [filtersTouched, baseCheckIn, baseCheckOut, sAdults, sChildren, sRooms, sChildAges, sChildDobs, nights, transport, origin]);

  // Only a REAL "from" figure goes in the message; `stayFrom` already refuses the €0 the price
  // cache returns for an uncosted day and the total of a search that has since been edited.
  const shareFrom = fromPP;
  const shareDates = shareCheckIn
    ? `${calDate(shareCheckIn)}${shareCheckOut ? ` – ${calDate(shareCheckOut)}` : ''}`
    : '';
  const sharePax = `${Number(sAdults) || 2} adult${(Number(sAdults) || 2) > 1 ? 's' : ''}${Number(sChildren) > 0 ? `, ${sChildren} child${Number(sChildren) > 1 ? 'ren' : ''}` : ''}`;
  const shareMeta = [shareDates, dayLabel(nights), sharePax].filter(Boolean).join(' · ');
  const shareText = [
    `${hotelName} — ${locLabel}`,
    shareMeta,
    shareFrom != null ? `from ${ccy}${shareFrom} p.p.` : '',
  ].filter(Boolean).join('\n');

  // Live rates as "room type → its board options". Selection still addresses the flat
  // `liveRooms.rooms` array by index, so the booking hand-off keeps the exact rateKey.
  const allRoomGroups = useMemo(() => groupRoomsByBoard(liveRooms?.rooms), [liveRooms]);
  // "Care (Meals)" narrows the rates on show. Filtering happens AFTER grouping so each
  // surviving board keeps its original `index` — that handle is the rateKey the booking
  // hand-off needs, and re-indexing a filtered input would book the wrong rate.
  const roomGroups = useMemo(() => {
    const pref = BOARD_PREFS.find((b) => b.id === boardPref);
    if (!pref?.match) return allRoomGroups;
    return allRoomGroups
      .map((g) => ({ ...g, boards: g.boards.filter((b) => pref.match.test(`${b.boardLabel} ${b.boardCode || ''}`)) }))
      .filter((g) => g.boards.length > 0)
      .map((g) => ({ ...g, cheapest: g.boards[0] }));
  }, [allRoomGroups, boardPref]);
  const boardFilterHidAll = allRoomGroups.length > 0 && roomGroups.length === 0;

  // ── which rate the page is quoting ───────────────────────────────────────────
  // The card above the room list and the room list itself must name the SAME rate. They did
  // not: the card opened on index 0 of the flat array — the cheapest rate from any supplier,
  // before the "Care (meals)" filter — while the list below only ever showed the rates that
  // survived that filter. A traveller who had asked for Bed & Breakfast was quoted an All
  // Inclusive price and board they could not see, could not have chosen, and could not undo
  // except by clicking a room, which silently corrected the price they had already read.
  //
  // Derived rather than corrected in an effect: the fallback re-evaluates the moment the
  // filter changes, so there is no render where the two disagree and no state to keep in step.
  const visibleRateIndices = useMemo(
    () => new Set(roomGroups.flatMap((g) => g.boards.map((b) => b.index))),
    [roomGroups]
  );
  // An explicit pick wins for as long as it is still on screen; otherwise the cheapest rate
  // the traveller can actually see. `roomGroups` and each group's boards are both sorted
  // cheapest-first, so that is the first board of the first group.
  const liveIndex = (selectedRoom.live != null && visibleRateIndices.has(selectedRoom.live))
    ? selectedRoom.live
    : (roomGroups[0]?.boards?.[0]?.index ?? null);

  // live selection → live price shown in the Book Now card / mobile bar / checkout
  const liveRoom = (liveRooms?.rooms?.length && liveIndex != null) ? liveRooms.rooms[liveIndex] : null;
  // The board of THAT rate, named exactly as the room rows name it — the availability recap
  // has to move with the traveller's choice, so picking half board over the cheapest all-in
  // rate changes the price and the board type together. Derived straight from the selected
  // rate rather than from rateInfo, whose map only covers the rates a board FILTER left on
  // screen; the selection can point outside it.
  const liveBoard = liveRoom ? boardInfo(liveRoom.boardCode, liveRoom.board).label : null;

  // ── the live price against the estimate it replaced ──────────────────────────
  // The strip quotes a CACHED estimate per day; the check then asks the supplier what that day
  // really costs. Either answer is worth stating outright — a saving the traveller was not
  // told about is a saving they did not get, and an increase discovered at the checkout is
  // worse than one shown here — so the estimate stays on screen struck through and the
  // difference is named.
  //
  // The two figures are comparable, and it is worth saying why: the calendar endpoint takes no
  // departure airport, so like `liveRoom.price` it prices the STAY for the whole party and
  // neither carries a flight. Comparing the calendar figure against the room+flight total
  // would manufacture a difference the size of an airfare.
  //
  // BASIS IS EVERYTHING, and it is why this computes the move twice. The strip is priced PER
  // PERSON and the card quotes the party TOTAL; striking one against the other would invent a
  // change of exactly the party size. Each surface compares against its own basis, and each
  // subtraction is done on the ROUNDED figures actually printed, so "€286 → €305, €19 higher"
  // adds up on screen rather than to a hidden third decimal.
  const cacheWas = pdEstimate ? Number(pd.price) : null;
  const liveNow = liveRoom ? Math.round(liveRoom.price) : null;
  /** One traveller's share in whole euros — for the strip, where a bar is 9px of type wide. */
  const ppOf = (total) => (total != null ? Math.round(total / paxCount) : null);
  // The move on the CARD's basis (party total) and on the STRIP's basis (per person). Null
  // when there is nothing honest to compare: no live answer yet, or a day the cache never
  // costed, where there is no earlier price to have moved from.
  const priceMoved = (cacheWas != null && liveNow != null && liveNow !== cacheWas)
    ? liveNow - cacheWas
    : null;
  const wasPP = ppOf(cacheWas);
  const nowPP = ppOf(liveNow);
  const ppMoved = (wasPP != null && nowPP != null && nowPP !== wasPP) ? nowPP - wasPP : null;

  // ── which meal plans this hotel actually sells ───────────────────────────────
  // The picker used to offer all six unconditionally, so a hotel that only sells room-only
  // still advertised All Inclusive and the traveller found out only after running a check.
  // Nothing in the content record helps: `/hotels/bulk` has a `boards` field but the cache
  // leaves it empty for every hotel tested. The live availability response is the one
  // authoritative source, so once rates are in we list only the boards they contain, each
  // with the cheapest price on it. Before that we cannot know, and say so rather than imply
  // the list is this hotel's.
  const boardsKnown = allRoomGroups.length > 0;
  const boardOptions = useMemo(() => {
    // No live rates yet, but the cache already told us which boards this hotel sells on the
    // selected day — list exactly those (no prices; the cache only reports which exist).
    if (!boardsKnown) {
      if (!dateBoards) return BOARD_PREFS;
      const onDate = BOARD_PREFS.filter((b) => b.id && dateBoards.includes(b.id));
      if (!onDate.length) return BOARD_PREFS;
      return [
        { id: '', label: 'No preference' },
        ...onDate.map((b) => ({ id: b.id, label: b.label })),
        ...BOARD_PREFS.filter((b) => b.id && b.id === boardPref && !dateBoards.includes(b.id))
          .map((b) => ({ id: b.id, label: b.label, note: 'not on this date' })),
      ];
    }
    const rates = allRoomGroups.flatMap((g) => g.boards);
    const cheapestOn = (pref) => rates
      .filter((b) => pref.match.test(`${b.boardLabel} ${b.boardCode || ''}`))
      .reduce((lo, b) => (lo == null || b.price < lo ? b.price : lo), null);
    const offered = BOARD_PREFS.filter((b) => b.match).map((b) => ({ ...b, price: cheapestOn(b) }));
    return [
      { id: '', label: 'No preference' },
      ...offered.filter((b) => b.price != null)
        .map((b) => ({ id: b.id, label: b.label, note: `from ${ccy}${Math.round(b.price)}` })),
      // A board the traveller has chosen that these dates don't offer stays visible and
      // labelled, so the list never silently drops the option they are looking at.
      ...offered.filter((b) => b.price == null && b.id === boardPref)
        .map((b) => ({ id: b.id, label: b.label, note: 'not on these dates' })),
    ];
  }, [boardsKnown, allRoomGroups, boardPref, ccy, dateBoards]);
  const nBoards = useMemo(() => boardCount(roomGroups), [roomGroups]);

  // Per-rate facts for the cards: board wording, occupancy, per-night / per-guest splits and
  // the real cancellation position. Keyed by the rate's index in the flat `rooms` array —
  // the same handle selection and the booking hand-off already use.
  const rateInfo = useMemo(() => {
    const out = new Map();
    for (const g of roomGroups) {
      for (const b of g.boards) {
        out.set(b.index, rateDetails(b, { nights, adults: Number(sAdults) || 2, children: Number(sChildren) || 0 }));
      }
    }
    return out;
  }, [roomGroups, nights, sAdults, sChildren]);

  // The single cheapest bookable rate in the hotel — earns the "Lowest price" flag. Groups are
  // already cheapest-first, so this is the first board of the first group.
  const cheapestIndex = roomGroups[0]?.cheapest?.index ?? null;

  // Big resorts return 15+ room types; show a readable set and let the traveller open the rest.
  const [showAllRooms, setShowAllRooms] = useState(false);
  const ROOMS_COLLAPSED = 6;
  const visibleGroups = showAllRooms ? roomGroups : roomGroups.slice(0, ROOMS_COLLAPSED);
  const liveFlight = liveFlights?.flights?.length ? liveFlights.flights[selectedFlight] : null;

  // ── Flight modal: real filtering and sorting over the LIVE result set ──────────────
  // Every flight keeps `idx`, its position in `liveFlights.flights`, because that is what
  // `selectedFlight` addresses and what the booking hand-off reads for `flightKeys`.
  // Filtering and sorting reorder the view only — never the array underneath the selection.
  // Memoised so its identity is stable across renders — otherwise the `|| []` minted a fresh
  // array every render, and the `[allFlights]` effect below (clearFlightFilters) fired on
  // every render, each setState re-rendering: an infinite "maximum update depth" loop.
  const allFlights = useMemo(() => liveFlights?.flights || [], [liveFlights]);
  const cheapestFare = allFlights.length ? Math.min(...allFlights.map((f) => f.totalPrice || Infinity)) : null;
  // The fare the traveller is holding right now — every other card's price impact is measured
  // against this, and it moves as soon as they choose a different flight.
  const selectedFare = allFlights[selectedFlight]?.totalPrice ?? null;
  const facets = useMemo(() => flightFacets(allFlights), [allFlights]);
  const [fSort, setFSort] = useState('price');
  // Flight type ('all' | 'direct' | 'stops') and baggage ('any' | 'included' | 'excluded')
  // are one-of-three choices, so they are a single value each rather than three booleans that
  // could contradict one another.
  const [fType, setFType] = useState('all');
  const [fBaggage, setFBaggage] = useState('any');
  const [fAirlines, setFAirlines] = useState([]);
  // Phone only: the filter rail is a sheet over the list rather than a column beside it.
  const [filterSheet, setFilterSheet] = useState(false);
  // Departure-time sliders. `null` means untouched: the range is whatever the results span,
  // so a slider dropped back to its ends filters nothing.
  const [fOutRange, setFOutRange] = useState(null);
  const [fRetRange, setFRetRange] = useState(null);
  const [showAllAirlines, setShowAllAirlines] = useState(false);

  // A slider with no facet behind it has no bounds to drag between; `span` supplies them and
  // doubles as the untouched value.
  const outSpan = facets.outboundSpan;
  const retSpan = facets.returnSpan;
  const outRange = fOutRange || (outSpan ? [outSpan.min, outSpan.max] : FULL_DAY);
  const retRange = fRetRange || (retSpan ? [retSpan.min, retSpan.max] : FULL_DAY);
  // Only a range NARROWER than the span is a constraint — the full span keeps every flight,
  // including any whose departure time could not be read.
  const outConstrained = !!(outSpan && fOutRange && (outRange[0] > outSpan.min || outRange[1] < outSpan.max));
  const retConstrained = !!(retSpan && fRetRange && (retRange[0] > retSpan.min || retRange[1] < retSpan.max));

  const modalFlights = useMemo(() => {
    const tagged = allFlights.map((f, idx) => ({ ...f, idx }));
    return sortFlights(applyFlightFilters(tagged, {
      type: fType,
      baggage: fBaggage,
      airlines: fAirlines,
      outboundRange: outConstrained ? outRange : null,
      returnRange: retConstrained ? retRange : null,
    }), fSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFlights, fType, fBaggage, fAirlines, outRange[0], outRange[1], retRange[0], retRange[1],
    outConstrained, retConstrained, fSort]);

  const activeFilterCount = (fType !== 'all' ? 1 : 0) + (fBaggage !== 'any' ? 1 : 0)
    + (fAirlines.length ? 1 : 0) + (outConstrained ? 1 : 0) + (retConstrained ? 1 : 0);
  const clearFlightFilters = () => {
    setFType('all'); setFBaggage('any'); setFAirlines([]);
    setFOutRange(null); setFRetRange(null); setShowAllAirlines(false);
  };
  const toggleAirline = (code) =>
    setFAirlines((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  // A filter set that survives one search rarely fits the next — reset when results change.
  useEffect(() => { clearFlightFilters(); }, [allFlights]);

  // Flights and rooms are searched in parallel but must appear TOGETHER — a flight card
  // shown before its rooms have loaded reads as "flight found, no hotel", and a stay with
  // no available rooms isn't a bookable holiday at all. So both sections hold on the loading
  // skeleton until BOTH results are in. Flights are only awaited for a package search; on
  // own-transport there is no flight leg to wait for.
  const liveBusy = (transport === 'package' && !!liveFlights?.loading) || !!liveRooms?.loading;

  // Hotel + flight only. The airport transfer is priced and added at the checkout now, so
  // this page never quotes a total that includes something it does not sell.
  const liveTotal = liveRoom ? Math.round((liveRoom.price || 0) + (liveFlight?.totalPrice || 0)) : null;
  const displayTotal = liveTotal != null ? liveTotal : stayFrom;
  // live-aware overview card numbers (hotel+flight base; transfer & SGR listed separately)
  const ovPax = (Number(sAdults) || 2) + (Number(sChildren) || 0);

  // The "Compare the lowest prices" filter bar shows the REAL search context when
  // the page was reached from a search (demo values only on direct visits).
  const niceDate = (iso) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  };
  // Editing any field re-prices the stay, so every live result gathered under the OLD
  // parameters is dropped: keeping them would show a price for a search the traveller
  // has just changed. The calendar re-fetches on its own (these values are its deps).
  const applyFilter = (patch) => {
    const keys = Object.keys(patch);
    // HOW the traveller gets there (transport mode, departure airport) is not WHEN or WHO:
    // the live ROOM rates were priced for dates and occupancy that these edits don't touch,
    // so they stay on screen — clearing them forced a pointless second availability check.
    // Only the flight is re-resolved (and the transfer, when flights are toggled).
    if (keys.length && keys.every((k) => k === 'origin' || k === 'transport')) {
      setOvr((p) => ({ ...p, ...patch }));
      invalidateFlights();          // orphan any in-flight flight response
      setSelectedFlight(0);
      const nextTransport = patch.transport ?? transport;
      const nextOrigin = patch.origin ?? origin;
      if (nextTransport === 'hotel_only') {
        // Flights off: the flight leaves the price. The room stays.
        setLiveFlights(null);
        return;
      }
      const checkin = pd?.iso || baseCheckIn;
      if (!checkin || !destination) { setLiveFlights(null); return; }
      // Before any availability check the flight section isn't on screen at all, so
      // re-resolving it here would be a supplier hit nobody sees. The check itself fetches
      // under whatever transport/origin is set by then.
      if (!liveChecked) { setLiveFlights(null); return; }
      const checkout = pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut;
      fetchFlights(checkin, checkout, nextOrigin);
      return;
    }
    setOvr((p) => ({ ...p, ...patch }));
    // Every live result was priced under the OLD parameters, so it goes — a rate fetched for
    // dates the traveller has just changed must never stay on screen, let alone be bookable.
    setLiveChecked(false);
    setLiveRooms(null);
    // Same for the days found EMPTY: they were empty for that duration and party. Keeping
    // them would leave bars disabled — and the "not available" card up — against criteria
    // nobody has checked yet.
    setCheckedEmpty(new Set());
    invalidateFlights();
    setLiveFlights(null);
    // The PICKED DAY is a different matter. Changing a child's age doesn't move the stay,
    // and changing its length doesn't move the departure day — the day is still in the
    // strip, so clearing it made the traveller re-pick for nothing. Only a change of
    // check-in (or of who is travelling, which re-prices every day) drops it.
    // `childDobs` rides with `childAges` here: it prices nothing on this page, so a date
    // arriving alongside an age the traveller just saved must not drop the picked day.
    const keepsTheDay = keys.every((k) => k === 'childAges' || k === 'childDobs' || k === 'nights');
    if (!keepsTheDay) setSelectedISO(null);
  };
  const resetFilters = () => { setOvr({}); setSelectedISO(null); setWin({ base: null, start: null }); setLiveChecked(false); setLiveRooms(null); invalidateFlights(); setLiveFlights(null); setCheckedEmpty(new Set()); };

  const ovBase = liveTotal != null ? Math.round((liveRoom.price || 0) + (liveFlight?.totalPrice || 0)) : null;

  // ── shared flight fetch (used on mount + day-click + airport/transport switches) ──
  //
  // Race guard: `flightSeqRef` is a monotonic id. Every fetch takes the next id and only
  // the CURRENT id may write results — a slow response from an airport or a date the
  // traveller has since moved away from is dropped, never painted. Anything that clears
  // `liveFlights` without starting a new fetch must bump the id too (invalidateFlights),
  // or the orphaned response would land on the cleared screen.
  //
  // Cache: raw supplier responses keyed by route+dates+pax, TTL 5 min. This is what makes
  // the fallback probe free to apply — clicking "fly from AMS instead" replays the probe's
  // cached response through the same transform instead of paying a second supplier call.
  const flightSeqRef = useRef(0);
  const flightCacheRef = useRef(new Map());
  const invalidateFlights = () => { flightSeqRef.current += 1; };
  const flightSearchKey = (from, checkin, checkout) =>
    `${from}|${checkin}|${checkout}|${Number(sAdults) || 2}|${Number(sChildren) || 0}`;
  const readFlightCache = (key) => {
    const hit = flightCacheRef.current.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > FLIGHT_CACHE_TTL_MS) { flightCacheRef.current.delete(key); return null; }
    return hit.data;
  };
  const searchFlightsRaw = (from, checkin, checkout) => {
    const key = flightSearchKey(from, checkin, checkout);
    const cached = readFlightCache(key);
    if (cached) return Promise.resolve(cached);
    return axiosInstance.post('/flight-availability/search', {
      from, to: destination, depdate: checkin, retdate: checkout,
      adults: Number(sAdults) || 2, children: Number(sChildren) || 0, infants: 0,
    }, { timeout: SUPPLIER_TIMEOUT }).then(({ data }) => {
      flightCacheRef.current.set(key, { data, at: Date.now() });
      return data;
    });
  };

  const fetchFlights = (checkin, checkout, fromOverride = null) => {
    if (!destination) { invalidateFlights(); setLiveFlights(null); return; }
    // `fromOverride` exists because `origin` is read from this render's closure — the
    // airport-switch handlers fetch for the airport just picked, not the one on screen.
    const from = normaliseOrigin(fromOverride || origin);
    const seq = ++flightSeqRef.current;
    setLiveFlights({ loading: true });
    searchFlightsRaw(from, checkin, checkout).then((data) => {
      if (seq !== flightSeqRef.current) return;
      console.log('[Detail] flight-availability response', data?.results);
      const flights = transformFlights(data, from);
      setSelectedFlight(0);
      if (!flights.length) {
        // The chosen airport doesn't fly this route on these dates. Say so, and go find
        // the airports that do — with prices — rather than leaving a dead end.
        setLiveFlights({ flights: [], empty: true, from, checkin, checkout, probing: true, alternatives: null, unprobed: [] });
        probeAlternatives(from, checkin, checkout, seq);
        return;
      }
      // Found flights — and the traveller still deserves to know what the airport an hour up
      // the motorway would have cost. The same bounded probe runs (3-4 popular airports,
      // cached 5 min, seq-guarded), and its results are shown as a DIFFERENCE against this
      // fare rather than as a bare price: "+€35 p.p." is a decision, "€287 p.p." is homework.
      setLiveFlights({
        flights, cheapest: data?.results?.cheapest || null, from,
        checkin, checkout, probing: true, alternatives: null,
      });
      probeAlternatives(from, checkin, checkout, seq);
    }).catch((e) => {
      // NO alternative probe on error: a supplier that's down is down for every airport,
      // and multiplying a failing call by four would only hammer it. Retry is offered.
      if (seq === flightSeqRef.current) {
        setLiveFlights({ error: friendlyError(e, 'flight') });
      }
    });
  };


  // ── the smart fallback: price the popular alternatives in parallel ──
  // Bounded (3-4 calls), allSettled so one dead airport can't sink the rest, seq-guarded so
  // a probe for abandoned dates can never paint, and cached so applying a result is free.
  const probeAlternatives = (from, checkin, checkout, seq) => {
    const candidates = DEPARTURE_AIRPORTS.filter((a) => a.popular && a.code !== from).map((a) => a.code);
    const pax = (Number(sAdults) || 2) + (Number(sChildren) || 0);
    Promise.allSettled(
      candidates.map((code) => searchFlightsRaw(code, checkin, checkout).then((data) => ({ code, data })))
    ).then((settled) => {
      if (seq !== flightSeqRef.current) return;
      const alternatives = [];
      const ruledOut = new Set([from]);
      settled.forEach((s, i) => {
        if (s.status !== 'fulfilled') return; // network-failed probe: unknown, stays offerable
        const { code, data } = s.value;
        const flights = transformFlights(data, code);
        if (!flights.length) { ruledOut.add(candidates[i]); return; } // probed empty: don't re-offer
        const best = flights[0];
        alternatives.push({
          code,
          total: best.totalPrice,
          perPax: Math.max(1, Math.round(best.totalPrice / Math.max(1, pax))),
          currency: best.currency,
          options: flights.length,
        });
      });
      alternatives.sort((a, b) => a.total - b.total);
      alternatives.forEach((a) => ruledOut.add(a.code));
      // Airports we did NOT probe (the long tail) stay available as plain chips — a manual
      // pick runs a real search. Ones that priced or came back empty never repeat there.
      const unprobed = AIRPORT_CODES.filter((c) => !ruledOut.has(c));
      // Lands on the result set it was started for, whether that set was empty or full — the
      // `from` and seq checks are what stop a probe for abandoned dates from painting.
      setLiveFlights((prev) => (
        prev && prev.from === from && seq === flightSeqRef.current
          ? { ...prev, probing: false, alternatives, unprobed }
          : prev
      ));
    });
  };

  // One click on a priced alternative: adopt that airport and show its flights. The raw
  // response is already in the cache from the probe, so this paints without a supplier call.
  const applyAlternative = (code) => {
    const checkin = liveFlights?.checkin || pd?.iso || baseCheckIn;
    const checkout = liveFlights?.checkout || (pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut);
    setOvr((p) => ({ ...p, origin: code }));
    fetchFlights(checkin, checkout, code);
  };

  const pickDay = (iso) => {
    if (!iso || checkedEmpty.has(iso)) return;
    setSelectedISO(iso);
    // Re-centre on the chosen day, so the three days either side are on screen to compare
    // against — which is the whole reason for picking a date here rather than in the date
    // field. Clamped like every other window move: a day in the first half-week sits as near
    // the middle as today allows rather than dragging the strip into the past.
    setWin({ base: baseCheckIn, start: notBeforeToday(addDaysISO(iso, -CAL_CENTRE)) });
    setLiveChecked(false);
    setLiveRooms(null);
    invalidateFlights();
    setLiveFlights(null);
    // Un-cached (lavender) days used to skip the button and hit the supplier on the click
    // itself. Client call: EVERY day is picked first and priced on demand — one flow, one
    // button — so selecting a lavender bar shows the same "Check price & availability" card
    // as a priced one ("price on request" instead of an estimate), and no live search fires
    // until the traveller asks for it.
  };

  const checkAvailabilityForDay = (dayISO) => {
    const checkin = dayISO || pickedISO || baseCheckIn;
    if (!checkin) return;
    setLiveChecked(true);
    const checkout = addDaysISO(checkin, nights);
    console.log('[Detail] check availability →', { hotelCode, destination, checkin, checkout });
    if (!hotelCode || !checkin) { setLiveRooms(null); setLiveFlights(null); return; }

    // Live hotel rooms
    setLiveRooms({ loading: true });
    axiosInstance.post('/hotel-availability/search', {
      hotelCode: String(hotelCode), checkin, checkout,
      adults: Number(sAdults) || 2, children: Number(sChildren) || 0,
      // HB requires an age per child; rooms lets groups get multi-room rates
      childAges: sChildAges ? sChildAges.split(',').map(Number) : [],
      rooms: Number(sRooms) || 1,
    }, { timeout: SUPPLIER_TIMEOUT }).then(({ data }) => {
      console.log('[Detail] hotel-availability response', data?.results);
      const hb = data?.results?.hotelbeds, dn = data?.results?.diana, wm = data?.results?.w2m;
      const dianaHotelId = dn?.dianaHotelId ?? dn?.hotelId ?? null;
      const w2mHotelCode = wm?.w2mHotelCode ?? null;
      const rooms = [
        ...((hb?.rooms) || []).map((r) => ({ ...r, supplier: 'hotelbeds' })),
        ...((dn?.rooms) || []).map((r) => ({ ...r, supplier: 'diana', dianaHotelId })),
        ...((wm?.rooms) || []).map((r) => ({ ...r, supplier: 'w2m', w2mHotelCode })),
      ].map((r) => ({
        // Supplier text is HTML-encoded at source, so "DOUBLE ROOM &amp; TERRACE" arrives with
        // the entity intact and React — correctly — prints it literally. Decode on the way in,
        // so every consumer downstream (card, grouping, checkout hand-off) gets real characters.
        name: decodeEntities(r.roomName) || 'Room',
        board: decodeEntities(r.boardName) || r.boardCode || '',
        price: r.sellingRate ?? r.net ?? r.price ?? null, currency: r.currency || 'EUR', supplier: r.supplier,
        // Prefer the supplier's explicit refundable flag (W2M sets it); else derive from policies.
        refundable: r.refundable !== undefined ? r.refundable
          : (Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies.length === 0 : undefined),
        cancellation: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies : [],
        rateKey: r.rateKey || null, roomCode: r.roomCode || null, boardCode: r.boardCode || null,
        net: r.net ?? null, dianaHotelId: r.dianaHotelId || null,
        // World2Meet bookable identity — carried into the checkout hand-off.
        bookingCode: r.bookingCode || null, w2mHotelCode: r.w2mHotelCode || null,
      })).filter((r) => r.price != null).sort((a, b) => a.price - b.price);
      // No pick yet for this day's results. Null rather than 0: index 0 is the cheapest rate
      // from ANY supplier before the meal filter runs, which is exactly the rate the card used
      // to quote while the list below showed something else. `liveIndex` resolves the default
      // from what is actually on screen.
      setSelectedRoom((p) => ({ ...p, live: null }));
      const cheapest = data?.results?.cheapest || null;
      setLiveRooms({ rooms, cheapest });
      if (rooms.length === 0 && (!cheapest || !Number(cheapest.price))) {
        setCheckedEmpty((prev) => new Set(prev).add(checkin));
      }
      if (data?.review) setReview((prev) => prev ?? data.review);
    }).catch((e) => setLiveRooms({ error: friendlyError(e, 'room') }));

    // Live flights for the newly picked dates — but only for a traveller who asked to fly.
    // Own transport prices the room alone. (The airport transfer is sold at the checkout,
    // where the flight is already fixed, so no transfer call is made from this page.)
    if (transport === 'package') fetchFlights(checkin, checkout);
  };
  const checkAvailability = () => checkAvailabilityForDay(pickedISO);

  // goReviews removed — Reviews tab commented out for now

  // hand the full selection over to the checkout screen
  const goCheckout = () => {
    const useLive = liveTotal != null;
    // Never hand off while flight/transfer availability is still loading — the
    // package contents (and the total) aren't final yet. The Book button is also
    // disabled in this state; this is the belt-and-braces guard.
    if (liveFlights?.loading) return;
    // A booking needs a rate the supplier actually quoted. This used to be papered over by
    // the demo room/flight/meal, which gave the checkout something to show; with those gone
    // an unchecked booking would hand over a €0 stay, so send the traveller to the check
    // instead of to payment.
    if (!useLive) {
      showToast('Check availability first so we can price your stay.', 'info');
      setActiveTab('Prices');
      document.querySelector('.fc-strip, .fc-blank')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Seed the checkout traveller forms with the FULL searched party (adults +
    // children) — the server re-prices flight/transfer from the travellers'
    // actual dates of birth, so the form count must match the searched occupancy.
    const pax = (Number(sAdults) || 2) + (Number(sChildren) || 0);
    const checkin = pd?.iso || baseCheckIn;
    const checkout = pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut;
    // ppPrice covers hotel+flight only — the transfer is priced PER VEHICLE and is
    // added by the checkout as its own line (never multiplied by travellers).
    // EXACT sum (no rounding) — this is what the backend will charge.
    // Without a live rate the stay total is whatever the page is quoting — the picked day or
    // the cheapest day in the calendar (`stayFrom`), NOT the total the results card arrived
    // with, which may price a search the traveller has since edited.
    const total = useLive
      ? (liveRoom.price || 0) + (liveFlight?.totalPrice || 0)
      : (stayFrom != null ? stayFrom : 0);
    // EXACT per-person value — checkout multiplies back by pax, so any rounding
    // here would make the displayed total drift ±€1/pax from the amount charged.
    const perPerson = Math.max(0.01, total / pax);

    // Only a room that was really returned by availability. Naming a demo room ("Double Room
    // Design Room") on the payment summary described a room that had never been priced.
    const roomName = useLive ? liveRoom.name : '';
    const board = useLive ? (liveRoom.board || hotel?.board || 'All inclusive') : (hotel?.board || 'All inclusive');

    const outLg = liveFlight?.outLegs || [];
    const retLg = liveFlight?.retLegs || [];
    const allLegs = [...outLg, ...retLg];
    // In LIVE mode the checkout must only ever show a flight that will really be
    // booked — if no live flight is available/selected, flight is null (the old
    // code fell back to a DEMO flight while api.flight was null: the customer saw
    // an ARKEFLY itinerary that was never part of the booking).
    // Flatten a pair of leg arrays into the summary shape the checkout/voucher read.
    const flatFlight = (oL, rL, oDate, rDate) => ({
      outDep: fmtTime(oL[0]?.departure), outArr: fmtTime(oL[oL.length - 1]?.arrival),
      outFrom: oL[0]?.from || origin, outTo: oL[oL.length - 1]?.to || destination,
      outDate: oDate, outAirline: airlineName(oL[0]?.airline),
      // The raw marketing code travels alongside the display name, because a logo can only be
      // looked up by code and the name has already been resolved to something unsearchable by
      // the time the checkout reads it.
      outAirlineCode: oL[0]?.airline || null,
      outDur: fmtDur(oL.reduce((s, l) => s + (Number(l.duration) || 0), 0)),
      ...(rL.length ? {
        retDep: fmtTime(rL[0]?.departure), retArr: fmtTime(rL[rL.length - 1]?.arrival),
        retFrom: rL[0]?.from, retTo: rL[rL.length - 1]?.to,
        retDate: rDate, retAirline: airlineName(rL[0]?.airline),
        retAirlineCode: rL[0]?.airline || null,
        retDur: fmtDur(rL.reduce((s, l) => s + (Number(l.duration) || 0), 0)),
      } : {}),
    });
    // Only ever a flight that was really searched and selected. The non-live branch used to
    // hand the DEMO itinerary to checkout, so a customer who never ran an availability check
    // reached the payment summary looking at a 07:00 TUI fly departure that did not exist.
    const dispFlight = (liveFlight && allLegs.length)
      ? flatFlight(outLg, retLg, pd?.date, calDate(checkout))
      : null;

    const outLabel = dispFlight?.outDate?.replace('.', '') || '';
    const retLabel = dispFlight?.retDate?.replace('.', '') || '';
    const dateLabel = useLive
      ? `${pd?.date} — ${calDate(checkout)}`
      : (retLabel ? `${outLabel} — ${retLabel}` : outLabel);

    navigate('/checkout', {
      state: {
        booking: {
          hotelCode, hotelName, stars: Math.min(stars, 5), loc: locLabel,
          img: heroImage, board,
          nights, adults: pax, currency: ccy,
          // `perPerson` both times: checkout multiplies this back by pax, so handing it a
          // whole-party stay total (as `pd.price` is) billed every traveller for the group.
          // No `origPrice`: the only source of a struck-through "was" price was the demo
          // week's invented `orig` field, so it advertised a discount that never existed.
          ppPrice: perPerson, origPrice: null,
          dateLabel,
          flight: dispFlight,
          room: roomName,
          roomExtra: 0,
          // The board the supplier actually quoted, never a demo meal plan at a made-up price.
          meal: useLive ? (liveRoom.board || 'Room only') : '',
          mealPrice: 0,
          // No transfer travels from this page any more — it is chosen in the checkout's
          // extras step, which fetches it against the flight arrival being booked.
          transfer: null,
          // ── the search behind this quote ──
          // Everything the checkout needs to ASK THE SUPPLIER AGAIN: a traveller who corrects
          // a child's date of birth there changes the age the stay and the fare were priced
          // on, and the only honest answer is a fresh availability call with the corrected
          // party. Without these the checkout would have to guess the destination, the
          // occupancy split and which rate to re-match, or send the old price on regardless.
          search: {
            destination, origin, transport,
            checkin, checkout, nights,
            adults: Number(sAdults) || 2,
            children: Number(sChildren) || 0,
            rooms: Number(sRooms) || 1,
            childAges: sChildAges,
            // Empty unless the dates still agree with the ages that were priced (childDob.js).
            childDobs: sChildDobs,
            // Which rate to look for again after a re-price — the rateKey is regenerated by
            // every availability call, so the room/board pair is the stable identity.
            roomCode: useLive ? (liveRoom.roomCode || null) : null,
            boardCode: useLive ? (liveRoom.boardCode || null) : null,
          },
          // ── payload for the backend Online-booking create call ──
          api: {
            hotel: {
              hotelCode: String(hotelCode), hotelName, checkin, checkout, nights,
              // Refundability travels with the rate so the payment step can put the
              // non-refundable warning in front of the traveller before they pay, instead
              // of it surfacing for the first time in the cancellation policy.
              refundable: useLive ? (liveRoom.refundable ?? null) : null,
              cancellation: useLive ? (liveRoom.cancellation || []) : [],
              room: roomName, supplier: useLive ? (liveRoom.supplier || 'hotelbeds') : 'hotelbeds',
              // identifiers the supplier reservation needs (from the live availability response)
              rateKey: useLive ? (liveRoom.rateKey || null) : null,
              roomCode: useLive ? (liveRoom.roomCode || null) : null,
              boardCode: useLive ? (liveRoom.boardCode || null) : null,
              dianaHotelId: useLive ? (liveRoom.dianaHotelId || null) : null,
              // World2Meet bookable identity (opaque BookingCode + its HotelCode).
              bookingCode: useLive ? (liveRoom.bookingCode || null) : null,
              w2mHotelCode: useLive ? (liveRoom.w2mHotelCode || null) : null,
              price: useLive ? liveRoom.price : total, currency: ccy,
            },
            flight: (useLive && liveFlight)
              ? {
                  // The airport the fare was REALLY searched from — this was hardcoded to
                  // Brussels, so a booking flown from Eindhoven was recorded as ex-BRU.
                  from: origin, to: destination, depdate: checkin, retdate: checkout,
                  price: liveFlight.totalPrice, currency: ccy, legs: allLegs,
                  fareBreakdown: liveFlight.fareBreakdown || [],
                  // Opaque Airtuerk bookable keys — REQUIRED for live re-pricing
                  // and the basket/create reservation.
                  flightKeys: liveFlight.flightKeys || [],
                  // What this FARE actually includes, from the supplier. The extras step needs
                  // it to say "Included · 20 kg" against the right travellers instead of
                  // offering to sell a bag the ticket already carries. For a return trip
                  // Airtuerk's two options are merged by MIN, so it is the allowance that
                  // survives both legs.
                  baggage: liveFlight.baggage || null,
                  tripType: retLg.length ? 'roundtrip' : 'oneway', supplier: 'airtuerk',
                }
              : null,
            // The airport transfer is added by the checkout's extras step (it fetches
            // availability against the arrival below and builds this same shape), so nothing
            // is sent from here. The flight identity it needs for the supplier's
            // transferDetails travels on `flight.legs` above.
            transfer: null,
          },
        },
      },
    });
  };

  return (
    <div className="sd" ref={pageRef}>
      {/* Hero — blends into the transparent app navbar; mosaic lives inside it */}
      <header className="sd-hero">
        <div className="sd-hero-bg">
          <span className="sd-hero-glow2" />
          <span className="sd-hero-grid" />
        </div>
        <div className="sd-hero-inner">
          <div className="sd-hero-top">
            <div className="bc">
              {/* The current page was hardcoded to #fff — a leftover from when this hero was dark
                  navy. On the light sky that is ~1.3:1, so the hotel's own name was the one
                  unreadable thing in the breadcrumb. Colour now comes from the stylesheet, which
                  is the only place that knows what the background currently is. */}
              <Link to="/">Home</Link><span className="bc-sep">›</span>
              <a onClick={() => navigate(-1)}>Results</a><span className="bc-sep">›</span>
              <span className="bc-now">{hotelName}</span>
            </div>
            <div className="hha">
              <ShareSheet
                url={shareUrl}
                title={hotelName}
                text={shareText}
                subject={`${hotelName} — ${locLabel}`}
                meta={shareMeta}
                image={heroImage}
                buttonClassName="hhb"
                buttonIcon={ICON.share}
                onCopy={() => showToast('Link copied — ready to paste', 'success')}
                onError={() => showToast('Couldn’t copy the link. Select it and copy manually.', 'error')}
              />
              <button className={`hhb${saved ? ' saved' : ''}`} onClick={handleSave}>
                {ICON.heart} {saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>

          <div className="sd-hero-main">
            <div className="sd-hero-left">
              <div className="sd-hero-eyebrow">{ICON.shield} Verified stay{ratingLabel(dispRating) ? ` · ${ratingLabel(dispRating)}` : ''}</div>
              <h1 className="hhn">{hotelName}</h1>
              <div className="hhm">
                <span className="hhs"><RatingMarks rating={dispRating} keySize={16} /></span>
                <span className="hhl">
                  {ICON.pin}
                  {zoneLabel && <><span className="hhl-zone">{zoneLabel}</span><span className="hhl-dot">·</span></>}
                  {locLabel}
                </span>
                {/* TripAdvisor rating, /10. From the harvested store (info.review) — no live
                    call — with the live one as a fallback for a not-yet-harvested hotel.
                    Renders nothing at all for an unrated hotel. */}
                <GuestRating review={info?.review ?? review} />
              </div>
              <span className="sd-hero-rule" />
              <div className="sd-hero-chips">
                <span className="sd-chip">{ICON.board} {hotel?.board || 'All inclusive'}</span>
                <span className="sd-chip">{ICON.moon} {dayLabel(nights)}</span>
                <span className="sd-chip">{ICON.users} {Number(sAdults) || 2} adult{(Number(sAdults) || 2) > 1 ? 's' : ''}{Number(sChildren) > 0 ? `, ${sChildren} child${Number(sChildren) > 1 ? 'ren' : ''}` : ''}</span>
                {fromPP != null && <span className="sd-chip sd-chip-price">{ICON.tag} from {ccy}{fromPP} p.p.</span>}
              </div>
              <div className="sd-hero-trust">
                <span className="sd-hc-item">{ICON.check} Secure online payment</span>
                <span className="sd-hc-item">{ICON.check} No booking fees</span>
                <span className="sd-hc-item">{ICON.check} Best price guarantee</span>
                <span className="sd-hc-item">{ICON.check} Instant confirmation</span>
              </div>
            </div>

            <div className={`sd-hero-photos${soloPhoto ? ' sd-hero-photos-solo' : ''}`}>
              {photosLoading ? (
                /* the record is still in flight — hold the mosaic's shape */
                <>
                  <div className="gi gi-hero gi-skel" />
                  {[0, 1, 2, 3].map((i) => <div className="gi gi-skel" key={i} />)}
                </>
              ) : !hasPhotos ? (
                /* no photo anywhere for this hotel: illustrated panel, never stock photography */
                <div className="gi gi-hero gi-empty">
                  <HotelPhotoFallback name={hotelName} location={zoneLabel ? `${zoneLabel} · ${locLabel}` : locLabel} seed={hotelCode} />
                </div>
              ) : (
                <>
                  <div className="gi gi-hero" onClick={() => openLightbox(images, 0)}>
                    <HeroPhoto src={images[0]} seed={hotelCode} onFail={markDead} size="bigger" alt={hotelName} fetchPriority="high" />
                    <span className="gi-zoom"><S size={18} sw={2}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></S></span>
                  </div>
                  {images.slice(1, 5).map((src, i) => (
                    <div className="gi" key={i} onClick={() => (i === 3 && photoCats && photoCount > 5 ? openExplorer('ALL') : openLightbox(images, i + 1))}>
                      {/* eager, not lazy: these four sit inside the hero, so lazy only delayed
                          the moment a dead source could report itself and collapse the mosaic */}
                      <HeroPhoto src={src} seed={`${hotelCode}-${i}`} onFail={markDead} size="bigger" alt={`${hotelName} ${i + 2}`} />
                      {i === 3 && photoCount > 5 && <span className="gi-more">+{photoCount - 5}</span>}
                      <span className="gi-zoom"><S size={18} sw={2}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></S></span>
                    </div>
                  ))}
                </>
              )}
              {hasPhotos && (
                <button className="ga" onClick={() => (photoCats ? openExplorer('ALL') : openLightbox(images, 0))}>
                  {ICON.gallery} View {photoCount === 1 ? 'photo' : `all ${photoCount} photos`}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="pg">
        <div className="grid">
          <div>
            {/* Tabs */}
            <div className="tw">
              <div className="tabs">
                {TABS.map((t) => (
                  <button key={t} className={`tb${activeTab === t ? ' act' : ''}`} onClick={() => setActiveTab(t)}>
                    {TAB_ICON[t]} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ── PRICES ── */}
            <div className={`tp${activeTab === 'Prices' ? ' act' : ''}`}>
              <div className="section-title"><span className="st-step">1</span> Compare the lowest prices</div>

              <StayBar
                checkIn={baseCheckIn} formatDate={niceDate}
                adults={Number(sAdults) || 1} children={Number(sChildren) || 0} childAges={sChildAges}
                childDobs={sChildDobs}
                rooms={Number(sRooms) || 1}
                board={boardPref} boardOptions={boardOptions}
                boardHint={boardsKnown
                  ? 'Meal plans this hotel offers on the dates you checked.'
                  : dateBoards?.length
                    ? `Meal plans this hotel sells on ${pd?.day || ''} ${pd?.date || niceDate(pickedIso) || ''}`.trim() + '.'
                    : 'Check a date to see which meal plans this hotel actually offers.'}
                origin={origin} originOptions={AIRPORT_CODES} originLabel={airportName} destination={destination}
                transport={transport}
                nights={nights}
                touched={filtersTouched}
                onChange={applyFilter}
                onBoardChange={(id) => setOvr((p) => ({ ...p, board: id }))}
                onChildAges={(csv) => applyFilter({ childAges: csv })}
                onChildDobs={(csv) => applyFilter({ childDobs: csv })}
                onReset={resetFilters}
              />

              {/* What the strip's colours and heights MEAN. The chart encodes four things at
                  once — bar height is the price, the gold tag is the week's cheapest, pale
                  blue is the day you're on, grey is sold out — and none of that is legible
                  without being told. Shown only alongside real bars: over a skeleton or a
                  "choose your dates" panel it would explain colours that aren't on screen. */}
              {usingLive && (
                <div className="fc-legend">
                  <span className="fc-legend-title">Reading this chart</span>
                  <span className="fc-legend-items">
                    {/* The hatched state, not "taller bar = pricier day": bar height is
                        self-evident from the chart, whereas a hatched bar is the one mark on the
                        strip whose meaning cannot be guessed. It is also the state a traveller is
                        most likely to misread as "unavailable", so it is the one worth the row. */}
                    <span className="fc-legend-item">
                      <span className="fc-legend-swatch fc-legend-nopr" aria-hidden="true" />
                      Price not cached — check it
                    </span>
                    <span className="fc-legend-item">
                      <span className="fc-legend-swatch fc-legend-low" aria-hidden="true" />
                      Cheapest of the week
                    </span>
                    <span className="fc-legend-item">
                      <span className="fc-legend-swatch fc-legend-sel" aria-hidden="true" />
                      Your selected day
                    </span>
                    <span className="fc-legend-item">
                      <span className="fc-legend-swatch fc-legend-out" aria-hidden="true" />
                      Not available
                    </span>
                  </span>
                </div>
              )}

              {/* Says the quiet part out loud: these bars are cached estimates, and the live
                  price is the one that gets booked. Worded as a fact about the prices rather
                  than an apology about our cache — a traveller does not care that we are
                  warming an index, they care whether the number they are looking at is the
                  number they will pay, and what to do about it. */}
              {usingLive && (
                <div className="fc-estimate" role="note">
                  <span className="fc-estimate-ico" aria-hidden="true">{ICON.info}</span>
                  <span className="fc-estimate-text">
                    <b>Prices from, per person.</b> The prices on the chart are estimates and may
                    change. Pick a date and check it: the live price that comes back is the one
                    your holiday is booked at.
                  </span>
                </div>
              )}

              {/* The arrows live OUTSIDE the three states below so they stay reachable on a week
                  that came back empty — otherwise a blank week is a dead end with no way back. */}
              <div className="fc-week">
                {winStart && (
                  <button type="button" className="fc-arrow" onClick={() => pageDay(-1)}
                    disabled={!canPageBack}
                    title={canPageBack ? 'One day earlier' : 'These are the earliest dates you can still book'}
                    aria-label="Show one day earlier">
                    <S sw={2.5}><path d="M15 18l-6-6 6-6" /></S>
                  </button>
                )}
                <div className="fc-weekmain">
              {calLoading && !usingLive ? (
                <div className="fc-strip">
                  {[62, 78, 50, 88, 58, 72, 46].map((h, i) => (
                    <div key={i} className="fc-col fc-skel">
                      <div className="fc-barzone"><div className="fc-bar" style={{ height: `${h}%` }} /></div>
                      <div className="fc-under"><span className="fc-line" /><span className="fc-line sm" /></div>
                      <span className="fc-tail" aria-hidden="true" />
                    </div>
                  ))}
                </div>
              ) : !usingLive ? (
                /* No invented week here. Each case gets the answer that is actually true,
                   and a way forward: pick dates, retry the service, or widen the search. */
                <div className="fc-blank">
                  <span className="fc-blank-ico">{calState === 'failed' ? ICON.warn : ICON.cal}</span>
                  {calState === 'nodates' ? (
                    <>
                      <p className="fc-blank-title">Choose your dates to see live prices</p>
                      <p className="fc-blank-sub">Set a departure date and party size above and we’ll price this hotel for real.</p>
                    </>
                  ) : calState === 'failed' ? (
                    <>
                      <p className="fc-blank-title">We couldn’t load live prices</p>
                      <p className="fc-blank-sub">The price service didn’t answer. Your dates are still saved.</p>
                      <button type="button" className="fc-blank-btn" onClick={() => setCalReload((n) => n + 1)}>Try again</button>
                    </>
                  ) : (
                    <>
                      <p className="fc-blank-title">No availability for these dates</p>
                      <p className="fc-blank-sub">This hotel has nothing on offer for {niceDate(baseCheckIn) || 'your dates'}. Try another date or a different length of stay.</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* A flat week gets a shorter canvas. When every day costs the same the bar
                      heights carry no information, so the 212px the strip reserves for a price
                      profile is 70px of dead air between the estimate notice and the bars — the
                      chart looked like it had failed to draw. Nothing is lost: there is no
                      profile to show and no "Lowest price" tag to leave room for. */}
                  <div className={`fc-strip${priceVaries ? '' : ' fc-flat'}`}>
                    {priceDays.map((p, i) => {
                      const hasPrice = Number(p.price) > 0;
                      const isEmpty = checkedEmpty.has(p.iso);
                      // Is THIS the day the traveller has picked. Referenced by isLoading, the
                      // `sel` class and aria-pressed below; losing it throws a ReferenceError on
                      // every render and blanks the whole page, so it must stay above isLoading.
                      const sel = pickedIdx === i;
                      const isLoading = sel && liveChecked && liveRooms?.loading;
                      // Live came back with rooms for THIS day — the only point in the flow where
                      // availability is a fact rather than a cached guess, so it gets its own
                      // colour. Every clause matters: still loading, an error, or zero rooms are
                      // all "not confirmed", and painting any of them green would promise a room
                      // we have not actually been offered.
                      const isLiveOk = sel && liveChecked && !liveRooms?.loading
                        && !liveRooms?.error && (liveRooms?.rooms?.length > 0);
                      const frac = hasPrice && priceVaries ? (p.price - pMin) / (pMax - pMin) : 0.55;
                      // A flat week fills its (shorter) canvas: with no profile to draw, a bar
                      // stopping two-thirds up is just a gap, not a reading.
                      const h = priceVaries ? Math.round(44 + 44 * frac) : 100;
                      // Cheapest of the week ON SCREEN, and only the first day at that price.
                      // The API flags the lowest of whichever week it answered, which would
                      // badge several days at once now that the strip stitches weeks together.
                      const isLow = priceVaries && i === lowIdx;
                      // EVERY figure on this strip is per person. The calendar prices a whole
                      // stay for the whole party, so a family of four read a bar four times
                      // the number they would compare against anywhere else they shop.
                      // Dividing by a constant leaves the profile untouched: `h` above is still
                      // computed from the party totals, so the bars keep exactly the heights
                      // they had and the cheapest day is still the shortest.
                      const pp = hasPrice ? ppOf(p.price) : 0;
                      // The live answer, shown on the day it was checked and on this strip's
                      // own per-person basis — never the party total, which would look like a
                      // sudden jump the size of the party rather than a price change.
                      const liveHere = isLiveOk && nowPP != null;
                      return (
                        // Keyed by POSITION, not by date. Reusing the same node for slot i is what
                        // makes a one-day step read as motion: each bar animates to its
                        // neighbour's height through the transition .fc-bar already carries, so
                        // the whole price profile glides sideways. Keying by date would unmount
                        // all seven and snap.
                        <button type="button" key={i}
                          className={`fc-col${sel ? ' sel' : ''}${isLiveOk ? ' fc-ok' : ''}${isEmpty ? ' fc-empty' : !hasPrice ? ' fc-nopr' : ''}`}
                          onClick={() => pickDay(p.iso)}
                          disabled={isEmpty}
                          aria-pressed={sel}
                          aria-label={isEmpty ? `${p.day} ${p.date}, not available`
                            : liveHere ? `${p.day} ${p.date}, live price ${ccy}${nowPP} per person${ppMoved != null ? `, ${ccy}${Math.abs(ppMoved)} ${ppMoved < 0 ? 'lower' : 'higher'} than the earlier price of ${ccy}${wasPP}` : ''}, ${dayLabel(p.nights)}`
                            : hasPrice ? `${p.day} ${p.date}, from ${ccy}${pp} per person, ${dayLabel(p.nights)}`
                            : `${p.day} ${p.date}, check live price`}>
                          <span className="fc-barzone">
                            {/* Only one flag fits above a bar. Once a day has been checked, how
                                its price MOVED is newer and more useful than whether it was the
                                cheapest guess of the week, so the move takes the slot. */}
                            {liveHere && ppMoved != null ? (
                              <span className={`fc-movetag${ppMoved < 0 ? ' down' : ' up'}`}>
                                {ppMoved < 0 ? ICON.arrowDown : ICON.arrowUp}
                                {ccy}{Math.abs(ppMoved)}
                                {/* Dropped on a phone, where a column is 78px wide and the
                                    whole pill will not fit inside one. The arrow already
                                    carries the direction; the card below spells it out in
                                    words at any width. */}
                                <span className="fc-movetag-w"> {ppMoved < 0 ? 'lower' : 'higher'}</span>
                              </span>
                            ) : isLow ? <span className="fc-lowtag">Lowest price</span> : null}
                            <span className="fc-bar" style={{ height: `${h}%` }}>
                              {/* The BAR is reused so its height can animate; its wording is keyed
                                  to the date so the figures cross-fade instead of snapping to a
                                  different day's price mid-glide. */}
                              <span className="fc-barin" key={p.iso}>
                                {isEmpty ? (
                                  <span className="fc-check">Not available</span>
                                ) : isLoading ? (
                                  <span className="fc-check">Checking…</span>
                                ) : liveHere ? (
                                  /* Checked. The live figure is the authoritative one for this
                                     day and takes the price slot; the estimate it replaced stays
                                     above it, struck through, because the traveller picked this
                                     day off that number and is owed an explanation of where it
                                     went. Both are per person — same basis, same strip. */
                                  <>
                                    {/* No "from" here: this day has been checked, so it is not
                                        quoting a starting price any more. Dropping the label is
                                        also what buys the two extra rows their space without
                                        putting a floor under the bar and flattening the chart. */}
                                    {ppMoved != null && <span className="fc-was">{ccy}{wasPP}</span>}
                                    <span className="fc-amt fc-amt-live">{ccy}{nowPP}</span>
                                    <span className="fc-livetag">Live price</span>
                                    <span className="fc-nts">{dayLabel(p.nights)}</span>
                                  </>
                                ) : hasPrice ? (
                                  <>
                                    <span className="fc-from">from</span>
                                    <span className="fc-amt">{ccy}{pp}</span>
                                    <span className="fc-pp">p.p.</span>
                                    <span className="fc-nts">{dayLabel(p.nights)}</span>
                                  </>
                                ) : (
                                  <span className="fc-check">Check live price</span>
                                )}
                              </span>
                            </span>
                          </span>
                          <span className="fc-under" key={p.iso}>
                            <span className="fc-wk">{(p.day || '').substring(0, 3)}</span>
                            <span className="fc-date">{p.date}</span>
                            <span className="fc-dot" aria-hidden="true" />
                          </span>
                          <span className="fc-tail" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
                </div>
                {winStart && (
                  <button type="button" className="fc-arrow" onClick={() => pageDay(1)}
                    title="One day later" aria-label="Show one day later">
                    <S sw={2.5}><path d="M9 18l6-6-6-6" /></S>
                  </button>
                )}
              </div>

              {usingLive && (pd ? (
                    <div className={`fc-pop${dayUnavailable ? ' fc-pop-unavail' : ''}`}>
                      {dayUnavailable ? (
                        /* The honest counterpart of the green card: the supplier was asked and
                           said no. Restates the exact criteria that produced the "no" so the
                           traveller can see WHAT to adjust — and the strip above stays live for
                           picking a different day. */
                        <div className="fc-unavail" role="status">
                          <div className="fc-unavail-head">
                            <span className="fc-unavail-dot" aria-hidden="true" />
                            <div className="fc-unavail-msg">
                              <div className="fc-unavail-title">This trip is not available.</div>
                              <div className="fc-unavail-sub">Please try a different departure date or adjust your search criteria.</div>
                            </div>
                          </div>
                          <div className="fc-unavail-crit">
                            <span className="fc-unavail-caption">Your current selection</span>
                            <div className="fc-unavail-grid">
                              <div className="fcu-item">
                                <span className="fcu-k">{ICON.cal} Departure</span>
                                <span className="fcu-v">{pd.day} {pd.date}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-k">{ICON.cal} Return</span>
                                <span className="fcu-v">{calDay(addDaysISO(pd.iso, nights))} {calDate(addDaysISO(pd.iso, nights))}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-k">{ICON.moon} Duration</span>
                                <span className="fcu-v">{dayLabel(nights)}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-k">{transport === 'hotel_only' ? ICON.bed : ICON.plane} {transport === 'hotel_only' ? 'Transport' : 'Airport'}</span>
                                <span className="fcu-v">{transport === 'hotel_only' ? 'Hotel only' : `${airportName(origin)} (${origin})`}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-k">{ICON.users} Guests</span>
                                <span className="fcu-v">{sharePax}{Number(sRooms) > 1 ? ` · ${sRooms} rooms` : ''}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-k">{ICON.board} Board basis</span>
                                <span className="fcu-v">{BOARD_PREFS.find((b) => b.id === boardPref)?.label || 'No preference'}</span>
                              </div>
                            </div>
                          </div>
                          {/* The button the traveller pressed stays put and goes dead, rather
                              than vanishing with the action bar. A control that disappears
                              reads as a glitch; one that greys out and says "Not Available"
                              names the outcome and holds the traveller's place until they
                              pick another day in the strip above, which re-enables it. */}
                          <div className="fc-act fc-act-off">
                            <div className="fc-act-info">
                              <span className="fc-act-date">
                                {`${calDay(pd.iso)} ${calDate(pd.iso)} – ${calDay(addDaysISO(pd.iso, nights))} ${calDate(addDaysISO(pd.iso, nights))}`}
                              </span>
                              <span className="fc-act-meta">
                                {dayLabel(nights)} · {hotelName}
                              </span>
                            </div>
                            <button type="button" className="fc-cta fc-cta-off" disabled>
                              Not Available
                            </button>
                          </div>
                        </div>
                      ) : !liveChecked ? (
                        <div className="fc-act">
                          <div className="fc-act-info">
                            <span className="fc-act-date">
                              {pd.iso
                                ? `${calDay(pd.iso)} ${calDate(pd.iso)} – ${calDay(addDaysISO(pd.iso, nights))} ${calDate(addDaysISO(pd.iso, nights))}`
                                : `${pd.day} ${pd.date}`}
                            </span>
                            {/* The hotel's name, not an "estimated from" price: the selected
                                strip cell above already quotes that figure, so repeating it
                                here said nothing new — while the name anchors WHAT is being
                                checked right next to the button that checks it. */}
                            <span className="fc-act-meta">
                              {dayLabel(nights)} · {hotelName}
                            </span>
                          </div>
                          <button type="button" className="fc-cta" onClick={checkAvailability}>
                            Check price &amp; availability
                          </button>
                        </div>
                      ) : (
                        <div className={`fc-res${liveRooms?.loading ? ' checking' : ''}${liveRooms?.error ? ' failed' : ''}`}>
                          <div className="av-card">
                            <div className="av-main">
                              {/* The mark says only what the check has actually established.
                                  A green tick used to be printed the moment this block mounted —
                                  while the supplier request was still in flight — so "Checking live
                                  availability…" was announced underneath a confirmation badge, and
                                  anyone reading the icon rather than the sentence was told the
                                  holiday was available before anybody knew it was. In progress is a
                                  spinner, a failed check is amber, and the tick is earned only once
                                  rooms have actually come back. */}
                              {liveRooms?.loading ? (
                                <span className="fc-res-mark fc-res-mark-busy" aria-hidden="true" />
                              ) : liveRooms?.error ? (
                                <svg className="fc-res-mark" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f59e0b" /><path d="M12 7.4v5.2" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" /><circle cx="12" cy="16.4" r="1.35" fill="#fff" /></svg>
                              ) : (
                                <svg className="fc-res-mark" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#10b981" /><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              )}
                              <div className="av-head">
                                <div className="avail-text">
                                  {liveRooms?.loading ? 'Checking live availability…'
                                    : liveRooms?.error ? (pdEstimate ? 'Showing estimated price' : 'Live price unavailable')
                                    : 'Your holiday is available!'}
                                </div>
                                {/* The badge states what has been established, and nothing more:
                                    a price that came back from the supplier is confirmed, an
                                    estimate off the cache is not, and neither is a check still
                                    running. */}
                                <div className={`av-confirm${liveRooms?.error ? ' warn' : ''}${liveRooms?.loading ? ' busy' : ''}`}>
                                  <i className="av-dot" />
                                  {liveRooms?.loading ? 'Asking the hotel for today’s rate'
                                    : liveRooms?.error ? (pdEstimate ? 'Estimated price — not confirmed' : 'Could not reach the hotel')
                                    : 'Live availability and price confirmed'}
                                </div>

                                {/* The three facts a traveller checks a holiday against, on one
                                    line with their own icons instead of a dot-separated run-on. */}
                                <div className="av-facts">
                                  <span className="av-fact">{ICON.cal}{rangeLabel(pd.iso, addDaysISO(pd.iso, nights)) || longDate(pd.iso)}</span>
                                  <span className="av-fact">
                                    {ICON.people}
                                    {[
                                      `${availAdults} adult${availAdults === 1 ? '' : 's'}`,
                                      availChildren > 0 ? `${availChildren} child${availChildren === 1 ? '' : 'ren'}` : null,
                                      availRooms > 1 ? `${availRooms} rooms` : null,
                                    ].filter(Boolean).join(' · ')}
                                  </span>
                                  <span className="av-fact">{ICON.moon}{stayLabel(nights)}</span>
                                </div>
                              </div>
                            </div>

                            <div className={`av-price${priceMoved != null ? (priceMoved < 0 ? ' avail-moved-down' : ' avail-moved-up') : ''}`}>
                              {/* A lavender day has no estimate — €0 is not a price and must
                                  never be printed as one. A quiet dash says "nothing to quote". */}
                              <div className="av-price-label">{liveRoom ? 'Live price' : pdEstimate ? 'Estimated price' : ''}</div>
                              {/* PER PERSON is the headline, because that is the figure the fare
                                  strip beside it quotes and the one travellers compare on. The
                                  party total sits directly under it in words, so the number they
                                  actually pay is never left to be worked out. */}
                              <div className="av-price-row">
                                <span className="avail-price-val">
                                  {liveRooms?.loading
                                    ? <span className="avail-spin" />
                                    : (liveNow != null || pdEstimate)
                                      ? <><small>€</small>{ppOf(liveNow != null ? liveNow : Number(pd.price))}<em>p.p.</em></>
                                      : <span className="avail-price-none">—</span>}
                                </span>
                              </div>
                              {(liveRoom || pdEstimate) && (
                                <div className="av-price-total">
                                  {/* The estimate stays on screen struck through: the traveller
                                      chose this day off that number and is owed an account of
                                      where it went. */}
                                  {priceMoved != null && <span className="avail-price-old">€{cacheWas}</span>}
                                  <b>€{(liveNow != null ? liveNow : Number(pd.price)).toLocaleString('en-GB')}</b>
                                  <span className="avail-forpax">
                                    {` total for ${availAdults} adult${availAdults === 1 ? '' : 's'}`}
                                    {availChildren > 0 ? ` · ${availChildren} child${availChildren === 1 ? '' : 'ren'}` : ''}
                                  </span>
                                </div>
                              )}
                              {/* Amber, not red, when it rises. The holiday IS available — that is
                                  what the tick says — and the only thing that changed is the price.
                                  Stated per person, to match the figure above it. */}
                              {ppMoved != null && (
                                <div className={`avail-move${ppMoved < 0 ? ' down' : ' up'}`}>
                                  {ppMoved < 0 ? ICON.arrowDown : ICON.arrowUp}
                                  <span><b>€{Math.abs(ppMoved)} p.p.</b> {ppMoved < 0 ? 'lower' : 'higher'} after live check</span>
                                </div>
                              )}
                              <div className="avail-you-low">
                                {/* Named for what it actually covers. On a package the flight is
                                    NOT in this figure, so calling it the total holiday price would
                                    be a straight untruth — the Book card below quotes a bigger
                                    number. On an own-transport stay the room IS the holiday. */}
                                {liveRoom ? (transport === 'hotel_only'
                                  ? `Total holiday price · ${dayLabel(nights)}`
                                  : `Live room price · ${dayLabel(nights)}`)
                                  : liveRooms?.error ? (pdEstimate ? 'Live price unavailable — estimate shown' : 'No estimate for this day — try again')
                                  : pdEstimate ? (pd?.lowest ? 'Lowest estimated price' : 'Estimated price')
                                  : 'No cached estimate'}
                              </div>
                            </div>
                          </div>

                          {/* The trip, spelled out. Every value is derived, never assumed: the
                              board is the one on the live rate that produced the price above, and
                              the transfer says where it is added rather than implying an airport
                              pickup nobody has chosen yet. */}
                          <div className="fc-facts">
                            <span className="fc-facts-caption">Your holiday</span>
                            <div className="fc-facts-grid">
                              <div className="fcu-item">
                                <span className="fcu-ico">{ICON.cal}</span>
                                <span className="fcu-k">Travel period</span>
                                <span className="fcu-v">{rangeLabel(pd.iso, addDaysISO(pd.iso, nights)) || longDate(pd.iso)}</span>
                                <span className="fcu-sub">{stayLabel(nights)}</span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-ico">{transport === 'hotel_only' ? ICON.bed : ICON.plane}</span>
                                <span className="fcu-k">{transport === 'hotel_only' ? 'Transport' : 'Departure airport'}</span>
                                <span className="fcu-v">
                                  {transport === 'hotel_only' ? 'Hotel only' : `${airportName(origin)} (${origin})`}
                                </span>
                                <span className="fcu-sub">
                                  {transport === 'hotel_only' ? 'No flights included' : 'Outbound and return'}
                                </span>
                              </div>
                              <div className="fcu-item">
                                <span className="fcu-ico">{ICON.bed}</span>
                                <span className="fcu-k">Accommodation</span>
                                <span className="fcu-v">{liveRoom?.name || 'Chosen below'}</span>
                                <span className="fcu-sub">
                                  {liveBoard
                                    || BOARD_PREFS.find((b) => b.id === boardPref && b.id)?.label
                                    || 'Board chosen with your room'}
                                </span>
                              </div>
                              {transport === 'package' && (
                                <div className="fcu-item">
                                  <span className="fcu-ico">{ICON.noTransfer}</span>
                                  <span className="fcu-k">Transfer</span>
                                  <span className="fcu-v">Not included</span>
                                  <span className="fcu-sub">Optional extra</span>
                                  <span className="fcu-cta">Add in the next step {ICON.arrow}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="av-note">
                            {ICON.info}
                            <span>Prices and availability are checked live with the hotel for these exact dates.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fc-hint">Pick a departure day to check live prices</div>
                  ))}

              {/* Flights. Own transport renders a statement, not a search — the traveller
                  said on the results page they don't want to fly, so no supplier is asked.
                  The affordance to change their mind keeps the live ROOM prices (see
                  applyFilter: transport edits don't drop them). Revealed only once a date
                  has been CHECKED (liveChecked) — like the rooms — so no flight list
                  appears for dates nobody priced. Hidden again while the picked day is
                  UNAVAILABLE: flights for a stay with no room are not a package anyone
                  can book, and every section below the red card would contradict it. */}
              {/* Hidden entirely while the live search runs: the single "Finding your rooms"
                  animation below is the ONE loader for the whole package, so no flight
                  skeleton competes with it. The section reappears — flights already loaded —
                  the moment both results are in. */}
              {liveChecked && !dayUnavailable && !liveBusy && (
              <div className="flight-section reveal vis">
                <div className="section-title"><span className="st-step">2</span> Your flights</div>
                {transport === 'hotel_only' ? (
                  <div className="own-transport">
                    <div className="own-transport-row">
                      {ICON.bed}
                      <div className="own-transport-text">
                        <div className="own-transport-title">Hotel only — no flights included</div>
                        <div className="own-transport-sub">You're arranging your own way there. The price above is the stay alone.</div>
                      </div>
                    </div>
                    <button type="button" className="own-transport-add"
                      onClick={() => applyFilter({ transport: 'package' })}>
                      {ICON.plane} Add flights from {airportName(origin)}
                    </button>
                  </div>
                ) : liveFlights ? (
                  liveFlights.error ? (
                    <div className="live-error">
                      {ICON.warn}
                      <span className="live-error-msg">{liveFlights.error}</span>
                      <button type="button" className="live-retry"
                        onClick={() => fetchFlights(pd?.iso || baseCheckIn, pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut)}>
                        Try again
                      </button>
                    </div>
                  ) : liveFlights.flights?.length ? (
                    <>
                      {/* The airport the fares were REALLY searched from — this line used to
                          hardcode Brussels while quoting Eindhoven prices. */}
                      <div className="flight-note">{ICON.clock} Live fares from {airportName(liveFlights.from || origin)} for your selected travel dates.</div>
                      {/* ONE flight on the page, every other option behind "Change flight".
                          Two cards side by side asked a traveller to compare before they had
                          been told what they were comparing, and the second was whichever fare
                          happened to sit next in the list — not a considered alternative. The
                          cheapest is chosen for them and SAID to be chosen, in words, at the
                          top of the card; the full list, with its filters and sorting, is one
                          click away and is the right place to shop. */}
                      {(() => {
                        const pick = liveFlights.flights[selectedFlight];
                        const isCheapest = selectedFlight === 0;
                        return (
                          <FlightCard
                            f={{ ...pick, price: Math.round(pick.totalPrice), delta: cheapestFare == null || isCheapest ? 0 : pick.totalPrice - cheapestFare }}
                            selected
                            banner={isCheapest ? {
                              title: 'Cheapest flight',
                              sub: 'Automatically selected for your travel dates.',
                              note: 'This is the best-priced flight option we found for your selected dates.',
                            } : {
                              title: 'Your selected flight',
                              sub: 'You picked this one over the cheapest fare.',
                              note: cheapestFare == null ? null
                                : `€${Math.round(pick.totalPrice - cheapestFare).toLocaleString('en-GB')} more than the cheapest option for these dates.`,
                            }}
                            onSelect={() => {}}
                          />
                        );
                      })()}
                      {liveFlights.flights.length > 1 && (
                        <button className="show-more-flights" onClick={() => setModalOpen(true)}>
                          {ICON.plane} Change flight · {liveFlights.flights.length - 1} more option{liveFlights.flights.length - 1 === 1 ? '' : 's'}
                        </button>
                      )}
                      <div className="all-in-note">{ICON.shield} All prices include taxes, fees and charges.</div>

                      {/* ── Or fly from another airport? ──
                          What the popular alternatives cost, as a DIFFERENCE per person from
                          the fare above. A traveller weighing an hour's extra drive against
                          the price needs the gap, not two absolute numbers to subtract; and a
                          minus sign is as honest as a plus, so a cheaper airport says so
                          instead of being quietly re-ordered to the front and left unlabelled.
                          Every figure is a real search — the same bounded, cached probe that
                          serves the no-flights case. */}
                      {liveFlights.probing ? (
                        <div className="alt-airports alt-airports-muted">
                          <div className="alt-airports-label">
                            <span className="live-spin" /> Checking prices from other airports…
                          </div>
                        </div>
                      ) : liveFlights.alternatives?.length ? (
                        <div className="alt-airports">
                          <div className="alt-airports-label">Or fly from another airport?</div>
                          <div className="alt-airport-chips">
                            {liveFlights.alternatives.map((alt) => {
                              // Per person, against the cheapest fare on offer from the
                              // airport currently searched — the figure the card above shows.
                              const herePax = cheapestFare == null ? null
                                : Math.max(1, Math.round(cheapestFare / Math.max(1, (Number(sAdults) || 2) + (Number(sChildren) || 0))));
                              const delta = herePax == null ? null : alt.perPax - herePax;
                              return (
                                <button type="button" key={alt.code} className="alt-chip alt-chip-priced"
                                  onClick={() => applyAlternative(alt.code)}>
                                  <span className="alt-chip-name">{airportName(alt.code)}</span>
                                  <span className="alt-chip-code">{alt.code}</span>
                                  <span className={`alt-chip-delta${delta != null && delta < 0 ? ' down' : ''}`}>
                                    {delta == null ? `${ccy}${alt.perPax} p.p.`
                                      : delta === 0 ? 'same price p.p.'
                                      : `${delta > 0 ? '+' : '−'} ${ccy}${Math.abs(delta)} p.p.`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : liveFlights.empty ? (
                    <>
                      <div className="live-empty">
                        {ICON.plane} No flights from {airportName(liveFlights.from || origin)} for these dates.
                      </div>
                      {liveFlights.probing ? (
                        <div className="live-loading"><span className="live-spin" /> Checking nearby departure airports…</div>
                      ) : liveFlights.alternatives?.length ? (
                        <div className="alt-airports">
                          <div className="alt-airports-label">These airports do fly this route — cheapest first:</div>
                          <div className="alt-airport-chips">
                            {liveFlights.alternatives.map((alt) => (
                              <button type="button" key={alt.code} className="alt-chip alt-chip-priced"
                                onClick={() => applyAlternative(alt.code)}>
                                <span className="alt-chip-name">{airportName(alt.code)}</span>
                                <span className="alt-chip-code">{alt.code}</span>
                                <span className="alt-chip-price">from {ccy}{alt.perPax} p.p.</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : liveFlights.alternatives ? (
                        // Probed, and NOBODY flies it on these dates. An honest dead end with
                        // two real ways forward — not an empty panel.
                        <div className="alt-airports">
                          <div className="alt-airports-label">
                            None of our departure airports fly this route on these dates.
                            Try different dates — or continue with the hotel only.
                          </div>
                          <button type="button" className="own-transport-add"
                            onClick={() => applyFilter({ transport: 'hotel_only' })}>
                            {ICON.car} Continue without flights
                          </button>
                        </div>
                      ) : null}
                      {!liveFlights.probing && liveFlights.unprobed?.length > 0 && (
                        <div className="alt-airports alt-airports-muted">
                          <div className="alt-airports-label">Or search another airport:</div>
                          <div className="alt-airport-chips">
                            {liveFlights.unprobed.map((code) => (
                              <button type="button" key={code} className="alt-chip"
                                onClick={() => applyFilter({ origin: code })}>
                                <span className="alt-chip-name">{airportName(code)}</span>
                                <span className="alt-chip-code">{code}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="live-empty">{ICON.plane} No live flights found for these dates.</div>
                  )
                ) : (
                  <>
                    {/* This used to print two hardcoded TUI fly / Transavia itineraries under
                        the heading "We have selected the cheapest flight for you" — real-looking
                        flight numbers and times for flights that were never searched, and which
                        the checkout hand-off then carried through as the booked itinerary. */}
                    <div className="live-empty">
                      {ICON.plane}
                      {destination
                        ? 'Pick a departure date above and check availability to see live fares.'
                        : 'Add a destination to your search to see live fares.'}
                    </div>
                    {/* One-click departure-airport switch — the same action as the Transport
                        field in the search bar, so picking one re-runs the flight search from
                        there. These used to be inert <div>s quoting invented "+€ N p.p."
                        deltas from the design mock; a real delta would cost one live supplier
                        search per airport, so the price line is gone rather than faked. */}
                    <div className="alt-airports">
                      <div className="alt-airports-label">Flying from another airport?</div>
                      <div className="alt-airport-chips">
                        {AIRPORT_CODES.map((code) => (
                          <button type="button" key={code}
                            className={`alt-chip${origin === code ? ' act' : ''}`}
                            aria-pressed={origin === code}
                            onClick={() => applyFilter({ origin: code })}>
                            <span className="alt-chip-name">{airportName(code)}</span>
                            <span className="alt-chip-code">{code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* The airport transfer is no longer sold here. It is bought at the checkout, in
                  the extras step, where the flight is already fixed so the pickup can be timed to
                  the arrival that will actually be booked — and where every other paid extra is
                  chosen. This page prices the holiday; the checkout sells the additions. */}

              {/* Rooms — live availability, revealed once the traveller checks a date.
                  An unavailable day has no rooms by definition — the red card already
                  says so, a "Choose your room: none found" section under it would nag. */}
              {liveChecked && !dayUnavailable && (
              <div className="room-section reveal vis">
                {!liveBusy && <div className="section-title"><span className="st-step">3</span> Choose your room</div>}
                {liveRooms ? (
                  liveBusy ? (
                    <RoomsLoading />
                  ) : liveRooms.error ? (
                    <div className="live-error">
                      {ICON.warn}
                      <span className="live-error-msg">{liveRooms.error}</span>
                      {/* A timeout is the most common failure here and the one most likely to
                          succeed on a second attempt — don't make the traveller re-pick a day. */}
                      <button type="button" className="live-retry" onClick={checkAvailability}>Try again</button>
                    </div>
                  ) : boardFilterHidAll ? (
                    <div className="live-empty">
                      {ICON.board} No {(BOARD_PREFS.find((b) => b.id === boardPref)?.label || '').toLowerCase()} rate at this hotel for these dates.
                      <button type="button" className="filter-reset" style={{ marginLeft: 10 }} onClick={() => setOvr((p) => ({ ...p, board: '' }))}>Show all meal plans</button>
                    </div>
                  ) : roomGroups.length ? (
                    <div className="stay-block">
                      <div className="stay-header">
                        <div className="stay-icon">{ICON.bed}</div>
                        <div className="stay-title">
                          Available rooms
                          <span className="stay-guests">
                            ({roomGroups.length} room type{roomGroups.length === 1 ? '' : 's'}
                            {nBoards > 1 ? ` · ${nBoards} board options` : ''} · live prices)
                          </span>
                        </div>
                      </div>

                      {/* One card per ROOM TYPE; inside it, every board that room can be booked
                          on, cheapest first. Boards were previously invisible: the flat list was
                          sorted by price, so the cheapest board crowded out all the others. */}
                      {visibleGroups.map((g) => {
                        const gInfo = rateInfo.get(g.cheapest.index);
                        return (
                        <div className="room-group" key={g.key}>
                          <div className="room-group-head">
                            {/* No room code chip. "DBL.ST" is the supplier's identifier, not
                                anything a traveller books on, and it sat next to the room name
                                competing with it. It still travels on the rate for the booking
                                hand-off; it is just not shown. */}
                            <div className="room-group-id">
                              <div className="room-group-name">{g.name}</div>
                              {/* Who the room sleeps and for how long — the two facts that apply
                                  to every board below, so they belong to the room's own title
                                  block rather than to a strip above the first option, where they
                                  read as qualifying that option alone. Per-night and per-guest
                                  arithmetic deliberately left out: the traveller is choosing a
                                  board here, and a second price beside every real price is
                                  noise, not help. */}
                              <div className="room-group-meta">
                                {gInfo?.guests != null && (
                                  <span className="rgm">{ICON.users}
                                    {gInfo.adults} adult{gInfo.adults === 1 ? '' : 's'}
                                    {gInfo.children > 0 ? ` · ${gInfo.children} child${gInfo.children === 1 ? '' : 'ren'}` : ''}
                                    {gInfo.rooms > 1 ? ` · ${gInfo.rooms} rooms` : ''}
                                  </span>
                                )}
                                <span className="rgm">{ICON.moon}{dayLabel(nights)}</span>
                              </div>
                            </div>
                            <div className="room-group-from">
                              <span className="rgf-count">{g.boards.length} option{g.boards.length === 1 ? '' : 's'}</span>
                              <span className="rgf-price">From {ccy}{Math.round(g.cheapest.price).toLocaleString('en-GB')}</span>
                            </div>
                          </div>

                          {/* Said once, on the room that actually holds the cheapest rate, rather
                              than as a badge repeated down every list. The rows below are already
                              in price order; this explains that ordering instead of decorating
                              the row it produced. */}
                          {g.boards.some((b) => b.index === cheapestIndex) && (
                            <div className="room-best-note">
                              <span className="rbn-ico">{ICON.tag}</span>
                              <div className="rbn-text">
                                <div className="rbn-title">Best-priced option in this room</div>
                                <div className="rbn-sub">The cheapest available option is shown first.</div>
                              </div>
                            </div>
                          )}

                          {g.boards.map((b) => {
                            // Compared against the index the CARD is quoting, not against the
                            // raw pick, so the row ticked here is always the rate priced above.
                            const isSel = liveIndex === b.index;
                            const d = rateInfo.get(b.index);
                            const isCheapest = b.index === cheapestIndex;
                            // Against the cheapest board of THIS room — a like-for-like comparison
                            // the traveller is actually making on screen.
                            const extra = b.price - g.cheapest.price;
                            return (
                              <div
                                key={b.index}
                                className={`room-option${isSel ? ' selected' : ''}${isCheapest ? ' cheapest' : ''}`}
                                onClick={() => setSelectedRoom((p) => ({ ...p, live: b.index }))}
                              >
                                <div className="room-radio" />
                                <div className="room-info">
                                  {/* Board, its flag and its cancellation terms on ONE line. The
                                      terms used to hang two rows below the board name, under the
                                      gloss, which is where people stopped reading — so the single
                                      fact that decides whether a rate is bookable was the last
                                      thing on the row. It now sits beside the name it qualifies. */}
                                  <div className="room-name">
                                    {d?.board.label || b.boardLabel}
                                    {/* What the traveller has chosen, said on the row itself. The
                                        green frame alone leaves someone scrolling a long list to
                                        infer it from colour; the "Lowest price" badge that used to
                                        sit here is now the one note at the top of the room. */}
                                    {isSel && <span className="room-flag room-flag-sel">{ICON.check} Selected</span>}
                                    <div className="room-chips">
                                      {/* No cancellation FIGURES on a room row — neither a "Free
                                          cancellation until X" promise nor a "Cancel now costs
                                          €1,354" warning. Both quote a number off a live supplier
                                          rate the traveller has not booked yet, on a row whose job
                                          is to sell the room; the amount moves with the date and
                                          the party, so printing it here reads as a charge they are
                                          about to incur. Whether a rate can be cancelled AT ALL is
                                          still stated below — "Non-refundable" is a property of
                                          the rate, not a price. */}
                                      {d?.cancel.kind === 'none' && (
                                        <span className="rchip rchip-nr">{ICON.lock} Non-refundable</span>
                                      )}
                                      {d?.cancel.kind === 'unknown' && d?.nonRefundable === true && (
                                        <span className="rchip rchip-nr">{ICON.lock} Non-refundable</span>
                                      )}
                                      {d?.packageRate && <span className="rchip rchip-mute">Package rate</span>}
                                      {/* The supplier (Hotelbeds / Diana) is never shown to the
                                          traveller — who we source a rate from is our commercial
                                          relationship, not part of the offer. It still rides on the
                                          rate object for the booking hand-off. */}
                                    </div>
                                  </div>
                                  {d?.board.gloss && <div className="room-cap">{d.board.gloss}</div>}

                                </div>

                                {/* One price, and what it costs over the cheapest board of this
                                    room. The per-night figure that used to sit here, and the
                                    breakdown panel that opened underneath, are gone: the board
                                    and its total are the decision. */}
                                <div className="room-price-col">
                                  <div className="room-price">{ccy}{Math.round(b.price).toLocaleString('en-GB')}</div>
                                  {extra > 1 && (
                                    <div className="room-price-delta">+{ccy}{Math.round(extra).toLocaleString('en-GB')} vs cheapest</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })}

                      {roomGroups.length > ROOMS_COLLAPSED && (
                        <button type="button" className="room-more" onClick={() => setShowAllRooms((s) => !s)}>
                          {ICON.bed}
                          {showAllRooms
                            ? 'Show fewer rooms'
                            : `Show more rooms · ${roomGroups.length - ROOMS_COLLAPSED} more`}
                        </button>
                      )}
                      <div className="all-in-note">{ICON.shield} All prices include taxes, fees and charges.</div>
                    </div>
                  ) : (
                    <div className="live-empty">{ICON.bed} No live rooms found for these dates.</div>
                  )
                ) : (
                  /* Was a hardcoded pair of "Stay 1 / Stay 2" blocks listing four invented
                     room types with fabricated scarcity ("Only 2 available!", "Only 1 room
                     available!") and four meal plans at made-up prices. None of it was
                     searched, it ignored the real party size, and the selected room + meal
                     were carried into the checkout summary. */
                  <div className="live-empty">
                    {ICON.bed} Pick a departure date above and check availability to see this
                    hotel’s real rooms and board options.
                  </div>
                )}
              </div>
              )}

              {/* Overview */}
              <div className="overview-section reveal vis">
                <div className="section-title"><span className="st-step">4</span> Overview of your holiday</div>
                <div className="overview-card">
                  <div className="overview-head">
                    <div className="overview-head-main">
                    <div className="overview-hotel">{hotelName}</div>
                    <div className="overview-stars">{'★'.repeat(Math.min(stars, 5))}</div>
                    <div className="overview-loc">{ICON.pin} {locLabel}</div>
                    {/* Who is travelling, stated on the summary itself. It decided every figure
                        below it and was readable nowhere on this card — someone who changed the
                        party size two screens ago had no way to check the total was priced for
                        the party they meant. */}
                    <div className="overview-pax">{ICON.users} {(() => {
                      const a = Number(sAdults) || 0;
                      const c = Number(sChildren) || 0;
                      if (!a && !c) return `${ovPax} ${ovPax === 1 ? 'traveller' : 'travellers'}`;
                      return [
                        a ? `${a} adult${a === 1 ? '' : 's'}` : null,
                        c ? `${c} child${c === 1 ? '' : 'ren'}` : null,
                      ].filter(Boolean).join(' · ');
                    })()}</div>
                    <div className="overview-dates">{ICON.cal} {(() => {
                      const ci = pd?.iso || baseCheckIn;
                      const co = ci ? addDaysISO(ci, nights) : baseCheckOut;
                      // No invented April dates when the search carries none.
                      return (niceDate(ci) && niceDate(co)) ? `${niceDate(ci)} - ${niceDate(co)}` : 'Dates not selected yet';
                    })()} <span>({dayLabel(nights)})</span></div>
                    </div>
                    {/* overview-score removed — no real review data yet */}
                  </div>
                  <div className="overview-body">
                    {/* Was a hardcoded "4 × €361 p.p. — €1,444" for any hotel with no live
                        rate yet: a quote for a party size and a price nobody had asked for. */}
                    {ovBase != null
                      ? <div className="overview-row"><span className="overview-row-label">{ICON.users} {ovPax} × {ccy}{Math.round(ovBase / ovPax).toLocaleString('en-GB')} p.p.</span><span className="overview-leader" /><span className="overview-row-val">{ccy} {ovBase.toLocaleString('en-GB')}</span></div>
                      : <div className="overview-row"><span className="overview-row-label">{ICON.users} Stay for {ovPax} {ovPax === 1 ? 'traveller' : 'travellers'}</span><span className="overview-leader" /><span className="overview-row-val" style={{ color: 'var(--text-light)' }}>not priced yet</span></div>}
                    <div className="overview-row"><span className="overview-row-label">{ICON.shield} SGR Guarantee Fund</span><span className="overview-leader" /><span className="overview-row-val">{ccy} 20</span></div>
                    {/* Not "not included" — that reads as unavailable. It is available, on the
                        next page, priced against the flight being booked. */}
                    {transport === 'package' && (
                      <div className="overview-row"><span className="overview-row-label">{ICON.noTransfer} Airport transfer</span><span className="overview-leader" /><span className="overview-row-val" style={{ color: 'var(--text-light)' }}>added at checkout</span></div>
                    )}
                    <div className="overview-extras">
                      <div className="overview-extra">{ICON.check} No booking fees</div>
                      {liveFlight != null && <div className="overview-extra">{ICON.check} Hand luggage included</div>}
                    </div>
                  </div>
                  <div className="overview-total">
                    <span className="overview-total-label">Total for {ovPax} {ovPax === 1 ? 'person' : 'people'}</span>
                    <span className="overview-total-val">
                      {ovBase != null
                        ? `${ccy}${(ovBase + 20).toLocaleString('en-GB')}`
                        : '—'}
                    </span>
                  </div>
                  <div className="overview-book-wrap">
                    <button className="overview-book-btn" onClick={goCheckout} disabled={liveFlights?.loading || dayUnavailable}>
                      {liveFlights?.loading ? <>Checking flight prices…</>
                        : dayUnavailable ? <>Not available for this date</>
                        : ovBase == null ? <>Check availability {ICON.arrow}</>
                        : <>Now book {ICON.arrow}</>}
                    </button>
                  </div>
                  <div className="overview-urgency"><div className="overview-urgency-text">{ICON.shield} Prices are in {ccy} and may change until your booking is completed.</div></div>
                </div>
              </div>
            </div>

            {/* ── INFORMATION ── */}
            {activeTab === 'Information' && (
              <div className="tp act">
                {/* ── About + photo collage ───────────────────────────────────
                    No invented prose fallback. The old one described every hotel as "a
                    stunning boutique hotel nestled on the pristine shores of…", which for
                    the 3% of records with no description was fiction with a hotel's name
                    on it. Nothing to say → the block does not render. */}
                {(info?.description || hasPhotos) && (
                  <section className="hi-card hi-about">
                    {info?.description && (
                      <div className="hi-about-copy">
                        <div className="hi-card-head">
                          <div className="hi-card-icon">{ICON.info}</div>
                          <h3 className="hi-card-title">About {hotelName}</h3>
                        </div>
                        <div className={`hi-desc${expanded.d1 ? ' exp' : ''}`}>{info.description}</div>
                        {info.description.length > 260 && (
                          <button className="hi-link" onClick={() => toggleExpand('d1')}>
                            {expanded.d1 ? 'Show less' : 'Read more'}
                            <S size={14} sw={2.5}><path d={expanded.d1 ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} /></S>
                          </button>
                        )}
                      </div>
                    )}

                    {hasPhotos && (
                      <div className="hi-gallery">
                        <button
                          className="hi-gallery-hero"
                          onClick={() => (photoCats ? openExplorer('ALL') : openLightbox(images, 0))}
                          aria-label={`View all ${photoCount} photos of ${hotelName}`}
                        >
                          <HotelImg src={images[0]} size="bigger" alt={`${hotelName}`} />
                          <span className="hi-gallery-cta">
                            <S size={15} sw={2}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></S>
                            See photos ({photoCount})
                          </span>
                        </button>
                        {images.length > 1 && (
                          <div className="hi-gallery-strip">
                            {images.slice(1, 6).map((src, i) => (
                              <button
                                key={src}
                                className="hi-gallery-thumb"
                                onClick={() => openLightbox(images, i + 1)}
                                aria-label={`Photo ${i + 2} of ${hotelName}`}
                              >
                                <HotelImg src={src} size="small" alt="" loading="lazy" onError={(e) => { e.currentTarget.closest('button').style.display = 'none'; }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* ── Hotel at a glance ───────────────────────────────────────
                    Board is deliberately absent until a stay has actually been priced.
                    `info.boards` is empty on every hotel in the catalogue, so the old
                    `hotel?.board || 'All inclusive'` printed "All Inclusive" on hotels
                    that sell nothing of the sort, on every cold visit to this page. */}
                {(() => {
                  const tiles = [
                    stars > 0 && { icon: 'star', label: 'Category', value: `${Math.min(stars, 5)}-Star` },
                    glance.rooms && { icon: 'bed', label: 'Rooms', value: glance.rooms },
                    liveBoard && { icon: 'board', label: 'Board', value: liveBoard },
                    glance.floors && { icon: 'floors', label: 'Floors', value: glance.floors },
                    glance.renovated && { icon: 'reno', label: 'Renovated', value: glance.renovated },
                    !glance.renovated && glance.built && { icon: 'cal', label: 'Built', value: glance.built },
                  ].filter(Boolean);
                  return tiles.length >= 2 && (
                    <section className="hi-card">
                      <div className="hi-card-head">
                        <div className="hi-card-icon">{FAC_SVG.info}</div>
                        <h3 className="hi-card-title">Hotel at a glance</h3>
                      </div>
                      <div className="hi-glance">
                        {tiles.map((t) => (
                          <div className="hi-glance-tile" key={t.label}>
                            <div className="hi-glance-icon">{GLANCE_SVG[t.icon]}</div>
                            <div className="hi-glance-value">{t.value}</div>
                            <div className="hi-glance-label">{t.label}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                {/* ── Location & surroundings ─────────────────────────────── */}
                {(info?.address || info?.latitude) && (
                  <section className="hi-card">
                    <div className="hi-card-head">
                      <div className="hi-card-icon hi-card-icon--loc">{ICON.pin}</div>
                      <h3 className="hi-card-title">Location &amp; Surroundings</h3>
                    </div>
                    <div className="hi-loc">
                      {info?.latitude && info?.longitude && (
                        <div className="hi-map">
                          <iframe
                            title={`Map of ${hotelName}`}
                            loading="lazy"
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(info.longitude) - 0.008},${Number(info.latitude) - 0.006},${Number(info.longitude) + 0.008},${Number(info.latitude) + 0.006}&layer=mapnik&marker=${info.latitude},${info.longitude}`}
                          />
                        </div>
                      )}

                      <div className="hi-loc-side">
                        {info?.address && (
                          <div className="hi-row">
                            <span className="hi-row-icon">{ICON.pin}</span>
                            <span className="hi-row-body">
                              <span className="hi-row-label">Address</span>
                              <span className="hi-row-value">{info.address}</span>
                            </span>
                          </div>
                        )}
                        {zoneLabel && (
                          <div className="hi-row">
                            <span className="hi-row-icon">{FAC_SVG.city}</span>
                            <span className="hi-row-body">
                              <span className="hi-row-label">Area</span>
                              <span className="hi-row-value">{zoneLabel}</span>
                            </span>
                          </div>
                        )}
                        {(info?.cityName || info?.city) && (
                          <div className="hi-row">
                            <span className="hi-row-icon">{FAC_SVG.harbour}</span>
                            <span className="hi-row-body">
                              <span className="hi-row-label">Destination</span>
                              <span className="hi-row-value">{info.cityName || info.city}</span>
                            </span>
                          </div>
                        )}

                        {nearby.length > 0 && (
                          <div className="hi-nearby">
                            <div className="hi-nearby-title">Nearby</div>
                            {nearby.map((n) => (
                              <div className="hi-nearby-row" key={n.label}>
                                <span className="hi-nearby-icon">{FAC_SVG[n.icon] || FAC_SVG.check}</span>
                                <span className="hi-nearby-label">{n.label}</span>
                                <span className="hi-nearby-dist">{n.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {info?.latitude && info?.longitude && (
                          <>
                            <div className="hi-coords">
                              <span className="hi-row-body">
                                <span className="hi-row-label">Coordinates</span>
                                <span className="hi-row-value">
                                  {Number(info.latitude).toFixed(4)}° N, {Number(info.longitude).toFixed(4)}° E
                                </span>
                              </span>
                              <button
                                className="hi-copy"
                                onClick={() => copyValue(`${Number(info.latitude).toFixed(6)}, ${Number(info.longitude).toFixed(6)}`, 'coords')}
                                aria-label="Copy coordinates"
                              >
                                {copied === 'coords'
                                  ? <>{FAC_SVG.check}<span>Copied</span></>
                                  : <>{COPY_SVG}<span>Copy</span></>}
                              </button>
                            </div>
                            <a
                              className="hi-maplink"
                              href={`https://www.openstreetmap.org/?mlat=${info.latitude}&mlon=${info.longitude}#map=15/${info.latitude}/${info.longitude}`}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              Open larger map
                              <S size={14} sw={2}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></S>
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* ── Weather & climate ──────────────────────────────────────
                    Live, from the hotel's own coordinates, proxied through our API so the
                    WeatherAPI key stays on the server. The block is absent — not empty, not
                    a placeholder — whenever the lookup fails or the hotel has no coordinates.
                    Note what is NOT here: the reference design's "typical weather in
                    <month>" panel (average daytime, sunshine hours, rainy days per month).
                    Those are climate normals; this feed does not publish them and nothing
                    else in the estate holds them, so the third panel shows what the feed
                    genuinely knows instead of a table of plausible-looking numbers. */}
                {weather?.data && (() => {
                  const w = weather.data;
                  const dayName = (iso, i) => {
                    if (i === 0) return 'Today';
                    // Parse the Y-M-D parts directly: `new Date('2026-08-14')` is UTC midnight,
                    // which reads as the previous day for anyone west of Greenwich.
                    const [y, m, d] = String(iso).split('-').map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
                  };
                  // The marine feed answers for ANY coordinate by snapping to the nearest
                  // water, so a Paris hotel comes back with a sea temperature from the
                  // Channel. Only show it where the hotel itself is evidence of a coast:
                  // a beach within reach, or a beach facility of its own.
                  const nearBeach = nearby.some((n) => n.label === 'Beach' && n.metres <= 20000);
                  const hasBeach = (rawFacilities || []).some((f) => /beach/i.test(f?.facilityName || ''));
                  const showSea = w.sea != null && (nearBeach || hasBeach);

                  const facts = [
                    showSea && { label: 'Sea temperature', value: `${w.sea}°C`, icon: 'wave' },
                    w.today?.uv != null && { label: 'UV index', value: uvLabel(w.today.uv), icon: 'uv' },
                    w.today?.sunrise && { label: 'Sunrise', value: tidyTime(w.today.sunrise), icon: 'sunrise' },
                    w.today?.sunset && { label: 'Sunset', value: tidyTime(w.today.sunset), icon: 'sunset' },
                  ].filter(Boolean);

                  return (
                    <section className="hi-card">
                      <div className="hi-card-head">
                        <div className="hi-card-icon hi-card-icon--wx">{WX_SVG.sun}</div>
                        <h3 className="hi-card-title">Weather &amp; Climate</h3>
                      </div>

                      <div className="hi-wx">
                        {/* now */}
                        <div className="hi-wx-panel">
                          <div className="hi-wx-panel-title">Current weather</div>
                          <div className="hi-wx-now">
                            <div className="hi-wx-now-left">
                              <div className="hi-wx-now-icon">
                                {WX_SVG[weatherIcon(w.current.code, w.current.isDay)] || WX_SVG.cloud}
                              </div>
                              <div className="hi-wx-now-temp">{w.current.tempC}°<span>C</span></div>
                              <div className="hi-wx-now-cond">{w.current.condition}</div>
                              {w.current.feelsLikeC != null && (
                                <div className="hi-wx-now-feels">Feels like {w.current.feelsLikeC}°C</div>
                              )}
                            </div>
                            <dl className="hi-wx-stats">
                              {w.current.minC != null && w.current.maxC != null && (
                                <div><dt>Min / Max</dt><dd>{w.current.minC}° / {w.current.maxC}°</dd></div>
                              )}
                              {w.current.humidity != null && (
                                <div><dt>Humidity</dt><dd>{w.current.humidity}%</dd></div>
                              )}
                              {w.current.windKph != null && (
                                <div><dt>Wind</dt><dd>{w.current.windKph} km/h</dd></div>
                              )}
                              {w.current.rainChance != null && (
                                <div><dt>Rain chance</dt><dd>{w.current.rainChance}%</dd></div>
                              )}
                            </dl>
                          </div>
                        </div>

                        {/* next few days */}
                        {w.forecast?.length > 1 && (
                          <div className="hi-wx-panel">
                            <div className="hi-wx-panel-title">{w.forecast.length}-day forecast</div>
                            <div className="hi-wx-days">
                              {w.forecast.map((d, i) => (
                                <div className="hi-wx-day" key={d.date}>
                                  <div className="hi-wx-day-name">{dayName(d.date, i)}</div>
                                  <div className="hi-wx-day-icon" title={d.condition || ''}>
                                    {WX_SVG[weatherIcon(d.code, true)] || WX_SVG.cloud}
                                  </div>
                                  <div className="hi-wx-day-max">{d.maxC}°</div>
                                  <div className="hi-wx-day-min">{d.minC}°</div>
                                  <div className="hi-wx-day-rain">
                                    <S size={11} sw={2}><path d="M12 2.7S6 9.4 6 13.2a6 6 0 0012 0C18 9.4 12 2.7 12 2.7z" /></S>
                                    {d.rainChance}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* conditions the feed actually knows */}
                        {facts.length > 0 && (
                          <div className="hi-wx-panel">
                            <div className="hi-wx-panel-title">Conditions today</div>
                            <div className="hi-wx-facts">
                              {facts.map((f) => (
                                <div className="hi-wx-fact" key={f.label}>
                                  <span className="hi-wx-fact-icon">{WX_FACT_SVG[f.icon]}</span>
                                  <span className="hi-wx-fact-label">{f.label}</span>
                                  <span className="hi-wx-fact-value">{f.value}</span>
                                </div>
                              ))}
                            </div>
                            {w.location?.localtime && (
                              <div className="hi-wx-foot">
                                Local time at the hotel {String(w.location.localtime).slice(11)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })()}

                {/* ── Contact ─────────────────────────────────────────────────
                    Hotelbeds files the same number under several types, so the raw list
                    renders three identical cards. De-duplicated by number, first label wins. */}
                {(() => {
                  const LABELS = {
                    PHONEHOTEL: 'Hotel',
                    PHONEBOOKING: 'Booking',
                    PHONEMANAGEMENT: 'Management',
                    FAXNUMBER: 'Fax',
                  };
                  // Sort before de-duplicating so that when the hotel files one number under
                  // several types — which it usually does — the surviving card is labelled
                  // "Hotel" rather than whichever type happened to come back first.
                  const RANK = ['PHONEHOTEL', 'PHONEBOOKING', 'PHONEMANAGEMENT', 'FAXNUMBER'];
                  const seen = new Set();
                  const phones = [...(info?.phones || [])]
                    .sort((a, b) => {
                      const ra = RANK.indexOf(a?.phoneType); const rb = RANK.indexOf(b?.phoneType);
                      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
                    })
                    .filter((p) => {
                      const n = String(p?.phoneNumber || '').replace(/\s+/g, '');
                      if (!n || seen.has(n)) return false;
                      seen.add(n);
                      return true;
                    });
                  return phones.length > 0 && (
                    <section className="hi-card">
                      <div className="hi-card-head">
                        <div className="hi-card-icon hi-card-icon--contact">{PHONE_SVG}</div>
                        <h3 className="hi-card-title">Contact</h3>
                      </div>
                      <div className="hi-contacts">
                        {phones.map((p) => (
                          <div className="hi-contact" key={p.phoneNumber}>
                            <div className="hi-contact-icon">
                              {p.phoneType === 'FAXNUMBER' ? FAX_SVG : PHONE_SVG}
                            </div>
                            <div className="hi-contact-body">
                              <div className="hi-contact-type">{LABELS[p.phoneType] || 'Phone'}</div>
                              <a className="hi-contact-number" href={`tel:${String(p.phoneNumber).replace(/\s+/g, '')}`}>
                                {p.phoneNumber}
                              </a>
                            </div>
                            <button
                              className="hi-copy hi-copy--icon"
                              onClick={() => copyValue(p.phoneNumber, `tel-${p.phoneNumber}`)}
                              aria-label={`Copy ${LABELS[p.phoneType] || 'phone'} number`}
                            >
                              {copied === `tel-${p.phoneNumber}` ? FAC_SVG.check : COPY_SVG}
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                {/* ── Room types ──────────────────────────────────────────────
                    Room NAMES only exist on the live-availability path — the content
                    catalogue ships codes and occupancy, nothing else. So a searched stay
                    shows "Sea View Double", a cold visit shows the code, and neither
                    invents the other. Photos come from the image rows the supplier tagged
                    with a roomCode. */}
                {(() => {
                  const rooms = info?.rooms || [];
                  if (!rooms.length) return null;
                  const imagesByRoom = new Map();
                  for (const im of info?.images || []) {
                    if (!im?.roomCode || !im?.url) continue;
                    if (!imagesByRoom.has(im.roomCode)) imagesByRoom.set(im.roomCode, im.url);
                  }
                  // `liveRooms` is {rooms[], cheapest}, not an array — reading it as one both
                  // lost every supplier name and would have thrown the moment a stay was priced.
                  const nameByCode = new Map();
                  for (const lr of liveRooms?.rooms || []) {
                    if (lr?.roomCode && lr?.name && !nameByCode.has(lr.roomCode)) nameByCode.set(lr.roomCode, lr.name);
                  }
                  // Hotelbeds files a row per room/characteristic combination, so a large resort
                  // arrives with ~180 of them. Everything past the first dozen is noise in a
                  // strip the guest scrolls sideways, so the rest are counted, not rendered.
                  const ROOMS_SHOWN = 12;
                  const all = rooms
                    .filter((rm, i, arr) => arr.findIndex((r) => r.roomCode === rm.roomCode) === i)
                    .map((rm) => ({
                      code: rm.roomCode,
                      // A searched stay carries the supplier's own room name; without one the
                      // code is decoded as far as it can be vouched for. Never invented.
                      name: nameByCode.get(rm.roomCode) || roomNameFromCode(rm.roomCode),
                      img: imagesByRoom.get(rm.roomCode) || null,
                      minPax: rm.minPax,
                      maxPax: rm.maxPax,
                    }))
                    // The ones we can actually show a picture of lead.
                    .sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0));
                  const cards = all.slice(0, ROOMS_SHOWN);
                  const hiddenRooms = all.length - cards.length;
                  return (
                    <section className="hi-card">
                      <div className="hi-card-head">
                        <div className="hi-card-icon hi-card-icon--room">{ICON.bed}</div>
                        <h3 className="hi-card-title">Room Types</h3>
                        {photoCats?.some((c) => c.code === 'HAB') && (
                          <button className="hi-roomsall" onClick={() => openExplorer('HAB')}>
                            View all room types
                          </button>
                        )}
                      </div>
                      <div className="hi-rooms-wrap">
                        <button
                          className="hi-rail-nav hi-rail-nav--prev"
                          onClick={() => roomRailRef.current?.scrollBy({ left: -440, behavior: 'smooth' })}
                          aria-label="Previous room types"
                        >
                          <S size={16} sw={2.5}><path d="M15 18l-6-6 6-6" /></S>
                        </button>
                        <div className="hi-rooms" ref={roomRailRef}>
                          {cards.map((rm) => (
                            <div className="hi-room" key={rm.code}>
                              <div className="hi-room-body">
                                <div className="hi-room-name">{rm.name || rm.code}</div>
                                {rm.name && <div className="hi-room-code">{rm.code}</div>}
                                {rm.maxPax != null && (
                                  <div className="hi-room-pax">
                                    <S size={13} sw={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>
                                    {/* A single room sleeps "1 guest", not "1–1 guests". */}
                                    {rm.minPax != null && rm.minPax !== rm.maxPax
                                      ? `${rm.minPax}–${rm.maxPax} guests`
                                      : `${rm.maxPax} guest${rm.maxPax === 1 ? '' : 's'}`}
                                  </div>
                                )}
                              </div>
                              <div className="hi-room-photo">
                                {rm.img
                                  ? <HotelImg src={rm.img} size="small" alt={rm.name || rm.code} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                                  : <span className="hi-room-nophoto">{FAC_SVG.bed}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          className="hi-rail-nav hi-rail-nav--next"
                          onClick={() => roomRailRef.current?.scrollBy({ left: 440, behavior: 'smooth' })}
                          aria-label="More room types"
                        >
                          <S size={16} sw={2.5}><path d="M9 18l6-6-6-6" /></S>
                        </button>
                      </div>
                      {hiddenRooms > 0 && (
                        <div className="hi-rooms-more">
                          + {hiddenRooms} further room {hiddenRooms === 1 ? 'type' : 'types'} — search
                          your dates to see the ones available for your stay.
                        </div>
                      )}
                    </section>
                  );
                })()}
              </div>
            )}

            {/* ── FACILITIES ── */}
            {activeTab === 'Facilities' && (
              <div className="tp act">
                {facCategories.length > 0 ? (() => {
                  const CARDS_COLLAPSED = 6;
                  const overflow = facCategories.length > CARDS_COLLAPSED;
                  const shown = showAllFac ? facCategories : facCategories.slice(0, CARDS_COLLAPSED);
                  const anyPaid = facCategories.some((c) => c.items.some((i) => i.isPaid));
                  return (
                    <>
                      <div className="hf-head">
                        <div className="hf-head-icon">{TAB_ICON.Facilities}</div>
                        <div>
                          <h3 className="hf-title">Hotel Facilities</h3>
                          <div className="hf-sub">
                            {facTotal} amenities across {facCategories.length}{' '}
                            {facCategories.length === 1 ? 'category' : 'categories'}
                          </div>
                        </div>
                      </div>

                      {popularFacs.length > 0 && (
                        <section className="hf-section">
                          <h4 className="hf-section-title">Popular facilities</h4>
                          <div className="hf-pop">
                            {popularFacs.map((p) => (
                              <div className="hf-pop-tile" key={p.key}>
                                <div className="hf-pop-icon">{FAC_SVG[p.icon] || FAC_SVG.check}</div>
                                <div className="hf-pop-label">{p.label}</div>
                                {p.count != null && <div className="hf-pop-meta">{p.count}</div>}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      <section className="hf-section">
                        <div className="hf-section-head">
                          <h4 className="hf-section-title">All facilities</h4>
                          {overflow && (
                            <button className="hf-toggle" onClick={() => setShowAllFac((v) => !v)}>
                              {showAllFac ? 'Show less' : `Show all ${facCategories.length} categories`}
                              <S size={14} sw={2.5}><path d={showAllFac ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} /></S>
                            </button>
                          )}
                        </div>

                        <div className="hf-grid">
                          {shown.map((cat) => {
                            const ITEMS_COLLAPSED = 5;
                            const open = openCats.has(cat.key);
                            const items = open ? cat.items : cat.items.slice(0, ITEMS_COLLAPSED);
                            const more = cat.items.length - ITEMS_COLLAPSED;
                            return (
                              <div className={`hf-card hf-card--${cat.key}`} key={cat.key}>
                                <div className="hf-card-head">
                                  <div className="hf-card-icon">{FAC_SVG[cat.icon] || FAC_SVG.check}</div>
                                  <h5 className="hf-card-title">{cat.title}</h5>
                                  <span className="hf-card-count">{cat.items.length}</span>
                                </div>
                                <ul className="hf-list">
                                  {items.map((item) => (
                                    <li className="hf-item" key={item.name}>
                                      <span className="hf-item-tick">{FAC_SVG.check}</span>
                                      <span className="hf-item-name">
                                        {item.name}{item.count ? ` (${item.count})` : ''}
                                      </span>
                                      {item.isPaid && <span className="hf-chip hf-chip--paid">Paid</span>}
                                    </li>
                                  ))}
                                </ul>
                                {more > 0 && (
                                  <button className="hf-more" onClick={() => toggleCat(cat.key)}>
                                    {open ? 'Show less' : `+ ${more} more`}
                                    <S size={13} sw={2.5}><path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} /></S>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      {anyPaid && (
                        <div className="hf-note">
                          <span className="hf-note-icon">{FAC_SVG.info}</span>
                          Facilities marked <span className="hf-chip hf-chip--paid">Paid</span> are
                          available at an additional charge, settled with the hotel.
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <div className="hf-empty">
                    <div className="hf-empty-icon">{TAB_ICON.Facilities}</div>
                    <h3 className="hf-title">Facilities not listed yet</h3>
                    <p className="hf-empty-text">
                      {infoSettled
                        ? `We don't hold a facility list for ${hotelName} yet. Ask us and we'll confirm directly with the hotel.`
                        : 'Loading this hotel’s facilities…'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── WEATHER (commented out for now) ──
            <div className={`tp${activeTab === 'Weather' ? ' act' : ''}`}>
              <h3 className="section-title">
                {TAB_ICON.Weather} Climate
              </h3>
              <div className="ws">
                {WEATHER.map((w) => (
                  <div className={`wc${w.hl ? ' hl' : ''}`} key={w.m}>
                    <div className="wm">{w.m}</div>
                    <div className="wi">{w.i}</div>
                    <div className="wt">{w.t}°</div>
                    <div className="wd">☀ {w.s}h · 🌧 {w.r}d</div>
                  </div>
                ))}
              </div>
            </div>
            */}

            {/* ── MAP (commented out for now) ──
            <div className={`tp${activeTab === 'Map' ? ' act' : ''}`}>
              {info?.latitude && info?.longitude ? (
                <iframe
                  className="map-embed"
                  title="Hotel location"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(info.longitude) - 0.01},${Number(info.latitude) - 0.008},${Number(info.longitude) + 0.01},${Number(info.latitude) + 0.008}&layer=mapnik&marker=${info.latitude},${info.longitude}`}
                  style={{ width: '100%', height: 400, border: 'none', borderRadius: 16 }}
                />
              ) : (
                <div className="mc">
                  <div className="mp"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" className="mpin"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg></div>
                  <div className="mi"><span className="ml">{ICON.pin} {locLabel}</span></div>
                </div>
              )}
              <div className="map-address">
                {ICON.pin} {info?.address ? `${info.address}, ${info?.city || ''}` : locLabel}
              </div>
            </div>
            */}

            {/* ── REVIEWS (commented out for now) ──
            <div className={`tp${activeTab === 'Reviews' ? ' act' : ''}`}>
              <div className="rs reveal">
                <div className="rb">9.3</div>
                <div><div className="rl">Fantastic</div><div className="rn">Based on 247 verified reviews</div></div>
                <div className="rbs">
                  {RATINGS.map((r) => (
                    <div className="rr" key={r.l}>
                      <span className="rrl">{r.l}</span>
                      <div className="rrt"><div className="rrf" style={{ width: reviewsSeen ? `${r.v * 10}%` : 0 }} /></div>
                      <span className="rrv">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rvl">
                {REVIEWS.map((r) => (
                  <div className="rv" key={r.n}>
                    <div className="rvt">
                      <div className="rva">{r.init}</div>
                      <div><div className="rvna">{r.n}</div><div className="rvd">{r.d}</div></div>
                      <div className="rvs">{r.s}</div>
                    </div>
                    <div className="rvx">{r.t}</div>
                  </div>
                ))}
              </div>
            </div>
            */}
          </div>

          {/* Booking sidebar */}
          <aside>
            <div className="bk">
              {/* bkr review score removed — no real review data yet */}
              <div className="bkp">
                <div className="bkpl">{liveTotal != null ? `live price · ${pd?.day} ${pd?.date}` : fromPP != null ? 'per person from' : 'no price yet'}</div>
                <div className="bkpr hd">{liveTotal != null
                  ? <>{ccy}{liveTotal.toLocaleString('en-GB')}</>
                  : fromPP != null ? <>{ccy}{fromPP} <span>p.p.</span></> : <span className="bkpr-none">Pick a date</span>}</div>
                <div className="bkp-total">
                  {liveTotal != null
                    ? `${liveRoom ? 'Room' : ''}${liveRoom && liveFlight ? ' + flight' : liveFlight ? 'Flight' : ''} · ${sAdults} ${Number(sAdults) === 1 ? 'adult' : 'adults'}`
                    : displayTotal != null
                      ? `${ccy}${displayTotal.toLocaleString('en-GB')} total · ${ovPax} traveller${ovPax > 1 ? 's' : ''}`
                      : `Pick a day in the calendar to price ${ovPax} traveller${ovPax > 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="bkd">
                <div className="bkdi"><span className="bkdk">{ICON.cal}</span>{(() => {
                  const ci = pd?.iso || baseCheckIn;
                  const co = ci ? addDaysISO(ci, nights) : baseCheckOut;
                  const short = (iso) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
                  return short(ci) && short(co) ? `${short(ci)} — ${short(co)}` : 'Select your dates above';
                })()}</div>
                <div className="bkdi"><span className="bkdk">{ICON.users}</span>{Number(sAdults) || 2} adult{(Number(sAdults) || 2) > 1 ? 's' : ''}{Number(sChildren) > 0 ? `, ${sChildren} child${Number(sChildren) > 1 ? 'ren' : ''}` : ''}</div>
                {/* The route the traveller actually chose — this printed "Brussels (BRU)"
                    no matter which airport the fares were searched from. */}
                <div className="bkdi"><span className="bkdk">{transport === 'hotel_only' ? ICON.bed : ICON.plane}</span>{transport === 'hotel_only'
                  ? 'Hotel only'
                  : destination ? `${airportName(origin)} (${origin}) → ${destination}` : `${airportName(origin)} (${origin})`}</div>
                <div className="bkdi"><span className="bkdk">{ICON.board}</span>{hotel?.board || 'All inclusive'}</div>
                <div className="bkdi"><span className="bkdk">{ICON.moon}</span>{dayLabel(nights)}</div>
              </div>
              <div className="bkcw">
                <button className="bkc" onClick={goCheckout} disabled={liveFlights?.loading || dayUnavailable}>
                  {liveFlights?.loading ? 'Checking flights…'
                    : dayUnavailable ? <>Not available for this date</>
                    : liveTotal == null ? <>Check availability {ICON.arrow}</>
                    : <>Book Now {ICON.arrow}</>}
                </button>
                <div className="bkc-note">{ICON.check} Secure payment · {ICON.check} Instant confirmation</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="mbar">
        <div className="mbi">
          <div className="mbp"><small>{liveTotal != null ? 'live total' : fromPP != null ? 'per person from' : 'no price yet'}</small>{liveTotal != null
            ? `${ccy}${liveTotal.toLocaleString('en-GB')}` : fromPP != null ? `${ccy}${fromPP}` : '—'}</div>
          <button className="mbc" onClick={goCheckout} disabled={liveFlights?.loading || dayUnavailable}>
            {liveFlights?.loading ? 'Checking…' : dayUnavailable ? 'Not available' : `${liveTotal != null ? 'Book now' : 'Check price'} →`}
          </button>
        </div>
      </div>

      {/* Categorized photo explorer — the admin dashboard's image categories
          (General, Rooms, Pool, Beach…) as a full-screen light gallery. */}
      {explorer && photoCats && (
        <div className="px-overlay" role="dialog" aria-modal="true" aria-label={`${hotelName} photos`}>
          <div className="px-head">
            <div className="px-title">
              <span className="px-eyebrow">Photo gallery</span>
              <h2 className="px-name hd">{hotelName}</h2>
            </div>
            <span className="px-count hd">{photoCount} photos</span>
            <button className="px-close" onClick={() => setExplorer(false)} aria-label="Close gallery" autoFocus>
              <S size={20} sw={2.2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
            </button>
          </div>

          <div className="px-cats">
            <button className={`px-cat${explorerCat === 'ALL' ? ' active' : ''}`} onClick={() => setExplorerCat('ALL')}>
              {ICON.gallery} All photos <em>{photoCount}</em>
            </button>
            {photoCats.map((c) => (
              <button key={c.code} className={`px-cat${explorerCat === c.code ? ' active' : ''}`} onClick={() => setExplorerCat(c.code)}>
                {PHOTO_TYPE_ICONS[c.code]} {c.label} <em>{c.imgs.length}</em>
              </button>
            ))}
          </div>

          {/* Keyed on the active category so switching chips starts at the top,
              not wherever the previous (longer) list was scrolled to. */}
          <div className="px-body" key={explorerCat}>
            {(explorerCat === 'ALL' ? photoCats : photoCats.filter((c) => c.code === explorerCat)).map((c) => (
              <section className="px-sec" key={c.code}>
                <div className="px-sec-head">
                  <span className="px-sec-ic">{PHOTO_TYPE_ICONS[c.code]}</span>
                  <h3 className="px-sec-title hd">{c.label}</h3>
                  <em className="px-sec-count">{c.imgs.length} photo{c.imgs.length === 1 ? '' : 's'}</em>
                  <span className="px-sec-rule" />
                </div>
                <div className="px-grid">
                  {c.imgs.map((src, i) => (
                    <button
                      className="px-ph" key={`${c.code}-${i}`}
                      onClick={() => openLightbox(c.imgs, i, c.label)}
                      style={{ animationDelay: `${Math.min(i * 0.045, 0.45)}s` }}
                      aria-label={`${c.label} photo ${i + 1}`}
                    >
                      <HotelImg src={src} size="bigger" alt={`${hotelName} — ${c.label} ${i + 1}`} loading="lazy" onError={(e) => { e.currentTarget.closest('button').style.display = 'none'; }} />
                      <span className="px-zoom"><S size={15} sw={2.2}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></S></span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightbox && (
        <div className="lb-overlay" onClick={closeLightbox}>
          <div className="lb-counter">{lightbox.i + 1} / {lightbox.imgs.length}{lightbox.label ? ` · ${lightbox.label}` : ''}</div>
          <button className="lb-close" onClick={closeLightbox} aria-label="Close">
            <S size={22} sw={2.2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
          </button>
          <button className="lb-nav lb-prev" onClick={prevImg} aria-label="Previous">
            <S size={26} sw={2.2}><path d="M15 18l-6-6 6-6" /></S>
          </button>
          <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
            {/* Full-screen inspection — request `original` (2048x1365), the sharpest source. If
                a given image lacks it, HotelImg steps down (bigger → default) rather than
                failing to open, which is what happened before for some hotels. */}
            {/* …and when even `default` 404s, the stage shows the illustration rather than
                an empty black frame. */}
            <div className="lb-frame">
              <HeroPhoto className="lb-img" key={`${lightbox.label}-${lightbox.i}`} src={lightbox.imgs[lightbox.i]} seed={`${hotelCode}-lb`} size="original" alt={`${hotelName} photo ${lightbox.i + 1}`} />
            </div>
          </div>
          <button className="lb-nav lb-next" onClick={nextImg} aria-label="Next">
            <S size={26} sw={2.2}><path d="M9 18l6-6-6-6" /></S>
          </button>
          <div className="lb-thumbs" onClick={(e) => e.stopPropagation()}>
            {lightbox.imgs.map((src, i) => (
              <button key={i} className={`lb-thumb${i === lightbox.i ? ' active' : ''}`} onClick={() => setLightbox((lb) => ({ ...lb, i }))}>
                {/* The strip thumbnails are ~64px — `small` is all they need. A dead thumb
                    hides rather than showing a torn-image glyph. */}
                <HotelImg src={src} size="small" alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Flight modal — every control here acts on the live result set. The groups are built
          from `facets`, which only offers a filter that can actually change the list, so a
          one-way search shows no return-time group and an all-direct set shows no stopover box. */}
      <div className={`modal-overlay${modalOpen ? ' show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Choose your flights</div>
            {/* On a phone the filter rail is a sheet, so it needs a way in. The count says
                whether anything is currently narrowing the list. */}
            <button className={`modal-filter-toggle${activeFilterCount ? ' on' : ''}`}
              onClick={() => setFilterSheet((v) => !v)}>
              <S size={15} sw={2.2}><path d="M4 6h16M7 12h10M10 18h4" /></S>
              Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
            </button>
            <div className="modal-sort">
              <label htmlFor="fsort">Sort:</label>
              <select id="fsort" value={fSort} onChange={(e) => setFSort(e.target.value)}>
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <button className="modal-close" onClick={() => setModalOpen(false)}>
              <S sw={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
            </button>
          </div>
          <div className={`modal-body${filterSheet ? ' filters-open' : ''}`}>
            <div className="modal-sidebar">
              <div className="modal-filter-head">
                <span className="modal-filter-heading">Filters</span>
                {activeFilterCount > 0 && (
                  <button type="button" className="modal-filter-clear" onClick={clearFlightFilters}>Reset all</button>
                )}
              </div>

              {/* Sort lives here as well as in the header — same state, two places to reach it,
                  because on a long list the sidebar is what stays in view. */}
              <div className="modal-filter-group">
                <div className="modal-filter-title">Sort by</div>
                <select className="mf-select" value={fSort} onChange={(e) => setFSort(e.target.value)} aria-label="Sort flights">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              {facets.type && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">
                    Flight type
                    <FilterHint text="Direct flights have no stopover in either direction." />
                  </div>
                  {[
                    { id: 'direct', label: 'Direct flights',    count: facets.type.direct },
                    { id: 'stops',  label: 'Flights with stop(s)', count: facets.type.stops },
                    { id: 'all',    label: 'All flights',       count: facets.type.all },
                  ].map((o) => (
                    <label key={o.id} className={`modal-filter-opt${fType === o.id ? ' checked' : ''}`}>
                      <input type="checkbox" className="mf-input" checked={fType === o.id}
                        onChange={() => setFType(o.id)} />
                      <span className="modal-filter-cb" aria-hidden="true">
                        {fType === o.id && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}
                      </span>
                      <span className="mfo-label">{o.label}</span>
                      <span className="mfo-count">{o.count}</span>
                    </label>
                  ))}
                </div>
              )}

              {facets.baggage && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">
                    Baggage
                    <FilterHint text="Checked baggage in the fare. Every fare here allows a cabin bag." />
                  </div>
                  {[
                    { id: 'included', label: 'Include baggage', count: facets.baggage.included },
                    { id: 'excluded', label: 'Exclude baggage', count: facets.baggage.excluded },
                  ].map((o) => (
                    <label key={o.id} className={`modal-filter-opt${fBaggage === o.id ? ' checked' : ''}`}>
                      <input type="checkbox" className="mf-input" checked={fBaggage === o.id}
                        onChange={() => setFBaggage((v) => (v === o.id ? 'any' : o.id))} />
                      <span className="modal-filter-cb" aria-hidden="true">
                        {fBaggage === o.id && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}
                      </span>
                      <span className="mfo-label">{o.label}</span>
                      <span className="mfo-count">{o.count}</span>
                    </label>
                  ))}
                </div>
              )}

              {outSpan && (
                <TimeRangeFilter
                  title="Departure time - Outbound"
                  hint="The time your outbound flight leaves, local to the departure airport."
                  span={outSpan}
                  value={outRange}
                  onChange={setFOutRange}
                />
              )}

              {retSpan && (
                <TimeRangeFilter
                  title="Departure time - Return"
                  hint="The time your return flight leaves the destination."
                  span={retSpan}
                  value={retRange}
                  onChange={setFRetRange}
                />
              )}

              {facets.airlines.length > 0 && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">
                    Airlines
                    <FilterHint text="A flight is kept when any of its legs is flown by a ticked airline." />
                    <button type="button" className="mf-link"
                      onClick={() => setFAirlines(fAirlines.length === facets.airlines.length
                        ? [] : facets.airlines.map((a) => a.code))}>
                      {fAirlines.length === facets.airlines.length ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  {(showAllAirlines ? facets.airlines : facets.airlines.slice(0, AIRLINES_COLLAPSED)).map((a) => (
                    <label key={a.code} className={`modal-filter-opt${fAirlines.includes(a.code) ? ' checked' : ''}`}>
                      <input type="checkbox" className="mf-input" checked={fAirlines.includes(a.code)}
                        onChange={() => toggleAirline(a.code)} />
                      <span className="modal-filter-cb" aria-hidden="true">
                        {fAirlines.includes(a.code) && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}
                      </span>
                      <span className="mfo-airline">
                        <AirlineMark code={a.code} className="mfo-airmark" nameClassName="mfo-airname" />
                      </span>
                      <span className="mfo-count">{a.count}</span>
                    </label>
                  ))}
                  {facets.airlines.length > AIRLINES_COLLAPSED && (
                    <button type="button" className="mf-more" onClick={() => setShowAllAirlines((v) => !v)}>
                      {showAllAirlines ? 'Show less' : `Show more (${facets.airlines.length - AIRLINES_COLLAPSED})`}
                      <S size={13} sw={2.4} className={showAllAirlines ? 'mf-more-up' : ''}><path d="M6 9l6 6 6-6" /></S>
                    </button>
                  )}
                </div>
              )}

              {!facets.type && !facets.baggage && !facets.airlines.length && !outSpan && !retSpan && (
                <div className="modal-filter-none">
                  All {allFlights.length} flight{allFlights.length === 1 ? '' : 's'} share the same
                  times, stops, airline and baggage, so there is nothing to filter on.
                </div>
              )}

              {/* The list filters as you tick, so this is not an "apply" — it says what the
                  current filters have left, and on a phone it closes the filter sheet. */}
              <div className="modal-filter-foot">
                <button type="button" className="mf-apply" onClick={() => setFilterSheet(false)}>
                  Show {modalFlights.length} flight{modalFlights.length === 1 ? '' : 's'}
                </button>
                <div className="mf-found">
                  {modalFlights.length === allFlights.length
                    ? `${allFlights.length} flight${allFlights.length === 1 ? '' : 's'} found`
                    : `${modalFlights.length} of ${allFlights.length} flights match`}
                </div>
              </div>
            </div>

            <div className="modal-flights">
              {/* What the figures on these cards are, said once at the top rather than
                  guessed at per card. The fare is the whole party's, taxes in; the coloured
                  note on each card is what switching to it does to the package total. */}
              <div className="modal-price-note">
                {ICON.info}
                <span>
                  Prices are the flight fare for <b>all travellers</b>, taxes and fees included.
                  Each card shows what choosing it would do to your package price.
                </span>
              </div>
              {modalFlights.length ? modalFlights.map((f) => (
                <FlightCard
                  key={f.idx}
                  f={{ ...f, price: Math.round(f.totalPrice), delta: cheapestFare == null ? null : f.totalPrice - cheapestFare }}
                  selected={selectedFlight === f.idx}
                  // `flights` is sorted cheapest-first and `idx` is the position in THAT
                  // array, so it survives the modal's own sorting and filtering — the green
                  // frame stays on the genuinely cheapest fare, not on whatever is top.
                  cheapest={f.idx === 0}
                  option={{
                    impact: selectedFare == null || f.totalPrice == null
                      ? null : Math.round(f.totalPrice - selectedFare),
                  }}
                  onSelect={() => setSelectedFlight(f.idx)}
                />
              )) : (
                <div className="live-empty">
                  {ICON.plane} No flights match these filters.
                  <button type="button" className="modal-filter-clear" onClick={clearFlightFilters}>Clear all filters</button>
                </div>
              )}
            </div>
          </div>
          <div className="modal-save-bar">
            <button className="modal-save-btn" onClick={() => setModalOpen(false)}>Save {ICON.arrow}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
