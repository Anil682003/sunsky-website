import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import styles from './Hero.module.css';

const DESTINATIONS = [
  { label: 'Egypt, Red Sea', icon: '🇪🇬' },
  { label: 'Turkey, Antalya', icon: '🇹🇷' },
  { label: 'Greece, Crete', icon: '🇬🇷' },
  { label: 'Spain, Canary Islands', icon: '🇪🇸' },
  { label: 'Maldives', icon: '🇲🇻' },
  { label: 'Thailand, Phuket', icon: '🇹🇭' },
  { label: 'Morocco, Marrakech', icon: '🇲🇦' },
  { label: 'Portugal, Algarve', icon: '🇵🇹' },
];
const DURATIONS = ['3 days','5 days','6 days','7 days','8 days','10 days','14 days'];

export default function Hero() {
  const { isAuthenticated } = useSelector((s) => s.auth);
  const navigate = useNavigate();

  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('7 days');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [openField, setOpenField] = useState(null);

  const searchBarRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target)) {
        setOpenField(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleField = (field) => {
    setOpenField((prev) => (prev === field ? null : field));
  };

  const handleSearch = () => {
    navigate(`/search?destination=${encodeURIComponent(destination)}&date=${date}&duration=${encodeURIComponent(duration)}&adults=${adults}&children=${children}`);
  };

  const travelersLabel = `${adults} adult${adults > 1 ? 's' : ''}${children > 0 ? `, ${children} child${children > 1 ? 'ren' : ''}` : ''}`;

  return (
    <section className={styles.hero}>
      <div className={styles.bg} />
      <div className={styles.overlay} />
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.ring} />

      <div className={styles.content}>
        <div className={styles.badge}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
          Holidays at guaranteed best prices
        </div>

        <h1 className={styles.title}>
          Where will you<br />chase the <span className={styles.script}>sun</span>?
        </h1>

        <p className={styles.subtitle}>
          Sun-soaked beaches, vibrant cities, and hidden gems — all at the best guaranteed prices.
        </p>

        <div className={styles.searchBarWrap} ref={searchBarRef}>
          <div className={styles.searchBar}>
            <div
              className={`${styles.sf} ${openField === 'destination' ? styles.sfActive : ''}`}
              onClick={() => toggleField('destination')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Destination</span>
                <span className={styles.sfValue}>{destination || 'Where to?'}</span>
              </div>
            </div>
            <div className={styles.sfDivider} />
            <div
              className={`${styles.sf} ${openField === 'date' ? styles.sfActive : ''}`}
              onClick={() => toggleField('date')}
            >
              <span className={styles.sfIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </span>
              <div className={styles.sfText}>
                <span className={styles.sfLabel}>Departure</span>
                <span className={styles.sfValue}>{date || 'Pick a date'}</span>
              </div>
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
              Search
            </button>
          </div>

          {openField === 'destination' && (
            <div className={styles.dropdown}>
              <div className={styles.destGrid}>
                {DESTINATIONS.map((d) => (
                  <div
                    key={d.label}
                    className={`${styles.destItem} ${destination === d.label ? styles.destItemActive : ''}`}
                    onClick={() => { setDestination(d.label); setOpenField(null); }}
                  >
                    <span>{d.icon}</span>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {openField === 'date' && (
            <div className={styles.dropdown}>
              <input
                type="date"
                className={styles.dateInput}
                value={date}
                onChange={(e) => { setDate(e.target.value); setOpenField(null); }}
              />
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
                <span className={styles.travLabel}>Adults</span>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setAdults((v) => Math.max(1, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{adults}</span>
                  <button className={styles.stepperBtn} onClick={() => setAdults((v) => Math.min(9, v + 1))}>+</button>
                </div>
              </div>
              <div className={styles.travRow}>
                <span className={styles.travLabel}>Children</span>
                <div className={styles.stepper}>
                  <button className={styles.stepperBtn} onClick={() => setChildren((v) => Math.max(0, v - 1))}>−</button>
                  <span className={styles.stepperCount}>{children}</span>
                  <button className={styles.stepperBtn} onClick={() => setChildren((v) => Math.min(6, v + 1))}>+</button>
                </div>
              </div>
              <button className={styles.doneBtn} onClick={() => setOpenField(null)}>Done</button>
            </div>
          )}
        </div>

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
