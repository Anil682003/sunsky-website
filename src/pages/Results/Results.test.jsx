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

  const start = (page - 1) * PAGE;
  const items = winners.slice(start, start + PAGE);
  return {
    destination: qs.get('destination'), checkIn: qs.get('checkIn'), checkOut: qs.get('checkOut'),
    nights: 3, count: items.length, results: items,
    cheapest: winners[0] ?? null,
    page, pageSize: PAGE, hasMore: winners.length > start + PAGE,
    diagnostics: { candidateCount: winners.length, rejectedByCNEM: 0, rejectedByCNES: 0 },
  };
}

beforeEach(() => {
  calls = [];
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
const sidebarCheck = (name) => screen.getAllByRole('checkbox', { name })[0];
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
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
    for (const c of cards()) expect(within(c).getByText('Non-Refundable')).toBeInTheDocument();
  });

  it('flags NRP (prepaid) as non-refundable, which a bare NRF check missed', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(sidebarCheck('All Inclusive'));
    await waitFor(() => expect(cards()).toHaveLength(3));
    // Resort Beta's only AI rate is NRP.
    const beta = cards().find((c) => within(c).queryByText('Resort Beta'));
    expect(within(beta).getByText('Non-Refundable')).toBeInTheDocument();
  });

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
    await user.selectOptions(screen.getByRole('combobox'), 'price_desc');
    await waitFor(() => expect(lastCall().get('sortBy')).toBe('price_desc'));
    await waitFor(() => expect(within(cards()[0]).getByText('Resort Delta')).toBeInTheDocument());
  });

  it('keeps the Best Value badge on the globally cheapest stay even under high-to-low', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.selectOptions(screen.getByRole('combobox'), 'price_desc');
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

    await user.click(sidebarCheck('All Inclusive'));
    await user.click(sidebarCheck('Half Board'));
    await user.click(sidebarCheck('Full Board'));

    await waitFor(() => expect(lastCall().get('boards')).toBe('AI,HB,FB'));
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

  it('prompts for a destination when none is supplied', async () => {
    renderResults('?');
    await waitFor(() => expect(screen.getByText('Select a destination')).toBeInTheDocument());
    expect(calls).toHaveLength(0);
  });
});
