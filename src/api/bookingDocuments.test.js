import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import axiosInstance from '../services/axiosInstance';
import { useBookingDocuments, fetchBookingDocumentPdf, DOCUMENT_TIMEOUT } from './index';

// The real shared client with its interceptors; only the network is replaced, so the
// Authorization header asserted here is the one a customer's browser would send.
let sent = [];
let reply = () => ({ data: null });
const realAdapter = axiosInstance.defaults.adapter;

beforeEach(() => {
  sent = [];
  localStorage.setItem('accessToken', 'customer-token');
  axiosInstance.defaults.adapter = async (config) => {
    sent.push(config);
    return { status: 200, statusText: 'OK', headers: {}, config, request: {}, ...reply(config) };
  };
});
afterEach(() => {
  axiosInstance.defaults.adapter = realAdapter;
  localStorage.clear();
});

const authOf = (config) => config.headers?.get?.('Authorization') ?? config.headers?.Authorization;

describe('booking documents API', () => {
  it('lists a booking’s documents with the customer’s login', async () => {
    const docs = [{ id: 2, type: 'hotel_voucher', number: 'HV-0002' }];
    reply = () => ({ data: { success: true, data: docs } });
    const { result } = renderHook(() => useBookingDocuments('ORD-000100'));
    await waitFor(() => expect(result.current.data).toEqual(docs));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('/website/bookings/ORD-000100/documents');
    expect(authOf(sent[0])).toBe('Bearer customer-token');
  });

  it('asks nothing without a booking reference', async () => {
    renderHook(() => useBookingDocuments(undefined));
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(0);
  });

  it('downloads one document as a PDF blob, authenticated, with a long enough timeout', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    reply = () => ({ data: pdf });
    const blob = await fetchBookingDocumentPdf('ORD 1/2', 7);
    expect(blob).toBe(pdf);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('get');
    expect(sent[0].url).toBe('/website/bookings/ORD%201%2F2/documents/7/pdf');
    expect(sent[0].responseType).toBe('blob');
    expect(sent[0].timeout).toBe(DOCUMENT_TIMEOUT);
    expect(authOf(sent[0])).toBe('Bearer customer-token');
  });
});
