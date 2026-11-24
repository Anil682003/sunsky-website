// Tracker r16 (24 Nov 2026): the server refuses with REMARKS_CHANGED when the hotel's remarks
// changed at the final check; the customer is told nothing was charged and to read them again.
import { describe, it, expect } from 'vitest';
import { bookingErrorMessage } from './bookingError';

const t = (_key, fallback) => fallback;
describe('bookingErrorMessage: REMARKS_CHANGED', () => {
  it('says the hotel information changed, nothing was charged, read and confirm again', () => {
    const msg = bookingErrorMessage({ response: { data: { errorCode: 'REMARKS_CHANGED', message: 'server text' } } }, t);
    expect(msg).toMatch(/hotel's information/);
    expect(msg).toMatch(/not been charged/);
  });
});
