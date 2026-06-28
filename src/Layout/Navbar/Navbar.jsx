import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import mainLogo from '../../assets/main-logo.png';
import lightLogo from '../../assets/light-logo.png';
import styles from './Navbar.module.css';

const SERVICES = [
  {
    label: 'Holidays', path: '/', match: ['/', '/results'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  },
  {
    label: 'Flights', path: '/flights', match: ['/flights'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  },
  {
    label: 'Hotels', path: '/hotels', match: ['/hotels'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9h1M9 13h1M9 17h1"/></svg>,
  },
  {
    label: 'Transfers', path: '/transfers', match: ['/transfers'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1"/><path d="M12 15l5 6H7l5-6z"/></svg>,
  },
];

function getInitials(user) {
  if (!user) return 'U';
  const name = user.firstName || user.name || user.email || '';
  return name.slice(0, 2).toUpperCase() || 'U';
}

export default function Navbar() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const dispatch   = useDispatch();
  const { isAuthenticated, user } = useSelector((s) => s.auth);

  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [dropOpen,    setDropOpen]    = useState(false);
  const dropRef = useRef(null);

  const isHome = location.pathname === '/';
  // Pages with a dark hero band — navbar starts transparent and blends in
  const overHero = isHome || location.pathname === '/results' || location.pathname.startsWith('/hotel/') || location.pathname === '/checkout' || location.pathname.startsWith('/flights');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const close = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const dark = !overHero || scrolled;

  const handleLogout = () => {
    dispatch(logout());
    setDropOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ''} ${!overHero ? styles.solid : ''}`}>

      {/* Logo */}
      <Link to="/" className={styles.logo}>
        <img
          src={dark ? mainLogo : lightLogo}
          alt="SunSky"
          className={styles.logoImg}
        />
        <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
          Sun<span className={styles.logoAccent}>Sky</span>
        </span>
      </Link>

      {/* Desktop auth buttons */}
      <div className={styles.authArea}>
        {isAuthenticated ? (
          <div className={styles.userMenu} ref={dropRef}>
            <button
              className={`${styles.avatarBtn} ${dark ? styles.avatarBtnDark : styles.avatarBtnLight}`}
              onClick={() => setDropOpen((o) => !o)}
            >
              <div className={styles.avatarCircle}>{getInitials(user)}</div>
              <span className={`${styles.avatarName} ${dark ? styles.avatarNameDark : styles.avatarNameLight}`}>
                {user?.firstName || 'My Account'}
              </span>
              <svg
                className={`${styles.chevron} ${dropOpen ? styles.chevronUp : ''}`}
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              >
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {dropOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropHeader}>
                  <div className={styles.dropAvatar}>{getInitials(user)}</div>
                  <div>
                    <div className={styles.dropName}>{user?.firstName} {user?.lastName}</div>
                    <div className={styles.dropEmail}>{user?.email}</div>
                  </div>
                </div>
                <div className={styles.dropDivider} />
                {[
                  { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: 'My Bookings', path: '/account/bookings' },
                  { icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z', label: 'Profile', path: '/account/profile' },
                ].map((item) => (
                  <button key={item.path} className={styles.dropItem} onClick={() => { navigate(item.path); setDropOpen(false); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d={item.icon}/>
                    </svg>
                    {item.label}
                  </button>
                ))}
                <div className={styles.dropDivider} />
                <button className={styles.dropLogout} onClick={handleLogout}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.authBtns}>
            <Link
              to="/login"
              className={`${styles.signInBtn} ${dark ? styles.signInDark : styles.signInLight}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              Sign In
            </Link>
            <Link to="/register" className={styles.registerBtn}>
              Register
              <span className={styles.registerArrow}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* Hamburger */}
      <button
        className={`${styles.hamburger} ${dark ? styles.hamburgerDark : styles.hamburgerLight}`}
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Menu"
      >
        {mobileOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        )}
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className={styles.mobile}>
          <div className={styles.mobileLinks}>
            {SERVICES.map((l) => (
              <button
                key={l.path}
                className={`${styles.mobileLink} ${l.match.includes(location.pathname) ? styles.mobileLinkActive : ''}`}
                onClick={() => { navigate(l.path); setMobileOpen(false); }}
              >
                {l.icon}
                {l.label}
              </button>
            ))}
          </div>
          <div className={styles.mobileDivider} />
          {isAuthenticated ? (
            <div className={styles.mobileAuth}>
              <div className={styles.mobileUser}>
                <div className={styles.mobileAvatar}>{getInitials(user)}</div>
                <div>
                  <div className={styles.mobileUserName}>{user?.firstName} {user?.lastName}</div>
                  <div className={styles.mobileUserEmail}>{user?.email}</div>
                </div>
              </div>
              <button className={styles.mobileLink} onClick={() => { navigate('/account/bookings'); setMobileOpen(false); }}>My Bookings</button>
              <button className={styles.mobileLink} onClick={() => { navigate('/account/profile'); setMobileOpen(false); }}>Profile</button>
              <button className={styles.mobileLogout} onClick={handleLogout}>Sign Out</button>
            </div>
          ) : (
            <div className={styles.mobileAuth}>
              <button className={styles.mobileSignIn} onClick={() => { navigate('/login'); setMobileOpen(false); }}>Sign In</button>
              <button className={styles.mobileRegister} onClick={() => { navigate('/register'); setMobileOpen(false); }}>
                Register — it's quick!
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
