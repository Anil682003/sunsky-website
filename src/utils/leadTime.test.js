import { describe, it, expect } from 'vitest';
import { earliestCheckInISO, notBeforeEarliest, departsTooSoon, brusselsDateISO } from './leadTime';

// Nothing may depart or check in within 24 hours: a same-day booking cannot reach the
// supplier, come back confirmed and reach the traveller as documents in time.
//
// The clock that decides is BELGIUM'S, not the traveller's. Somebody opening the site from
// Antalya, or with a laptop three days out of date, has to be offered the same dates as
// somebody sitting in Brussels — otherwise the site sells a departure the office cannot honour.

const at = (iso) => Date.parse(iso);

describe('the 24-hour lead time', () => {
  it('never offers today, whatever the hour', () => {
    // Just after midnight in Brussels (CEST = UTC+2 in August).
    expect(earliestCheckInISO(at('2026-08-09T00:30:00+02:00'))).toBe('2026-08-10');
    // Mid-afternoon.
    expect(earliestCheckInISO(at('2026-08-09T15:00:00+02:00'))).toBe('2026-08-10');
    // Late evening — 24 hours on is still the 10th, so the 10th is the floor.
    expect(earliestCheckInISO(at('2026-08-09T23:00:00+02:00'))).toBe('2026-08-10');
  });

  it('reads the date in Belgium, not wherever the browser happens to be', () => {
    // 23:30 UTC on the 9th is already 01:30 on the 10th in Brussels, so "+24h" lands on the
    // 11th. A browser in London reading its own clock would have said the 10th.
    expect(brusselsDateISO(new Date(at('2026-08-09T23:30:00Z')))).toBe('2026-08-10');
    expect(earliestCheckInISO(at('2026-08-09T23:30:00Z'))).toBe('2026-08-11');
  });

  it('pulls an earlier date up to the floor and leaves a later one alone', () => {
    const now = at('2026-08-09T12:00:00+02:00');
    expect(notBeforeEarliest('2026-08-09', now)).toBe('2026-08-10');   // today → tomorrow
    expect(notBeforeEarliest('2026-07-01', now)).toBe('2026-08-10');   // the past → tomorrow
    expect(notBeforeEarliest('2026-09-20', now)).toBe('2026-09-20');   // already fine
    expect(notBeforeEarliest('', now)).toBe('');                        // absent ≠ too early
  });

  it('refuses a departure inside the window even on a date the floor allows', () => {
    const now = at('2026-08-09T12:00:00+02:00');
    // Tomorrow, but at 06:00 — eighteen hours away.
    expect(departsTooSoon('2026-08-10T06:00:00+02:00', now)).toBe(true);
    // Tomorrow at 14:00 — twenty-six hours away.
    expect(departsTooSoon('2026-08-10T14:00:00+02:00', now)).toBe(false);
    // A bare date is read as the START of that day: the strictest reading, and the right one.
    expect(departsTooSoon('2026-08-10', now)).toBe(true);
    expect(departsTooSoon('2026-08-11', now)).toBe(false);
    // Nothing stated is nothing to refuse — an unparseable time must not hide a whole fare.
    expect(departsTooSoon('', now)).toBe(false);
    expect(departsTooSoon('not a date', now)).toBe(false);
  });
});
