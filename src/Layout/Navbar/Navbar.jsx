import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import logo from '../../assets/image.png';
import styles from './Navbar.module.css';

const NAV_LINKS = [
  { label: 'Sun Vacations', path: '/packages' },
  { label: 'City Trips',    path: '/hotels' },
  { label: 'Last Minute',   path: '/search?type=lastminute' },
  { label: 'Inspiration',   path: '/about' },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((s) => s.auth);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Only use transparent nav on the home page
  const isHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dark = !isHome || scrolled;

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ''} ${!isHome ? styles.solid : ''}`}>
      <div className={styles.logo} onClick={() => navigate('/')}>
        <img src={logo} alt="Sunsky" className={`${styles.logoImg} ${dark ? styles.logoImgDark : styles.logoImgLight}`} />
        <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
          Sunsky
        </span>
      </div>

      <nav className={styles.links}>
        {NAV_LINKS.map((l) => (
          <a
            key={l.path}
            className={`${styles.link} ${dark ? styles.linkDark : styles.linkLight}`}
            onClick={() => navigate(l.path)}
          >
            {l.label}
          </a>
        ))}
        {isAuthenticated ? (
          <button
            className={styles.cta}
            onClick={() => { dispatch(logout()); navigate('/'); }}
          >
            Sign Out
          </button>
        ) : (
          <button className={styles.cta} onClick={() => navigate('/login')}>
            Book Now
          </button>
        )}
      </nav>

      <button
        className={`${styles.hamburger} ${dark ? styles.hamburgerDark : styles.hamburgerLight}`}
        onClick={() => setMobileOpen((o) => !o)}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
      </button>

      {mobileOpen && (
        <div className={styles.mobile}>
          {NAV_LINKS.map((l) => (
            <button key={l.path} className={styles.mobileLink} onClick={() => { navigate(l.path); setMobileOpen(false); }}>
              {l.label}
            </button>
          ))}
          {isAuthenticated ? (
            <button className={styles.mobileCta} onClick={() => { dispatch(logout()); setMobileOpen(false); }}>Sign Out</button>
          ) : (
            <button className={styles.mobileCta} onClick={() => { navigate('/login'); setMobileOpen(false); }}>Book Now</button>
          )}
        </div>
      )}
    </header>
  );
}
