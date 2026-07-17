import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { fetchFavouriteCodes, addFavourite, removeFavourite } from '../../api';
import { fetchThemes, fetchMatchingHotels, fetchCountries, fetchDestinations } from '../../api/filters';
import { useToast } from '../../context/ToastContext';
import styles from './Results.module.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';
const PAGE_SIZE = 20;
// Default age used for a newly-added child until the traveller picks one. Hotelbeds requires
// an age per child; without it a family search 400s, so we never send a childless-age.
const CHILD_AGE_DEFAULT = 8;

const bestImg = (images, fallback) => {
  if (!Array.isArray(images) || images.length === 0) return fallback;
  const sorted = [...images].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return sorted[0]?.url || fallback;
};

const BOARD_LABELS = {
  RO: 'Room Only',  SC: 'Self Catering', BB: 'Bed & Breakfast',
  HB: 'Half Board', FB: 'Full Board',    AI: 'All Inclusive',
  UAI: 'Ultra All Inclusive', TI: 'All Inclusive+', DO: 'Dinner & B&B',
};
const ROOM_LABELS = {
  DBL: 'Double',       DBT: 'Double / Twin', TWN: 'Twin',      SGL: 'Single',
  TPL: 'Triple',       QUA: 'Quad',          FAM: 'Family',    SUI: 'Suite',
  JSU: 'Junior Suite', STU: 'Studio',        APT: 'Apartment', BUN: 'Bungalow',
  VIL: 'Villa',        ROO: 'Room',
};

// Codes the cache actually filters on — the exact values the `boards` / `roomTypes`
// query params are matched against server-side.
//
// These are the codes that genuinely occur in the cached inventory (verified against
// the live feed), NOT the ones in the cache demo's display map — that map uses
// Hotelbeds' STE/JNR/TRP, but the ingested data stores SUI/JSU/TPL. Offering a code
// the data never contains gives the user a filter that always returns nothing.
// Board codes the cache ACTUALLY holds (verified against live inventory: BB RO HB AI FB SC
// dominate, plus a long tail of B2/DB/CB/AS/… ). 'UAI' was removed — it was offered but NOT
// a single hotel in the cache carries it, so ticking it always returned zero. Only the six
// with real volume AND a human label are offered as quick filters; the rare boards still
// come back in results, just aren't first-class filter chips.
const BOARD_FILTERS = ['RO', 'SC', 'BB', 'HB', 'FB', 'AI'];
const ROOM_FILTERS  = ['DBL', 'DBT', 'TWN', 'TPL', 'FAM', 'SUI', 'JSU', 'STU', 'APT', 'BUN', 'ROO'];

const SORT_OPTIONS = [
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  // Filter 3 — distance sorts. Applied CLIENT-SIDE using the distances from the admin
  // content API (the cache prices by price and does not know distances). Only reorders the
  // hotels already loaded — a true global distance sort would need the cache to hold
  // distances, which is a later enhancement.
  { value: 'distance_beach',  label: 'Distance to beach' },
  { value: 'distance_centre', label: 'Distance to centre' },
];
const REFUNDABLE_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Refundable' },
  { value: 'no',  label: 'Non-ref.' },
];
// Filter 5 — transport type. Maps to the cache `searchType` (see buildQS).
const TRANSPORT_OPTIONS = [
  { value: 'hotel_only', label: 'Own transport' },
  { value: 'package',    label: 'Flight + hotel' },
];
const PRICE_BASIS_OPTIONS = [
  { value: 'total',     label: 'Total stay' },
  { value: 'perPerson', label: 'Per person' },
];

const PRICE_STEP = 50;
// Placeholder span for the slider until the first results land and tell us the real
// price range. Once they do, the ceiling tracks the data — a fixed floor would squash
// a €60–€250 result set into the left quarter of the track, and would never come down
// when switching to the (roughly halved) per-person scale.
const PRICE_CEILING_FALLBACK = 1000;
const EMPTY_FILTERS = {
  boards: [], roomTypes: [], minPrice: '', maxPrice: '',
  priceBasis: 'total', refundable: 'any', sortBy: 'price_asc',
  // Content filters (holiday theme). `themes` = selected theme ids; `hotelCodes` = the codes
  // the admin content API resolved for {destination, themes}. hotelCodes is what actually
  // gets sent to the cache; null means "not resolved / no content filter" (whole destination).
  themes: [], hotelCodes: null,
  // Transport type (Filter 5). 'hotel_only' = own transport → cache searchType=HOTEL_ONLY
  // (excludes package-only/opaque rates). 'package' = flight + hotel → searchType=PACKAGE
  // (lets package rates in; the flight leg is added on the detail/checkout screens).
  transport: 'hotel_only',
};

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Display symbol for the headline price only — fine print keeps the ISO code.
const CCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', TRY: '₺' };

const getBoardLabel = (code) => BOARD_LABELS[code] || code || '';
const getRoomLabel  = (code) => ROOM_LABELS[code]  || code || '';

// How many filters the user has actively changed — drives the sidebar count pill.
const countActiveFilters = (f) =>
  f.boards.length + f.roomTypes.length + (f.themes?.length || 0) +
  (f.minPrice !== '' ? 1 : 0) + (f.maxPrice !== '' ? 1 : 0) +
  (f.priceBasis !== 'total' ? 1 : 0) + (f.refundable !== 'any' ? 1 : 0) +
  (f.transport && f.transport !== 'hotel_only' ? 1 : 0);
const fmtDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
};

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

  const destCode         = params.get('destination')      || '';
  const destinationLabel = params.get('destinationLabel') || destCode;

  const defaultCheckIn  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const defaultCheckOut = (() => { const d = new Date(); d.setDate(d.getDate() + 37); return d.toISOString().split('T')[0]; })();

  const initCheckIn  = params.get('checkIn')  || defaultCheckIn;
  const initCheckOut = params.get('checkOut') || defaultCheckOut;
  const initAdults   = params.get('adults')   || '2';
  const initChildren = params.get('children') || '0';
  const initRooms    = params.get('rooms')    || '1';
  const childAges    = params.get('childAges') || '';

  // Sidebar draft state (not yet fetched)
  const [localCheckIn,  setLocalCheckIn]  = useState(initCheckIn);
  const [localCheckOut, setLocalCheckOut] = useState(initCheckOut);

  // Filter 4 — PER-ROOM occupancy. `roomsConfig` is one entry per room, each with its own
  // adults + children + a child age per child (Hotelbeds requires an age for every child).
  // The flat totals the cache needs (adults/children/rooms/childAges/maxPerRoom) are DERIVED
  // from this below, so uneven room splits ("room 1: 2 adults, room 2: 2 adults + 1 child")
  // are priced correctly instead of an even ceil-split.
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

  // Room editing helpers (bounded: 1–6 adults, 0–4 children per room, 1–5 rooms).
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

  // Result filters — mirrored 1:1 onto the cache's /contracts/cheapest query params.
  // `filters` drives the UI (instant); `applied` is the debounced copy that drives
  // the fetch, so dragging a price handle doesn't fire a request per pixel.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);

  // Holiday-theme filter options (loaded once from the admin content API).
  // `themesStatus`: 'loading' | 'ok' | 'error' — drives a visible state so the section is
  // ALWAYS shown (even while loading or if the admin API is unreachable), never silently gone.
  const [themeOptions, setThemeOptions] = useState([]);
  const [themesStatus, setThemesStatus] = useState('loading');
  // hotelCode → content attributes (stars, beach/centre distances) from the admin API, used
  // for the distance sorts. Refreshed whenever the destination or selected themes change.
  const [attrMap, setAttrMap] = useState({});

  // Filter 2 — country → destination cascade (a way to jump to a different destination).
  const [countryOptions, setCountryOptions]         = useState([]);
  const [countriesStatus, setCountriesStatus]       = useState('loading');
  const [cascadeCountry, setCascadeCountry]         = useState('');
  const [destinationOptions, setDestinationOptions] = useState([]);

  const [loading, setLoading]         = useState(true);
  const [filtering, setFiltering]     = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [allHotels, setAllHotels]     = useState([]);
  const [nights, setNights]           = useState(0);
  const [cheapestCode, setCheapestCode] = useState(null);
  const [liked, setLiked]             = useState({});
  const isAuth = useSelector((s) => s.auth?.isAuthenticated);
  const { showToast } = useToast();

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
  const [drawerOpen, setDrawerOpen]   = useState(false);

  // Upper bound of the price sliders, in the currently-selected price basis.
  // null = not discovered yet. Within one search+basis it only grows (later pages
  // bring pricier hotels); it is reset to null — never merely lowered — when the
  // search or the basis changes, so the next unfiltered response redefines it.
  // Recomputing it from *filtered* results would collapse the track the moment a
  // price bound is applied, which is why growCeiling is gated on "no bounds set".
  const [priceCeiling, setPriceCeiling] = useState(null);

  // Lazy hotel-info loading
  const [infoMap, setInfoMap]         = useState({});
  const infoLoadingRef = useRef(new Set());
  const sentinelRef    = useRef(null);

  // Pagination state tracked in refs to avoid stale closures in async callbacks
  const paginationRef  = useRef({ page: 1, hasMore: true, fetching: false });
  const seenCodesRef   = useRef(new Set());

  // Debounce the UI filters into the committed set that actually drives fetching.
  // The initial pass is a no-op: `filters` and `applied` start as the same object,
  // so React bails out of the identical setState and no extra fetch fires.
  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Load the holiday-theme options once (from the admin content API). The section is always
  // rendered; this just fills it. On error we flip to 'error' so the UI can say so.
  useEffect(() => {
    let live = true;
    fetchThemes()
      .then((t) => { if (live) { setThemeOptions(t); setThemesStatus('ok'); } })
      .catch(() => { if (live) setThemesStatus('error'); });
    return () => { live = false; };
  }, []);

  // Filter 2 — load the country list once (only countries that actually have hotels).
  useEffect(() => {
    let live = true;
    fetchCountries()
      .then((c) => { if (live) { setCountryOptions(c); setCountriesStatus('ok'); } })
      .catch(() => { if (live) setCountriesStatus('error'); });
    return () => { live = false; };
  }, []);

  // Filter 2 — load destinations whenever a country is picked in the cascade.
  useEffect(() => {
    if (!cascadeCountry) { setDestinationOptions([]); return; }
    let live = true;
    fetchDestinations(cascadeCountry).then((d) => { if (live) setDestinationOptions(d); }).catch(() => { if (live) setDestinationOptions([]); });
    return () => { live = false; };
  }, [cascadeCountry]);

  // CONTENT-FILTER RESOLUTION. When the selected theme(s) or the destination change, ask the
  // admin content API which hotelCodes match, and write them into `filters.hotelCodes`. That
  // change flows through the debounce above into `applied`, so the cache is re-queried for
  // exactly those hotels. Keyed on a STRING of the theme ids (stable across the hotelCodes
  // write, so this cannot loop). No themes selected → clear hotelCodes (whole destination).
  const themeKey = (filters.themes || []).join(',');
  useEffect(() => {
    if (!destCode) return;
    const ids = (filters.themes || []);
    let live = true;
    // Always ask the admin content API for this destination (with any themes): the response
    // gives BOTH the theme-matched hotelCodes AND the per-hotel attributes (distances) the
    // distance sorts need — so we fetch even with no theme selected.
    // Guard: with NO themes the target hotelCodes is null. If it's already null (e.g. first
    // mount, or after clearing themes) DON'T create a new filters object — that would ripple
    // through the debounce and fire a redundant second search. Only a real change refetches.
    const applyCodes = (next) => setFilters((f) => (f.hotelCodes === next ? f : { ...f, hotelCodes: next }));
    fetchMatchingHotels({ destinationCode: destCode, themes: ids })
      .then((r) => {
        if (!live) return;
        setAttrMap(r.attributes || {});
        // hotelCodes restricts the cache ONLY when a theme is active; no theme → whole dest.
        applyCodes(ids.length ? (r.hotelCodes || []) : null);
      })
      .catch(() => {
        if (!live) return;
        setAttrMap({});
        // Fail safe: with a theme active, show nothing rather than silently ignore it.
        applyCodes(ids.length ? [] : null);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, destCode]);

  // Fetch params ref so loadMore always sees latest values
  const fetchParamsRef    = useRef(fetchParams);
  const destCodeRef       = useRef(destCode);
  const childAgesRef      = useRef(childAges);
  const destLabelRef      = useRef(destinationLabel);
  const appliedRef        = useRef(applied);
  useEffect(() => { fetchParamsRef.current = fetchParams; },    [fetchParams]);
  useEffect(() => { destCodeRef.current    = destCode; },       [destCode]);
  useEffect(() => { childAgesRef.current   = childAges; },      [childAges]);
  useEffect(() => { destLabelRef.current   = destinationLabel; }, [destinationLabel]);
  useEffect(() => { appliedRef.current     = applied; },        [applied]);

  // Only ever *raise* the slider ceiling, and only from a price-unfiltered response —
  // otherwise the track shrinks to the filtered max and traps the user below their
  // own selection.
  const growCeiling = (amounts) => {
    if (!amounts.length) return;
    const rounded = Math.ceil(Math.max(...amounts) / PRICE_STEP) * PRICE_STEP;
    setPriceCeiling((prev) => Math.max(prev ?? 0, rounded, PRICE_STEP));
  };

  const buildQS = (fp, dc, ca, page, f) => {
    const roomsN = Math.max(1, parseInt(fp.rooms, 10) || 1);
    // Prefer the EXACT per-room maxes from the occupancy editor (fp.maxAdultsPerRoom); fall
    // back to an even ceil-split for legacy/URL-seeded searches that didn't set them.
    const maxA = fp.maxAdultsPerRoom   ?? String(Math.ceil((parseInt(fp.adults, 10)   || 1) / roomsN));
    const maxC = fp.maxChildrenPerRoom ?? String(Math.ceil((parseInt(fp.children, 10) || 0) / roomsN));
    const qs = new URLSearchParams({
      destination:        dc,
      checkIn:            fp.checkIn,
      checkOut:           fp.checkOut,
      adults:             fp.adults,
      children:           fp.children,
      rooms:              String(roomsN),
      limit:              String(PAGE_SIZE),
      page:               String(page),
      source:             'combined',
      maxAdultsPerRoom:   maxA,
      maxChildrenPerRoom: maxC,
    });
    // Prefer the ages the occupancy editor collected (fp.childAges); else the URL-seeded ca.
    const ages = fp.childAges || ca;
    if (ages) qs.set('childAges', ages);

    // ── Result filters — omitted entirely when at their default, so the cache can
    //    take its fast unfiltered path (see `hasFilter` in the contracts controller).
    if (f.boards.length)     qs.set('boards',    f.boards.join(','));
    if (f.roomTypes.length)  qs.set('roomTypes', f.roomTypes.join(','));

    // A min of 0 and a max sitting at the (still-growing) ceiling both mean
    // "no bound" — sending them would exclude pricier hotels from later pages.
    const min = f.minPrice === '' ? null : Number(f.minPrice);
    const max = f.maxPrice === '' ? null : Number(f.maxPrice);
    if (Number.isFinite(min) && min > 0)  qs.set('minPrice', String(min));
    if (Number.isFinite(max) && max > 0 && !(min != null && max < min)) {
      qs.set('maxPrice', String(max));
    }
    if (f.priceBasis !== 'total') qs.set('priceBasis', f.priceBasis);
    if (f.refundable !== 'any')   qs.set('refundable', f.refundable);
    // Only PRICE sorts go to the cache (its sortBy enum is price_asc|price_desc). Distance
    // sorts are client-side, so we leave the cache on its default price_asc and reorder here.
    if (f.sortBy === 'price_desc') qs.set('sortBy', 'price_desc');
    // Transport type (Filter 5) → cache searchType. Only sent when 'package' (PACKAGE),
    // since HOTEL_ONLY is the cache default and omitting it keeps the fast unfiltered path.
    if (f.transport === 'package') qs.set('searchType', 'PACKAGE');

    // Content-filter hand-off: when the admin content API has resolved a hotelCode set for
    // the chosen theme(s), the cache prices ONLY those. An empty resolved set means "themes
    // selected but nothing matched" → send a sentinel so the cache returns nothing, rather
    // than falling back to the whole destination (which would ignore the filter). null =
    // no content filter at all → omitted, whole destination as before.
    if (Array.isArray(f.hotelCodes)) {
      qs.set('hotelCodes', f.hotelCodes.length ? f.hotelCodes.join(',') : '__none__');
    }

    return qs.toString();
  };

  const mapContract = (c, label) => {
    // The cache returns `boardCode` on external results but `board` on internal
    // ones, and /contracts/cheapest?source=combined interleaves both. Reading only
    // one of the two left every external hotel with no board at all.
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
    // No rotating marketing badges — only data-backed ones are rendered
    // ("Best Value" on the cheapest card, computed at render time).
    badge:        null,
    img:          FALLBACK_IMG,
    loc:          label,
    };
  };

  // Identifies "a different search" (vs. merely a different filter on the same search).
  // Only a new search resets the price ceiling and shows full-page skeletons.
  // Include the COMMITTED child ages (fetchParams), not the URL seed, so changing a child's
  // age (same head-counts) still re-fires the search. Falls back to the URL value pre-edit.
  const searchKey = `${destCode}|${fetchParams.checkIn}|${fetchParams.checkOut}|${fetchParams.adults}|${fetchParams.children}|${fetchParams.rooms}|${fetchParams.childAges ?? childAges}`;
  const prevSearchKeyRef = useRef(null);

  // A price bound is only meaningful for the search it was chosen in — "under €1,500"
  // means something different for 3 nights than for 10, or for 2 guests than for 6.
  // Carrying it across a search change would also strand the slider: the ceiling
  // regrows only from price-unfiltered responses, so a bound left in place would pin
  // the track at its floor and the user could never raise it again.
  //
  // Adjusting state during render (React's documented pattern for reacting to changed
  // inputs) rather than in an effect: it re-renders before the fetch effect below
  // commits, so we never fire one request with the stale bounds and another without.
  const [priceSearchKey, setPriceSearchKey] = useState(searchKey);
  if (priceSearchKey !== searchKey) {
    setPriceSearchKey(searchKey);
    if (filters.minPrice !== '' || filters.maxPrice !== '') {
      // Same object into both, so the pending debounce commits an identical
      // reference and React bails out instead of firing a second fetch.
      const cleared = { ...filters, minPrice: '', maxPrice: '' };
      setFilters(cleared);
      setApplied(cleared);
    }
  }

  // Monotonic request id — a slow response from an earlier filter state must never
  // overwrite the results of a newer one (rapid toggling reorders responses).
  const reqIdRef = useRef(0);

  // Page-1 fetch. Re-runs on a new search AND on every committed filter change.
  useEffect(() => {
    if (!destCode) {
      setAllHotels([]);
      setHasMore(false);
      setLoading(false);
      setFiltering(false);
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
      // Same search, new filter — keep the current cards on screen (dimmed) instead
      // of flashing skeletons, then swap them for the filtered set.
      setFiltering(true);
    }
    setHasMore(true);
    seenCodesRef.current  = new Set();
    paginationRef.current = { page: 1, hasMore: true, fetching: true };

    const reqId = ++reqIdRef.current;
    const url = `${CONTRACTS_API}/contracts/cheapest?${buildQS(fetchParams, destCode, childAges, 1, applied)}`;
    console.log('[Results] Page 1 fetch:', url);

    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (reqId !== reqIdRef.current) return;   // a newer request has superseded this one
        const results = data.results || [];
        setNights(data.nights || 0);

        // The API's `cheapest` is merged[0] — the first item AFTER sorting — so under
        // price_desc it is really the most EXPENSIVE stay. Trusting it there put the
        // "Best Value" badge on the priciest card. It is only the true global minimum
        // on an ascending sort; on descending we have no way to know it, so no badge.
        setCheapestCode(applied.sortBy === 'price_asc' ? (data.cheapest?.hotelCode ?? null) : null);

        const seen   = seenCodesRef.current;
        const mapped = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) {
            seen.add(c.hotelCode);
            mapped.push(mapContract(c, destinationLabel));
          }
        }

        // Only widen the slider range from a price-unconstrained response.
        if (applied.minPrice === '' && applied.maxPrice === '') {
          growCeiling(mapped.map((h) => (applied.priceBasis === 'perPerson' ? h.perPerson : h.totalAmount))
                            .filter((n) => Number.isFinite(n)));
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
        setAllHotels([]);
        setHasMore(false);
        setLoading(false);
        setFiltering(false);
        paginationRef.current = { page: 1, hasMore: false, fetching: false };
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destCode, fetchParams, applied]);

  // Load next page from API
  const loadMore = useCallback(() => {
    const pg = paginationRef.current;
    if (!pg.hasMore || pg.fetching) return;

    paginationRef.current = { ...pg, fetching: true };
    setFetchingMore(true);

    const fp  = fetchParamsRef.current;
    const dc  = destCodeRef.current;
    const ca  = childAgesRef.current;
    const lbl = destLabelRef.current;
    const f   = appliedRef.current;

    // Snapshot the current request generation. If a filter changes while this page
    // is in flight, page 1 will have reset the list — appending this stale page on
    // top of it would mix two different filter results.
    const reqId = reqIdRef.current;

    const url = `${CONTRACTS_API}/contracts/cheapest?${buildQS(fp, dc, ca, pg.page, f)}`;
    console.log('[Results] Load more (page=' + pg.page + '):', url);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (reqId !== reqIdRef.current) return;   // superseded by a newer filter/search
        const results = data.results || [];
        const seen    = seenCodesRef.current;

        // Dedup OUTSIDE the state updater: seen.add() is a mutation, and React
        // StrictMode double-invokes updater functions in dev — doing it inside
        // would make the 2nd invocation see the codes already added and append
        // nothing, wiping the new page. Build the new items here (once), then
        // append with a pure updater.
        const newCards = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) {
            seen.add(c.hotelCode);
            newCards.push(c);
          }
        }

        if (newCards.length > 0) {
          const mapped = newCards.map((c) => mapContract(c, lbl));
          setAllHotels((prev) => [...prev, ...mapped]);
          if (f.minPrice === '' && f.maxPrice === '') {
            growCeiling(mapped.map((h) => (f.priceBasis === 'perPerson' ? h.perPerson : h.totalAmount))
                              .filter((n) => Number.isFinite(n)));
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
  }, []);

  // Filtering and sorting are done by the cache (it recalculates each hotel's
  // cheapest *matching* rate, which client-side filtering of already-picked
  // winners cannot do), so the fetched list is the list we render.
  // Distance sorts (Filter 3) are applied here, client-side, using the admin attributes —
  // the cache has already ordered by price. A hotel with no distance for the chosen metric
  // sorts LAST (Infinity), never as 0 (which would wrongly float unknowns to the top).
  const hotels = useMemo(() => {
    const field = applied.sortBy === 'distance_beach' ? 'beachMetres'
                : applied.sortBy === 'distance_centre' ? 'centreMetres' : null;
    if (!field) return allHotels;
    const dist = (h) => {
      const v = attrMap[String(h.hotelCode)]?.[field];
      return typeof v === 'number' && v >= 0 ? v : Infinity;
    };
    return [...allHotels].sort((a, b) => dist(a) - dist(b));   // nearest first
  }, [allHotels, applied.sortBy, attrMap]);

  // Lazily load real hotel info (name/images/stars) for all visible hotels
  useEffect(() => {
    const need = hotels
      .map((h) => String(h.hotelCode))
      .filter((code) => !infoMap[code] && !infoLoadingRef.current.has(code));
    if (need.length === 0) return;

    need.forEach((c) => infoLoadingRef.current.add(c));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CONTRACTS_API}/hotels/bulk`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ hotelCodes: need }),
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
  // Re-runs when allHotels.length changes so it reconnects after each page
  // load and fires immediately if the sentinel is still in view (short page).
  useEffect(() => {
    if (loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore, allHotels.length, loadMore]);

  const toggleLike = (hotelCode, snapshot) => {
    if (!isAuth) { showToast('Sign in to save favourites', 'info'); navigate('/login'); return; }
    const wasLiked = !!liked[hotelCode];
    setLiked((prev) => ({ ...prev, [hotelCode]: !wasLiked }));   // optimistic
    const req = wasLiked ? removeFavourite(hotelCode) : addFavourite(snapshot);
    req
      .then(() => showToast(wasLiked ? 'Removed from favourites' : 'Added to favourites', 'success'))
      .catch(() => {
        setLiked((prev) => ({ ...prev, [hotelCode]: wasLiked })); // revert on failure
        showToast('Couldn’t update favourites. Please try again.', 'error');
      });
  };
  // Toggle a code in one of the multi-select filter arrays (boards / roomTypes).
  const toggleCode = (key, code) => setFilters((f) => ({
    ...f,
    [key]: f[key].includes(code) ? f[key].filter((x) => x !== code) : [...f[key], code],
  }));

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  // Switching basis changes what the min/max numbers *mean* (total stay vs. per
  // person), so carrying the old bounds over would silently filter on the wrong
  // scale. Clear them, and drop the ceiling back to its floor so it regrows from
  // per-person prices — otherwise the track would keep spanning the total-stay
  // range (0–8,500) while the actual values only reach ~300.
  const setPriceBasis = (value) => {
    if (filters.priceBasis === value) return;
    setPriceCeiling(null);
    setFilters((f) => ({ ...f, priceBasis: value, minPrice: '', maxPrice: '' }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // Until the first results define the real range, span a placeholder.
  const ceiling = priceCeiling ?? PRICE_CEILING_FALLBACK;

  // Slider positions. An empty bound means "unbounded", which renders as the
  // track edge — and a max pinned to the ceiling is deliberately sent as no max.
  const sliderMin = filters.minPrice === '' ? 0 : Math.min(Number(filters.minPrice), ceiling);
  const sliderMax = filters.maxPrice === '' ? ceiling : Math.min(Number(filters.maxPrice), ceiling);

  const onMinPrice = (raw) => {
    // Never let the handles cross.
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
      // Per-room occupancy → the exact totals + per-room maxes + child ages the cache needs.
      childAges:          allChildAges.join(','),
      maxAdultsPerRoom:   String(maxAdultsPerRoom),
      maxChildrenPerRoom: String(maxChildrenPerRoom),
    }));
  };

  // Filter 2 — jump to a different destination from the cascade. Re-navigates the results
  // page with the new destination, preserving the current dates + occupancy.
  const goToDestination = (code, label) => {
    if (!code) return;
    const qp = new URLSearchParams({
      destination: code,
      destinationLabel: label || code,
      checkIn: fetchParams.checkIn, checkOut: fetchParams.checkOut,
      adults: fetchParams.adults, children: fetchParams.children, rooms: fetchParams.rooms,
    });
    if (fetchParams.childAges) qp.set('childAges', fetchParams.childAges);
    navigate({ search: qp.toString() });   // same /results page, new query
  };

  const guestSummary = `${fetchParams.adults} Adult${fetchParams.adults !== '1' ? 's' : ''}${fetchParams.children !== '0' ? `, ${fetchParams.children} Child${fetchParams.children !== '1' ? 'ren' : ''}` : ''}`;

  const heroChips = [];
  if (fetchParams.checkIn && fetchParams.checkOut) {
    heroChips.push({
      icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
      text: `${fmtDate(fetchParams.checkIn)} — ${fmtDate(fetchParams.checkOut)}`,
    });
  }
  if (nights > 0) {
    heroChips.push({
      icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
      text: `${nights} nights`,
    });
  }
  heroChips.push({
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    text: guestSummary,
  });

  const sidebar = (
    <>
      {/* Dates & Guests — re-calls API */}
      <FilterSection title="Dates & Guests" defaultOpen>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-in</label>
          <input
            type="date"
            className={styles.dateInput}
            value={localCheckIn}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setLocalCheckIn(e.target.value)}
          />
        </div>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-out</label>
          <input
            type="date"
            className={styles.dateInput}
            value={localCheckOut}
            min={localCheckIn || new Date().toISOString().split('T')[0]}
            onChange={(e) => setLocalCheckOut(e.target.value)}
          />
        </div>
        {/* Filter 4 — per-room occupancy. One block per room: adults, children, child ages. */}
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

      {/* Price Range — min + max, on either a total-stay or per-person basis */}
      <FilterSection title="Price Range" defaultOpen>
        <div className={styles.priceSliderWrap}>
          <div className={styles.priceDual}>
            <div className={styles.priceDualTrack}>
              <div
                className={styles.priceDualFill}
                style={{
                  left:  `${(sliderMin / ceiling) * 100}%`,
                  right: `${100 - (sliderMax / ceiling) * 100}%`,
                }}
              />
            </div>
            <input
              type="range"
              className={`${styles.filterRange} ${styles.rangeDual}`}
              min={0} max={ceiling} step={PRICE_STEP}
              value={sliderMin}
              onChange={(e) => onMinPrice(e.target.value)}
              aria-label="Minimum price"
            />
            <input
              type="range"
              className={`${styles.filterRange} ${styles.rangeDual}`}
              min={0} max={ceiling} step={PRICE_STEP}
              value={sliderMax}
              onChange={(e) => onMaxPrice(e.target.value)}
              aria-label="Maximum price"
            />
          </div>
          <div className={styles.priceSliderLabels}>
            <span>{priceLabel(0)}</span>
            <span className={styles.priceSliderCurrent}>
              {priceLabel(sliderMin)} – {priceLabel(sliderMax)}
              {filters.maxPrice === '' ? '+' : ''}
            </span>
            <span>{priceLabel(ceiling)}</span>
          </div>
        </div>
        <Segmented
          options={PRICE_BASIS_OPTIONS}
          value={filters.priceBasis}
          onChange={setPriceBasis}
          ariaLabel="Price basis"
        />
      </FilterSection>

      {/* Destination cascade (Filter 2) — country → destination. ALWAYS shown; the country
          list fills once the admin content API responds. If that API is unreachable it says
          so, rather than the whole section disappearing. */}
      <FilterSection title="Destination" defaultOpen={false}>
        {countriesStatus === 'error' ? (
          <p className={styles.filterEmpty}>Destination filter unavailable (content service unreachable).</p>
        ) : countryOptions.length === 0 ? (
          <p className={styles.filterEmpty}>Loading countries…</p>
        ) : (
          <>
            <label className={styles.cascadeLabel}>
              <span>Country</span>
              <select
                className={styles.cascadeSelect}
                value={cascadeCountry}
                onChange={(e) => setCascadeCountry(e.target.value)}
              >
                <option value="">Select a country…</option>
                {countryOptions.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            {cascadeCountry && (
              <label className={styles.cascadeLabel}>
                <span>Destination</span>
                <select
                  className={styles.cascadeSelect}
                  value={destCode}
                  onChange={(e) => {
                    const opt = destinationOptions.find((d) => d.code === e.target.value);
                    goToDestination(e.target.value, opt?.name);
                  }}
                >
                  <option value="">{destinationOptions.length ? 'Select a destination…' : 'Loading…'}</option>
                  {destinationOptions.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}
      </FilterSection>

      {/* Transport type (Filter 5) — own transport (hotel only) vs flight + hotel package.
          Sets the cache searchType; PACKAGE lets package-only rates in. */}
      <FilterSection title="Transport" defaultOpen>
        <Segmented
          options={TRANSPORT_OPTIONS}
          value={filters.transport}
          onChange={(v) => setFilter('transport', v)}
          ariaLabel="Transport type"
        />
      </FilterSection>

      {/* Holiday Type (Filter 1) — ALWAYS shown; the chips fill once the admin content API
          responds. If that API is unreachable it says so, rather than vanishing. */}
      <FilterSection title="Holiday Type" defaultOpen>
        {themesStatus === 'error' ? (
          <p className={styles.filterEmpty}>Holiday types unavailable (content service unreachable).</p>
        ) : themeOptions.length === 0 ? (
          <p className={styles.filterEmpty}>Loading holiday types…</p>
        ) : (
          themeOptions.map((t) => (
            <FilterCheck
              key={t.id}
              label={`${t.icon ? `${t.icon} ` : ''}${t.name}`}
              checked={filters.themes.includes(t.id)}
              onChange={() => toggleCode('themes', t.id)}
            />
          ))
        )}
      </FilterSection>

      {/* Board Type — server-side (`boards`) */}
      <FilterSection title="Board Type" defaultOpen>
        {BOARD_FILTERS.map((code) => (
          <FilterCheck
            key={code}
            label={getBoardLabel(code)}
            checked={filters.boards.includes(code)}
            onChange={() => toggleCode('boards', code)}
          />
        ))}
      </FilterSection>

      {/* Room Type — server-side (`roomTypes`) */}
      <FilterSection title="Room Type" defaultOpen={false}>
        {ROOM_FILTERS.map((code) => (
          <FilterCheck
            key={code}
            label={getRoomLabel(code)}
            checked={filters.roomTypes.includes(code)}
            onChange={() => toggleCode('roomTypes', code)}
          />
        ))}
      </FilterSection>

      {/* Cancellation — server-side (`refundable`), derived from the rate class */}
      <FilterSection title="Cancellation" defaultOpen>
        <Segmented
          options={REFUNDABLE_OPTIONS}
          value={filters.refundable}
          onChange={(v) => setFilter('refundable', v)}
          ariaLabel="Cancellation policy"
        />
      </FilterSection>
    </>
  );

  // The only badge we can honestly back with data: the cheapest stay for this
  // search. The API reports the global cheapest across *all* matching hotels, which
  // is what we want — a local min over the loaded pages would move the badge around
  // as you scroll, and would sit on the wrong card entirely under high-to-low sort.
  const bestValueId = cheapestCode ?? null;

  return (
    <div className={styles.page}>
      {/* Hero header */}
      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className={styles.heroGrid} />
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
        <span className={styles.twinkle} style={{ top: '24%', left: '38%' }} />
        <span className={styles.twinkle} style={{ top: '58%', left: '55%', animationDelay: '1.2s' }} />
        <span className={styles.twinkle} style={{ top: '18%', left: '72%', animationDelay: '2.1s' }} />
        <span className={styles.twinkle} style={{ top: '64%', left: '86%', animationDelay: '0.6s' }} />
        <div className={styles.heroInner}>
          <div className={styles.breadcrumb}>
            <span>Home</span>
            <span className={styles.bcSep}>·</span>
            <span>Holidays</span>
            <span className={styles.bcSep}>·</span>
            <span className={styles.bcActive}>{destinationLabel || 'Results'}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {destinationLabel ? (
              <>Stays in <em>{destinationLabel}</em></>
            ) : (
              'Find your perfect stay'
            )}
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
            {loading ? (
              <span className={styles.countSearching}>
                <span className={styles.countPulse} />
                Searching the best deals…
              </span>
            ) : (
              <><strong>{hotels.length}{hasMore ? '+' : ''}</strong> {hotels.length === 1 ? 'stay' : 'stays'} found</>
            )}
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.sortWrap}>
              <span className={styles.sortLabel}>
                <Icon d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" size={14} sw={2} />
                Sort
              </span>
              <select
                className={styles.sortSelect}
                value={filters.sortBy}
                onChange={(e) => setFilter('sortBy', e.target.value)}
              >
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
              [1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonImg} />
                  <div className={styles.skeletonBody}>
                    <div className={`${styles.skeletonLine} ${styles.skW60}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW40}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW80}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW30}`} />
                  </div>
                  <div className={styles.skeletonRail}>
                    <div className={`${styles.skeletonLine} ${styles.skRail1}`} />
                    <div className={`${styles.skeletonLine} ${styles.skRail2}`} />
                  </div>
                </div>
              ))
            ) : !destCode ? (
              <div className={styles.noResults}>
                <div className={styles.noResultsIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <h3>Select a destination</h3>
                <p>Use the search form to find available holidays.</p>
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
                    : 'Try a different destination or different dates.'}
                </p>
                {activeCount > 0 && (
                  <button className={styles.applyBtn} style={{ maxWidth: 200 }} onClick={clearFilters}>
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              hotels.map((h, i) => {
                const info      = infoMap[String(h.hotelCode)];
                const dispName  = info?.name?.trim() || h.name;
                const dispStars = info?.stars ?? h.stars;
                const dispImg   = info ? bestImg(info.images, FALLBACK_IMG) : h.img;
                const infoReady = !!info;
                // Headline price split into whole + decimals (toFixed FIRST, so
                // 99.999 renders 100.00 — trunc-then-format would show 99.00).
                const total = Number(h.totalAmount);
                const [totalMajorRaw, totalDec] = Number.isFinite(total) ? total.toFixed(2).split('.') : ['—', null];
                const totalMajor = totalDec != null ? Number(totalMajorRaw).toLocaleString('en-GB') : totalMajorRaw;
                return (
                <article key={h.id} className={styles.resultCard} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 8) * 0.06}s` }}>
                  {/* Image column */}
                  <div className={styles.rcImg}>
                    {infoReady
                      ? <img src={dispImg} alt={dispName} loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
                      : <div className={styles.rcImgSkel} />}
                    <div className={styles.rcImgOverlay} />
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
                        stars: dispStars || null,
                        imageUrl: infoReady ? dispImg : null,
                      })}
                      aria-label="Save to favourites"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill={liked[h.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    </button>
                    {/* The API derives this from the rate class, so it also catches
                        NRP (non-refundable prepaid), which a bare 'NRF' check missed. */}
                    {h.refundable === false && (
                      <div className={styles.rcNrfChip}>Non-Refundable</div>
                    )}
                  </div>

                  {/* Content column */}
                  <div className={styles.rcContent}>
                    {dispStars > 0 && (
                      <div className={styles.rcStars}>
                        {'★'.repeat(Math.min(dispStars, 5))}
                        <span className={styles.rcStarLabel}>{Math.min(dispStars, 5)}-star hotel</span>
                      </div>
                    )}
                    {/* Always show a name — the price feed carries one; the slow
                        bulk-info fetch only upgrades it (no more nameless cards). */}
                    {dispName
                      ? <h3 className={styles.rcName}>{dispName}</h3>
                      : <div className={`${styles.rcNameSkel} ${styles.skeletonLine}`} />}
                    <div className={styles.rcLocation}>
                      <Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z" size={13} sw={1.6} />
                      {h.loc}
                    </div>

                    {(h.boardTags.length > 0 || h.roomLabel) && (
                      <div className={styles.rcAmenities}>
                        {h.boardTags.map((b) => (
                          <span key={b} className={styles.rcAmenity}>
                            <CheckIcon />{b}
                          </span>
                        ))}
                        {h.roomLabel && (
                          <span className={styles.rcAmenity}>
                            <CheckIcon />{h.roomLabel}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Trip details */}
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

                  {/* Price rail — internal contract/rate-plan names are never
                      shown to customers; refundability already has its own chip. */}
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
                      <button
                        className={styles.rcCta}
                        onClick={() => navigate(`/hotel/${h.hotelCode}`, {
                          state: {
                            hotel: { ...h, name: dispName, stars: dispStars, img: dispImg },
                            info,
                            destination: destCode,
                            nights,
                            checkIn: fetchParams.checkIn,
                            checkOut: fetchParams.checkOut,
                            adults: fetchParams.adults,
                            children: fetchParams.children,
                            rooms: fetchParams.rooms,
                            childAges: childAgesRef.current,
                          },
                        })}
                      >
                        View Deal
                        <Icon d="M5 12h14M12 5l7 7-7 7" size={14} sw={2.2} />
                      </button>
                    </div>
                  </div>
                </article>
                );
              })
            )}

            {/* Invisible sentinel — IntersectionObserver anchor, always present while more pages exist */}
            {!loading && hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}
            {/* Spinner — only shown while a page fetch is actually in flight */}
            {!loading && fetchingMore && (
              <div className={styles.loadMore}>
                <span className={styles.loadMoreSpin} />
                Loading more stays…
              </div>
            )}
            {/* End of results — no more pages to load */}
            {!loading && !hasMore && hotels.length > 0 && (
              <div className={styles.endOfResults}>
                You’ve reached the end — all {hotels.length} stays shown
              </div>
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
    </div>
  );
}
