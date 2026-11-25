import { describe, it, expect } from 'vitest';
import { facetName } from './facetName';

describe('facetName', () => {
  const row = { code: 320, name: 'Car park', nameNl: 'Parkeerplaats' };
  it('Dutch site: the Dutch name', () => {
    expect(facetName(row, 'nl')).toBe('Parkeerplaats');
    expect(facetName(row, 'nl-BE')).toBe('Parkeerplaats');
  });
  it('English site: the English name', () => {
    expect(facetName(row, 'en')).toBe('Car park');
  });
  it('no Dutch name (or an answer from before the change): English', () => {
    expect(facetName({ name: 'Car park', nameNl: null }, 'nl')).toBe('Car park');
    expect(facetName({ name: 'Car park' }, 'nl')).toBe('Car park');
    expect(facetName(undefined, 'nl')).toBeUndefined();
  });
});
