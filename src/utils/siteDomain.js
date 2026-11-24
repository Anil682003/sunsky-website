/**
 * The two SUNSKY domains (Levent, 24 Nov 2026): the same website on www.sunsky.be (Belgium)
 * and www.sunsky.nl (the Netherlands). One rule for the server (server/seo.js: canonical,
 * sitemap, robots, share tags) and the browser (SEO pages' canonical, CMS links), so the two can
 * never name different addresses for the same page.
 *
 * holidaybooking.be, the old address being retired, belongs to Belgium and names www.sunsky.be.
 * Any other host (the server's IP, localhost, a staging name) keeps the configured origin.
 */
export const SITE_DOMAINS = Object.freeze({ BE: 'https://www.sunsky.be', NL: 'https://www.sunsky.nl' });

/** Hostnames that are this website (same-site links stay inside the app). */
export const OWN_HOSTS = Object.freeze([
  'sunsky.be', 'www.sunsky.be', 'sunsky.nl', 'www.sunsky.nl', 'holidaybooking.be', 'www.holidaybooking.be',
]);

/**
 * PURE. The site a hostname belongs to.
 * @returns {{ origin: string, market: 'BE'|'NL', locale: 'nl_BE'|'nl_NL' }}
 */
export function siteForHost(host, fallback) {
  const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (h === 'sunsky.nl') return { origin: SITE_DOMAINS.NL, market: 'NL', locale: 'nl_NL' };
  if (h === 'sunsky.be' || h === 'holidaybooking.be') return { origin: SITE_DOMAINS.BE, market: 'BE', locale: 'nl_BE' };
  return { origin: String(fallback || SITE_DOMAINS.BE).replace(/\/+$/, ''), market: 'BE', locale: 'nl_BE' };
}
