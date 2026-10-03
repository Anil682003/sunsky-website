import { describe, it, expect } from 'vitest';
import { splitFareTypes } from './fareTypes';

describe('splitFareTypes', () => {
  it('under 2 infant, 2–11 child, 12+ adult', () => {
    expect(splitFareTypes(2, [0, 1, 2, 11, 12, 16])).toEqual({ adults: 4, children: 2, infants: 2, childAges: [0, 1, 2, 11] });
  });
  it('adults only', () => {
    expect(splitFareTypes(2, [])).toEqual({ adults: 2, children: 0, infants: 0, childAges: [] });
  });
  it('ages as strings from the URL', () => {
    expect(splitFareTypes(2, ['5', '1'])).toEqual({ adults: 2, children: 1, infants: 1, childAges: [5, 1] });
  });
});
