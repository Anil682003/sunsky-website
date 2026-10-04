#!/usr/bin/env node
/**
 * The "Show all" warmer: keeps the homepage's big searches pre-computed in the cache, so a visitor
 * gets them in a fraction of a second instead of the several seconds an every-destination search
 * costs to price.
 *
 *   1. "Something for everyone" → Show all          (the dashboard's featured holiday types)
 *   2. "Our best sun destinations" → Show all, per tab (the dashboard's destination tabs)
 *   3. the empty search: every destination           (a bare /results, and the homepage search
 *                                                      with nothing picked)
 *
 * It sends EXACTLY the cache requests the results page sends for those links — page 1 and every
 * Travel-time count — built by the website's own code (src/utils/showAllSearches.js,
 * src/utils/warmSearches.js); Results.warmParity.test.jsx keeps the two identical.
 *
 * When:
 *   - every WARM_EVERY_MIN (default 30) minutes: all searches
 *   - every CMS_CHECK_MIN (default 5) minutes: re-read the homepage config, warm only new searches
 *   - when the UTC date changes (the default stay moves a day), and after a cache restart
 * One request at a time, and each waits for its search to be computed (the X-Search-Warm header),
 * so the work is spread out instead of landing on the search workers at once.
 *
 * Run (from the sunsky-website folder, on the server that runs the cache):
 *   pm2 start scripts/warm-show-all.mjs --name sunsky-show-all-warmer
 * with SEARCH_WARM_TOKEN set to the cache's SEARCH_WARM_TOKEN. Optional: CACHE_API_URL
 * (http://localhost:3001), ADMIN_API_URL (https://admin.holidaybooking.be/api),
 * WARM_EVERY_MIN, CMS_CHECK_MIN. `--once` runs one round and exits.
 */
import { pathToFileURL } from 'node:url';
import { showAllSearchUrls } from '../src/utils/showAllSearches.js';
import { cacheRequestsForLink, linkScope } from '../src/utils/warmSearches.js';
import { facetsParams } from '../src/utils/facetsParams.js';

const MINUTE = 60 * 1000;

export function warmerConfig(env = process.env) {
  return {
    cache: String(env.CACHE_API_URL || 'http://localhost:3001').replace(/\/+$/, ''),
    admin: String(env.ADMIN_API_URL || 'https://admin.holidaybooking.be/api').replace(/\/+$/, ''),
    token: String(env.SEARCH_WARM_TOKEN || ''),
    warmEveryMs: (Number(env.WARM_EVERY_MIN) || 30) * MINUTE,
    cmsCheckMs: (Number(env.CMS_CHECK_MIN) || 5) * MINUTE,
  };
}

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/** The homepage config and holiday types, exactly as the website reads them (api/index.js). */
export async function loadShowAllLinks(cfg, fetchFn = fetch) {
  const [cmsRes, typesRes] = await Promise.all([
    getJson(fetchFn, `${cfg.admin}/cms/layout/homepage-config`),
    getJson(fetchFn, `${cfg.admin}/website/holiday-types`).catch(() => null),
  ]);
  const cms = cmsRes?.success ? cmsRes.data?.homepageConfig : null;
  if (!cms) throw new Error('homepage config: no data');
  return showAllSearchUrls(cms, typesRes?.data ?? []);
}

/**
 * What the results page prices for a link: the admin's matched destinations for its scope (the
 * same facets?counts=0 call the page makes), or the scope's own list. The empty search's scope is
 * every destination with inventory.
 */
export async function destinationsForLink(cfg, link, { allDestinations }, fetchFn = fetch) {
  const scope = linkScope(new URLSearchParams(link.split('?')[1] || ''));
  if (scope.emptySearch) scope.destinations = allDestinations;
  const qs = new URLSearchParams(facetsParams(scope, {}, { codes: false, attrs: false, counts: false }));
  try {
    const res = await getJson(fetchFn, `${cfg.admin}/hotel-filters/facets?${qs}`);
    const m = res?.data?.matchedDestinations;
    if (Array.isArray(m) && m.length) return m;
  } catch { /* the page then prices the scope's own list, as here */ }
  return scope.destinations;
}

/** One round: every link, one request at a time. Returns a line per link for the log. */
export async function warmLinks(cfg, links, fetchFn = fetch, log = console.log) {
  const started = Date.now();
  const dests = await getJson(fetchFn, `${cfg.cache}/contracts/destinations`);
  const allDestinations = (dests?.destinations ?? []).map((d) => d?.code).filter(Boolean);
  const done = [];
  for (const link of links) {
    const t0 = Date.now();
    try {
      const destinations = await destinationsForLink(cfg, link, { allDestinations }, fetchFn);
      const requests = cacheRequestsForLink(link, { baseUrl: cfg.cache, destinations });
      let failed = 0;
      for (const { url, opts } of requests) {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetchFn(url, { ...opts, headers: { ...(opts.headers || {}), 'X-Search-Warm': cfg.token } }).catch(() => null);
        if (!r?.ok) failed += 1;
      }
      done.push({ link, destinations: destinations.length, requests: requests.length, failed, ms: Date.now() - t0 });
    } catch (err) {
      done.push({ link, error: err.message, ms: Date.now() - t0 });
    }
  }
  for (const d of done) {
    log(d.error
      ? `[warm] ${d.link} — failed: ${d.error}`
      : `[warm] ${d.link} — ${d.destinations} destinations, ${d.requests} requests${d.failed ? `, ${d.failed} FAILED` : ''}, ${d.ms} ms`);
  }
  log(`[warm] round done: ${done.length} searches in ${Math.round((Date.now() - started) / 1000)} s`);
  return done;
}

/**
 * What a tick should do, from what it knows. Pure, so the timing rules are testable.
 *   'full'  — every search: first run, warm interval passed, new UTC date, cache restarted
 *   'check' — re-read the homepage config and warm what is new
 *   'wait'  — nothing yet (or the cache came up less than a minute ago: let it load first)
 */
export function nextAction(state, { now, cacheStartedAt, cfg }) {
  if (cacheStartedAt && now - Date.parse(cacheStartedAt) < MINUTE) return 'wait';
  const utcDate = new Date(now).toISOString().slice(0, 10);
  if (!state.lastFullAt) return 'full';
  if (cacheStartedAt && cacheStartedAt !== state.cacheStartedAt) return 'full';
  if (utcDate !== state.utcDate) return 'full';
  if (now - state.lastFullAt >= cfg.warmEveryMs) return 'full';
  if (now - (state.lastCheckAt || 0) >= cfg.cmsCheckMs) return 'check';
  return 'wait';
}

async function main() {
  const cfg = warmerConfig();
  if (!cfg.token) {
    console.error('[warm] SEARCH_WARM_TOKEN is not set (it must equal the cache\'s). Not starting.');
    process.exit(1);
  }
  const once = process.argv.includes('--once');
  const state = { lastFullAt: 0, lastCheckAt: 0, utcDate: null, cacheStartedAt: null, links: [] };
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const health = await getJson(fetch, `${cfg.cache}/health`).catch(() => null);
      if (!health) { console.warn('[warm] cache not reachable; next minute'); return; }
      const action = nextAction(state, { now, cacheStartedAt: health.startedAt, cfg });
      if (action === 'wait') return;
      let links = state.links;
      try {
        links = await loadShowAllLinks(cfg);
      } catch (err) {
        console.warn(`[warm] homepage config not loaded (${err.message}); using the last known searches`);
      }
      state.lastCheckAt = now;
      if (action === 'full') {
        await warmLinks(cfg, links);
        Object.assign(state, { lastFullAt: now, utcDate: new Date(now).toISOString().slice(0, 10), cacheStartedAt: health.startedAt });
      } else {
        const fresh = links.filter((l) => !state.links.includes(l));
        if (fresh.length) {
          console.log(`[warm] ${fresh.length} new "Show all" search(es) in the homepage config`);
          await warmLinks(cfg, fresh);
        }
      }
      state.links = links;
    } catch (err) {
      console.error(`[warm] tick failed: ${err.message}`);
    } finally {
      running = false;
    }
  };

  if (once) {
    const links = await loadShowAllLinks(cfg);
    await warmLinks(cfg, links);
    return;
  }
  console.log(`[warm] started: cache ${cfg.cache}, admin ${cfg.admin}, all every ${cfg.warmEveryMs / MINUTE} min, config every ${cfg.cmsCheckMs / MINUTE} min`);
  await tick();
  setInterval(tick, MINUTE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`[warm] ${err.message}`); process.exit(1); });
}
