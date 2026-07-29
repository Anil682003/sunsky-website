import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

// ── Module mocks ──────────────────────────────────────────────────────────────
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateSpy,
}));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(() => Promise.resolve()),
  removeFavourite: vi.fn(() => Promise.resolve()),
}));
// The content-filter API (admin) is a separate transport from the price cache (fetch). Stubbed
// so these tests exercise the PRICE contract deterministically, with no real axios traffic.
// `facetCalls` records what was asked for, so the payload opt-ins can be asserted, and
// `facetLists` lets a test hand the sidebar real facet rows to render checkboxes from.
const facetCalls = [];
const NO_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
let facetLists = NO_FACETS;
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope, filters, opts = {}) => {
    facetCalls.push({ scope, filters, opts });
    return Promise.resolve({
      scope: { countries: scope.countries ?? [], destinations: scope.destinations ?? [], hotelCount: 0 },
      matchedDestinations: scope.destinations ?? [],
      included: { hotelCodes: Boolean(opts.codes), attributes: Boolean(opts.codes && opts.attrs) },
      ...(opts.codes ? { hotelCodes: [] } : {}),
      facets: facetLists,
    });
  }),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  // The Where filter's ScopePicker resolves zones on mount; a factory that omits an export the
  // tree imports throws at render, not at import, so every test in the file fails at once.
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

// ── Fixture: hotels as RATE POOLS, not pre-picked winners ─────────────────────
// This is the crux. The real cache stores many rates per hotel and picks the
// cheapest one that MATCHES the active filters. A hotel whose cheapest rate is
// Room-Only can still have an All-Inclusive rate deeper in the pool — which is
// exactly why filtering client-side over already-picked winners is wrong.
//
// Hotels 1-24 are cheap Room-Only. Only hotels 90-93 carry AI rates, and they are
// expensive enough to fall outside the unfiltered first page. So:
//   unfiltered page 1  -> zero AI hotels
//   boards=AI          -> the four AI hotels
// A client-side board filter would return NOTHING here. That's the regression.
const HOTELS = [
  ...Array.from({ length: 24 }, (_, i) => ({
    hotelCode: String(100 + i),
    hotelName: `Cheap Hotel ${i + 1}`,
    rates: [
      { board: 'RO', roomType: 'DBL', classification: 'NOR', amount: 60 + i * 10 },
      { board: 'BB', roomType: 'TWN', classification: 'NRF', amount: 300 + i * 10 },
    ],
  })),
  { hotelCode: '90', hotelName: 'Resort Alpha', rates: [
    { board: 'AI',  roomType: 'DBL', classification: 'NOR', amount: 800 },
    { board: 'RO',  roomType: 'DBL', classification: 'NOR', amount: 700 },
  ]},
  { hotelCode: '91', hotelName: 'Resort Beta', rates: [
    { board: 'AI',  roomType: 'SUI', classification: 'NRP', amount: 900 },
  ]},
  { hotelCode: '92', hotelName: 'Resort Gamma', rates: [
    { board: 'AI',  roomType: 'JSU', classification: 'NOR', amount: 1200 },
    { board: 'HB',  roomType: 'DBL', classification: 'NOR', amount: 1000 },
  ]},
  { hotelCode: '93', hotelName: 'Resort Delta', rates: [
    { board: 'UAI', roomType: 'DBL', classification: 'NRF', amount: 2000 },
  ]},
];

const NON_REFUNDABLE = new Set(['NRF', 'NRP']);
const PAGE = 20;

// Records every request the component made, so tests can assert the exact contract.
let calls = [];
let latency = () => 0;          // per-URL delay, for race-condition tests
let internalSource = () => false;

/**
 * Stand-in for GET /contracts/cheapest. Mirrors the real controller: filter the
 * rate pool, pick each hotel's cheapest surviving rate, sort globally, THEN slice
 * the page (so appended pages stay ordered).
 */
function cheapest(qs) {
  const csv = (k) => (qs.get(k) ? qs.get(k).split(',') : []);
  const boards    = csv('boards');
  const roomTypes = csv('roomTypes');
  const refundable = qs.get('refundable') ?? 'any';
  const minPrice = qs.get('minPrice') ? Number(qs.get('minPrice')) : null;
  const maxPrice = qs.get('maxPrice') ? Number(qs.get('maxPrice')) : null;
  const perPersonBasis = qs.get('priceBasis') === 'perPerson';
  const desc = qs.get('sortBy') === 'price_desc';
  const page = Number(qs.get('page') ?? 1);
  const totalPax = (Number(qs.get('adults')) || 1) + (Number(qs.get('children')) || 0);

  const winners = [];
  for (const h of HOTELS) {
    const ok = h.rates.filter((r) => {
      if (boards.length && !boards.includes(r.board)) return false;
      if (roomTypes.length && !roomTypes.includes(r.roomType)) return false;
      const isRef = !NON_REFUNDABLE.has(r.classification);
      if (refundable === 'yes' && !isRef) return false;
      if (refundable === 'no' && isRef) return false;
      return true;
    });
    if (!ok.length) continue;
    const best = ok.reduce((m, r) => (r.amount < m.amount ? r : m));
    const perPerson = Math.round((best.amount / totalPax) * 100) / 100;
    const basis = perPersonBasis ? perPerson : best.amount;
    if (minPrice != null && basis < minPrice) continue;
    if (maxPrice != null && basis > maxPrice) continue;

    winners.push({
      hotelCode: h.hotelCode,
      hotelName: h.hotelName,
      // Deliberately alternate the field name: the real API returns `boardCode` on
      // external results and `board` on internal ones, and combined mixes both.
      ...(internalSource(h) ? { board: best.board } : { boardCode: best.board }),
      roomType: best.roomType,
      classification: best.classification,
      refundable: !NON_REFUNDABLE.has(best.classification),
      totalAmount: best.amount,
      perPerson,
      currency: 'EUR',
      nightlyBreakdown: [],
    });
  }
  winners.sort((a, b) => (desc ? b.totalAmount - a.totalAmount : a.totalAmount - b.totalAmount));

  // Board facets are what the sidebar's Board Type list is built from: every board present in
  // the SEARCH (not just on this page), with a hotel count. The real controller derives them
  // from the whole rate pool, so they stay stable while the user ticks boards — otherwise
  // filtering to AI would delete every other option and there would be no way back.
  const boardFacets = {};
  for (const h of HOTELS) {
    for (const b of new Set(h.rates.map((r) => r.board))) boardFacets[b] = (boardFacets[b] ?? 0) + 1;
  }

  const start = (page - 1) * PAGE;
  const items = winners.slice(start, start + PAGE);
  return {
    destination: qs.get('destination'), checkIn: qs.get('checkIn'), checkOut: qs.get('checkOut'),
    nights: 3, count: items.length, results: items,
    cheapest: winners[0] ?? null,
    boardFacets,
    total: winners.length,
    page, pageSize: PAGE, hasMore: winners.length > start + PAGE,
    diagnostics: { candidateCount: winners.length, rejectedByCNEM: 0, rejectedByCNES: 0 },
  };
}

beforeEach(() => {
  calls = [];
  facetCalls.length = 0;
  facetLists = NO_FACETS;
  latency = () => 0;
  internalSource = () => false;
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }
    const qs = new URL(u).searchParams;
    calls.push(qs);
    const body = cheapest(qs);
    const delay = latency(qs);
    return new Promise((resolve, reject) => {
      // Honour AbortController so the "stale request" paths are genuinely exercised.
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
        });
      }
      setTimeout(() => resolve({ ok: true, json: () => Promise.resolve(body) }), delay);
    });
  });
});

const renderResults = (query = '?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1') =>
  render(<MemoryRouter initialEntries={[`/results${query}`]}><Results /></MemoryRouter>);

const lastCall = () => calls[calls.length - 1];
const cards = () => screen.queryAllByRole('article');
// The sidebar and the mobile drawer both render the same controls; the sidebar is first.
// Facet-driven checkboxes (boards, holiday types, facilities…) carry their hotel count in the
// label — "All Inclusive (4)" — while static ones (room types) do not. Accept either so a test
// names the filter, not its current count.
const sidebarCheck = (name) => {
  const exact = screen.queryAllByRole('checkbox', { name });
  if (exact.length) return exact[0];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getAllByRole('checkbox', { name: new RegExp(`^${escaped}\\s*\\(\\d+\\)$`) })[0];
};
const sidebarRadio = (name) => screen.getAllByRole('radio', { name })[0];

// Room Type ships collapsed (like the old Rate Type section did), so open it first.
const openRoomType = async (user) => {
  await user.click(screen.getAllByText('Room Type')[0]);
};

// jsdom cannot drag a range thumb, and userEvent refuses to click an element with
// pointer-events:none (which the overlaid dual-slider inputs deliberately have).
// Setting .value + firing change is the supported way to exercise a range input.
const slider = (label) =>
  screen.getAllByRole('slider').find((s) => s.getAttribute('aria-label') === label);
const dragSlider = (label, value) => {
  const el = slider(label);
  fireEvent.change(el, { target: { value: String(value) } });
  return el;
};

const settled = async () => {
  await waitFor(() => expect(screen.queryByText(/Searching the best deals/)).not.toBeInTheDocument());
};

// ══════════════════════════════════════════════════════════════════════════════

describe('initial load', () => {
  it('fetches page 1 and renders the cheapest 20 stays', async () => {
    renderResults();
    await settled();
    expect(cards()).toHaveLength(20);
    // The count is split across elements (<strong>20+</strong> stays found).
    expect(screen.getByText((_, el) => el?.textContent?.trim() === '20+ stays found')).toBeTruthy();
  });

  it('omits every filter param at defaults, so the cache takes its fast path', async () => {
    renderResults();
    await settled();
    const q = calls[0];
    for (const k of ['boards', 'roomTypes', 'minPrice', 'maxPrice', 'priceBasis', 'refundable', 'sortBy']) {
      expect(q.get(k), `${k} should be absent when at its default`).toBeNull();
    }
    expect(q.get('page')).toBe('1');
    expect(q.get('source')).toBe('combined');
  });

  it('does not fire a second request from the debounce on mount', async () => {
    renderResults();
    await settled();
    await new Promise((r) => setTimeout(r, 500));   // outlive the 300ms debounce
    expect(calls.filter((c) => c.get('page') === '1')).toHaveLength(1);
  });
});

describe('board field regression (boardCode vs board)', () => {
  it('reads boardCode on external results', async () => {
    internalSource = () => false;
    renderResults();
    await settled();
    expect(within(cards()[0]).getByText('Room Only')).toBeInTheDocument();
  });

  it('reads board on internal results', async () => {
    internalSource = () => true;    // internal shape: `board`, not `boardCode`
    renderResults();
    await settled();
    expect(within(cards()[0]).getByText('Room Only')).toBeInTheDocument();
  });
});

describe('board filter', () => {
  it('sends boards=AI and surfaces AI hotels that are absent from the unfiltered page', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    // Precondition: no All-Inclusive stay appears anywhere in the RESULTS.
    // (Scoped to the cards — "All Inclusive" is also the sidebar checkbox label.)
    expect(cards().some((c) => within(c).queryByText('All Inclusive'))).toBe(false);

    await user.click(sidebarCheck('All Inclusive'));
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));
    await waitFor(() => expect(cards()).toHaveLength(3));   // 90, 91, 92 carry AI

    // The old client-side filter produced zero results here.
    expect(cards().length).toBeGreaterThan(0);
    expect(screen.getByText('Resort Alpha')).toBeInTheDocument();
  });

  it('picks the cheapest MATCHING rate, not the hotel’s overall cheapest', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));
    // Wait for the request FIRST, then for the render. Ticking a filter costs a 300ms debounce
    // plus a round trip; folding both into one waitFor puts them inside a single 1s budget,
    // which is enough on an idle machine and not enough under full-suite load.
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));
    await waitFor(() => expect(cards()).toHaveLength(3));

    // Resort Alpha's cheapest rate overall is RO @700, but its AI rate is 800.
    // Under an AI filter the card must show 800.
    const alpha = cards().find((c) => within(c).queryByText('Resort Alpha'));
    expect(within(alpha).getByText(/800/)).toBeInTheDocument();
    expect(within(alpha).queryByText(/700/)).not.toBeInTheDocument();
  });

  it('CSVs multiple boards', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));
    await user.click(sidebarCheck('Half Board'));
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI,HB'));
  });

  it('unticking removes the param entirely', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));
    await user.click(sidebarCheck('All Inclusive'));
    await waitFor(() => expect(lastCall().get('boards')).toBeNull());
  });
});

describe('room type filter', () => {
  it('sends the real inventory codes (SUI/JSU), not the demo’s STE/JNR', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await openRoomType(user);
    await user.click(sidebarCheck('Suite'));
    await waitFor(() => expect(lastCall().get('roomTypes')).toBe('SUI'));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.getByText('Resort Beta')).toBeInTheDocument();
  });

  it('offers no room code that the inventory never contains', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await openRoomType(user);
    // Every advertised code must be reachable — a filter that can never match is a dead end.
    const REAL = new Set(HOTELS.flatMap((h) => h.rates.map((r) => r.roomType)));
    for (const dead of ['STE', 'JNR', 'TRP']) {
      expect(REAL.has(dead), `${dead} is not a real code`).toBe(false);
      expect(screen.queryByRole('checkbox', { name: dead })).not.toBeInTheDocument();
    }
    // And the real ones ARE offered.
    expect(sidebarCheck('Suite')).toBeInTheDocument();
    expect(sidebarCheck('Junior Suite')).toBeInTheDocument();
  });
});

describe('cancellation filter', () => {
  it('sends refundable=no and shows only non-refundable stays', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarRadio('Non-ref.'));
    await waitFor(() => expect(lastCall().get('refundable')).toBe('no'));
    // The "Non-Refundable" card chip was removed by design; the server-side filter guarantees
    // every returned card is non-refundable, so the presence of results is the check.
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
  });

  // (The former "NRP flagged as non-refundable" test asserted the card's Non-Refundable chip,
  //  which was removed by design. NRP-vs-NRF classification is the cache's concern, not the
  //  frontend's — the frontend only sends refundable=no — so there's no UI behaviour left to
  //  assert here.)

  it('returns to any', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarRadio('Non-ref.'));
    await waitFor(() => expect(lastCall().get('refundable')).toBe('no'));
    await user.click(sidebarRadio('Any'));
    await waitFor(() => expect(lastCall().get('refundable')).toBeNull());
  });
});

describe('sort', () => {
  it('sends sortBy=price_desc and reorders', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort results' }), 'price_desc');
    await waitFor(() => expect(lastCall().get('sortBy')).toBe('price_desc'));
    await waitFor(() => expect(within(cards()[0]).getByText('Resort Delta')).toBeInTheDocument());
  });

  it('sorts by name A→Z client-side over the loaded results', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort results' }), 'name_asc');
    // Name/star sorts are client-side (the cache orders by price), so no sortBy is sent — the
    // loaded cards just re-order. "Cheap Hotel 1" is alphabetically first.
    await waitFor(() => expect(within(cards()[0]).getByText('Cheap Hotel 1')).toBeInTheDocument());
    expect(lastCall().get('sortBy')).toBeNull();
  });
});

describe('multiple filters together', () => {
  it('combines board + cancellation into a single request', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));   // boards=AI
    await user.click(sidebarRadio('Non-ref.'));        // refundable=no
    await waitFor(() => {
      const q = lastCall();
      expect(q.get('boards')).toBe('AI');
      expect(q.get('refundable')).toBe('no');
    });
  });

  it('keeps the Best Value badge on the globally cheapest stay even under high-to-low', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort results' }), 'price_desc');
    await waitFor(() => expect(lastCall().get('sortBy')).toBe('price_desc'));
    await waitFor(() => expect(within(cards()[0]).getByText('Resort Delta')).toBeInTheDocument());
    // The badge must NOT land on the first (most expensive) card.
    expect(within(cards()[0]).queryByText('Best Value')).not.toBeInTheDocument();
    expect(screen.queryByText('Best Value')).not.toBeInTheDocument(); // cheapest (60) is on a later page
  });
});

describe('price range', () => {
  it('omits a max parked at the ceiling, so later pricier pages are not excluded', async () => {
    renderResults();
    await settled();
    expect(calls[0].get('maxPrice')).toBeNull();

    // Explicitly park the max at the ceiling: it must STILL be omitted, otherwise
    // the cap would silently exclude the pricier hotels on pages 2+.
    const max = slider('Maximum price');
    dragSlider('Maximum price', max.max);
    await new Promise((r) => setTimeout(r, 400));
    expect(lastCall().get('maxPrice')).toBeNull();
  });

  it('sends minPrice and filters the results', async () => {
    renderResults();
    await settled();
    dragSlider('Minimum price', 200);
    await waitFor(() => expect(lastCall().get('minPrice')).toBe('200'));
    await waitFor(() => {
      // Headline price renders as "€1,234.56" (symbol) — older cards said "EUR1234.56".
      const prices = cards().map((c) => Number(c.textContent.match(/(?:€|EUR)\s*([\d,.]+)/)[1].replace(/,/g, '')));
      expect(Math.min(...prices)).toBeGreaterThanOrEqual(200);
    });
  });

  it('sends maxPrice below the ceiling and filters the results', async () => {
    renderResults();
    await settled();
    dragSlider('Maximum price', 150);
    await waitFor(() => expect(lastCall().get('maxPrice')).toBe('150'));
    await waitFor(() => {
      // Headline price renders as "€1,234.56" (symbol) — older cards said "EUR1234.56".
      const prices = cards().map((c) => Number(c.textContent.match(/(?:€|EUR)\s*([\d,.]+)/)[1].replace(/,/g, '')));
      expect(Math.max(...prices)).toBeLessThanOrEqual(150);
    });
  });

  it('never lets the min handle cross the max', async () => {
    renderResults();
    await settled();
    const ceil = Number(slider('Maximum price').max);

    dragSlider('Maximum price', ceil - 100);
    await waitFor(() => expect(lastCall().get('maxPrice')).toBe(String(ceil - 100)));

    // Slam the min handle way past the max.
    dragSlider('Minimum price', ceil * 5);
    await waitFor(() => {
      expect(Number(slider('Minimum price').value)).toBeLessThan(Number(slider('Maximum price').value));
    });
    // And the request must never carry an impossible min > max window.
    await new Promise((r) => setTimeout(r, 400));
    const min = Number(lastCall().get('minPrice') ?? 0);
    const max = Number(lastCall().get('maxPrice') ?? Infinity);
    expect(min).toBeLessThan(max);
  });

  it('never lets the max handle cross the min', async () => {
    renderResults();
    await settled();
    const ceil = Number(slider('Maximum price').max);

    dragSlider('Minimum price', ceil - 100);
    await waitFor(() => expect(lastCall().get('minPrice')).toBe(String(ceil - 100)));

    dragSlider('Maximum price', 0);
    await waitFor(() => {
      expect(Number(slider('Maximum price').value)).toBeGreaterThan(Number(slider('Minimum price').value));
    });
  });

  it('clamps a max dragged past the ceiling and treats it as unbounded', async () => {
    renderResults();
    await settled();
    const ceil = Number(slider('Maximum price').max);

    dragSlider('Maximum price', ceil * 10);
    await new Promise((r) => setTimeout(r, 400));
    expect(Number(slider('Maximum price').value)).toBe(ceil);
    expect(lastCall().get('maxPrice')).toBeNull();
  });

  it('tracks the ceiling to the real price range rather than a fixed span', async () => {
    renderResults();
    await settled();
    // Page 1 tops out at 250 (cheap hotels 60..250 in 10s), so the track must end there,
    // not at some arbitrary constant that squashes the useful range into a corner.
    expect(Number(slider('Maximum price').max)).toBe(250);
  });
});

describe('price basis', () => {
  it('sends priceBasis=perPerson and clears any bounds set on the total scale', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    dragSlider('Minimum price', 200);
    await waitFor(() => expect(lastCall().get('minPrice')).toBe('200'));

    await user.click(sidebarRadio('Per person'));
    await waitFor(() => expect(lastCall().get('priceBasis')).toBe('perPerson'));
    // Bounds must not carry across scales — €200 total is not €200 per person.
    expect(lastCall().get('minPrice')).toBeNull();
    expect(lastCall().get('maxPrice')).toBeNull();
  });

  it('regrows the slider ceiling on the per-person scale instead of stranding it', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    const totalCeiling = Number(slider('Maximum price').max);

    await user.click(sidebarRadio('Per person'));
    await waitFor(() => expect(lastCall().get('priceBasis')).toBe('perPerson'));

    // 2 adults -> per-person prices are half the total, so the ceiling must come down.
    await waitFor(() => {
      expect(Number(slider('Maximum price').max)).toBeLessThan(totalCeiling);
    });
  });
});

describe('debounce + request ordering', () => {
  it('collapses a burst of toggles into one committed request', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    const before = calls.length;

    // Boards offered are exactly those the cache reported for this search, so pick three the
    // fixture actually contains — "Full Board" is not one of them.
    await user.click(sidebarCheck('All Inclusive'));
    await user.click(sidebarCheck('Half Board'));
    await user.click(sidebarCheck('Ultra All Inclusive'));

    await waitFor(() => expect(lastCall().get('boards')).toBe('AI,HB,UAI'));
    await new Promise((r) => setTimeout(r, 400));
    // Three clicks inside the debounce window must not mean three round-trips.
    expect(calls.length - before).toBeLessThanOrEqual(2);
  });

  it('ignores a slow stale response that lands after a newer one', async () => {
    const user = userEvent.setup();
    // The AI request is slow; whatever supersedes it is fast. If the stale response
    // were applied, we would end up rendering the AI result set.
    latency = (qs) => (qs.get('boards') === 'AI' ? 400 : 0);

    renderResults();
    await settled();

    await user.click(sidebarCheck('All Inclusive'));      // slow, in flight
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));
    await user.click(sidebarCheck('All Inclusive'));      // untick -> fast, supersedes
    await waitFor(() => expect(lastCall().get('boards')).toBeNull());

    await new Promise((r) => setTimeout(r, 700));         // let the stale one land

    // Must still show the unfiltered set, not the 3 AI hotels.
    expect(cards()).toHaveLength(20);
    expect(screen.queryByText('Resort Alpha')).not.toBeInTheDocument();
  });
});

describe('infinite scroll', () => {
  it('loads page 2 carrying the active filters', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    await user.click(sidebarRadio('Non-ref.'));
    await waitFor(() => expect(lastCall().get('refundable')).toBe('no'));
    await waitFor(() => expect(cards()).toHaveLength(20));

    globalThis.__IO__.trigger();

    await waitFor(() => {
      const p2 = calls.find((c) => c.get('page') === '2');
      expect(p2).toBeTruthy();
      expect(p2.get('refundable')).toBe('no');   // page 2 must not silently drop the filter
    });
  });

  it('appends page 2 in price order', async () => {
    renderResults();
    await settled();
    expect(cards()).toHaveLength(20);

    globalThis.__IO__.trigger();
    await waitFor(() => expect(cards().length).toBeGreaterThan(20));

    const prices = cards().map((c) => {
      const t = c.textContent.match(/(?:€|EUR)\s*([\d,.]+)/);
      return t ? Number(t[1].replace(/,/g, '')) : 0;
    });
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it('does not duplicate hotels across pages', async () => {
    renderResults();
    await settled();
    globalThis.__IO__.trigger();
    await waitFor(() => expect(cards().length).toBeGreaterThan(20));
    const names = cards().map((c) => within(c).getAllByRole('heading')[0].textContent);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('clear all + empty state', () => {
  it('shows an active-filter count and clears everything', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    await user.click(sidebarCheck('All Inclusive'));
    await user.click(sidebarRadio('Non-ref.'));
    await waitFor(() => expect(screen.getAllByText('2')[0]).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /clear all/i })[0]);
    await waitFor(() => {
      expect(lastCall().get('boards')).toBeNull();
      expect(lastCall().get('refundable')).toBeNull();
    });
    await waitFor(() => expect(cards()).toHaveLength(20));
  });

  it('offers a way out when a filter combination matches nothing', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    // No hotel has a UAI rate in a Suite.
    await user.click(sidebarCheck('Ultra All Inclusive'));
    await openRoomType(user);
    await user.click(sidebarCheck('Suite'));
    await waitFor(() => expect(screen.getByText('No results found')).toBeInTheDocument());

    expect(screen.getByText(/No stays match your filters/)).toBeInTheDocument();
    const escape = screen.getByRole('button', { name: /clear all filters/i });
    await user.click(escape);
    await waitFor(() => expect(cards()).toHaveLength(20));
  });
});

describe('search change', () => {
  it('resets the price bounds, so the slider ceiling cannot get stranded', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    dragSlider('Minimum price', 200);
    await waitFor(() => expect(lastCall().get('minPrice')).toBe('200'));

    // Add a guest and re-search: a price bound from the old occupancy is meaningless.
    await user.click(screen.getAllByRole('button', { name: '+' })[0]);
    await user.click(screen.getAllByRole('button', { name: /update search/i })[0]);

    await waitFor(() => expect(lastCall().get('adults')).toBe('3'));
    expect(lastCall().get('minPrice')).toBeNull();
    expect(lastCall().get('maxPrice')).toBeNull();

    // ...and exactly one request went out — no stale-bounds request followed by a clean one.
    const adults3 = calls.filter((c) => c.get('adults') === '3');
    expect(adults3).toHaveLength(1);
  });

  it('keeps non-price filters across a re-search', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));

    await user.click(screen.getAllByRole('button', { name: /update search/i })[0]);
    await waitFor(() => expect(lastCall().get('boards')).toBe('AI'));
  });
});

describe('resilience', () => {
  it('renders an empty state instead of crashing when the API fails', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    renderResults();
    await waitFor(() => expect(screen.getByText('No results found')).toBeInTheDocument());
  });

  // An empty search used to dead-end on "Select a destination". It now lands on a curated set
  // of popular sun destinations that actually have priced inventory, cheapest-first — the
  // traveller sees deals immediately and narrows from the Where filter.
  it('falls back to popular destinations when no place is supplied', async () => {
    renderResults('?');
    await settled();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(lastCall().get('destinations').split(',')).toEqual(
      ['PMI', 'TFS', 'AGP', 'AYT', 'RAK', 'LPA', 'HRG', 'ALC']);
    expect(screen.getAllByText('Popular destinations').length).toBeGreaterThan(0);
    expect(cards().length).toBeGreaterThan(0);
  });

  // The empty-search teaser uses the FAST external-only cache path. The slow half of a
  // 'combined' search is Diana (SOAP): an 8-destination combined search measured ~17s cold and
  // tripped the cache gateway → the 502 the user hit. The teaser doesn't need the secondary
  // supplier, so it must not pay that cost.
  it('prices the empty-search teaser with the fast external-only source', async () => {
    renderResults('?');
    await settled();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(lastCall().get('source')).toBe('external');
  });

  it('keeps the full combined supplier set for a real, place-specific search', async () => {
    renderResults('?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1');
    await settled();
    expect(lastCall().get('source')).toBe('combined');
  });
});

// The content API is asked for the big optional payloads ONLY when the page will use them.
// Getting this wrong is invisible in the UI and costs ~1 MB per request on a country search.
describe('content-facet payload opt-ins', () => {
  const lastFacetCall = () => facetCalls[facetCalls.length - 1];

  it('asks for neither hotelCodes nor attributes on a plain search', async () => {
    renderResults();
    await settled();
    expect(lastFacetCall().opts).toMatchObject({ codes: false, attrs: false });
  });

  it('asks for hotelCodes once a content facet is selected', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(screen.getAllByText('Adults only')[0]);   // section ships collapsed
    await user.click(sidebarCheck('Adults-only hotels'));
    await waitFor(() => expect(lastFacetCall().opts.codes).toBe(true));
    expect(lastFacetCall().filters.adultsOnly).toBe(true);
  });

  it('asks for attributes only when a distance sort is chosen', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    expect(lastFacetCall().opts.attrs).toBe(false);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort results' }), 'distance_beach');
    await waitFor(() => expect(lastFacetCall().opts.attrs).toBe(true));
  });
});

// The homepage vacation-type cards link into a PRE-FILTERED search. The sidebar checkboxes
// compare their facet id by identity against the filter array, so a value seeded with the wrong
// type narrows the results while its box stays unticked — the traveller sees a short list with
// no visible reason and no way to undo it. Every case below is about that boundary.
describe('URL-seeded filters (vacation-type cards)', () => {
  const lastFacetCall = () => facetCalls[facetCalls.length - 1];
  const seeded = (extra) =>
    `?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1&${extra}`;

  // Facet rows as the content API returns them: ids are NUMBERS, and an activity row carries the
  // group it came from. 620 appears twice on purpose — the activity groups reuse codes, which is
  // why a card stores "74:620" rather than a bare 620.
  const SEED_FACETS = {
    ...NO_FACETS,
    stars: [{ stars: 5, hotels: 12 }, { stars: 4, hotels: 30 }],
    facilities: [{ code: 574, name: 'Private beach area', hotels: 9 }],
    accommodation: [{ code: 2, name: 'apartment', hotels: 7 }],
    activities: [
      { code: 620, name: 'Spa centre', group: 'Health',        groupCode: 74, hotels: 8 },
      { code: 620, name: 'Waterpark',  group: 'Entertainment', groupCode: 73, hotels: 3 },
      { code: 390, name: 'Golf',       group: 'Sports',        groupCode: 90, hotels: 4 },
    ],
    beachDistance: [{ maxMetres: 500, hotels: 6 }],
  };
  const openSection = (user, title) => user.click(screen.getAllByText(title)[0]);

  it('seeds a star rating as a NUMBER, so its checkbox renders checked', async () => {
    facetLists = SEED_FACETS;
    renderResults(seeded('stars=5'));
    await settled();

    const stars = lastFacetCall().filters.stars;
    expect(stars).toEqual([5]);
    // A string "5" would still filter — and leave the box below unticked.
    expect(stars.map((s) => typeof s)).toEqual(['number']);
    expect(sidebarCheck('★★★★★ 5-star')).toBeChecked();
    expect(sidebarCheck('★★★★ 4-star')).not.toBeChecked();
  });

  it('drops a star value no facet row could ever show', async () => {
    renderResults(seeded('stars=9'));
    await settled();
    expect(lastFacetCall().filters.stars).toEqual([]);
  });

  it('seeds facility and accommodation codes as numbers and ticks their boxes', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('facilities=574&accommodation=2'));
    await settled();

    expect(lastFacetCall().filters.facilities).toEqual([574]);
    expect(lastFacetCall().filters.accommodation).toEqual([2]);

    await openSection(user, 'Facilities');
    expect(sidebarCheck('Private beach area')).toBeChecked();
    await openSection(user, 'Accommodation Type');
    expect(sidebarCheck('Apartment')).toBeChecked();
  });

  it('keeps a group-qualified activity a string and a bare one a number', async () => {
    renderResults(seeded('activities=74:620,390'));
    await settled();
    expect(lastFacetCall().filters.activities).toEqual(['74:620', 390]);
  });

  it('ticks the sidebar box for a group-qualified activity', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('activities=74:620'));
    await settled();
    await openSection(user, 'Activities');
    expect(sidebarCheck('Spa centre')).toBeChecked();
    expect(sidebarCheck('Golf')).not.toBeChecked();
    // Waterpark shares code 620 with Spa centre. Identity that ignored the group would tick this
    // box for a filter that excludes waterparks — the sidebar claiming a filter that is not on.
    expect(sidebarCheck('Waterpark')).not.toBeChecked();
  });

  it('keeps two activities that share a code independent', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('activities=74:620'));
    await settled();
    await openSection(user, 'Activities');

    // Code-only identity would treat this as "already on" and REMOVE the spa filter the traveller
    // arrived with, from a box they had not ticked.
    await user.click(sidebarCheck('Waterpark'));
    await waitFor(() => expect(lastFacetCall().filters.activities).toEqual(['74:620', '73:620']));
    expect(sidebarCheck('Spa centre')).toBeChecked();

    await user.click(sidebarCheck('Spa centre'));
    await waitFor(() => expect(lastFacetCall().filters.activities).toEqual(['73:620']));
    expect(sidebarCheck('Waterpark')).toBeChecked();
  });

  it('stores the qualified form when an activity is ticked in the sidebar', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults();
    await settled();

    await openSection(user, 'Activities');
    await user.click(sidebarCheck('Golf'));
    // Bare 390 would also match group 73/74; the count beside the box is group 90 only.
    await waitFor(() => expect(lastFacetCall().filters.activities).toEqual(['90:390']));

    await user.click(sidebarCheck('Golf'));
    await waitFor(() => expect(lastFacetCall().filters.activities).toEqual([]));
  });

  it('seeds a max distance as metres, not as a string', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('maxBeach=500'));
    await settled();

    expect(lastFacetCall().filters.maxBeach).toBe(500);
    await openSection(user, 'Distance');
    expect(sidebarCheck('≤ 500 m')).toBeChecked();
  });

  it('still seeds the board and adults-only params the older cards link with', async () => {
    renderResults(seeded('boards=ai&adultsOnly=yes'));
    await settled();
    expect(lastCall().get('boards')).toBe('AI');
    expect(lastFacetCall().filters.adultsOnly).toBe(true);
  });

  it('names what the card applied and takes exactly those filters back off', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('stars=5&facilities=574&cardLabel=Barefoot%20Luxury&filterLabels=5-star%7CPrivate%20beach'));
    await settled();

    expect(screen.getByText('Barefoot Luxury')).toBeInTheDocument();
    expect(screen.getByText('5-star')).toBeInTheDocument();
    expect(screen.getByText('Private beach')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove these filters/i }));
    await waitFor(() => expect(lastFacetCall().filters.stars).toEqual([]));
    expect(lastFacetCall().filters.facilities).toEqual([]);
    expect(screen.queryByText('Barefoot Luxury')).not.toBeInTheDocument();
  });

  it('falls back to the facet names when the link carries no labels', async () => {
    facetLists = SEED_FACETS;
    renderResults(seeded('facilities=574'));
    await settled();
    await waitFor(() => expect(screen.getByText('Private beach area')).toBeInTheDocument());
  });

  it('withdraws the summary once the filters it names are gone', async () => {
    const user = userEvent.setup();
    facetLists = SEED_FACETS;
    renderResults(seeded('stars=5&cardLabel=Five%20Star'));
    await settled();

    expect(screen.getByText('Five Star')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /clear all/i })[0]);
    await waitFor(() => expect(screen.queryByText('Five Star')).not.toBeInTheDocument());
  });

  it('leaves the results untouched when the URL carries no filters', async () => {
    renderResults();
    await settled();
    expect(screen.queryByRole('button', { name: /remove these filters/i })).not.toBeInTheDocument();
    expect(lastCall().get('boards')).toBeNull();
  });
});
