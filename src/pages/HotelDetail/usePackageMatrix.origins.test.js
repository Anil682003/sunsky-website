import { describe, it, expect } from 'vitest';

import { originsParam } from './usePackageMatrix';
import { matrixDays } from '../../utils/packageHandoff';

/**
 * UI-03. The strip prices each date from whichever of the chosen departure airports is cheapest
 * that day, so two neighbouring dates can leave from different ones.
 *
 * The rule underneath both halves: an airport choice is never narrowed without the traveller
 * doing it. "No preference" has to stay no preference all the way to the API, and each cell has
 * to carry the airport its own winner actually uses.
 */

describe('originsParam', () => {
  it('sends several airports, so each date can price from the cheapest of them', () => {
    expect(originsParam(['BRU', 'AMS'])).toBe('AMS,BRU');
    expect(originsParam('BRU,AMS')).toBe('AMS,BRU');
  });

  it('no preference stays empty, which the API reads as every active airport', () => {
    // The failure this prevents: sending the airport that happened to price the clicked card
    // and quietly turning one winning flight into a filter on all seven dates.
    expect(originsParam([])).toBe('');
    expect(originsParam('')).toBe('');
    expect(originsParam(null)).toBe('');
    expect(originsParam(undefined)).toBe('');
  });

  it('one airport narrows to one, because that is a real choice', () => {
    expect(originsParam(['BRU'])).toBe('BRU');
  });

  it('is stable whatever order or case they arrive in, so the cache key does not churn', () => {
    // The hook keys its request on this string. 'BRU,AMS' and 'AMS,BRU' are the same question
    // and must not be asked twice.
    expect(originsParam(['ams', ' BRU '])).toBe(originsParam(['BRU', 'AMS']));
  });

  it('drops anything that is not an airport code rather than passing it to the API', () => {
    expect(originsParam(['BRU', '', 'XX', 'TOOLONG', 'AMS'])).toBe('AMS,BRU');
    expect(originsParam(['BRU', 'BRU'])).toBe('BRU');
  });
});

describe('matrixDays carries each date its own departure airport', () => {
  const cell = (date, departureAirport, total) => ({
    date,
    state: 'AVAILABLE',
    sunskyPayableTotal: total,
    pricePerPerson: total / 2,
    currency: 'EUR',
    departureAirport,
    arrivalAirport: 'AYT',
    travelDays: 8,
    stay: { checkin: date, checkout: '2026-11-17', nights: 7 },
  });

  it('two dates can leave from two different airports', () => {
    const days = matrixDays([cell('2026-11-10', 'BRU', 1100), cell('2026-11-11', 'AMS', 980)]);
    expect(days.map((d) => d.from)).toEqual(['BRU', 'AMS']);
  });

  it('a date with no price still says where it would have left from', () => {
    // The strip reads `from` to decide whether the week holds more than one airport. A cell it
    // could not price still belongs to an airport, and dropping it there would hide the fact
    // that the week is mixed.
    const days = matrixDays([{ date: '2026-11-12', state: 'NO_VALID_COMBINATION', departureAirport: 'AMS' }]);
    expect(days[0].from).toBe('AMS');
  });

  it('is null when the answer names no airport, so nothing is invented', () => {
    const days = matrixDays([{ date: '2026-11-12', state: 'SOURCE_ERROR' }]);
    expect(days[0].from).toBeNull();
  });
});
