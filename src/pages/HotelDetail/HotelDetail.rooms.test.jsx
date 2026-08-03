import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HotelDetail from './HotelDetail';

// The page reaches two backends. Both are stubbed so the assertions are about rendering, not
// about what a supplier happened to return today.
const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: () => Promise.resolve({ data: {} }) },
}));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));

// Verbatim from a live /hotel-availability/search for Santa Sophia (72279), 6–13 Sep 2026.
// Two rate classes on the same room: PKG…NRF (deadline already passed) and PKG…NOR (free
// cancellation until the day before arrival) — the pair the old UI labelled identically.
const rate = (o) => ({
  roomCode: 'TPL.ST-1', roomName: 'TRIPLE STANDARD', currency: 'EUR',
  boardCode: 'RO', boardName: 'ROOM ONLY', ...o,
});
const AVAILABILITY = {
  success: true, hotelCode: '72279', hotelName: 'Santa Sophia Hotel',
  results: {
    hotelbeds: {
      available: true, currency: 'EUR',
      rooms: [
        rate({
          rateKey: '20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|RO|PKGNRFEUXX|1~2~0||N@07~A-SIC~22b2210~1443235965~N~~~NRF~~D88',
          net: 8720.43, sellingRate: 8720.43,
          cancellationPolicies: [{ amount: '8720.43', from: '2026-08-02T23:59:00+03:00' }],
        }),
        rate({
          rateKey: '20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|RO|PKGEUXX|1~2~0||N@07~A-SIC~20e2813~323610846~N~~~NOR~~D88',
          net: 10259.14, sellingRate: 10259.14,
          cancellationPolicies: [{ amount: '10259.14', from: '2026-09-01T23:00:00+03:00' }],
        }),
        rate({
          boardCode: 'BB', boardName: 'BED AND BREAKFAST',
          rateKey: '20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|BB|PKGEUXX|1~2~0||N@07~A-SIC~236361a~-1355209837~N~~~NOR~~D88',
          net: 13850.54, sellingRate: 13850.54,
          cancellationPolicies: [{ amount: '13850.54', from: '2026-09-01T23:00:00+03:00' }],
        }),
      ],
    },
    diana: { available: false, notInInventory: true },
    cheapest: { supplier: 'hotelbeds', price: 8720.43, currency: 'EUR' },
  },
};

// A round trip the supplier did NOT split into directions — every leg in one `legs` array.
const leg = (from, to, dep, arr) => ({ from, to, departure: dep, arrival: arr, duration: 225, airline: 'TK', flightNumber: '1942' });
const FLIGHTS = {
  results: {
    airtuerk: {
      flights: [
        { totalPrice: 1200, currency: 'EUR', flightKey: 'a', legs: [
          leg('BRU', 'IST', '2026-09-06T07:20:00', '2026-09-06T11:05:00'),
          leg('IST', 'AYT', '2026-09-06T12:30:00', '2026-09-06T13:25:00'),
          leg('AYT', 'IST', '2026-09-13T14:00:00', '2026-09-13T15:10:00'),
          leg('IST', 'BRU', '2026-09-13T16:40:00', '2026-09-13T19:25:00'),
        ] },
        { totalPrice: 1400, currency: 'EUR', flightKey: 'b', legs: [
          leg('BRU', 'AYT', '2026-09-06T19:00:00', '2026-09-06T23:20:00'),
          leg('AYT', 'BRU', '2026-09-13T20:00:00', '2026-09-14T00:10:00'),
        ] },
      ],
    },
  },
};

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => {
    if (url.includes('hotel-availability')) return Promise.resolve({ data: AVAILABILITY });
    if (url.includes('flight-availability')) return Promise.resolve({ data: FLIGHTS });
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
});

const open = async () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/hotel/72279?destination=AYT&checkIn=2026-09-06&checkOut=2026-09-13&adults=2&children=0&rooms=1&nights=7']}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>,
  );
  // Rooms sit behind an explicit two-step gate, so opening the page hits no supplier:
  // pick a date on the fare calendar, then ask for live availability.
  const day = await waitFor(() => {
    const cols = container.querySelectorAll('.fc-col');
    if (!cols.length) throw new Error('fare calendar not rendered');
    return cols[0];
  });
  await userEvent.click(day);
  const cta = await screen.findByRole('button', { name: /check price & availability/i });
  await userEvent.click(cta);
  await waitFor(() => expect(screen.getByText('TRIPLE STANDARD')).toBeInTheDocument());
  return container;
};

describe('room cards', () => {
  it('collapses the rates into one card per room with its boards', async () => {
    await open();
    expect(screen.getByText('TRIPLE STANDARD')).toBeInTheDocument();
    expect(screen.getByText('TPL.ST-1')).toBeInTheDocument();
    // Board codes become words, not the supplier's SHOUTING string.
    expect(screen.getByText('Room only')).toBeInTheDocument();
    expect(screen.getByText('Bed & breakfast')).toBeInTheDocument();
  });

  it('states the real cancellation position instead of calling everything non-refundable', async () => {
    await open();
    // The 10,259 rate's deadline is 1 Sep 2026 — still in the future, so it is the FLEXIBLE
    // rate. The old card printed "Non-refundable" here.
    expect(screen.getByText(/free cancellation until 1 sep/i)).toBeInTheDocument();
  });

  it('shows the stay arithmetic: per night and the gap to the cheapest board', async () => {
    await open();
    expect(screen.getByText('€8,720')).toBeInTheDocument();
    expect(screen.getByText(/€1,246 \/ night/)).toBeInTheDocument();   // 8720.43 / 7
    expect(screen.getByText(/\+€1,539 vs cheapest/)).toBeInTheDocument(); // 10259.14 − 8720.43
  });

  it('flags the lowest price exactly once', async () => {
    await open();
    expect(screen.getAllByText(/lowest price/i)).toHaveLength(1);
  });

  it('reads the occupancy off the rateKey', async () => {
    await open();
    expect(screen.getByText(/2 adults/)).toBeInTheDocument();
    expect(screen.getByText(/7 nights/)).toBeInTheDocument();
  });
});

describe('flight cards', () => {
  it('splits a round trip the supplier sent as one leg list', async () => {
    await open();
    // Unsplit this reads "BRU → BRU" with no return half — the bug in the screenshot.
    await waitFor(() => expect(screen.getAllByText(/outbound/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/return/i).length).toBeGreaterThan(0);
  });

  it('prices each fare against the cheapest one', async () => {
    await open();
    await waitFor(() => expect(screen.getByText(/lowest fare/i)).toBeInTheDocument());
    expect(screen.getByText('+€200')).toBeInTheDocument();   // 1400 − 1200
  });
});
