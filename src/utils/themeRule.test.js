// Theme Holiday: a Holiday Type's rule on the Holiday Types page links, and on a linked homepage card.
import { describe, it, expect } from 'vitest';
import { ruleParams, withThemeRule } from './themeRule';
import { cardSearch } from '../pages/Home/sections/VacationTypes';

const family = {
  criteria: [
    { filterKey: 'kids', value: 340, label: 'Kids club' },
    { filterKey: 'facilities', value: 385, label: "Children's pool" },
    { filterKey: 'boards', value: 'AI', label: 'All Inclusive' },
  ],
  match: 'any',
  excludeAdultsOnly: true,
};

describe('withThemeRule', () => {
  it('Match any: content criteria in one any group, board stays a filter, the places stay', () => {
    const href = withThemeRule('/results?countries=TR&themes=7&transport=package', family);
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('countries')).toBe('TR');
    expect(qs.get('themes')).toBe('7');
    expect(qs.get('any')).toBe('kids:340;facilities:385');
    expect(qs.get('boards')).toBe('AI');
    expect(qs.get('excludeAdultsOnly')).toBe('1');
  });

  it('Match all: one parameter per filter; no rule or a non-results link → unchanged', () => {
    const href = withThemeRule('/results?countries=TR', { ...family, match: 'all', excludeAdultsOnly: false });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('kids')).toBe('340');
    expect(qs.get('facilities')).toBe('385');
    expect(qs.has('any')).toBe(false);
    expect(withThemeRule('/results?countries=TR', null)).toBe('/results?countries=TR');
    expect(withThemeRule('/holidays/family', family)).toBe('/holidays/family');
    expect(ruleParams([], {})).toEqual([]);
  });
});

describe('offers in a theme rule (doc §7-8)', () => {
  const deals = {
    criteria: [
      { filterKey: 'kids', value: 340, label: 'Kids club' },
      { filterKey: 'promos', value: 'EARLY_BOOKING', label: 'Early Booking' },
    ],
  };
  it('always a filter of its own, never in the Match any group: matched on the priced rate', () => {
    const any = new URLSearchParams(withThemeRule('/results?countries=TR', { ...deals, match: 'any' }).split('?')[1]);
    expect(any.get('any')).toBe('kids:340');
    expect(any.get('promos')).toBe('EARLY_BOOKING');
    const all = new URLSearchParams(withThemeRule('/results?countries=TR', { ...deals, match: 'all' }).split('?')[1]);
    expect([all.get('kids'), all.get('promos')]).toEqual(['340', 'EARLY_BOOKING']);
  });
});

describe('cardSearch', () => {
  const types = [{ id: 7, search: family }, { id: 8, search: null }];
  it('a card linked to a type with features uses the type rule, keeping its own tag setting', () => {
    const card = { holidayTypeId: 7, search: { criteria: [{ filterKey: 'stars', value: 5 }], showFacts: false } };
    expect(cardSearch(card, types)).toEqual({ ...family, showFacts: false });
  });
  it('no type, a type without features, or types not loaded → the card own search', () => {
    const own = { criteria: [{ filterKey: 'stars', value: 5 }] };
    expect(cardSearch({ search: own }, types)).toBe(own);
    expect(cardSearch({ holidayTypeId: 8, search: own }, types)).toBe(own);
    expect(cardSearch({ holidayTypeId: 7, search: own }, undefined)).toBe(own);
  });
});
