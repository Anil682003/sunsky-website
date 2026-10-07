// The airports a package search can use, for a scope wider than one admin request (7 Oct 2026:
// "Türkiye, Albania +1" has more than 60 destinations; cutting the list hid every airport).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePackageAirports, mergeFeasibility, FEASIBILITY_BATCH } from './usePackageAirports';

const get = vi.fn();
vi.mock('../services/axiosInstance', () => ({ default: { get: (...a) => get(...a) } }));

describe('package airports over many destinations', () => {
  beforeEach(() => get.mockReset());

  it('merges batch answers: departure airports united, the most trips per arrival airport', () => {
    const m = mergeFeasibility([
      { origins: ['BRU'], arrivals: { AYT: { status: 'NOT_FEASIBLE', trips: 0 } } },
      { origins: ['CGN', 'BRU'], arrivals: { AYT: { status: 'FEASIBLE', trips: 12 }, TIA: { status: 'FEASIBLE', trips: 3 } } },
    ]);
    expect([...m.origins].sort()).toEqual(['BRU', 'CGN']);
    expect(m.arrivals).toEqual({ AYT: { status: 'FEASIBLE', trips: 12 }, TIA: { status: 'FEASIBLE', trips: 3 } });
  });

  it('asks every destination, in batches, and none is left out', async () => {
    const dests = Array.from({ length: FEASIBILITY_BATCH + 5 }, (_, i) => `D${i}`);
    get.mockImplementation((url, opts) => Promise.resolve({ data: { success: true, origins: String(opts?.params?.destinations).includes('D64') ? ['CGN'] : ['BRU'], arrivals: {} } }));
    const { result } = renderHook(() => usePackageAirports({ enabled: true, destinations: dests, adults: 2, children: 0 }));
    await waitFor(() => expect(result.current.state).toBe('ok'));
    expect(get.mock.calls.filter(([, o]) => o?.params)).toHaveLength(2);
    const asked = get.mock.calls.filter(([, o]) => o?.params).flatMap(([, o]) => o.params.destinations.split(','));
    expect(asked.sort()).toEqual([...dests].sort());
    expect([...result.current.origins].sort()).toEqual(['BRU', 'CGN']);
  });

  it('one failed batch: unknown, so nothing is hidden', async () => {
    const dests = Array.from({ length: FEASIBILITY_BATCH + 1 }, (_, i) => `D${i}`);
    get.mockImplementation((url, o) => (!o?.params || String(o.params.destinations).startsWith('D0,')
      ? Promise.resolve({ data: { success: true, origins: ['BRU'], arrivals: {} } })
      : Promise.reject(new Error('timeout'))));
    const { result } = renderHook(() => usePackageAirports({ enabled: true, destinations: dests, adults: 2, children: 0 }));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.origins).toBeNull();
  });
});
