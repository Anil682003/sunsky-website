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

describe('mixed rules: groups (doc §2 / §8)', () => {
  // (Family segment OR Kids' club OR Children's pool) AND (Waterpark OR Water slides) AND All Inclusive AND Child discount
  const rule = {
    criteria: [
      { filterKey: 'segments', value: 81 }, { filterKey: 'kids', value: 340 }, { filterKey: 'kids', value: 385 },
    ],
    match: 'any',
    groups: [
      { match: 'any', criteria: [{ filterKey: 'activities', value: '73:620' }, { filterKey: 'activities', value: '73:610' }] },
      { match: 'all', criteria: [{ filterKey: 'boards', value: 'AI' }, { filterKey: 'promos', value: 'CHILD_DISCOUNT' }] },
    ],
    excludeAdultsOnly: true,
  };
  it('each Match any group its own any group, "|"-separated; Match all groups add plain filters', () => {
    const qs = new URLSearchParams(withThemeRule('/results?countries=TR', rule).split('?')[1]);
    expect(qs.get('any')).toBe('segments:81;kids:340;kids:385|activities:73:620;activities:73:610');
    expect([qs.get('boards'), qs.get('promos'), qs.get('excludeAdultsOnly')]).toEqual(['AI', 'CHILD_DISCOUNT', '1']);
  });
  it('a rule without groups gives exactly the link it always gave', () => {
    const { groups, ...plain } = rule;
    expect(ruleParams(plain.criteria, plain)).toEqual(ruleParams(plain.criteria, { ...plain, groups: [] }));
    expect(new URLSearchParams(withThemeRule('/results?x=1', plain).split('?')[1]).get('any')).toBe('segments:81;kids:340;kids:385');
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

describe('room facilities in a theme rule (doc §1 / §7)', () => {
  const pool = { criteria: [
    { filterKey: 'facilities', value: 574, label: 'Spa' },
    { filterKey: 'roomFeatures', value: 'PRIVATE_POOL', label: 'Private pool (room)' },
  ] };
  it('always a filter of its own, never in the Match any group: matched on the priced room', () => {
    const any = new URLSearchParams(withThemeRule('/results?countries=TR', { ...pool, match: 'any' }).split('?')[1]);
    expect(any.get('any')).toBe('facilities:574');
    expect(any.get('roomFeatures')).toBe('PRIVATE_POOL');
  });
});
