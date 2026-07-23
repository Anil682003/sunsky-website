import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import styles from './Hero.module.css';
import { useHomepageConfig, useCountries } from '../../../api';
import DestinationModal from '../../../components/DestinationModal/DestinationModal';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';

// Duration bands shown in the search box. Each band is a day-range with a representative stay
// length in nights — the concrete duration the search prices for that band. Picking a band + a
// departure date therefore "picks the dates": checkOut = checkIn + that band's nights.
// (minNights/maxNights ride along in the URL so the results page can offer the full range later.)
const DURATIONS = [
  { label: '2-5 days',   nights: 4,  minNights: 2,  maxNights: 5 },
  { label: '6-10 days',  nights: 7,  minNights: 6,  maxNights: 10 },
  { label: '11-16 days', nights: 14, minNights: 11, maxNights: 16 },
  { label: '17-24 days', nights: 21, minNights: 17, maxNights: 24 },
  { label: '25+ days',   nights: 28, minNights: 25, maxNights: 35 },
];
const findBand = (label) => DURATIONS.find((d) => d.label === label) ?? DURATIONS[1];

const MAX_ROOMS = 8;

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

// Splits a title string and wraps the word "sun" in the script-font span.
// Falls back to the hardcoded JSX if no CMS title has loaded yet.
function renderHeroTitle(raw, scriptClass) {
  if (!raw) return null;
  const parts = raw.split(/\b(sun)\b/i);
  return parts.map((p, i) =>
    p.toLowerCase() === 'sun' ? <span key={i} className={scriptClass}>{p}</span> : p
  );
}

export default function Hero() {
  const { isAuthenticated } = useSelector((s) => s.auth);
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
  const [duration, setDuration] = useState('6-10 days');   // band label (default: ~1 week)
  // Occupancy is per room — each room carries its own adults, children and one
  // date-of-birth slot per child. The search still sends totals.
  const [roomsList, setRoomsList] = useState([{ adults: 2, children: 0, dobs: [] }]);
  const [openField, setOpenField] = useState(null);

  const [tripType, setTripType] = useState('roundtrip');
  const [directOnly, setDirectOnly] = useState(false);
  const [flightFrom, setFlightFrom] = useState('');
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
  const packageDateRef = useRef(null);
  const flightDateRef = useRef(null);
  const flightReturnRef = useRef(null);
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

  const todayISO = new Date().toISOString().split('T')[0];

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
    const nights = band.nights;
    let checkOut = '';
    if (date) {
      // Compute in UTC so the checkout never shifts a day in a positive-offset timezone
      // (`new Date('..T00:00:00')` is local, toISOString() is UTC → a day early for e.g. Belgium).
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + nights);
      checkOut = d.toISOString().split('T')[0];
    }
    const childAges = roomsList.flatMap((r) => r.dobs).map(ageFromDob).filter((a) => a != null);
    const qs = new URLSearchParams({
      checkIn:  date || '',
      checkOut: checkOut || '',
      adults:   String(totalAdults),
      children: String(totalChildren),
      rooms:    String(roomsList.length),
    });
    qs.set('duration', band.label);
    qs.set('minNights', String(band.minNights));
    qs.set('maxNights', String(band.maxNights));
    if (childAges.length) qs.set('childAges', childAges.join(','));
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

  const flightTotalTravelers = flightAdults + flightChildren + flightInfants;
  const flightTravelersLabel = `${flightTotalTravelers} Traveller${flightTotalTravelers > 1 ? 's' : ''}, ${cabinClass}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Shared "Departure + Duration + Travelers" fields — used by BOTH the Package and Search tabs
  // (same state), so the two tabs differ only in how the destination is chosen.
  const stayFields = (
    <>
      <div className={styles.sfDivider} />
      <div className={styles.sf} onClick={() => packageDateRef.current?.showPicker()}>
        <span className={styles.sfIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
        <div className={styles.sfText}>
          <span className={styles.sfLabel}>Departure</span>
          <span className={`${styles.sfValue} ${!date ? styles.sfPlaceholder : ''}`}>{formatDate(date) || 'Pick a date'}</span>
        </div>
        <input ref={packageDateRef} type="date" className={styles.hiddenDateInput} value={date} onChange={(e) => setDate(e.target.value)} tabIndex={-1} />
      </div>
      <div className={styles.sfDivider} />
      <div className={`${styles.sf} ${openField === 'duration' ? styles.sfActive : ''}`} onClick={() => toggleField('duration')}>
        <span className={styles.sfIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </span>
        <div className={styles.sfText}>
          <span className={styles.sfLabel}>Duration</span>
          <span className={styles.sfValue}>{duration}</span>
        </div>
      </div>
      <div className={styles.sfDivider} />
      <div className={`${styles.sf} ${styles.sfTravelers} ${openField === 'travelers' ? styles.sfActive : ''}`} onClick={() => toggleField('travelers')}>
        <span className={styles.sfIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        </span>
        <div className={styles.sfText}>
          <span className={styles.sfLabel}>Travelers</span>
          <span className={styles.sfValue}>{travelersLabel}</span>
        </div>
      </div>
    </>
  );

  const stayDropdowns = (
    <>
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
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Destination</span>
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
          <div className={styles.tripTypeRow}>
            <button
              className={`${styles.tripTypeOpt} ${tripType === 'oneway' ? styles.tripTypeOptActive : ''}`}
              onClick={() => setTripType('oneway')}
            >
              <div className={styles.tripRadio} />
              One Way
            </button>
            <button
              className={`${styles.tripTypeOpt} ${tripType === 'roundtrip' ? styles.tripTypeOptActive : ''}`}
              onClick={() => setTripType('roundtrip')}
            >
              <div className={styles.tripRadio} />
              Round Trip
            </button>
            <button
              className={`${styles.tripTypeOpt} ${tripType === 'multicity' ? styles.tripTypeOptActive : ''}`}
              onClick={() => setTripType('multicity')}
            >
              <div className={styles.tripRadio} />
              Multi City
            </button>
            <div className={styles.tripTypeDivider} />
            <button
              className={`${styles.directCheck} ${directOnly ? styles.directCheckActive : ''}`}
              onClick={() => setDirectOnly((v) => !v)}
            >
              <div className={styles.directCb}>
                {directOnly && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#070E1F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                )}
              </div>
              Direct flights only
            </button>
          </div>

          <div className={styles.flightSearchCard}>
            {/* Departing From */}
            <div
              className={`${styles.sf} ${openField === 'flightFrom' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightFrom')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>From</span>
                <span className={`${styles.sfValue} ${!flightFrom ? styles.sfPlaceholder : ''}`}>{flightFrom || 'Select airport'}</span>
              </div>
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
              className={`${styles.sf} ${openField === 'flightTo' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightTo')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>To</span>
                <span className={`${styles.sfValue} ${!flightTo ? styles.sfPlaceholder : ''}`}>{flightTo || 'Select destination'}</span>
              </div>
            </div>

            <div className={styles.sfDivider} />

            {/* Departure Date */}
            <div
              className={styles.sf}
              onClick={() => flightDateRef.current?.showPicker()}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Depart</span>
                <span className={`${styles.sfValue} ${!flightDate ? styles.sfPlaceholder : ''}`}>{formatDate(flightDate) || 'Select date'}</span>
              </div>
              <input
                ref={flightDateRef}
                type="date"
                className={styles.hiddenDateInput}
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                tabIndex={-1}
              />
            </div>

            {/* Return Date (round trip only) */}
            {tripType === 'roundtrip' && (
              <>
                <div className={styles.sfDivider} />
                <div
                  className={styles.sf}
                  onClick={() => flightReturnRef.current?.showPicker()}
                >
                  <span className={styles.sfIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  </span>
                  <div className={styles.sfText}>
                    <span className={styles.sfLabel}>Return</span>
                    <span className={`${styles.sfValue} ${!flightReturnDate ? styles.sfPlaceholder : ''}`}>{formatDate(flightReturnDate) || 'Select date'}</span>
                  </div>
                  <input
                    ref={flightReturnRef}
                    type="date"
                    className={styles.hiddenDateInput}
                    value={flightReturnDate}
                    min={flightDate || undefined}
                    onChange={(e) => setFlightReturnDate(e.target.value)}
                    tabIndex={-1}
                  />
                </div>
              </>
            )}

            <div className={styles.sfDivider} />

            {/* Travellers & Class */}
            <div
              className={`${styles.sf} ${openField === 'flightTravelers' ? styles.sfActive : ''}`}
              onClick={() => toggleField('flightTravelers')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Travellers</span>
                <span className={styles.sfValue}>{flightTravelersLabel}</span>
              </div>
            </div>

            <button className={styles.searchBtn} onClick={handleFlightSearch}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              {cmsSearchBtn}
            </button>
          </div>

          {/* Multi-city second row */}
          {tripType === 'multicity' && (
            <div className={styles.addFlightCard}>
              <div
                className={`${styles.sf} ${openField === 'multiFrom' ? styles.sfActive : ''}`}
                onClick={() => toggleField('multiFrom')}
              >
                <span className={styles.sfIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
                </span>
                <div className={styles.sfText}>
                  <span className={styles.sfLabel}>From</span>
                  <span className={`${styles.sfValue} ${!multiFrom ? styles.sfPlaceholder : ''}`}>{multiFrom || 'Select airport'}</span>
                </div>
              </div>
              <button
                className={styles.flightSwapBtn}
                onClick={(e) => { e.stopPropagation(); swapFlightFields(setMultiFrom, setMultiTo, multiFrom, multiTo); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/></svg>
              </button>
              <div
                className={`${styles.sf} ${openField === 'multiTo' ? styles.sfActive : ''}`}
                onClick={() => toggleField('multiTo')}
              >
                <span className={styles.sfIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <div className={styles.sfText}>
                  <span className={styles.sfLabel}>To</span>
                  <span className={`${styles.sfValue} ${!multiTo ? styles.sfPlaceholder : ''}`}>{multiTo || 'Select destination'}</span>
                </div>
              </div>
              <div className={styles.sfDivider} />
              <div
                className={styles.sf}
                onClick={() => multiDateRef.current?.showPicker()}
              >
                <span className={styles.sfIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                </span>
                <div className={styles.sfText}>
                  <span className={styles.sfLabel}>Depart</span>
                  <span className={`${styles.sfValue} ${!multiDate ? styles.sfPlaceholder : ''}`}>{formatDate(multiDate) || 'Select date'}</span>
                </div>
                <input
                  ref={multiDateRef}
                  type="date"
                  className={styles.hiddenDateInput}
                  value={multiDate}
                  onChange={(e) => setMultiDate(e.target.value)}
                  tabIndex={-1}
                />
              </div>
              <div className={styles.sfDivider} />
              <div className={styles.addFlightLabel}>+ ADD FLIGHT</div>
            </div>
          )}

          {/* ── FLIGHT DROPDOWNS ── */}

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

        {!isAuthenticated && (
          <div className={styles.memberStrip}>
            <span className={styles.memberText}>
              Create an account for member-only prices
            </span>
            <Link to="/register" className={styles.memberCta}>
              Register
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <span className={styles.memberOr}>or</span>
            <Link to="/login" className={styles.memberSignIn}>Sign in</Link>
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
