import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axiosInstance from '../../services/axiosInstance';
import { fetchFavouriteCodes, addFavourite, removeFavourite } from '../../api';
import { rememberDestCode } from '../../utils/favDest';
import HotelImg from '../../components/HotelImg/HotelImg';
import HotelPhotoFallback from '../../components/HotelPhotoFallback/HotelPhotoFallback';
import { groupRoomsByBoard, boardCount } from '../../utils/roomBoards';
import { rateDetails } from '../../utils/rateDetails';
import {
  splitRoundTrip, flightFacets, applyFlightFilters, sortFlights, SORTS,
} from '../../utils/flightFilters';
import { formatReview, scoreWord, scoreBand } from '../../utils/reviewBadge';
import { airportName, airlineName, flightNumber } from '../../utils/flightNames';
import RatingMarks from '../../components/RatingMarks/RatingMarks';
import ShareSheet from '../../components/ShareSheet/ShareSheet';
import StayBar from '../../components/StayBar/StayBar';
import { ratingLabel } from '../../utils/rating';
import { useToast } from '../../context/ToastContext';
import './HotelDetail.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';
const DEFAULT_ORIGIN = 'BRU'; // departure airport the flight search starts from

/* Turn a failed supplier call into something a traveller can act on.
 * axios reports its own internals — "timeout of 15000ms exceeded", "Network Error",
 * "Request failed with status code 502" — and these were being printed verbatim on the
 * booking page. A shopper cannot do anything with a millisecond count; they need to know
 * whether to wait, retry, or change their dates. `what` names the thing being searched. */
const friendlyError = (e, what) => {
  const msg = String(e?.message || '');
  const status = e?.response?.status;
  if (e?.code === 'ECONNABORTED' || /timeout/i.test(msg)) {
    return `The ${what} search is taking longer than usual. Suppliers can be slow at busy times — please try again.`;
  }
  if (e?.code === 'ERR_NETWORK' || /network error/i.test(msg)) {
    return `We couldn’t reach the ${what} service. Check your connection and try again.`;
  }
  if (status === 429) return `A lot of searches are running right now. Please wait a moment and try again.`;
  if (status >= 500) return `The ${what} service is having trouble at the moment. Please try again shortly.`;
  // Our own API writes its messages for people; anything else is an internal string.
  const fromServer = e?.response?.data?.message;
  return fromServer || `We couldn’t load ${what} for these dates. Please try again.`;
};
// Hotelbeds 400s on a child with no age, so a newly-added child gets this until asked.
const CHILD_AGE_DEFAULT = 8;
// Departure airports offered in the "Transport" filter — the agency's catchment.
const ORIGINS = ['BRU', 'CRL', 'AMS', 'EIN', 'RTM', 'NRN', 'DUS'];
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
// Today, as a local ISO date. This is the floor for paging the fare strip backwards — the
// traveller can walk back to the current week and no further, because a departure that has
// already happened cannot be sold. Built from LOCAL parts for the same reason addDaysISO is:
// toISOString() would hand back yesterday for anyone east of Greenwich.
const todayISO = () => {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// Days shown at once. The cache endpoint returns exactly this many, forward from the check-in
// it is given, so a "week" of the strip and one request are the same thing.
const CAL_DAYS = 7;
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(s);
};
const fmtDur = (min) => { const m = Number(min); if (!m || m <= 0) return ''; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
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
  clock: <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
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

// The live availability response carries no baggage/service fields, but these are bundled
// Airtuerk package fares (the card's "Including" fare type) — checked baggage, a cabin bag,
// a meal and a seat are the standard inclusion for them. Shown on the card as fare inclusions.
const FLIGHT_INCLUSIONS = [
  { icon: ICON.bag, label: 'Cabin bag' },
  { icon: ICON.checkedBag, label: 'Checked baggage' },
  { icon: ICON.board, label: 'Meal on board' },
  { icon: ICON.seat, label: 'Seat included' },
];

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
const FACILITIES = ['Swimming pool', 'Private beach', 'Restaurant', 'Spa & wellness', 'Fitness center', 'Pool bar', 'Free WiFi', 'Air conditioning', 'Elevator', 'Free parking', 'Room service', 'Fine dining'];
const MORE_FACILITIES = ['Tennis court', 'Bike rental', 'Water sports', 'Babysitting', 'Business center', 'Live music'];
const FAC_ICON = {
  'Swimming pool': <S sw={2}><path d="M2 20c.9-.4 1.8-.6 2.8-.6 1.8 0 3.5.9 5.2.9s3.5-.9 5.2-.9 3.5.9 5.2.9c.9 0 1.8-.2 2.8-.6" /><path d="M2 16c.9-.4 1.8-.6 2.8-.6 1.8 0 3.5.9 5.2.9s3.5-.9 5.2-.9 3.5.9 5.2.9c.9 0 1.8-.2 2.8-.6" /><path d="M8 14V6a2 2 0 012-2h0a2 2 0 012 2v3" /></S>,
  'Free WiFi': <S sw={2}><path d="M5 12.55a11 11 0 0114.08 0" /><path d="M1.42 9a16 16 0 0121.16 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></S>,
  'Restaurant': <S sw={2}><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
};
const WEATHER = [
  { m: 'Jan', i: '🌧️', t: 12, s: 4, r: 12 }, { m: 'Feb', i: '🌧️', t: 13, s: 5, r: 10 },
  { m: 'Mar', i: '⛅', t: 15, s: 6, r: 8 }, { m: 'Apr', i: '🌤️', t: 18, s: 8, r: 5 },
  { m: 'May', i: '☀️', t: 23, s: 10, r: 3, hl: true }, { m: 'Jun', i: '☀️', t: 28, s: 12, r: 1 },
  { m: 'Jul', i: '☀️', t: 31, s: 13, r: 0 }, { m: 'Aug', i: '☀️', t: 31, s: 12, r: 0 },
  { m: 'Sep', i: '☀️', t: 27, s: 10, r: 2 }, { m: 'Oct', i: '🌤️', t: 22, s: 7, r: 6 },
  { m: 'Nov', i: '⛅', t: 17, s: 5, r: 10 }, { m: 'Dec', i: '🌧️', t: 13, s: 3, r: 13 },
];
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
  return (
    <div className="bp-journey">
      <div className="bp-jhead">
        <span className="bp-dir">{dir === 'Return' ? ICON.arrowBack : ICON.plane}<span>{dir}</span></span>
        <span className="bp-jdate">{fmtDateLong(first.departure)}</span>
        <span className="bp-airline">
          <span className="bp-airmark" aria-hidden="true">{airlineName(first.airline).charAt(0)}</span>
          <span className="bp-airname">{airlineName(first.airline)}</span>
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
          <div className="bp-time">{fmtTime(last.arrival)}</div>
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
              <div className="fd-seg-meta"><span className="fd-seg-air"><span className="fd-seg-mark">{airlineName(leg.airline).charAt(0)}</span>{airlineName(leg.airline)} · {flightNumber(leg)}</span><span className="fd-seg-dur">{fmtDur(leg.duration)}</span></div>
              <div className="fd-seg-row"><span className="fd-seg-airport">{airportName(leg.to)} <em>{leg.to}</em></span><span className="fd-seg-time">{fmtTime(leg.arrival)}</span></div>
            </div>
          </div>
        </div>
      ))}
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
 * Room placeholder, built on the REAL card's own classes (`room-group-head`, `room-group-meta`,
 * `room-option`, `room-info`, `room-price-col`).
 *
 * The previous version drew its own boxes — a 44px avatar the card doesn't have, and flat rows
 * with none of the card's structure — so the block visibly re-laid-out the moment rates landed.
 * Borrowing the layout classes means the placeholder is the card's geometry by construction and
 * cannot drift from it again when the card changes.
 *
 * `rows` varies per card so the wait doesn't look like N identical stamped copies.
 */
function RoomCardSkeleton({ rows = 2, i = 0 }) {
  return (
    <div className="room-group sk-card" aria-hidden="true" style={{ '--i': i }}>
      <div className="room-group-head">
        <div className="room-group-id"><Sk w={172} h={15} /><Sk w={58} h={15} r={999} /></div>
        <div className="room-group-from"><Sk w={52} h={12} /><Sk w={70} h={13} /></div>
      </div>
      {/* Two facts, matching the real meta line (occupancy + length) — it used to draw three,
          which left the block visibly reflowing when the third never arrived. */}
      <div className="room-group-meta">
        <Sk w={88} h={12} /><Sk w={64} h={12} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="room-option sk-room-option" key={i}>
          <Sk w={20} h={20} r={999} />
          <div className="room-info">
            <Sk w={i === 0 ? 128 : 154} h={14} />
            <Sk w={102} h={11} style={{ marginTop: 7 }} />
            <div className="sk-chips"><Sk w={i === 0 ? 168 : 116} h={22} r={999} /><Sk w={78} h={22} r={999} /></div>
          </div>
          {/* Price, then the "vs cheapest" delta on every row but the first — the real card
              shows no delta on its own cheapest board. */}
          <div className="room-price-col">
            <Sk w={74} h={30} r={999} />
            {i > 0 && <Sk w={86} h={11} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonBlock({ label, children }) {
  return (
    <div className="sk-wrap" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="sk-note"><span className="live-spin" /> {label}</div>
      {children}
    </div>
  );
}

function FlightCard({ f, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const out = f.outLegs || [];
  const ret = f.retLegs || [];
  const hasDetails = out.length > 0;

  return (
    <div className={`flight-card${selected ? ' selected' : ''}${expanded ? ' expanded' : ''}`}>
      <div className="bp-body">
        <Journey dir="Outbound" legs={out} />
        {ret.length > 0 && (<><div className="bp-tear" /><Journey dir="Return" legs={ret} /></>)}
      </div>

      <div className="bp-incl" aria-label="Included in this fare">
        {FLIGHT_INCLUSIONS.map((x) => (
          <span key={x.label} className="bp-chip">{x.icon}{x.label}</span>
        ))}
      </div>

      <div className="flight-bottom">
        <button className="flight-details-btn" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }} disabled={!hasDetails}>
          {expanded ? 'Hide flight details' : 'View flight details'}
        </button>
        <div className="bp-buy">
          <div className="bp-price">
            {f.price != null && <b className="live-price">€{f.price.toLocaleString('en-GB')}</b>}
            {/* What this fare costs ON TOP of the cheapest one on offer. Absolute prices are
                hard to rank at a glance when every card reads "€1,969"; the gap is the number
                the traveller is actually deciding on. `delta === 0` is the cheapest itself. */}
            {f.delta === 0 && <span className="bp-delta bp-delta-best">{ICON.spark} Lowest fare</span>}
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
  const paramNights = state?.nights || Number(qp('nights')) || 7;
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
  const sAdults   = String(ovr.adults   ?? state?.adults   ?? (qp('adults')   || '2'));
  const sChildren = String(ovr.children ?? state?.children ?? (qp('children') || '0'));
  const sRooms    = String(ovr.rooms ?? state?.rooms  ?? (qp('rooms')  || '1'));
  // children's ages (csv) — HotelBeds requires an age per child for availability
  const paramChildAges = String(ovr.childAges ?? state?.childAges ?? qp('childAges'));
  // Trim/pad the age list to the chosen child count — HB 400s on a child with no age.
  const sChildAges = (() => {
    const n = parseInt(sChildren, 10) || 0;
    if (!n) return '';
    const ages = paramChildAges.split(',').map((a) => a.trim()).filter(Boolean);
    return Array.from({ length: n }, (_, i) => ages[i] || String(CHILD_AGE_DEFAULT)).join(',');
  })();
  // Departure airport — the traveller can fly from a different one (was hardcoded BRU).
  const origin = ovr.origin ?? DEFAULT_ORIGIN;
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
  const [reviewsSeen, setReviewsSeen] = useState(false);
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
  // airport→hotel transfer add-on: everything is derived from the page context
  // (airport = flight-search destination, hotel = this page's HotelBeds/ATLAS code)
  const [liveTransfers, setLiveTransfers] = useState(null); // {loading?|error?|services[]}
  const [selectedTransfer, setSelectedTransfer] = useState(-1); // -1 = no transfer (opt-in)

  // scroll-reveal
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.reveal:not(.vis)') || [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [activeTab]);

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
  const winStart = (win.base === baseCheckIn && win.start) ? win.start : notBeforeToday(baseCheckIn);
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
    // display fallbacks, so the recipient never sees "Hotel 123456" while the record loads
    put('name', hotelName);         put('loc', locLabel);
    put('stars', stars || '');      put('currency', hotel?.currency || '');
    put('total', hotel?.totalAmount);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const q = qs.toString();
    return `${origin}/hotel/${hotelCode}${q ? `?${q}` : ''}`;
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
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [filtersTouched, baseCheckIn, baseCheckOut, sAdults, sChildren, sRooms, sChildAges, nights]);

  // Only a REAL "from" figure goes in the message; `stayFrom` already refuses the €0 the price
  // cache returns for an uncosted day and the total of a search that has since been edited.
  const shareFrom = fromPP;
  const shareDates = shareCheckIn
    ? `${calDate(shareCheckIn)}${shareCheckOut ? ` – ${calDate(shareCheckOut)}` : ''}`
    : '';
  const sharePax = `${Number(sAdults) || 2} adult${(Number(sAdults) || 2) > 1 ? 's' : ''}${Number(sChildren) > 0 ? `, ${sChildren} child${Number(sChildren) > 1 ? 'ren' : ''}` : ''}`;
  const shareMeta = [shareDates, `${nights} days`, sharePax].filter(Boolean).join(' · ');
  const shareText = [
    `${hotelName} — ${locLabel}`,
    shareMeta,
    shareFrom != null ? `from ${ccy}${shareFrom} p.p.` : '',
  ].filter(Boolean).join('\n');

  // live selection → live price shown in the Book Now card / mobile bar / checkout
  const liveRoom = liveRooms?.rooms?.length ? liveRooms.rooms[selectedRoom.live ?? 0] : null;

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
  const facets = useMemo(() => flightFacets(allFlights), [allFlights]);
  const [fSort, setFSort] = useState('price');
  const [fOut, setFOut] = useState([]);
  const [fRet, setFRet] = useState([]);
  const [fDirect, setFDirect] = useState(false);

  const modalFlights = useMemo(() => {
    const tagged = allFlights.map((f, idx) => ({ ...f, idx }));
    return sortFlights(applyFlightFilters(tagged, { outbound: fOut, return: fRet, direct: fDirect }), fSort);
  }, [allFlights, fOut, fRet, fDirect, fSort]);

  const activeFilterCount = fOut.length + fRet.length + (fDirect ? 1 : 0);
  const clearFlightFilters = () => { setFOut([]); setFRet([]); setFDirect(false); };
  const toggleBand = (setter) => (id) =>
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  // A filter set that survives one search rarely fits the next — reset when results change.
  useEffect(() => { clearFlightFilters(); }, [allFlights]);

  const liveTransfer = (selectedTransfer >= 0 && liveTransfers?.services?.length)
    ? liveTransfers.services[selectedTransfer] : null;
  const transferPrice = liveTransfer ? Math.round(liveTransfer.price || 0) : 0;
  const liveTotal = liveRoom ? Math.round((liveRoom.price || 0) + (liveFlight?.totalPrice || 0) + transferPrice) : null;
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
    setOvr((p) => ({ ...p, ...patch }));
    // Every live result was priced under the OLD parameters, so it goes — a rate fetched for
    // dates the traveller has just changed must never stay on screen, let alone be bookable.
    setLiveChecked(false);
    setLiveRooms(null);
    setLiveFlights(null);
    setLiveTransfers(null);
    setSelectedTransfer(-1);
    // The PICKED DAY is a different matter. Changing the departure airport or a child's age
    // doesn't move the stay, and changing its length doesn't move the departure day — the day
    // is still in the strip, so clearing it made the traveller re-pick for nothing. Only a
    // change of check-in (or of who is travelling, which re-prices every day) drops it.
    const keepsTheDay = Object.keys(patch).every((k) => k === 'origin' || k === 'childAges' || k === 'nights');
    if (!keepsTheDay) setSelectedISO(null);
  };
  const resetFilters = () => { setOvr({}); setSelectedISO(null); setWin({ base: null, start: null }); setLiveChecked(false); setLiveRooms(null); setLiveFlights(null); setLiveTransfers(null); setSelectedTransfer(-1); setCheckedEmpty(new Set()); };

  const ovBase = liveTotal != null ? Math.round((liveRoom.price || 0) + (liveFlight?.totalPrice || 0)) : null;

  // ── shared flight fetch (used on mount + day-click) ──
  const fetchFlights = (checkin, checkout) => {
    if (!destination) { setLiveFlights(null); return; }
    setLiveFlights({ loading: true });
    axiosInstance.post('/flight-availability/search', {
      from: origin, to: destination, depdate: checkin, retdate: checkout,
      adults: Number(sAdults) || 2, children: Number(sChildren) || 0, infants: 0,
    }).then(({ data }) => {
      console.log('[Detail] flight-availability response', data?.results);
      const raw = data?.results?.airtuerk?.flights || [];
      const originCode = origin.toUpperCase();
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
            const split = splitRoundTrip(outLegs, origin);
            outLegs = split.outLegs; retLegs = split.retLegs;
          }
          return {
            totalPrice: f.totalPrice || 0,
            currency: f.currency || 'EUR',
            outLegs, retLegs,
            stops: Math.max(outLegs.length - 1, retLegs.length - 1, 0),
            fareBreakdown: f.fareBreakdown || [],
            flightKeys: keysOf(f),
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
          if ((legs[0].from || '').toUpperCase() === originCode) outs.push(f);
          else if ((legs[legs.length - 1].to || '').toUpperCase() === originCode) ins.push(f);
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
      flights.sort((a, b) => a.totalPrice - b.totalPrice);
      setSelectedFlight(0);
      setLiveFlights({ flights, cheapest: data?.results?.cheapest || null });
    }).catch((e) => setLiveFlights({ error: friendlyError(e, 'flight') }));
  };

  // ── shared transfer fetch — NO manual codes: airport comes from the flight
  //    search destination, the hotel is this page's code (= HotelBeds ATLAS code).
  //    `pickupISO` is the pickup datetime — ideally the selected flight's ARRIVAL
  //    time (the rateKey encodes it, so it becomes the booked pickup time). Falls
  //    back to midday on the check-in date until a flight is known. ──
  const lastTransferPickupRef = useRef(null);
  const fetchTransfers = (checkin, pickupISO = null) => {
    if (!destination || !hotelCode || !checkin) { setLiveTransfers(null); return; }
    const validISO = pickupISO && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(pickupISO)
      ? pickupISO.slice(0, 16) + ':00'
      : `${checkin}T12:00:00`;
    if (lastTransferPickupRef.current === validISO && liveTransfers?.services) return; // same datetime → keep results
    lastTransferPickupRef.current = validISO;
    setLiveTransfers({ loading: true });
    axiosInstance.post('/transfer-availability/search', {
      fromType: 'IATA', fromCode: destination,
      toType: 'ATLAS', toCode: String(hotelCode),
      outbound: validISO,
      adults: Number(sAdults) || 2, children: Number(sChildren) || 0, infants: 0,
    }).then(({ data }) => {
      const services = data?.results?.hotelbeds?.services || [];
      setSelectedTransfer(-1);
      setLiveTransfers({ services, pickupISO: validISO });
    }).catch((e) => setLiveTransfers({ error: friendlyError(e, 'transfer') }));
  };

  // ── fetch flights + transfers on mount using dates from results screen ──
  useEffect(() => {
    if (baseCheckIn && destination) {
      fetchFlights(baseCheckIn, baseCheckOut);
      fetchTransfers(baseCheckIn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: the TripAdvisor rating is NOT fetched on mount. It comes only from the live
  // availability API, and firing that call on every page open — before the traveller has
  // engaged with anything — is exactly the kind of eager live-supplier hit we avoid. The
  // rating instead rides on the availability response that the FIRST date selection already
  // triggers (see checkAvailability), so the badge appears once live prices are being loaded and costs
  // no extra supplier call.

  // ── keep the transfer pickup aligned with the SELECTED flight's arrival time —
  //    when the customer picks a different flight, the transfer availability is
  //    re-fetched at that flight's landing datetime ──
  const selectedArrivalISO = (() => {
    const legs = liveFlights?.flights?.[selectedFlight]?.outLegs;
    const arr = legs?.length ? legs[legs.length - 1]?.arrival : null;
    return arr && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(arr)) ? String(arr).slice(0, 16) + ':00' : null;
  })();
  useEffect(() => {
    if (!selectedArrivalISO) return;
    fetchTransfers(selectedArrivalISO.slice(0, 10), selectedArrivalISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArrivalISO]);

  const pickDay = (iso) => {
    if (!iso || checkedEmpty.has(iso)) return;
    setSelectedISO(iso);
    setLiveChecked(false);
    setLiveRooms(null);
    setLiveFlights(null);
    // A day the cache never costed goes straight to the supplier — there is no estimate to
    // show, so making the traveller press a second button would tell them nothing.
    if (!Number(byDate[iso]?.price)) {
      setTimeout(() => checkAvailabilityForDay(iso), 0);
    }
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
    }).then(({ data }) => {
      console.log('[Detail] hotel-availability response', data?.results);
      const hb = data?.results?.hotelbeds, dn = data?.results?.diana;
      const dianaHotelId = dn?.dianaHotelId ?? dn?.hotelId ?? null;
      const rooms = [
        ...((hb?.rooms) || []).map((r) => ({ ...r, supplier: 'hotelbeds' })),
        ...((dn?.rooms) || []).map((r) => ({ ...r, supplier: 'diana', dianaHotelId })),
      ].map((r) => ({
        name: r.roomName || 'Room', board: r.boardName || r.boardCode || '',
        price: r.sellingRate ?? r.net ?? r.price ?? null, currency: r.currency || 'EUR', supplier: r.supplier,
        refundable: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies.length === 0 : undefined,
        cancellation: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies : [],
        rateKey: r.rateKey || null, roomCode: r.roomCode || null, boardCode: r.boardCode || null,
        net: r.net ?? null, dianaHotelId: r.dianaHotelId || null,
      })).filter((r) => r.price != null).sort((a, b) => a.price - b.price);
      setSelectedRoom((p) => ({ ...p, live: 0 }));
      const cheapest = data?.results?.cheapest || null;
      setLiveRooms({ rooms, cheapest });
      if (rooms.length === 0 && (!cheapest || !Number(cheapest.price))) {
        setCheckedEmpty((prev) => new Set(prev).add(checkin));
      }
      if (data?.review) setReview((prev) => prev ?? data.review);
    }).catch((e) => setLiveRooms({ error: friendlyError(e, 'room') }));

    // Live flights + transfers for the newly picked dates
    fetchFlights(checkin, checkout);
    fetchTransfers(checkin);
  };
  const checkAvailability = () => checkAvailabilityForDay(pickedISO);

  // goReviews removed — Reviews tab commented out for now

  // hand the full selection over to the checkout screen
  const goCheckout = () => {
    const useLive = liveTotal != null;
    // Never hand off while flight/transfer availability is still loading — the
    // package contents (and the total) aren't final yet. The Book button is also
    // disabled in this state; this is the belt-and-braces guard.
    if (liveFlights?.loading || liveTransfers?.loading) return;
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
      outFrom: oL[0]?.from || DEFAULT_ORIGIN, outTo: oL[oL.length - 1]?.to || destination,
      outDate: oDate, outAirline: airlineName(oL[0]?.airline),
      outDur: fmtDur(oL.reduce((s, l) => s + (Number(l.duration) || 0), 0)),
      ...(rL.length ? {
        retDep: fmtTime(rL[0]?.departure), retArr: fmtTime(rL[rL.length - 1]?.arrival),
        retFrom: rL[0]?.from, retTo: rL[rL.length - 1]?.to,
        retDate: rDate, retAirline: airlineName(rL[0]?.airline),
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
          // display info for the selected airport transfer (package add-on)
          transfer: liveTransfer ? {
            from: liveTransfer.pickup?.from || `${destination} Airport`,
            to: liveTransfer.pickup?.to || hotelName,
            date: (liveTransfers?.pickupISO || checkin).slice(0, 10),
            time: (liveTransfer.pickup?.time || liveTransfers?.pickupISO?.slice(11, 16) || '12:00').slice(0, 5),
            type: liveTransfer.transferType, vehicle: liveTransfer.vehicle,
            direction: liveTransfer.direction, maxPax: liveTransfer.maxPax,
          } : null,
          // ── payload for the backend Online-booking create call ──
          api: {
            hotel: {
              hotelCode: String(hotelCode), hotelName, checkin, checkout, nights,
              room: roomName, supplier: useLive ? (liveRoom.supplier || 'hotelbeds') : 'hotelbeds',
              // identifiers the supplier reservation needs (from the live availability response)
              rateKey: useLive ? (liveRoom.rateKey || null) : null,
              roomCode: useLive ? (liveRoom.roomCode || null) : null,
              boardCode: useLive ? (liveRoom.boardCode || null) : null,
              dianaHotelId: useLive ? (liveRoom.dianaHotelId || null) : null,
              price: useLive ? liveRoom.price : total, currency: ccy,
            },
            flight: (useLive && liveFlight)
              ? {
                  from: DEFAULT_ORIGIN, to: destination, depdate: checkin, retdate: checkout,
                  price: liveFlight.totalPrice, currency: ccy, legs: allLegs,
                  fareBreakdown: liveFlight.fareBreakdown || [],
                  // Opaque Airtuerk bookable keys — REQUIRED for live re-pricing
                  // and the basket/create reservation.
                  flightKeys: liveFlight.flightKeys || [],
                  tripType: retLg.length ? 'roundtrip' : 'oneway', supplier: 'airtuerk',
                }
              : null,
            // Airport transfer add-on — the arrival flight number/airline are taken
            // automatically from the selected flight (HotelBeds needs them for the
            // booking's transferDetails).
            transfer: liveTransfer ? {
              fromType: 'IATA', fromCode: destination,
              toType: 'ATLAS', toCode: String(hotelCode),
              // The EXACT pickup datetime the displayed price was fetched with —
              // the server re-prices with the same params, and the rateKey encodes
              // this as the booked pickup time (aligned to the flight's arrival).
              outbound: liveTransfers?.pickupISO || `${checkin}T12:00:00`,
              price: liveTransfer.price, currency: 'EUR',
              rateKey: liveTransfer.rateKey,
              transferType: liveTransfer.transferType, vehicleCode: liveTransfer.vehicleCode,
              vehicle: liveTransfer.vehicle, direction: liveTransfer.direction,
              from: liveTransfer.pickup?.from, to: liveTransfer.pickup?.to,
              flightNumber: (outLg[outLg.length - 1]?.flightNumber || '').slice(0, 7) || undefined,
              companyName: outLg[outLg.length - 1]?.airline || undefined,
            } : null,
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
                <span className="sd-chip">{ICON.moon} {nights} days</span>
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
                rooms={Number(sRooms) || 1}
                board={boardPref} boardOptions={boardOptions}
                boardHint={boardsKnown
                  ? 'Meal plans this hotel offers on the dates you checked.'
                  : dateBoards?.length
                    ? `Meal plans this hotel sells on ${pd?.day || ''} ${pd?.date || niceDate(pickedIso) || ''}`.trim() + '.'
                    : 'Check a date to see which meal plans this hotel actually offers.'}
                origin={origin} originOptions={ORIGINS} originLabel={airportName} destination={destination}
                nights={nights}
                touched={filtersTouched}
                onChange={applyFilter}
                onBoardChange={(id) => setOvr((p) => ({ ...p, board: id }))}
                onChildAges={(csv) => applyFilter({ childAges: csv })}
                onReset={resetFilters}
              />

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
                  <div className="fc-strip">
                    {priceDays.map((p, i) => {
                      const hasPrice = Number(p.price) > 0;
                      const isEmpty = checkedEmpty.has(p.iso);
                      // Is THIS the day the traveller has picked. Referenced by isLoading, the
                      // `sel` class and aria-pressed below; losing it throws a ReferenceError on
                      // every render and blanks the whole page, so it must stay above isLoading.
                      const sel = pickedIdx === i;
                      const isLoading = sel && liveChecked && liveRooms?.loading;
                      const frac = hasPrice && priceVaries ? (p.price - pMin) / (pMax - pMin) : 0.55;
                      const h = Math.round(44 + 44 * frac);
                      // Cheapest of the week ON SCREEN. The API flags the lowest of whichever
                      // week it answered, which would leave several days badged "Lowest price"
                      // at once now that the strip stitches weeks together.
                      const isLow = hasPrice && priceVaries && p.price === pMin;
                      return (
                        // Keyed by POSITION, not by date. Reusing the same node for slot i is what
                        // makes a one-day step read as motion: each bar animates to its
                        // neighbour's height through the transition .fc-bar already carries, so
                        // the whole price profile glides sideways. Keying by date would unmount
                        // all seven and snap.
                        <button type="button" key={i}
                          className={`fc-col${sel ? ' sel' : ''}${isEmpty ? ' fc-empty' : !hasPrice ? ' fc-nopr' : ''}`}
                          onClick={() => pickDay(p.iso)}
                          disabled={isEmpty}
                          aria-pressed={sel}
                          aria-label={isEmpty ? `${p.day} ${p.date}, not available` : hasPrice ? `${p.day} ${p.date}, from ${ccy}${p.price}, ${p.nights} nights` : `${p.day} ${p.date}, check live price`}>
                          <span className="fc-barzone">
                            {isLow && <span className="fc-lowtag">Lowest price</span>}
                            <span className="fc-bar" style={{ height: `${h}%` }}>
                              {/* The BAR is reused so its height can animate; its wording is keyed
                                  to the date so the figures cross-fade instead of snapping to a
                                  different day's price mid-glide. */}
                              <span className="fc-barin" key={p.iso}>
                                {isEmpty ? (
                                  <span className="fc-check">Not available</span>
                                ) : isLoading ? (
                                  <span className="fc-check">Checking…</span>
                                ) : hasPrice ? (
                                  <>
                                    <span className="fc-from">from</span>
                                    <span className="fc-amt">{ccy}{p.price}</span>
                                    <span className="fc-nts">{p.nights} {p.nights === 1 ? 'day' : 'days'}</span>
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
                    <div className="fc-pop">
                      {!liveChecked ? (
                        <div className="fc-act">
                          <div className="fc-act-info">
                            <span className="fc-act-date">
                              {pd.iso
                                ? `${calDay(pd.iso)} ${calDate(pd.iso)} – ${calDay(addDaysISO(pd.iso, nights))} ${calDate(addDaysISO(pd.iso, nights))}`
                                : `${pd.day} ${pd.date}`}
                            </span>
                            {/* The cache returns 0 for a day it hasn't costed — quote nothing
                                rather than "estimated from €0". */}
                            <span className="fc-act-meta">
                              {nights} {nights === 1 ? 'day' : 'days'}
                              {Number(pd.price) > 0 ? ` · estimated from ${ccy}${pd.price}` : ' · price on request'}
                            </span>
                          </div>
                          <button type="button" className="fc-cta" onClick={checkAvailability}>
                            Check price &amp; availability
                          </button>
                        </div>
                      ) : (
                        <div className="fc-res">
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981" /><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <div>
                            <div className="avail-text">
                              {liveRooms?.loading ? 'Checking live availability…'
                                : liveRooms?.error ? 'Showing estimated price'
                                : liveRoom ? 'Your holiday is available!'
                                : 'Your holiday is available!'}
                            </div>
                            <div className="avail-sub">
                              {`Selected ${pd.day} ${pd.date} · ${nights} ${nights === 1 ? 'day' : 'days'}`}
                              {liveRoom?.board ? ` · ${liveRoom.board.toLowerCase()}` : ''}
                            </div>
                          </div>
                          <div className="avail-price">
                            <div className="avail-price-label">{liveRoom ? 'live price' : 'from'}</div>
                            <div className="avail-price-val">
                              {liveRooms?.loading
                                ? <span className="avail-spin" />
                                : <><small>€</small>{liveRoom ? Math.round(liveRoom.price) : pd?.price}</>}
                            </div>
                            <div className="avail-you-low">
                              {liveRoom ? `Live room price · ${nights} ${nights === 1 ? 'day' : 'days'}`
                                : liveRooms?.error ? 'Live price unavailable — estimate shown'
                                : (pd?.lowest ? 'Lowest estimated price' : 'Estimated price')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fc-hint">Pick a departure day to check live prices</div>
                  ))}

              {/* Flights */}
              <div className="flight-section reveal">
                <div className="section-title"><span className="st-step">3</span> Your flights</div>
                {liveFlights ? (
                  liveFlights.loading ? (
                    <SkeletonBlock label="Checking live flight prices…">
                      <FlightCardSkeleton /><FlightCardSkeleton />
                    </SkeletonBlock>
                  ) : liveFlights.error ? (
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
                      <div className="flight-note">Live fares from {airportName(DEFAULT_ORIGIN)} for your selected dates:</div>
                      <FlightCard
                        f={{ ...liveFlights.flights[selectedFlight], price: Math.round(liveFlights.flights[selectedFlight].totalPrice), delta: 0 }}
                        selected
                        onSelect={() => {}}
                      />
                      {(() => {
                        const altIdx = liveFlights.flights.findIndex((_, i) => i !== selectedFlight);
                        if (altIdx === -1) return null;
                        const alt = liveFlights.flights[altIdx];
                        return (
                          <FlightCard
                            f={{ ...alt, price: Math.round(alt.totalPrice), delta: cheapestFare == null ? null : alt.totalPrice - cheapestFare }}
                            selected={false}
                            onSelect={() => setSelectedFlight(altIdx)}
                          />
                        );
                      })()}
                      {liveFlights.flights.length > 2 && (
                        <button className="show-more-flights" onClick={() => setModalOpen(true)}>
                          {ICON.plane} Change flight · {liveFlights.flights.length - 2} more option{liveFlights.flights.length - 2 === 1 ? '' : 's'}
                        </button>
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
                        {ORIGINS.map((code) => (
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

              {/* Airport transfer — auto-derived add-on (airport from the flight search,
                  hotel from this page); shown right below the flights section */}
              {liveTransfers && (
              <div className="transfer-section reveal vis">
                <div className="section-title"><span className="st-step">4</span> Airport transfer <span className="stay-guests">(optional)</span></div>
                {liveTransfers.loading ? (
                  <div className="live-loading"><span className="live-spin" /> Checking transfer availability…</div>
                ) : liveTransfers.error ? (
                  <div className="live-error">
                    {ICON.warn}
                    <span className="live-error-msg">{liveTransfers.error}</span>
                    <button type="button" className="live-retry"
                      onClick={() => fetchTransfers(pd?.iso || baseCheckIn)}>Try again</button>
                  </div>
                ) : liveTransfers.services?.length ? (
                  <div className="stay-block">
                    <div className="flight-note">From {destination} airport to your hotel on arrival day{liveTransfers.pickupISO ? ` · pickup ~${liveTransfers.pickupISO.slice(11, 16)} (follows your flight)` : ''} — live prices:</div>
                    <div className={`room-option${selectedTransfer === -1 ? ' selected' : ''}`} onClick={() => setSelectedTransfer(-1)}>
                      <div className="room-radio" />
                      <div className="room-info">
                        <div className="room-name">No transfer</div>
                        <div className="room-cap">I'll arrange my own transport</div>
                      </div>
                      <div className="room-price included">{ICON.check}&nbsp;{ccy}0</div>
                    </div>
                    {liveTransfers.services.slice(0, 4).map((t, ti) => (
                      <div key={ti} className={`room-option${selectedTransfer === ti ? ' selected' : ''}`} onClick={() => setSelectedTransfer(ti)}>
                        <div className="room-radio" />
                        <div className="room-info">
                          <div className="room-name">{t.vehicle || 'Transfer'}{t.category ? ` · ${t.category}` : ''} <span className="stay-guests">({t.transferType === 'SHARED' ? 'Shared' : 'Private'})</span></div>
                          <div className="room-cap">{t.pickup?.from || `${destination} Airport`} → {t.pickup?.to || hotelName}{t.maxPax ? ` · up to ${t.maxPax} passengers` : ''}</div>
                          {Array.isArray(t.cancellationPolicies) && t.cancellationPolicies.length > 0 && (
                            <div className="room-cancel room-cancel-free">{ICON.check} Free cancellation before {(() => { const d = new Date(t.cancellationPolicies[0].from); return isNaN(d.getTime()) ? t.cancellationPolicies[0].from : `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`; })()}</div>
                          )}
                        </div>
                        <div className="room-price">{ccy}{Math.round(t.price)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="live-empty">{ICON.noTransfer} No transfers available for this hotel and date.</div>
                )}
              </div>
              )}

              {/* Rooms — live availability, revealed once the traveller checks a date */}
              {liveChecked && (
              <div className="room-section reveal vis">
                <div className="section-title"><span className="st-step">2</span> Choose your room</div>
                {liveRooms ? (
                  liveRooms.loading ? (
                    <SkeletonBlock label="Checking live room availability…">
                      {/* Uneven board counts — a real hotel never returns three identically
                          shaped rooms, and three identical placeholders read as a stuck screen. */}
                      <RoomCardSkeleton rows={3} i={0} /><RoomCardSkeleton rows={2} i={1} /><RoomCardSkeleton rows={2} i={2} />
                    </SkeletonBlock>
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
                            <div className="room-group-id">
                              <div className="room-group-name">{g.name}</div>
                              {g.cheapest.roomCode && <span className="room-code">{g.cheapest.roomCode}</span>}
                            </div>
                            <div className="room-group-from">
                              <span className="rgf-count">{g.boards.length} option{g.boards.length === 1 ? '' : 's'}</span>
                              <span className="rgf-price">from {ccy}{Math.round(g.cheapest.price).toLocaleString('en-GB')}</span>
                            </div>
                          </div>

                          {/* Who the room sleeps and for how long — the two facts that apply to
                              every board below. Per-night and per-guest arithmetic deliberately
                              left out: the traveller is choosing a board here, and a second price
                              beside every real price is noise, not help. */}
                          <div className="room-group-meta">
                            {gInfo?.guests != null && (
                              <span className="rgm">{ICON.users}
                                {gInfo.adults} adult{gInfo.adults === 1 ? '' : 's'}
                                {gInfo.children > 0 ? ` · ${gInfo.children} child${gInfo.children === 1 ? '' : 'ren'}` : ''}
                                {gInfo.rooms > 1 ? ` · ${gInfo.rooms} rooms` : ''}
                              </span>
                            )}
                            <span className="rgm">{ICON.moon}{nights} day{nights === 1 ? '' : 's'}</span>
                          </div>

                          {g.boards.map((b) => {
                            const isSel = selectedRoom.live === b.index;
                            const d = rateInfo.get(b.index);
                            const isCheapest = b.index === cheapestIndex;
                            // Against the cheapest board of THIS room — a like-for-like comparison
                            // the traveller is actually making on screen.
                            const extra = b.price - g.cheapest.price;
                            return (
                              <div
                                key={b.index}
                                className={`room-option${isSel ? ' selected' : ''}`}
                                onClick={() => setSelectedRoom((p) => ({ ...p, live: b.index }))}
                              >
                                <div className="room-radio" />
                                <div className="room-info">
                                  <div className="room-name">
                                    {d?.board.label || b.boardLabel}
                                    {isCheapest && <span className="room-flag room-flag-best">{ICON.spark} Lowest price</span>}
                                  </div>
                                  {d?.board.gloss && <div className="room-cap">{d.board.gloss}</div>}

                                  <div className="room-chips">
                                    {/* Cancellation is the single fact people get wrong, so it
                                        leads and states the deadline instead of a bare word. */}
                                    {d?.cancel.kind === 'free' && (
                                      <span className="rchip rchip-free">{ICON.shield} Free cancellation until {fmtDay(d.cancel.until)}</span>
                                    )}
                                    {d?.cancel.kind === 'partial' && (
                                      <span className="rchip rchip-warn">{ICON.warn} Cancel now costs {ccy}{Math.round(d.cancel.amount).toLocaleString('en-GB')}</span>
                                    )}
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
                          {showAllRooms
                            ? 'Show fewer room types'
                            : `Show all ${roomGroups.length} room types`}
                        </button>
                      )}
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
              <div className="overview-section reveal">
                <div className="section-title"><span className="st-step">{liveTransfers ? 5 : 4}</span> Overview of your holiday</div>
                <div className="overview-card">
                  <div className="overview-head">
                    <div className="overview-head-main">
                    <div className="overview-hotel">{hotelName}</div>
                    <div className="overview-stars">{'★'.repeat(Math.min(stars, 5))}</div>
                    <div className="overview-loc">{ICON.pin} {locLabel}</div>
                    <div className="overview-dates">{ICON.cal} {(() => {
                      const ci = pd?.iso || baseCheckIn;
                      const co = ci ? addDaysISO(ci, nights) : baseCheckOut;
                      // No invented April dates when the search carries none.
                      return (niceDate(ci) && niceDate(co)) ? `${niceDate(ci)} - ${niceDate(co)}` : 'Dates not selected yet';
                    })()} <span style={{ color: 'var(--text-light)' }}>({nights} days)</span></div>
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
                    {liveTransfer
                      ? <div className="overview-row"><span className="overview-row-label">{ICON.check} Airport transfer — {liveTransfer.vehicle || 'Transfer'} ({liveTransfer.transferType === 'SHARED' ? 'shared' : 'private'})</span><span className="overview-leader" /><span className="overview-row-val">{ccy} {Math.round(liveTransfer.price)}</span></div>
                      : <div className="overview-row"><span className="overview-row-label">{ICON.noTransfer} Transfer not included</span><span className="overview-leader" /><span className="overview-row-val" style={{ color: 'var(--text-light)' }}>—</span></div>}
                    <div className="overview-extras">
                      <div className="overview-extra">{ICON.check} No booking fees</div>
                      {liveFlight != null && <div className="overview-extra">{ICON.check} Hand luggage included</div>}
                    </div>
                  </div>
                  <div className="overview-total">
                    <span className="overview-total-label">Total for {ovPax} {ovPax === 1 ? 'person' : 'people'}</span>
                    <span className="overview-total-val">
                      {ovBase != null
                        ? `${ccy}${(ovBase + transferPrice + 20).toLocaleString('en-GB')}`
                        : '—'}
                    </span>
                  </div>
                  <div className="overview-book-wrap">
                    <button className="overview-book-btn" onClick={goCheckout} disabled={liveFlights?.loading || liveTransfers?.loading}>
                      {liveFlights?.loading ? <>Checking flight prices…</>
                        : ovBase == null ? <>Check availability {ICON.arrow}</>
                        : <>Now book {ICON.arrow}</>}
                    </button>
                  </div>
                  <div className="overview-urgency"><div className="overview-urgency-text">{ICON.clock} Prices are live and may change until your booking is completed.</div></div>
                </div>
              </div>
            </div>

            {/* ── INFORMATION ── */}
            <div className={`tp${activeTab === 'Information' ? ' act' : ''}`}>
              {/* About card */}
              <div className="inf-card reveal">
                <div className="inf-card-header">
                  <div className="inf-card-icon">{ICON.info}</div>
                  <h3 className="inf-card-title">About {hotelName}</h3>
                </div>
                <div className={`inf-desc${expanded.d1 ? ' exp' : ''}`}>
                  {info?.description || `${hotelName} is a stunning boutique hotel nestled on the pristine shores of ${locLabel}. This retreat combines contemporary luxury with natural beauty, offering guests an unparalleled holiday experience.`}
                </div>
                {((info?.description?.length || 0) > 200 || !info?.description) && (
                  <button className="inf-read-more" onClick={() => toggleExpand('d1')}>
                    {expanded.d1 ? 'Show less' : 'Read more'}
                    <S size={14} sw={2.5}><path d={expanded.d1 ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} /></S>
                  </button>
                )}
              </div>

              {/* Quick stats tiles */}
              {(() => {
                const facLoc = (info?.facilities || []).filter((f) => f.facilityGroupName === 'Location');
                const year = facLoc.find((f) => f.facilityName === 'Year of construction');
                const reno = facLoc.find((f) => f.facilityName === 'Year of most recent renovation');
                const floors = facLoc.find((f) => f.facilityName === 'Number of floors (main building)');
                const totalRooms = facLoc.find((f) => f.facilityName === 'Total number of rooms');
                const stats = [
                  year?.number && { icon: ICON.cal, label: 'Built', value: year.number },
                  reno?.number && { icon: <S sw={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></S>, label: 'Renovated', value: reno.number },
                  floors?.number && { icon: <S sw={2}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></S>, label: 'Floors', value: floors.number },
                  totalRooms?.number && { icon: ICON.bed, label: 'Total rooms', value: totalRooms.number },
                  { icon: <S sw={2}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></S>, label: 'Category', value: `${Math.min(stars, 5)}-Star` },
                  { icon: ICON.board, label: 'Board', value: hotel?.board || 'All inclusive' },
                ].filter(Boolean);
                return stats.length > 0 && (
                  <div className="inf-stats reveal">
                    {stats.map((s, i) => (
                      <div className="inf-stat" key={i}>
                        <div className="inf-stat-icon">{s.icon}</div>
                        <div className="inf-stat-label">{s.label}</div>
                        <div className="inf-stat-value">{s.value}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Location card */}
              {(info?.address || info?.city) && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--loc">{ICON.pin}</div>
                    <h3 className="inf-card-title">Location & Address</h3>
                  </div>
                  <div className="inf-loc-body">
                    {info?.latitude && info?.longitude && (
                      <div className="inf-minimap">
                        <iframe
                          title="Hotel location"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(info.longitude) - 0.008},${Number(info.latitude) - 0.006},${Number(info.longitude) + 0.008},${Number(info.latitude) + 0.006}&layer=mapnik&marker=${info.latitude},${info.longitude}`}
                        />
                      </div>
                    )}
                    <div className="inf-loc-details">
                      {info.address && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon">{ICON.pin}</div>
                          <div><div className="inf-loc-lbl">Address</div><div className="inf-loc-val">{info.address}</div></div>
                        </div>
                      )}
                      {zoneLabel && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon"><S sw={2}><path d="M12 21c-4.5-1.4-7.5-5.4-7.5-10A7.5 7.5 0 0112 3a7.5 7.5 0 017.5 8c0 4.6-3 8.6-7.5 10z" /><circle cx="12" cy="11" r="2.5" /></S></div>
                          <div><div className="inf-loc-lbl">Zone / Area</div><div className="inf-loc-val">{zoneLabel}</div></div>
                        </div>
                      )}
                      {(info?.cityName || info?.city) && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon"><S sw={2}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></S></div>
                          <div><div className="inf-loc-lbl">City / Region</div><div className="inf-loc-val">{info.cityName || info.city}</div></div>
                        </div>
                      )}
                      {info.latitude && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon"><S sw={2}><polygon points="3 11 22 2 13 21 11 13 3 11" /></S></div>
                          <div><div className="inf-loc-lbl">Coordinates</div><div className="inf-loc-val">{Number(info.latitude).toFixed(4)}° N, {Number(info.longitude).toFixed(4)}° E</div></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact card */}
              {info?.phones?.length > 0 && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--contact"><S sw={2}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></S></div>
                    <h3 className="inf-card-title">Contact</h3>
                  </div>
                  <div className="inf-contacts">
                    {info.phones.map((p, i) => {
                      const type = p.phoneType === 'PHONEBOOKING' ? 'Booking' : p.phoneType === 'PHONEHOTEL' ? 'Hotel' : p.phoneType === 'FAXNUMBER' ? 'Fax' : 'Phone';
                      const iconEl = p.phoneType === 'FAXNUMBER'
                        ? <S sw={2}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V2H8v5" /><line x1="6" y1="13" x2="6.01" y2="13" /></S>
                        : <S sw={2}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></S>;
                      return (
                        <div className="inf-contact-card" key={i}>
                          <div className="inf-contact-icon">{iconEl}</div>
                          <div className="inf-contact-type">{type}</div>
                          <div className="inf-contact-number">{p.phoneNumber}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Room types card */}
              {info?.rooms?.length > 0 && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--room">{ICON.bed}</div>
                    <h3 className="inf-card-title">Room Types</h3>
                    <span className="inf-card-count">{info.rooms.length} types</span>
                  </div>
                  <div className="inf-room-grid">
                    {info.rooms.map((rm, i) => (
                      <div className="inf-room-tile" key={i}>
                        <div className="inf-room-badge">{rm.roomCode}</div>
                        <div className="inf-room-guests">
                          <S size={14} sw={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>
                          {rm.minPax}–{rm.maxPax} guests
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── FACILITIES ── */}
            <div className={`tp${activeTab === 'Facilities' ? ' act' : ''}`}>
              {info?.facilities?.length > 0 ? (() => {
                const groups = {};
                const skipGroups = ['Location', 'Methods of payment'];
                info.facilities.forEach((f) => {
                  if (skipGroups.includes(f.facilityGroupName)) return;
                  const g = f.facilityGroupName || 'Other';
                  if (!groups[g]) groups[g] = [];
                  groups[g].push(f);
                });
                const entries = Object.entries(groups);
                const shown = showAllFac ? entries : entries.slice(0, 5);
                return <>
                  <div className="fac-header reveal">
                    <div className="inf-card-icon">{TAB_ICON.Facilities}</div>
                    <div>
                      <h3 className="inf-card-title">Hotel Facilities</h3>
                      <div className="fac-subtitle">{entries.length} categories · {info.facilities.filter((f) => !skipGroups.includes(f.facilityGroupName)).length} amenities</div>
                    </div>
                  </div>
                  {shown.map(([group, items]) => (
                    <div className="fac-card reveal" key={group}>
                      <div className="fac-card-head">
                        <div className="fac-card-dot" />
                        <span className="fac-card-name">{group}</span>
                        <span className="fac-card-count">{items.length}</span>
                      </div>
                      <div className="fac-card-items">
                        {items.map((f, i) => (
                          <div className={`fac-item${f.isPaid ? ' fac-item--paid' : ''}`} key={i}>
                            <div className="fac-item-icon">{ICON.check}</div>
                            <span className="fac-item-name">{f.facilityName}{f.number ? ` (${f.number})` : ''}</span>
                            {f.isPaid && <span className="fac-item-badge">Paid</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!showAllFac && entries.length > 5 && (
                    <button className="fac-show-all" onClick={() => setShowAllFac(true)}>
                      Show all {entries.length} categories
                      <S size={14} sw={2.5}><path d="M6 9l6 6 6-6" /></S>
                    </button>
                  )}
                  {showAllFac && entries.length > 5 && (
                    <button className="fac-show-all" onClick={() => setShowAllFac(false)}>
                      Show less
                      <S size={14} sw={2.5}><path d="M18 15l-6-6-6 6" /></S>
                    </button>
                  )}
                </>;
              })() : (
                <>
                  <div className="fac-header reveal">
                    <div className="inf-card-icon">{TAB_ICON.Facilities}</div>
                    <div>
                      <h3 className="inf-card-title">Hotel Facilities</h3>
                      <div className="fac-subtitle">{FACILITIES.length + MORE_FACILITIES.length} amenities</div>
                    </div>
                  </div>
                  <div className="fac-card reveal">
                    <div className="fac-card-items">
                      {FACILITIES.map((f) => (
                        <div className="fac-item" key={f}>
                          <div className="fac-item-icon">{FAC_ICON[f] || ICON.check}</div>
                          <span className="fac-item-name">{f}</span>
                        </div>
                      ))}
                      {showAllFac && MORE_FACILITIES.map((f, i) => (
                        <div className="fac-item" key={f} style={{ animation: `sdFadeUp .4s var(--ease) ${i * 0.06}s both` }}>
                          <div className="fac-item-icon">{ICON.check}</div>
                          <span className="fac-item-name">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {!showAllFac && <button className="fac-show-all" onClick={() => setShowAllFac(true)}>Show all facilities <S size={14} sw={2.5}><path d="M6 9l6 6 6-6" /></S></button>}
                </>
              )}
            </div>

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
                <div className="bkdi"><span className="bkdk">{ICON.plane}</span>{destination ? `Brussels (${DEFAULT_ORIGIN}) → ${destination}` : `Brussels (${DEFAULT_ORIGIN})`}</div>
                <div className="bkdi"><span className="bkdk">{ICON.board}</span>{hotel?.board || 'All inclusive'}</div>
                <div className="bkdi"><span className="bkdk">{ICON.moon}</span>{nights} days</div>
              </div>
              <div className="bkcw">
                <button className="bkc" onClick={goCheckout} disabled={liveFlights?.loading || liveTransfers?.loading}>
                  {liveFlights?.loading ? 'Checking flights…'
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
          <button className="mbc" onClick={goCheckout} disabled={liveFlights?.loading || liveTransfers?.loading}>
            {liveFlights?.loading ? 'Checking…' : `${liveTotal != null ? 'Book now' : 'Check price'} →`}
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
          <div className="modal-body">
            <div className="modal-sidebar">
              <div className="modal-filter-head">
                <span className="modal-filter-count">
                  {modalFlights.length} of {allFlights.length} flight{allFlights.length === 1 ? '' : 's'}
                </span>
                {activeFilterCount > 0 && (
                  <button type="button" className="modal-filter-clear" onClick={clearFlightFilters}>Clear all</button>
                )}
              </div>

              {facets.outbound.length > 0 && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">Departure time outbound</div>
                  {facets.outbound.map((b) => (
                    <div key={b.id} className={`modal-filter-opt${fOut.includes(b.id) ? ' checked' : ''}`}
                      onClick={() => toggleBand(setFOut)(b.id)}>
                      <div className="modal-filter-cb">{fOut.includes(b.id) && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}</div>
                      <span className="mfo-label">{b.label} <em>{b.range}</em></span>
                      <span className="mfo-count">{b.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {facets.return.length > 0 && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">Departure time return</div>
                  {facets.return.map((b) => (
                    <div key={b.id} className={`modal-filter-opt${fRet.includes(b.id) ? ' checked' : ''}`}
                      onClick={() => toggleBand(setFRet)(b.id)}>
                      <div className="modal-filter-cb">{fRet.includes(b.id) && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}</div>
                      <span className="mfo-label">{b.label} <em>{b.range}</em></span>
                      <span className="mfo-count">{b.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {facets.direct && (
                <div className="modal-filter-group">
                  <div className="modal-filter-title">Stopover</div>
                  <div className={`modal-filter-opt${fDirect ? ' checked' : ''}`} onClick={() => setFDirect((v) => !v)}>
                    <div className="modal-filter-cb">{fDirect && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}</div>
                    <span className="mfo-label">Direct flights only</span>
                    <span className="mfo-count">{facets.direct.count}</span>
                  </div>
                </div>
              )}

              {!facets.outbound.length && !facets.return.length && !facets.direct && (
                <div className="modal-filter-none">
                  All {allFlights.length} flight{allFlights.length === 1 ? '' : 's'} share the same
                  times and stops, so there is nothing to filter on.
                </div>
              )}
            </div>

            <div className="modal-flights">
              {modalFlights.length ? modalFlights.map((f) => (
                <FlightCard
                  key={f.idx}
                  f={{ ...f, price: Math.round(f.totalPrice), delta: cheapestFare == null ? null : f.totalPrice - cheapestFare }}
                  selected={selectedFlight === f.idx}
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
