import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import HotelVoucher from './HotelVoucher';

// A voucher is a legal travel document. Opened without a booking it used to draw a sample one
// from the design: a named traveller, a supplier reference and a real hotel's phone number.
const open = (state) => render(
  <MemoryRouter initialEntries={[{ pathname: '/voucher', state }]}>
    <HotelVoucher />
  </MemoryRouter>,
);

describe('HotelVoucher', () => {
  it('opened directly, shows no voucher and points to the real one', () => {
    open(undefined);
    expect(screen.getByRole('status')).toHaveTextContent(/Geen voucher om te tonen/);
    expect(screen.getByRole('button', { name: 'Mijn boekingen' })).toBeInTheDocument();
    // Nothing from the old sample booking.
    expect(document.body.textContent).not.toMatch(/SUN-258741|77-4446011|Miracle|Levent/);
  });

  it('draws the booking it was handed', () => {
    open({
      voucher: {
        reference: 'ORD-000123',
        supplierRef: '—',
        bookingDate: '29 October 2026',
        status: 'Confirmed',
        hotel: { name: 'Club Big Blue Suite Hotel', stars: 4, location: 'Alanya, Turkije' },
        checkIn: { date: '25 Oct 2026', time: '14:00' },
        checkOut: { date: '01 Nov 2026', time: '12:00' },
        nights: 7, roomCount: 1, guests: 2, board: 'All Inclusive',
        travelers: [], rooms: [], contact: { address: ['Alanya, Turkije'] },
        stay: { checkInTime: '14:00', checkOutTime: '12:00', earlyCheckIn: '', lateCheckOut: '' },
        important: [], remarks: [],
      },
    });
    expect(screen.getByText('ORD-000123')).toBeInTheDocument();
    expect(screen.getByText('Club Big Blue Suite Hotel')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
