import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('../services/axiosInstance', () => ({ default: { get: (...a) => get(...a) } }));

const { sharedGet, clearSharedGet } = await import('./sharedGet');

beforeEach(() => { get.mockReset(); clearSharedGet(); });
const later = (data, ms = 20) => new Promise((r) => setTimeout(() => r({ data }), ms));

describe('sharedGet', () => {
  it('identical requests in flight together share ONE call and the same answer', async () => {
    get.mockImplementation(() => later({ ok: 1 }));
    const [a, b, c] = await Promise.all([sharedGet('/cms/x'), sharedGet('/cms/x'), sharedGet('/cms/x')]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/cms/x');
    expect(a).toEqual({ ok: 1 });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('params are part of the key, in any order', async () => {
    get.mockImplementation((_u, cfg) => later({ q: cfg?.params }));
    await Promise.all([
      sharedGet('/d', { params: { a: 1, b: 2 } }),
      sharedGet('/d', { params: { b: 2, a: 1 } }),
      sharedGet('/d', { params: { a: 9 } }),
    ]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps an answer for ttlMs, then asks again; force always asks', async () => {
    get.mockImplementation(() => later({ v: get.mock.calls.length }, 1));
    const first = await sharedGet('/t', { ttlMs: 1000 });
    expect(await sharedGet('/t', { ttlMs: 1000 })).toBe(first);
    expect(get).toHaveBeenCalledTimes(1);
    await sharedGet('/t', { ttlMs: 1000, force: true });
    expect(get).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 5));
    await sharedGet('/t', { ttlMs: 1 });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('a failure is not kept: the next call asks again', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockImplementation(() => later({ ok: 1 }, 1));
    await expect(sharedGet('/f', { ttlMs: 1000 })).rejects.toThrow('down');
    expect(await sharedGet('/f', { ttlMs: 1000 })).toEqual({ ok: 1 });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
