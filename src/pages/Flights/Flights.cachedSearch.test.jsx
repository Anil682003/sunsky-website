import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

import Flights from './Flights';

/**
 * UI-16: Flights Only reads the flight cache, and one live check runs on Select.
 *
 * What these tests hold down is the behaviour a traveller feels: the list is the cache's, the
 * cache's own "I have no return fares" is not a sold-out route, and a check that fails never
 * costs the sale.
 *
 * The assertions are in Dutch because the site is: `src/test/setup.js` imports the real i18n,
 * which starts on DEFAULT_LANGUAGE ('nl'), so these match what a visitor actually reads rather
 * than the English fallbacks in the source.
 */

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn() },
  SUPPLIER_TIMEOUT: 25000,
}));
// The logo directory fetches on mount; the flight list does not depend on it.
vi.mock('../../utils/airlineLogos', () => ({
  useAirlineLogos: () => new Map(),
  useAirlineName: () => (c) => c || '',
  __resetAirlineLogos: () => {},
}));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const DEP = iso(30);
const RET = iso(37);

const OUT_LEG = { from: 'BRU', to: 'AYT', departure: `${DEP}T08:00:00`, arrival: `${DEP}T12:30:00`, airline: 'XQ', flightNumber: 'XQ551', duration: 270 };
const IN_LEG = { from: 'AYT', to: 'BRU', departure: `${RET}T13:00:00`, arrival: `${RET}T15:30:00`, airline: 'XQ', flightNumber: 'XQ552', duration: 270 };

/** A fare in the `/search` shape, which the cached search returns too. */
const fare = (totalPrice, { keys = [] } = {}) => ({
  key: `SPLIT_OW:${totalPrice}`,
  totalPrice,
  currency: 'EUR',
  legs: [OUT_LEG, IN_LEG],
  outbound: { legs: [OUT_LEG], price: totalPrice / 2 },
  inbound: { legs: [IN_LEG], price: totalPrice / 2 },
  stops: 0,
  seats: 9,
  fareBreakdown: [{ paxType: 'ADT', quantity: 2, totalPerPax: totalPrice / 2, subtotal: totalPrice }],
  flightKeys: keys,
});

const body = (flights, extra = {}) => ({
  success: true,
  source: 'cache',
  complete: true,
  results: { airtuerk: { available: true, flights } },
  ...extra,
});

const SEARCH = '?from=BRU&to=AYT&dep=' + DEP + '&ret=' + RET + '&type=roundtrip&adults=2&children=0&infants=0';

function Detail() {
  const { state } = useLocation();
  return <div data-testid="detail">{JSON.stringify({ keys: state?.flight?.flightKeys, total: state?.flight?.totalPrice })}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/flights${SEARCH}`]}>
      <Routes>
        <Route path="/flights" element={<Flights />} />
        <Route path="/flights/:id" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
  );

const urlsPosted = () => post.mock.calls.map(([u]) => String(u));

beforeEach(() => { post.mockReset(); });

describe('the list comes from the cache', () => {
  it('searches the cache, not the slow live endpoint', async () => {
    post.mockResolvedValue({ data: body([fare(460)]) });
    renderPage();

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(urlsPosted()).toContain('/flight-availability/cached-search');
    expect(urlsPosted()).not.toContain('/flight-availability/search');
  });

  it('falls back to the live search when the cache says its answer is incomplete', async () => {
    // `complete: false` means the cache holds no return fare for that route and date. That is a
    // gap in what we imported, never a sold-out route, so an empty list would be a lie.
    post.mockImplementation((url) =>
      url === '/flight-availability/cached-search'
        ? Promise.resolve({ data: body([], { complete: false }) })
        : Promise.resolve({ data: body([fare(500, { keys: ['LIVE1', 'LIVE2'] })]) }),
    );
    renderPage();

    await waitFor(() => expect(urlsPosted()).toContain('/flight-availability/search'));
    expect(await screen.findByText(/€\s?250/)).toBeInTheDocument();
  });
});

describe('Select checks the fare live before anyone can book it', () => {
  const selectButton = () => screen.findByRole('button', { name: /selecteer/i });

  it('CONFIRMED carries the live flight, with its bookable keys, to the next screen', async () => {
    post.mockImplementation((url) =>
      url === '/flight-availability/cached-search'
        ? Promise.resolve({ data: body([fare(460)]) })
        : Promise.resolve({
            data: { success: true, status: 'CONFIRMED', flight: fare(460, { keys: ['K1', 'K2'] }) },
          }),
    );
    renderPage();
    await userEvent.click(await selectButton());

    const detail = await screen.findByTestId('detail');
    // The cached card had no keys at all; what travels on is the confirmed flight.
    expect(JSON.parse(detail.textContent).keys).toEqual(['K1', 'K2']);
    expect(urlsPosted()).toContain('/flight-availability/cached-search/confirm');
  });

  it('PRICE_CHANGED shows the new price and waits for the traveller', async () => {
    post.mockImplementation((url) =>
      url === '/flight-availability/cached-search'
        ? Promise.resolve({ data: body([fare(460)]) })
        : Promise.resolve({
            data: {
              success: true, status: 'PRICE_CHANGED', livePrice: 505, difference: 45,
              flight: fare(505, { keys: ['K1', 'K2'] }),
            },
          }),
    );
    renderPage();
    await userEvent.click(await selectButton());

    expect(await screen.findByText(/De prijs is gewijzigd/i)).toBeInTheDocument();
    // Nobody is moved on at a price they have not seen.
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Doorgaan met deze prijs/i }));
    const detail = await screen.findByTestId('detail');
    expect(JSON.parse(detail.textContent).total).toBe(505);
  });

  it('NOT_AVAILABLE says so and stops, without moving on', async () => {
    post.mockImplementation((url) =>
      url === '/flight-availability/cached-search'
        ? Promise.resolve({ data: body([fare(460)]) })
        : Promise.resolve({ data: { success: true, status: 'NOT_AVAILABLE', reason: 'OUTBOUND_NOT_FOUND' } }),
    );
    renderPage();
    await userEvent.click(await selectButton());

    expect(await screen.findByText(/intussen verkocht/i)).toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  it('a failed check offers another go and never claims the seat is sold', async () => {
    // The one outcome worth a test of its own: the supplier being unreachable says nothing
    // about the flight, and telling someone it is gone sends them away from a sale.
    post.mockImplementation((url) =>
      url === '/flight-availability/cached-search'
        ? Promise.resolve({ data: body([fare(460)]) })
        : Promise.reject({ response: { status: 502 } }),
    );
    renderPage();
    await userEvent.click(await selectButton());

    expect(await screen.findByText(/konden dit nu niet controleren/i)).toBeInTheDocument();
    expect(screen.queryByText(/Niet meer beschikbaar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/intussen verkocht/i)).not.toBeInTheDocument();
    // Still clickable, so a retry costs one click.
    expect(await selectButton()).toBeEnabled();
  });
});
