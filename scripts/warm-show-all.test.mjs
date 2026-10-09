import { describe, it, expect } from 'vitest';
import { warmerConfig, loadShowAllLinks, warmLinks, nextAction, runTick, initialState } from './warm-show-all.mjs';

const CFG = warmerConfig({ CACHE_API_URL: 'http://cache.test', ADMIN_API_URL: 'http://admin.test/api', SEARCH_WARM_TOKEN: 'tok' });
const CMS = {
  featuredHolidayTypes: [{ holidayTypeId: 1, title: 'Zon', destinations: [{ type: 'country', code: 'TR', name: 'Turkije' }] }],
  destinationTabs: [{ tab: 'Spanje', cards: [{ name: 'Mallorca', dest: { type: 'city', code: 'PMI', name: 'Mallorca' } }] }],
};
const ALL = ['AYT', 'BCN', 'LON', 'PMI', 'TFS', 'IST', 'ROE', 'RHO', 'AGP'];

/** A stand-in for the admin and the cache, recording every call and how many ran at once. */
function fakeServers({ facetsFail = false, cmsFail = () => false, cacheDown = false } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const json = (body) => ({ ok: true, json: async () => body });
  const fetchFn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    if (u.endsWith('/health')) return cacheDown ? Promise.reject(new Error('ECONNREFUSED')) : json({ startedAt: '2026-10-04T08:00:00.000Z' });
    if (u.endsWith('/cms/layout/homepage-config')) {
      if (cmsFail()) return { ok: false, status: 502, json: async () => ({}) };
      return json({ success: true, data: { homepageConfig: CMS } });
    }
    if (u.endsWith('/website/holiday-types')) return json({ data: [{ id: 1, name: 'Zon' }] });
    if (u.endsWith('/contracts/destinations')) return json({ destinations: ALL.map((code) => ({ code })) });
    if (u.includes('/hotel-filters/facets')) {
      if (facetsFail) throw new Error('admin down');
      const qs = new URL(u).searchParams;
      const m = qs.get('countries') === 'TR' ? ['AYT', 'IST'] : (qs.get('destinations') || '').split(',').filter(Boolean);
      return json({ data: { matchedDestinations: m } });
    }
    if (u.includes('/contracts/cheapest')) {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return json({ results: [] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls, maxInFlight: () => maxInFlight };
}
const cheapestCalls = (calls) => calls.filter((c) => c.url.includes('/contracts/cheapest'));
const destinationsOf = (c) => (c.opts.method === 'POST' ? JSON.parse(c.opts.body).destinations : new URL(c.url).searchParams.get('destinations').split(','));

describe('the "Show all" warmer', () => {
  it('reads the homepage config and holiday types the way the website does', async () => {
    const { fetchFn } = fakeServers();
    const links = await loadShowAllLinks(CFG, fetchFn);
    // Homepage links open Flight + Hotel (transport=package, 7 Oct 2026).
    expect(links).toEqual(expect.arrayContaining(['/results?countries=TR&transport=package', '/results?destinations=PMI&destinationLabel=Spanje&transport=package', '/results']));
    expect(links).toHaveLength(4);   // categories, one tab, the two empty-search forms
  });

  it('warms every link one request at a time, each with the warm token', async () => {
    const { fetchFn, calls, maxInFlight } = fakeServers();
    const links = await loadShowAllLinks(CFG, fetchFn);
    const done = await warmLinks(CFG, links, fetchFn, () => {});
    const sent = cheapestCalls(calls);
    // Page 1 + 5 lengths per Hotel Only link. Flight + Hotel links are the admin's precalculated
    // package searches: nothing to warm in SunSkyCache.
    const hotelOnly = links.filter((l) => !l.includes('transport=package'));
    expect(hotelOnly).toEqual(['/results']);
    expect(sent).toHaveLength(hotelOnly.length * 6);
    expect(sent.every((c) => c.opts.headers['X-Search-Warm'] === 'tok')).toBe(true);
    expect(maxInFlight()).toBe(1);
    expect(done.every((d) => !d.error && d.failed === 0)).toBe(true);
  });

  it('prices what the admin resolves a scope to; the empty search gets every destination', async () => {
    const { fetchFn, calls } = fakeServers();
    await warmLinks(CFG, ['/results?countries=TR', '/results'], fetchFn, () => {});
    const sent = cheapestCalls(calls);
    expect(destinationsOf(sent[0])).toEqual(['AYT', 'IST']);
    expect(destinationsOf(sent[6])).toEqual(ALL);
  });

  it('the admin down: still warms, pricing the scope\'s own places (as the page does)', async () => {
    const { fetchFn, calls } = fakeServers({ facetsFail: true });
    const done = await warmLinks(CFG, ['/results?destinations=PMI,TFS'], fetchFn, () => {});
    expect(done[0].error).toBeUndefined();
    expect(destinationsOf(cheapestCalls(calls)[0])).toEqual(['PMI', 'TFS']);
  });
});

describe('when the warmer runs', () => {
  const cfg = { warmEveryMs: 30 * 60000, cmsCheckMs: 5 * 60000 };
  const t0 = Date.parse('2026-10-04T10:00:00Z');
  const started = '2026-10-04T08:00:00.000Z';
  const after = (state, mins, cacheStartedAt = started) => nextAction(state, { now: t0 + mins * 60000, cacheStartedAt, cfg });
  const state = { lastFullAt: t0, lastCheckAt: t0, utcDate: '2026-10-04', cacheStartedAt: started };

  it('a full round first, then every 30 minutes', () => {
    expect(nextAction({}, { now: t0, cacheStartedAt: started, cfg })).toBe('full');
    expect(after(state, 29)).toBe('check');
    expect(after(state, 30)).toBe('full');
  });
  it('re-reads the homepage config every 5 minutes, otherwise waits', () => {
    expect(after(state, 3)).toBe('wait');
    expect(after(state, 5)).toBe('check');
  });
  it('a full round when the cache restarted (once it has been up a minute) and on a new UTC date', () => {
    expect(nextAction(state, { now: t0 + 60000, cacheStartedAt: new Date(t0 + 30000).toISOString(), cfg })).toBe('wait');
    expect(nextAction(state, { now: t0 + 120000, cacheStartedAt: new Date(t0 + 30000).toISOString(), cfg })).toBe('full');
    expect(nextAction({ ...state, lastFullAt: Date.parse('2026-10-04T23:50:00Z'), lastCheckAt: Date.parse('2026-10-04T23:58:00Z') },
      { now: Date.parse('2026-10-05T00:00:30Z'), cacheStartedAt: started, cfg })).toBe('full');
  });
});

describe('a minute of the warmer (runTick)', () => {
  const linksWarmed = (calls) => new Set(cheapestCalls(calls).map((c) => (c.opts.method === 'POST' ? 'POST' : new URL(c.url).searchParams.get('destinations'))));
  const at = Date.parse('2026-10-04T10:00:00Z');

  it('the homepage config down on the first run: warms the empty search, then the rest once it loads', async () => {
    let down = true;
    const { fetchFn, calls } = fakeServers({ cmsFail: () => down });
    const state = initialState();
    expect(await runTick(state, CFG, fetchFn, () => {}, at)).toBe('full');
    expect(cheapestCalls(calls)).toHaveLength(6);                 // the empty search (its package form: nothing to warm)
    down = false;
    calls.length = 0;
    expect(await runTick(state, CFG, fetchFn, () => {}, at + 5 * 60000)).toBe('check');
    // categories + the tab are new, but Flight + Hotel links: no SunSkyCache requests
    expect(cheapestCalls(calls)).toHaveLength(0);
    expect(linksWarmed(calls)).toEqual(new Set());
  });

  it('nothing new in the config at a check: no requests', async () => {
    const { fetchFn, calls } = fakeServers();
    const state = initialState();
    await runTick(state, CFG, fetchFn, () => {}, at);
    calls.length = 0;
    expect(await runTick(state, CFG, fetchFn, () => {}, at + 5 * 60000)).toBe('check');
    expect(cheapestCalls(calls)).toHaveLength(0);
  });

  it('the cache unreachable: does nothing, tries again next minute', async () => {
    const { fetchFn, calls } = fakeServers({ cacheDown: true });
    const state = initialState();
    expect(await runTick(state, CFG, fetchFn, () => {}, at)).toBe('unreachable');
    expect(cheapestCalls(calls)).toHaveLength(0);
    expect(state.lastFullAt).toBe(0);
  });
});
