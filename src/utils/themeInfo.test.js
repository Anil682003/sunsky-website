import { describe, it, expect } from 'vitest';
import { showPairs, themeAmenities } from './themeInfo';

describe('theme informational amenities (doc §3 / §9)', () => {
  it('showPairs: exact pairs only, once, at most 6', () => {
    expect(showPairs('70:574, 73:620,xx,70:574,620,1:2,3:4,5:6,7:8,9:10')).toEqual(['70:574', '73:620', '1:2', '3:4', '5:6', '7:8']);
    expect(showPairs(null)).toEqual([]);
  });
  it('names what the hotel has, matched on the exact pair, in the theme order', () => {
    const fac = [
      { facilityGroupCode: 73, facilityCode: 620, facilityName: 'Waterpark' },
      { facilityGroupCode: 74, facilityCode: 620, facilityName: 'Spa centre' },   // same code, other group
      { facilityGroupCode: 70, facilityCode: 574, facilityName: 'Sauna' },
    ];
    expect(themeAmenities(fac, ['70:574', '74:620', '70:999'])).toEqual(['Sauna', 'Spa centre']);
    expect(themeAmenities(fac, [])).toEqual([]);
    expect(themeAmenities(undefined, ['70:574'])).toEqual([]);
  });
});
