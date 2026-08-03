import { describe, it, expect } from 'vitest';
import { boardInfo, cancellationState, parseRateKey, rateDetails } from './rateDetails';

// Verbatim rateKeys from a live /hotel-availability/search for hotel 72279 (Santa Sophia),
// 6–13 Sep 2026, 1 room / 2 adults. Two rate classes are represented: PKG…NRF (locked in)
// and PKG…(NOR) (free cancellation until the day before arrival).
const KEY_NRF = '20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|RO|PKGNRFEUXX|1~2~0||N@07~A-SIC~22b2210~1443235965~N~~~NRF~~D886157311C5448178578486727405AABE0001000100010522b2210';
const KEY_NOR = '20260906|20260913|W|77|72279|TPL.ST-1|ID_B2B_88|RO|PKGEUXX|1~2~0||N@07~A-SIC~20e2813~323610846~N~~~NOR~~D886157311C5448178578486727405AABE0001000100010520e2813';

describe('parseRateKey', () => {
  it('reads occupancy and rate class off a live key', () => {
    expect(parseRateKey(KEY_NRF)).toMatchObject({
      rooms: 1, adults: 2, children: 0, rateClass: 'PKGNRFEUXX', nonRefundable: true, packageRate: true,
    });
  });

  it('tells a refundable rate from a non-refundable one', () => {
    expect(parseRateKey(KEY_NOR).nonRefundable).toBe(false);
    expect(parseRateKey(KEY_NRF).nonRefundable).toBe(true);
  });

  it('survives junk instead of throwing', () => {
    for (const bad of [null, undefined, '', 'nonsense', 42, {}]) {
      expect(parseRateKey(bad)).toMatchObject({ rooms: null, adults: null, nonRefundable: null });
    }
  });

  it('does not mistake NRF inside a longer token for the flag', () => {
    // A hotel/contract id containing the letters must not flip the rate to non-refundable.
    const key = '20260906|20260913|W|77|NRFHOTEL|TPL.ST-1|ID_88|RO|PKGEUXX|1~2~0||N@07~NOR~~x';
    expect(parseRateKey(key).nonRefundable).toBe(false);
  });
});

describe('cancellationState', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  it('reads a FUTURE deadline as free cancellation, not as a penalty', () => {
    // The bug this guards: a policy dated later than today is the flexible rate people pay
    // extra for — printing "Non-refundable" on it is exactly backwards.
    const s = cancellationState([{ amount: '10259.14', from: '2026-09-01T23:00:00+03:00' }], 10259.14, now);
    expect(s.kind).toBe('free');
    expect(s.until.toISOString()).toBe('2026-09-01T20:00:00.000Z');
  });

  it('reads a PAST deadline at full value as non-refundable', () => {
    const s = cancellationState([{ amount: '8720.43', from: '2026-08-02T23:59:00+03:00' }], 8720.43, now);
    expect(s.kind).toBe('none');
    expect(s.full).toBe(true);
  });

  it('distinguishes a part-charge from a total loss', () => {
    const s = cancellationState([{ amount: '100', from: '2026-08-02T00:00:00Z' }], 900, now);
    expect(s.kind).toBe('partial');
    expect(s.full).toBe(false);
    expect(s.amount).toBe(100);
  });

  it('uses the EARLIEST deadline when a rate has a ladder of them', () => {
    const s = cancellationState([
      { amount: '900', from: '2026-09-05T00:00:00Z' },
      { amount: '450', from: '2026-08-20T00:00:00Z' },
    ], 900, now);
    expect(s.kind).toBe('free');
    expect(s.until.toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  it('says unknown rather than guessing when the supplier sent nothing', () => {
    expect(cancellationState([], 100, now).kind).toBe('unknown');
    expect(cancellationState(null, 100, now).kind).toBe('unknown');
  });
});

describe('boardInfo', () => {
  it('turns a code into words a traveller can act on', () => {
    expect(boardInfo('BB')).toMatchObject({ label: 'Bed & breakfast', gloss: 'Breakfast included' });
    expect(boardInfo('AI').label).toBe('All inclusive');
  });

  it('stops an unknown code SHOUTING at the traveller', () => {
    expect(boardInfo('ZZ', 'BED AND BREAKFAST').label).toBe('Bed and breakfast');
  });

  it('never invents a meal plan when there is no board at all', () => {
    expect(boardInfo(null, null).label).toBe('Standard rate');
  });
});

describe('rateDetails', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  const base = {
    price: 10259.14, boardCode: 'RO', board: 'ROOM ONLY', rateKey: KEY_NOR,
    cancellation: [{ amount: '10259.14', from: '2026-09-01T23:00:00+03:00' }],
  };

  it('derives the per-night and per-guest figures the card shows', () => {
    const d = rateDetails(base, { nights: 7, now });
    expect(d.perNight).toBeCloseTo(1465.59, 2);
    expect(d.guests).toBe(2);
    expect(d.perGuestNight).toBeCloseTo(732.80, 2);
  });

  it('believes the policy DATES over the rateKey flag when they disagree', () => {
    // Key says NRF, but the deadline has not passed — the traveller can still cancel free.
    const d = rateDetails({ ...base, rateKey: KEY_NRF }, { nights: 7, now });
    expect(d.cancel.kind).toBe('free');
    expect(d.nonRefundable).toBe(false);
  });

  it('falls back to the searched party when the key has no occupancy', () => {
    const d = rateDetails({ ...base, rateKey: null }, { nights: 7, adults: 3, children: 1, now });
    expect(d.guests).toBe(4);
  });

  it('never divides by zero nights', () => {
    const d = rateDetails(base, { nights: 0, now });
    expect(Number.isFinite(d.perNight)).toBe(true);
  });
});
