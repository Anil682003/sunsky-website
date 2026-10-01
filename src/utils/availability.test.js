import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AVAILABILITY, VALIDATION, CAUSE,
  checking, available, unavailable, priceUnknown, sourceError, noValidCombination,
  classifyFailure, fromFailure, isRetryable,
  anyOf, allOf,
  isBookable, hasPrice, isConfirmedNegative, isUnknown, isLiveConfirmed, messageKey,
} from './availability';

// The machine's job is to make one particular mistake impossible: telling a customer their
// holiday is unavailable when the truth is that we could not reach anyone to ask. Most of
// what follows is that single rule, pushed at from every direction a catch block can take.

const S = AVAILABILITY;

afterEach(() => { vi.restoreAllMocks(); });

describe('a failure is never a negative answer', () => {
  it.each([
    ['a timeout', { code: 'ECONNABORTED' }, CAUSE.TIMEOUT],
    ['a dropped connection', { code: 'ERR_NETWORK' }, CAUSE.NETWORK],
    ['rate limiting', { response: { status: 429 } }, CAUSE.RATE_LIMITED],
    ['a supplier 500', { response: { status: 503 } }, CAUSE.UPSTREAM],
    ['a request we got wrong', { response: { status: 400 } }, CAUSE.REJECTED],
    ['an unreadable body', new SyntaxError('Unexpected token < in JSON'), CAUSE.MALFORMED],
    ['something unrecognisable', new Error('boom'), CAUSE.UNKNOWN],
  ])('%s becomes SOURCE_ERROR, not UNAVAILABLE', (_label, err, cause) => {
    const v = fromFailure(err, { sources: 'hotelbeds' });
    expect(v.state).toBe(S.SOURCE_ERROR);
    expect(v.cause).toBe(cause);
  });

  it('cannot be talked into UNAVAILABLE by any input', () => {
    // fromFailure has no branch that reaches UNAVAILABLE; this pins that shut.
    const inputs = [null, undefined, 'gone', { response: { status: 404 } }, new Error('no rooms')];
    for (const err of inputs) expect(fromFailure(err).state).toBe(S.SOURCE_ERROR);
  });

  it('offers a retry for the failures worth retrying, and not for our own bad request', () => {
    expect(isRetryable(fromFailure({ code: 'ECONNABORTED' }))).toBe(true);
    expect(isRetryable(fromFailure({ response: { status: 503 } }))).toBe(true);
    expect(isRetryable(fromFailure({ response: { status: 400 } }))).toBe(false);
    expect(isRetryable(available({ price: 10 }))).toBe(false);
  });
});

describe('UNAVAILABLE has to be earned', () => {
  it('needs the sources that actually answered "none"', () => {
    const v = unavailable({ confirmedBy: ['hotelbeds', 'diana', 'w2m'] });
    expect(v.state).toBe(S.UNAVAILABLE);
    expect(v.confirmedBy).toEqual(['hotelbeds', 'diana', 'w2m']);
  });

  it('refuses to build an unproven negative, and says so loudly in development', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = unavailable({ confirmedBy: [] });
    expect(v.state).toBe(S.SOURCE_ERROR);
    expect(v.state).not.toBe(S.UNAVAILABLE);
    if (import.meta.env?.DEV) expect(err).toHaveBeenCalled();
  });

  it('treats a missing confirmedBy the same as an empty one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(unavailable().state).toBe(S.SOURCE_ERROR);
    expect(unavailable({}).state).toBe(S.SOURCE_ERROR);
  });
});

describe('a thing that exists but has no price', () => {
  // The hotel page drops rooms with `.filter(r => r.price != null)`, so a hotel with rooms
  // and no rates currently reads as a hotel with no rooms. That is the case this state is for.
  it('is PRICE_UNKNOWN, which is not a negative and not an error', () => {
    const v = priceUnknown({ sources: 'hotelbeds', detail: 'rooms-without-rates' });
    expect(v.state).toBe(S.PRICE_UNKNOWN);
    expect(isConfirmedNegative(v)).toBe(false);
    expect(isBookable(v)).toBe(false);
    expect(isUnknown(v)).toBe(true);
  });

  it('is what available() degrades to rather than claiming a bookable offer with no number', () => {
    expect(available({ price: null }).state).toBe(S.PRICE_UNKNOWN);
    expect(available({ price: undefined }).state).toBe(S.PRICE_UNKNOWN);
    expect(available({ price: NaN }).state).toBe(S.PRICE_UNKNOWN);
    expect(available({ price: 0 }).state).toBe(S.AVAILABLE);   // free is a price
  });
});

describe('the validation flag is its own question', () => {
  it('defaults to INDICATIVE, so a live quote has to be claimed deliberately', () => {
    expect(available({ price: 100 }).validation).toBe(VALIDATION.INDICATIVE);
    expect(isLiveConfirmed(available({ price: 100 }))).toBe(false);
  });

  it('marks a supplier quote as live-confirmed', () => {
    const v = available({ price: 100, validation: VALIDATION.LIVE_CONFIRMED });
    expect(isLiveConfirmed(v)).toBe(true);
    expect(v.state).toBe(S.AVAILABLE);
  });

  it('stops being confirmed the moment it is re-checked', () => {
    const live = available({ price: 100, validation: VALIDATION.LIVE_CONFIRMED });
    expect(checking({ keep: live }).validation).toBe(VALIDATION.INDICATIVE);
  });
});

describe('re-checking keeps the customer’s number on screen', () => {
  // Rule 3 in miniature: a price being refreshed is dimmed, not blanked.
  it('carries the previous price into CHECKING', () => {
    const prev = available({ price: 899, currency: 'EUR', validation: VALIDATION.LIVE_CONFIRMED });
    const next = checking({ keep: prev });
    expect(next.state).toBe(S.CHECKING);
    expect(next.price).toBe(899);
    expect(next.currency).toBe('EUR');
    expect(hasPrice(next)).toBe(true);
  });

  it('has no price to keep when there was none', () => {
    const next = checking();
    expect(next.price).toBeNull();
    expect(next.validation).toBeNull();
    expect(hasPrice(next)).toBe(false);
  });
});

describe('alternatives — several ways to get the same thing', () => {
  it('takes the cheapest working option', () => {
    const v = anyOf([
      available({ price: 420, sources: 'diana' }),
      available({ price: 380, sources: 'hotelbeds' }),
      unavailable({ confirmedBy: 'w2m' }),
    ]);
    expect(v.state).toBe(S.AVAILABLE);
    expect(v.price).toBe(380);
  });

  // The heart of rule 5. One supplier said no; the other never answered. The one that never
  // answered is exactly the one that might have said yes.
  it('does NOT say unavailable when one source said none and another failed', () => {
    const v = anyOf([
      unavailable({ confirmedBy: 'hotelbeds' }),
      fromFailure({ code: 'ECONNABORTED' }, { sources: 'diana' }),
    ]);
    expect(v.state).toBe(S.SOURCE_ERROR);
    expect(v.state).not.toBe(S.UNAVAILABLE);
  });

  it('says unavailable only when every source confirmed it', () => {
    const v = anyOf([
      unavailable({ confirmedBy: 'hotelbeds' }),
      unavailable({ confirmedBy: 'diana' }),
      unavailable({ confirmedBy: 'w2m' }),
    ]);
    expect(v.state).toBe(S.UNAVAILABLE);
    expect(v.confirmedBy).toEqual(['hotelbeds', 'diana', 'w2m']);
  });

  it('keeps waiting while any source might still say yes', () => {
    expect(anyOf([unavailable({ confirmedBy: 'hb' }), checking()]).state).toBe(S.CHECKING);
  });

  it('prefers the source that knows something exists over the one that knows nothing', () => {
    const v = anyOf([priceUnknown({ sources: 'diana' }), fromFailure(new Error('x'), { sources: 'hb' })]);
    expect(v.state).toBe(S.PRICE_UNKNOWN);
  });

  it('treats consulting nobody as not knowing, rather than as a no', () => {
    expect(anyOf([]).state).toBe(S.SOURCE_ERROR);
    expect(anyOf(null).state).toBe(S.SOURCE_ERROR);
  });
});

describe('components — the parts one trip needs at once', () => {
  it('adds the legs up and keeps the weakest validation', () => {
    const v = allOf([
      available({ price: 300, validation: VALIDATION.LIVE_CONFIRMED, sources: 'flights' }),
      available({ price: 650, validation: VALIDATION.LIVE_CONFIRMED, sources: 'hotelbeds' }),
    ]);
    expect(v.state).toBe(S.AVAILABLE);
    expect(v.price).toBe(950);
    expect(v.validation).toBe(VALIDATION.LIVE_CONFIRMED);
  });

  it('will not call a package live-confirmed when one leg is only indicative', () => {
    const v = allOf([
      available({ price: 300, validation: VALIDATION.LIVE_CONFIRMED }),
      available({ price: 650, validation: VALIDATION.INDICATIVE }),
    ]);
    expect(v.validation).toBe(VALIDATION.INDICATIVE);
  });

  it('settles the trip the moment one required part is confirmed gone', () => {
    // Not a rule-5 violation: "no rooms at this hotel" is a fact we were told, and it decides
    // the package whatever the flight search is still doing.
    const v = allOf([checking(), unavailable({ confirmedBy: 'hotelbeds' })]);
    expect(v.state).toBe(S.UNAVAILABLE);
  });

  it('still refuses to turn a failed leg into an unavailable trip', () => {
    const v = allOf([
      available({ price: 300, validation: VALIDATION.LIVE_CONFIRMED }),
      fromFailure({ response: { status: 502 } }, { sources: 'hotelbeds' }),
    ]);
    expect(v.state).toBe(S.SOURCE_ERROR);
    expect(v.state).not.toBe(S.UNAVAILABLE);
  });

  it('reports an unpriced leg as an unpriced trip, not a bookable one', () => {
    const v = allOf([available({ price: 300 }), priceUnknown({ sources: 'hotelbeds' })]);
    expect(v.state).toBe(S.PRICE_UNKNOWN);
    expect(isBookable(v)).toBe(false);
  });

  it('prefers the more specific negative, because it leads to a better next screen', () => {
    const v = allOf([
      unavailable({ confirmedBy: 'hotelbeds' }),
      noValidCombination({ detail: 'no 7-night pairing' }),
    ]);
    expect(v.state).toBe(S.NO_VALID_COMBINATION);
  });

  it('treats being handed no components as not knowing', () => {
    expect(allOf([]).state).toBe(S.SOURCE_ERROR);
  });
});

describe('reading a value', () => {
  it('sorts the six states into the three things a surface actually branches on', () => {
    const bookable = available({ price: 10 });
    expect([isBookable(bookable), isConfirmedNegative(bookable), isUnknown(bookable)])
      .toEqual([true, false, false]);

    for (const v of [unavailable({ confirmedBy: 'hb' }), noValidCombination()]) {
      expect([isBookable(v), isConfirmedNegative(v), isUnknown(v)]).toEqual([false, true, false]);
    }
    for (const v of [sourceError(), priceUnknown()]) {
      expect([isBookable(v), isConfirmedNegative(v), isUnknown(v)]).toEqual([false, false, true]);
    }
  });

  it('gives every state one message key, so the surfaces cannot word it three ways', () => {
    expect(messageKey(available({ price: 1 }))).toBeNull();
    expect(messageKey(unavailable({ confirmedBy: 'hb' }))).toBe('availability.unavailable');
    expect(messageKey(priceUnknown())).toBe('availability.priceUnknown');
    expect(messageKey(noValidCombination())).toBe('availability.noValidCombination');
    expect(messageKey(fromFailure({ code: 'ECONNABORTED' }))).toBe('availability.error.timeout');
    expect(messageKey(fromFailure({ code: 'ERR_NETWORK' }))).toBe('availability.error.network');
    expect(messageKey(fromFailure({ response: { status: 500 } }))).toBe('availability.error.generic');
  });

  it('never claims a failure is bookable', () => {
    expect(isBookable(fromFailure(new Error('x')))).toBe(false);
  });
});

describe('values are frozen, so a surface cannot edit one into a lie', () => {
  it('will not let a state be reassigned', () => {
    'use strict';
    const v = fromFailure(new Error('x'));
    expect(() => { v.state = AVAILABILITY.UNAVAILABLE; }).toThrow();
    expect(v.state).toBe(S.SOURCE_ERROR);
  });
});

describe('classifyFailure on its own', () => {
  it('reads an abort as a timeout, since that is what it is from here', () => {
    expect(classifyFailure({ name: 'AbortError' })).toBe(CAUSE.TIMEOUT);
    expect(classifyFailure({ code: 'ERR_CANCELED' })).toBe(CAUSE.TIMEOUT);
  });

  it('survives being handed nothing at all', () => {
    expect(classifyFailure(undefined)).toBe(CAUSE.UNKNOWN);
    expect(classifyFailure(null)).toBe(CAUSE.UNKNOWN);
  });
});

describe('every key the machine can ask for exists in both languages', () => {
  // messageKey is the only thing standing between "one vocabulary" and three surfaces each
  // inventing wording again. A key with no string behind it would silently render as the key
  // itself, which looks like a bug to a customer and like nothing at all to us.
  const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

  const everyState = [
    checking(),
    unavailable({ confirmedBy: 'hb' }),
    priceUnknown(),
    noValidCombination(),
    fromFailure({ code: 'ECONNABORTED' }),
    fromFailure({ code: 'ERR_NETWORK' }),
    fromFailure({ response: { status: 429 } }),
    fromFailure({ response: { status: 500 } }),
    fromFailure(new Error('x')),
  ];

  it.each(['en', 'nl'])('%s has a string for all of them', async (lang) => {
    const common = (await import(`../i18n/locales/${lang}/common.json`)).default;
    for (const value of everyState) {
      const key = messageKey(value);
      expect(key, `state ${value.state} produced no key`).toBeTruthy();
      const text = at(common, key);
      expect(text, `${lang}: missing string for "${key}"`).toBeTruthy();
      expect(typeof text).toBe('string');
    }
  });

  it('never words a failure as though availability were known', async () => {
    // The whole reason SOURCE_ERROR is a separate state. If these strings said "unavailable"
    // or "uitverkocht", the state machine would be correct and the screen would still lie.
    const banned = /\bunavailable\b|\bsold out\b|\bniet beschikbaar\b|\buitverkocht\b/i;
    for (const lang of ['en', 'nl']) {
      const common = (await import(`../i18n/locales/${lang}/common.json`)).default;
      for (const text of Object.values(common.availability.error)) {
        expect(text, `${lang}: "${text}" implies we know it is unavailable`).not.toMatch(banned);
      }
      expect(common.availability.priceUnknown).not.toMatch(banned);
    }
  });
});
