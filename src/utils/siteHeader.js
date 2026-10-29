/**
 * The header settings (CMS -> Layout -> Header) as the bar draws them.
 *
 * The admin backend serves `headerConfig.siteHeader`, already normalised to version 2, from
 * backend/controllers/layout/siteHeader.js. This file mirrors that normaliser on purpose, for
 * three situations the bar has to survive without looking any different:
 *
 *  - production still serves VERSION 1 (flat popularDestinations / holidayTypes / support with
 *    plain-string labels), and the website can deploy before the backend does;
 *  - a backend older than siteHeader serves the header row without it;
 *  - the config call fails or has not answered yet (null).
 *
 * Whatever comes in, the bar gets one complete version 2 object and never has to ask "is this
 * key there?". Version 1 is upgraded exactly the way the backend upgrades a stored row, so the
 * two can never disagree about what an old row means. Keep the DEFAULTS here in step with the
 * backend's: a setting that defaults differently in the two places looks fine in the dashboard
 * preview and wrong on the site.
 *
 * Two parts are computed by the SERVER and only read here:
 *  - `announcement.live`: switched on, has text, today (Brussels) inside the date window. The
 *    website's clock is the visitor's, so it does not second-guess the date; absent means off.
 *  - `menus.holidayTypes.resolved`: the ACTIVE types the menu shows, in order, capped. `null`
 *    here means the server sent none (no siteHeader at all), and the bar derives the list the
 *    way it did before the header was configurable.
 *
 * Text a visitor reads is bilingual, { nl, en }; `pick` chooses the language.
 */
import { resolveCmsLink } from './cmsLink';

export const SITE_HEADER_VERSION = 2;

export const MAX_MENU_ITEMS = 12;
export const MAX_CUSTOM_MENUS = 3;
export const MAX_MOBILE_ITEMS = 12;
const MAX_LABEL = 60;
const MAX_SUB = 80;
const MAX_TEXT = 200;
const MAX_URL = 500;

export const SHOW_ON = ['all', 'desktop', 'mobile'];
export const ANNOUNCEMENT_TONES = ['orange', 'blue', 'dark', 'green'];
export const SUPPORT_ICONS = ['phone', 'help', 'chat', 'mail'];
export const DESTINATION_SOURCES = ['homepage', 'manual'];
export const HOLIDAY_TYPE_SOURCES = ['auto', 'manual'];
export const ACCOUNT_MENU_KEYS = ['bookings', 'profile', 'favourites'];

// The phone menu's built-in rows. `url` is the default; the dashboard may override it.
export const SERVICE_ITEMS = [
  { key: 'holidays', url: '/' },
  { key: 'flights', url: '/flights' },
  { key: 'hotels', url: '/hotels' },
  { key: 'transfers', url: '/transfers' },
];
const SERVICE_URL = new Map(SERVICE_ITEMS.map((s) => [s.key, s.url]));

// ─── primitives (the backend's, line for line) ───────────────────────────────

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
// Icon and glyph names from the travel icon catalogue: lowercase words joined by dashes.
const iconName = (v) => {
  const s = str(v, 64).toLowerCase();
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) ? s : '';
};
const isoDate = (v) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

/**
 * Paths, anchors and absolute links that only GO somewhere. The server already refuses
 * anything else; this refuses it again because the payload is still just JSON from the
 * network, and a `javascript:` href on the public site is script execution.
 */
export const safeUrl = (v) => {
  const s = str(v, MAX_URL);
  if (!s) return '';
  // Protocol-relative ("//host/path") is another site, not a path on this one.
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/') || s.startsWith('#')) return s;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return '';
};

/** Bilingual text. A string (version 1) is the same text in both languages. */
export const text = (v, max = MAX_LABEL) => {
  if (typeof v === 'string') {
    const s = str(v, max);
    return { nl: s, en: s };
  }
  const o = v && typeof v === 'object' ? v : {};
  return { nl: str(o.nl, max), en: str(o.en, max) };
};

const itemId = (v, fallback) => {
  const s = str(v, 40);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : fallback;
};

const uniqueIds = (items) => {
  const seen = new Set();
  return items.map((it, i) => {
    let id = it.id;
    while (seen.has(id)) id = `${it.id}-${i}`;
    seen.add(id);
    return id === it.id ? it : { ...it, id };
  });
};

const footerLink = (v) => {
  const o = v && typeof v === 'object' ? v : {};
  return { enabled: bool(o.enabled, false), label: text(o.label), url: safeUrl(o.url) };
};

const dest = (d) => {
  if (!d || typeof d !== 'object') return null;
  if (d.type !== 'country' && d.type !== 'city') return null;
  const code = str(d.code, 20).toUpperCase();
  if (!code) return null;
  return {
    type: d.type,
    code,
    name: str(d.name, 120),
    countryName: str(d.countryName, 120),
  };
};

const positiveId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const toSlug = (name) =>
  String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─── blocks ─────────────────────────────────────────────────────────────────

function normalizeAnnouncement(v) {
  const o = v && typeof v === 'object' ? v : {};
  const a = {
    enabled: bool(o.enabled, false),
    text: text(o.text, MAX_TEXT),
    linkLabel: text(o.linkLabel),
    link: safeUrl(o.link),
    newTab: bool(o.newTab, false),
    tone: oneOf(o.tone, ANNOUNCEMENT_TONES, 'orange'),
    dismissible: bool(o.dismissible, true),
    startDate: isoDate(o.startDate),
    endDate: isoDate(o.endDate),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
  // Only the server says it is live (it knows today in Brussels). A strip with no words in it
  // is never live, whatever the flag says, so a half-saved row cannot draw an empty band.
  a.live = o.live === true && a.enabled && Boolean(a.text.nl || a.text.en);
  return a;
}

function normalizeDestinationsMenu(v) {
  const o = v && typeof v === 'object' ? v : {};
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((it, i) => ({
      id: itemId(it?.id, `d${i + 1}`),
      active: bool(it?.active, true),
      label: text(it?.label),
      sub: text(it?.sub, MAX_SUB),
      icon: iconName(it?.icon),
      dest: dest(it?.dest),
      boardCode: str(it?.boardCode, 10).toUpperCase(),
      holidayTypeId: positiveId(it?.holidayTypeId),
      url: safeUrl(it?.url),
    }))
    // A row with nothing to open is a draft, not a link.
    .filter((it) => it.dest || it.url || it.holidayTypeId || it.boardCode)
    .slice(0, MAX_MENU_ITEMS);
  return {
    enabled: bool(o.enabled, true),
    label: text(o.label),
    source: oneOf(o.source, DESTINATION_SOURCES, 'homepage'),
    maxItems: clampInt(o.maxItems, 1, MAX_MENU_ITEMS, 7),
    showGroupAsSub: bool(o.showGroupAsSub, true),
    items: uniqueIds(items),
    footerLink: footerLink(o.footerLink),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

// The server's resolved list. Version 1 sent it too, with plain-string labels.
function normalizeResolved(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      id: positiveId(r.id),
      name: str(r.name, 120),
      slug: str(r.slug, 120) || toSlug(r.name),
      label: text(r.label),
      sub: text(r.sub, MAX_SUB),
      icon: iconName(r.icon),
    }))
    // No slug, no page to open.
    .filter((r) => r.slug)
    .slice(0, MAX_MENU_ITEMS);
}

function normalizeHolidayTypesMenu(v) {
  const o = v && typeof v === 'object' ? v : {};
  const seen = new Set();
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((it) => ({
      holidayTypeId: positiveId(it?.holidayTypeId),
      label: text(it?.label),
      sub: text(it?.sub, MAX_SUB),
      icon: iconName(it?.icon),
    }))
    .filter((it) => {
      if (!it.holidayTypeId || seen.has(it.holidayTypeId)) return false;
      seen.add(it.holidayTypeId);
      return true;
    })
    .slice(0, MAX_MENU_ITEMS);
  const enabled = bool(o.enabled, true);
  return {
    enabled,
    label: text(o.label),
    // `mode` is the version 1 name of `source`.
    source: oneOf(o.source ?? o.mode, HOLIDAY_TYPE_SOURCES, 'auto'),
    maxItems: clampInt(o.maxItems, 1, MAX_MENU_ITEMS, 5),
    sub: text(o.sub, MAX_SUB),
    items,
    footerLink: footerLink(o.footerLink),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
    // The backend resolves a switched-off menu to an empty list; the same here, so a stale
    // `resolved` can never bring back a menu the dashboard turned off.
    resolved: enabled ? normalizeResolved(o.resolved) : [],
  };
}

function normalizeCustomMenu(v, index) {
  const o = v && typeof v === 'object' ? v : {};
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((it, i) => ({
      id: itemId(it?.id, `i${i + 1}`),
      active: bool(it?.active, true),
      label: text(it?.label),
      sub: text(it?.sub, MAX_SUB),
      icon: iconName(it?.icon),
      url: safeUrl(it?.url),
      newTab: bool(it?.newTab, false),
    }))
    .filter((it) => it.url && (it.label.nl || it.label.en))
    .slice(0, MAX_MENU_ITEMS);
  return {
    id: itemId(o.id, `menu${index + 1}`),
    enabled: bool(o.enabled, true),
    label: text(o.label),
    glyph: iconName(o.glyph),
    items: uniqueIds(items),
    footerLink: footerLink(o.footerLink),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

function normalizeMenus(v, legacy) {
  const o = v && typeof v === 'object' ? v : {};
  const custom = uniqueIds(
    (Array.isArray(o.custom) ? o.custom : [])
      .map((m, i) => normalizeCustomMenu(m, i))
      // A menu with no label has no button to click.
      .filter((m) => m.label.nl || m.label.en)
      .slice(0, MAX_CUSTOM_MENUS)
  );
  return {
    // Version 1 kept these two at the top level.
    destinations: normalizeDestinationsMenu(o.destinations ?? legacy.popularDestinations),
    holidayTypes: normalizeHolidayTypesMenu(o.holidayTypes ?? legacy.holidayTypes),
    custom,
  };
}

// Every menu exactly once: unknown keys dropped, a menu the stored order forgot appended.
function normalizeMenuOrder(v, menus) {
  const keys = ['destinations', 'holidayTypes', ...menus.custom.map((m) => `custom:${m.id}`)];
  const wanted = (Array.isArray(v) ? v : []).filter((k) => keys.includes(k));
  const seen = new Set();
  const out = [];
  for (const k of [...wanted, ...keys]) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function normalizeSearch(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    enabled: bool(o.enabled, true),
    placeholder: text(o.placeholder),
    showSuggestions: bool(o.showSuggestions, true),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

function normalizeSupport(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    enabled: bool(o.enabled, true),
    label: text(o.label),
    link: safeUrl(o.link) || '/faq',
    newTab: bool(o.newTab, false),
    icon: oneOf(o.icon, SUPPORT_ICONS, 'phone'),
    showLabel: bool(o.showLabel, true),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

// Reviews. `score` is the TrustScore the dashboard copies from the agency's own Trustpilot
// profile (1.0 to 5.0, one decimal); null shows the plain "read our reviews" link instead. Never
// a default: a review score is a real company's reputation, so it is only ever what the editor
// typed from the real profile.
function normalizeTrustpilot(v) {
  const o = v && typeof v === 'object' ? v : {};
  const n = o.score === '' || o.score == null ? NaN : Number(String(o.score).replace(',', '.'));
  return {
    enabled: bool(o.enabled, true),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
    score: Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n * 10) / 10 : null,
  };
}

function normalizeSimpleBlock(v, enabledFallback) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    enabled: bool(o.enabled, enabledFallback),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

function normalizeAccount(v, columns) {
  const o = v && typeof v === 'object' ? v : {};
  const stored = new Map();
  for (const m of Array.isArray(o.menuItems) ? o.menuItems : []) {
    if (ACCOUNT_MENU_KEYS.includes(m?.key) && !stored.has(m.key)) stored.set(m.key, m);
  }
  // Every key exactly once, in the stored order, the rest appended.
  const order = [
    ...(Array.isArray(o.menuItems) ? o.menuItems.map((m) => m?.key) : []),
    ...ACCOUNT_MENU_KEYS,
  ].filter((k, i, all) => ACCOUNT_MENU_KEYS.includes(k) && all.indexOf(k) === i);
  const register = o.register && typeof o.register === 'object' ? o.register : {};
  return {
    enabled: bool(o.enabled, columns.enableAccountMenu !== false),
    signInLabel: text(o.signInLabel),
    signInUrl: safeUrl(o.signInUrl) || safeUrl(columns.loginUrl) || '/login',
    register: {
      enabled: bool(register.enabled, true),
      label: text(register.label),
      url: safeUrl(register.url) || '/register',
    },
    fallbackName: text(o.fallbackName),
    menuItems: order.map((key) => ({
      key,
      enabled: bool(stored.get(key)?.enabled, true),
      label: text(stored.get(key)?.label),
    })),
    showOn: oneOf(o.showOn, SHOW_ON, 'all'),
  };
}

function normalizeMobileMenu(v) {
  const o = v && typeof v === 'object' ? v : {};
  const raw = Array.isArray(o.items) ? o.items : SERVICE_ITEMS.map((s) => ({ key: s.key, id: s.key }));
  const items = raw
    .map((it, i) => {
      const key = SERVICE_URL.has(it?.key) ? it.key : '';
      return {
        id: itemId(it?.id, key || `m${i + 1}`),
        key,
        active: bool(it?.active, true),
        label: text(it?.label),
        icon: iconName(it?.icon),
        // A built-in row may leave its link empty and keep the default.
        url: safeUrl(it?.url) || (key ? SERVICE_URL.get(key) : ''),
        newTab: bool(it?.newTab, false),
      };
    })
    // A custom row needs a name and somewhere to go; a built-in row has both by default.
    .filter((it) => it.url && (it.key || it.label.nl || it.label.en))
    .slice(0, MAX_MOBILE_ITEMS);
  return {
    items: uniqueIds(items),
    showMenus: bool(o.showMenus, true),
    showSearch: bool(o.showSearch, true),
  };
}

/**
 * The complete settings the bar draws, from whatever `useHeaderConfig` returned.
 *
 * @param headerConfig the header row as served (with or without `siteHeader`), or null
 */
// The wordmark beside the logo icon: an uploaded image replaces the "SunSky" text (admin
// siteHeader.js normalizeWordmark). No url = the text, as before.
export const WORDMARK_HEIGHT = { min: 20, max: 64, fallback: 46 };
// The logo's height (CMS, px). null = automatic, as before: 40px square icon, wide logo up to 64.
export const LOGO_HEIGHT = { min: 20, max: 80 };
function normalizeLogoBlock(v) {
  const o = v && typeof v === 'object' ? v : {};
  const n = o.height === '' || o.height == null ? NaN : Number(o.height);
  return { height: Number.isFinite(n) ? Math.min(LOGO_HEIGHT.max, Math.max(LOGO_HEIGHT.min, Math.round(n))) : null };
}
function normalizeWordmark(v) {
  const o = v && typeof v === 'object' ? v : {};
  const n = Number(o.height);
  const height = Number.isFinite(n) ? Math.min(WORDMARK_HEIGHT.max, Math.max(WORDMARK_HEIGHT.min, Math.round(n))) : WORDMARK_HEIGHT.fallback;
  return { url: safeUrl(o.url), alt: str(o.alt, 255), height };
}

export function normalizeSiteHeader(headerConfig) {
  const cfg = headerConfig && typeof headerConfig === 'object' ? headerConfig : {};
  const stored = cfg.siteHeader && typeof cfg.siteHeader === 'object' ? cfg.siteHeader : null;
  // The language and account COLUMNS are the backend's fallback for a row the new screen has
  // not saved yet. They only mean something once siteHeader exists: they were stored long
  // before the website read them, and the migration that introduced siteHeader is what reset
  // them. Without siteHeader they are ignored, which is what the bar always did.
  const columns = stored ? cfg : {};
  const v = stored || {};
  const menus = normalizeMenus(v.menus, v);
  const mobileMenu = normalizeMobileMenu(v.mobileMenu);
  return {
    version: SITE_HEADER_VERSION,
    announcement: normalizeAnnouncement(v.announcement),
    wordmark: normalizeWordmark(v.wordmark),
    logo: normalizeLogoBlock(v.logo),
    menus,
    menuOrder: normalizeMenuOrder(v.menuOrder, menus),
    search: normalizeSearch(v.search),
    support: normalizeSupport(v.support),
    trustpilot: normalizeTrustpilot(v.trustpilot),
    language: normalizeSimpleBlock(v.language, columns.enableLanguageSelector !== false),
    account: normalizeAccount(v.account, columns),
    // With no settings at all (config down, or a backend that predates them) the phone menu
    // stays exactly what it was: the four services and nothing else. The browse menus join it
    // once the dashboard has an opinion, which every saved row and every version 1 row has.
    mobileMenu: stored ? mobileMenu : { ...mobileMenu, showMenus: false },
  };
}

// ─── reading it ─────────────────────────────────────────────────────────────

/** The site's two languages; anything that is not English reads as Dutch, the default. */
export const langOf = (lng) => (String(lng || '').toLowerCase().startsWith('en') ? 'en' : 'nl');

/**
 * The visitor's language from a bilingual text. When that one is empty: the `fallback` if one
 * is given (the website's own translated default, or a holiday type's name), otherwise the
 * other language, otherwise ''. A plain string is the same text in both languages.
 */
export function pick(value, lang, fallback) {
  const t = typeof value === 'string' ? { nl: value, en: value } : value && typeof value === 'object' ? value : {};
  const own = langOf(lang);
  const mine = String(t[own] ?? '').trim();
  if (mine) return mine;
  if (fallback != null && String(fallback).trim() !== '') return String(fallback);
  return String(t[own === 'en' ? 'nl' : 'en'] ?? '').trim();
}

export const isExternalHref = (href) => /^(https?:|tel:|mailto:)/i.test(String(href || ''));

/** Opening a link in a new tab: always with noopener, so the new page cannot reach back. */
export const newTabProps = (newTab) => (newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {});

/**
 * How to open a header link: `{ href, router, newTab }`, or null when there is nothing safe to
 * open.
 *
 * `router` is true for a path on this site opened in this tab: that goes through react-router
 * (Link / navigate), because a plain anchor would reload the whole app. Everything else is a
 * real <a href>: other sites, mailto:, tel:, an #anchor on the current page, and any link the
 * dashboard asked to open in a new tab. A pasted absolute URL of one of the agency's own pages
 * counts as a path (resolveCmsLink), so it does not trigger a full reload either.
 */
export function headerLink(url, newTab = false) {
  const href = safeUrl(url);
  if (!href) return null;
  if (href.startsWith('#')) return { href, router: false, newTab: false };
  const resolved = resolveCmsLink(href);
  if (!resolved) return null;
  return { href: resolved.href, router: !resolved.external && !newTab, newTab: Boolean(newTab) };
}

/**
 * The class that hides a block where the dashboard does not want it: 'desktop' hides it at the
 * phone breakpoint (max-width 900px, where the burger appears), 'mobile' hides it above. Each
 * stylesheet that uses this carries its own `.onlyDesktop` / `.onlyMobile` pair.
 */
export const showOnClass = (showOn, styles) => {
  if (showOn === 'desktop') return styles?.onlyDesktop || '';
  if (showOn === 'mobile') return styles?.onlyMobile || '';
  return '';
};

/** Whether a block belongs in the phone menu: everything except the desktop-only ones. */
export const inDrawer = (showOn) => showOn !== 'desktop';

/**
 * The storage key value that remembers a dismissed announcement. A hash of what the strip says
 * and when it runs, so dismissing this week's sale does not also hide next month's, while a
 * re-save that changes nothing visible keeps it dismissed.
 */
export function announcementKey(a) {
  const src = JSON.stringify([a?.text?.nl || '', a?.text?.en || '', a?.startDate || '', a?.endDate || '']);
  // djb2: short, stable, and enough to tell two announcements apart. Not a security hash.
  let h = 5381;
  for (let i = 0; i < src.length; i += 1) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
