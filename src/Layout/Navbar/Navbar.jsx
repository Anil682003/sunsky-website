import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import { resolveBrandLogo, BUNDLED_LOGO } from '../../hooks/useBrandLogo';
import styles from './Navbar.module.css';
import { useHomepageConfig, useHeaderConfig, useHolidayTypes } from '../../api';
import { groupLinkUrl, groupLinkLabel } from '../../utils/cmsDestinations';
import { hotelDetailHref } from '../../utils/searchDefaults';
import DestinationSearch from '../../components/DestinationSearch/DestinationSearch';
import Trustpilot from '../../components/Trustpilot/Trustpilot';
import { SCORE_TEMPLATE } from '../../components/Trustpilot/trustpilotConfig';
import HeaderMenu from './HeaderMenu';
import LanguageSwitch from '../../components/LanguageSwitch/LanguageSwitch';
import { useTranslation } from 'react-i18next';

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
    key: 'holidays', label: 'Holidays', path: '/', match: ['/', '/results'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  },
  {
    key: 'flights', label: 'Flights', path: '/flights', match: ['/flights'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  },
  {
    key: 'hotels', label: 'Hotels', path: '/hotels', match: ['/hotels'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9h1M9 13h1M9 17h1"/></svg>,
  },
  {
    key: 'transfers', label: 'Transfers', path: '/transfers', match: ['/transfers'],
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1"/><path d="M12 15l5 6H7l5-6z"/></svg>,
  },
];

// A CMS link can point anywhere: an internal route goes through the router, anything with a
// scheme (https:, tel:, mailto:) is a plain anchor.
const isExternalHref = (href) => /^(https?:|tel:|mailto:)/i.test(String(href || ''));

function getInitials(user) {
  if (!user) return 'U';
  const name = user.firstName || user.name || user.email || '';
  return name.slice(0, 2).toUpperCase() || 'U';
}

export default function Navbar() {
  // Every call carries the English as its default, so a key with no translation
  // yet renders readable text rather than a raw `nav.signIn`.
  const { t }      = useTranslation('common');
  const navigate   = useNavigate();
  const location   = useLocation();
  const dispatch   = useDispatch();
  const { isAuthenticated, user } = useSelector((s) => s.auth);

  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [dropOpen,    setDropOpen]    = useState(false);
  const dropRef = useRef(null);

  // The header CMS (CMS → Layout → Header) owns the logo; the homepage CMS
  // `logo.mainUrl` remains a fallback for anyone who set it there first.
  // Only one logo is needed now that the bar is white in every state.
  const { data: headerConfig } = useHeaderConfig();
  const { data: cmsConfig } = useHomepageConfig();

  // The dashboard decides again, with the bundled file as the safety net rather than the
  // source of truth. The CMS slot now holds the same cleaned wordmark that ships here, so
  // the two agree and a CMS outage is invisible instead of a missing logo. Whatever gets
  // uploaded next is what visitors see, so it wants the same treatment: real transparency,
  // trimmed margins, and roughly twice the drawn size for retina.
  //
  // The ORDER is resolveBrandLogo's, not this component's, because the same logo is now drawn
  // on the footer, the sign-in pages and the voucher, and those must not be able to disagree
  // with the bar about which mark the site uses.
  const mainLogo = resolveBrandLogo({ header: headerConfig?.logoUrl, homepage: cmsConfig?.logo?.mainUrl });
  const logoAlt = headerConfig?.logoAltText?.trim() || 'SunSky';
  const logoHref = headerConfig?.logoLinkTarget?.trim() || '/';

  // The word beside the handset. The dashboard owns it (Header settings → Support label), and
  // the translated default stands in until it is set. CMS copy has no language column, so a
  // value typed there shows as typed in both languages — the same trade every other CMS string
  // on this site makes, and the reason the default is a translation rather than a hardcoded
  // Dutch word.
  // CMS → Layout → Header → Header Blocks. `siteHeader` is the backend's complete, normalised
  // layout; until it loads (or against a backend that predates it) every block shows, which is
  // exactly what the bar did before it was configurable. The two older flags below are gated on
  // it too: they were stored long before the website read them, so their values only mean
  // something once the migration that introduced siteHeader has reset them.
  const site = headerConfig?.siteHeader;
  const blockOn = (key) => site?.[key]?.enabled !== false;
  const showLanguage = !site || headerConfig?.enableLanguageSelector !== false;
  const showAccountEntry = !site || headerConfig?.enableAccountMenu !== false;
  const loginHref = (site && headerConfig?.loginUrl?.trim()) || '/login';
  const accountLabel = (site && headerConfig?.accountDisplayLabel?.trim()) || t('nav.myAccount', 'My Account');

  const supportLabel =
    site?.support?.label?.trim() || headerConfig?.supportLabel?.trim() || t('nav.customerService', 'Klantendienst');
  const supportHref = site?.support?.link?.trim() || '/faq';
  const destinationsLabel = site?.popularDestinations?.label?.trim() || t('nav.popularDestinations', 'Popular destinations');
  const holidayTypesLabel = site?.holidayTypes?.label?.trim() || t('nav.holidayTypes', 'Holiday types');
  const maxDests = site?.popularDestinations?.maxItems || 7;

  // The phone menu: the CMS Navigation Menu items when the dashboard asks for them, otherwise
  // the four services. Rows with no name or no target are drafts, not links.
  const customMobileLinks = site?.mobileMenu?.useCustomLinks
    ? (headerConfig?.navigationMenuItems ?? [])
        .filter((i) => i && i.isActive !== false && i.itemName?.trim() && i.linkTarget?.trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const openCmsLink = (item) => {
    const href = item.linkTarget.trim();
    setMobileOpen(false);
    if (item.type === 'ANCHOR') { window.location.hash = href.replace(/^#?/, '#'); return; }
    if (item.type === 'EXTERNAL_LINK' || isExternalHref(href)) { window.location.assign(href); return; }
    navigate(href);
  };

  // Whether the logo is a wide wordmark or a square icon decides how it is sized AND whether
  // the "SunSky" text sits beside it: a wordmark already carries the name, a square icon does
  // not. Measured from the image itself on load rather than assumed.
  //
  // This deliberately no longer asks WHERE the logo came from. It used to require a CMS
  // upload before it would believe a wordmark, so the bundled wordmark would have rendered
  // squashed into a 32px square with the words "SunSky" printed beside it: "Sunsky Vakanties
  // SunSky". The shape of the picture is the only thing that matters here.
  const [logoAspect, setLogoAspect] = useState(null);
  const isWordmark = logoAspect !== null && logoAspect > 1.6;

  const isHome = location.pathname === '/';
  // Pages with a dark hero band — navbar starts transparent and blends in
  const overHero = isHome || location.pathname === '/results' || location.pathname.startsWith('/hotel/') || location.pathname === '/checkout' || location.pathname.startsWith('/flights') || location.pathname.startsWith('/holidays/');

  // The header search (cluster on desktop, in-drawer on mobile) rides on every
  // screen EXCEPT the hotel detail page (which has its own booking form) and the
  // auth screens. Login/register render without this layout anyway, but they are
  // excluded explicitly so the intent is clear if that ever changes.
  const showHeaderSearch =
    blockOn('search') &&
    !location.pathname.startsWith('/hotel/') &&
    location.pathname !== '/login' &&
    location.pathname !== '/register';

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

  // The holiday-type catalogue, read once for both menus below. It is what turns a stored
  // holiday-type id into the slug that says whether a popular-destination link is a door
  // (entry=last_minute / entry=all_inclusive) rather than a hotel-theme filter.
  const { data: allTypes } = useHolidayTypes();

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
        const url = groupLinkUrl(link, allTypes);
        const label = groupLinkLabel(link);
        if (!url || !label || seen.has(label)) continue;
        seen.add(label);
        out.push({ label, url, sub: g?.title || '' });
        if (out.length >= maxDests) return out;
      }
    }
    return out;
  }, [cmsConfig, allTypes, maxDests]);
  const searchSuggestions = useMemo(() => popularDests.slice(0, 6), [popularDests]);

  // Top holiday types for the right-hand menu: the CMS featured list leads (dashboard order),
  // topped up from the full admin list to 5. Each opens its /holidays/:slug page.
  //
  // When the backend serves siteHeader, its `resolved` list IS the menu: the dashboard's
  // choice (CMS → Header → Holiday Types Menu), already filtered server side to ACTIVE types
  // and capped. The derivation below is only the fallback for an older backend.
  const topHolidayTypes = useMemo(() => {
    const resolved = site?.holidayTypes?.resolved;
    if (Array.isArray(resolved)) {
      return resolved
        .filter((r) => r && r.slug)
        .map((r) => ({ title: r.label || r.name, slug: r.slug }));
    }
    const seen = new Set();
    const out = [];
    const push = (title, slug) => {
      const key = slugify(title);
      if (!title || !key || seen.has(key)) return;
      seen.add(key);
      out.push({ title, slug: slug || key });
    };
    // A featured entry is resolved against the LIVE type list before it is linked, exactly as
    // the homepage Categories cards do it. Its `title` is dashboard copy and is often not the
    // type's name — "Sun Holidays" is the type whose slug is `zonvakanties`, "City Trip" is
    // `stedentrips` — so the slug this used to invent from the title led to a page that does
    // not exist. Two of the four live entries were landing nowhere.
    const liveById = new Map((allTypes ?? []).map((t) => [String(t.id), t]));
    const liveByName = new Map((allTypes ?? []).map((t) => [slugify(t.name), t]));
    for (const f of cmsConfig?.featuredHolidayTypes ?? []) {
      if (f && f.active !== false && f.title) {
        const live = liveById.get(String(f.holidayTypeId)) || liveByName.get(slugify(f.title));
        // Only when it resolves. An entry naming a type that no longer exists has no page to
        // open, and a menu row that goes nowhere is worse than one row fewer. Until the type
        // list has loaded nothing resolves, which is already true of the top-up loop below,
        // so the menu simply waits rather than offering dead links.
        if (live) push(f.title, live.slug);
      }
      if (out.length >= 5) return out;
    }
    for (const t of allTypes ?? []) {
      push(t.name, t.slug);
      if (out.length >= 5) break;
    }
    return out;
  }, [cmsConfig, allTypes, site]);

  // Header search.
  //
  // Naming ONE hotel is an unambiguous request for that hotel, so it opens the hotel's own
  // detail page. It used to land on the results list filtered to a single hotel, which showed
  // the traveller a whole filter sidebar and one lonely card, and made them click again to
  // reach the page they had already asked for.
  //
  // A destination is genuinely a many-results query, so that still opens the results list.
  // Either way the dates default to today+30/+37, 2 adults, 1 room, and the target page
  // live-prices from there.
  const goToSearchResult = (item) => {
    if (!item) return;
    if (item.type === 'hotel' && item.hotelCode) {
      const href = hotelDetailHref({
        hotelCode: item.hotelCode,
        name: item.name,
        destinationCode: item.destinationCode,
        stars: item.stars,
        img: item.image,
        loc: [item.destinationName, item.country].filter(Boolean).join(', '),
      });
      if (href) { navigate(href); setMobileOpen(false); return; }
    }
    // An AREA (zone) is a narrower destination: the results page needs the parent city as the
    // scope AND the zone to narrow it to, because `zones` alone would leave the scope empty and
    // fall back to the default destinations. Keyed as `<destinationCode>:<zoneCode>`, the same
    // pair form the sidebar's ScopePicker applies — a zoneCode is ambiguous on its own.
    if (item.type === 'zone' && item.destinationCode && item.zoneCode != null) {
      const qs = new URLSearchParams();
      qs.set('destinations', item.destinationCode);
      qs.set('zones', `${item.destinationCode}:${item.zoneCode}`);
      qs.set('destinationLabel', item.name);
      navigate(`/results?${qs.toString()}`);
      setMobileOpen(false);
      return;
    }
    // A destination — or a hotel/area result that arrived without a code to navigate by.
    // The scope code is only set when we actually have one: `destinations=undefined` reads as a
    // real destination downstream and prices nothing, where an absent param correctly falls back
    // to the default scope.
    const qs = new URLSearchParams();
    const scopeCode = item.type === 'destination' ? item.code : item.destinationCode;
    if (scopeCode) qs.set('destinations', scopeCode);
    qs.set('destinationLabel', item.name);
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
    <header className={`${styles.nav} ${scrolled ? styles.scrolled : ''} ${!overHero ? styles.solid : ''}`}>

      {/* The bar is three parts: this flank, the cluster, and the flank below. The two
          flanks carry equal flex weight, which is what puts the cluster on the window's
          centre no matter how wide either side's contents are. */}
      <div className={styles.navSide}>
      {/* Logo */}
      <Link to={logoHref} className={styles.logo}>
        <img
          src={mainLogo}
          alt={logoAlt}
          className={`${styles.logoImg} ${isWordmark ? styles.logoImgCms : ''}`}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) setLogoAspect(w / h);
          }}
          onError={(e) => {
            if (e.currentTarget.src !== BUNDLED_LOGO) {
              e.currentTarget.src = BUNDLED_LOGO;
              setLogoAspect(null);
            }
          }}
        />
        {/* Hidden only for a wordmark logo, which already prints the name. */}
        {!isWordmark && (
          <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
            Sun<span className={styles.logoAccent}>Sky</span>
          </span>
        )}
      </Link>
      {blockOn('popularDestinations') && (
      <HeaderMenu
            label={destinationsLabel}
            buttonIcon={<MenuGlobe />}
            tally={t('nav.destinations', {
              count: popularDests.length,
              defaultValue_one: '{{count}} destination',
              defaultValue_other: '{{count}} destinations',
            })}
            align="left"
            items={popularDests.map((d) => ({
              key: d.label,
              label: d.label,
              sub: d.sub,
              icon: <MenuPin />,
              onPick: () => goToSuggestion(d.url),
            }))}
          />
      )}
          <HeaderMenu
            label={holidayTypesLabel}
            buttonIcon={<TypeSun />}
            tally={t('nav.holidayTypes', {
              count: topHolidayTypes.length,
              defaultValue_one: '{{count}} holiday type',
              defaultValue_other: '{{count}} holiday types',
            })}
            // Both panels now drop from the left of the pair, so both draw their golden
            // thread the same way; "right" belonged to the menu that used to sit at the
            // cluster's right edge.
            align="left"
            // `type`, not `t`: the parameter was called `t` and shadowed the
            // translation function, so `t(...)` inside it called a holiday-type
            // object. It only crashed where the CMS actually returns types.
            items={topHolidayTypes.map((type) => ({
              key: type.slug,
              label: type.title,
              sub: t('nav.exploreHolidays', 'Explore holidays'),
              icon: typeIconFor(type.title),
              onPick: () => { navigate(`/holidays/${type.slug}`); },
            }))}
          />
      </div>

      {/* Centered search — home page only. A REAL flex child between the logo and the auth
          block (not absolutely positioned) so the browser's own layout fills the gap between
          them — it can never overlap either side, on any resize, with no JS measurement. Hidden
          on mobile, where it moves into the drawer. */}
      {showHeaderSearch && (
        <div className={styles.headerSearch}>
          <div className={styles.searchGrow}>
            <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} />
          </div>
        </div>
      )}

      <div className={`${styles.navSide} ${styles.navSideEnd}`}>
      {/* Help. First in this flank, so it lands just past the search ticket on the home
          page and in that same spot on every other page, where there is no ticket. An icon
          rather than a word: the bar is already carrying five, and the two browse menus give
          their labels up below 1500px to keep the ticket off its floor. The name is on the
          control for a screen reader and on hover, and this one stays down to phone width,
          where it sits beside the burger.

          It opens the help centre (/faq), not /contact: the questions there answer most of
          what people ring about, and the FAQ page carries the ways to reach a human anyway.
          The accessible name says "Help" to match where it goes — a control announced as
          "Contact us" that lands on a list of questions is a small lie to anyone who cannot
          see the page. */}
      {blockOn('support') && (() => {
        const inner = (
          <>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
        </svg>
        {/* aria-hidden: the label repeats the accessible name the Link already carries, so
            without this a screen reader announces it twice. */}
        <span className={styles.contactLabel} aria-hidden="true">{supportLabel}</span>
          </>
        );
        const common = { className: styles.contactBtn, 'aria-label': supportLabel, title: supportLabel };
        return isExternalHref(supportHref)
          ? <a href={supportHref} {...common}>{inner}</a>
          : <Link to={supportHref} {...common}>{inner}</Link>;
      })()}

      {/* Trustpilot's star rating. The header has room for a score and nothing else, so it
          stays empty until the agency's plan actually includes a score widget — a logo with
          no rating on it would take the slot and tell a traveller nothing. The slot collapses
          to zero width when empty (see .trustpilotSlot:empty). */}
      {blockOn('trustpilot') && (
      <div className={styles.trustpilotSlot}>
        <Trustpilot template={SCORE_TEMPLATE} showPlaceholder={false} />
      </div>
      )}

      {/* Language, then the auth buttons. Before them on purpose: somebody who
          cannot read the page needs to fix that before they can sign in. */}
      {showLanguage && (
      <div className={styles.langSlot}>
        <LanguageSwitch />
      </div>
      )}

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
                {user?.firstName || accountLabel}
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
                  { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: t('nav.myBookings', 'My Bookings'), path: '/account/bookings' },
                  { icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z', label: t('nav.profile', 'Profile'), path: '/account/profile' },
                  { icon: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', label: t('nav.favourites', 'Favourites'), path: '/account/favourites' },
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
        ) : showAccountEntry && (
          <div className={styles.authBtns}>
            {/* One pill carrying both ways in, split by a slash, rather than a quiet text
                link beside a loud orange button. Still TWO links inside it: sign in and
                register are different destinations, and collapsing them into a single
                control would make the traveller pick again on the next screen. The slash
                is aria-hidden so a screen reader reads two plain links, not "slash". */}
            <Link to={loginHref} className={styles.authPillLink}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {t('nav.signIn', 'Sign In')}
            </Link>
            <span className={styles.authPillSlash} aria-hidden="true">/</span>
            <Link to="/register" className={styles.authPillLink}>
              {t('nav.register', 'Register')}
            </Link>
          </div>
        )}
      </div>

      {/* Hamburger */}
      <button
        className={`${styles.hamburger} ${dark ? styles.hamburgerDark : styles.hamburgerLight}`}
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={t('nav.menu', 'Menu')}
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
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className={styles.mobile}>
          {showHeaderSearch && (
            <div className={styles.mobileSearch}>
              <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} />
            </div>
          )}
          <div className={styles.mobileLinks}>
            {customMobileLinks.length > 0 ? customMobileLinks.map((item) => (
              <button
                key={item.id ?? item.itemName}
                className={`${styles.mobileLink} ${item.linkTarget === location.pathname ? styles.mobileLinkActive : ''}`}
                onClick={() => openCmsLink(item)}
              >
                {item.itemName}
              </button>
            )) : SERVICES.map((l) => (
              <button
                key={l.path}
                className={`${styles.mobileLink} ${l.match.includes(location.pathname) ? styles.mobileLinkActive : ''}`}
                onClick={() => { navigate(l.path); setMobileOpen(false); }}
              >
                {l.icon}
                {t(`nav.services.${l.key}`, l.label)}
              </button>
            ))}
          </div>
          {showLanguage && (
          <div className={styles.mobileLang}>
            <LanguageSwitch compact />
          </div>
          )}

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
              <button className={styles.mobileLink} onClick={() => { navigate('/account/bookings'); setMobileOpen(false); }}>{t('nav.myBookings', 'My Bookings')}</button>
              <button className={styles.mobileLink} onClick={() => { navigate('/account/profile'); setMobileOpen(false); }}>{t('nav.profile', 'Profile')}</button>
              <button className={styles.mobileLogout} onClick={handleLogout}>{t('nav.signOut', 'Sign Out')}</button>
            </div>
          ) : showAccountEntry && (
            <div className={styles.mobileAuth}>
              <button className={styles.mobileSignIn} onClick={() => { navigate(loginHref); setMobileOpen(false); }}>{t('nav.signIn', 'Sign In')}</button>
              <button className={styles.mobileRegister} onClick={() => { navigate('/register'); setMobileOpen(false); }}>
                {t('nav.registerQuick', "Register — it's quick!")}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
