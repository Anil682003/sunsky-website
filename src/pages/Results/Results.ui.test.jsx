import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
// The content-filter API (admin) is a different transport from the price cache (fetch), so it
// needs its own stub — without one these tests fire real axios requests, which is both slow
// and non-deterministic. Empty facet lists = "this scope has no content facets", which is the
// state that decides whether the optional sidebar sections render at all.
const EMPTY_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn(() => Promise.resolve({
    scope: { countries: [], destinations: ['AYT'], hotelCount: 0 },
    matchedDestinations: ['AYT'],
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  // The Where filter's ScopePicker resolves zones on mount; a factory that omits an export the
  // tree imports throws at render, not at import, so every test in the file fails at once.
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

// Board options are DYNAMIC — the sidebar lists exactly the boards the cache reports for this
// search, with counts. A response without boardFacets means "no board filter available".
const BOARD_FACETS = { RO: 4, SC: 3, BB: 6, HB: 5, FB: 2, AI: 20, UAI: 1 };

const HERE = dirname(fileURLToPath(import.meta.url));
const JSX = readFileSync(resolve(HERE, 'Results.jsx'), 'utf8');
const CSS = readFileSync(resolve(HERE, 'Results.module.css'), 'utf8');

const results = Array.from({ length: 20 }, (_, i) => ({
  hotelCode: String(200 + i), hotelName: `Hotel ${i}`, boardCode: 'AI', roomType: 'DBL',
  classification: 'NOR', refundable: true, totalAmount: 100 + i * 10, perPerson: 50 + i * 5,
  currency: 'EUR', nightlyBreakdown: [],
}));

beforeEach(() => {
  globalThis.fetch = vi.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(
        String(url).includes('/hotels/bulk')
          ? { data: [] }
          : { nights: 3, count: 20, results, cheapest: results[0], hasMore: false,
              boardFacets: BOARD_FACETS,
              diagnostics: { candidateCount: 20, rejectedByCNEM: 0, rejectedByCNES: 0 } }
      ),
    })
  );
});

const renderResults = () =>
  render(
    <MemoryRouter initialEntries={['/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1']}>
      <Results />
    </MemoryRouter>
  );

const settled = () =>
  waitFor(() => expect(screen.queryByText(/De beste deals zoeken/)).not.toBeInTheDocument());

// Board and content-facet checkboxes carry their hotel count in the label ("All Inclusive (20)"),
// so match on the name and let the count vary.
const boardCheck = (name) =>
  screen.getAllByRole('checkbox', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\d+\\)$`) })[0];

describe('stylesheet integrity', () => {
  // A `styles.foo` that has no matching `.foo` in the CSS module silently renders as
  // `undefined` -> the element loses ALL styling. This is the classic way a redesign
  // "breaks the UI" without breaking the build, so assert every reference resolves.
  it('every styles.* referenced in the JSX exists in the CSS module', () => {
    const used = new Set([...JSX.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
    const defined = new Set([...CSS.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    const missing = [...used].filter((c) => !defined.has(c));
    expect(missing, `class(es) used in JSX but absent from Results.module.css: ${missing.join(', ')}`).toEqual([]);
  });

  it('the new filter controls carry real styles, not undefined class names', async () => {
    renderResults();
    await settled();
    for (const el of [...screen.getAllByRole('radio'), ...screen.getAllByRole('slider')]) {
      expect(el.className).not.toMatch(/undefined/);
      expect(el.className.trim()).not.toBe('');
    }
  });
});

describe('sidebar layout', () => {
  it('keeps the existing sections and adds the new ones, in order', async () => {
    renderResults();
    await settled();
    // Scope to the sidebar — result cards also use <h3> for the hotel name.
    const aside = screen.getByRole('heading', { name: 'Filters', level: 2 }).closest('aside');
    const headings = within(aside).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Travel time / Distance / Family & Kids / Beoordeling are conditional — they appear only
    // when the URL carries a night range, or when the scope actually has those content facets
    // (it doesn't here). Everything else is unconditional and this is the order it ships in.
    //
    // The sidebar is in two halves, and "Resultaten verfijnen" is the line between them:
    // everything above it re-runs the search, everything below narrows what came back. That is
    // the client's order, and it is why Vervoer leads and Prijsklasse sits below the line.
    //
    // No 'Cancellation': the filter was removed because the site no longer states a rate's
    // cancellation terms anywhere in the journey, so offering to filter by them promised a
    // distinction nothing downstream would show.
    expect(headings).toEqual([
      'Vervoer', 'Waarheen', 'Data & reizigers',
      'Resultaten verfijnen',
      'Prijsklasse', 'Verzorging', 'Sterren', 'Soort accommodatie', 'Soort vakantie',
      'Alleen volwassenen', 'Faciliteiten', 'Activiteiten', 'Soort kamer',
    ]);
  });

  it('renders the dual-handle price slider as two labelled inputs', async () => {
    renderResults();
    await settled();
    const labels = screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(['Minimumprijs', 'Maximumprijs']);
  });

  it('exposes the segmented controls as accessible radio groups', async () => {
    renderResults();
    await settled();
    const groups = screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'));
    // 'Cancellation policy' is gone with its filter. Transport leads now: it is a question
    // about the SEARCH, so it sits above the line, and the price view sits below it.
    expect(groups).toEqual(['Soort vervoer', 'Prijsweergave']);

    // Exactly one option selected per group, and it reflects the default.
    // Hotel-only by default, so the words describe a STAY priced per room — a flight-inclusive
    // search relabels the same toggle 'Totale reisprijs / Per persoon'.
    expect(screen.getByRole('radio', { name: 'Totale verblijfprijs' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Per kamer/verblijf' })).toHaveAttribute('aria-checked', 'false');
    // The 'Any' radio belonged to the cancellation group — it must not have survived it.
    expect(screen.queryByRole('radio', { name: 'Any' })).not.toBeInTheDocument();
  });

  // ── The seam ──
  // The dates and travellers are edited in place; only the button commits them. So the button
  // exists exactly while there is something to commit — never as a control that would re-run
  // the identical search, and never absent while the results are out of date.
  it('offers nothing to commit on arrival', async () => {
    renderResults();
    await settled();
    expect(screen.queryByText('Je zoekopdracht is gewijzigd')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /zoekopdracht bijwerken/i })).not.toBeInTheDocument();
    // …but the line between the two halves is always drawn.
    expect(screen.getByRole('heading', { name: 'Resultaten verfijnen', level: 3 })).toBeInTheDocument();
  });

  it('says so, and offers the button, once the search has been changed', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(screen.getAllByRole('button', { name: '+' })[0]);   // one more adult
    expect(await screen.findByText('Je zoekopdracht is gewijzigd')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /zoekopdracht bijwerken/i })[0]).toBeInTheDocument();
  });

  it('takes both away again once the new search has run', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(screen.getAllByRole('button', { name: '+' })[0]);
    await screen.findByText('Je zoekopdracht is gewijzigd');
    await user.click(screen.getAllByRole('button', { name: /zoekopdracht bijwerken/i })[0]);
    await waitFor(() => expect(screen.queryByText('Je zoekopdracht is gewijzigd')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('button', { name: /zoekopdracht bijwerken/i })).not.toBeInTheDocument());
  });

  // Ticking a filter refines what came back; it does not change the SEARCH, so it must not
  // raise the notice — that would ask the traveller to press a button for nothing.
  it('is not raised by a filter below the line', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();
    await user.click(boardCheck('All inclusive'));
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: /^All inclusive/ })[0]).toBeChecked());
    expect(screen.queryByText('Je zoekopdracht is gewijzigd')).not.toBeInTheDocument();
  });

  it('shows every board option the cache reported, with its hotel count', async () => {
    renderResults();
    await settled();
    for (const b of ['Logies', 'Zelfverzorging', 'Logies & ontbijt', 'Halfpension',
                     'Volpension', 'All inclusive', 'Ultra all inclusive']) {
      expect(boardCheck(b)).toBeInTheDocument();
    }
    // Counts come from the response, not from a hardcoded list.
    expect(screen.getAllByRole('checkbox', { name: 'All inclusive (20)' })[0]).toBeInTheDocument();
  });

  it('offers no board filter when the search reports none', async () => {
    globalThis.fetch = vi.fn((url) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(
          String(url).includes('/hotels/bulk')
            ? { data: [] }
            : { nights: 3, count: 20, results, cheapest: results[0], hasMore: false,
                diagnostics: { candidateCount: 20, rejectedByCNEM: 0, rejectedByCNES: 0 } }
        ),
      })
    );
    renderResults();
    await settled();
    expect(screen.queryByRole('checkbox', { name: /All Inclusive/ })).not.toBeInTheDocument();
  });

  it('hides the B2B rate-class codes from the consumer UI', async () => {
    renderResults();
    await settled();
    // NOR/NRF/NRP/PAQ/DIS/SEN/RFE are internal Hotelbeds rate classes.
    for (const code of ['NOR', 'NRF', 'NRP', 'PAQ', 'DIS', 'SEN', 'RFE']) {
      expect(screen.queryByText(new RegExp(`\\b${code}\\b`))).not.toBeInTheDocument();
    }
    // ...and the old "Rate Type" section is gone. Its plain-English replacement, Cancellation,
    // has since been removed too, so neither spelling of this filter may reappear.
    expect(screen.queryByText('Rate Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancellation')).not.toBeInTheDocument();
  });
});

describe('mobile drawer', () => {
  // The trigger is `display:none` above the mobile breakpoint, and jsdom never matches
  // the media query that reveals it. Role queries therefore compute an empty accessible
  // name for it, so select it structurally instead of pretending it isn't there.
  const filtersBtn = () => {
    const el = document.querySelector('button[class*="mobileFilterBtn"]');
    if (!el) throw new Error('mobile Filters button not rendered');
    return el;
  };

  it('renders the same filter set as the desktop sidebar', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    const before = screen.getAllByRole('slider').length;   // 2 (sidebar only)
    await user.click(filtersBtn());

    // Two "Filters" headings now exist (sidebar + drawer); the drawer's is the second.
    const panel = document.querySelector('div[class*="drawer"] [class*="drawerBody"]')
      ?? screen.getAllByRole('heading', { name: 'Filters', level: 2 })[1].closest('div').parentElement;

    for (const section of ['Prijsklasse', 'Verzorging', 'Soort kamer']) {
      expect(within(panel).getByText(section)).toBeInTheDocument();
    }
    // The drawer mirrors the sidebar, so the removed filter must be absent from BOTH — a
    // drawer that kept it would be the likeliest place for it to survive unnoticed.
    expect(within(panel).queryByText('Cancellation')).not.toBeInTheDocument();
    // The drawer mounts a second, complete copy of the controls.
    expect(screen.getAllByRole('slider').length).toBe(before * 2);
  });

  it('surfaces the active-filter count on the mobile button', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    expect(filtersBtn().textContent).not.toMatch(/\d/);
    await user.click(boardCheck('Halfpension'));
    await waitFor(() => expect(filtersBtn().textContent).toMatch(/1/));
  });

  it('closes on the overlay/close button', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    await user.click(filtersBtn());
    expect(screen.getAllByRole('heading', { name: 'Filters', level: 2 })).toHaveLength(2);

    await user.click(document.querySelector('button[class*="drawerClose"]'));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: 'Filters', level: 2 })).toHaveLength(1));
  });
});

describe('result card', () => {
  it('keeps the existing card anatomy intact', async () => {
    renderResults();
    await settled();
    const card = screen.getAllByRole('article')[0];

    expect(within(card).getByRole('heading')).toHaveTextContent('Hotel 0');
    expect(within(card).getByText('Antalya')).toBeInTheDocument();
    expect(within(card).getByText('All inclusive')).toBeInTheDocument();   // board tag
    expect(within(card).getByText('Tweepersoons')).toBeInTheDocument();    // room label, not "DBL"
    expect(within(card).getByRole('button', { name: /bewaren bij favorieten/i })).toBeInTheDocument();
    // "View Deal" is a real link (it opens the detail page in a new tab, so it must be
    // middle-clickable and copyable), not a button.
    const deal = within(card).getByRole('link', { name: /bekijk deal/i });
    expect(deal).toHaveAttribute('href', expect.stringContaining('/hotel/200'));
    expect(within(card).getByText('Beste prijs')).toBeInTheDocument();     // cheapest card
    // Headline and the per-person line both use the display symbol now (€, not the ISO code)
    // — mixing "€100.00" with "EUR 33.33" on one stub read as two currencies.
    expect(card.textContent).toMatch(/€/);
    // The secondary figure is the traveller's own share, not a nightly rate nobody books.
    expect(card.textContent).toMatch(/per persoon/);
    expect(card.textContent).not.toMatch(/\/ night/);
    // …and the stay is stated in DAYS, matching the Travel-time filter beside it.
    expect(card.textContent).toMatch(/\d+ dagen/);
    expect(card.textContent).not.toMatch(/\d+ nachten/);
  });

  it('shows a human room name rather than the raw inventory code', async () => {
    renderResults();
    await settled();
    const card = screen.getAllByRole('article')[0];
    expect(within(card).queryByText('DBL')).not.toBeInTheDocument();
  });
});
