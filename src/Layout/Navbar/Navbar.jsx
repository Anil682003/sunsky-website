import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import mainLogoFallback from '../../assets/main-logo.png';
import styles from './Navbar.module.css';
import { useHomepageConfig, useHeaderConfig, useHolidayTypes } from '../../api';
import { resolveCmsImageUrl } from '../../utils/cmsImage';
import { groupLinkUrl, groupLinkLabel } from '../../utils/cmsDestinations';
import DestinationSearch from '../../components/DestinationSearch/DestinationSearch';
import HeaderMenu from './HeaderMenu';

const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Menu icons. Holiday-type icons are picked from the name — the dashboard's
// `icon` field is free text (same convention as the homepage Categories cards).
const MenuPin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
);
const MenuGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
);
const TypeSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
);
const TypeCity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9h1M9 13h1M9 17h1" /></svg>
);
const TypeCar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3v-6l2-5h12l2 5h2v6h-2M7 17a2 2 0 104 0M13 17a2 2 0 104 0" /></svg>
);
const TypeBolt = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
);
const TypeSnow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M4 6l16 12M20 6L4 18M12 7l-3-2M12 7l3-2M12 17l-3 2M12 17l3 2" /></svg>
);
const TypeCompass = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" /></svg>
);
const typeIconFor = (name) => {
  const n = String(name || '').toLowerCase();
  if (n.includes('ski') || n.includes('snow') || n.includes('winter')) return <TypeSnow />;
  if (n.includes('sun') || n.includes('beach')) return <TypeSun />;
  if (n.includes('city')) return <TypeCity />;
  if (n.includes('car') || n.includes('road')) return <TypeCar />;
  if (n.includes('last minute') || n.includes('deal')) return <TypeBolt />;
  return <TypeCompass />;
};

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
  // While the ticket is focused, the flanking menus collapse and the search
  // blooms across the whole cluster — widest exactly when typing needs it.
  const [searchFocused, setSearchFocused] = useState(false);
  const headerRef = useRef(null);
  const logoRef   = useRef(null);
  const authRef   = useRef(null);
  const dropRef = useRef(null);

  // The header CMS (CMS → Layout → Header) owns the logo; the homepage CMS
  // `logo.mainUrl` remains a fallback for anyone who set it there first.
  // Only one logo is needed now that the bar is white in every state.
  const { data: headerConfig } = useHeaderConfig();
  const { data: cmsConfig } = useHomepageConfig();

  const headerLogo = resolveCmsImageUrl(headerConfig?.logoUrl);
  const cmsMainLogo = resolveCmsImageUrl(cmsConfig?.logo?.mainUrl);

  const mainLogo = headerLogo || cmsMainLogo || mainLogoFallback;
  const logoAlt = headerConfig?.logoAltText?.trim() || 'SunSky';
  const logoHref = headerConfig?.logoLinkTarget?.trim() || '/';

  const usingCmsLogo = Boolean(headerLogo || cmsMainLogo);

  // Whether the uploaded logo is a wide wordmark or a square icon decides how
  // it is sized AND whether the "SunSky" text sits beside it: a wordmark
  // already carries the name, a square icon does not. Measured on load rather
  // than assumed, since either can be uploaded.
  const [logoAspect, setLogoAspect] = useState(null);
  const isWordmark = usingCmsLogo && logoAspect !== null && logoAspect > 1.6;

  const isHome = location.pathname === '/';
  // Pages with a dark hero band — navbar starts transparent and blends in
  const overHero = isHome || location.pathname === '/results' || location.pathname.startsWith('/hotel/') || location.pathname === '/checkout' || location.pathname.startsWith('/flights') || location.pathname.startsWith('/holidays/');

  // The centered cluster is placed in the actual gap BETWEEN the logo and the
  // auth block, not on the page centre — the logo side has more room than the
  // auth side, so page-centring would waste it and squeeze the search. Measured
  // because both edges move (logo wordmark vs icon, signed-in vs -out auth).
  // Must sit AFTER isHome/usingCmsLogo/logoAspect are declared — its deps read
  // them at the call site, and a temporal-dead-zone reference would crash render.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const GAP = 28;         // min clear space each side
    const CAP = 1120;       // never wider than this
    const compute = () => {
      // The cluster only shows above the mobile breakpoint; below it the auth
      // block is hidden (zero-width) and the search lives in the drawer.
      if (window.innerWidth <= 900 || !logoRef.current || !authRef.current) {
        header.style.removeProperty('--hs-left');
        header.style.removeProperty('--hs-width');
        return;
      }
      const left  = logoRef.current.getBoundingClientRect().right + GAP;
      const right = authRef.current.getBoundingClientRect().left - GAP;
      const width = Math.min(CAP, Math.max(0, right - left));
      header.style.setProperty('--hs-left', `${(left + right) / 2}px`);
      header.style.setProperty('--hs-width', `${width}px`);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [isAuthenticated, isHome, usingCmsLogo, logoAspect]);

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

  // The bar is white in every state, so its contents always use the dark
  // treatment. `scrolled` still drives the compaction and deeper shadow.
  const dark = true;

  const handleLogout = () => {
    dispatch(logout());
    setDropOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  // Popular destinations, drawn from the CMS popular-destination groups the homepage already
  // fetches — zero extra API calls. groupLinkUrl builds the right params per entry (whole
  // countries → ?countries=, cities → ?destinations=); unlinked legacy strings drop out.
  // De-duped by label. The group each entry came from becomes its menu sublabel. Top 7 fill
  // the header menu; the first 6 double as the search's idle chips and typewriter names.
  const popularDests = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const g of cmsConfig?.popularDestinationGroups ?? []) {
      for (const link of g?.links ?? []) {
        const url = groupLinkUrl(link);
        const label = groupLinkLabel(link);
        if (!url || !label || seen.has(label)) continue;
        seen.add(label);
        out.push({ label, url, sub: g?.title || '' });
        if (out.length >= 7) return out;
      }
    }
    return out;
  }, [cmsConfig]);
  const searchSuggestions = useMemo(() => popularDests.slice(0, 6), [popularDests]);

  // Top holiday types for the right-hand menu: the CMS featured list leads (dashboard order),
  // topped up from the full admin list to 5. Each opens its /holidays/:slug page.
  const { data: allTypes } = useHolidayTypes();
  const topHolidayTypes = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (title, slug) => {
      const key = slugify(title);
      if (!title || !key || seen.has(key)) return;
      seen.add(key);
      out.push({ title, slug: slug || key });
    };
    for (const f of cmsConfig?.featuredHolidayTypes ?? []) {
      if (f && f.active !== false && f.title) push(f.title);
      if (out.length >= 5) return out;
    }
    for (const t of allTypes ?? []) {
      push(t.name, t.slug);
      if (out.length >= 5) break;
    }
    return out;
  }, [cmsConfig, allTypes]);

  // Header search — a picked hotel pins that one hotel; a picked destination opens results for it.
  // The results page fills the rest (dates default to today+30/+37, 2 adults, 1 room).
  const goToSearchResult = (item) => {
    if (!item) return;
    const qs = new URLSearchParams();
    if (item.type === 'hotel') {
      if (item.destinationCode) qs.set('destinations', item.destinationCode);
      qs.set('hotelCode', item.hotelCode);
      qs.set('destinationLabel', item.name);
    } else {
      qs.set('destinations', item.code);
      qs.set('destinationLabel', item.name);
    }
    navigate(`/results?${qs.toString()}`);
    setMobileOpen(false);
  };

  // Suggestion chips carry a prebuilt URL (their country/city params differ per entry).
  const goToSuggestion = (url) => {
    if (!url) return;
    navigate(url);
    setMobileOpen(false);
  };

  return (
    <header ref={headerRef} className={`${styles.nav} ${scrolled ? styles.scrolled : ''} ${!overHero ? styles.solid : ''}`}>

      {/* Centered search — home page only. Absolutely positioned (not a flex child) so it stays
          dead-centre in the bar regardless of the differing logo / account widths. Hidden on
          mobile, where it moves into the drawer. */}
      {isHome && (
        <div className={`${styles.headerSearch} ${searchFocused ? styles.headerSearchFocused : ''}`}>
          <HeaderMenu
            label="Popular destinations"
            buttonIcon={<MenuGlobe />}
            tally={`${popularDests.length} destination${popularDests.length === 1 ? '' : 's'}`}
            align="left"
            items={popularDests.map((d) => ({
              key: d.label,
              label: d.label,
              sub: d.sub,
              icon: <MenuPin />,
              onPick: () => goToSuggestion(d.url),
            }))}
          />
          <div className={styles.searchGrow}>
            <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} onFocusChange={setSearchFocused} />
          </div>
          <HeaderMenu
            label="Holiday types"
            buttonIcon={<TypeSun />}
            tally={`${topHolidayTypes.length} holiday type${topHolidayTypes.length === 1 ? '' : 's'}`}
            align="right"
            items={topHolidayTypes.map((t) => ({
              key: t.slug,
              label: t.title,
              sub: 'Explore holidays',
              icon: typeIconFor(t.title),
              onPick: () => { navigate(`/holidays/${t.slug}`); },
            }))}
          />
        </div>
      )}

      {/* Logo */}
      <Link to={logoHref} className={styles.logo} ref={logoRef}>
        <img
          src={mainLogo}
          alt={logoAlt}
          className={`${styles.logoImg} ${isWordmark ? styles.logoImgCms : ''}`}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) setLogoAspect(w / h);
          }}
        />
        {/* Hidden only for a wordmark logo, which already prints the name. */}
        {!isWordmark && (
          <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
            Sun<span className={styles.logoAccent}>Sky</span>
          </span>
        )}
      </Link>

      {/* Desktop auth buttons */}
      <div className={styles.authArea} ref={authRef}>
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
                  { icon: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', label: 'Favourites', path: '/account/favourites' },
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
          {isHome && (
            <div className={styles.mobileSearch}>
              <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} />
            </div>
          )}
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
