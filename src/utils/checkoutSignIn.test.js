// The header asks the mounted checkout to open its own sign-in dialog, so signing in mid-booking
// never unmounts the trip (Nov 2026).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCheckoutSignIn, openCheckoutSignIn } from './checkoutSignIn';

const reportError = vi.fn();
vi.mock('./errorReporter', () => ({ reportError: (...a) => reportError(...a) }));

// The registry is module state: every test removes what it registered, and this catches a test
// that forgot, so one failure cannot leak into the next.
const live = [];
const register = (handler) => {
  const off = registerCheckoutSignIn(handler);
  live.push(off);
  return off;
};

beforeEach(() => {
  while (live.length) live.pop()();
  reportError.mockReset();
});

describe('opening the checkout sign-in from elsewhere', () => {
  it('answers false when no checkout is mounted, so the caller navigates as usual', () => {
    expect(openCheckoutSignIn()).toBe(false);
    expect(openCheckoutSignIn({ email: 'a@b.be' })).toBe(false);
  });

  it('calls the registered opener with the options and answers true', () => {
    const open = vi.fn();
    register(open);
    expect(openCheckoutSignIn({ email: 'ann@example.com', mode: 'forgot' })).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ email: 'ann@example.com', mode: 'forgot' });
  });

  it('passes an empty object when called without options', () => {
    const open = vi.fn();
    register(open);
    openCheckoutSignIn();
    expect(open).toHaveBeenCalledWith({});
  });

  it('stops answering once unregistered', () => {
    const open = vi.fn();
    const off = register(open);
    off();
    expect(openCheckoutSignIn()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('only the most recent registration is active', () => {
    const first = vi.fn();
    const second = vi.fn();
    register(first);
    register(second);
    openCheckoutSignIn();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('an old checkout cleaning up late does not switch off the new one', () => {
    const oldOne = vi.fn();
    const newOne = vi.fn();
    const offOld = register(oldOne);
    register(newOne);
    offOld();
    expect(openCheckoutSignIn()).toBe(true);
    expect(newOne).toHaveBeenCalledTimes(1);
    expect(oldOne).not.toHaveBeenCalled();
  });

  it('falls back to the previous one when the newest goes away', () => {
    const first = vi.fn();
    const second = vi.fn();
    register(first);
    const offSecond = register(second);
    offSecond();
    openCheckoutSignIn();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('unregistering twice is harmless', () => {
    const first = vi.fn();
    const off = register(first);
    const second = vi.fn();
    register(second);
    off();
    off();
    openCheckoutSignIn();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a throwing opener answers false (so the header still navigates) and is reported', () => {
    const boom = new Error('dialog failed');
    register(() => { throw boom; });
    expect(openCheckoutSignIn()).toBe(false);
    expect(reportError).toHaveBeenCalledWith(boom, expect.objectContaining({ kind: 'checkout-signin' }));
  });
});

describe('checkoutCanResume', () => {
  it('is true only while a checkout with a booking to pay is registered', async () => {
    const { checkoutCanResume } = await import('./checkoutSignIn');
    expect(checkoutCanResume()).toBe(false);
    const off = register(() => {});
    expect(checkoutCanResume()).toBe(true);
    off();
    live.pop();
    expect(checkoutCanResume()).toBe(false);
  });
});
