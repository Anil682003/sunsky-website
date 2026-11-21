// Holiday Themes (Levent, 17-18 Nov 2026): a ticked theme searches its rule; several themes and
// the other filter groups are AND — the same offer must match all — never folded into an "either".
import { describe, it, expect } from 'vitest';
import { withHolidayThemes, themeRulesOf, NO_BOARD } from './holidayThemes';

const BASE = { hthemes: [], themes: [], boards: [], promos: [], roomFeatures: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], segments: [], any: '', adultsOnly: false, excludeAdultsOnly: false };
const rules = themeRulesOf([
  { id: 11, category: 'Theme', search: { criteria: [{ filterKey: 'boards', value: 'AI' }, { filterKey: 'boards', value: 'UAI' }], match: 'all' } },   // All Inclusive
  { id: 12, category: 'Theme', search: { criteria: [{ filterKey: 'stars', value: 5 }, { filterKey: 'facilities', value: 260 }, { filterKey: 'promos', value: 'EARLY_BOOKING' }], match: 'all', excludeAdultsOnly: true } },
  { id: 13, category: 'Theme', search: { criteria: [{ filterKey: 'segments', value: 81 }, { filterKey: 'kids', value: 340 }], match: 'any' } },
  { id: 14, category: 'Theme', search: null },
  { id: 15, category: 'Theme', search: { criteria: [{ filterKey: 'adultsOnly', value: true }, { filterKey: 'roomFeatures', value: 'PRIVATE_POOL' }, { filterKey: 'activities', value: '73:620' }], match: 'all' } },
  { id: 16, category: 'Theme', search: { criteria: [{ filterKey: 'boards', value: 'BB' }, { filterKey: 'stars', value: 4 }, { filterKey: 'stars', value: 5 }], match: 'all' } },
  { id: 1, category: 'Holiday', search: { criteria: [{ filterKey: 'stars', value: 4 }] } },
]);

describe('withHolidayThemes — Holiday Themes AND (Levent, 18 Nov 2026)', () => {
  it('nothing ticked, or rules not loaded: the very same filters object', () => {
    expect(withHolidayThemes(BASE, rules)).toBe(BASE);
    const f = { ...BASE, hthemes: [11] };
    expect(withHolidayThemes(f, null)).toBe(f);
    expect(withHolidayThemes(f, new Map())).toBe(f);
  });

  it('All Inclusive: the offer shown must be AI / UAI — and stay inside the boards the traveller ticked', () => {
    expect(withHolidayThemes({ ...BASE, hthemes: [11] }, rules).boards).toEqual(['AI', 'UAI']);
    // sidebar HB + AI, theme AI/UAI → only AI satisfies both
    expect(withHolidayThemes({ ...BASE, hthemes: [11], boards: ['HB', 'AI'] }, rules).boards).toEqual(['AI']);
    expect(withHolidayThemes({ ...BASE, hthemes: [11] }, rules).hthemes).toEqual([11]);   // the box itself stays as ticked
  });

  it('two themes with boards nothing shares: an honest empty search, never "either"', () => {
    expect(withHolidayThemes({ ...BASE, hthemes: [11, 16] }, rules).boards).toEqual([NO_BOARD]);
    expect(withHolidayThemes({ ...BASE, hthemes: [11], boards: ['HB'] }, rules).boards).toEqual([NO_BOARD]);
  });

  it('stars of a theme are their own condition: sidebar 4★ AND a 5★ theme is not "4 or 5"', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [12], stars: [4] }, rules);
    expect(out.stars).toEqual([4]);             // the traveller's own list, untouched
    expect(out.any).toBe('stars:5');             // ANDed by the admin
    // a theme's own "4 or 5" stays one either-group
    expect(withHolidayThemes({ ...BASE, hthemes: [16] }, rules).any).toBe('stars:4;stars:5');
  });

  it('facilities / offers / room features are each required: simply added; flags set', () => {
    const out = withHolidayThemes({ ...BASE, hthemes: [12, 15], facilities: [1] }, rules);
    expect(out.facilities).toEqual([1, 260]);
    expect(out.promos).toEqual(['EARLY_BOOKING']);
    expect(out.roomFeatures).toEqual(['PRIVATE_POOL']);
    expect(out.activities).toEqual(['73:620']);
    expect(out.adultsOnly).toBe(true);
    expect(out.excludeAdultsOnly).toBe(true);
  });

  it('Match any → its own group, after a group the traveller already has', () => {
    expect(withHolidayThemes({ ...BASE, hthemes: [13] }, rules).any).toBe('segments:81;kids:340');
    expect(withHolidayThemes({ ...BASE, hthemes: [13], any: 'stars:5' }, rules).any).toBe('stars:5|segments:81;kids:340');
  });

  it("a theme without a rule adds nothing (Last Minutes: the link's own date window is the theme)", () => {
    const f = { ...BASE, hthemes: [14], themes: [1] };
    expect(withHolidayThemes(f, rules)).toBe(f);
  });

  it('a holiday type in the list is not a theme; an unknown id adds nothing', () => {
    expect(rules.has(1)).toBe(false);
    const f = { ...BASE, hthemes: [99] };
    expect(withHolidayThemes(f, rules)).toBe(f);
  });
});

describe('withThemeTicked — entry points show the theme selected', async () => {
  const { withThemeTicked } = await import('./holidayThemes');
  it('adds hthemes, keeps the rest, takes the id out of the holiday-type filter', () => {
    expect(withThemeTicked('/results?countries=TR&themes=55&transport=package', 55)).toBe('/results?countries=TR&transport=package&hthemes=55');
    expect(withThemeTicked('/results?themes=1,55&hthemes=13', 55)).toBe('/results?themes=1&hthemes=13%2C55');
    expect(withThemeTicked('/results', 55)).toBe('/results?hthemes=55');
  });
  it('not a results link, or no id: unchanged', () => {
    expect(withThemeTicked('/hotel/1', 55)).toBe('/hotel/1');
    expect(withThemeTicked(null, 55)).toBe(null);
    expect(withThemeTicked('/results?x=1', null)).toBe('/results?x=1');
  });
});
