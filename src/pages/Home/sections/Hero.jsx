import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import styles from './Hero.module.css';
import { useHomepageConfig, useCitySearch } from '../../../api';

const POPULAR_DESTINATIONS = [
  { code: 'HRG', label: 'Hurghada, Egypt'    },
  { code: 'AYT', label: 'Antalya, Turkey'    },
  { code: 'HER', label: 'Heraklion, Greece'  },
  { code: 'TFS', label: 'Tenerife, Spain'    },
  { code: 'MLE', label: 'Male, Maldives'     },
  { code: 'HKT', label: 'Phuket, Thailand'   },
  { code: 'RAK', label: 'Marrakech, Morocco' },
  { code: 'FAO', label: 'Faro, Portugal'     },
];
const DURATIONS = ['3 days','5 days','6 days','7 days','8 days','10 days','14 days'];

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

  const [searchMode, setSearchMode] = useState('package');
  const [destination, setDestination] = useState('');
  const [destinationCode, setDestinationCode] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('7 days');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [childrenDobs, setChildrenDobs] = useState([]);
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

  const [destSearch, setDestSearch] = useState('');
  const { execute: searchCities, data: destResultsData, loading: destLoading, reset: resetCities } = useCitySearch();
  const destResults = destResultsData ?? [];
  const destInputRef = useRef(null);

  useEffect(() => {
    if (!destSearch.trim()) { resetCities(); return; }
    const timer = setTimeout(() => searchCities(destSearch), 300);
    return () => clearTimeout(timer);
  }, [destSearch]);

  // Auto-focus search input when destination dropdown opens
  useEffect(() => {
    if (openField === 'destination') {
      setTimeout(() => destInputRef.current?.focus(), 50);
    } else {
      setDestSearch('');
      resetCities();
      // keep destinationCode if user already selected one
    }
  }, [openField]);

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

  // keep one date-of-birth slot per child
  const setChildrenCount = (next) => {
    const n = Math.max(0, Math.min(6, next));
    setChildren(n);
    setChildrenDobs((prev) => {
      const arr = prev.slice(0, n);
      while (arr.length < n) arr.push('');
      return arr;
    });
  };
  const updateChildDob = (i, val) =>
    setChildrenDobs((prev) => prev.map((d, idx) => (idx === i ? val : d)));
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

  const handleSearch = () => {
    const daysMatch = duration.match(/(\d+)/);
    const nights = daysMatch ? parseInt(daysMatch[1]) : 7;
    let checkOut = '';
    if (date) {
      const d = new Date(date + 'T00:00:00');
      d.setDate(d.getDate() + nights);
      checkOut = d.toISOString().split('T')[0];
    }
    const qs = new URLSearchParams({
      destination:      destinationCode || destination,
      destinationLabel: destination,
      checkIn:          date || '',
      checkOut:         checkOut || '',
      adults:           String(adults),
      children:         String(children),
      rooms:            String(rooms),
    });
    const childAges = childrenDobs.map(ageFromDob).filter((a) => a != null);
    if (childAges.length) qs.set('childAges', childAges.join(','));
    navigate(`/results?${qs.toString()}`);
  };

  const handleFlightSearch = () => {
    navigate(`/flights?from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}&date=${flightDate}&returnDate=${flightReturnDate}&adults=${flightAdults}&children=${flightChildren}&infants=${flightInfants}&cabin=${encodeURIComponent(cabinClass)}&tripType=${tripType}&direct=${directOnly}`);
  };

  const swapFlightFields = (fromSetter, toSetter, fromVal, toVal) => {
    fromSetter(toVal);
    toSetter(fromVal);
  };

  const travelersLabel = `${adults} adult${adults > 1 ? 's' : ''}${children > 0 ? `, ${children} child${children > 1 ? 'ren' : ''}` : ''} · ${rooms} room${rooms > 1 ? 's' : ''}`;

  const flightTotalTravelers = flightAdults + flightChildren + flightInfants;
  const flightTravelersLabel = `${flightTotalTravelers} Traveller${flightTotalTravelers > 1 ? 's' : ''}, ${cabinClass}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <section className={styles.hero}>
      <div className={styles.heroBg}>
        <div className={styles.bg} />
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

        {/* ── PACKAGE SEARCH ── */}
        {searchMode === 'package' && (
        <div className={styles.searchBarWrap} ref={searchBarRef}>
          <div className={styles.searchBar}>
            <div
              className={`${styles.sf} ${openField === 'destination' ? styles.sfActive : ''}`}
              onClick={() => { if (openField !== 'destination') setOpenField('destination'); }}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Destination</span>
                <input
                  ref={destInputRef}
                  className={styles.sfInput}
                  placeholder="Where to?"
                  value={openField === 'destination' ? destSearch : destination}
                  onChange={(e) => { setDestSearch(e.target.value); setOpenField('destination'); }}
                  onFocus={() => setOpenField('destination')}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className={styles.sfDivider} />
            <div
              className={styles.sf}
              onClick={() => packageDateRef.current?.showPicker()}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Departure</span>
                <span className={styles.sfValue}>{formatDate(date) || 'Pick a date'}</span>
              </div>
              <input
                ref={packageDateRef}
                type="date"
                className={styles.hiddenDateInput}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                tabIndex={-1}
              />
            </div>
            <div className={styles.sfDivider} />
            <div
              className={`${styles.sf} ${openField === 'duration' ? styles.sfActive : ''}`}
              onClick={() => toggleField('duration')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Duration</span>
                <span className={styles.sfValue}>{duration}</span>
              </div>
            </div>
            <div className={styles.sfDivider} />
            <div
              className={`${styles.sf} ${openField === 'travelers' ? styles.sfActive : ''}`}
              onClick={() => toggleField('travelers')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Travelers</span>
                <span className={styles.sfValue}>{travelersLabel}</span>
              </div>
            </div>
            <button className={styles.searchBtn} onClick={handleSearch}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              {cmsSearchBtn}
            </button>
          </div>

          {openField === 'destination' && (
            <div className={styles.dropdown}>
              {/* API results — same 2-column grid as popular destinations */}
              {destResults.length > 0 && (
                <div className={styles.destGrid}>
                  {destResults.map(city => (
                    <div
                      key={city.id}
                      className={`${styles.destItem} ${destinationCode === city.code ? styles.destItemActive : ''}`}
                      onClick={() => {
                        const label = city.code ? `${city.name} (${city.code})` : `${city.name}, ${city.countryName}`;
                        setDestination(label);
                        setDestinationCode(city.code || '');
                        setOpenField(null);
                      }}
                    >
                      {city.code
                        ? <span className={styles.destCode}>{city.code}</span>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: 0.45, flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      }
                      <span className={styles.destItemLabel}>
                        {city.name}{city.code ? ` (${city.code})` : `, ${city.countryName}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* No results message */}
              {destSearch.trim() && !destLoading && destResults.length === 0 && (
                <div className={styles.destNoResult}>No destinations found for "{destSearch}"</div>
              )}

              {/* Popular picks (shown when search is empty) */}
              {!destSearch.trim() && (
                <>
                  <div className={styles.destPopularLabel}>Popular destinations</div>
                  <div className={styles.destGrid}>
                    {POPULAR_DESTINATIONS.map((d) => (
                      <div
                        key={d.code}
                        className={`${styles.destItem} ${destinationCode === d.code ? styles.destItemActive : ''}`}
                        onClick={() => { setDestination(d.label); setDestinationCode(d.code); setOpenField(null); }}
                      >
                        <span className={styles.destCode}>{d.code}</span>
                        <span className={styles.destItemLabel}>{d.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {openField === 'duration' && (
            <div className={styles.dropdown}>
              <div className={styles.durGrid}>
                {DURATIONS.map((d) => (
                  <div
                    key={d}
                    className={`${styles.durPill} ${duration === d ? styles.durPillActive : ''}`}
                    onClick={() => { setDuration(d); setOpenField(null); }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          )}

          {openField === 'travelers' && (
            <div className={styles.dropdown}>
              <div className={styles.travRow}>
                <span className={styles.travLabel}>Adults <small className={styles.travHint}>18+</small></span>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setAdults((v) => Math.max(1, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{adults}</span>
                  <button className={styles.stepperBtn} onClick={() => setAdults((v) => Math.min(9, v + 1))}>+</button>
                </div>
              </div>
              <div className={styles.travRow}>
                <span className={styles.travLabel}>Children <small className={styles.travHint}>0–17</small></span>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setChildrenCount(children - 1)}>−</button>
                  <span className={styles.stepperCount}>{children}</span>
                  <button className={styles.stepperBtn} onClick={() => setChildrenCount(children + 1)}>+</button>
                </div>
              </div>
              <div className={styles.travRow}>
                <span className={styles.travLabel}>Rooms</span>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setRooms((v) => Math.max(1, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{rooms}</span>
                  <button className={styles.stepperBtn} onClick={() => setRooms((v) => Math.min(8, v + 1))}>+</button>
                </div>
              </div>

              {children > 0 && (
                <div className={styles.travDobs}>
                  <span className={styles.travDobsTitle}>Children's date of birth</span>
                  {childrenDobs.map((dob, i) => {
                    const age = ageFromDob(dob);
                    return (
                      <div className={styles.travDobRow} key={i}>
                        <span className={styles.travDobLabel}>
                          Child {i + 1}{age != null ? <em className={styles.travDobAge}>{age} yr{age === 1 ? '' : 's'}</em> : ''}
                        </span>
                        <input
                          type="date"
                          className={styles.travDobInput}
                          value={dob}
                          max={todayISO}
                          onChange={(e) => updateChildDob(i, e.target.value)}
                        />
                      </div>
                    );
                  })}
                  <span className={styles.travDobHint}>Children's ages help us price rooms &amp; flights correctly.</span>
                </div>
              )}

              <button className={styles.doneBtn} onClick={() => setOpenField(null)}>Done</button>
            </div>
          )}
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
                <span className={styles.sfValue}>{flightFrom || 'Select airport'}</span>
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
                <span className={styles.sfValue}>{flightTo || 'Select destination'}</span>
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
                <span className={styles.sfValue}>{formatDate(flightDate) || 'Select date'}</span>
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
                    <span className={styles.sfValue}>{formatDate(flightReturnDate) || 'Select date'}</span>
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
                  <span className={styles.sfValue}>{multiFrom || 'Select airport'}</span>
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
                  <span className={styles.sfValue}>{multiTo || 'Select destination'}</span>
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
                  <span className={styles.sfValue}>{formatDate(multiDate) || 'Select date'}</span>
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
    </section>
  );
}
