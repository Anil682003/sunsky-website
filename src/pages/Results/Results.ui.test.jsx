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
  waitFor(() => expect(screen.queryByText(/Searching the best deals/)).not.toBeInTheDocument());

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
    expect(headings).toEqual([
      'Dates & Guests', 'Price Range', 'Board Type', 'Room Type', 'Cancellation',
    ]);
  });

  it('renders the dual-handle price slider as two labelled inputs', async () => {
    renderResults();
    await settled();
    const labels = screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(['Minimum price', 'Maximum price']);
  });

  it('exposes the segmented controls as accessible radio groups', async () => {
    renderResults();
    await settled();
    const groups = screen.getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Price basis', 'Cancellation policy']);

    // Exactly one option selected per group, and it reflects the default.
    expect(screen.getByRole('radio', { name: 'Total stay' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Per person' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows every board option the cache can filter on', async () => {
    renderResults();
    await settled();
    for (const b of ['Room Only', 'Self Catering', 'Bed & Breakfast', 'Half Board',
                     'Full Board', 'All Inclusive', 'Ultra All Inclusive']) {
      expect(screen.getByRole('checkbox', { name: b })).toBeInTheDocument();
    }
  });

  it('hides the B2B rate-class codes from the consumer UI', async () => {
    renderResults();
    await settled();
    // NOR/NRF/NRP/PAQ/DIS/SEN/RFE are internal Hotelbeds rate classes.
    for (const code of ['NOR', 'NRF', 'NRP', 'PAQ', 'DIS', 'SEN', 'RFE']) {
      expect(screen.queryByText(new RegExp(`\\b${code}\\b`))).not.toBeInTheDocument();
    }
    // ...and the old "Rate Type" section is gone, replaced by plain-English Cancellation.
    expect(screen.queryByText('Rate Type')).not.toBeInTheDocument();
    expect(screen.getByText('Cancellation')).toBeInTheDocument();
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

    for (const t of ['Price Range', 'Board Type', 'Room Type', 'Cancellation']) {
      expect(within(panel).getByText(t)).toBeInTheDocument();
    }
    // The drawer mounts a second, complete copy of the controls.
    expect(screen.getAllByRole('slider').length).toBe(before * 2);
  });

  it('surfaces the active-filter count on the mobile button', async () => {
    const user = userEvent.setup();
    renderResults();
    await settled();

    expect(filtersBtn().textContent).not.toMatch(/\d/);
    await user.click(screen.getAllByRole('checkbox', { name: 'Half Board' })[0]);
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
    expect(within(card).getByText('All Inclusive')).toBeInTheDocument();   // board tag
    expect(within(card).getByText('Double')).toBeInTheDocument();          // room label, not "DBL"
    expect(within(card).getByRole('button', { name: /save to favourites/i })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /view deal/i })).toBeInTheDocument();
    expect(within(card).getByText('Best Value')).toBeInTheDocument();      // cheapest card
    expect(card.textContent).toMatch(/EUR/);
    expect(card.textContent).toMatch(/\/ night/);
  });

  it('shows a human room name rather than the raw inventory code', async () => {
    renderResults();
    await settled();
    const card = screen.getAllByRole('article')[0];
    expect(within(card).queryByText('DBL')).not.toBeInTheDocument();
  });
});
