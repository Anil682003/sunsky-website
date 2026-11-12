// The package matrix waits 30 s and retries once before the strip falls back to hotel prices
// (Levent, 11 Nov 2026: a cut-off first request showed €64–66 hotel-only prices on a package page).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn();
// A plain function decides failing answers: a vi.fn returning a rejected promise is itself
// reported by vitest as an unhandled rejection, even when the hook handles it.
let fail = null;
let calls = 0;
vi.mock('../../services/axiosInstance', () => ({ default: { get: (...a) => { calls += 1; return fail ? Promise.reject(fail()) : get(...a); } } }));

const { usePackageMatrix, MATRIX_TIMEOUT_MS } = await import('./usePackageMatrix');

const q = { enabled: true, hotelCode: 428863, destination: 'IST', date: '2027-06-20', travelDays: 3, origins: '', adults: 2, children: 0, rooms: 1 };
const cells = [{ date: '2027-06-20', state: 'AVAILABLE', pricePerPerson: 222, exactTotal: 443.73, sunskyPayableTotal: 444, travelDays: 3 }];

beforeEach(() => { get.mockReset(); fail = null; calls = 0; });

describe('usePackageMatrix', () => {
  it('asks with a 30 s timeout', async () => {
    get.mockResolvedValue({ data: { success: true, cells } });
    const { result } = renderHook(() => usePackageMatrix(q));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get.mock.calls[0][1].timeout).toBe(MATRIX_TIMEOUT_MS);
    expect(MATRIX_TIMEOUT_MS).toBe(30_000);
  });

  it('a timeout is retried once, and the strip gets its package dates', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))
      .mockResolvedValue({ data: { success: true, cells } });
    const { result } = renderHook(() => usePackageMatrix(q));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.days.length).toBe(1);
  });

  it('a 4xx is an answer, not retried', async () => {
    fail = () => Object.assign(new Error('bad'), { response: { status: 400, data: { code: 'DATE_OUTSIDE_HORIZON' } } });
    const { result } = renderHook(() => usePackageMatrix(q));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toBe(1);
    expect(result.current.status).toBe('NO_FLIGHT_DATE');
  });

  it('two failures leave the error, so the page falls back', async () => {
    fail = () => new Error('Network Error');
    const { result } = renderHook(() => usePackageMatrix(q));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toBe(2);
    expect(result.current.error).not.toBeNull();
  });
});
