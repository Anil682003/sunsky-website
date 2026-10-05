/**
 * Technical SEO the SERVER has to answer, because a crawler never runs React.
 *
 * Implements the parts of "SUNSKY SEO & Organic Search - Master Developer Specification
 * Phase 1" (the "SEO Master" below, cited by section) that cannot live in the SPA:
 * robots.txt, the XML sitemap, and a real HTTP 404.
 *
 * DEPENDENCY-FREE AND NODE-SAFE, like the rest of `server/`. Deploys skip `npm install`, so
 * nothing here may import a package, touch the DOM, or read `import.meta.env`. It is a plain
 * local module, which the server already does for `src/utils/hotelImage.js`.
 *
 * Pure functions, so every rule below is unit-testable without starting a server.
 */

/* ────────────────────────── route knowledge ────────────────────────── */

/**
 * Every path the React router actually serves.
 *
 * MIRRORS `src/routes/routes.config.jsx`, and `server/seo.test.js` fails the build if the two
 * ever drift. Without this list the server cannot tell a real page from a typo, which is why
 * `/this-page-is-fake` currently answers 200 with the app shell - a soft 404, which the SEO
 * Master §12 explicitly forbids ("Real missing pages return HTTP 404, not a soft 404 with
 * HTTP 200").
 *
 * `:param` matches one non-empty segment.
 */
export const APP_ROUTES = [
  '/',
  '/login', '/register', '/forgot-password',
  '/results',
  '/hotel/:hotelCode',
  '/packages',
  '/flights', '/flights/:id',
  '/hotels',
  '/holidays/:slug',
  '/transfers',
  '/about', '/contact', '/faq',
  '/p/:slug',
  '/checkout', '/checkout/return',
  '/voucher',
  '/account', '/account/bookings', '/account/bookings/:ref',
  '/account/favourites', '/account/profile', '/account/settings',
  '/booking/new', '/booking/:ref', '/booking/:ref/confirmation',
];

const toMatcher = (route) => {
  const body = route
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^/${body}/?$`, 'i');
};

const MATCHERS = APP_ROUTES.map(toMatcher);

/** True when the SPA has a route for this path, so the shell is the right answer. */
export function isKnownRoute(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return false;
  return MATCHERS.some((re) => re.test(pathname));
}

/* ────────────────────────── robots.txt ────────────────────────── */

/**
 * Paths that must never be crawled.
 *
 * SEO Master §12: "Search, filters, sorting and temporary SearchContext states are NOINDEX by
 * default." §9: "Do not index SearchContext URLs." `/results` is the SearchContext page, so it
 * is disallowed outright rather than merely left out of the sitemap.
 *
 * The rest are private or transactional: nothing a crawler should reach, and several would
 * waste crawl budget on pages that redirect to a login.
 */
const DISALLOW = [
  '/results',
  '/checkout',
  '/account',
  '/booking',
  '/voucher',
  '/login',
  '/register',
  '/forgot-password',
];

/**
 * @param {string} origin  e.g. https://holidaybooking.be
 * @param {boolean} indexable  false on staging/UAT
 *
 * SEO Master §12: robots.txt "must reference the sitemap and must never accidentally block the
 * whole production site". The launch gate asks for both "no accidental Disallow: /" and
 * "Staging/UAT protected", which are opposite answers to the same file - hence the flag, set
 * from SITE_INDEXABLE rather than guessed from the hostname.
 */
export function robotsTxt(origin, indexable) {
  if (!indexable) {
    // Everything blocked, and deliberately NO sitemap line: pointing a crawler at a sitemap
    // of a site it may not index is a contradiction that gets the URLs discovered anyway.
    return [
      '# Staging / UAT. Not for indexing.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  return [
    'User-agent: *',
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/* ────────────────────────── resolving an SEO page ────────────────────────── */

/**
 * Ask the admin API what a path is.
 *
 * WHY THE SERVER DOES THIS AT ALL, rather than letting React handle it: SEO Master §12
 * requires title, meta description, canonical, robots and H1 in "the initial server-rendered
 * page output". A crawler never runs React, so a client-side title is a title Google does
 * not see. This is also what lets a missing page answer a real 404 and a renamed slug answer
 * a real 301, both of which §12 asks for and neither of which a SPA can do.
 *
 * Cached, because the same few hundred paths are requested over and over and the answer only
 * changes when somebody edits Geo Data or the CMS.
 */
const SEO_TTL_MS = 10 * 60 * 1000;
const SEO_MAX_ENTRIES = 2000;
const seoCache = new Map();     // path -> { at, rec }
const seoInflight = new Map();  // path -> Promise, so a burst on one path makes one call

/**
 * @param {string} apiBase   admin API base, e.g. https://admin.holidaybooking.be/api
 * @param {string} pathname
 * @param {number} timeoutMs
 * @returns {Promise<object|null>} the resolved page, { status:'MOVED', redirectTo }, or null
 */
export async function resolveSeoPage(apiBase, pathname, timeoutMs = 2500) {
  const hit = seoCache.get(pathname);
  if (hit && Date.now() - hit.at < SEO_TTL_MS) return hit.rec;
  if (seoInflight.has(pathname)) return seoInflight.get(pathname);

  const run = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `${apiBase}/website/seo/resolve?path=${encodeURIComponent(pathname)}`;
      const res = await fetch(url, { signal: ctrl.signal });

      // A 404 is a real answer and worth caching: it is how the server knows to send 404
      // rather than 200 for this path, and re-asking on every hit of a crawled dead URL
      // would be the most expensive thing this server does.
      if (res.status === 404) return cacheSeo(pathname, { status: 'NOT_FOUND' });
      if (!res.ok) return null;

      const body = await res.json();
      return cacheSeo(pathname, body?.data || null);
    } catch {
      // Timeout, admin down, bad JSON. Null means "no opinion", and the caller serves the
      // plain shell with a 200 rather than inventing a 404 out of an outage.
      return null;
    } finally {
      clearTimeout(timer);
      seoInflight.delete(pathname);
    }
  })();

  seoInflight.set(pathname, run);
  return run;
}

function cacheSeo(pathname, rec) {
  if (seoCache.size >= SEO_MAX_ENTRIES) {
    // Oldest insertion first: Map preserves insertion order, so this is the cheapest
    // bounded eviction available without pulling in an LRU.
    const oldest = seoCache.keys().next().value;
    if (oldest !== undefined) seoCache.delete(oldest);
  }
  seoCache.set(pathname, { at: Date.now(), rec });
  return rec;
}

/** Test seam / ops: drop the cached resolutions. */
export function __resetSeoCache() {
  seoCache.clear();
  seoInflight.clear();
  urlsCache = null;
}

/**
 * Every indexable SEO URL, for the sitemap.
 *
 * Cached for an hour and served stale on failure. A sitemap that briefly lists yesterday's
 * countries is harmless; one that empties out because the admin API blinked tells Google the
 * site has lost its pages, which is not.
 */
const URLS_TTL_MS = 60 * 60 * 1000;
let urlsCache = null;   // { at, paths }

export async function seoSitemapPaths(apiBase, timeoutMs = 5000) {
  if (urlsCache && Date.now() - urlsCache.at < URLS_TTL_MS) return urlsCache.paths;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}/website/seo/urls`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = await res.json();
    const paths = Array.isArray(body?.data) ? body.data.filter((p) => typeof p === 'string' && p.startsWith('/')) : [];
    urlsCache = { at: Date.now(), paths };
    return paths;
  } catch {
    // Stale beats empty. Only an entirely cold cache yields nothing, and then the sitemap
    // still carries the static pages.
    return urlsCache?.paths || [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The readable canonical URL for a hotel code, or null.
 *
 * §8: one Hotelbeds code is one hotel identity and "maximum one canonical hotel SEO page".
 * The site has linked to /hotel/:hotelCode for months in shares, favourites and emails, and
 * the readable /hotel/turkije/antalya/monart-city now serves the same page. Redirecting the
 * code form would be the textbook answer and also the one that breaks things; pointing its
 * canonical at the readable URL consolidates the two without moving anybody.
 *
 * Shares the SEO cache, keyed distinctly so a code can never collide with a path.
 */
export async function canonicalForHotel(apiBase, hotelCode, timeoutMs = 2000) {
  if (!/^\d+$/.test(String(hotelCode))) return null;
  const key = `#hotel:${hotelCode}`;

  const hit = seoCache.get(key);
  if (hit && Date.now() - hit.at < SEO_TTL_MS) return hit.rec;
  if (seoInflight.has(key)) return seoInflight.get(key);

  const run = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `${apiBase}/website/seo/resolve?hotelCode=${encodeURIComponent(hotelCode)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      // A 404 means this hotel has no readable URL (inactive, or its country/destination is
      // not active). Cached, so the answer is not re-asked on every crawl of that page.
      if (res.status === 404) return cacheSeo(key, null);
      if (!res.ok) return null;
      const body = await res.json();
      return cacheSeo(key, body?.data?.canonicalPath || null);
    } catch {
      // No opinion. The caller keeps the self-canonical it would have used anyway.
      return null;
    } finally {
      clearTimeout(timer);
      seoInflight.delete(key);
    }
  })();

  seoInflight.set(key, run);
  return run;
}

/**
 * The <head> tags for a resolved SEO page.
 *
 * Only what §12 names: title, description, canonical, robots. No Open Graph here - the hotel
 * preview path owns that, and duplicating it would mean two places deciding what a share
 * card says.
 */
export function seoHeadTags(page, origin, esc) {
  const out = [];
  if (page.metaDescription) {
    out.push(`    <meta name="description" content="${esc(page.metaDescription)}">`);
  }
  if (page.canonicalPath) {
    out.push(`    <link rel="canonical" href="${esc(origin + page.canonicalPath)}">`);
  }
  // Only when it is NOT the default. An explicit index,follow on every page is noise, and
  // its absence already means the same thing.
  if (page.robots && page.robots !== 'index,follow') {
    out.push(`    <meta name="robots" content="${esc(page.robots)}">`);
  }
  return out.join('\n');
}

/* ────────────────────────── Organization (§15) ────────────────────────── */

/**
 * Who SUNSKY is, as structured data on every page.
 *
 * SEO Master §15 lists Organization as in scope for Phase 1. It is site-wide rather than an
 * SEO-page feature, because it describes the business and not a page, and it is emitted
 * SERVER-SIDE for the same reason every other tag here is: a crawler never runs React.
 *
 * EVERY VALUE BELOW IS TAKEN FROM SUNSKY'S OWN PUBLISHED LEGAL NOTICES, not from anywhere
 * else and certainly not invented. The source is the CMS static page "Wettelijke
 * vermeldingen" (/p/about-sunsky#Wettelijke-vermeldingen) and the Bijzondere
 * Reisvoorwaarden, both of which carry the registered name, address, company number and
 * contact details. Structured data that disagrees with a company's own legal page is worse
 * than none: it is a machine-readable contradiction.
 *
 * THAT ALSO MAKES THIS A DRIFT RISK, so it is stated plainly: if the legal page changes,
 * change this with it. The alternative, parsing the address out of a Markdown body at
 * runtime, would break the first time somebody reformatted a paragraph.
 *
 * `@type` is Organization exactly as §15 says. TravelAgency is a valid, more specific
 * subtype and would be a reasonable upgrade, but it is a scope decision rather than a
 * developer one.
 */
const ORG = Object.freeze({
  legalName: 'SUNSKY Belgium BV',
  name: 'SUNSKY',
  street: 'Koolmijnlaan 143 bus 11',
  postalCode: '3550',
  city: 'Heusden-Zolder',
  country: 'BE',
  vatID: 'BE0544.295.209',
  taxID: '0544.295.209',
  email: 'info@sunsky.be',
  // E.164, which is what schema.org asks for, from "+32 11 57 44 27".
  telephone: '+3211574427',
  // The agency's own site, named as "Website" on the legal page. The Trustpilot profile is
  // added from the same domain the review widget is configured with, so the two can never
  // point at different businesses.
  site: 'https://www.sunsky.be',
});

export function organizationJsonLd(origin, { trustpilotDomain = '' } = {}) {
  const sameAs = [ORG.site];
  const tp = String(trustpilotDomain || '').trim();
  if (tp) sameAs.push(`https://www.trustpilot.com/review/${tp}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG.name,
    legalName: ORG.legalName,
    url: `${origin}/`,
    logo: `${origin}/sunsky-icon.png`,
    email: ORG.email,
    telephone: ORG.telephone,
    vatID: ORG.vatID,
    taxID: ORG.taxID,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ORG.street,
      postalCode: ORG.postalCode,
      addressLocality: ORG.city,
      addressCountry: ORG.country,
    },
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: ORG.telephone,
      email: ORG.email,
      // The contractual language of the agency's own terms, and the site's native language.
      availableLanguage: ['nl', 'en'],
    }],
    sameAs,
  };
}

/**
 * The Organization block, ready to splice into <head>.
 *
 * JSON.stringify escapes the values, and `</script>` cannot appear in any of them since they
 * are all plain business details; the `<` guard is belt and braces for the day somebody edits
 * ORG and pastes in markup.
 */
export function organizationScript(origin, opts) {
  const json = JSON.stringify(organizationJsonLd(origin, opts)).replace(/</g, '\\u003c');
  return `    <script type="application/ld+json">${json}</script>`;
}

/* ────────────────────────── sitemap.xml ────────────────────────── */

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

/**
 * The pages that exist today and answer 200.
 *
 * DELIBERATELY SMALL, AND THAT IS THE POINT. SEO Master §12: "XML sitemap contains only
 * PUBLISHED + INDEX + HTTP 200 canonical pages." The holiday-type-aware SEO URLs in §5
 * (/zonvakanties/turkije/antalya and friends) are not routed yet, so listing them would hand
 * Google a sitemap of 404s, which is worse than a short sitemap. They join this list when
 * those routes exist.
 *
 * `changefreq` and `priority` are omitted on purpose: Google ignores both, and a wrong value
 * is a maintenance burden that buys nothing.
 */
export const STATIC_SITEMAP_PATHS = [
  '/',
  '/packages',
  '/hotels',
  '/flights',
  '/transfers',
  '/about',
  '/contact',
  '/faq',
];

/**
 * @param {string} origin
 * @param {Array<{path: string, lastmod?: string}>} entries
 *
 * §12: "Sitemap lastmod changes for meaningful content changes, not for every price/
 * availability update." So lastmod is only emitted when a caller supplies a real content
 * date; it is never stamped with "now", which would tell Google every page changed on every
 * sitemap fetch and burn the signal entirely.
 */
export function sitemapXml(origin, entries) {
  const base = String(origin).replace(/\/+$/, '');
  const seen = new Set();
  const urls = [];

  for (const e of entries || []) {
    const p = typeof e === 'string' ? e : e?.path;
    if (!p || typeof p !== 'string' || !p.startsWith('/')) continue;
    // One canonical URL per page (§12). A duplicate in the sitemap is a self-inflicted
    // duplicate-content signal.
    const loc = `${base}${p}`;
    if (seen.has(loc)) continue;
    seen.add(loc);

    const lastmod = typeof e === 'object' && e?.lastmod ? isoDay(e.lastmod) : null;
    urls.push(
      lastmod
        ? `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod></url>`
        : `  <url><loc>${xmlEscape(loc)}</loc></url>`,
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** YYYY-MM-DD from whatever a CMS record carried, or null. Local parts, never toISOString. */
function isoDay(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
