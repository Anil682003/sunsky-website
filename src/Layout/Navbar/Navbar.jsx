import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import styles from './Navbar.module.css';

const NAV_LINKS = [
  { label: 'Sun Vacations', path: '/packages' },
  { label: 'City Trips',    path: '/hotels' },
  { label: 'Last Minute',   path: '/search?type=lastminute' },
  { label: 'Inspiration',   path: '/about' },
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

  const dark = !isHome || scrolled;

  const handleLogout = () => {
    dispatch(logout());
    setDropOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ''} ${!isHome ? styles.solid : ''}`}>

      {/* Logo */}
      <Link to="/" className={styles.logo}>
        <div className={`${styles.logoIcon} ${dark ? styles.logoIconDark : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </div>
        <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
          Sun<span className={styles.logoAccent}>Sky</span>
        </span>
      </Link>

      {/* Desktop nav links */}
      <nav className={styles.links}>
        {NAV_LINKS.map((l) => (
          <a
            key={l.path}
            className={`${styles.link} ${dark ? styles.linkDark : styles.linkLight} ${location.pathname === l.path ? styles.linkActive : ''}`}
            onClick={() => navigate(l.path)}
          >
            {l.label}
          </a>
        ))}
      </nav>

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
                  { icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', label: 'Settings', path: '/account/settings' },
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
              Sign In
            </Link>
            <Link to="/register" className={styles.registerBtn}>
              Register
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
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
            {NAV_LINKS.map((l) => (
              <button
                key={l.path}
                className={`${styles.mobileLink} ${location.pathname === l.path ? styles.mobileLinkActive : ''}`}
                onClick={() => { navigate(l.path); setMobileOpen(false); }}
              >
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
