// Holiday Themes (Levent, 17-18 Nov 2026): a ticked theme searches exactly its rule, merged on top
// of the traveller's own filters, typed as the URL seed types them.
import { describe, it, expect } from 'vitest';
import { withHolidayThemes, themeRulesOf } from './holidayThemes';

const BASE = { hthemes: [], themes: [], boards: [], promos: [], roomFeatures: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], segments: [], any: '', adultsOnly: false, excludeAdultsOnly: false };
const rules = themeRulesOf([
  { id: 11, category: 'Theme', search: { criteria: [{ filterKey: 'boards', value: 'AI' }, { filterKey: 'boards', value: 'UAI' }], match: 'all' } },
  { id: 12, category: 'Theme', search: { criteria: [{ filterKey: 'stars', value: 5 }, { filterKey: 'facilities', value: 260 }, { filterKey: 'promos', value: 'EARLY_BOOKING' }], match: 'all', excludeAdultsOnly: true } },
  { id: 13, category: 'Theme', search: { criteria: [{ filterKey: 'segments', value: 81 }, { filterKey: 'kids', value: 340 }], match: 'any' } },
  { id: 14, category: 'Theme', search: null },
  { id: 15, category: 'Theme', search: { criteria: [{ filterKey: 'adultsOnly', value: true }, { filterKey: 'roomFeatures', value: 'PRIVATE_POOL' }, { filterKey: 'activities', value: '73:620' }], match: 'all' } },
  { id: 1, category: 'Holiday', search: { criteria: [{ filterKey: 'stars', value: 4 }] } },
]);

describe('withHolidayThemes', () => {
  it('nothing ticked, or rules not loaded: the very same filters object', () => {
    expect(withHolidayThemes(BASE, rules)).toBe(BASE);
    const f = { ...BASE, hthemes: [11] };
    expect(withHolidayThemes(f, null)).toBe(f);
    expect(withHolidayThemes(f, new Map())).toBe(f);
  });

  it('All Inclusive: its boards, on top of a board the traveller ticked', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [11], boards: ['HB'] }, rules);
    expect(out.boards).toEqual(['HB', 'AI', 'UAI']);
    expect(out.hthemes).toEqual([11]);   // the box itself stays as ticked
  });

  it('typed like the URL seed: numbers for stars / facilities, upper-case offers; flags set', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [12], stars: [5] }, rules);
    expect(out.stars).toEqual([5]);
    expect(out.facilities).toEqual([260]);
    expect(out.promos).toEqual(['EARLY_BOOKING']);
    expect(out.excludeAdultsOnly).toBe(true);
  });

  it('Match any → the any group, added to one the traveller already has', () => {
    expect(withHolidayThemes({ ...BASE, hthemes: [13] }, rules).any).toBe('segments:81;kids:340');
    expect(withHolidayThemes({ ...BASE, hthemes: [13], any: 'stars:5' }, rules).any).toBe('stars:5|segments:81;kids:340');
  });

  it('a theme without a rule searches its places / assignments (themes filter)', () => {
    expect(withHolidayThemes({ ...BASE, hthemes: [14], themes: [1] }, rules).themes).toEqual([1, 14]);
  });

  it('adults only, room features and group-qualified activities', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [15] }, rules);
    expect(out.adultsOnly).toBe(true);
    expect(out.roomFeatures).toEqual(['PRIVATE_POOL']);
    expect(out.activities).toEqual(['73:620']);
  });

  it('two themes: both rules apply (pending Levent: both or either)', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [11, 12] }, rules);
    expect(out.boards).toEqual(['AI', 'UAI']);
    expect(out.stars).toEqual([5]);
  });

  it('a holiday type in the list is not a theme; an unknown id adds nothing', () => {
    expect(rules.has(1)).toBe(false);
    const f = { ...BASE, hthemes: [99] };
    expect(withHolidayThemes(f, rules)).toBe(f);
  });
});
