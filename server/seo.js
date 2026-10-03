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
