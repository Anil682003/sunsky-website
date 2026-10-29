import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BookingDetail from './BookingDetail';

// ── Controllable booking + documents hooks ────────────────────────────────────
let bookingState = { data: null, loading: false, error: null };
let docsState = { data: [], loading: false, error: null };
const fetchPdf = vi.fn();
const useBookingDocuments = vi.fn(() => docsState);
vi.mock('../../api', () => ({
  useBooking: () => bookingState,
  useBookingDocuments: (...a) => useBookingDocuments(...a),
  fetchBookingDocumentPdf: (...a) => fetchPdf(...a),
}));
const showToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const BOOKING = {
  id: 10, bookingReference: 'ORD-000100', status: 'Confirmed', grandTotal: 1000, paidAmount: 1000,
  balanceAmount: 0, createdAt: '2026-09-01T10:00:00Z', products: [], travelers: [],
};
const DOCS = [
  { id: 2, type: 'hotel_voucher', title: 'Hotel voucher', detail: 'Rixos Premium Belek', number: 'HV-0002', issueDate: '2026-09-02', filename: 'HV-0002.pdf' },
  { id: 1, type: 'sales_invoice', title: 'Invoice', detail: null, number: 'INV-2026-0001', issueDate: '2026-09-01', filename: 'INV-2026-0001.pdf' },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/account/bookings/ORD-000100']}>
      <Routes>
        <Route path="/account/bookings/:ref" element={<BookingDetail />} />
      </Routes>
    </MemoryRouter>
  );

const rowOf = (text) => screen.getByText(text).closest('li');

describe('BookingDetail documents', () => {
  let clicked;
  beforeEach(() => {
    bookingState = { data: BOOKING, loading: false, error: null };
    docsState = { data: DOCS, loading: false, error: null };
    clicked = [];
    // jsdom has no object URLs and does not download; record what would be saved instead.
    URL.createObjectURL = vi.fn(() => 'blob:doc');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists the booking’s documents with title, number and dd/mm/yyyy date', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Documenten' })).toBeInTheDocument();
    expect(useBookingDocuments).toHaveBeenCalledWith('ORD-000100');

    const voucher = rowOf('Hotelvoucher');
    expect(within(voucher).getByText('Rixos Premium Belek')).toBeInTheDocument();
    expect(within(voucher).getByText('HV-0002 · Uitgegeven op 02/09/2026')).toBeInTheDocument();
    const invoice = rowOf('Factuur');
    expect(within(invoice).getByText('INV-2026-0001 · Uitgegeven op 01/09/2026')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /downloaden/i })).toHaveLength(2);
  });

  it('shows the empty state when nothing is issued yet', () => {
    docsState = { data: [], loading: false, error: null };
    renderPage();
    expect(screen.getByText('Je documenten verschijnen hier zodra ze zijn uitgegeven.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /downloaden/i })).not.toBeInTheDocument();
  });

  it('downloads through the authenticated API and saves the PDF, with a loading state on that row only', async () => {
    let finish;
    fetchPdf.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await userEvent.click(within(rowOf('Hotelvoucher')).getByRole('button'));

    expect(fetchPdf).toHaveBeenCalledWith('ORD-000100', 2);
    const busy = within(rowOf('Hotelvoucher')).getByRole('button');
    expect(busy).toBeDisabled();
    expect(busy).toHaveTextContent('Bezig met downloaden…');
    expect(within(rowOf('Factuur')).getByRole('button')).toBeEnabled();

    finish(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await waitFor(() => expect(within(rowOf('Hotelvoucher')).getByRole('button')).toBeEnabled());
    expect(clicked).toEqual([{ href: 'blob:doc', download: 'HV-0002.pdf' }]);
    expect(showToast).toHaveBeenCalledWith('Document gedownload', 'success');
  });

  it('shows an inline error on the row when a download fails', async () => {
    fetchPdf.mockRejectedValueOnce({ response: { status: 500 } });
    renderPage();
    await userEvent.click(within(rowOf('Factuur')).getByRole('button'));
    const alert = await within(rowOf('Factuur')).findByRole('alert');
    expect(alert).toHaveTextContent('Het downloaden is mislukt. Probeer het opnieuw.');
    expect(within(rowOf('Hotelvoucher')).queryByRole('alert')).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith('Het downloaden is mislukt. Probeer het opnieuw.', 'error');
    expect(clicked).toEqual([]);
  });

  it('says a document is not available yet when the server refuses it', async () => {
    fetchPdf.mockRejectedValueOnce({ response: { status: 403 } });
    renderPage();
    await userEvent.click(within(rowOf('Hotelvoucher')).getByRole('button'));
    expect(await within(rowOf('Hotelvoucher')).findByRole('alert')).toHaveTextContent('Dit document is nog niet beschikbaar.');
  });
});
