import { useState, useEffect, useRef, useMemo, useId } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import { resolveBrandLogo, BUNDLED_LOGO } from '../../hooks/useBrandLogo';
import { resolveCmsImageUrl } from '../../utils/cmsImage';
import styles from './Navbar.module.css';
import { useHomepageConfig, useHeaderConfig, useHolidayTypes } from '../../api';
import { groupLinkUrl, groupLinkLabel } from '../../utils/cmsDestinations';
import { hotelDetailHref } from '../../utils/searchDefaults';
import { normalizeSiteHeader, pick, langOf, headerLink, newTabProps, showOnClass, inDrawer, MAX_MENU_ITEMS } from '../../utils/siteHeader';
import { isEmoji, isGlyph } from '../../utils/travelIcons';
import { TravelEmoji, TravelGlyph } from '../../components/TravelIcon/TravelIcon';
import DestinationSearch from '../../components/DestinationSearch/DestinationSearch';
import Trustpilot from '../../components/Trustpilot/Trustpilot';
import TrustpilotBadge from '../../components/Trustpilot/TrustpilotBadge';
import { SCORE_TEMPLATE, TRUSTPILOT_ENABLED } from '../../components/Trustpilot/trustpilotConfig';
import { useConsent } from '../../context/ConsentContext';
import HeaderMenu from './HeaderMenu';
import AnnouncementBar from './AnnouncementBar';
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
// A dashboard menu with no glyph chosen: four tiles, which says "a set of things" without
// claiming to be about any one subject the way a globe or a sun would.
const MenuGrid = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
// A row in a dashboard menu with no emoji chosen: an arrow out of a box, i.e. "a link".
const MenuLinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" /></svg>
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

// The support button's four looks (CMS -> Header -> Support -> Icon). Same 18px stroke set as
// the handset it started with, so changing the icon never changes the button's weight.
const SUPPORT_ICONS = {
  phone: <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></>,
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
const SERVICE_BY_KEY = new Map(SERVICES.map((s) => [s.key, s]));

// The signed-in menu's three entries (CMS -> Header -> Account -> Menu items decides which
// show, in what order, and what they are called).
const ACCOUNT_ITEMS = {
  bookings: { path: '/account/bookings', i18n: ['nav.myBookings', 'My Bookings'], icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  profile: { path: '/account/profile', i18n: ['nav.profile', 'Profile'], icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z' },
  favourites: { path: '/account/favourites', i18n: ['nav.favourites', 'Favourites'], icon: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z' },
};

function getInitials(user) {
  if (!user) return 'U';
  const name = user.firstName || user.name || user.email || '';
  return name.slice(0, 2).toUpperCase() || 'U';
}

// A dropdown menu in the phone menu: its name as a row that opens to the menu's own entries.
// Closed by default, so the drawer still leads with the four services and the browse menus
// cost one row each until someone asks for them.
function MobileMenuGroup({ menu, onClose }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const row = (it, className, content) => (it.href ? (
    <a key={it.key} className={className} href={it.href} {...newTabProps(it.newTab)} onClick={onClose}>{content}</a>
  ) : (
    <button key={it.key} type="button" className={className} onClick={it.onPick}>{content}</button>
  ));
  return (
    <div className={styles.mobileGroup}>
      <button
        type="button"
        className={`${styles.mobileLink} ${styles.mobileGroupBtn}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {menu.buttonIcon}
        <span className={styles.mobileGroupLabel}>{menu.label}</span>
        <svg
          className={`${styles.mobileGroupChevron} ${open ? styles.mobileGroupChevronUp : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={listId} className={styles.mobileGroupList}>
          {menu.items.map((it) => row(it, styles.mobileSubLink, (
            <>
              <span className={styles.mobileSubIcon}>{it.icon}</span>
              <span className={styles.mobileSubText}>
                <span className={styles.mobileSubMain}>{it.label}</span>
                {it.sub && <span className={styles.mobileSubSub}>{it.sub}</span>}
              </span>
            </>
          )))}
          {menu.footer && row({ ...menu.footer, key: '__footer' }, styles.mobileSubFooter, (
            <>
              {menu.footer.label}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  // Every call carries the English as its default, so a key with no translation
  // yet renders readable text rather than a raw `nav.signIn`.
  const { t, i18n }  = useTranslation('common');
  const lang       = i18n.resolvedLanguage || i18n.language;
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

  // CMS → Layout → Header. Everything below the logo reads from this one object, which is
  // ALWAYS complete: utils/siteHeader.js turns the version 2 payload, a version 1 payload, a
  // backend that predates both, or a config call that failed, into the same shape. With no
  // settings at all it describes exactly the bar this was before it was configurable.
  //
  // Copy is bilingual ({ nl, en }); `pick` shows the visitor's language and, where the field
  // has one, falls back to the site's own translated default rather than to the other
  // language, so an empty field never shows Dutch to an English reader or the reverse.
  const header = useMemo(() => normalizeSiteHeader(headerConfig), [headerConfig]);
  const { announcement, menus, search, support, trustpilot, language, account, mobileMenu } = header;
  // CMS wordmark image (the brand name beside the icon). A broken image falls back to the text.
  const wordmarkSrc = resolveCmsImageUrl(header.wordmark?.url);
  const [wordmarkFailed, setWordmarkFailed] = useState(false);
  useEffect(() => { setWordmarkFailed(false); }, [wordmarkSrc]);
  // The live star score needs all three: an account id, a score widget the plan allows, and the
  // visitor's consent to the widget's iframe. Anything less shows TrustpilotBadge instead.
  const { has: hasConsent } = useConsent();
  const liveTrustScore = TRUSTPILOT_ENABLED && Boolean(SCORE_TEMPLATE) && hasConsent('external_media');

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

  // The header search (cluster on desktop, in-drawer on mobile) rides on every screen, the
  // hotel detail page included. That page's own form only prices the stay already open, so
  // a traveller who wanted a different destination used to have to go back to find one.
  // Login/register render without this layout anyway, but they stay excluded explicitly so
  // the intent is clear if that ever changes.
  const showHeaderSearch =
    search.enabled &&
    location.pathname !== '/login' &&
    location.pathname !== '/register';
  // The phone menu's copy of it: also needs the drawer to want a search box, and the search
  // not to be a desktop-only block.
  const showDrawerSearch = showHeaderSearch && mobileMenu.showSearch && inDrawer(search.showOn);
  // The dashboard's placeholder in the visitor's language, or DestinationSearch's own
  // translated default (undefined hands the choice back to it). The same rule as `pick` with
  // that default as the fallback, without restating the default here.
  const searchPlaceholder = search.placeholder[langOf(lang)] || undefined;

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
  // De-duped by label. The group each entry came from becomes its menu sublabel. The first
  // `maxItems` fill the header menu when its source is the homepage; the first 6 double as the
  // search's idle chips and typewriter names whatever the menu's source is.
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
        if (out.length >= MAX_MENU_ITEMS) return out;
      }
    }
    return out;
  }, [cmsConfig, allTypes]);
  const searchSuggestions = useMemo(
    () => (search.showSuggestions ? popularDests.slice(0, 6) : []),
    [popularDests, search.showSuggestions],
  );

  // Top holiday types for the right-hand menu, as { title, slug, sub, icon }.
  //
  // When the backend serves siteHeader, its `resolved` list IS the menu: the dashboard's
  // choice (CMS → Header → Holiday Types Menu), already filtered server side to ACTIVE types
  // and capped. The derivation below is only the fallback for a backend that sends none: the
  // CMS featured list leads (dashboard order), topped up from the full admin list.
  const holidayTypesMenu = menus.holidayTypes;
  const topHolidayTypes = useMemo(() => {
    if (!holidayTypesMenu.enabled) return [];
    if (Array.isArray(holidayTypesMenu.resolved)) {
      return holidayTypesMenu.resolved.map((r) => ({
        title: pick(r.label, lang, r.name),
        slug: r.slug,
        sub: pick(r.sub, lang),
        icon: r.icon,
      }));
    }
    const cap = holidayTypesMenu.maxItems;
    const seen = new Set();
    const out = [];
    // De-duped by name AND by the page it opens: a featured card titled "Hotel only" and the
    // type it resolves to ("Alleen hotelverblijf", slug hotel-only) are one entry, not two rows
    // to the same page.
    const push = (title, slug) => {
      const key = slugify(title);
      const to = slug || key;
      if (!title || !key || seen.has(key) || seen.has(`/${to}`)) return;
      seen.add(key);
      seen.add(`/${to}`);
      out.push({ title, slug: to, sub: '', icon: '' });
    };
    // A featured entry is resolved against the LIVE type list before it is linked, exactly as
    // the homepage Categories cards do it. Its `title` is dashboard copy and is often not the
    // type's name — "Sun Holidays" is the type whose slug is `zonvakanties`, "City Trip" is
    // `stedentrips` — so the slug this used to invent from the title led to a page that does
    // not exist. Two of the four live entries were landing nowhere.
    const liveById = new Map((allTypes ?? []).map((ty) => [String(ty.id), ty]));
    const liveByName = new Map((allTypes ?? []).map((ty) => [slugify(ty.name), ty]));
    for (const f of cmsConfig?.featuredHolidayTypes ?? []) {
      if (f && f.active !== false && f.title) {
        const live = liveById.get(String(f.holidayTypeId)) || liveByName.get(slugify(f.title));
        // Only when it resolves. An entry naming a type that no longer exists has no page to
        // open, and a menu row that goes nowhere is worse than one row fewer. Until the type
        // list has loaded nothing resolves, which is already true of the top-up loop below,
        // so the menu simply waits rather than offering dead links.
        if (live) push(f.title, live.slug);
      }
      if (out.length >= cap) return out;
    }
    for (const ty of allTypes ?? []) {
      push(ty.name, ty.slug);
      if (out.length >= cap) break;
    }
    return out;
  }, [cmsConfig, allTypes, holidayTypesMenu, lang]);

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

  // A menu row's link in HeaderMenu's terms: a path on this site becomes a router pick, and
  // anything else (another site, mailto:, tel:, an #anchor, a new tab) a real href. null when
  // the dashboard's link is not one the site will open, which drops the row.
  const menuLink = (url, newTab = false) => {
    const link = headerLink(url, newTab);
    if (!link) return null;
    return link.router ? { onPick: () => goToSuggestion(link.href) } : { href: link.href, newTab: link.newTab };
  };
  const withLink = (row) => {
    const link = menuLink(row.url, row.newTab);
    return link ? { key: row.key, label: row.label, sub: row.sub, icon: row.icon, ...link } : null;
  };
  // The emoji the dashboard picked for a row, or the built-in icon it had before it could.
  // A name the catalogue does not know is treated as unset rather than drawn as an empty tile.
  const rowIcon = (name, fallback) =>
    (name && isEmoji(name) ? <TravelEmoji name={name} className={styles.hmItemEmoji} /> : fallback);
  const footerOf = (menu) => {
    const f = menu.footerLink;
    if (!f?.enabled) return null;
    const link = menuLink(f.url);
    return link ? { label: pick(f.label, lang, t('nav.seeAll', 'See all')), ...link } : null;
  };

  // Every dropdown menu, in the dashboard's order (menuOrder), as the desktop bar and the phone
  // menu both draw it: { key, label, buttonIcon, tally, items, footer, showOn }. A menu that is
  // off, or ends up with no rows, is not in the list at all, so neither surface draws an empty
  // button.
  const destinationsMenu = menus.destinations;
  const menuList = header.menuOrder.map((key) => {
    if (key === 'destinations') {
      const m = destinationsMenu;
      if (!m.enabled) return null;
      const rows = m.source === 'manual'
        ? m.items.filter((it) => it.active).map((it) => {
            // The dashboard's name for the row, in either language, before the place's own name:
            // a typed label is always closer to what the editor meant than the catalogue's.
            const label = pick(it.label, lang) || it.dest?.name || '';
            const url = it.url || groupLinkUrl(
              { label, dest: it.dest, boardCode: it.boardCode, holidayTypeId: it.holidayTypeId },
              allTypes,
            );
            return { key: it.id, label, sub: pick(it.sub, lang), icon: rowIcon(it.icon, <MenuPin />), url };
          })
        : popularDests.map((d) => ({
            key: d.label,
            label: d.label,
            sub: m.showGroupAsSub ? d.sub : '',
            icon: <MenuPin />,
            url: d.url,
          }));
      const items = rows.filter((r) => r.label).map(withLink).filter(Boolean).slice(0, m.maxItems);
      return {
        key,
        label: pick(m.label, lang, t('nav.popularDestinations', 'Popular destinations')),
        buttonIcon: <MenuGlobe />,
        tally: t('nav.destinations', {
          count: items.length,
          defaultValue_one: '{{count}} destination',
          defaultValue_other: '{{count}} destinations',
        }),
        items,
        footer: footerOf(m),
        showOn: m.showOn,
      };
    }
    if (key === 'holidayTypes') {
      const m = holidayTypesMenu;
      if (!m.enabled) return null;
      // The row's own sub-label, then the menu's, then the site's "Explore holidays".
      const defaultSub = pick(m.sub, lang) || t('nav.exploreHolidays', 'Explore holidays');
      // `type`, not `t`: the parameter was called `t` and shadowed the
      // translation function, so `t(...)` inside it called a holiday-type
      // object. It only crashed where the CMS actually returns types.
      const items = topHolidayTypes.map((type) => withLink({
        key: type.slug,
        label: type.title,
        sub: type.sub || defaultSub,
        icon: rowIcon(type.icon, typeIconFor(type.title)),
        url: `/holidays/${type.slug}`,
      })).filter(Boolean);
      return {
        key,
        label: pick(m.label, lang, t('nav.holidayTypes', 'Holiday types')),
        buttonIcon: <TypeSun />,
        tally: t('nav.holidayTypes', {
          count: items.length,
          defaultValue_one: '{{count}} holiday type',
          defaultValue_other: '{{count}} holiday types',
        }),
        items,
        footer: footerOf(m),
        showOn: m.showOn,
      };
    }
    const m = menus.custom.find((c) => `custom:${c.id}` === key);
    if (!m || !m.enabled) return null;
    const items = m.items.filter((it) => it.active).map((it) => withLink({
      key: it.id,
      label: pick(it.label, lang),
      sub: pick(it.sub, lang),
      icon: rowIcon(it.icon, <MenuLinkIcon />),
      url: it.url,
      newTab: it.newTab,
    })).filter((it) => it && it.label);
    return {
      key,
      label: pick(m.label, lang),
      buttonIcon: m.glyph && isGlyph(m.glyph) ? <TravelGlyph name={m.glyph} className={styles.hmGlyph} /> : <MenuGrid />,
      // Not "destinations" or "holiday types": a dashboard menu can hold anything.
      tally: t('nav.links', {
        count: items.length,
        defaultValue_one: '{{count}} link',
        defaultValue_other: '{{count}} links',
      }),
      items,
      footer: footerOf(m),
      showOn: m.showOn,
    };
  }).filter((m) => m && m.label && m.items.length > 0);
  const drawerMenus = mobileMenu.showMenus ? menuList.filter((m) => inDrawer(m.showOn)) : [];

  // The phone menu's own rows (CMS → Header → Mobile menu). A built-in row keeps its icon,
  // its translated name and the pages it lights up on, unless the dashboard overrides them; a
  // row the dashboard added has what the dashboard gave it.
  const mobileRows = mobileMenu.items.filter((it) => it.active).map((it) => {
    const service = it.key ? SERVICE_BY_KEY.get(it.key) : null;
    const label = service
      ? pick(it.label, lang, t(`nav.services.${service.key}`, service.label))
      : pick(it.label, lang);
    const link = headerLink(it.url, it.newTab);
    if (!label || !link) return null;
    const icon = it.icon && isEmoji(it.icon)
      ? <TravelEmoji name={it.icon} className={styles.mobileEmoji} />
      : service?.icon ?? null;
    // A service on its own page keeps the pages it always matched (Holidays is also /results).
    const matches = service && link.href === service.path ? service.match : [link.href];
    return { key: it.id, label, icon, link, active: link.router && matches.includes(location.pathname) };
  }).filter(Boolean);

  // Account (CMS → Header → Account). The way IN is the dashboard's to switch off or relabel;
  // a signed-in visitor always keeps the avatar menu, because that is where signing out is.
  const signInLink = headerLink(account.signInUrl) || { href: '/login', router: true, newTab: false };
  const registerLink = account.register.enabled ? headerLink(account.register.url) : null;
  const signInLabel = pick(account.signInLabel, lang, t('nav.signIn', 'Sign In'));
  const accountName = user?.firstName || pick(account.fallbackName, lang, t('nav.myAccount', 'My Account'));
  const accountItems = account.menuItems
    .filter((m) => m.enabled && ACCOUNT_ITEMS[m.key])
    .map((m) => {
      const item = ACCOUNT_ITEMS[m.key];
      return { key: m.key, path: item.path, icon: item.icon, label: pick(m.label, lang, t(...item.i18n)) };
    });
  const showGuestEntry = account.enabled;
  const showDrawerGuestEntry = account.enabled && inDrawer(account.showOn);

  // A link that may be a router path or a real anchor, in the bar's own markup.
  const barLink = (link, props, children) => (link.router
    ? <Link to={link.href} {...props}>{children}</Link>
    : <a href={link.href} {...newTabProps(link.newTab)} {...props}>{children}</a>);
  // The same for the drawer's buttons: a path goes through the router and closes the drawer,
  // anything else is an anchor that closes it on the way out.
  // `key` travels on its own: React does not read it out of a spread.
  const drawerLink = (link, props, children, key) => (link.router
    ? <button key={key} type="button" {...props} onClick={() => goToSuggestion(link.href)}>{children}</button>
    : <a key={key} href={link.href} {...newTabProps(link.newTab)} {...props} onClick={() => setMobileOpen(false)}>{children}</a>);

  const supportLink = support.enabled ? headerLink(support.link, support.newTab) : null;
  const supportLabel = pick(support.label, lang, t('nav.customerService', 'Klantendienst'));

  return (
    <>
    <AnnouncementBar announcement={announcement} />
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
        {!isWordmark && (wordmarkSrc && !wordmarkFailed ? (
          <img
            src={wordmarkSrc}
            alt={header.wordmark?.alt || logoAlt}
            className={styles.wordmarkImg}
            onError={() => setWordmarkFailed(true)}
          />
        ) : (
          <span className={`${styles.logoText} ${dark ? styles.logoDark : styles.logoLight}`}>
            Sun<span className={styles.logoAccent}>Sky</span>
          </span>
        ))}
      </Link>
      {/* The browse menus, in the dashboard's order. Every panel drops from the left of its
          button, so all of them draw their golden thread the same way; "right" belonged to the
          menu that used to sit at the cluster's right edge. */}
      {menuList.map((m) => (
        <HeaderMenu
          key={m.key}
          label={m.label}
          buttonIcon={m.buttonIcon}
          tally={m.tally}
          align="left"
          items={m.items}
          footer={m.footer}
          className={showOnClass(m.showOn, styles)}
        />
      ))}
      </div>

      {/* Centered search. A REAL flex child between the logo and the auth
          block (not absolutely positioned) so the browser's own layout fills the gap between
          them — it can never overlap either side, on any resize, with no JS measurement. Hidden
          on mobile, where it moves into the drawer. */}
      {showHeaderSearch && (
        <div className={`${styles.headerSearch} ${showOnClass(search.showOn, styles)}`}>
          <div className={styles.searchGrow}>
            <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} placeholder={searchPlaceholder} />
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

          It opens the help centre (/faq) by default, not /contact: the questions there answer
          most of what people ring about, and the FAQ page carries the ways to reach a human
          anyway. The dashboard can point it anywhere (a tel: link, a chat page) and change the
          icon to match. */}
      {supportLink && barLink(
        supportLink,
        {
          className: `${styles.contactBtn} ${showOnClass(support.showOn, styles)}`,
          'aria-label': supportLabel,
          title: supportLabel,
        },
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {SUPPORT_ICONS[support.icon] || SUPPORT_ICONS.phone}
          </svg>
          {/* aria-hidden: the label repeats the accessible name the link already carries, so
              without this a screen reader announces it twice. */}
          {support.showLabel && <span className={styles.contactLabel} aria-hidden="true">{supportLabel}</span>}
        </>,
      )}

      {/* Reviews, switched on in CMS -> Layout -> Header. The live star score when it can be
          drawn: a score widget is configured (a paid Trustpilot plan) and the visitor allowed
          the external-media cookies its iframe needs. Otherwise the plain badge that links to
          the review profile, so the switch always shows something and never an invented
          rating. It used to render nothing in that case, which on the free plan meant the
          dashboard's switch did nothing at all. */}
      {trustpilot.enabled && (
      <div className={`${styles.trustpilotSlot} ${showOnClass(trustpilot.showOn, styles)}`}>
        {liveTrustScore
          ? <Trustpilot template={SCORE_TEMPLATE} showPlaceholder={false} />
          : <TrustpilotBadge />}
      </div>
      )}

      {/* Language, then the auth buttons. Before them on purpose: somebody who
          cannot read the page needs to fix that before they can sign in. */}
      {language.enabled && (
      <div className={`${styles.langSlot} ${showOnClass(language.showOn, styles)}`}>
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
              aria-expanded={dropOpen}
            >
              <div className={styles.avatarCircle}>{getInitials(user)}</div>
              <span className={`${styles.avatarName} ${dark ? styles.avatarNameDark : styles.avatarNameLight}`}>
                {accountName}
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
                {accountItems.map((item) => (
                  <button key={item.key} className={styles.dropItem} onClick={() => { navigate(item.path); setDropOpen(false); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d={item.icon}/>
                    </svg>
                    {item.label}
                  </button>
                ))}
                {accountItems.length > 0 && <div className={styles.dropDivider} />}
                <button className={styles.dropLogout} onClick={handleLogout}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  {t('nav.signOut', 'Sign Out')}
                </button>
              </div>
            )}
          </div>
        ) : showGuestEntry && (
          <div className={`${styles.authBtns} ${showOnClass(account.showOn, styles)}`}>
            {/* One pill carrying both ways in, split by a slash, rather than a quiet text
                link beside a loud orange button. Still TWO links inside it: sign in and
                register are different destinations, and collapsing them into a single
                control would make the traveller pick again on the next screen. The slash
                is aria-hidden so a screen reader reads two plain links, not "slash". With
                registration switched off it is the sign-in link alone, and no slash. */}
            {barLink(signInLink, { className: styles.authPillLink }, (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {signInLabel}
              </>
            ))}
            {registerLink && (
              <>
                <span className={styles.authPillSlash} aria-hidden="true">/</span>
                {barLink(registerLink, { className: styles.authPillLink }, pick(account.register.label, lang, t('nav.register', 'Register')))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Hamburger */}
      <button
        className={`${styles.hamburger} ${dark ? styles.hamburgerDark : styles.hamburgerLight}`}
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={t('nav.menu', 'Menu')}
        aria-expanded={mobileOpen}
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
          {showDrawerSearch && (
            <div className={styles.mobileSearch}>
              <DestinationSearch onSelect={goToSearchResult} onGo={goToSuggestion} suggestions={searchSuggestions} placeholder={searchPlaceholder} />
            </div>
          )}
          <div className={styles.mobileLinks}>
            {mobileRows.map((row) => drawerLink(
              row.link,
              { className: `${styles.mobileLink} ${row.active ? styles.mobileLinkActive : ''}` },
              <>
                {row.icon}
                {row.label}
              </>,
              row.key,
            ))}
            {drawerMenus.map((m) => (
              <MobileMenuGroup key={m.key} menu={m} onClose={() => setMobileOpen(false)} />
            ))}
          </div>
          {language.enabled && inDrawer(language.showOn) && (
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
              {accountItems.map((item) => (
                <button key={item.key} className={styles.mobileLink} onClick={() => { navigate(item.path); setMobileOpen(false); }}>{item.label}</button>
              ))}
              <button className={styles.mobileLogout} onClick={handleLogout}>{t('nav.signOut', 'Sign Out')}</button>
            </div>
          ) : showDrawerGuestEntry && (
            <div className={styles.mobileAuth}>
              {drawerLink(signInLink, { className: styles.mobileSignIn }, signInLabel)}
              {registerLink && drawerLink(
                registerLink,
                { className: styles.mobileRegister },
                pick(account.register.label, lang, t('nav.registerQuick', "Register, it's quick!")),
              )}
            </div>
          )}
        </div>
      )}
    </header>
    </>
  );
}
