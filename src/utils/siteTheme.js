// Website colours chosen in the dashboard (CMS > Homepage > Colours). The CMS stores
// { token: '#rrggbb' }; each token sets one or more CSS variables on <html>, and an empty or
// missing token leaves the built-in colour from index.css alone. The keys must match the
// admin's list (frontend/src/screens/CMS/Layout/HomepageSettings/themeColors.js).

const HEX = /^#[0-9a-fA-F]{6}$/;
const STORAGE_KEY = 'sunsky.siteTheme';

// Per-element colours: one token, one CSS variable (or a few), the element keeps its own
// colour without it. Grouped the way the homepage runs, top to bottom.
export const ONE_TO_ONE = {
  // Header
  stripBtnBg: '--strip-btn-bg', stripBtnText: '--strip-btn-ink',
  navIcon: '--nav-icon', navHover: '--nav-hover',
  authBtnBg: '--btn-auth-bg', authBtnText: '--btn-auth-ink',
  // Hero and search
  heroBadgeBg: '--hero-badge-bg', heroBadgeText: '--hero-badge-ink',
  heroTabBg: '--tab-active-bg', heroTabText: '--tab-active-ink',
  heroTabIdleBg: '--tab-idle-bg', heroTabIdleText: '--tab-idle-ink',
  searchBarBg: '--searchbar-bg', searchIcon: '--search-icon',
  searchBtnBg: '--btn-search-bg', searchBtnText: '--btn-search-ink',
  popupBtnBg: '--popup-btn-bg', popupBtnText: '--popup-btn-ink',
  // Moving strip and guarantee bar
  marqueeBg: '--marquee-bg', marqueeText: '--marquee-ink', marqueeIconBg: '--marquee-check-bg', marqueeIcon: '--marquee-check-ink',
  trustBarBg: '--trustbar-bg', trustBarText: '--trustbar-ink', trustBarBtnBg: '--trustbar-btn-bg', trustBarBtnText: '--trustbar-btn-ink',
  // Section headings and "Show all"
  eyebrowText: '--eyebrow-ink', scriptText: '--accent-script',
  showAllBg: '--showall-bg', showAllText: '--showall-ink',
  // Sections
  catBg: '--cat-bg', catChipBg: '--cat-chip-bg', catChipText: '--cat-chip-ink',
  destSectionBg: '--dest-section-bg', destTabBg: '--dest-tab-bg', destTabText: '--dest-tab-ink',
  destTabIdleBg: '--dest-tab-idle-bg', destTabIdleText: '--dest-tab-idle-ink',
  destBadgeBg: '--dest-badge-bg', destBadgeText: '--dest-badge-ink',
  statsBg: '--stats-bg',
  vacBg: '--vac-bg', vacChipBg: '--vac-chip-bg', vacChipText: '--vac-chip-ink', vacLinkText: '--link-vac',
  hotelsBg: '--hotels-bg', railBtnBg: '--rail-btn-bg', railBtnText: '--rail-btn-ink',
  dealBtnBg: '--btn-deal-bg', dealBtnText: '--btn-deal-ink', hotelPrice: '--hotel-price',
  popDestBg: '--popdest-bg', viewAllText: '--link-viewall',
  trustBg: ['--trust-bg', '--trust-tint'], trustIconBg: '--trust-icon-bg', trustIcon: '--trust-icon-ink',
  trustArrowBg: '--trust-arrow-bg', trustArrowText: '--trust-arrow-ink',
  newsletterBg: '--news-bg', newsletterPanel: '--news-panel',
  newsletterBtnBg: '--btn-news-bg', newsletterBtnText: '--btn-news-ink',
  // Footer
  footerHeading: '--footer-heading', footerHover: '--footer-hover',
};

// Hover shades worked out from a picked button colour, so a hover never jumps back to the old
// colour: [variable, % of the picked colour, mixed with].
const HOVERS = {
  stripBtnBg: ['--strip-btn-hover', 85, '#fff'],
  popupBtnBg: ['--popup-btn-hover', 88, '#000'],
  showAllBg: ['--showall-hover', 92, '#000'],
  catChipBg: ['--cat-chip-hover', 92, '#000'],
  trustArrowBg: ['--trust-arrow-hover', 90, '#000'],
};

const varsOf = (name) => (Array.isArray(name) ? name : [name]);

const mix = (hex, pct, other) => `color-mix(in srgb, ${hex} ${pct}%, ${other})`;

// Every CSS variable a theme can set, so clearing a token takes its colour away again.
export const THEME_VARS = [
  '--cta-grad', '--cta-ink', '--blue-deep', '--blue-mid', '--sun-orange',
  '--strip-bg', '--strip-ink', '--nav-bg', '--nav-ink', '--text', '--text-sec',
  '--dark', '--dark2', '--footer-bg', '--footer-ink', '--page-bg',
  ...Object.values(ONE_TO_ONE).flatMap(varsOf),
  ...Object.values(HOVERS).map(([name]) => name),
];

/** The CSS variables a stored theme sets. Pure, so it can be tested without a DOM. */
export function themeVariables(theme) {
  const t = {};
  for (const [k, v] of Object.entries(theme && typeof theme === 'object' ? theme : {})) {
    if (typeof v === 'string' && HEX.test(v)) t[k] = v;
  }
  const vars = {};
  // Buttons: the orange gradient. One colour picked keeps a gentle ramp from it.
  if (t.buttonFrom || t.buttonTo) {
    const from = t.buttonFrom || mix(t.buttonTo, 80, '#000');
    const to = t.buttonTo || mix(t.buttonFrom, 80, '#fff');
    vars['--cta-grad'] = `linear-gradient(135deg, ${from}, ${to})`;
  }
  if (t.buttonText) vars['--cta-ink'] = t.buttonText;
  if (t.primary) {
    vars['--blue-deep'] = t.primary;
    vars['--blue-mid'] = mix(t.primary, 85, '#fff');
  }
  if (t.accent) vars['--sun-orange'] = t.accent;
  if (t.stripBg) vars['--strip-bg'] = t.stripBg;
  if (t.stripText) vars['--strip-ink'] = t.stripText;
  if (t.navBg) vars['--nav-bg'] = mix(t.navBg, 92, 'transparent');
  if (t.navText) vars['--nav-ink'] = t.navText;
  if (t.headingText) vars['--text'] = t.headingText;
  if (t.bodyText) vars['--text-sec'] = t.bodyText;
  if (t.darkBg) {
    vars['--dark'] = t.darkBg;
    vars['--dark2'] = mix(t.darkBg, 88, '#fff');
  }
  if (t.footerBg) vars['--footer-bg'] = t.footerBg;
  if (t.footerText) vars['--footer-ink'] = t.footerText;
  if (t.pageBg) vars['--page-bg'] = t.pageBg;
  for (const [key, name] of Object.entries(ONE_TO_ONE)) {
    if (t[key]) for (const v of varsOf(name)) vars[v] = t[key];
  }
  for (const [key, [name, pct, other]] of Object.entries(HOVERS)) if (t[key]) vars[name] = mix(t[key], pct, other);
  return vars;
}

/** Puts a theme on <html>, removing whatever a previous theme set and this one does not. */
export function applySiteTheme(theme, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return;
  const vars = themeVariables(theme);
  for (const name of THEME_VARS) {
    if (vars[name]) root.style.setProperty(name, vars[name]);
    else root.style.removeProperty(name);
  }
}

// The last theme seen, so the next visit paints in the right colours before the CMS answers.
export function rememberSiteTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme || {})); } catch { /* storage off */ }
}

export function storedSiteTheme() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

// ── Preview of unsaved colours ───────────────────────────────────────────────────────────
// CMS > Homepage > Website Colours > "Preview on website" opens the site with
// ?themePreview=<base64url JSON>. Only that browser tab shows the colours (sessionStorage), it
// is never remembered as the real theme, and "Close preview" ends it.
const PREVIEW_PARAM = 'themePreview';
const PREVIEW_KEY = 'sunsky.themePreview';

/** base64url JSON from the dashboard to { token: '#rrggbb' }; null when it is not one. */
export function decodeThemePreview(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 8000) return null;
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const obj = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/^[a-zA-Z0-9]{1,40}$/.test(k) && typeof v === 'string' && HEX.test(v)) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** The preview this tab is showing: a fresh one from the address bar wins over a kept one. */
export function activeThemePreview(search = typeof window !== 'undefined' ? window.location.search : '') {
  let fromUrl = null;
  try { fromUrl = decodeThemePreview(new URLSearchParams(search).get(PREVIEW_PARAM)); } catch { /* bad URL */ }
  try {
    if (fromUrl) {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const kept = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || 'null');
    return kept && typeof kept === 'object' ? kept : null;
  } catch {
    return fromUrl;
  }
}

export function clearThemePreview() {
  try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* storage off */ }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(PREVIEW_PARAM)) {
      url.searchParams.delete(PREVIEW_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* no window */ }
}
