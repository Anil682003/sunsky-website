import { describe, it, expect } from 'vitest';
import { holidayThemesForCities } from './holidayThemesForCities';

// 1 Zonvakanties, 2 Stedentrips (ids as the admin gives them).
const places = new Map([['1', new Set(['RHO', 'AYT'])], ['2', new Set(['ATH', 'BCN'])]]);

describe('holidayThemesForCities (Levent 23 Oct)', () => {
  it('a city trip picked under Zonvakanties switches the theme to Stedentrips', () => {
    expect(holidayThemesForCities({ destinations: ['ATH'] }, ['1'], places)).toEqual(['2']);
  });

  it('two cities of different types tick both', () => {
    expect(holidayThemesForCities({ destinations: ['ATH', 'RHO'] }, ['1'], places).sort()).toEqual(['1', '2']);
  });

  it('a zone counts as its city', () => {
    expect(holidayThemesForCities({ zones: ['ATH:12'] }, [1], places)).toEqual(['2']);
  });

  it('other themes stay ticked', () => {
    expect(holidayThemesForCities({ destinations: ['ATH'] }, ['30', '1'], places)).toEqual(['30', '2']);
  });

  it('leaves the themes alone without a holiday type, a city, or a typed city', () => {
    expect(holidayThemesForCities({ destinations: ['ATH'] }, ['30'], places)).toBeNull();
    expect(holidayThemesForCities({ destinations: ['ATH'] }, [], places)).toBeNull();
    expect(holidayThemesForCities({ destinations: [] }, ['1'], places)).toBeNull();
    expect(holidayThemesForCities({ destinations: ['XXX'] }, ['1'], places)).toBeNull();
    expect(holidayThemesForCities({ destinations: ['ATH'] }, ['1'], null)).toBeNull();
  });
});
