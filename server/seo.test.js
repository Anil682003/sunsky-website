import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ROUTES, isKnownRoute, robotsTxt, sitemapXml, STATIC_SITEMAP_PATHS,
} from './seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://holidaybooking.be';

/* ══════════════════ the anti-drift test ══════════════════ */

/**
 * THE ONE TEST IN THIS FILE THAT EARNS ITS KEEP LONG AFTER EVERYONE HAS FORGOTTEN WHY.
 *
 * The server decides 200-vs-404 from its own copy of the route list, because it cannot import
 * the JSX router. The day someone adds a route to `routes.config.jsx` and not to `APP_ROUTES`,
 * that new page starts answering HTTP 404 to Google while looking perfectly fine in a browser
 * - a failure nobody would notice for months. This fails the build instead.
 */
describe('the server route list matches the React router', () => {
  const config = fs.readFileSync(
    path.resolve(here, '..', 'src', 'routes', 'routes.config.jsx'), 'utf8',
  );
  const routerPaths = [...config.matchAll(/path:\s*'([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*');

  it('found the routes to compare against', () => {
    // Guards the guard: a regex that silently matches nothing would make this suite pass
    // while comparing an empty list to an empty list.
    expect(routerPaths.length).toBeGreaterThan(20);
  });

  it('covers every route the router serves', () => {
    const missing = routerPaths.filter((p) => !APP_ROUTES.includes(p));
    expect(missing).toEqual([]);
  });

  it('lists no route the router does not have', () => {
    const extra = APP_ROUTES.filter((p) => !routerPaths.includes(p));
    expect(extra).toEqual([]);
  });

  /**
   * The SEO landing wildcards are the one deliberate exception, and this says so out loud
   * rather than leaving it to the regex above happening not to match them.
   *
   * `/:a`, `/:a/:b` and friends exist in the router so React can render a permanent SEO
   * page. They must NOT be in APP_ROUTES: `isKnownRoute` returning true for them would make
   * the server treat every unknown URL as one of its own routes, skip asking the resolver,
   * and go back to answering 200 with the app shell for everything, which is the soft-404
   * this file exists to prevent.
   */
  it('deliberately excludes the SEO landing wildcards', () => {
    for (const wildcard of ['/:a', '/:a/:b', '/:a/:b/:c', '/:a/:b/:c/:d']) {
      expect(APP_ROUTES).not.toContain(wildcard);
    }
    // And so an unknown path still falls through to the resolver.
    expect(isKnownRoute('/zonvakanties/turkije/antalya')).toBe(false);
    expect(isKnownRoute('/zonvakanties')).toBe(false);
  });
});

/* ══════════════════ 404 vs 200 ══════════════════ */

describe('isKnownRoute (SEO Master §12: no soft 404s)', () => {
  it('knows the real pages', () => {
    for (const p of ['/', '/about', '/contact', '/faq', '/results', '/packages']) {
      expect(isKnownRoute(p)).toBe(true);
    }
  });

  it('matches a parameterised route with any single segment', () => {
    expect(isKnownRoute('/hotel/12345')).toBe(true);
    expect(isKnownRoute('/p/privacy-policy')).toBe(true);
    expect(isKnownRoute('/holidays/zonvakanties')).toBe(true);
    expect(isKnownRoute('/booking/ORD-000049/confirmation')).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isKnownRoute('/about/')).toBe(true);
  });

  /** The behaviour that was live until now: every typo answered 200 with the app shell. */
  it('does not know a page that does not exist', () => {
    for (const p of ['/this-page-is-fake', '/zonvakanties/turkije', '/hotel', '/wp-admin']) {
      expect(isKnownRoute(p)).toBe(false);
    }
  });

  it('does not let a parameter swallow extra path segments', () => {
    // `/hotel/:hotelCode` is one segment. Without the anchors, `[^/]+` plus a loose regex
    // would match this and report a 200 for a URL the router sends to NotFound.
    expect(isKnownRoute('/hotel/12345/extra')).toBe(false);
  });

  it('is not fooled by a path that merely starts with a real one', () => {
    expect(isKnownRoute('/aboutus')).toBe(false);
    expect(isKnownRoute('/contact-us')).toBe(false);
  });

  it('handles nonsense input without throwing', () => {
    expect(isKnownRoute('')).toBe(false);
    expect(isKnownRoute(null)).toBe(false);
    expect(isKnownRoute(undefined)).toBe(false);
  });
});

/* ══════════════════ robots.txt ══════════════════ */

describe('robotsTxt (SEO Master §12)', () => {
  const prod = robotsTxt(ORIGIN, true);

  it('references the sitemap', () => {
    expect(prod).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  /** The launch gate's own wording: "robots.txt correct; no accidental Disallow: /". */
  it('never blocks the whole production site', () => {
    expect(prod).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });

  it('keeps SearchContext and transactional pages out (§9, §12)', () => {
    for (const p of ['/results', '/checkout', '/account', '/booking', '/voucher']) {
      expect(prod).toContain(`Disallow: ${p}`);
    }
  });

  it('leaves the real content pages crawlable', () => {
    for (const p of ['/about', '/faq', '/hotel', '/packages', '/holidays']) {
      expect(prod).not.toContain(`Disallow: ${p}`);
    }
  });

  describe('on staging', () => {
    const staging = robotsTxt(ORIGIN, false);

    it('blocks everything (launch gate: "Staging/UAT protected")', () => {
      expect(staging).toMatch(/^Disallow:\s*\/$/m);
    });

    /**
     * Naming a sitemap while refusing to be indexed is a contradiction that gets the URLs
     * discovered anyway. A blocked site advertises nothing.
     */
    it('does not advertise a sitemap', () => {
      expect(staging).not.toContain('Sitemap:');
    });
  });
});

/* ══════════════════ sitemap.xml ══════════════════ */

describe('sitemapXml (SEO Master §12)', () => {
  const xml = sitemapXml(ORIGIN, STATIC_SITEMAP_PATHS);

  it('is a valid-looking urlset with absolute URLs', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/about</loc>`);
  });

  /**
   * §12: only PUBLISHED + INDEX + HTTP 200 canonical pages. Every path shipped in the
   * sitemap must therefore be a route that actually resolves - a sitemap of 404s is worse
   * than a short sitemap.
   */
  it('contains only paths the server will answer 200 for', () => {
    for (const p of STATIC_SITEMAP_PATHS) expect(isKnownRoute(p)).toBe(true);
  });

  it('never lists a page robots.txt disallows', () => {
    const prod = robotsTxt(ORIGIN, true);
    const disallowed = [...prod.matchAll(/^Disallow:\s*(\S+)$/gm)].map((m) => m[1]);
    for (const p of STATIC_SITEMAP_PATHS) {
      expect(disallowed.some((d) => p === d || p.startsWith(`${d}/`))).toBe(false);
    }
  });

  it('emits one canonical URL per page', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('de-duplicates a repeated path', () => {
    const out = sitemapXml(ORIGIN, ['/about', '/about', '/faq']);
    expect([...out.matchAll(/<loc>/g)]).toHaveLength(2);
  });

  it('escapes XML-significant characters in a URL', () => {
    const out = sitemapXml(ORIGIN, ['/p/terms&conditions']);
    expect(out).toContain('terms&amp;conditions');
    expect(out).not.toMatch(/terms&conditions/);
  });

  /**
   * §12: "Sitemap lastmod changes for meaningful content changes, not for every price/
   * availability update." Stamping "now" on every fetch tells Google everything changed
   * every time, which destroys the signal.
   */
  it('omits lastmod unless a real content date is supplied', () => {
    expect(sitemapXml(ORIGIN, ['/about'])).not.toContain('<lastmod>');
    expect(sitemapXml(ORIGIN, [{ path: '/about', lastmod: '2026-09-14T10:00:00Z' }]))
      .toContain('<lastmod>2026-09-14</lastmod>');
  });

  it('ignores entries that are not usable paths', () => {
    const out = sitemapXml(ORIGIN, ['/ok', 'not-a-path', '', null, undefined, { path: 42 }]);
    expect([...out.matchAll(/<loc>/g)]).toHaveLength(1);
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(sitemapXml('https://holidaybooking.be/', ['/about']))
      .toContain('<loc>https://holidaybooking.be/about</loc>');
  });
});
