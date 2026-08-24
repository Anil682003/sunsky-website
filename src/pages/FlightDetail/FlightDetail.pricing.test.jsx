import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FlightDetail from './FlightDetail';
import { buildContext, mapAirtuerkFlight } from '../Flights/flightData';

/* What the flight-only detail page is allowed to assert.

   Everything here is a number or a claim the page used to state without a source: a party
   fare printed as a per-person one, a base/tax split invented from fixed ratios, a flat
   "Cabin 7 kg + Check-in 23 kg" promise on every fare, a table of cancellation fees no
   supplier ever sent, and — on a reload — an entirely fabricated flight with a live Book
   button under it. */

// 2 adults, €370 per adult per direction → €740 per adult, €1480 for the party.
const RATE = 370;
const rowsFor = (adults) => ([
  { paxType: 'ADT', quantity: adults, basePrice: RATE * 0.8, tax: RATE * 0.2, totalPerPax: RATE, subtotal: RATE * adults },
]);

const ctx = buildContext(new URLSearchParams({
  from: 'Brussels (BRU)', to: 'Antalya (AYT)', tripType: 'roundtrip',
  date: '2026-09-10', returnDate: '2026-09-17', adults: '2',
}));

const flight = mapAirtuerkFlight({
  totalPrice: 1480,
  currency: 'EUR',
  fareBreakdown: [...rowsFor(2), ...rowsFor(2)],
  baggage: { checkedKg: 15, checkedPieces: 0, handKg: 0 },
  flightKeys: ['out-key', 'ret-key'],
  legs: [
    { from: 'BRU', to: 'AYT', departure: '2026-09-10T08:00:00', arrival: '2026-09-10T12:30:00', airline: 'TK', flightNumber: '1934' },
    { from: 'AYT', to: 'BRU', departure: '2026-09-17T14:00:00', arrival: '2026-09-17T18:30:00', airline: 'TK', flightNumber: '1935' },
  ],
}, ctx, 0);

// The hand-off is rendered INTO the probe and read back out of the DOM. Stashing it in an
// outer variable would be the obvious thing, but a component may not write to one.
function CheckoutProbe() {
  const { state } = useLocation();
  return <div data-testid="checkout">{JSON.stringify(state?.booking ?? null)}</div>;
}
const handedOver = () => JSON.parse(screen.getByTestId('checkout').textContent);

const renderPage = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/flights/air-BRU-AYT-1', state }]}>
      <Routes>
        <Route path="/flights/:id" element={<FlightDetail />} />
        <Route path="/checkout" element={<CheckoutProbe />} />
        <Route path="/flights" element={<div data-testid="search">search</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('FlightDetail — the price it shows', () => {
  it('prices the headline per ADULT and the booking at the party total', () => {
    renderPage({ flight, ctx });
    // Hero: the fare one adult pays for the whole trip.
    expect(screen.getByText(/from €740 pp/i)).toBeInTheDocument();
    // Sidebar: what the party is actually charged — not €740, and not €2,960.
    expect(screen.getByText(/Total for 2/i)).toBeInTheDocument();
    expect(screen.getAllByText('€1,480').length).toBeGreaterThan(0);
    expect(screen.queryByText('€2,960')).not.toBeInTheDocument();
  });

  it('hands the checkout the exact supplier total and a per-person figure', async () => {
    renderPage({ flight, ctx });
    await userEvent.click(screen.getByRole('button', { name: /book now/i }));
    const booking = handedOver();
    // Checkout multiplies ppPrice back by the traveller count, so this must land on 1480.
    expect(booking.ppPrice * 2).toBeCloseTo(1480, 2);
    expect(booking.api.flight.price).toBe(1480);
    expect(booking.api.flight.flightKeys).toEqual(['out-key', 'ret-key']);
  });

  it('breaks the fare down from the supplier rows, with no invented surcharge line', async () => {
    renderPage({ flight, ctx });
    await userEvent.click(screen.getByRole('button', { name: /fare summary/i }));
    expect(screen.getByText(/Base fare \(2 travellers\)/i)).toBeInTheDocument();
    expect(screen.getByText('€1,184')).toBeInTheDocument();   // 370 × 0.8 × 2 × 2
    expect(screen.getByText('€296')).toBeInTheDocument();     // the remainder, as tax
    expect(screen.queryByText(/fuel surcharge/i)).not.toBeInTheDocument();
  });
});

describe('FlightDetail — the claims it makes', () => {
  it('states the real baggage allowance instead of a flat 7 kg / 23 kg promise', () => {
    renderPage({ flight, ctx });
    expect(screen.getByText(/Check-in 15 kg included/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cabin/i, { selector: '.fd-book-row' })).not.toBeInTheDocument();
    expect(screen.queryByText('23 kg')).not.toBeInTheDocument();
  });

  it('labels each half of the round trip by its own direction on the baggage tab', async () => {
    renderPage({ flight, ctx });
    await userEvent.click(screen.getByRole('button', { name: /baggage/i }));
    expect(screen.getByText(/Outbound: BRU → AYT/)).toBeInTheDocument();
    expect(screen.getByText(/Return: AYT → BRU/)).toBeInTheDocument();
  });

  it('quotes no cancellation or change fee the supplier never sent', async () => {
    renderPage({ flight, ctx });
    await userEvent.click(screen.getByRole('button', { name: /fare rules/i }));
    expect(screen.queryByText(/€45 per person/)).not.toBeInTheDocument();
    expect(screen.queryByText(/€35 \+ fare difference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Free cancellation within 24h/i)).not.toBeInTheDocument();
  });

  it('claims no cabin class, because the search never sends one to the supplier', () => {
    renderPage({ flight, ctx });
    expect(screen.queryByText(/Cabin class/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Economy/i)).not.toBeInTheDocument();
  });

  it('names the fare the airline actually sold, where the cabin label used to sit', () => {
    renderPage({ flight: { ...flight, fareName: 'ECOJET' }, ctx });
    expect(screen.getAllByText(/ECOJET/).length).toBeGreaterThan(0);
  });
});

describe('FlightDetail — opened without a search behind it', () => {
  it('offers a fresh search rather than a fabricated flight', () => {
    renderPage(undefined);
    expect(screen.getByText(/no longer loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search flights/i })).toBeInTheDocument();
    // The old fallback rendered a full generated itinerary with a working Book button.
    expect(screen.queryByRole('button', { name: /book now/i })).not.toBeInTheDocument();
  });
});
