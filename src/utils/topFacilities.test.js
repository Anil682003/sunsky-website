import { topFacilities } from './topFacilities';
import { flagUrl } from './countryFlag';

const f = (facilityName, facilityGroupName = 'Facilities') => ({ facilityName, facilityGroupName });

describe('topFacilities', () => {
  it('returns empty for no data', () => {
    expect(topFacilities(null)).toEqual({ top: [], more: 0 });
    expect(topFacilities([])).toEqual({ top: [], more: 0 });
  });

  it('leads with pool and wifi in ladder order', () => {
    const { top } = topFacilities([
      f('Wi-fi'),
      f('Outdoor freshwater pool', 'Entertainment'),
      f('Bar', 'Catering'),
    ]);
    expect(top.map((t) => t.icon)).toEqual(['pool', 'wifi', 'bar']);
  });

  it('caps at five and counts the honest remainder', () => {
    const { top, more } = topFacilities([
      f('Outdoor freshwater pool', 'Entertainment'),
      f('Wi-fi'),
      f('Massage', 'Health'),
      f('Gym'),
      f('Restaurant', 'Catering'),
      f('Bar', 'Catering'),
      f('Car park'),
      f('Room service'),
      f('Terrace'),
    ]);
    expect(top).toHaveLength(5);
    expect(more).toBe(4); // bar, car park, room service, terrace
  });

  it('never counts two pools as two amenities', () => {
    const { top, more } = topFacilities([
      f('Outdoor freshwater pool', 'Entertainment'),
      f("Children's pool", 'Entertainment'),
      f('Indoor pool', 'Entertainment'),
    ]);
    expect(top).toEqual([{ icon: 'pool', label: 'Pool' }]);
    expect(more).toBe(0);
  });

  it('excludes payment methods, distances, structural and policy rows', () => {
    const { top, more } = topFacilities([
      f('Visa', 'Methods of payment'),
      f('Beach', 'Distances (in meters)'),
      f('Number of floors (main building)', 'Location'),
      f('Non-smoking establishment', 'Things to keep in mind'),
      f('Check-out hour'),
      f('Smoke detector'),
    ]);
    expect(top).toEqual([]);
    expect(more).toBe(0);
  });

  it('does not read "Air conditioning in Restaurant" as a restaurant', () => {
    const { top } = topFacilities([f('Air conditioning in Restaurant', 'Catering')]);
    expect(top.map((t) => t.icon)).toEqual(['ac']);
  });
});

describe('flagUrl', () => {
  it('maps a plain ISO code', () => {
    expect(flagUrl('TR')).toBe('https://flagcdn.com/w40/tr.png');
    expect(flagUrl('es')).toBe('https://flagcdn.com/w40/es.png');
  });

  it('translates the divergent supplier codes', () => {
    expect(flagUrl('UK')).toBe('https://flagcdn.com/w40/gb.png');
    expect(flagUrl('KV')).toBe('https://flagcdn.com/w40/xk.png');
  });

  it('returns null for garbage', () => {
    expect(flagUrl('')).toBeNull();
    expect(flagUrl(null)).toBeNull();
    expect(flagUrl('0')).toBeNull();
    expect(flagUrl('ABC')).toBeNull();
  });
});
