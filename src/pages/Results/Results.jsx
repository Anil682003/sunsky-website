import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { fetchFavouriteCodes, addFavourite, removeFavourite } from '../../api';
import { fetchFacets, fetchCountries, fetchDestinations } from '../../api/filters';
import { rememberDestCode } from '../../utils/favDest';
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

const bestImg = (images, fallback) => {
  if (!Array.isArray(images) || images.length === 0) return fallback;
  const sorted = [...images].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return sorted[0]?.url || fallback;
};

// All of a hotel's photo URLs, ordered — feeds the full-screen lightbox slider.
const allImgs = (images) => {
  if (!Array.isArray(images) || images.length === 0) return [];
  return [...images]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
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
  const legacyDest      = params.get('destination')  || '';
  const urlLabel        = params.get('destinationLabel') || params.get('label') || '';
  // A specific hotel picked from the home typeahead → restrict results to just that hotel.
  const urlHotelCode    = params.get('hotelCode') || '';

  const { scope, usingDefaultScope } = useMemo(() => {
    // destinations = explicit `destinations` ∪ home-picker `cities`; fall back to the legacy
    // single `destination` only when neither is present (old links still work).
    const dests = [...new Set([...csv(urlDestinations), ...csv(urlCities)])];
    const countries = csv(urlCountries);
    const explicit = dests.length ? dests : (legacyDest ? [legacyDest] : []);
    // EMPTY SEARCH → no country and no destination chosen (e.g. the traveller clicked Search on
    // the home page without picking a place). Rather than a blank "pick a destination" wall, we
    // default to a curated set of popular sun destinations that actually have priced inventory,
    // sorted cheapest-first — a "best deals" landing. The traveller refines via the Where filter.
    if (!countries.length && !explicit.length) {
      return { scope: { countries: [], destinations: DEFAULT_DESTINATIONS }, usingDefaultScope: true };
    }
    return { scope: { countries, destinations: explicit }, usingDefaultScope: false };
  }, [urlCountries, urlDestinations, urlCities, legacyDest]);
  const scopeKey  = `${scope.countries.join(',')}|${scope.destinations.join(',')}`;
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

  // Filters can arrive in the URL — the homepage links into pre-filtered searches:
  //   ?boards=AI        board code(s)         (vacation-type cards, popular-dest links)
  //   ?themes=12        holiday type id(s)    (popular-destination links)
  //   ?kids=340         kids amenity code(s)  ("Family Friendly" vacation-type card)
  //   ?adultsOnly=1     only-adults hotels    ("Adults Only" vacation-type card)
  // Seeded once, on entry; from then on the sidebar owns them like any other filter.
  // Theme/kids ids are numbers because the facet lists compare against numeric ids.
  const seedFilters = () => {
    const boards = csv(params.get('boards') || '')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const themes = csv(params.get('themes') || '')
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const kids = csv(params.get('kids') || '')
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const adultsOnly = ['1', 'true', 'yes'].includes((params.get('adultsOnly') || '').toLowerCase());
    if (!boards.length && !themes.length && !kids.length && !adultsOnly) return EMPTY_FILTERS;
    return {
      ...EMPTY_FILTERS,
      ...(boards.length ? { boards } : {}),
      ...(themes.length ? { themes } : {}),
      ...(kids.length ? { kids } : {}),
      ...(adultsOnly ? { adultsOnly: true } : {}),
    };
  };

  // Result filters. `filters` drives the UI (instant); `applied` is the debounced copy.
  const [filters, setFilters] = useState(seedFilters);
  const [applied, setApplied] = useState(seedFilters);

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

  // Scope selection UI (draft, applied via the button so we don't refetch per checkbox).
  const [countryOptions, setCountryOptions]   = useState([]);
  const [countriesStatus, setCountriesStatus] = useState('loading');
  const [countrySearch, setCountrySearch]     = useState('');
  const [draftCountries, setDraftCountries]       = useState(() => new Set(scope.countries));
  const [draftDestinations, setDraftDestinations] = useState(() => new Set(scope.destinations));
  const [browseCountry, setBrowseCountry]         = useState('');
  const [browseDestOptions, setBrowseDestOptions] = useState([]);

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

  // Keep the scope draft in sync when the URL scope changes (e.g. back/forward navigation).
  // Adjust-state-during-render (React's documented pattern for resetting state on changed
  // inputs) rather than an effect, so the draft is correct on the very next render.
  const [draftScopeKey, setDraftScopeKey] = useState(scopeKey);
  if (draftScopeKey !== scopeKey) {
    setDraftScopeKey(scopeKey);
    setDraftCountries(new Set(scope.countries));
    setDraftDestinations(new Set(scope.destinations));
  }

  // Load the country list once (only countries that actually have hotels).
  useEffect(() => {
    let live = true;
    fetchCountries()
      .then((c) => { if (live) { setCountryOptions(c); setCountriesStatus('ok'); } })
      .catch(() => { if (live) setCountriesStatus('error'); });
    return () => { live = false; };
  }, []);

  // Load destinations for the "browse" country (the destination picker in the scope editor).
  useEffect(() => {
    if (!browseCountry) return;
    let live = true;
    fetchDestinations(browseCountry).then((d) => { if (live) setBrowseDestOptions(d); }).catch(() => { if (live) setBrowseDestOptions([]); });
    return () => { live = false; };
  }, [browseCountry]);
  // Options actually shown (empty unless a browse country is selected — no effect setState needed).
  const destPickerOptions = browseCountry ? browseDestOptions : [];

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
  useEffect(() => {
    if (!hasScope) return;   // nothing to resolve; the page-1 effect handles the empty state
    let live = true;
    setFacetsStatus('loading');
    const selected = {
      themes: applied.themes, stars: applied.stars,
      facilities: applied.facilities, activities: applied.activities,
      accommodation: applied.accommodation, kids: applied.kids,
      maxBeach: applied.maxBeach, maxCentre: applied.maxCentre,
      adultsOnly: applied.adultsOnly,
    };
    fetchFacets(scope, selected)
      .then((r) => {
        if (!live) return;
        setFacets(r.facets || EMPTY_FACETS);
        setAttrMap(r.attributes || {});
        const dests = (r.matchedDestinations && r.matchedDestinations.length)
          ? r.matchedDestinations
          : scope.destinations;                        // fallback if admin returned none
        setPriceScope({
          destinations: dests,
          // A specific hotel (typeahead) pins the result to just that hotel. Otherwise restrict
          // the cache to the resolved hotelCodes only when a content facet is active.
          hotelCodes: urlHotelCode ? [urlHotelCode] : (hasContentFacet(applied) ? (r.hotelCodes || []) : null),
        });
        setFacetsStatus('ok');
      })
      .catch(() => {
        if (!live) return;
        setFacets(EMPTY_FACETS);
        setAttrMap({});
        setFacetsStatus('error');
        // Admin down: still price the scope's explicit destinations (content facets can't apply).
        setPriceScope({
          destinations: scope.destinations,
          hotelCodes: urlHotelCode ? [urlHotelCode] : (hasContentFacet(applied) ? [] : null),
        });
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, contentKey, urlHotelCode]);

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
      source:             'combined',
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

  // Distance sorts (client-side) using the admin attributes; the cache already ordered by price.
  const hotels = useMemo(() => {
    const field = applied.sortBy === 'distance_beach' ? 'beachMetres'
                : applied.sortBy === 'distance_centre' ? 'centreMetres' : null;
    if (!field) return allHotels;
    const dist = (h) => {
      const v = attrMap[String(h.hotelCode)]?.[field];
      return typeof v === 'number' && v >= 0 ? v : Infinity;
    };
    return [...allHotels].sort((a, b) => dist(a) - dist(b));
  }, [allHotels, applied.sortBy, attrMap]);

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

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  // Distance is single-select per type: re-picking the active bucket clears it ("Any distance").
  const setMaxDistance = (key, metres) => setFilter(key, filters[key] === metres ? '' : metres);

  const setPriceBasis = (value) => {
    if (filters.priceBasis === value) return;
    setPriceCeiling(null);
    setFilters((f) => ({ ...f, priceBasis: value, minPrice: '', maxPrice: '' }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

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

  // ── Scope editor helpers ────────────────────────────────────────────────────────
  const toggleDraft = (setter) => (code) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const toggleDraftCountry     = toggleDraft(setDraftCountries);
  const toggleDraftDestination = toggleDraft(setDraftDestinations);

  const countryName = (code) => countryOptions.find((c) => c.code === code)?.name || code;

  // Apply the drafted scope — re-navigate the results page (keeps dates + occupancy, shareable URL).
  const applyScope = () => {
    const countries    = [...draftCountries];
    const destinations = [...draftDestinations];
    if (!countries.length && !destinations.length) return;
    const qp = new URLSearchParams();
    if (countries.length)    qp.set('countries', countries.join(','));
    if (destinations.length) qp.set('destinations', destinations.join(','));
    qp.set('checkIn', fetchParams.checkIn);
    qp.set('checkOut', fetchParams.checkOut);
    qp.set('adults', fetchParams.adults);
    qp.set('children', fetchParams.children);
    qp.set('rooms', fetchParams.rooms);
    if (fetchParams.childAges) qp.set('childAges', fetchParams.childAges);
    navigate({ search: qp.toString() });
  };
  const scopeDirty =
    draftCountries.size !== scope.countries.length ||
    draftDestinations.size !== scope.destinations.length ||
    scope.countries.some((c) => !draftCountries.has(c)) ||
    scope.destinations.some((d) => !draftDestinations.has(d));
  const draftCount = draftCountries.size + draftDestinations.size;

  const filteredCountries = countryOptions.filter((c) =>
    !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()));

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
        {countriesStatus === 'error' ? (
          <p className={styles.filterEmpty}>Destination filter unavailable (content service unreachable).</p>
        ) : countryOptions.length === 0 ? (
          <p className={styles.filterEmpty}>Loading countries…</p>
        ) : (
          <>
            {(draftCountries.size > 0 || draftDestinations.size > 0) && (
              <div className={styles.scopeChips}>
                {[...draftCountries].map((c) => (
                  <span key={`c-${c}`} className={styles.scopeChip}>
                    {countryName(c)}
                    <button className={styles.scopeChipX} onClick={() => toggleDraftCountry(c)} aria-label={`Remove ${countryName(c)}`}>×</button>
                  </span>
                ))}
                {[...draftDestinations].map((d) => (
                  <span key={`d-${d}`} className={styles.scopeChip}>
                    {d}
                    <button className={styles.scopeChipX} onClick={() => toggleDraftDestination(d)} aria-label={`Remove ${d}`}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div className={styles.scopeGroupLabel}>Countries</div>
            <input
              type="text"
              className={styles.scopeSearch}
              placeholder="Search countries…"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
            />
            <div className={styles.scopeList}>
              {filteredCountries.map((c) => (
                <FilterCheck key={c.code} label={c.name} checked={draftCountries.has(c.code)} onChange={() => toggleDraftCountry(c.code)} />
              ))}
            </div>

            <div className={styles.scopeGroupLabel}>Add destinations</div>
            <label className={styles.cascadeLabel}>
              <select className={styles.cascadeSelect} value={browseCountry} onChange={(e) => setBrowseCountry(e.target.value)}>
                <option value="">Browse a country…</option>
                {countryOptions.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            {browseCountry && (
              <div className={styles.scopeList}>
                {destPickerOptions.length === 0
                  ? <p className={styles.filterEmpty}>Loading destinations…</p>
                  : destPickerOptions.map((d) => (
                    <FilterCheck key={d.code} label={d.name} checked={draftDestinations.has(d.code)} onChange={() => toggleDraftDestination(d.code)} />
                  ))}
              </div>
            )}

            <button className={styles.applyScopeBtn} onClick={applyScope} disabled={!scopeDirty || draftCount === 0}>
              {draftCount === 0 ? 'Pick a country or destination' : `Search ${draftCount} place${draftCount === 1 ? '' : 's'}`}
            </button>
          </>
        )}
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
          facets.holiday.map((t) => (
            <FilterCheck
              key={t.id}
              label={`${t.icon ? `${t.icon} ` : ''}${t.name} (${t.hotels})`}
              checked={filters.themes.includes(t.id)}
              onChange={() => toggleCode('themes', t.id)}
            />
          ))
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
          <div className={styles.facetScroll}>
            {facets.accommodation.map((a) => (
              <FilterCheck key={a.code} label={`${cap(a.name)} (${a.hotels})`} checked={filters.accommodation.includes(a.code)} onChange={() => toggleCode('accommodation', a.code)} />
            ))}
          </div>
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
          <div className={styles.facetScroll}>
            {facets.facilities.map((f) => (
              <FilterCheck key={f.code} label={`${f.name} (${f.hotels})`} checked={filters.facilities.includes(f.code)} onChange={() => toggleCode('facilities', f.code)} />
            ))}
          </div>
        )}
      </FilterSection>

      {/* Activities — DYNAMIC from the admin facets (groups 73/74/90), unique with counts. */}
      <FilterSection title="Activities" defaultOpen={false}>
        {facets.activities.length === 0 ? (
          <p className={styles.filterEmpty}>{facetsStatus === 'loading' ? 'Loading…' : 'No activities data for this search.'}</p>
        ) : (
          <div className={styles.facetScroll}>
            {facets.activities.map((a) => (
              <FilterCheck key={a.code} label={`${a.name} (${a.hotels})`} checked={filters.activities.includes(a.code)} onChange={() => toggleCode('activities', a.code)} />
            ))}
          </div>
        )}
      </FilterSection>

      {/* Family & Kids — curated child-friendly amenities (admin facets), with counts. */}
      {facets.kids.length > 0 && (
        <FilterSection title="Family & Kids" defaultOpen={false}>
          {facets.kids.map((k) => (
            <FilterCheck key={k.code} label={`${k.name} (${k.hotels})`} checked={filters.kids.includes(k.code)} onChange={() => toggleCode('kids', k.code)} />
          ))}
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
              <select className={styles.sortSelect} value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}>
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
                const dispImg   = info ? bestImg(info.images, FALLBACK_IMG) : h.img;
                const infoReady = !!info;
                const hotelDest = attrMap[String(h.hotelCode)]?.destinationCode || priceScope?.destinations?.[0] || '';
                const gallery   = info ? allImgs(info.images) : [];
                const imgIdx    = gallery.length ? Math.min(cardIdx[h.hotelCode] || 0, gallery.length - 1) : 0;
                const curImg    = gallery.length ? gallery[imgIdx] : dispImg;
                // Headline price split into whole + decimals (toFixed FIRST, so
                // 99.999 renders 100.00 — trunc-then-format would show 99.00).
                const total = Number(h.totalAmount);
                const [totalMajorRaw, totalDec] = Number.isFinite(total) ? total.toFixed(2).split('.') : ['—', null];
                const totalMajor = totalDec != null ? Number(totalMajorRaw).toLocaleString('en-GB') : totalMajorRaw;
                return (
                <article key={h.id} className={styles.resultCard} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 8) * 0.06}s` }}>
                  <div className={styles.rcImg}>
                    {infoReady
                      ? <img src={curImg} alt={dispName} loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
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
                    {h.refundable === false && (<div className={styles.rcNrfChip}>Non-Refundable</div>)}
                  </div>

                  <div className={styles.rcContent}>
                    {dispStars > 0 && (
                      <div className={styles.rcStars}>
                        {'★'.repeat(Math.min(dispStars, 5))}
                        <span className={styles.rcStarLabel}>{Math.min(dispStars, 5)}-star hotel</span>
                      </div>
                    )}
                    {dispName
                      ? <h3 className={styles.rcName}>{dispName}</h3>
                      : <div className={`${styles.rcNameSkel} ${styles.skeletonLine}`} />}
                    <div className={styles.rcLocation}>
                      <Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z" size={13} sw={1.6} />
                      {h.loc}
                    </div>

                    {(h.boardTags.length > 0 || h.roomLabel) && (
                      <div className={styles.rcAmenities}>
                        {h.boardTags.map((b) => (<span key={b} className={styles.rcAmenity}><CheckIcon />{b}</span>))}
                        {h.roomLabel && (<span className={styles.rcAmenity}><CheckIcon />{h.roomLabel}</span>)}
                      </div>
                    )}

                    <div className={styles.rcTrip}>
                      {fetchParams.checkIn && (
                        <div className={styles.rcTripDates}>
                          <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" size={13} sw={1.6} />
                          <span>{fmtDate(fetchParams.checkIn)}</span>
                          <span className={styles.rcTripSep}>→</span>
                          <span>{fmtDate(fetchParams.checkOut)}</span>
                        </div>
                      )}
                      {nights > 0 && (
                        <span className={styles.rcTripPill}>
                          <Icon d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" size={11} sw={2} />
                          {nights} nights
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.rcPriceRail}>
                    <div className={styles.rcPriceInfo}>
                      {/* Only rendered when the API says the rate IS refundable — the
                          false case already has its own chip on the image. */}
                      {h.refundable === true && (
                        <span className={styles.rcRefundable}><CheckIcon />Refundable</span>
                      )}
                      <span className={styles.rcPriceLabel}>
                        Total{nights > 0 ? ` · ${nights} nights` : ''}
                      </span>
                      <div className={styles.rcPriceAmount}>
                        <span className={styles.rcPriceCcy}>{CCY_SYMBOLS[h.currency] || h.currency}</span>
                        {totalMajor}
                        {totalDec != null && <span className={styles.rcPriceDec}>.{totalDec}</span>}
                      </div>
                      {nights > 0 && Number.isFinite(total) && (
                        <div className={styles.rcPriceMeta}>
                          <strong>{h.currency} {(total / nights).toFixed(2)}</strong> / night
                        </div>
                      )}
                      <a
                        className={styles.rcCta}
                        href={detailHref(h, dispName, dispStars, hotelDest, curImg)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Deal
                        <Icon d="M5 12h14M12 5l7 7-7 7" size={14} sw={2.2} />
                      </a>
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

            <img
              key={lightbox.index}
              src={lightbox.images[lightbox.index]}
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
