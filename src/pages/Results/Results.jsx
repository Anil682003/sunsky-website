import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { fetchFavouriteCodes, addFavourite, removeFavourite } from '../../api';
import { fetchFacets, fetchCountries } from '../../api/filters';
import { rememberDestCode } from '../../utils/favDest';
import HotelImg from '../../components/HotelImg/HotelImg';
import ScopePicker from '../../components/ScopePicker/ScopePicker';
import { formatReview, scoreWord } from '../../utils/reviewBadge';
import RatingMarks from '../../components/RatingMarks/RatingMarks';
import { ratingLabel, ratingValue } from '../../utils/rating';
import { topFacilities } from '../../utils/topFacilities';
import { flagUrl } from '../../utils/countryFlag';
import { toTitleCase } from '../../utils/textCase';
import { useToast } from '../../context/ToastContext';
import styles from './Results.module.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';
const PAGE_SIZE = 20;
// Default age used for a newly-added child until the traveller picks one. Hotelbeds requires
// an age per child; without it a family search 400s, so we never send a childless-age.
const CHILD_AGE_DEFAULT = 8;
// Above these sizes the cheapest request goes as a POST (JSON body) instead of a GET, because a
// whole-country content-filter set (thousands of hotelCodes) is far too long for a URL.
const LARGE_CODES = 150;
const MANY_DESTINATIONS = 8;


// Photo URLs are kept CANONICAL (default size); each <HotelImg> requests the size its box
// needs (`bigger` for a card, `original` for the lightbox) and falls back if that size is
// missing — many Hotelbeds images lack the larger variants (`xl` 403s), which is what left
// gallery frames blank. The card box is ~360px (720 on a 2x screen); the lightbox is full.
//
// Sort key = the admin's `visualOrder` (the MASTER image the admin promoted has the lowest
// value, so it sorts FIRST). `order` mirrors it; both fall back to 999 so images with no order
// sink to the end without disturbing the master.
const imgOrder = (im) => im?.visualOrder ?? im?.order ?? 999;
const bestImg = (images, fallback) => {
  if (!Array.isArray(images) || images.length === 0) return fallback;
  const sorted = [...images].sort((a, b) => imgOrder(a) - imgOrder(b));
  return sorted[0]?.url || fallback;
};

// All of a hotel's photo URLs, master-first — feeds the inline card slider and the lightbox.
const allImgs = (images) => {
  if (!Array.isArray(images) || images.length === 0) return [];
  return [...images]
    .sort((a, b) => imgOrder(a) - imgOrder(b))
    .map((im) => im?.url)
    .filter(Boolean);
};

// Empty-search fallback: popular sun destinations (Hotelbeds codes) that have priced inventory —
// what we search when the traveller hits Search without choosing a place. Curated for the
// Belgian sun-holiday market; the business can adjust this list.
const DEFAULT_DESTINATIONS = ['PMI', 'TFS', 'AGP', 'AYT', 'RAK', 'LPA', 'HRG', 'ALC'];

// Board codes → human labels. Names are Hotelbeds' OFFICIAL board dictionary
// (/hotel-content-api/1.0/types/boards), covering every code that occurs in our cache — so no
// raw code (e.g. "CB") ever leaks to the UI. getBoardLabel() falls back to the code for anything
// not listed (rare).
const BOARD_LABELS = {
  RO: 'Room Only',            SC: 'Self Catering',        BB: 'Bed & Breakfast',
  CB: 'Continental Breakfast', AB: 'American Breakfast',   DB: 'Buffet Breakfast',
  GB: 'English Breakfast',    IB: 'Irish Breakfast',      SB: 'Scottish Breakfast',
  LB: 'Light Breakfast',      B2: 'Breakfast (2 guests)',
  HB: 'Half Board',           MB: 'Half Board + Drinks',
  FB: 'Full Board',           PB: 'Full Board + Drinks',
  CE: 'Dinner Included',      CO: 'Lunch Included',
  AI: 'All Inclusive',        AS: 'All Inclusive Premium', TL: 'All Inclusive Soft',
  UAI: 'Ultra All Inclusive', TI: 'All Inclusive+',       DO: 'Dinner & B&B',
};
const ROOM_LABELS = {
  DBL: 'Double',       DBT: 'Double / Twin', TWN: 'Twin',      SGL: 'Single',
  TPL: 'Triple',       QUA: 'Quad',          FAM: 'Family',    SUI: 'Suite',
  JSU: 'Junior Suite', STU: 'Studio',        APT: 'Apartment', BUN: 'Bungalow',
  VIL: 'Villa',        ROO: 'Room',
};

// Room codes the cache ACTUALLY holds (verified against live inventory). Offering a code the
// data never contains gives the user a filter that always returns nothing.
const ROOM_FILTERS = ['DBL', 'DBT', 'TWN', 'TPL', 'FAM', 'SUI', 'JSU', 'STU', 'APT', 'BUN', 'ROO'];

const SORT_OPTIONS = [
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  // Name + star sorts. Applied CLIENT-SIDE over the loaded results (the price cache orders by
  // price, not name/stars); they reorder what's loaded and re-settle as more pages come in.
  { value: 'name_asc',   label: 'Name: A to Z' },
  { value: 'name_desc',  label: 'Name: Z to A' },
  { value: 'stars_desc', label: 'Stars: 5 to 1' },
  { value: 'stars_asc',  label: 'Stars: 1 to 5' },
  // Distance sorts. Applied CLIENT-SIDE using the distances from the admin content API (the
  // cache prices by price and does not know distances). Only reorders the hotels already loaded.
  { value: 'distance_beach',  label: 'Distance to beach' },
  { value: 'distance_centre', label: 'Distance to centre' },
];
const REFUNDABLE_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Refundable' },
  { value: 'no',  label: 'Non-ref.' },
];
// Transport type. Maps to the cache `searchType` (see buildRequest).
const TRANSPORT_OPTIONS = [
  { value: 'hotel_only', label: 'Own transport' },
  { value: 'package',    label: 'Flight + hotel' },
];
const PRICE_BASIS_OPTIONS = [
  { value: 'total',     label: 'Total stay' },
  { value: 'perPerson', label: 'Per person' },
];

const PRICE_STEP = 50;
const PRICE_CEILING_FALLBACK = 1000;

// Content facets narrow the hotelCodes via the admin API; price facets go straight to the cache.
const EMPTY_FILTERS = {
  boards: [], roomTypes: [], minPrice: '', maxPrice: '',
  priceBasis: 'total', refundable: 'any', sortBy: 'price_asc',
  // Content facets (resolved against the admin content API into a hotelCode set for the cache).
  themes: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [],           // accommodation type (group 20), kids amenities
  maxBeach: '', maxCentre: '',           // max distance (m) to beach / city centre
  adultsOnly: false,                     // "Only Adults" hotels (facility 203/group 85)
  // Transport type. 'hotel_only' → cache searchType=HOTEL_ONLY; 'package' → PACKAGE.
  transport: 'hotel_only',
};

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Display symbol for the headline price only — fine print keeps the ISO code.
const CCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', TRY: '₺' };

const getBoardLabel = (code) => BOARD_LABELS[code] || code || '';
const getRoomLabel  = (code) => ROOM_LABELS[code]  || code || '';
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
const metresLabel = (m) => (m >= 1000 ? `≤ ${m / 1000} km` : `≤ ${m} m`);

// How many filters the user has actively changed — drives the sidebar count pill.
const countActiveFilters = (f) =>
  f.boards.length + f.roomTypes.length +
  (f.themes?.length || 0) + (f.stars?.length || 0) +
  (f.facilities?.length || 0) + (f.activities?.length || 0) +
  (f.accommodation?.length || 0) + (f.kids?.length || 0) +
  (f.maxBeach !== '' ? 1 : 0) + (f.maxCentre !== '' ? 1 : 0) +
  (f.adultsOnly ? 1 : 0) +
  (f.minPrice !== '' ? 1 : 0) + (f.maxPrice !== '' ? 1 : 0) +
  (f.priceBasis !== 'total' ? 1 : 0) + (f.refundable !== 'any' ? 1 : 0) +
  (f.transport && f.transport !== 'hotel_only' ? 1 : 0);

// Any content facet active means the cache must be restricted to the resolved hotelCodes.
const hasContentFacet = (f) =>
  (f.themes?.length || 0) + (f.stars?.length || 0) +
  (f.facilities?.length || 0) + (f.activities?.length || 0) +
  (f.accommodation?.length || 0) + (f.kids?.length || 0) +
  (f.maxBeach !== '' ? 1 : 0) + (f.maxCentre !== '' ? 1 : 0) +
  (f.adultsOnly ? 1 : 0) > 0;

const fmtDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
};

const csv = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

const Icon = ({ d, size = 14, sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// ── Result-card helpers ──────────────────────────────────────────────────────

// 12px line icons for the curated facility chips — one 24×24 stroke path per topFacilities()
// icon key, rendered through the existing <Icon>. `fallback` covers any future ladder key.
const FAC_ICON_D = {
  pool:        'M2 17c1.7-1.4 3.3-1.4 5 0s3.3 1.4 5 0 3.3-1.4 5 0 3.3 1.4 5 0M13 14V6a2 2 0 012-2M18 14V6a2 2 0 012-2M13 8h5M13 11.5h5',
  wifi:        'M5 12.55a11 11 0 0114 0M8.5 15.5a6.5 6.5 0 017 0M12 19h.01',
  spa:         'M7.5 8c0-1.6.8-2.4.8-3.6S7.5 2.5 7.5 2.5M12 8c0-1.6.8-2.4.8-3.6S12 2.5 12 2.5M16.5 8c0-1.6.8-2.4.8-3.6s-.8-1.9-.8-1.9M4 13h16a8 8 0 01-16 0z',
  gym:         'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11',
  restaurant:  'M8 2v20M5 2v5.5a3 3 0 006 0V2M17 2v20M17 2c-2.4 1.6-3.4 4.4-3.4 8H17',
  bar:         'M5 3h14l-7 8-7-8zM12 11v8M8.5 21h7M7.4 5.8h9.2',
  beach:       'M2 21h20M12 3a8.5 8.5 0 00-8.5 8.5h17A8.5 8.5 0 0012 3zM12 11.5V21',
  parking:     'M7 21V3h6a5 5 0 010 10H7',
  shuttle:     'M5 17V6a2 2 0 012-2h10a2 2 0 012 2v11M5 17h14M5 11h14M7.5 19.5h.01M16.5 19.5h.01',
  ac:          'M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17',
  kids:        'M12 21a9 9 0 100-18 9 9 0 000 18zM8.7 10h.01M15.3 10h.01M8.5 14.5a4.6 4.6 0 007 0',
  'room-service': 'M3 17h18M5 17a7 7 0 0114 0M12 10V8M10.5 8h3',
  reception:   'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.2 2.4',
  terrace:     'M12 22V12M12 12C12 7 9.2 4.8 4.2 4.8c0 5 2.8 7.2 7.8 7.2zM12 12c0-5 2.8-7.2 7.8-7.2 0 5-2.8 7.2-7.8 7.2z',
  pets:        'M8.3 8.2a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM15.7 8.2a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM4.6 12.4a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM19.4 12.4a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 11.2c-3 0-5.8 2.6-5.8 5.4 0 1.9 1.5 2.9 3 2.4l2.8-1 2.8 1c1.5.5 3-.5 3-2.4 0-2.8-2.8-5.4-5.8-5.4z',
  accessible:  'M12 5.5a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM12 7.5V13h5l2.6 5.4M12 10.5H8.6M9.4 9.6a6 6 0 107.4 8.6',
  fallback:    'M12 3l1.9 5.8L20 10.4l-6.1 1.6L12 18l-1.9-6L4 10.4l6.1-1.6z',
};

// Country flag with a broken-image fallback: flagcdn PNG when it loads, a quiet globe glyph
// when the code is unknown to flagUrl() or the CDN image 404s.
function CountryFlag({ code }) {
  const [broken, setBroken] = useState(false);
  if (!code) return null;
  const src = flagUrl(code);
  if (!src || broken) {
    return (
      <span className={styles.rcFlagFallback} aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
        </svg>
      </span>
    );
  }
  return (
    <img
      className={styles.rcFlag}
      src={src}
      alt=""
      width="18"
      height="14"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

function FilterSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${styles.filterSection} ${open ? styles.filterOpen : ''}`}>
      <div className={styles.filterHeader} onClick={() => setOpen(!open)}>
        <h3>{title}</h3>
        <svg className={styles.filterArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && <div className={styles.filterBody}>{children}</div>}
    </div>
  );
}

function FilterCheck({ label, checked, onChange }) {
  return (
    <label className={styles.filterCheck}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

// A capped facet list: shows the first `limit` rows and a "Show all (N) / Show less" toggle,
// so a long facet (dozens of facilities/activities) doesn't turn the sidebar into an endless
// scroll. Any currently-CHECKED row beyond the cap is pulled into the visible set, so a picked
// filter never hides itself.
function FacetList({ items, limit = 6, isChecked, render }) {
  const [expanded, setExpanded] = useState(false);
  let shown = items;
  if (!expanded && items.length > limit) {
    const head = items.slice(0, limit);
    const checkedTail = isChecked ? items.slice(limit).filter(isChecked) : [];
    shown = [...head, ...checkedTail];
  }
  return (
    <>
      {shown.map(render)}
      {items.length > limit && (
        <button type="button" className={styles.facetMore} onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `Show all ${items.length}`}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </>
  );
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className={styles.segRow} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.segBtn} ${value === o.value ? styles.segBtnActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // ── SCOPE (multi-country / multi-destination) ──────────────────────────────────
  // The search is defined by a scope of countries and/or destinations (union). Seeded from the
  // URL and editable in the sidebar. Back-compat: a legacy `?destination=AYT` becomes a
  // single-destination scope, so existing links keep working.
  const urlCountries    = params.get('countries')    || '';
  const urlDestinations = params.get('destinations') || '';
  // The home destination picker (Hero + DestinationModal) sends chosen CITIES as `cities`
  // (Hotelbeds destination codes) — treat them as scope destinations, same as `destinations`.
  const urlCities       = params.get('cities')       || '';
  const urlZones        = params.get('zones')        || '';
  const legacyDest      = params.get('destination')  || '';
  const urlLabel        = params.get('destinationLabel') || params.get('label') || '';
  // A specific hotel picked from the home typeahead → restrict results to just that hotel.
  const urlHotelCode    = params.get('hotelCode') || '';

  const { scope, usingDefaultScope } = useMemo(() => {
    // destinations = explicit `destinations` ∪ home-picker `cities`; fall back to the legacy
    // single `destination` only when neither is present (old links still work).
    const dests = [...new Set([...csv(urlDestinations), ...csv(urlCities)])];
    const countries = csv(urlCountries);
    const zones = csv(urlZones);
    const explicit = dests.length ? dests : (legacyDest ? [legacyDest] : []);
    // EMPTY SEARCH → no country and no destination chosen (e.g. the traveller clicked Search on
    // the home page without picking a place). Rather than a blank "pick a destination" wall, we
    // default to a curated set of popular sun destinations that actually have priced inventory,
    // sorted cheapest-first — a "best deals" landing. The traveller refines via the Where filter.
    if (!countries.length && !explicit.length) {
      return { scope: { countries: [], destinations: DEFAULT_DESTINATIONS, zones: [] }, usingDefaultScope: true };
    }
    return { scope: { countries, destinations: explicit, zones }, usingDefaultScope: false };
  }, [urlCountries, urlDestinations, urlCities, urlZones, legacyDest]);
  const scopeKey  = `${scope.countries.join(',')}|${scope.destinations.join(',')}|${scope.zones.join(',')}`;
  // Always have a scope now (the default fills it), so the results page is never blank.
  const hasScope  = scope.countries.length > 0 || scope.destinations.length > 0;

  const defaultCheckIn  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const defaultCheckOut = (() => { const d = new Date(); d.setDate(d.getDate() + 37); return d.toISOString().split('T')[0]; })();

  const initCheckIn  = params.get('checkIn')  || defaultCheckIn;
  const initCheckOut = params.get('checkOut') || defaultCheckOut;
  const initAdults   = params.get('adults')   || '2';
  const initChildren = params.get('children') || '0';
  const initRooms    = params.get('rooms')    || '1';
  const childAges    = params.get('childAges') || '';

  // Travel-time (duration) filter — the day-range band chosen on the home page (e.g. "6-10 days")
  // plus its night bounds, so the results page can offer each individual length within the band
  // (like the reference site's "Travel time" filter) and re-price the search when one is picked.
  const urlDuration  = params.get('duration') || '';
  const urlMinNights = parseInt(params.get('minNights'), 10);
  const urlMaxNights = parseInt(params.get('maxNights'), 10);
  const dayOptions = (Number.isFinite(urlMinNights) && Number.isFinite(urlMaxNights) && urlMaxNights >= urlMinNights)
    ? Array.from({ length: Math.min(9, urlMaxNights - urlMinNights + 1) }, (_, i) => urlMinNights + i)
    : [];
  // The stay length currently searched (nights) — derived from the committed check-in/out so the
  // matching Travel-time option is highlighted.
  const nightsBetween = (ci, co) => {
    if (!ci || !co) return null;
    const n = Math.round((new Date(co + 'T00:00:00Z') - new Date(ci + 'T00:00:00Z')) / 86400000);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Compute in UTC (parse as Z, add in UTC, format from UTC) so the result never shifts a day in
  // a positive-offset timezone — `new Date('..T00:00:00')` is LOCAL and toISOString() is UTC, which
  // silently lands the checkout a day early for e.g. Belgian users.
  const checkOutForNights = (ci, n) => {
    const d = new Date(ci + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
  };

  // Sidebar draft state (not yet fetched)
  const [localCheckIn,  setLocalCheckIn]  = useState(initCheckIn);
  const [localCheckOut, setLocalCheckOut] = useState(initCheckOut);

  // PER-ROOM occupancy. One entry per room, each with its own adults + children + a child age
  // per child. The flat totals the cache needs are DERIVED below.
  const [roomsConfig, setRoomsConfig] = useState(() => {
    const nRooms    = Math.max(1, parseInt(initRooms, 10) || 1);
    const nAdults   = Math.max(1, parseInt(initAdults, 10) || 2);
    const nChildren = Math.max(0, parseInt(initChildren, 10) || 0);
    const ages = childAges ? childAges.split(',').map((a) => parseInt(a, 10)).filter((a) => Number.isFinite(a)) : [];
    const rooms = Array.from({ length: nRooms }, () => ({ adults: 0, children: 0, ages: [] }));
    for (let i = 0; i < nAdults; i++) rooms[i % nRooms].adults++;
    let ai = 0;
    for (let i = 0; i < nChildren; i++) { const r = rooms[i % nRooms]; r.children++; r.ages.push(ages[ai++] ?? CHILD_AGE_DEFAULT); }
    for (const r of rooms) if (r.adults < 1) r.adults = 1;   // every room needs ≥1 adult
    return rooms;
  });

  // Derived flat totals (what the cache query actually uses).
  const totalAdults        = roomsConfig.reduce((s, r) => s + r.adults, 0);
  const totalChildren      = roomsConfig.reduce((s, r) => s + r.children, 0);
  const roomsN             = roomsConfig.length;
  const allChildAges       = roomsConfig.flatMap((r) => r.ages);
  const maxAdultsPerRoom   = Math.max(1, ...roomsConfig.map((r) => r.adults));
  const maxChildrenPerRoom = Math.max(0, ...roomsConfig.map((r) => r.children));

  const changeRoomAdults = (i, delta) => setRoomsConfig((rc) =>
    rc.map((r, idx) => (idx === i ? { ...r, adults: Math.max(1, Math.min(6, r.adults + delta)) } : r)));
  const changeRoomChildren = (i, delta) => setRoomsConfig((rc) =>
    rc.map((r, idx) => {
      if (idx !== i) return r;
      const n = Math.max(0, Math.min(4, r.children + delta));
      const ages = r.ages.slice(0, n);
      while (ages.length < n) ages.push(CHILD_AGE_DEFAULT);
      return { ...r, children: n, ages };
    }));
  const setChildAge = (i, ci, age) => setRoomsConfig((rc) =>
    rc.map((r, idx) => (idx === i ? { ...r, ages: r.ages.map((a, j) => (j === ci ? age : a)) } : r)));
  const addRoom    = () => setRoomsConfig((rc) => (rc.length < 5 ? [...rc, { adults: 2, children: 0, ages: [] }] : rc));
  const removeRoom = (i) => setRoomsConfig((rc) => (rc.length > 1 ? rc.filter((_, idx) => idx !== i) : rc));

  // Committed params that drive the API fetch
  const [fetchParams, setFetchParams] = useState({
    checkIn: initCheckIn, checkOut: initCheckOut,
    adults: initAdults, children: initChildren, rooms: initRooms,
  });

  // Filters can arrive in the URL — the homepage vacation-type cards link into pre-filtered
  // searches, one query param per sidebar filter:
  //   ?boards=AI          board code(s)              (vacation-type cards, popular-dest links)
  //   ?themes=12          holiday type id(s)         (popular-destination links)
  //   ?kids=340           kids amenity code(s)       ("Family Friendly" card)
  //   ?stars=5            star rating(s)
  //   ?facilities=574     facility code(s), group 70
  //   ?accommodation=2    accommodation type code(s), group 20
  //   ?activities=74:620  activity code(s), bare or group-qualified (see actCode)
  //   ?adultsOnly=1       only-adults hotels         ("Adults Only" card)
  //   ?maxBeach=500       max distance (m) to the beach / to the city centre
  // Seeded once, on entry; from then on the sidebar owns them like any other filter.
  //
  // Every value is coerced to the type its facet list uses, because the sidebar checkboxes
  // compare by identity: a string "5" in `stars` still narrows the search but leaves the 5-star
  // box unticked — a half-applied filter the traveller can neither see nor undo.
  const seedFilters = () => {
    const nums = (name) => csv(params.get(name) || '').map((n) => Number(n)).filter((n) => Number.isFinite(n));
    // Distances are single-valued, and 0 metres is indistinguishable from "no bound".
    const metres = (name) => {
      const n = Number(params.get(name));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const boards = csv(params.get('boards') || '')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const themes        = nums('themes');
    const kids          = nums('kids');
    const facilities    = nums('facilities');
    const accommodation = nums('accommodation');
    // A rating outside 1..5 (or a fractional one) has no facet row to tick, so it would narrow
    // the search from a checkbox that does not exist.
    const stars = nums('stars').filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
    // The activities array deliberately mixes both forms: a bare code searches every activity
    // group (legacy), "74:620" pins the group so a code reused across groups 73/74/90 cannot
    // over-match. Same grammar the content API parses, so anything else is dropped here.
    const activities = csv(params.get('activities') || '')
      .map((v) => v.match(/^(?:(\d+):)?(\d+)$/))
      .filter(Boolean)
      .map((m) => (m[1] ? `${m[1]}:${m[2]}` : Number(m[2])));
    const adultsOnly = ['1', 'true', 'yes'].includes((params.get('adultsOnly') || '').toLowerCase());
    const maxBeach  = metres('maxBeach');
    const maxCentre = metres('maxCentre');
    const seed = {
      ...(boards.length        ? { boards } : {}),
      ...(themes.length        ? { themes } : {}),
      ...(kids.length          ? { kids } : {}),
      ...(stars.length         ? { stars } : {}),
      ...(facilities.length    ? { facilities } : {}),
      ...(accommodation.length ? { accommodation } : {}),
      ...(activities.length    ? { activities } : {}),
      ...(adultsOnly           ? { adultsOnly: true } : {}),
      ...(maxBeach  != null    ? { maxBeach } : {}),
      ...(maxCentre != null    ? { maxCentre } : {}),
    };
    // Deriving the guard from the seed itself means a filter added above can never be left out
    // of it and silently ignored.
    return Object.keys(seed).length ? { ...EMPTY_FILTERS, ...seed } : EMPTY_FILTERS;
  };

  // Result filters. `filters` drives the UI (instant); `applied` is the debounced copy.
  // The seed is kept as well, so the "applied from this card" summary can take back off exactly
  // what the URL put on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seeded = useMemo(() => seedFilters(), []);
  const [filters, setFilters] = useState(seeded);
  const [applied, setApplied] = useState(seeded);

  // ── FACETS (from the admin content API over the scope) ──────────────────────────
  // holiday / stars / facilities / activities, each with a hotel count. `facetsStatus`:
  // 'loading' | 'ok' | 'error'. attrMap = hotelCode → attributes (stars, distances).
  const [facets, setFacets]           = useState({ holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [] });
  const [facetsStatus, setFacetsStatus] = useState('loading');
  const [attrMap, setAttrMap]         = useState({});

  // PRICE SCOPE — what the cache actually prices: the matched destinations, plus a hotelCodes
  // restriction when a content facet is active (null = whole scope). Set by the facets
  // resolution below; the price fetch is gated on it.
  const [priceScope, setPriceScope]   = useState(null);

  // Scope selection UI — the cascading picker drafts internally and hands back a
  // committed { countries, destinations, zones } on Apply.
  const [countryOptions, setCountryOptions]   = useState([]);
  const [countriesStatus, setCountriesStatus] = useState('loading');

  const [loading, setLoading]         = useState(true);
  const [filtering, setFiltering]     = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [allHotels, setAllHotels]     = useState([]);
  const [nights, setNights]           = useState(0);
  const [cheapestCode, setCheapestCode] = useState(null);
  // Dynamic board facets from the cache: { boardCode: hotelCount } for THIS search.
  const [boardFacets, setBoardFacets] = useState({});
  // Travel-time filter: { nights: priced-hotel count } for each day option (loaded in background).
  const [durationCounts, setDurationCounts] = useState({});
  const [liked, setLiked]             = useState({});
  const isAuth = useSelector((s) => s.auth?.isAuthenticated);
  const { showToast } = useToast();
  const [drawerOpen, setDrawerOpen]   = useState(false);

  // Load the user's existing favourites so saved hotels show a filled heart.
  useEffect(() => {
    if (!isAuth) return;
    let active = true;
    fetchFavouriteCodes().then((set) => {
      if (!active) return;
      const obj = {};
      set.forEach((code) => { obj[code] = true; });
      setLiked(obj);
    });
    return () => { active = false; };
  }, [isAuth]);

  // Per-card inline slider position: hotelCode → image index (defaults to 0).
  const [cardIdx, setCardIdx] = useState({});
  const cardGo = (code, len, delta) =>
    setCardIdx((m) => ({ ...m, [code]: (((m[code] || 0) + delta) % len + len) % len }));

  // Full-screen photo lightbox. null = closed; otherwise { name, images: string[], index }.
  const [lightbox, setLightbox] = useState(null);
  const openLightbox  = (name, images, startIdx = 0) => {
    if (!images || images.length === 0) return;
    setLightbox({ name, images, index: Math.max(0, Math.min(startIdx, images.length - 1)) });
  };
  const closeLightbox = () => setLightbox(null);
  const lbGo   = (idx) => setLightbox((lb) => (lb ? { ...lb, index: (idx + lb.images.length) % lb.images.length } : lb));
  const lbNext = () => setLightbox((lb) => (lb ? { ...lb, index: (lb.index + 1) % lb.images.length } : lb));
  const lbPrev = () => setLightbox((lb) => (lb ? { ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length } : lb));

  // Keyboard nav (← → Esc) + lock body scroll while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') lbNext();
      else if (e.key === 'ArrowLeft') lbPrev();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  // Upper bound of the price sliders, in the currently-selected price basis. null = not
  // discovered yet. Reset to null (never merely lowered) when the search or basis changes.
  const [priceCeiling, setPriceCeiling] = useState(null);

  // Lazy hotel-info loading
  const [infoMap, setInfoMap]         = useState({});
  const infoLoadingRef = useRef(new Set());
  const sentinelRef    = useRef(null);

  // Pagination state tracked in refs to avoid stale closures in async callbacks
  const paginationRef  = useRef({ page: 1, hasMore: true, fetching: false });
  const seenCodesRef   = useRef(new Set());

  // Debounce the UI filters into the committed set that actually drives fetching.
  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Load the country list once (only countries that actually have hotels).
  useEffect(() => {
    let live = true;
    fetchCountries()
      .then((c) => { if (live) { setCountryOptions(c); setCountriesStatus('ok'); } })
      .catch(() => { if (live) setCountriesStatus('error'); });
    return () => { live = false; };
  }, []);

  // ── FACETS RESOLUTION ──────────────────────────────────────────────────────────
  // When the scope OR the selected content facets change, ask the admin content API for the
  // facet counts + the matching hotelCodes (narrowed by the selected facets) + the matched
  // destinations. Sets `facets` (counts stay scope-level so options never vanish), `attrMap`
  // (for distance sorts) and `priceScope` (what the cache prices). Keyed on a STRING of the
  // content facets so it can't loop.
  const EMPTY_FACETS = { holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [] };
  const contentKey = [
    applied.themes.join(','), applied.stars.join(','), applied.facilities.join(','), applied.activities.join(','),
    applied.accommodation.join(','), applied.kids.join(','), applied.maxBeach, applied.maxCentre,
    applied.adultsOnly ? '1' : '',
  ].join('|');
  // What this request actually needs back (the response is ~1 MB with both for a country
  // search, ~7 KB with neither):
  //   codes — only when a content facet is on; that is the only time the cache is restricted
  //           to a hotelCode set. A pinned ?hotelCode= supplies its own single code.
  //   attrs — only for a distance sort, the one thing computed client-side from them.
  // A ZONE scope must restrict the priced set, not just the facet counts: with hotelCodes left
  // null the cache prices the whole city, so picking the area "Side" would quietly return every
  // hotel in Antalya. The admin narrows the codes by the (destination, zone) pair for us.
  const needCodes = hasContentFacet(applied) || scope.zones.length > 0;
  const needAttrs = applied.sortBy === 'distance_beach' || applied.sortBy === 'distance_centre';
  useEffect(() => {
    if (!hasScope) return;   // nothing to resolve; the page-1 effect handles the empty state
    let live = true;
    const ctrl = new AbortController();
    setFacetsStatus('loading');
    const selected = {
      themes: applied.themes, stars: applied.stars,
      facilities: applied.facilities, activities: applied.activities,
      accommodation: applied.accommodation, kids: applied.kids,
      maxBeach: applied.maxBeach, maxCentre: applied.maxCentre,
      adultsOnly: applied.adultsOnly,
    };
    fetchFacets(scope, selected, { codes: needCodes, attrs: needAttrs, signal: ctrl.signal })
      .then((r) => {
        if (!live) return;
        setFacets(r.facets || EMPTY_FACETS);
        // Keep the previous map when this request didn't ask for attributes — clearing it
        // would drop the distances a still-open distance sort is ordering by.
        if (r.attributes) setAttrMap(r.attributes);
        else if (!needAttrs) setAttrMap({});
        const dests = (r.matchedDestinations && r.matchedDestinations.length)
          ? r.matchedDestinations
          : scope.destinations;                        // fallback if admin returned none
        setPriceScope({
          destinations: dests,
          // A specific hotel (typeahead) pins the result to just that hotel. Otherwise restrict
          // the cache to the resolved hotelCodes only when a content facet is active.
          hotelCodes: urlHotelCode ? [urlHotelCode] : (needCodes ? (r.hotelCodes || []) : null),
          // Empty-search teaser → fast external-only path (avoids the slow Diana leg that 502s);
          // a real, place-specific search keeps the full combined supplier set.
          source: usingDefaultScope ? 'external' : 'combined',
        });
        setFacetsStatus('ok');
      })
      .catch((err) => {
        // A superseded request was cancelled on purpose — not an error, and the newer one owns
        // the state now.
        if (!live || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        setFacets(EMPTY_FACETS);
        setAttrMap({});
        setFacetsStatus('error');
        // Admin down: still price the scope's explicit destinations (content facets can't apply).
        setPriceScope({
          destinations: scope.destinations,
          hotelCodes: urlHotelCode ? [urlHotelCode] : (needCodes ? [] : null),
          source: usingDefaultScope ? 'external' : 'combined',
        });
      });
    return () => { live = false; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, contentKey, urlHotelCode, needCodes, needAttrs]);

  // Refs so loadMore always sees latest values
  const fetchParamsRef = useRef(fetchParams);
  const childAgesRef   = useRef(childAges);
  const appliedRef     = useRef(applied);
  const priceScopeRef  = useRef(priceScope);
  useEffect(() => { fetchParamsRef.current = fetchParams; }, [fetchParams]);
  useEffect(() => { childAgesRef.current   = childAges; },   [childAges]);
  useEffect(() => { appliedRef.current     = applied; },     [applied]);
  useEffect(() => { priceScopeRef.current  = priceScope; },  [priceScope]);

  // Only ever *raise* the slider ceiling, and only from a price-unfiltered response.
  const growCeiling = (amounts) => {
    if (!amounts.length) return;
    const rounded = Math.ceil(Math.max(...amounts) / PRICE_STEP) * PRICE_STEP;
    setPriceCeiling((prev) => Math.max(prev ?? 0, rounded, PRICE_STEP));
  };

  // Build the cheapest request. Returns { url, opts } for fetch(). Uses POST (JSON body) when
  // the hotelCodes set or the destination list would make the URL too long; else GET.
  // `over` overrides fields for the Travel-time count queries: { checkOut, pageSize }.
  const buildRequest = (fp, ps, ca, page, f, over = {}) => {
    const roomsCount = Math.max(1, parseInt(fp.rooms, 10) || 1);
    const maxA = fp.maxAdultsPerRoom   ?? String(Math.ceil((parseInt(fp.adults, 10)   || 1) / roomsCount));
    const maxC = fp.maxChildrenPerRoom ?? String(Math.ceil((parseInt(fp.children, 10) || 0) / roomsCount));

    const body = {
      destinations:       ps.destinations,
      checkIn:            fp.checkIn,
      checkOut:           over.checkOut ?? fp.checkOut,
      adults:             fp.adults,
      children:           fp.children,
      rooms:              String(roomsCount),
      limit:              String(over.pageSize ?? PAGE_SIZE),
      pageSize:           String(over.pageSize ?? PAGE_SIZE),
      page:               String(page),
      // 'combined' searches BOTH the external cache (Hotelbeds) and the internal supplier
      // (Diana, over SOAP). Diana is the slow half: an 8-destination combined search measured
      // ~17s COLD and tripped the cache gateway's timeout → the 502 on the empty-search
      // landing. The landing is a "popular deals" teaser, so it uses the external cache only
      // (~2s, reliable); a real, place-specific search keeps 'combined' for full coverage.
      source:             ps.source || 'combined',
      maxAdultsPerRoom:   maxA,
      maxChildrenPerRoom: maxC,
    };
    const ages = fp.childAges || ca;
    if (ages) body.childAges = ages;

    if (f.boards.length)    body.boards    = f.boards;
    if (f.roomTypes.length) body.roomTypes = f.roomTypes;

    const min = f.minPrice === '' ? null : Number(f.minPrice);
    const max = f.maxPrice === '' ? null : Number(f.maxPrice);
    if (Number.isFinite(min) && min > 0)  body.minPrice = String(min);
    if (Number.isFinite(max) && max > 0 && !(min != null && max < min)) body.maxPrice = String(max);
    if (f.priceBasis !== 'total') body.priceBasis = f.priceBasis;
    if (f.refundable !== 'any')   body.refundable = f.refundable;
    if (f.sortBy === 'price_desc') body.sortBy = 'price_desc';
    if (f.transport === 'package') body.searchType = 'PACKAGE';

    // Content-filter hand-off. An empty resolved set means "facets selected but nothing matched"
    // → send a sentinel so the cache returns nothing (rather than the whole scope). null = no
    // content filter → omitted.
    if (Array.isArray(ps.hotelCodes)) {
      body.hotelCodes = ps.hotelCodes.length ? ps.hotelCodes : ['__none__'];
    }

    const codeCount = Array.isArray(ps.hotelCodes) ? ps.hotelCodes.length : 0;
    const usePost = codeCount > LARGE_CODES || ps.destinations.length > MANY_DESTINATIONS;
    if (usePost) {
      return {
        url: `${CONTRACTS_API}/contracts/cheapest`,
        opts: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      };
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) qs.set(k, Array.isArray(v) ? v.join(',') : v);
    return { url: `${CONTRACTS_API}/contracts/cheapest?${qs.toString()}`, opts: {} };
  };

  const mapContract = (c, label) => {
    // The cache returns `boardCode` on external results but `board` on internal ones.
    const bc = (c.boardCode ?? c.board ?? '') || '';
    return {
      id:           c.hotelCode,
      hotelCode:    c.hotelCode,
      name:         c.hotelName ?? `Hotel ${c.hotelCode}`,
      stars:        null,
      board:        getBoardLabel(bc),
      boardCode:    bc,
      boardTags:    bc ? [getBoardLabel(bc)] : [],
      roomType:     c.roomType,
      roomLabel:    getRoomLabel(c.roomType),
      characteristic: c.characteristic,
      classification: c.classification,
      refundable:   c.refundable,
      contractName: c.contractName,
      totalAmount:  c.totalAmount,
      perPerson:    c.perPerson,
      currency:     c.currency,
      nightlyBreakdown: c.nightlyBreakdown || [],
      badge:        null,
      img:          FALLBACK_IMG,
      loc:          label,
    };
  };

  // Scope label for the hero. Default (empty) search → "Popular destinations";
  // a single place → its name; otherwise "N places".
  const scopeLabel = useMemo(() => {
    if (usingDefaultScope) return 'Popular destinations';
    if (urlLabel) return urlLabel;
    const names = countryOptions.reduce((m, c) => { m[c.code] = c.name; return m; }, {});
    const parts = [
      ...scope.countries.map((c) => names[c] || c),
      ...scope.destinations,
    ];
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts.length} places`;
  }, [usingDefaultScope, urlLabel, scope, countryOptions]);

  // "A different search" (vs. a different filter): scope or head-counts/dates changed.
  const searchKey = `${scopeKey}|${fetchParams.checkIn}|${fetchParams.checkOut}|${fetchParams.adults}|${fetchParams.children}|${fetchParams.rooms}|${fetchParams.childAges ?? childAges}`;
  const prevSearchKeyRef = useRef(null);

  // A price bound is only meaningful for the search it was chosen in. Clear it on a search change
  // (adjusting state during render — React's documented pattern for reacting to changed inputs).
  const [priceSearchKey, setPriceSearchKey] = useState(searchKey);
  if (priceSearchKey !== searchKey) {
    setPriceSearchKey(searchKey);
    if (filters.minPrice !== '' || filters.maxPrice !== '') {
      const cleared = { ...filters, minPrice: '', maxPrice: '' };
      setFilters(cleared);
      setApplied(cleared);
    }
  }

  // Monotonic request id — a slow response from an earlier state must never overwrite a newer one.
  const reqIdRef = useRef(0);

  // Price-scope key so the fetch effect re-runs when the resolved scope changes.
  const priceScopeKey = priceScope
    ? `${priceScope.destinations.join(',')}|${priceScope.hotelCodes ? priceScope.hotelCodes.length + ':' + priceScope.hotelCodes.slice(0, 3).join(',') : 'all'}`
    : null;

  // Page-1 fetch. Re-runs on a new search, on a committed filter change, and once the price
  // scope is resolved from the facets step.
  useEffect(() => {
    if (!hasScope) {
      setAllHotels([]); setHasMore(false); setLoading(false); setFiltering(false);
      return;
    }
    if (!priceScope) return;                       // wait for facets resolution
    if (!priceScope.destinations.length) {         // scope resolved to nothing to price
      setAllHotels([]); setBoardFacets({}); setHasMore(false); setLoading(false); setFiltering(false);
      return;
    }

    const isNewSearch = prevSearchKeyRef.current !== searchKey;
    prevSearchKeyRef.current = searchKey;

    if (isNewSearch) {
      setLoading(true);
      setAllHotels([]);
      setInfoMap({});
      setPriceCeiling(null);
      infoLoadingRef.current = new Set();
    } else {
      setFiltering(true);
    }
    setHasMore(true);
    seenCodesRef.current  = new Set();
    paginationRef.current = { page: 1, hasMore: true, fetching: true };

    const reqId = ++reqIdRef.current;
    const { url, opts } = buildRequest(fetchParams, priceScope, childAges, 1, applied);
    console.log('[Results] Page 1 fetch:', opts.method || 'GET', url);

    const ctrl = new AbortController();
    fetch(url, { ...opts, signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (reqId !== reqIdRef.current) return;
        const results = data.results || [];
        setNights(data.nights || 0);
        setBoardFacets(data.boardFacets || {});
        setCheapestCode(applied.sortBy === 'price_asc' ? (data.cheapest?.hotelCode ?? null) : null);

        const seen   = seenCodesRef.current;
        const mapped = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) { seen.add(c.hotelCode); mapped.push(mapContract(c, scopeLabel)); }
        }
        if (applied.minPrice === '' && applied.maxPrice === '') {
          growCeiling(mapped.map((h) => (applied.priceBasis === 'perPerson' ? h.perPerson : h.totalAmount)).filter((n) => Number.isFinite(n)));
        }
        const more = data.hasMore ?? (results.length >= PAGE_SIZE);
        paginationRef.current = { page: 2, hasMore: more, fetching: false };
        setHasMore(more);
        setAllHotels(mapped);
        setLoading(false);
        setFiltering(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError' || reqId !== reqIdRef.current) return;
        console.error('[Results] Contracts API error:', err);
        setAllHotels([]); setHasMore(false); setLoading(false); setFiltering(false);
        paginationRef.current = { page: 1, hasMore: false, fetching: false };
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, fetchParams, applied, priceScopeKey]);

  // TRAVEL-TIME COUNTS. For each day option in the band, price the same scope at that stay length
  // (in the background) and record how many hotels come back — the number shown next to each
  // duration, like the reference site's "Travel time" filter. Non-blocking: options render
  // immediately and each count fills in as its request returns. Re-runs when the search context
  // (scope, departure, occupancy, filters) changes so the counts stay honest.
  const appliedKey = JSON.stringify(applied);
  useEffect(() => {
    if (!priceScope || !priceScope.destinations.length || !dayOptions.length || !fetchParams.checkIn) {
      setDurationCounts({});
      return;
    }
    let live = true;
    setDurationCounts({});
    dayOptions.forEach((n) => {
      const { url, opts } = buildRequest(fetchParams, priceScope, childAges, 1, applied, {
        checkOut: checkOutForNights(fetchParams.checkIn, n), pageSize: 100,
      });
      fetch(url, opts)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (live && data) setDurationCounts((prev) => ({ ...prev, [n]: data.total ?? 0 })); })
        .catch(() => { /* a single duration's count failing shouldn't break the filter */ });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceScopeKey, fetchParams.checkIn, fetchParams.adults, fetchParams.children, fetchParams.rooms, fetchParams.childAges, appliedKey, urlDuration]);

  // Load next page from API
  const loadMore = useCallback(() => {
    const pg = paginationRef.current;
    if (!pg.hasMore || pg.fetching) return;
    const ps = priceScopeRef.current;
    if (!ps || !ps.destinations.length) return;

    paginationRef.current = { ...pg, fetching: true };
    setFetchingMore(true);

    const fp  = fetchParamsRef.current;
    const ca  = childAgesRef.current;
    const f   = appliedRef.current;
    const reqId = reqIdRef.current;

    const { url, opts } = buildRequest(fp, ps, ca, pg.page, f);
    console.log('[Results] Load more (page=' + pg.page + '):', opts.method || 'GET', url);

    fetch(url, opts)
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((data) => {
        if (reqId !== reqIdRef.current) return;
        const results = data.results || [];
        const seen    = seenCodesRef.current;
        const newCards = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) { seen.add(c.hotelCode); newCards.push(c); }
        }
        if (newCards.length > 0) {
          const mapped = newCards.map((c) => mapContract(c, scopeLabel));
          setAllHotels((prev) => [...prev, ...mapped]);
          if (f.minPrice === '' && f.maxPrice === '') {
            growCeiling(mapped.map((h) => (f.priceBasis === 'perPerson' ? h.perPerson : h.totalAmount)).filter((n) => Number.isFinite(n)));
          }
        }
        const more = data.hasMore ?? (results.length >= PAGE_SIZE);
        paginationRef.current = { page: pg.page + 1, hasMore: more, fetching: false };
        setHasMore(more);
        setFetchingMore(false);
      })
      .catch((err) => {
        if (reqId !== reqIdRef.current) return;
        console.error('[Results] Load more error:', err);
        paginationRef.current = { ...paginationRef.current, fetching: false };
        setFetchingMore(false);
      });
  }, [scopeLabel]);

  // Client-side sorts (name / stars / distance) over the loaded results. Price sorts are done by
  // the cache; these reorder what's loaded, using the info/attribute data as it arrives.
  const hotels = useMemo(() => {
    const sb = applied.sortBy;
    const distField = sb === 'distance_beach' ? 'beachMetres' : sb === 'distance_centre' ? 'centreMetres' : null;
    if (distField) {
      const dist = (h) => {
        const v = attrMap[String(h.hotelCode)]?.[distField];
        return typeof v === 'number' && v >= 0 ? v : Infinity;
      };
      return [...allHotels].sort((a, b) => dist(a) - dist(b));
    }
    if (sb === 'name_asc' || sb === 'name_desc') {
      const nameOf = (h) => (infoMap[String(h.hotelCode)]?.name || h.name || '').trim();
      const dir = sb === 'name_asc' ? 1 : -1;
      return [...allHotels].sort((a, b) => dir * nameOf(a).localeCompare(nameOf(b), 'en', { sensitivity: 'base' }));
    }
    if (sb === 'stars_asc' || sb === 'stars_desc') {
      const starsOf = (h) => Number(infoMap[String(h.hotelCode)]?.stars ?? attrMap[String(h.hotelCode)]?.stars ?? 0) || 0;
      const dir = sb === 'stars_desc' ? -1 : 1;
      // Tie-break by name so equal-star hotels keep a stable, readable order.
      const nameOf = (h) => (infoMap[String(h.hotelCode)]?.name || h.name || '').trim();
      return [...allHotels].sort((a, b) => dir * (starsOf(a) - starsOf(b)) || nameOf(a).localeCompare(nameOf(b), 'en', { sensitivity: 'base' }));
    }
    return allHotels;
  }, [allHotels, applied.sortBy, attrMap, infoMap]);

  // Lazily load real hotel info (name/images/stars) for all visible hotels
  useEffect(() => {
    const need = hotels.map((h) => String(h.hotelCode)).filter((code) => !infoMap[code] && !infoLoadingRef.current.has(code));
    if (need.length === 0) return;
    need.forEach((c) => infoLoadingRef.current.add(c));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CONTRACTS_API}/hotels/bulk`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hotelCodes: need }),
        });
        if (res.ok) {
          const data = await res.json();
          const add = {};
          for (const info of (data?.data ?? [])) add[String(info.hotelCode)] = info;
          if (!cancelled && Object.keys(add).length) setInfoMap((prev) => ({ ...prev, ...add }));
        }
      } catch (e) {
        console.warn('[Results] Hotel info bulk failed:', e);
      } finally {
        need.forEach((c) => infoLoadingRef.current.delete(c));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels]);

  // Infinite scroll — IntersectionObserver on sentinel.
  useEffect(() => {
    if (loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore, allHotels.length, loadMore]);

  // Deep link to the hotel/package detail page. The card opens it in a NEW TAB, and a new
  // tab can't receive react-router's in-memory `state` — so the whole search context rides
  // in the URL instead. HotelDetail reads these as its fallback and refetches the hotel
  // content itself, which also makes the detail page shareable/bookmarkable.
  const detailHref = (h, name, starsVal, dest, img) => {
    const qs = new URLSearchParams({
      checkIn:  fetchParams.checkIn,
      checkOut: fetchParams.checkOut,
      adults:   fetchParams.adults,
      children: fetchParams.children,
      rooms:    fetchParams.rooms,
      nights:   String(nights || 7),
    });
    if (dest)       qs.set('destination', dest);
    if (name)       qs.set('name', name);
    if (img)        qs.set('img', img);
    if (h.loc)      qs.set('loc', h.loc);
    if (starsVal)   qs.set('stars', String(starsVal));
    if (h.currency) qs.set('currency', h.currency);
    if (Number.isFinite(Number(h.totalAmount))) qs.set('total', String(h.totalAmount));
    const ages = childAgesRef.current;
    if (ages) qs.set('childAges', ages);
    return `/hotel/${h.hotelCode}?${qs.toString()}`;
  };

  const toggleLike = (hotelCode, snapshot) => {
    if (!isAuth) { showToast('Sign in to save favourites', 'info'); navigate('/login'); return; }
    const wasLiked = !!liked[hotelCode];
    setLiked((prev) => ({ ...prev, [hotelCode]: !wasLiked }));   // optimistic
    // Capture the hotel's destination code (carried on the snapshot) so the Favourites
    // screen can re-open it with a working live-price search (see utils/favDest).
    if (!wasLiked && snapshot.destinationCode) rememberDestCode(hotelCode, snapshot.destinationCode);
    const req = wasLiked ? removeFavourite(hotelCode) : addFavourite(snapshot);
    req
      .then(() => showToast(wasLiked ? 'Removed from favourites' : 'Added to favourites', 'success'))
      .catch(() => {
        setLiked((prev) => ({ ...prev, [hotelCode]: wasLiked }));
        showToast('Couldn’t update favourites. Please try again.', 'error');
      });
  };

  // Toggle a code in one of the multi-select filter arrays (boards / roomTypes / stars / facilities / activities / themes).
  const toggleCode = (key, code) => setFilters((f) => ({
    ...f,
    [key]: f[key].includes(code) ? f[key].filter((x) => x !== code) : [...f[key], code],
  }));

  // An activities entry is either a bare code (620) or a group-qualified string ("74:620").
  const actCode = (v) => Number(String(v).split(':').pop());
  // Identity has to carry the group, because the activity groups REUSE codes: 620 is Spa centre
  // in group 74 and Waterpark in 73, 410 is Hot tub in 74 and Surfing in 90. Matching on the code
  // alone would tick Waterpark's box for a spa filter and, worse, make one click on that box strip
  // the spa filter the traveller never chose to remove. A bare entry is the legacy "this code in
  // any activity group", so it still matches every row sharing it.
  const actMatches = (entry, row) => (
    String(entry).includes(':')
      ? String(entry) === `${row.groupCode}:${row.code}`
      : actCode(entry) === row.code
  );

  // Ticking a row stores the QUALIFIED form whenever the facet knows its group, so the result set
  // finally agrees with the hotel count printed beside the box.
  const toggleActivity = (f) => setFilters((prev) => ({
    ...prev,
    activities: prev.activities.some((a) => actMatches(a, f))
      ? prev.activities.filter((a) => !actMatches(a, f))
      : [...prev.activities, f.groupCode ? `${f.groupCode}:${f.code}` : f.code],
  }));

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  // Distance is single-select per type: re-picking the active bucket clears it ("Any distance").
  const setMaxDistance = (key, metres) => setFilter(key, filters[key] === metres ? '' : metres);

  const setPriceBasis = (value) => {
    if (filters.priceBasis === value) return;
    setPriceCeiling(null);
    setFilters((f) => ({ ...f, priceBasis: value, minPrice: '', maxPrice: '' }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // ── "APPLIED FROM THIS CARD" ───────────────────────────────────────────────────
  // Which keys the entry URL seeded — every other key still holds its EMPTY_FILTERS value.
  const seededKeys = useMemo(
    () => Object.keys(EMPTY_FILTERS).filter((k) => (
      Array.isArray(seeded[k]) ? seeded[k].length > 0 : seeded[k] !== EMPTY_FILTERS[k]
    )),
    [seeded]
  );
  // The card ships its own wording (`cardLabel` + `filterLabels`) so the results page never has
  // to fetch the facility catalogue just to say what it applied. Links written before those
  // params existed carry neither, hence the fallback to the facet lists — which can only name a
  // code once the facets have resolved, so the summary fills in rather than blocking.
  const cardSummary = useMemo(() => {
    if (!seededKeys.length) return null;
    const named = (list, code) => list.find((x) => x.code === code)?.name;
    const given = (params.get('filterLabels') || '').split('|').map((s) => s.trim()).filter(Boolean);
    const labels = given.length ? given : seededKeys.flatMap((k) => {
      const v = seeded[k];
      switch (k) {
        case 'boards':        return v.map(getBoardLabel);
        case 'stars':         return v.map((n) => `${'★'.repeat(n)} ${n}-star`);
        case 'themes':        return v.map((id) => facets.holiday.find((t) => t.id === id)?.name);
        case 'facilities':    return v.map((c) => named(facets.facilities, c));
        case 'accommodation': return v.map((c) => cap(named(facets.accommodation, c)));
        case 'kids':          return v.map((c) => named(facets.kids, c));
        case 'activities':    return v.map((a) => facets.activities.find((x) => actMatches(a, x))?.name);
        case 'adultsOnly':    return ['Adults only'];
        case 'maxBeach':      return [`Beach ${metresLabel(v)}`];
        case 'maxCentre':     return [`Centre ${metresLabel(v)}`];
        default:              return [];
      }
    }).filter(Boolean);
    const title = params.get('cardLabel') || params.get('boardLabel') || '';
    return title || labels.length ? { title, labels } : null;
  }, [seededKeys, seeded, params, facets]);
  // The summary must never claim a filter that is no longer on, so it disappears as soon as one
  // of the card's values is unticked — including via Clear all.
  const cardApplied = !!cardSummary && seededKeys.every((k) => (
    Array.isArray(seeded[k]) ? seeded[k].every((v) => filters[k].includes(v)) : filters[k] === seeded[k]
  ));
  // Removing it takes off exactly what the card applied; anything ticked since stays — so an array
  // key loses only the seeded values, not the whole group.
  const clearCardFilters = () => setFilters((f) => {
    const next = { ...f };
    for (const k of seededKeys) {
      if (!Array.isArray(seeded[k])) { next[k] = EMPTY_FILTERS[k]; continue; }
      next[k] = k === 'activities'
        ? f[k].filter((v) => !seeded[k].some((s) => actCode(s) === actCode(v)))
        : f[k].filter((v) => !seeded[k].includes(v));
    }
    return next;
  });

  const ceiling = priceCeiling ?? PRICE_CEILING_FALLBACK;
  const sliderMin = filters.minPrice === '' ? 0 : Math.min(Number(filters.minPrice), ceiling);
  const sliderMax = filters.maxPrice === '' ? ceiling : Math.min(Number(filters.maxPrice), ceiling);
  const onMinPrice = (raw) => {
    const v = Math.max(0, Math.min(Number(raw), sliderMax - PRICE_STEP));
    setFilter('minPrice', v <= 0 ? '' : String(v));
  };
  const onMaxPrice = (raw) => {
    const v = Math.min(ceiling, Math.max(Number(raw), sliderMin + PRICE_STEP));
    setFilter('maxPrice', v >= ceiling ? '' : String(v));
  };

  const activeCount = countActiveFilters(filters);
  const currency    = allHotels[0]?.currency || 'EUR';
  const priceLabel  = (n) => `${currency} ${Math.round(n).toLocaleString()}`;

  const applySearch = () => {
    setFetchParams((prev) => ({
      ...prev,
      checkIn:  localCheckIn,
      checkOut: localCheckOut,
      adults:   String(totalAdults),
      children: String(totalChildren),
      rooms:    String(roomsN),
      childAges:          allChildAges.join(','),
      maxAdultsPerRoom:   String(maxAdultsPerRoom),
      maxChildrenPerRoom: String(maxChildrenPerRoom),
    }));
  };

  // The stay length (nights) the current search is priced for — highlights the matching
  // Travel-time option.
  const searchedNights = nightsBetween(fetchParams.checkIn, fetchParams.checkOut);

  // Travel-time filter: pick a specific stay length within the band → re-price at that duration
  // (keeps the check-out date picker in sync). Clicking the active length is a no-op.
  const applyDuration = (n) => {
    if (n === searchedNights) return;
    const checkOut = checkOutForNights(fetchParams.checkIn, n);
    setLocalCheckOut(checkOut);
    setFetchParams((prev) => ({ ...prev, checkOut }));
  };

  // Apply the picked scope — re-navigate the results page (keeps dates + occupancy, shareable URL).
  const applyScope = ({ countries, destinations, zones }) => {
    if (!countries.length && !destinations.length) return;
    const qp = new URLSearchParams();
    if (countries.length)    qp.set('countries', countries.join(','));
    if (destinations.length) qp.set('destinations', destinations.join(','));
    if (zones.length)        qp.set('zones', zones.join(','));
    qp.set('checkIn', fetchParams.checkIn);
    qp.set('checkOut', fetchParams.checkOut);
    qp.set('adults', fetchParams.adults);
    qp.set('children', fetchParams.children);
    qp.set('rooms', fetchParams.rooms);
    if (fetchParams.childAges) qp.set('childAges', fetchParams.childAges);
    navigate({ search: qp.toString() });
  };

  const guestSummary = `${fetchParams.adults} Adult${fetchParams.adults !== '1' ? 's' : ''}${fetchParams.children !== '0' ? `, ${fetchParams.children} Child${fetchParams.children !== '1' ? 'ren' : ''}` : ''}`;

  const heroChips = [];
  if (fetchParams.checkIn && fetchParams.checkOut) {
    heroChips.push({ icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', text: `${fmtDate(fetchParams.checkIn)} — ${fmtDate(fetchParams.checkOut)}` });
  }
  if (nights > 0) heroChips.push({ icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z', text: `${nights} nights` });
  heroChips.push({ icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75', text: guestSummary });

  const sidebar = (
    <>
      {/* Dates & Guests — re-calls API */}
      <FilterSection title="Dates & Guests" defaultOpen>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-in</label>
          <input type="date" className={styles.dateInput} value={localCheckIn} min={new Date().toISOString().split('T')[0]} onChange={(e) => setLocalCheckIn(e.target.value)} />
        </div>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-out</label>
          <input type="date" className={styles.dateInput} value={localCheckOut} min={localCheckIn || new Date().toISOString().split('T')[0]} onChange={(e) => setLocalCheckOut(e.target.value)} />
        </div>
        {roomsConfig.map((room, i) => (
          <div key={i} className={styles.roomBlock}>
            <div className={styles.roomHead}>
              <span className={styles.roomTitle}>Room {i + 1}</span>
              {roomsConfig.length > 1 && (
                <button type="button" className={styles.roomRemove} onClick={() => removeRoom(i)}>Remove</button>
              )}
            </div>
            <div className={styles.guestRow}>
              <span className={styles.guestLabel}>Adults</span>
              <div className={styles.guestCounter}>
                <button className={styles.guestBtn} onClick={() => changeRoomAdults(i, -1)}>−</button>
                <span className={styles.guestNum}>{room.adults}</span>
                <button className={styles.guestBtn} onClick={() => changeRoomAdults(i, +1)}>+</button>
              </div>
            </div>
            <div className={styles.guestRow}>
              <span className={styles.guestLabel}>Children</span>
              <div className={styles.guestCounter}>
                <button className={styles.guestBtn} onClick={() => changeRoomChildren(i, -1)}>−</button>
                <span className={styles.guestNum}>{room.children}</span>
                <button className={styles.guestBtn} onClick={() => changeRoomChildren(i, +1)}>+</button>
              </div>
            </div>
            {room.children > 0 && (
              <div className={styles.childAges}>
                {room.ages.map((age, ci) => (
                  <label key={ci} className={styles.childAge}>
                    <span>Child {ci + 1} age</span>
                    <select value={age} onChange={(e) => setChildAge(i, ci, parseInt(e.target.value, 10))}>
                      {Array.from({ length: 18 }, (_, a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        {roomsConfig.length < 5 && (
          <button type="button" className={styles.addRoomBtn} onClick={addRoom}>+ Add room</button>
        )}
        <button className={styles.applyBtn} onClick={applySearch}>
          <Icon d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" size={13} sw={2.2} />
          Update Search
        </button>
      </FilterSection>

      {/* TRAVEL TIME — the duration band chosen on the home page, with each individual stay length
          inside it (like the reference site). Picking one re-prices at that exact duration; the
          count shows how many hotels are available for that length in the current search. */}
      {dayOptions.length > 0 && (
        <FilterSection title="Travel time" defaultOpen>
          {urlDuration && <div className={styles.travelBand}>{urlDuration}</div>}
          {dayOptions.map((n) => (
            <FilterCheck
              key={n}
              label={`${n} days${durationCounts[n] != null ? ` (${durationCounts[n].toLocaleString()})` : ''}`}
              checked={searchedNights === n}
              onChange={() => applyDuration(n)}
            />
          ))}
        </FilterSection>
      )}

      {/* WHERE — multi-country / multi-destination scope. Pick whole countries and/or
          individual destinations, then Apply. */}
      <FilterSection title="Where" defaultOpen>
        <ScopePicker
          countries={countryOptions}
          status={countriesStatus}
          value={scope}
          onApply={applyScope}
        />
      </FilterSection>

      {/* Price Range */}
      <FilterSection title="Price Range" defaultOpen>
        <div className={styles.priceSliderWrap}>
          <div className={styles.priceDual}>
            <div className={styles.priceDualTrack}>
              <div className={styles.priceDualFill} style={{ left: `${(sliderMin / ceiling) * 100}%`, right: `${100 - (sliderMax / ceiling) * 100}%` }} />
            </div>
            <input type="range" className={`${styles.filterRange} ${styles.rangeDual}`} min={0} max={ceiling} step={PRICE_STEP} value={sliderMin} onChange={(e) => onMinPrice(e.target.value)} aria-label="Minimum price" />
            <input type="range" className={`${styles.filterRange} ${styles.rangeDual}`} min={0} max={ceiling} step={PRICE_STEP} value={sliderMax} onChange={(e) => onMaxPrice(e.target.value)} aria-label="Maximum price" />
          </div>
          <div className={styles.priceSliderLabels}>
            <span>{priceLabel(0)}</span>
            <span className={styles.priceSliderCurrent}>{priceLabel(sliderMin)} – {priceLabel(sliderMax)}{filters.maxPrice === '' ? '+' : ''}</span>
            <span>{priceLabel(ceiling)}</span>
          </div>
        </div>
        <Segmented options={PRICE_BASIS_OPTIONS} value={filters.priceBasis} onChange={setPriceBasis} ariaLabel="Price basis" />
      </FilterSection>

      {/* Transport type */}
      <FilterSection title="Transport" defaultOpen>
        <Segmented options={TRANSPORT_OPTIONS} value={filters.transport} onChange={(v) => setFilter('transport', v)} ariaLabel="Transport type" />
      </FilterSection>

      {/* Holiday Type — DYNAMIC from the admin facets (only themes that apply to the scope, with counts). */}
      <FilterSection title="Holiday Type" defaultOpen>
        {facetsStatus === 'error' ? (
          <p className={styles.filterEmpty}>Holiday types unavailable (content service unreachable).</p>
        ) : facetsStatus === 'loading' && facets.holiday.length === 0 ? (
          <p className={styles.filterEmpty}>Loading holiday types…</p>
        ) : facets.holiday.length === 0 ? (
          <p className={styles.filterEmpty}>No holiday types for this search.</p>
        ) : (
          <FacetList
            items={facets.holiday}
            isChecked={(t) => filters.themes.includes(t.id)}
            render={(t) => (
              <FilterCheck
                key={t.id}
                label={`${t.icon ? `${t.icon} ` : ''}${t.name} (${t.hotels})`}
                checked={filters.themes.includes(t.id)}
                onChange={() => toggleCode('themes', t.id)}
              />
            )}
          />
        )}
      </FilterSection>

      {/* Star Rating — DYNAMIC from the admin facets, with counts. */}
      <FilterSection title="Star Rating" defaultOpen>
        {facets.stars.length === 0 ? (
          <p className={styles.filterEmpty}>{facetsStatus === 'loading' ? 'Loading…' : 'No star data for this search.'}</p>
        ) : (
          facets.stars.map((s) => (
            <FilterCheck
              key={s.stars}
              label={`${'★'.repeat(s.stars)} ${s.stars}-star (${s.hotels})`}
              checked={filters.stars.includes(s.stars)}
              onChange={() => toggleCode('stars', s.stars)}
            />
          ))
        )}
      </FilterSection>

      {/* Accommodation Type — DYNAMIC from the admin facets (group 20), with counts. OR-within
          (a hotel IS one type), so ticking several widens to "any of these". */}
      <FilterSection title="Accommodation Type" defaultOpen={false}>
        {facets.accommodation.length === 0 ? (
          <p className={styles.filterEmpty}>{facetsStatus === 'loading' ? 'Loading…' : 'No accommodation data for this search.'}</p>
        ) : (
          <FacetList
            items={facets.accommodation}
            isChecked={(a) => filters.accommodation.includes(a.code)}
            render={(a) => (
              <FilterCheck key={a.code} label={`${cap(a.name)} (${a.hotels})`} checked={filters.accommodation.includes(a.code)} onChange={() => toggleCode('accommodation', a.code)} />
            )}
          />
        )}
      </FilterSection>

      {/* Board Type — DYNAMIC from the cache: only boards that exist for this search, with counts. */}
      <FilterSection title="Board Type" defaultOpen>
        {Object.keys(boardFacets).length === 0 ? (
          <p className={styles.filterEmpty}>{loading ? 'Loading…' : 'No board data for this search.'}</p>
        ) : (
          Object.entries(boardFacets).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
            <FilterCheck key={code} label={`${getBoardLabel(code)} (${n})`} checked={filters.boards.includes(code)} onChange={() => toggleCode('boards', code)} />
          ))
        )}
      </FilterSection>

      {/* Distance — filter by MAX distance to the beach / city centre (admin facets group 40).
          Single-select per type; re-picking the active option clears it. */}
      {(facets.beachDistance.length > 0 || facets.centreDistance.length > 0) && (
        <FilterSection title="Distance" defaultOpen={false}>
          {facets.beachDistance.length > 0 && (
            <>
              <div className={styles.scopeGroupLabel}>To the beach</div>
              {facets.beachDistance.map((b) => (
                <FilterCheck key={`b${b.maxMetres}`} label={`${metresLabel(b.maxMetres)} (${b.hotels})`} checked={filters.maxBeach === b.maxMetres} onChange={() => setMaxDistance('maxBeach', b.maxMetres)} />
              ))}
            </>
          )}
          {facets.centreDistance.length > 0 && (
            <>
              <div className={styles.scopeGroupLabel}>To the city centre</div>
              {facets.centreDistance.map((c) => (
                <FilterCheck key={`c${c.maxMetres}`} label={`${metresLabel(c.maxMetres)} (${c.hotels})`} checked={filters.maxCentre === c.maxMetres} onChange={() => setMaxDistance('maxCentre', c.maxMetres)} />
              ))}
            </>
          )}
        </FilterSection>
      )}

      {/* Facilities — DYNAMIC from the admin facets (group 70), unique with counts. */}
      <FilterSection title="Facilities" defaultOpen={false}>
        {facets.facilities.length === 0 ? (
          <p className={styles.filterEmpty}>{facetsStatus === 'loading' ? 'Loading…' : 'No facilities data for this search.'}</p>
        ) : (
          <FacetList
            items={facets.facilities}
            isChecked={(f) => filters.facilities.includes(f.code)}
            render={(f) => (
              <FilterCheck key={f.code} label={`${f.name} (${f.hotels})`} checked={filters.facilities.includes(f.code)} onChange={() => toggleCode('facilities', f.code)} />
            )}
          />
        )}
      </FilterSection>

      {/* Activities — DYNAMIC from the admin facets (groups 73/74/90 + 71 catering), with counts.
          Keyed by group AND code: the same code appears in several groups under different names
          (410 is both Hot tub and Surfing), so the bare code is not a unique row identity. */}
      <FilterSection title="Activities" defaultOpen={false}>
        {facets.activities.length === 0 ? (
          <p className={styles.filterEmpty}>{facetsStatus === 'loading' ? 'Loading…' : 'No activities data for this search.'}</p>
        ) : (
          <FacetList
            items={facets.activities}
            isChecked={(a) => filters.activities.some((x) => actMatches(x, a))}
            render={(a) => (
              <FilterCheck key={`${a.groupCode ?? ''}:${a.code}`} label={`${a.name} (${a.hotels})`} checked={filters.activities.some((x) => actMatches(x, a))} onChange={() => toggleActivity(a)} />
            )}
          />
        )}
      </FilterSection>

      {/* Family & Kids — curated child-friendly amenities (admin facets), with counts. */}
      {facets.kids.length > 0 && (
        <FilterSection title="Family & Kids" defaultOpen={false}>
          <FacetList
            items={facets.kids}
            isChecked={(k) => filters.kids.includes(k.code)}
            render={(k) => (
              <FilterCheck key={k.code} label={`${k.name} (${k.hotels})`} checked={filters.kids.includes(k.code)} onChange={() => toggleCode('kids', k.code)} />
            )}
          />
        </FilterSection>
      )}

      {/* Adults only — boolean content facet (the "Adults Only" vacation-type card seeds ?adultsOnly=1). */}
      <FilterSection title="Adults only" defaultOpen={false}>
        <FilterCheck
          label="Adults-only hotels"
          checked={filters.adultsOnly}
          onChange={() => setFilter('adultsOnly', !filters.adultsOnly)}
        />
      </FilterSection>

      {/* Room Type — server-side (`roomTypes`) */}
      <FilterSection title="Room Type" defaultOpen={false}>
        {ROOM_FILTERS.map((code) => (
          <FilterCheck key={code} label={getRoomLabel(code)} checked={filters.roomTypes.includes(code)} onChange={() => toggleCode('roomTypes', code)} />
        ))}
      </FilterSection>

      {/* Cancellation — server-side (`refundable`) */}
      <FilterSection title="Cancellation" defaultOpen>
        <Segmented options={REFUNDABLE_OPTIONS} value={filters.refundable} onChange={(v) => setFilter('refundable', v)} ariaLabel="Cancellation policy" />
      </FilterSection>
    </>
  );

  const bestValueId = cheapestCode ?? null;

  return (
    <div className={styles.page}>
      {/* Hero header */}
      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className={styles.heroGrid} />
        {/* Sky scene — decorative only, all pointer-transparent */}
        <div className={styles.heroSun} aria-hidden="true">
          <span className={styles.sunRing} />
          <span className={styles.sunRing2} />
        </div>
        <span className={`${styles.cloud} ${styles.cloud1}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud2}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud3}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud4}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud5}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud6}`} aria-hidden="true" />
        <span className={`${styles.cloud} ${styles.cloud7}`} aria-hidden="true" />
        <svg className={styles.heroFlight} viewBox="0 0 600 200" fill="none" aria-hidden="true">
          <path
            className={styles.flightPath}
            d="M10 160 Q 220 30 590 70"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="2 12"
          />
          <g className={styles.flightPlane}>
            <path d="M0 8L22 0l-7.5 18-3.5-6.5L0 8z" fill="rgba(255,255,255,0.9)" transform="translate(-11,-9)" />
          </g>
        </svg>
        {/* Route constellation — dashed hops between pulsing destination nodes */}
        <svg className={styles.heroRoutes} viewBox="0 0 640 190" fill="none" aria-hidden="true">
          <path className={styles.routeArc} d="M18 168 Q 150 96 300 128" />
          <path className={styles.routeArc} d="M300 128 Q 450 162 622 58" />
          <circle className={styles.routeNode} cx="18" cy="168" r="3.5" />
          <circle className={styles.routePulse} cx="18" cy="168" r="5" />
          <circle className={styles.routeNode} cx="300" cy="128" r="3.5" />
          <circle className={styles.routePulse} cx="300" cy="128" r="5" style={{ animationDelay: '1.1s' }} />
          <circle className={`${styles.routeNode} ${styles.routeNodeGold}`} cx="622" cy="58" r="4" />
          <circle className={`${styles.routePulse} ${styles.routePulseGold}`} cx="622" cy="58" r="6" style={{ animationDelay: '2.2s' }} />
        </svg>
        <span className={styles.twinkle} style={{ top: '24%', left: '38%' }} />
        <span className={styles.twinkle} style={{ top: '36%', left: '48%', animationDelay: '1.7s' }} />
        <span className={styles.twinkle} style={{ top: '72%', left: '66%', animationDelay: '2.7s' }} />
        <span className={styles.twinkle} style={{ top: '58%', left: '55%', animationDelay: '1.2s' }} />
        <span className={styles.twinkle} style={{ top: '18%', left: '72%', animationDelay: '2.1s' }} />
        <span className={styles.twinkle} style={{ top: '64%', left: '86%', animationDelay: '0.6s' }} />
        <div className={styles.heroInner}>
          <div className={styles.breadcrumb}>
            <span>Home</span>
            <span className={styles.bcSep}>·</span>
            <span>Holidays</span>
            <span className={styles.bcSep}>·</span>
            <span className={styles.bcActive}>{scopeLabel || 'Results'}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {scopeLabel ? (<>Stays in <em>{scopeLabel}</em></>) : ('Find your perfect stay')}
          </h1>
          <div className={styles.heroChips}>
            {heroChips.map((c) => (
              <span key={c.text} className={styles.heroChip}>
                <Icon d={c.icon} size={13} sw={1.8} />
                {c.text}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.heroWave}>
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none">
            <path d="M0,30 C240,60 480,0 720,20 C960,40 1200,10 1440,35 L1440,60 L0,60 Z" fill="currentColor" />
          </svg>
        </div>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarInner}>
          <div className={styles.resultCount}>
            <span className={styles.countIcon}>
              <Icon d="M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" size={18} sw={2} />
            </span>
            {loading ? (
              <span className={styles.countSearching}>
                <span className={styles.countPulse} />
                Searching the best deals…
              </span>
            ) : (
              <span className={styles.countText}>
                <span><strong>{hotels.length}{hasMore ? '+' : ''}</strong> {hotels.length === 1 ? 'stay' : 'stays'} found</span>
                {scopeLabel && <span className={styles.countSub}>in {scopeLabel}</span>}
              </span>
            )}
          </div>
          {/* Boarding-pass strip — the trip summary rides the dashed route line */}
          <div className={styles.tripStrip}>
            <span className={styles.tripStripLine} aria-hidden="true" />
            {heroChips.map((c) => (
              <span key={c.text} className={styles.tripStop}>
                <Icon d={c.icon} size={12} sw={1.8} />
                {c.text}
              </span>
            ))}
            <svg className={styles.tripStripPlane} viewBox="0 0 22 18" width="16" height="13" aria-hidden="true">
              <path d="M0 8L22 0l-7.5 18-3.5-6.5L0 8z" fill="currentColor" />
            </svg>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.sortWrap}>
              <span className={styles.sortLabel}>
                <Icon d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" size={14} sw={2} />
                Sort
              </span>
              <select className={styles.sortSelect} aria-label="Sort results" value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button className={styles.mobileFilterBtn} onClick={() => setDrawerOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
              </svg>
              Filters
              {activeCount > 0 && <span className={styles.filterCount}>{activeCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.filterCard}>
            <div className={styles.filterCardHead}>
              <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" size={15} sw={2} />
              <h2>Filters</h2>
              {activeCount > 0 && (
                <>
                  <span className={styles.filterCount}>{activeCount}</span>
                  <button className={styles.clearAllBtn} onClick={clearFilters}>Clear all</button>
                </>
              )}
            </div>
            {sidebar}
          </div>
        </aside>

        <section className={styles.results}>
          <div className={`${styles.resultsList} ${filtering ? styles.listBusy : ''}`}>
            {/* What the vacation-type card the traveller came from asked for, and the way back
                out of it — the sidebar alone never explains why the list arrived pre-narrowed. */}
            {cardApplied && (
              <div className={styles.cardApplied}>
                <span className={styles.cardAppliedIcon}>
                  <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" size={15} sw={1.8} />
                </span>
                <div className={styles.cardAppliedText}>
                  <span className={styles.cardAppliedTitle}>{cardSummary.title || 'Filters from your pick'}</span>
                  {cardSummary.labels.length > 0 && (
                    <span className={styles.cardAppliedChips}>
                      {cardSummary.labels.map((l, li) => (
                        <span key={`${li}-${l}`} className={styles.cardAppliedChip}>{l}</span>
                      ))}
                    </span>
                  )}
                </div>
                <button type="button" className={styles.cardAppliedX} onClick={clearCardFilters} aria-label="Remove these filters">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className={styles.skeletonCard} style={{ animationDelay: `${i * 0.1}s` }}>
                  {/* Branded image placeholder — soft sky wash with a mountain/sun watermark */}
                  <div className={styles.skImg}>
                    <svg className={styles.skImgIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="7.5" cy="7" r="2.5" />
                      <path d="M3 20l5.5-7 4 5 3-3.5L21 20z" />
                    </svg>
                    <span className={styles.skChip} />
                  </div>
                  {/* Content — mirrors stars → name → location → amenity chips → dates */}
                  <div className={styles.skBody}>
                    <div className={styles.skStars}>
                      {[0, 1, 2, 3, 4].map((s) => <span key={s} className={styles.skStar} />)}
                    </div>
                    <div className={`${styles.skLine} ${styles.skName}`} />
                    <div className={`${styles.skLine} ${styles.skLoc}`} />
                    <div className={styles.skChips}>
                      <span className={styles.skPill} />
                      <span className={`${styles.skPill} ${styles.skPillSm}`} />
                    </div>
                    <div className={styles.skDates}>
                      <span className={styles.skDate} />
                      <span className={styles.skNights} />
                    </div>
                  </div>
                  {/* Price rail — same boarding-pass tear line + notches as a real card */}
                  <div className={styles.skRail}>
                    <div className={`${styles.skLine} ${styles.skRailLabel}`} />
                    <div className={`${styles.skLine} ${styles.skRailPrice}`} />
                    <div className={`${styles.skLine} ${styles.skRailMeta}`} />
                    <div className={styles.skRailCta} />
                  </div>
                </div>
              ))
            ) : !hasScope ? (
              <div className={styles.noResults}>
                <div className={styles.noResultsIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <h3>Select where you want to go</h3>
                <p>Pick one or more countries or destinations in the “Where” filter.</p>
              </div>
            ) : hotels.length === 0 ? (
              <div className={styles.noResults}>
                <div className={styles.noResultsIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <h3>No results found</h3>
                <p>
                  {activeCount > 0
                    ? 'No stays match your filters. Try relaxing them or widening your price range.'
                    : 'Try different dates or a wider area.'}
                </p>
                {activeCount > 0 && (
                  <button className={styles.applyBtn} style={{ maxWidth: 200 }} onClick={clearFilters}>Clear all filters</button>
                )}
              </div>
            ) : (
              hotels.map((h, i) => {
                const info      = infoMap[String(h.hotelCode)];
                const dispName  = info?.name?.trim() || h.name;
                const dispStars = info?.stars ?? attrMap[String(h.hotelCode)]?.stars ?? h.stars;
                // Star (hotel) vs key (apartment) rating. The bulk info record carries the kind;
                // fall back to a plain star rating from the star count when info isn't in yet.
                const dispRating = info?.rating || (dispStars > 0 ? { kind: 'star', value: dispStars } : null);
                const dispImg   = info ? bestImg(info.images, FALLBACK_IMG) : h.img;
                const infoReady = !!info;
                // The hotel's OWN destination, from its info record — a country or multi-city
                // search must not deep-link every card to the first destination in the scope.
                const hotelDest = info?.destinationCode || attrMap[String(h.hotelCode)]?.destinationCode || priceScope?.destinations?.[0] || '';
                const gallery   = info ? allImgs(info.images) : [];
                const imgIdx    = gallery.length ? Math.min(cardIdx[h.hotelCode] || 0, gallery.length - 1) : 0;
                const curImg    = gallery.length ? gallery[imgIdx] : dispImg;
                // Headline price split into whole + decimals (toFixed FIRST, so
                // 99.999 renders 100.00 — trunc-then-format would show 99.00).
                const total = Number(h.totalAmount);
                const [totalMajorRaw, totalDec] = Number.isFinite(total) ? total.toFixed(2).split('.') : ['—', null];
                const totalMajor = totalDec != null ? Number(totalMajorRaw).toLocaleString('en-GB') : totalMajorRaw;
                // TripAdvisor rating (/10), from the harvested store on the bulk info record.
                const rev = formatReview(info?.review);
                // Curated top-5 amenities + overflow count for the chip row.
                const fac = topFacilities(info?.facilities);
                // Location line: clean geo name first, title-cased raw supplier city as
                // fallback, the scope label as last resort (also what shows pre-info, which
                // keeps the loading state and tests stable). Country code uppercased for
                // display + flag lookup.
                const cc = (info?.countryCode || '').toUpperCase();
                const cityDisp = info?.cityName || (info?.city ? toTitleCase(info.city) : '') || h.loc;
                return (
                <article key={h.id} className={styles.resultCard} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 8) * 0.06}s` }}>
                  <div className={styles.rcImg}>
                    {infoReady
                      ? <HotelImg key={curImg} src={curImg} size="bigger" alt={dispName} loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
                      : <div className={styles.rcImgSkel} />}
                    <div className={styles.rcImgOverlay} />
                    {infoReady && gallery.length > 0 && (
                      <button
                        type="button"
                        className={styles.rcImgBtn}
                        onClick={() => openLightbox(dispName, gallery, imgIdx)}
                        aria-label={`View ${gallery.length} photo${gallery.length > 1 ? 's' : ''} of ${dispName}`}
                      />
                    )}
                    {infoReady && gallery.length > 1 && (
                      <>
                        <button
                          type="button"
                          className={`${styles.rcArrow} ${styles.rcArrowPrev}`}
                          onClick={(e) => { e.stopPropagation(); cardGo(h.hotelCode, gallery.length, -1); }}
                          aria-label="Previous photo"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={`${styles.rcArrow} ${styles.rcArrowNext}`}
                          onClick={(e) => { e.stopPropagation(); cardGo(h.hotelCode, gallery.length, +1); }}
                          aria-label="Next photo"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                        <span className={styles.rcPhotoCount}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                          </svg>
                          {imgIdx + 1}/{gallery.length}
                          <svg className={styles.rcCountExpand} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                          </svg>
                        </span>
                      </>
                    )}
                    {h.id === bestValueId && (
                      <div className={styles.rcBadge}>
                        <Icon d="M13 10V3L4 14h7v7l9-11h-7z" size={11} sw={2} />
                        Best Value
                      </div>
                    )}
                    <button
                      className={`${styles.rcHeart} ${liked[h.id] ? styles.rcHeartLiked : ''}`}
                      onClick={() => toggleLike(h.hotelCode, {
                        hotelCode: h.hotelCode,
                        hotelName: dispName,
                        destination: h.loc,
                        destinationCode: hotelDest,
                        stars: dispStars || null,
                        imageUrl: infoReady ? dispImg : null,
                      })}
                      aria-label="Save to favourites"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill={liked[h.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    </button>
                  </div>

                  <div className={styles.rcContent}>
                    {/* Head: identity on the left, guest score big on the right — the pattern
                        travellers know from Booking.com. Dates/nights pills are GONE from the
                        body: every card repeated the toolbar's values, which was pure noise. */}
                    <div className={styles.rcHead}>
                      <div className={styles.rcHeadMain}>
                        {ratingValue(dispRating) > 0 && (
                          <div className={styles.rcRating}>
                            {/* Keys arrive pre-tilted from KeyMark (the 🔑 spec) — no CSS rotation here. */}
                            <span className={`${styles.rcRatingMarks} ${dispRating?.kind === 'key' ? styles.rcKeysRow : ''}`}>
                              <RatingMarks rating={dispRating} keySize={22} />
                            </span>
                            <span className={styles.rcRatingLabel}>{ratingLabel(dispRating)}</span>
                          </div>
                        )}
                        {dispName
                          ? <h3 className={styles.rcName}>{dispName}</h3>
                          : <div className={`${styles.rcNameSkel} ${styles.skeletonLine}`} />}

                        {/* The hotel's OWN place, small → large: flag · zone (district) ·
                            geo city · country code — not the search label. */}
                        <div className={styles.rcPlace}>
                          <CountryFlag code={cc} />
                          {/* Skip the zone when it just repeats the city ("Bodrum · Bodrum"). */}
                          {info?.zoneName && info.zoneName.toLowerCase() !== String(cityDisp).toLowerCase() && (
                            <>
                              <span className={styles.rcPlaceZone}>{info.zoneName}</span>
                              <span className={styles.rcPlaceDot} aria-hidden="true">·</span>
                            </>
                          )}
                          <span className={styles.rcPlaceCity}>{cityDisp}</span>
                          {cc && (
                            <>
                              <span className={styles.rcPlaceDot} aria-hidden="true">·</span>
                              <span className={styles.rcPlaceCode}>{cc}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {rev && (
                        <div className={styles.rcReviewBox} title={rev.title}>
                          <span className={styles.rcReviewScore}>{rev.score}<span className={styles.rcReviewOutOf}>/{rev.outOf}</span></span>
                          <span className={styles.rcReviewWord}>{scoreWord(rev.score)}</span>
                          {rev.count > 0 && <span className={styles.rcReviewCount}>{rev.count.toLocaleString('en-GB')} reviews</span>}
                        </div>
                      )}
                    </div>

                    {/* Amenities: borderless icon+label items — text, not chip soup. */}
                    {fac.top.length > 0 && (
                      <div className={styles.rcFacts} aria-label="Hotel facilities">
                        {fac.top.map((f) => (
                          <span key={f.icon} className={styles.rcFact}>
                            <span className={styles.rcFactIco}>
                              <Icon d={FAC_ICON_D[f.icon] || FAC_ICON_D.fallback} size={14} sw={1.7} />
                            </span>
                            {f.label}
                          </span>
                        ))}
                        {fac.more > 0 && (
                          <span className={styles.rcFactMore} title={`${fac.more} more facilities`}>+{fac.more} more</span>
                        )}
                      </div>
                    )}

                    {/* What the deal includes — mint coupon pills (dashed border), one per
                        value: the board basis and the room type each earn their own tag. */}
                    {(h.boardTags.length > 0 || h.roomLabel) && (
                      <div className={styles.rcIncluded}>
                        {h.boardTags.map((b) => (
                          <span key={b} className={styles.rcIncludedPill}><CheckIcon />{b}</span>
                        ))}
                        {h.roomLabel && (
                          <span className={styles.rcIncludedPill}><CheckIcon />{h.roomLabel}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.rcPriceRail}>
                    <div className={styles.rcPriceInfo}>
                      {/* Only rendered when the API says the rate IS refundable — the
                          false case already has its own chip on the image. Text, not a pill:
                          the stub is typography-only. */}
                      {h.refundable === true && (
                        <span className={styles.rcRefundable}><CheckIcon />Free cancellation</span>
                      )}
                      {/* What the total covers — the stay context that used to be two pills
                          in the body, now one quiet qualifying line above the fare. */}
                      <span className={styles.rcPriceContext}>
                        {nights > 0 ? `${nights} nights` : 'Total'}
                        {Number(fetchParams.adults) > 0 && ` · ${fetchParams.adults} adult${Number(fetchParams.adults) > 1 ? 's' : ''}`}
                        {Number(fetchParams.children) > 0 && ` · ${fetchParams.children} child${Number(fetchParams.children) > 1 ? 'ren' : ''}`}
                      </span>
                      <div className={styles.rcPriceAmount}>
                        <span className={styles.rcPriceCcy}>{CCY_SYMBOLS[h.currency] || h.currency}</span>
                        {totalMajor}
                        {totalDec != null && <span className={styles.rcPriceDec}>.{totalDec}</span>}
                      </div>
                      {nights > 0 && Number.isFinite(total) && (
                        <div className={styles.rcPriceMeta}>
                          {/* Same symbol as the headline — mixing € above with EUR here read
                              as two currencies. */}
                          {CCY_SYMBOLS[h.currency] || h.currency}{(total / nights).toFixed(2)} <span className={styles.rcPriceMetaUnit}>/ night</span>
                        </div>
                      )}
                      {/* Opens in the SAME tab (client-side nav). It stays a real link, so a
                          power user can still cmd/ctrl/middle-click to open a new tab by choice
                          — we just no longer force one on every click. */}
                      <Link className={styles.rcCta} to={detailHref(h, dispName, dispStars, hotelDest, curImg)}>
                        View Deal
                        <Icon d="M5 12h14M12 5l7 7-7 7" size={14} sw={2.2} />
                      </Link>
                    </div>
                  </div>
                </article>
                );
              })
            )}

            {!loading && hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}
            {!loading && fetchingMore && (
              <div className={styles.loadMore}>
                <span className={styles.loadMoreSpin} />
                Loading more stays…
              </div>
            )}
            {!loading && !hasMore && hotels.length > 0 && (
              <div className={styles.endOfResults}>You’ve reached the end — all {hotels.length} stays shown</div>
            )}
          </div>
        </section>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHead}>
              <h2>Filters</h2>
              <button className={styles.drawerClose} onClick={() => setDrawerOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className={styles.drawerBody}>{sidebar}</div>
          </div>
        </>
      )}

      {/* Full-screen photo lightbox — big view + slider through all of a hotel's images */}
      {lightbox && (
        <div className={styles.lbOverlay} onClick={closeLightbox} role="dialog" aria-modal="true" aria-label={`${lightbox.name} photos`}>
          <button className={styles.lbClose} onClick={closeLightbox} aria-label="Close photos">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className={styles.lbStage} onClick={(e) => e.stopPropagation()}>
            {lightbox.images.length > 1 && (
              <button className={`${styles.lbNav} ${styles.lbNavPrev}`} onClick={lbPrev} aria-label="Previous photo">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            <HotelImg
              key={lightbox.index}
              // Full-screen inspection → request `original` (2048x1365); HotelImg steps down if
              // a given image lacks it, so the lightbox always opens something.
              src={lightbox.images[lightbox.index]}
              size="original"
              alt={`${lightbox.name} — photo ${lightbox.index + 1}`}
              className={styles.lbImg}
              onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
            />

            {lightbox.images.length > 1 && (
              <button className={`${styles.lbNav} ${styles.lbNavNext}`} onClick={lbNext} aria-label="Next photo">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}

            <div className={styles.lbCaption}>
              <span className={styles.lbName}>{lightbox.name}</span>
              <span className={styles.lbCounter}>{lightbox.index + 1} / {lightbox.images.length}</span>
            </div>
          </div>

          {lightbox.images.length > 1 && (
            <div className={styles.lbThumbs} onClick={(e) => e.stopPropagation()}>
              {lightbox.images.map((src, idx) => (
                <button
                  key={idx}
                  className={`${styles.lbThumb} ${idx === lightbox.index ? styles.lbThumbActive : ''}`}
                  onClick={() => lbGo(idx)}
                  aria-label={`Go to photo ${idx + 1}`}
                  aria-current={idx === lightbox.index}
                >
                  <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
