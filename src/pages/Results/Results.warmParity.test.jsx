import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';
import { categoriesShowAllUrl, destinationTabs, EMPTY_SEARCH_URLS, showAllSearchUrls } from '../../utils/showAllSearches';
import { cacheRequestsForLink, linkScope } from '../../utils/warmSearches';

/**
 * The "Show all" warmer must send EXACTLY the cache requests the results page sends for each
 * homepage "Show all" link: the cache keys a search on every input, so a request that differs in
 * any one of them warms a search no visitor makes. This renders the real page for every link,
 * records what it asks the cache, and requires the warmer's requests (utils/warmSearches) to be
 * identical — page 1 and every Travel-time count.
 */

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(() => Promise.resolve()),
  removeFavourite: vi.fn(() => Promise.resolve()),
}));

// What the admin resolves a scope to: its own cities, or a country's cities.
const COUNTRY_CITIES = { TR: ['AYT', 'BJV', 'DLM', 'IST'], ES: ['AGP', 'BCN', 'PMI', 'TFS', 'VLC'], GR: ['ATH', 'RHO'] };
const matched = (scope) => [...new Set([...(scope.destinations ?? []), ...(scope.countries ?? []).flatMap((c) => COUNTRY_CITIES[c] ?? [])])];
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope) => Promise.resolve({
    scope: { countries: scope.countries ?? [], destinations: scope.destinations ?? [], hotelCount: 0 },
    matchedDestinations: matched(scope),
    included: { hotelCodes: false, attributes: false },
    facets: { holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [], review: [] },
  })),
  fetchCountries: vi.fn(() => Promise.resolve([])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  fetchPackages: vi.fn(() => Promise.resolve({ hotels: [], hasMore: false, destinationStatus: {}, boardFacets: {} })),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

const CACHE = 'https://cache.holidaybooking.be';
const ALL = ['AGP', 'ATH', 'AYT', 'BCN', 'BJV', 'DLM', 'IST', 'LON', 'PMI', 'RHO', 'ROE', 'TFS', 'VLC'];

// A homepage config shaped like the dashboard's: two featured holiday types, two country tabs.
const CMS = {
  featuredHolidayTypes: [
    { holidayTypeId: 1, title: 'Zonvakanties', destinations: [{ type: 'country', code: 'TR', name: 'Turkije' }, { type: 'country', code: 'ES', name: 'Spanje' }] },
    { holidayTypeId: 2, title: 'Stedentrips', destinations: [{ type: 'city', code: 'ROE', name: 'Rome' }, { type: 'city', code: 'LON', name: 'London' }] },
  ],
  destinationTabs: [
    { tab: 'Spanje', cards: [{ name: 'Mallorca', dest: { type: 'city', code: 'PMI', name: 'Mallorca' } }, { name: 'Tenerife', dest: { type: 'city', code: 'TFS', name: 'Tenerife' } }] },
    { tab: 'Griekenland', cards: [{ name: 'Griekenland', dest: { type: 'country', code: 'GR', name: 'Griekenland' } }] },
  ],
};
const TYPES = [{ id: 1, name: 'Zonvakanties' }, { id: 2, name: 'Stedentrips' }];

// The session seed (random order, Ch 1 §2) differs per visitor and decides only the order the cache
// serves, not the priced search it caches: compared without it. Everything else must be identical.
const noSeed = ({ url, method, body }) => {
  const [path, query = ''] = url.split('?');
  const qs = new URLSearchParams(query);
  const seeded = qs.has('resultRandomSeed');
  qs.delete('resultRandomSeed');
  let b = body;
  if (b) { const o = JSON.parse(b); if ('resultRandomSeed' in o) { delete o.resultRandomSeed; b = JSON.stringify(o); } }
  return { url: query ? `${path}?${qs.toString()}` : path, method, body: b, seeded: seeded || (!!body && 'resultRandomSeed' in JSON.parse(body)) };
};

let sent = [];
beforeEach(() => {
  sent = [];
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const u = String(url);
    if (u.endsWith('/contracts/destinations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ destinations: ALL.map((code) => ({ code })) }) });
    }
    if (u.includes('/contracts/cheapest')) sent.push(noSeed({ url: u, method: opts.method || 'GET', body: opts.body ?? null }));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], total: 0, hasMore: false, boardFacets: {}, cheapest: null }) });
  });
});

const asSent = (r) => noSeed({ url: r.url, method: r.opts.method || 'GET', body: r.opts.body ?? null });
const sorted = (list) => [...list].map((r) => JSON.stringify(r)).sort();

async function pageRequests(link, expected) {
  render(<MemoryRouter initialEntries={[link]}><Results /></MemoryRouter>);
  // Page 1, then — once it is back — one count per exact length in the band.
  if (expected) await waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(expected), { timeout: 4000 });
  await new Promise((r) => setTimeout(r, expected ? 200 : 1500));      // nothing further arrives
  return sent;
}

const warmerRequests = (link) => {
  const scope = linkScope(new URLSearchParams(link.split('?')[1] || ''));
  const destinations = scope.emptySearch ? matched({ destinations: ALL }) : matched(scope);
  return cacheRequestsForLink(link, { baseUrl: CACHE, destinations }).map(asSent);
};

describe('the warmer sends exactly what the results page sends', () => {
  const links = showAllSearchUrls(CMS, TYPES);

  it('covers all three areas: the categories "Show all", every destination tab, the empty search', () => {
    expect(links).toContain(categoriesShowAllUrl(CMS, TYPES));
    for (const tab of destinationTabs(CMS)) expect(links).toContain(tab.showAllUrl);
    for (const u of EMPTY_SEARCH_URLS) expect(links).toContain(u);
    expect(links).toHaveLength(1 + 2 + EMPTY_SEARCH_URLS.length);
  });

  for (const link of showAllSearchUrls(CMS, TYPES)) {
    it(`identical requests for ${link}`, async () => {
      const warm = warmerRequests(link);
      // Flight + Hotel links ask the admin's package search, not SunSkyCache: nothing to warm.
      const pkg = new URLSearchParams(link.split('?')[1] || '').get('transport') === 'package';
      expect(warm).toHaveLength(pkg ? 0 : 6);          // else page 1 + the 5 lengths of the 6-10 days band
      const page = await pageRequests(link, warm.length);
      expect(sorted(page)).toEqual(sorted(warm));
    });
  }
});
