import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('resultSeed', () => {
  beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });

  it('is one seed per session, kept in sessionStorage', async () => {
    const { resultSeed } = await import('./resultSeed.js');
    const a = resultSeed();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(resultSeed()).toBe(a);
    expect(sessionStorage.getItem('sunsky.resultRandomSeed')).toBe(a);
  });

  it('keeps a seed already stored this session, replaces an invalid one', async () => {
    sessionStorage.setItem('sunsky.resultRandomSeed', 'kept_seed-1');
    let { resultSeed } = await import('./resultSeed.js');
    expect(resultSeed()).toBe('kept_seed-1');
    vi.resetModules();
    sessionStorage.setItem('sunsky.resultRandomSeed', 'bad seed!');
    ({ resultSeed } = await import('./resultSeed.js'));
    expect(resultSeed()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('works when storage throws (stays the same for the page)', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { resultSeed } = await import('./resultSeed.js');
    const a = resultSeed();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(resultSeed()).toBe(a);
    get.mockRestore(); set.mockRestore();
  });
});
