// Package searches (23 Nov 2026): a timed-out or network-failed group is asked once more before it
// counts as failed; a refusal from the server or the page's own abort is never repeated.
// A plain counting function stands in for the HTTP call (vi.fn's tracking of rejected promises
// reported them as test failures even when the code under test handled them).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stub = { calls: [], impl: async () => ({ data: {} }) };
vi.mock('../services/axiosInstance', () => ({
  default: { post: (...a) => { stub.calls.push(a); return stub.impl(...a); }, get: async () => ({ data: {} }) },
}));

const { fetchPackages, PACKAGE_TIMEOUT_MS } = await import('./filters');

const fail = (message, extra) => async () => { throw Object.assign(new Error(message), extra); };
const outcome = async (p) => { try { return { value: await p }; } catch (e) { return { error: e }; } };

beforeEach(() => { stub.calls = []; stub.impl = async () => ({ data: {} }); });

describe('fetchPackages', () => {
  it('waits up to 45 s for a fresh (live-computed) search', async () => {
    stub.impl = async () => ({ data: { hotels: [1] } });
    await fetchPackages({ a: 1 });
    expect(PACKAGE_TIMEOUT_MS).toBe(45_000);
    expect(stub.calls[0][2].timeout).toBe(45_000);
  });

  it('asks once more after a timeout, and the second answer is used', async () => {
    let n = 0;
    stub.impl = async () => { if (n++ === 0) throw Object.assign(new Error('timeout of 45000ms exceeded'), { code: 'ECONNABORTED' }); return { data: { hotels: ['stored'] } }; };
    const r = await outcome(fetchPackages({ a: 1 }));
    expect(r.value).toEqual({ hotels: ['stored'] });
    expect(stub.calls).toHaveLength(2);
  });

  it('gives up after the second failure', async () => {
    stub.impl = fail('Network Error', { code: 'ERR_NETWORK' });
    const r = await outcome(fetchPackages({ a: 1 }));
    expect(r.error?.message).toBe('Network Error');
    expect(stub.calls).toHaveLength(2);
  });

  it('never repeats a refusal from the server', async () => {
    stub.impl = fail('400', { response: { status: 400 } });
    const r = await outcome(fetchPackages({ a: 1 }));
    expect(r.error?.message).toBe('400');
    expect(stub.calls).toHaveLength(1);
  });

  it('never repeats a search the page aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    stub.impl = fail('canceled', { name: 'CanceledError', code: 'ERR_CANCELED' });
    const r = await outcome(fetchPackages({ a: 1 }, { signal: ctrl.signal }));
    expect(r.error?.message).toBe('canceled');
    expect(stub.calls).toHaveLength(1);
  });
});
