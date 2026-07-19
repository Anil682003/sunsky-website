import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Favourites from './Favourites';

// ── Controllable favourites hook ──────────────────────────────────────────────
let favState = { data: [], loading: false, error: null };
vi.mock('../../api', () => ({
  useFavourites: () => favState,
  removeFavourite: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

// Probe that captures the navigation state HotelDetail would receive.
let captured = null;
function Probe() {
  const { state } = useLocation();
  captured = state;
  return <div data-testid="hotel-page">hotel</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/account/favourites']}>
      <Routes>
        <Route path="/account/favourites" element={<Favourites />} />
        <Route path="/hotel/:code" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );

const daysFromToday = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

describe('Favourites', () => {
  beforeEach(() => {
    favState = { data: [], loading: false, error: null };
    captured = null;
    localStorage.clear();
  });

  it('shows a skeleton grid while loading (no cards, no empty state yet)', () => {
    favState = { data: null, loading: true, error: null };
    const { container } = renderPage();
    expect(screen.queryByText(/no saved stays/i)).not.toBeInTheDocument();
    // Skeleton cards animate in via [class*="skCard"]; assert several are present.
    expect(container.querySelectorAll('[class*="skCard"]').length).toBeGreaterThan(0);
  });

  it('renders the empty state with a browse CTA', () => {
    favState = { data: [], loading: false, error: null };
    renderPage();
    expect(screen.getByText(/no saved stays yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse hotels/i })).toHaveAttribute('href', '/results');
  });

  it('renders saved hotels as cards', () => {
    favState = {
      loading: false, error: null,
      data: [{ id: 1, hotelCode: '638722', hotelName: 'Ersoy Aga Otel', destination: 'Antalya, Turkey', stars: 3, destinationCode: 'AYT' }],
    };
    renderPage();
    expect(screen.getByText('Ersoy Aga Otel')).toBeInTheDocument();
    expect(screen.getByText(/view live prices/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ersoy Aga Otel/i })).toHaveAttribute('href', '/hotel/638722');
  });

  it('opens a favourite with a default search: +2 days, 7 nights, 2 adults, + destination code', async () => {
    favState = {
      loading: false, error: null,
      data: [{ id: 1, hotelCode: '638722', hotelName: 'Ersoy Aga Otel', destination: 'Antalya, Turkey', stars: 3, destinationCode: 'AYT' }],
    };
    renderPage();
    await userEvent.click(screen.getByRole('link', { name: /Ersoy Aga Otel/i }));

    expect(screen.getByTestId('hotel-page')).toBeInTheDocument();
    expect(captured).toBeTruthy();
    expect(captured.checkIn).toBe(daysFromToday(2));
    expect(captured.checkOut).toBe(daysFromToday(9)); // +2 then +7 nights
    expect(captured.nights).toBe(7);
    expect(captured.adults).toBe('2');
    expect(captured.destination).toBe('AYT');
    expect(captured.hotel).toMatchObject({ hotelCode: '638722', name: 'Ersoy Aga Otel' });
  });

  it('falls back to the client-remembered destination code when the record lacks one', async () => {
    localStorage.setItem('sunsky:favDestCodes', JSON.stringify({ '638722': 'PMI' }));
    favState = {
      loading: false, error: null,
      data: [{ id: 1, hotelCode: '638722', hotelName: 'Ersoy Aga Otel', destination: 'Palma', stars: 4 }],
    };
    renderPage();
    await userEvent.click(screen.getByRole('link', { name: /Ersoy Aga Otel/i }));
    expect(captured.destination).toBe('PMI');
  });
});
