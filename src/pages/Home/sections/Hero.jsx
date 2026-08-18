import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Hero.module.css';
import { useHomepageConfig, useCountries } from '../../../api';
import DestinationModal from '../../../components/DestinationModal/DestinationModal';
import DateCalendar from '../../../components/DateCalendar/DateCalendar';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import { DURATION_BANDS, bandByLabel, daysToNights } from '../../../utils/durations';
import { POPULAR_AIRPORTS, OTHER_AIRPORTS, DEFAULT_ORIGIN, airportCity, airportLabel } from '../../../utils/airports';
import { earliestCheckInISO } from '../../../utils/leadTime';
import { loadPax, savePax } from '../../../utils/paxStore';

// Duration bands shown in the search box. Each band is a day-range with a representative stay
// length in nights — the concrete duration the search prices for that band. Picking a band + a
// departure date therefore "picks the dates": checkOut = checkIn + that band's nights.
// (minNights/maxNights ride along in the URL so the results page can offer the full range later.)
//
// Shared with the hotel page's Duration filter — see utils/durations. They were separate lists
// speaking different languages ("6-10 days" here, "7 nights · 8 days" there), so a search made
// on this page appeared to have been lost by the time the traveller reached a hotel.
const DURATIONS = DURATION_BANDS;
const findBand = bandByLabel;

const MAX_ROOMS = 8;

/**
 * The rooms this search starts with: the party last committed anywhere on the site if it is
 * still within its 48 hours (utils/paxStore), otherwise the two adults this has always
 * assumed. Nothing arrives by link here — the home page carries no occupancy in its URL — so
 * the store is the only thing that can answer, and a traveller who searched yesterday should
 * not have to re-enter their children's birthdays to search again.
 *
 * The totals are spread back across the rooms the same way the results page spreads them,
 * biggest first, since only the counts were stored and not which child sat in which room.
 */
const initialRooms = () => {
  const pax = loadPax();
  if (!pax) return [{ adults: 2, children: 0, dobs: [] }];
  const nRooms = Math.max(1, Math.min(MAX_ROOMS, parseInt(pax.rooms, 10) || 1));
  const nAdults = Math.max(1, parseInt(pax.adults, 10) || 2);
  const nChildren = Math.max(0, parseInt(pax.children, 10) || 0);
  const dobs = pax.childDobs ? pax.childDobs.split(',').map((d) => d.trim()) : [];
  const rooms = Array.from({ length: nRooms }, () => ({ adults: 0, children: 0, dobs: [] }));
  for (let i = 0; i < nAdults; i++) rooms[i % nRooms].adults++;
  for (let i = 0; i < nChildren; i++) {
    const r = rooms[i % nRooms];
    r.children++;
    // A blank keeps the child's row — a date that was never given is asked for again here
    // rather than quietly dropping the child from the ones with birthdays.
    r.dobs.push(dobs[i] || '');
  }
  for (const r of rooms) if (r.adults < 1) r.adults = 1;   // every room needs ≥1 adult
  return rooms;
};

// Departure airports for the Belgian/Benelux market (the platform's flight
// searches depart from this region — the old list was 8 UK airports).
const AIRPORTS = [
  { code: 'BRU', label: 'Brussels Airport', country: '🇧🇪' },
  { code: 'CRL', label: 'Brussels South Charleroi', country: '🇧🇪' },
  { code: 'ANR', label: 'Antwerp', country: '🇧🇪' },
  { code: 'OST', label: 'Ostend-Bruges', country: '🇧🇪' },
  { code: 'LGG', label: 'Liège', country: '🇧🇪' },
  { code: 'AMS', label: 'Amsterdam Schiphol', country: '🇳🇱' },
  { code: 'EIN', label: 'Eindhoven', country: '🇳🇱' },
  { code: 'LIL', label: 'Lille', country: '🇫🇷' },
];

const FLIGHT_DESTINATIONS = [
  { code: 'HRG', label: 'Hurghada, Egypt', country: '🇪🇬' },
  { code: 'AYT', label: 'Antalya, Turkey', country: '🇹🇷' },
  { code: 'HER', label: 'Heraklion, Crete', country: '🇬🇷' },
  { code: 'TFS', label: 'Tenerife South', country: '🇪🇸' },
  { code: 'MLE', label: 'Malé, Maldives', country: '🇲🇻' },
  { code: 'HKT', label: 'Phuket, Thailand', country: '🇹🇭' },
  { code: 'RAK', label: 'Marrakech, Morocco', country: '🇲🇦' },
  { code: 'FAO', label: 'Faro, Portugal', country: '🇵🇹' },
];

const CABIN_CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'];

// Human label for the multi-destination selection shown in the search field.
// {countries:[...], places:[...]} → "Mallorca, Spain" / "Spain · 3 places" /
// "Spain, Greece +1 · 4 places".
function selectionLabel({ countries = [], places = [] } = {}) {
  if (!countries.length) return '';
  if (countries.length === 1) {
    const c = countries[0];
    if (places.length === 0) return c.name;
    if (places.length === 1) return `${places[0].name}, ${c.name}`;
    if (places.length === 2) return `${places[0].name} & ${places[1].name}, ${c.name}`;
    return `${c.name} · ${places.length} places`;
  }
  const names = countries.map((c) => c.name);
  const shown = names.slice(0, 2).join(', ');
  const more = names.length > 2 ? ` +${names.length - 2}` : '';
  const suffix = places.length ? ` · ${places.length} place${places.length === 1 ? '' : 's'}` : '';
  return shown + more + suffix;
}

// The hero heading shows part of its text in the gold Caveat script. The client
// controls WHICH part from the CMS by wrapping it in *asterisks* — any word or
// phrase, any language: "Waar ga jij de *zon* achterna?", "*Jouw droomreis* wacht".
//
// Split on *…* keeps the delimiters via the capture group, so String.split hands
// back [text, highlighted, text, highlighted, …] — every odd index is a marked
// segment. A stray unmatched "*" simply stays as literal text.
//
// Legacy safety net: a title saved before this syntax (no asterisks at all) still
// highlights the literal sun/zon, so the flourish never silently disappears.
function renderHeroTitle(raw, scriptClass) {
  if (!raw) return null;
  const pattern = raw.includes('*') ? /\*([^*]+)\*/g : /\b(sun|zon)\b/i;
  return raw.split(pattern).map((p, i) =>
    i % 2 === 1 ? <span key={i} className={scriptClass}>{p}</span> : p
  );
}

export default function Hero() {
  const navigate = useNavigate();

  const { data: cmsConfig } = useHomepageConfig();

  const [cmsBadge, setCmsBadge]         = useState('Holidays at guaranteed best prices');
  const [cmsTitle, setCmsTitle]         = useState('');
  const [cmsSubtitle, setCmsSubtitle]   = useState('Sun-soaked beaches, vibrant cities, and hidden gems — all at the best guaranteed prices.');
  const [cmsSearchBtn, setCmsSearchBtn] = useState('Search');

  useEffect(() => {
    const hero = cmsConfig?.hero;
    if (!hero) return;
    if (hero.badgeText)        setCmsBadge(hero.badgeText);
    if (hero.title)            setCmsTitle(hero.title);
    if (hero.subtitle)         setCmsSubtitle(hero.subtitle);
    if (hero.searchButtonText) setCmsSearchBtn(hero.searchButtonText);
  }, [cmsConfig]);

  // Hero background: use the CMS-managed image when one is set, otherwise fall
  // back to the default image defined in Hero.module.css (.bg). resolveCmsImageUrl
  // turns dashboard-uploaded "/uploads/…" paths into absolute admin-backend URLs;
  // full URLs (Unsplash, etc.) pass through unchanged.
  const heroBgUrl = resolveCmsImageUrl(cmsConfig?.hero?.backgroundImageUrl);

  // Preload the CMS background image so the hero can show a shimmer until it's ready (friend's
  // change from master).
  const [bgLoaded, setBgLoaded] = useState(false);
  useEffect(() => {
    if (!heroBgUrl) { setBgLoaded(false); return; }
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = heroBgUrl;
    return () => { img.onload = null; };
  }, [heroBgUrl]);

  // Default to the new "Search" (typeahead) tab — our change.
  const [searchMode, setSearchMode] = useState('package');
  // Multi-destination selection committed from the picker modal:
  // countries the traveller ticked, plus any regions/cities inside them
  // (empty places for a country = "anywhere in it").
  const [destSelection, setDestSelection] = useState({ countries: [], places: [] });
  const [date, setDate] = useState('');
  // How far either side of that departure the traveller will look: 0 = exact dates, up to ±3
  // days. Chosen on the calendar itself and carried to /results as `flex`.
  const [flexDays, setFlexDays] = useState(0);
  const [duration, setDuration] = useState('6-10 days');   // band label (default: ~1 week)
  // How the traveller gets there + from which airport. Defaults to FLIGHT INCLUDED: a package
  // is the product being sold, so an untouched search should price the trip the way most
  // travellers actually buy it rather than making them find the toggle first. Choosing
  // "Hotel only" is the deliberate opt-OUT.
  // This decision travels the whole journey (results sidebar → hotel page flight search →
  // checkout) and rides the /results URL alongside `origin`, which the results page and the
  // hotel page already read from there.
  const [transport, setTransport] = useState('package');
  // Airports the traveller can leave from — MULTI-select, because "Brussels or Charleroi,
  // whichever works out" is how people actually shop. The FIRST pick is the airport the
  // search prices from (`origin` in the URL — single-valued everywhere downstream); the
  // whole list rides along as `origins` so the choice is never silently narrowed to one.
  const [origins, setOrigins] = useState([DEFAULT_ORIGIN]);
  // Toggle, never below one: an empty "Flying from" has no honest label and no airport
  // to search from, so the last ticked row cannot be un-ticked.
  const toggleOrigin = (code) =>
    setOrigins((prev) => (prev.includes(code)
      ? (prev.length === 1 ? prev : prev.filter((c) => c !== code))
      : [...prev, code]));
  // Occupancy is per room — each room carries its own adults, children and one
  // date-of-birth slot per child. The search still sends totals.
  const [roomsList, setRoomsList] = useState(initialRooms);
  const [openField, setOpenField] = useState(null);

  const [tripType, setTripType] = useState('roundtrip');
  const [directOnly, setDirectOnly] = useState(false);
  // The flights tab starts where the agency's flights start, same as the package tab's
  // `origins` default — an empty "From" made every visitor re-type the one obvious answer.
  const [flightFrom, setFlightFrom] = useState(`${airportLabel(DEFAULT_ORIGIN)} (${DEFAULT_ORIGIN})`);
  const [flightTo, setFlightTo] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [flightReturnDate, setFlightReturnDate] = useState('');
  const [flightAdults, setFlightAdults] = useState(1);
  const [flightChildren, setFlightChildren] = useState(0);
  const [flightInfants, setFlightInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState('Economy');
  const [multiFrom, setMultiFrom] = useState('');
  const [multiTo, setMultiTo] = useState('');
  const [multiDate, setMultiDate] = useState('');

  // Destinations are picked from the multi-select modal — the field itself is
  // not typeable.
  const { data: countriesData, loading: countriesLoading, error: countriesError } = useCountries();
  const countries = countriesData ?? [];
  const [destModalOpen, setDestModalOpen] = useState(false);

  const openDestModal = () => {
    setOpenField(null);   // close any other dropdown first
    setDestModalOpen(true);
  };

  const handleDestinationApply = (selection) => {
    setDestSelection(selection);
    setDestModalOpen(false);
  };

  const destinationLabel = selectionLabel(destSelection);
  // Small flag strip rendered ahead of the label (first few picked countries) in the modal field.
  const destFlags = destSelection.countries.slice(0, 4);

  const searchBarRef = useRef(null);
  const flightsRef = useRef(null);
  const multiDateRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target)) {
        setOpenField(null);
      }
      if (flightsRef.current && !flightsRef.current.contains(e.target)) {
        setOpenField(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleField = (field) => {
    setOpenField((prev) => (prev === field ? null : field));
  };

  // Not today: the earliest departure anyone may pick is 24 hours out, in Belgian time
  // (utils/leadTime.js). The name stays for the calendar code that reads it as "the floor".
  const todayISO = earliestCheckInISO();

  const totalAdults   = roomsList.reduce((n, r) => n + r.adults, 0);
  const totalChildren = roomsList.reduce((n, r) => n + r.children, 0);

  const setRoomAdults = (roomIdx, next) =>
    setRoomsList((prev) =>
      prev.map((r, i) => (i === roomIdx ? { ...r, adults: Math.max(1, Math.min(9, next)) } : r))
    );

  // keep one date-of-birth slot per child in the room
  const setRoomChildren = (roomIdx, next) =>
    setRoomsList((prev) =>
      prev.map((r, i) => {
        if (i !== roomIdx) return r;
        const n = Math.max(0, Math.min(6, next));
        const dobs = r.dobs.slice(0, n);
        while (dobs.length < n) dobs.push('');
        return { ...r, children: n, dobs };
      })
    );

  const updateChildDob = (roomIdx, childIdx, val) =>
    setRoomsList((prev) =>
      prev.map((r, i) =>
        i === roomIdx ? { ...r, dobs: r.dobs.map((d, j) => (j === childIdx ? val : d)) } : r
      )
    );

  const addRoom = () =>
    setRoomsList((prev) => (prev.length >= MAX_ROOMS ? prev : [...prev, { adults: 2, children: 0, dobs: [] }]));

  const removeRoom = (roomIdx) =>
    setRoomsList((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== roomIdx)));

  const ageFromDob = (dob) => {
    if (!dob) return null;
    const b = new Date(dob + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    const ref = date ? new Date(date + 'T00:00:00') : new Date();
    let a = ref.getFullYear() - b.getFullYear();
    const m = ref.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a -= 1;
    return a >= 0 ? a : 0;
  };

  // Params common to every search (dates, occupancy, duration band).
  const buildBaseParams = () => {
    const band = findBand(duration);
    const nights = daysToNights(band.days);   // "7 days" band → 6 nights
    let checkOut = '';
    if (date) {
      // Compute in UTC so the checkout never shifts a day in a positive-offset timezone
      // (`new Date('..T00:00:00')` is local, toISOString() is UTC → a day early for e.g. Belgium).
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + nights);
      checkOut = d.toISOString().split('T')[0];
    }
    // Ages are what the supplier prices on; the DATES are what gets booked and what the
    // checkout has to pre-fill, so both ride along from the one place they were typed.
    const childDobs = roomsList.flatMap((r) => r.dobs).filter(Boolean);
    const childAges = roomsList.flatMap((r) => r.dobs).map(ageFromDob).filter((a) => a != null);
    const qs = new URLSearchParams({
      checkIn:  date || '',
      checkOut: checkOut || '',
      adults:   String(totalAdults),
      children: String(totalChildren),
      rooms:    String(roomsList.length),
    });
    qs.set('duration', band.label);
    // "± 2 days" travels with the search rather than being forgotten at the calendar: the
    // results page reads the dates it is given, and this says how firm those dates are.
    if (flexDays > 0) qs.set('flex', String(flexDays));
    // The results "Travel time" filter reads these as NIGHTS, so convert the band's day range.
    qs.set('minNights', String(daysToNights(band.minDays)));
    qs.set('maxNights', String(daysToNights(band.maxDays)));
    if (childAges.length) qs.set('childAges', childAges.join(','));
    if (childDobs.length) qs.set('childDobs', childDobs.join(','));
    // The traveller has just pressed search, so this party is their answer, not a draft:
    // remember it for 48 hours (utils/paxStore) so returning to the site does not start them
    // back at two adults with their children's birthdays to type out again. Every search
    // handler on this page routes through here, so there is one place this can be forgotten.
    // Both lists are POSITIONAL here — one entry per child, blanks kept — where the query
    // string above drops the gaps. The store pairs the two by index, so a first child with no
    // birthday and a second with one would otherwise file the second child's age against the
    // first. 8 is the pages' CHILD_AGE_DEFAULT, used for the same reason: a price needs an age.
    const paxDobs = roomsList.flatMap((r) => r.dobs);
    savePax({
      adults: String(totalAdults),
      children: String(totalChildren),
      rooms: String(roomsList.length),
      childAges: paxDobs.map((d) => ageFromDob(d) ?? 8).join(','),
      childDobs: paxDobs.join(','),
    });
    // The transport decision, carried to the results sidebar and on into every hotel
    // page's flight search. Origin rides even in own-transport mode so flipping to
    // "incl. flight" later starts from the airport picked here, not from the default.
    qs.set('transport', transport === 'package' ? 'package' : 'hotel_only');
    qs.set('origin', origins[0] || DEFAULT_ORIGIN);
    if (origins.length > 1) qs.set('origins', origins.join(','));
    return qs;
  };

  // PACKAGE search — destination chosen via the country → destination modal (unchanged behaviour).
  const handleSearch = () => {
    const selCities    = destSelection.places.filter((p) => p.type === 'city');
    const selRegions   = destSelection.places.filter((p) => p.type === 'region');
    // A country is searched WHOLE only when no specific place inside it was picked; if the
    // traveller ticked cities/regions in a country, those represent it instead (this mirrors the
    // DestinationModal's own "Entire country vs N places" semantics).
    const pickedCountryIds = new Set(destSelection.places.map((p) => p.countryId));
    const wholeCountries   = destSelection.countries.filter((c) => !pickedCountryIds.has(c.id));
    // countries match hotels.countryCode (== Country.code — NOT the ISO code; e.g. Cyprus is 'NY'
    // not 'CY', UK is 'UK' not 'GB'); cities match hotels.destinationCode. Send the exact codes.
    const destParam = selCities[0]?.code || wholeCountries[0]?.code || destSelection.countries[0]?.code || '';
    const qs = buildBaseParams();
    qs.set('destination', destParam);
    qs.set('destinationLabel', destinationLabel);
    if (wholeCountries.length) qs.set('countries', wholeCountries.map((c) => c.code).join(','));
    if (selCities.length)      qs.set('cities',    selCities.map((p) => p.code).join(','));
    if (selRegions.length)     qs.set('regions',   selRegions.map((p) => p.code).join(','));
    navigate(`/results?${qs.toString()}`);
  };

  const handleFlightSearch = () => {
    navigate(`/flights?from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}&date=${flightDate}&returnDate=${flightReturnDate}&adults=${flightAdults}&children=${flightChildren}&infants=${flightInfants}&cabin=${encodeURIComponent(cabinClass)}&tripType=${tripType}&direct=${directOnly}`);
  };

  const swapFlightFields = (fromSetter, toSetter, fromVal, toVal) => {
    fromSetter(toVal);
    toSetter(fromVal);
  };

  const roomsLabel = `${roomsList.length} room${roomsList.length > 1 ? 's' : ''}`;

  // Compact for the search-bar field, which has limited width. The full
  // adults/children breakdown is shown in the dropdown's footer instead.
  const travelersLabel = totalChildren > 0
    ? `${totalAdults + totalChildren} travelers · ${roomsLabel}`
    : `${totalAdults} adult${totalAdults > 1 ? 's' : ''} · ${roomsLabel}`;

  const travelersDetail = `${totalAdults} adult${totalAdults > 1 ? 's' : ''}${totalChildren > 0 ? `, ${totalChildren} child${totalChildren > 1 ? 'ren' : ''}` : ''} · ${roomsLabel}`;

  // "1 Adult · Economy" / "2 Adults, 1 Child · Business" — the party spelled out rather than
  // totalled, because who is flying changes the fare as much as how many.
  const flightPaxLabel = [
    `${flightAdults} Adult${flightAdults > 1 ? 's' : ''}`,
    flightChildren ? `${flightChildren} Child${flightChildren > 1 ? 'ren' : ''}` : '',
    flightInfants ? `${flightInfants} Infant${flightInfants > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');
  const flightTravelersLabel = `${flightPaxLabel} · ${cabinClass}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /**
   * Split an airport string into the two lines the field shows: the short name with its code
   * on the value line, the full name underneath. "Brussels Airport (BRU)" reads as
   * "Brussels (BRU)" over "Brussels Airport"; "Hurghada, Egypt (HRG)" as "Hurghada (HRG)"
   * over "Hurghada, Egypt". Anything that isn't in that shape is left alone.
   */
  const airportParts = (str) => {
    const m = /^(.*?)\s*\(([A-Za-z]{3})\)$/.exec(String(str || '').trim());
    if (!m) return { value: str || '', hint: '' };
    const full = m[1];
    const short = full.split(',')[0].replace(/\s+Airport$/i, '').trim() || full;
    return { value: `${short} (${m[2].toUpperCase()})`, hint: full };
  };
  const fromParts = airportParts(flightFrom);
  const toParts   = airportParts(flightTo);

  // "Flying from" field text: one airport reads as itself, several read as a count —
  // "4 airports" tells the traveller their whole selection is held, in space one name takes.
  const originsLabel = origins.length === 1
    ? `${airportCity(origins[0])} (${origins[0]})`
    : `${origins.length} airports`;

  // Second line under each field's value: what the field is FOR, in the traveller's words.
  // Where the answer is already known it says the answer instead of the instruction — the
  // "Flying from" hint names the airport whose code sits above it.
  const originsHint = transport === 'hotel_only'
    ? 'No flight, hotel only'
    : origins.length === 1 ? airportLabel(origins[0]) : `${origins.length} airports selected`;
  const dateHint = flexDays > 0
    ? `Flexible ± ${flexDays} day${flexDays > 1 ? 's' : ''}`
    : 'Select departure date';

  // The little chevron on the fields that open a panel — pointing down, and up while open.
  const caret = (open) => (
    <svg className={`${styles.sfCaret} ${open ? styles.sfCaretOpen : ''}`} width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  );

  // One airport row of the picker — a CHECKBOX, not a radio: several can be on at once,
  // and clicking one must not close the panel mid-selection.
  const airportRow = (a) => {
    const on = origins.includes(a.code);
    return (
      <button type="button" key={a.code} role="checkbox" aria-checked={on}
        className={`${styles.tspRow} ${on ? styles.tspRowOn : ''}`}
        onClick={() => toggleOrigin(a.code)}>
        <span className={styles.tspFlag}>{a.country}</span>
        <span className={styles.tspName}>{a.label}</span>
        <span className={styles.tspCode}>{a.code}</span>
        <span className={`${styles.tspTick} ${on ? styles.tspTickOn : ''}`} aria-hidden="true">
          {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </span>
      </button>
    );
  };

  // Shared "Departure + Duration + Travelers" fields — used by BOTH the Package and Search tabs
  // (same state), so the two tabs differ only in how the destination is chosen.
  const stayFields = (
    <>
      <div className={styles.sfDivider} />
      {/* Departure — opens the site's own two-month calendar (components/DateCalendar), not
          the browser's date picker, so the ± flexible-days choice can sit beside the dates. */}
      <div className={`${styles.sf} ${openField === 'date' ? styles.sfActive : ''}`} onClick={() => toggleField('date')}>
        <div className={styles.sfHead}>
          <span className={styles.sfIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </span>
          <span className={styles.sfLabel}>Departure</span>
        </div>
        <div className={styles.sfBody}>
          <span className={`${styles.sfValue} ${!date ? styles.sfPlaceholder : ''}`}>{formatDate(date) || 'Pick a date'}</span>
          {caret(openField === 'date')}
        </div>
        <span className={styles.sfHint}>{dateHint}</span>
      </div>
      <div className={styles.sfDivider} />
      <div className={`${styles.sf} ${openField === 'duration' ? styles.sfActive : ''}`} onClick={() => toggleField('duration')}>
        <div className={styles.sfHead}>
          <span className={styles.sfIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </span>
          <span className={styles.sfLabel}>Duration</span>
        </div>
        <div className={styles.sfBody}>
          <span className={styles.sfValue}>{duration}</span>
          {caret(openField === 'duration')}
        </div>
        <span className={styles.sfHint}>Choose length of stay</span>
      </div>
      <div className={styles.sfDivider} />
      {/* Flying from — the transport decision made HERE travels the whole journey:
          results sidebar, hotel-page flight search, checkout. Value reads the mode,
          not just an airport, so "Hotel only" never masquerades as a flight.
          The panel is nested INSIDE the field (which is position:relative), so it always
          opens directly under this field — the shared bar-wide dropdown slot put it under
          the middle of the bar, nowhere near the control that opened it. stopPropagation
          keeps clicks inside the panel from re-toggling the field shut. */}
      <div className={`${styles.sf} ${openField === 'transport' ? styles.sfActive : ''}`} onClick={() => toggleField('transport')}>
        <div className={styles.sfHead}>
          <span className={styles.sfIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
          </span>
          <span className={styles.sfLabel}>Flying from</span>
        </div>
        <div className={styles.sfBody}>
          <span className={styles.sfValue}>{transport === 'hotel_only' ? 'Hotel only' : originsLabel}</span>
          {caret(openField === 'transport')}
        </div>
        <span className={styles.sfHint}>{originsHint}</span>
        {openField === 'transport' && (
          <div className={styles.tspPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.tspTabs} role="radiogroup" aria-label="Transport mode">
              <button type="button" role="radio" aria-checked={transport === 'package'}
                className={`${styles.tspTab} ${transport === 'package' ? styles.tspTabOn : ''}`}
                onClick={() => setTransport('package')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
                Incl. flight
              </button>
              <button type="button" role="radio" aria-checked={transport === 'hotel_only'}
                className={`${styles.tspTab} ${transport === 'hotel_only' ? styles.tspTabOn : ''}`}
                onClick={() => { setTransport('hotel_only'); setOpenField(null); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8"/><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                Hotel only
              </button>
            </div>
            {transport === 'package' && (
              <>
                <div className={styles.tspSub}>Popular</div>
                <div className={styles.tspGrid}>
                  {POPULAR_AIRPORTS.map(airportRow)}
                </div>
                <div className={styles.tspSub}>All airports</div>
                <div className={styles.tspGrid}>
                  {OTHER_AIRPORTS.map(airportRow)}
                </div>
                <div className={styles.tspFoot}>
                  <span className={styles.tspFootLabel}>
                    {origins.length} airport{origins.length > 1 ? 's' : ''} selected
                  </span>
                  <button type="button" className={styles.doneBtn} onClick={() => setOpenField(null)}>Done</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className={styles.sfDivider} />
      <div className={`${styles.sf} ${styles.sfTravelers} ${openField === 'travelers' ? styles.sfActive : ''}`} onClick={() => toggleField('travelers')}>
        <div className={styles.sfHead}>
          <span className={styles.sfIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </span>
          <span className={styles.sfLabel}>Travellers &amp; rooms</span>
        </div>
        <div className={styles.sfBody}>
          <span className={styles.sfValue}>{travelersLabel}</span>
        </div>
        <span className={styles.sfHint}>Change travellers &amp; rooms</span>
      </div>
    </>
  );

  const stayDropdowns = (
    <>
      {openField === 'date' && (
        <div className={`${styles.dropdown} ${styles.calDropdown}`}>
          <DateCalendar
            value={date}
            onChange={setDate}
            min={todayISO}
            months={2}
            flex={flexDays}
            onFlexChange={setFlexDays}
            onDone={() => setOpenField(null)}
          />
        </div>
      )}
      {openField === 'duration' && (
        <div className={`${styles.dropdown} ${styles.durDropdown}`}>
          <div className={styles.durList}>
            {DURATIONS.map((d) => (
              <div key={d.label} className={`${styles.durOpt} ${duration === d.label ? styles.durOptActive : ''}`} onClick={() => { setDuration(d.label); setOpenField(null); }}>
                <span>{d.label}</span>
                {duration === d.label && (
                  <svg className={styles.durCheck} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {openField === 'travelers' && (
        <div className={`${styles.dropdown} ${styles.travDropdown}`}>
          <div className={styles.travScroll}>
            {roomsList.map((room, ri) => (
              <div className={styles.roomCard} key={ri}>
                <div className={styles.roomHead}>
                  <span className={styles.roomTitle}>
                    <span className={styles.roomBadge}>{ri + 1}</span>
                    Room {ri + 1}
                  </span>
                  {ri > 0 && (
                    <button className={styles.roomRemove} onClick={() => removeRoom(ri)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      Remove
                    </button>
                  )}
                </div>
                <div className={styles.travRow}>
                  <div className={styles.travLabelWrap}>
                    <span className={styles.travLabel}>Adults</span>
                    <span className={styles.travSubInline}>(from 18 years)</span>
                  </div>
                  <div className={styles.stepper}>
                    <button className={styles.stepperBtn} disabled={room.adults <= 1} onClick={() => setRoomAdults(ri, room.adults - 1)} aria-label="Remove adult">−</button>
                    <span className={styles.stepperCount}>{room.adults}</span>
                    <button className={styles.stepperBtn} disabled={room.adults >= 9} onClick={() => setRoomAdults(ri, room.adults + 1)} aria-label="Add adult">+</button>
                  </div>
                </div>
                <div className={styles.travRow}>
                  <div className={styles.travLabelWrap}>
                    <span className={styles.travLabel}>Children</span>
                    <span className={styles.travSubInline}>(0 to 17 years)</span>
                  </div>
                  <div className={styles.stepper}>
                    <button className={styles.stepperBtn} disabled={room.children <= 0} onClick={() => setRoomChildren(ri, room.children - 1)} aria-label="Remove child">−</button>
                    <span className={styles.stepperCount}>{room.children}</span>
                    <button className={styles.stepperBtn} disabled={room.children >= 6} onClick={() => setRoomChildren(ri, room.children + 1)} aria-label="Add child">+</button>
                  </div>
                </div>
                {room.children > 0 && (
                  <div className={styles.travDobs}>
                    <span className={styles.travDobsTitle}>Children's date of birth</span>
                    {room.dobs.map((dob, ci) => {
                      const age = ageFromDob(dob);
                      return (
                        <div className={styles.travDobRow} key={ci}>
                          <span className={styles.travDobLabel}>
                            Child {ci + 1}{age != null ? <em className={styles.travDobAge}>{age} yr{age === 1 ? '' : 's'}</em> : ''}
                          </span>
                          <input type="date" className={styles.travDobInput} value={dob} max={todayISO} onChange={(e) => updateChildDob(ri, ci, e.target.value)} />
                        </div>
                      );
                    })}
                    <span className={styles.travDobHint}>Children's ages help us price rooms &amp; flights correctly.</span>
                  </div>
                )}
              </div>
            ))}
            {roomsList.length < MAX_ROOMS && (
              <button className={styles.addRoomBtn} onClick={addRoom}>
                <span className={styles.addRoomIcon}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </span>
                Add extra room
              </button>
            )}
          </div>
          <div className={styles.travFoot}>
            <span className={styles.travSummary}>{travelersDetail}</span>
            <button className={styles.doneBtn} onClick={() => setOpenField(null)}>Save</button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <section className={styles.hero}>
      {/* heroBgImage = client-uploaded photo shown as-is (no darkening filter or
          overlay), so every element on top must carry its own contrast. */}
      <div className={`${styles.heroBg} ${heroBgUrl ? styles.heroBgImage : ''}`}>
        {heroBgUrl && !bgLoaded && <div className={styles.bgShimmer} />}
        <div
          className={`${styles.bg} ${heroBgUrl && !bgLoaded ? styles.bgHidden : ''}`}
          style={heroBgUrl ? { backgroundImage: `url("${heroBgUrl}")` } : undefined}
        />
        <div className={styles.overlay} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.ring} />
      </div>

      <div className={styles.content}>
        <div className={styles.badge}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
          {cmsBadge}
        </div>

        <h1 className={styles.title}>
          {cmsTitle
            ? renderHeroTitle(cmsTitle, styles.script)
            : <>Where will you<br />chase the <span className={styles.script}>sun</span>?</>
          }
        </h1>

        <p className={styles.subtitle}>
          {cmsSubtitle}
        </p>

        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${searchMode === 'package' ? styles.modeTabActive : ''}`}
            onClick={() => { setSearchMode('package'); setOpenField(null); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></svg>
            Package
          </button>
          <button
            className={`${styles.modeTab} ${searchMode === 'flights' ? styles.modeTabActive : ''}`}
            onClick={() => { setSearchMode('flights'); setOpenField(null); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
            Flights Only
          </button>
        </div>

        {/* ── PACKAGE SEARCH — destination via country → destination modal (unchanged) ── */}
        {searchMode === 'package' && (
        <div className={styles.searchBarWrap} ref={searchBarRef}>
          <div className={styles.searchBar}>
            <div
              className={`${styles.sf} ${styles.sfDest} ${destModalOpen ? styles.sfActive : ''}`}
              onClick={openDestModal}
            >
              <div className={styles.sfHead}>
                <span className={styles.sfIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <span className={styles.sfLabel}>Destination</span>
              </div>
              <div className={styles.sfBody}>
                <span className={`${styles.sfValue} ${!destinationLabel ? styles.sfPlaceholder : ''}`}>
                  {destFlags.length > 0 && (
                    <span className={styles.sfFlags}>
                      {destFlags.map((c) =>
                        c.flagUrl
                          ? <img key={c.id ?? c.isoCode} className={styles.sfFlag} src={c.flagUrl} alt="" />
                          : <span key={c.id ?? c.isoCode} className={styles.sfFlagEmoji}>{c.flag || '🏳️'}</span>
                      )}
                    </span>
                  )}
                  {destinationLabel || 'Where to?'}
                </span>
              </div>
              <span className={styles.sfHint}>Search city, region or hotel</span>
            </div>
            {stayFields}
            <button className={styles.searchBtn} onClick={handleSearch}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              {cmsSearchBtn}
            </button>
          </div>
          {stayDropdowns}
        </div>
        )}

        {/* ── FLIGHTS ONLY SEARCH ── */}
        {searchMode === 'flights' && (
        <div className={styles.flightsWrap} ref={flightsRef}>
          <div className={styles.flightSearchCard}>
            {/* Trip type + "direct only" ride INSIDE the card now, on their own line above the
                fields — they qualify this search, so they belong to it rather than floating
                above it as a separate chip. */}
            <div className={styles.flightHead}>
              <div className={styles.tripTabs} role="tablist" aria-label="Trip type">
                {[
                  { id: 'roundtrip', label: 'Round trip' },
                  { id: 'oneway',    label: 'One way' },
                  { id: 'multicity', label: 'Multi-city' },
                ].map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tripType === t.id}
                    className={`${styles.tripTab} ${tripType === t.id ? styles.tripTabOn : ''}`}
                    onClick={() => { setTripType(t.id); setOpenField(null); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                className={`${styles.directCheck} ${directOnly ? styles.directCheckActive : ''}`}
                onClick={() => setDirectOnly((v) => !v)}
                aria-pressed={directOnly}
              >
                <span className={styles.directCb}>
                  {directOnly && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  )}
                </span>
                Direct flights only
                <span className={styles.infoDot} title="Hides any flight with a stopover — fewer results, no connections.">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                </span>
              </button>
            </div>

            <div className={styles.flightRow}>
            {/* Departing From */}
            <div
              className={`${styles.sf} ${openField === 'flightFrom' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightFrom')}
            >
              <div className={styles.sfHead}>
                <span className={styles.sfIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
                </span>
                <span className={styles.sfLabel}>From</span>
              </div>
              <div className={styles.sfBody}>
                <span className={`${styles.sfValue} ${!flightFrom ? styles.sfPlaceholder : ''}`}>{fromParts.value || 'Select airport'}</span>
              </div>
              <span className={styles.sfHint}>{fromParts.hint || 'Search city or airport'}</span>
            </div>

            {/* Swap */}
            <button
              className={styles.flightSwapBtn}
              title="Swap"
              onClick={(e) => { e.stopPropagation(); swapFlightFields(setFlightFrom, setFlightTo, flightFrom, flightTo); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/></svg>
            </button>

            {/* Going To */}
            <div
              className={`${styles.sf} ${styles.sfTo} ${openField === 'flightTo' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightTo')}
            >
              <div className={styles.sfHead}>
                <span className={styles.sfIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <span className={styles.sfLabel}>To</span>
              </div>
              <div className={styles.sfBody}>
                <span className={`${styles.sfValue} ${!flightTo ? styles.sfPlaceholder : ''}`}>{toParts.value || 'Where do you want to go?'}</span>
              </div>
              <span className={styles.sfHint}>{toParts.hint || 'Search city or airport'}</span>
            </div>

            <div className={styles.sfDivider} />

            {/* Departure Date — same calendar as the package tab, minus the ± strip: a flight
                search prices one day, so there is nothing to be flexible about here yet. */}
            <div
              className={`${styles.sf} ${openField === 'flightDate' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightDate')}
            >
              <div className={styles.sfHead}>
                <span className={styles.sfIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                </span>
                <span className={styles.sfLabel}>Departure</span>
              </div>
              <div className={styles.sfBody}>
                <span className={`${styles.sfValue} ${!flightDate ? styles.sfPlaceholder : ''}`}>{formatDate(flightDate) || 'Select date'}</span>
                {caret(openField === 'flightDate')}
              </div>
              <span className={styles.sfHint}>Add departure date</span>
            </div>

            {/* Return Date (round trip only) */}
            {tripType === 'roundtrip' && (
              <>
                <div className={styles.sfDivider} />
                <div
                  className={`${styles.sf} ${openField === 'flightReturn' ? styles.sfActive : ''}`}
                  onClick={() => toggleField('flightReturn')}
                >
                  <div className={styles.sfHead}>
                    <span className={styles.sfIcon}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </span>
                    <span className={styles.sfLabel}>Return</span>
                  </div>
                  <div className={styles.sfBody}>
                    <span className={`${styles.sfValue} ${!flightReturnDate ? styles.sfPlaceholder : ''}`}>{formatDate(flightReturnDate) || 'Select date'}</span>
                    {caret(openField === 'flightReturn')}
                  </div>
                  <span className={styles.sfHint}>Add return date</span>
                </div>
              </>
            )}

            <div className={styles.sfDivider} />

            {/* Travellers & Class */}
            <div
              className={`${styles.sf} ${styles.sfTravelers} ${openField === 'flightTravelers' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightTravelers')}
            >
              <div className={styles.sfHead}>
                <span className={styles.sfIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                </span>
                <span className={styles.sfLabel}>Travellers &amp; class</span>
              </div>
              <div className={styles.sfBody}>
                <span className={styles.sfValue}>{flightTravelersLabel}</span>
              </div>
              <span className={styles.sfHint}>Change travellers &amp; class</span>
            </div>

            <button className={styles.searchBtn} onClick={handleFlightSearch}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              {cmsSearchBtn}
            </button>
            </div>
          </div>

          {/* Multi-city second row */}
          {tripType === 'multicity' && (
            <div className={styles.addFlightCard}>
              <div
                className={`${styles.sf} ${openField === 'multiFrom' ? styles.sfActive : ''}`}
                onClick={() => toggleField('multiFrom')}
              >
                <div className={styles.sfHead}>
                  <span className={styles.sfIcon}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
                  </span>
                  <span className={styles.sfLabel}>From</span>
                </div>
                <div className={styles.sfBody}>
                  <span className={`${styles.sfValue} ${!multiFrom ? styles.sfPlaceholder : ''}`}>{multiFrom || 'Select airport'}</span>
                </div>
                <span className={styles.sfHint}>Search city or airport</span>
              </div>
              <button
                className={styles.flightSwapBtn}
                onClick={(e) => { e.stopPropagation(); swapFlightFields(setMultiFrom, setMultiTo, multiFrom, multiTo); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/></svg>
              </button>
              <div
                className={`${styles.sf} ${styles.sfTo} ${openField === 'multiTo' ? styles.sfActive : ''}`}
                onClick={() => toggleField('multiTo')}
              >
                <div className={styles.sfHead}>
                  <span className={styles.sfIcon}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                  <span className={styles.sfLabel}>To</span>
                </div>
                <div className={styles.sfBody}>
                  <span className={`${styles.sfValue} ${!multiTo ? styles.sfPlaceholder : ''}`}>{multiTo || 'Select destination'}</span>
                </div>
                <span className={styles.sfHint}>Search city or airport</span>
              </div>
              <div className={styles.sfDivider} />
              <div
                className={styles.sf}
                onClick={() => multiDateRef.current?.showPicker()}
              >
                <div className={styles.sfHead}>
                  <span className={styles.sfIcon}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  </span>
                  <span className={styles.sfLabel}>Departure</span>
                </div>
                <div className={styles.sfBody}>
                  <span className={`${styles.sfValue} ${!multiDate ? styles.sfPlaceholder : ''}`}>{formatDate(multiDate) || 'Select date'}</span>
                </div>
                <span className={styles.sfHint}>Add departure date</span>
                <input
                  ref={multiDateRef}
                  type="date"
                  className={styles.hiddenDateInput}
                  value={multiDate}
                  onChange={(e) => setMultiDate(e.target.value)}
                  tabIndex={-1}
                />
              </div>
              <div className={`${styles.sfDivider} ${styles.sfDividerSpacer}`} />
              {/* Empty stand-in for the travellers column of the row above — a second leg
                  flies the same party, so there is nothing to ask here. */}
              <div className={styles.addFlightSpacer} aria-hidden="true" />
              <button type="button" className={styles.addFlightBtn}>+ Add flight</button>
            </div>
          )}

          {/* ── FLIGHT DROPDOWNS ── */}

          {(openField === 'flightDate' || openField === 'flightReturn') && (
            <div className={`${styles.flightDropdown} ${styles.calDropdownFlight}`}>
              <DateCalendar
                value={openField === 'flightDate' ? flightDate : flightReturnDate}
                onChange={(iso) => {
                  if (openField === 'flightDate') {
                    setFlightDate(iso);
                    // A return already sitting before the new outbound is no longer a return —
                    // clear it rather than searching a trip that comes home before it leaves.
                    if (flightReturnDate && flightReturnDate < iso) setFlightReturnDate('');
                  } else {
                    setFlightReturnDate(iso);
                  }
                }}
                min={openField === 'flightReturn' ? (flightDate || todayISO) : todayISO}
                months={2}
                onDone={() => setOpenField(null)}
              />
            </div>
          )}

          {/* Departing From dropdown */}
          {openField === 'flightFrom' && (
            <div className={styles.flightDropdown}>
              <div className={styles.destGrid}>
                {AIRPORTS.map((a) => (
                  <div
                    key={a.code}
                    className={`${styles.destItem} ${flightFrom === `${a.label} (${a.code})` ? styles.destItemActive : ''}`}
                    onClick={() => { setFlightFrom(`${a.label} (${a.code})`); setOpenField(null); }}
                  >
                    <span>{a.country}</span>
                    <span>{a.label}</span>
                    <span className={styles.airportCode}>{a.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Going To dropdown */}
          {openField === 'flightTo' && (
            <div className={styles.flightDropdown}>
              <div className={styles.destGrid}>
                {FLIGHT_DESTINATIONS.map((a) => (
                  <div
                    key={a.code}
                    className={`${styles.destItem} ${flightTo === `${a.label} (${a.code})` ? styles.destItemActive : ''}`}
                    onClick={() => { setFlightTo(`${a.label} (${a.code})`); setOpenField(null); }}
                  >
                    <span>{a.country}</span>
                    <span>{a.label}</span>
                    <span className={styles.airportCode}>{a.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Travellers & Class dropdown */}
          {openField === 'flightTravelers' && (
            <div className={styles.flightDropdown}>
              <div className={styles.travRow}>
                <div>
                  <span className={styles.travLabel}>Adults</span>
                  <span className={styles.travSub}>12+ years</span>
                </div>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setFlightAdults((v) => Math.max(1, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{flightAdults}</span>
                  <button className={styles.stepperBtn} onClick={() => setFlightAdults((v) => Math.min(9, v + 1))}>+</button>
                </div>
              </div>
              <div className={styles.travRow}>
                <div>
                  <span className={styles.travLabel}>Children</span>
                  <span className={styles.travSub}>2–11 years</span>
                </div>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setFlightChildren((v) => Math.max(0, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{flightChildren}</span>
                  <button className={styles.stepperBtn} onClick={() => setFlightChildren((v) => Math.min(6, v + 1))}>+</button>
                </div>
              </div>
              <div className={styles.travRow}>
                <div>
                  <span className={styles.travLabel}>Infants</span>
                  <span className={styles.travSub}>Under 2</span>
                </div>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setFlightInfants((v) => Math.max(0, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{flightInfants}</span>
                  <button className={styles.stepperBtn} onClick={() => setFlightInfants((v) => Math.min(flightAdults, v + 1))}>+</button>
                </div>
              </div>
              <div className={styles.classDivider} />
              <span className={styles.classTitle}>Cabin Class</span>
              <div className={styles.classGrid}>
                {CABIN_CLASSES.map((c) => (
                  <div
                    key={c}
                    className={`${styles.classPill} ${cabinClass === c ? styles.classPillActive : ''}`}
                    onClick={() => setCabinClass(c)}
                  >
                    {c}
                  </div>
                ))}
              </div>
              <button className={styles.doneBtn} onClick={() => setOpenField(null)}>Done</button>
            </div>
          )}

          {/* Multi-city from dropdown */}
          {openField === 'multiFrom' && (
            <div className={styles.flightDropdown}>
              <div className={styles.destGrid}>
                {AIRPORTS.map((a) => (
                  <div
                    key={a.code}
                    className={`${styles.destItem} ${multiFrom === `${a.label} (${a.code})` ? styles.destItemActive : ''}`}
                    onClick={() => { setMultiFrom(`${a.label} (${a.code})`); setOpenField(null); }}
                  >
                    <span>{a.country}</span>
                    <span>{a.label}</span>
                    <span className={styles.airportCode}>{a.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-city to dropdown */}
          {openField === 'multiTo' && (
            <div className={styles.flightDropdown}>
              <div className={styles.destGrid}>
                {FLIGHT_DESTINATIONS.map((a) => (
                  <div
                    key={a.code}
                    className={`${styles.destItem} ${multiTo === `${a.label} (${a.code})` ? styles.destItemActive : ''}`}
                    onClick={() => { setMultiTo(`${a.label} (${a.code})`); setOpenField(null); }}
                  >
                    <span>{a.country}</span>
                    <span>{a.label}</span>
                    <span className={styles.airportCode}>{a.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        )}

      </div>

      <DestinationModal
        open={destModalOpen}
        countries={countries}
        loading={countriesLoading}
        error={countriesError}
        value={destSelection}
        onApply={handleDestinationApply}
        onClose={() => setDestModalOpen(false)}
      />
    </section>
  );
}
