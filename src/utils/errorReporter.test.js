// Website error reports (1 Nov 2026): sent once per message, capped, never throwing.
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('reportError', () => {
  beforeEach(() => { vi.resetModules(); globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true })); });

  it('posts message, page without query, step and ref; each message once', async () => {
    const { reportError, setErrorContext } = await import('./errorReporter');
    window.history.pushState({}, '', '/checkout?email=a@b.c');
    setErrorContext({ step: 'checkout/2', ref: 'SKY-1' });
    reportError(new Error('boom'));
    reportError(new Error('boom'));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/client-errors$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ message: 'boom', page: '/checkout', step: 'checkout/2', ref: 'SKY-1', kind: 'error' });
    expect(init.body).not.toContain('a@b.c');
  });

  it('at most 10 reports per page load; a failing fetch is swallowed', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    const { reportError } = await import('./errorReporter');
    for (let i = 0; i < 15; i += 1) reportError(new Error(`e${i}`));
    expect(fetch).toHaveBeenCalledTimes(10);
  });
});
