import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Plane, Hotel, Package, Car, Globe, Phone, User,
  LogOut, ChevronDown, Menu, X, Search, BookOpen,
  Settings, LayoutDashboard,
} from 'lucide-react';
import { logout } from '../../store/slices/authSlice';
import styles from './Navbar.module.css';

const NAV_LINKS = [
  { label: 'Home',      path: '/' },
  { label: 'Packages',  path: '/packages',  icon: <Package size={15} /> },
  { label: 'Flights',   path: '/flights',   icon: <Plane size={15} /> },
  { label: 'Hotels',    path: '/hotels',    icon: <Hotel size={15} /> },
  { label: 'Transfers', path: '/transfers', icon: <Car size={15} /> },
  { label: 'About',     path: '/about',     icon: <Globe size={15} /> },
  { label: 'Contact',   path: '/contact',   icon: <Phone size={15} /> },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((s) => s.auth);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleLogout = () => {
    dispatch(logout());
    setUserMenuOpen(false);
    navigate('/');
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';

  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        {/* Logo */}
        <div className={styles.logo} onClick={() => navigate('/')}>
          <div className={styles.logoIcon}>
            <Plane size={20} />
          </div>
          <span className={styles.logoText}>Sun<span className={styles.logoAccent}>sky</span></span>
        </div>

        {/* Desktop nav links */}
        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <button
              key={link.path}
              className={`${styles.navLink} ${isActive(link.path) ? styles.active : ''}`}
              onClick={() => navigate(link.path)}
            >
              {link.icon && <span className={styles.navIcon}>{link.icon}</span>}
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right section */}
        <div className={styles.right}>
          <button className={styles.searchBtn} onClick={() => navigate('/search')}>
            <Search size={18} />
          </button>

          {isAuthenticated ? (
            <div className={styles.userMenu}>
              <button
                className={styles.userTrigger}
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                <div className={styles.avatar}>{initials}</div>
                <span className={styles.userName}>{user?.firstName ?? 'My Account'}</span>
                <ChevronDown size={14} className={userMenuOpen ? styles.chevronUp : ''} />
              </button>

              {userMenuOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownAvatar}>{initials}</div>
                    <div>
                      <p className={styles.dropdownName}>{user?.firstName} {user?.lastName}</p>
                      <p className={styles.dropdownEmail}>{user?.email}</p>
                    </div>
                  </div>
                  <div className={styles.dropdownDivider} />
                  <button className={styles.dropdownItem} onClick={() => { navigate('/account'); setUserMenuOpen(false); }}>
                    <LayoutDashboard size={15} /> Dashboard
                  </button>
                  <button className={styles.dropdownItem} onClick={() => { navigate('/account/bookings'); setUserMenuOpen(false); }}>
                    <BookOpen size={15} /> My Bookings
                  </button>
                  <button className={styles.dropdownItem} onClick={() => { navigate('/account/profile'); setUserMenuOpen(false); }}>
                    <User size={15} /> Profile
                  </button>
                  <button className={styles.dropdownItem} onClick={() => { navigate('/account/settings'); setUserMenuOpen(false); }}>
                    <Settings size={15} /> Settings
                  </button>
                  <div className={styles.dropdownDivider} />
                  <button className={`${styles.dropdownItem} ${styles.logoutItem}`} onClick={handleLogout}>
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.authButtons}>
              <button className={styles.loginBtn} onClick={() => navigate('/login')}>Sign In</button>
              <button className={styles.registerBtn} onClick={() => navigate('/register')}>Register</button>
            </div>
          )}

          {/* Mobile hamburger */}
          <button className={styles.hamburger} onClick={() => setMobileOpen((o) => !o)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <button
              key={link.path}
              className={`${styles.mobileLink} ${isActive(link.path) ? styles.mobileLinkActive : ''}`}
              onClick={() => { navigate(link.path); setMobileOpen(false); }}
            >
              {link.icon}
              {link.label}
            </button>
          ))}
          <div className={styles.mobileDivider} />
          {isAuthenticated ? (
            <>
              <button className={styles.mobileLink} onClick={() => { navigate('/account'); setMobileOpen(false); }}>
                <User size={15} /> My Account
              </button>
              <button className={`${styles.mobileLink} ${styles.mobileLogout}`} onClick={handleLogout}>
                <LogOut size={15} /> Sign Out
              </button>
            </>
          ) : (
            <>
              <button className={styles.mobileLink} onClick={() => { navigate('/login'); setMobileOpen(false); }}>
                Sign In
              </button>
              <button className={styles.mobileLink} onClick={() => { navigate('/register'); setMobileOpen(false); }}>
                Register
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
