import { describe, it, expect } from 'vitest';
import {
  categoriseFacilities,
  popularFacilities,
  nearbyDistances,
  glanceFacts,
  formatDistance,
  cleanName,
} from './facilityCategories';

// Shorthand for a raw bulk row.
const f = (facilityGroupName, facilityName, extra = {}) => ({ facilityGroupName, facilityName, ...extra });

// A resort shaped like the real thing: enough rows in each bucket to clear MIN_CARD_ITEMS.
const resort = [
  ...['24-hour reception', 'Hotel safe', 'Concierge', 'Room service', 'Lift access'].map((n) => f('Facilities', n)),
  ...['Restaurant', 'Bar', 'Café'].map((n) => f('Catering', n)),
  ...['Buffet dinner', 'Breakfast buffet'].map((n) => f('Meals', n)),
  ...['Outdoor freshwater pool', 'Indoor heated pool', 'WaterSlides'].map((n) => f('Entertainment', n)),
  ...['Sauna', 'Massage', 'Turkish bath (hamam)'].map((n) => f('Health', n)),
  ...['Tennis', 'Gym', 'Football'].map((n) => f('Sports', n)),
  f('Facilities', 'Car park'),
  f('Facilities', 'Garage'),
  f('Facilities', 'Airport Shuttle'),
  f('Facilities', 'Wi-fi'),
];

describe('cleanName', () => {
  it('normalises the curly apostrophe the supplier uses', () => {
    expect(cleanName('Kids’ club')).toBe("Kids' club");
  });

  it('trims the trailing space on names like "Solarium "', () => {
    expect(cleanName('Solarium ')).toBe('Solarium');
  });
});

describe('categoriseFacilities', () => {
  it('replaces the supplier grouping with travel-shaped categories', () => {
    const { categories } = categoriseFacilities(resort);
    const titles = categories.map((c) => c.title);
    expect(titles).toContain('Food & Drink');
    expect(titles).toContain('Pool & Beach');
    expect(titles).toContain('Wellness & Spa');
    // The supplier's own catch-all name must never surface as a card title inside the
    // Facilities tab — a card called "Facilities" in a tab called "Facilities".
    expect(titles).not.toContain('Facilities');
  });

  it('folds Meals into Food & Drink rather than splitting the restaurant from the menu', () => {
    const { categories } = categoriseFacilities(resort);
    const food = categories.find((c) => c.title === 'Food & Drink');
    const names = food.items.map((i) => i.name);
    expect(names).toContain('Restaurant');
    expect(names).toContain('Buffet dinner');
  });

  it('gives a one-row category its own card rather than burying it in the catch-all', () => {
    // A hotel whose only online amenity is Wi-Fi is honestly described by an Internet card
    // holding one row. Folding it away is what turned Hotel Services into a bin.
    const { categories } = categoriseFacilities(resort);
    const internet = categories.find((c) => c.title === 'Internet');
    expect(internet).toBeDefined();
    expect(internet.items.map((i) => i.name)).toContain('Wi-fi');
    expect(categories.find((c) => c.title === 'Hotel Services').items.map((i) => i.name))
      .not.toContain('Wi-fi');
  });

  it('keeps the catch-all from swallowing the specific categories', () => {
    // Regression: an aparthotel with 44 amenities rendered four cards, one holding 23 rows,
    // because every specific rule that matched only once or twice was dissolved into it.
    const apartHotel = [
      ...['24-hour reception', 'Concierge', 'Luggage room', 'Room service'].map((n) => f('Facilities', n)),
      f('Facilities', 'Wi-fi'),
      f('Facilities', 'Wheelchair-accessible'),
      f('Facilities', 'Lift access'),
      f('Facilities', 'Terrace'),
      f('Facilities', 'Grill/BBQ'),
      f('Facilities', 'Hotel safe'),
      f('Facilities', '24-hour security'),
      f('Business', 'Meeting room'),
      f('Entertainment', 'TV lounge'),
      f('Things to keep in mind', 'Non-smoking establishment'),
    ];
    const { categories } = categoriseFacilities(apartHotel);
    const titles = categories.map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Internet', 'Accessibility', 'Outdoors', 'Safety & Security',
      'Business & Meetings', 'Entertainment', 'Good to know',
    ]));
    // Nothing may hold more than a third of the hotel's amenities.
    const biggest = Math.max(...categories.map((c) => c.items.length));
    expect(biggest).toBeLessThan(apartHotel.length / 2);
  });

  it('drops structural, payment and distance groups', () => {
    const rows = [
      f('Location', 'Total number of rooms', { number: 401 }),
      f('Methods of payment', 'Visa'),
      f('Distances (in meters)', 'Beach', { distance: 250 }),
      f('Hotel type', 'hotel'),
      ...resort,
    ];
    const { categories } = categoriseFacilities(rows);
    const all = categories.flatMap((c) => c.items.map((i) => i.name));
    expect(all).not.toContain('Total number of rooms');
    expect(all).not.toContain('Visa');
    expect(all).not.toContain('Beach');
    expect(all).not.toContain('hotel');
  });

  it('skips rows the catalogue left unnamed instead of rendering a bare tick', () => {
    const { categories, total } = categoriseFacilities([...resort, f('Facilities', null), f('Facilities', '')]);
    expect(categories.flatMap((c) => c.items).every((i) => i.name)).toBe(true);
    expect(total).toBe(categoriseFacilities(resort).total);
  });

  it('counts each amenity once when the supplier sends it twice', () => {
    const { total } = categoriseFacilities([...resort, f('Facilities', 'Concierge')]);
    expect(total).toBe(categoriseFacilities(resort).total);
  });

  it('carries the paid flag through', () => {
    const { categories } = categoriseFacilities([...resort, f('Health', 'Spa treatments', { isPaid: true })]);
    const spa = categories.find((c) => c.title === 'Wellness & Spa');
    expect(spa.items.find((i) => i.name === 'Spa treatments').isPaid).toBe(true);
  });

  it('reads `number` as a count in Facilities but never in Things to keep in mind', () => {
    const rows = [
      ...resort,
      f('Facilities', 'Private pool', { number: 3 }),
      f('Things to keep in mind', 'Minimum check-in age', { number: 18 }),
      f('Things to keep in mind', 'LGTBIQ friendly'),
      f('Things to keep in mind', 'Non-smoking establishment'),
    ];
    const { categories } = categoriseFacilities(rows);
    const pool = categories.flatMap((c) => c.items).find((i) => i.name === 'Private pool');
    expect(pool.count).toBe(3);
    // 18 is a threshold, not eighteen check-in ages.
    const age = categories.flatMap((c) => c.items).find((i) => i.name === 'Minimum check-in age');
    expect(age.count).toBeNull();
  });

  it('returns nothing for a hotel with no facilities', () => {
    expect(categoriseFacilities([]).categories).toEqual([]);
    expect(categoriseFacilities(undefined).total).toBe(0);
  });
});

describe('popularFacilities', () => {
  it('picks the hero amenities the hotel actually has', () => {
    const labels = popularFacilities(resort).map((p) => p.label);
    expect(labels).toContain('Outdoor Pools');
    expect(labels).toContain('Waterslides');
    expect(labels).toContain('Wi-Fi');
  });

  it('spends one tile per concept, not one per pool', () => {
    const picks = popularFacilities(resort);
    expect(picks.filter((p) => p.label === 'Outdoor Pools')).toHaveLength(1);
  });

  it('surfaces a real count beside the tile', () => {
    const picks = popularFacilities([...resort, f('Catering', 'Restaurant', { number: 9 })]);
    // The de-duplicated Restaurant row carries the supplier's count.
    const restaurants = picks.find((p) => p.label === 'Restaurants');
    expect(restaurants.count).toBe(9);
  });

  it('hides the row rather than showing a sparse two tiles', () => {
    expect(popularFacilities([f('Facilities', 'Wi-fi'), f('Facilities', 'Car park')])).toEqual([]);
  });
});

describe('nearbyDistances', () => {
  const dist = [
    f('Distances (in meters)', 'Beach', { distance: 250 }),
    f('Distances (in meters)', 'City centre', { distance: 2000 }),
    f('Distances (in meters)', 'Airport', { distance: 35000 }),
  ];

  it('reads the supplier distance group, nearest first', () => {
    expect(nearbyDistances(dist).map((n) => `${n.label} ${n.text}`)).toEqual([
      'Beach 250 m',
      'City centre 2 km',
      'Airport 35 km',
    ]);
  });

  it('ignores rows the supplier filed without a usable distance', () => {
    const rows = [
      ...dist,
      f('Distances (in meters)', 'Harbour', { distance: 0 }),
      f('Distances (in meters)', 'Golf course', { distance: 900000 }),
    ];
    const labels = nearbyDistances(rows).map((n) => n.label);
    expect(labels).not.toContain('Harbour');
    expect(labels).not.toContain('Golf course');
  });

  it('is empty for the 60% of hotels that carry no distances', () => {
    expect(nearbyDistances(resort)).toEqual([]);
  });
});

describe('formatDistance', () => {
  it('switches from metres to kilometres at 1 km', () => {
    expect(formatDistance(250)).toBe('250 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1 km');
    expect(formatDistance(2500)).toBe('2.5 km');
    expect(formatDistance(35000)).toBe('35 km');
  });
});

describe('glanceFacts', () => {
  it('lifts the structural facts out of the Location group', () => {
    const rows = [
      f('Location', 'Total number of rooms', { number: 401 }),
      f('Location', 'Number of floors (main building)', { number: 7 }),
      f('Location', 'Year of most recent renovation', { number: 2022 }),
      f('Location', 'Year of construction', { number: 2005 }),
    ];
    expect(glanceFacts(rows)).toEqual({ rooms: 401, floors: 7, renovated: 2022, built: 2005 });
  });

  it('omits what the hotel did not report rather than guessing', () => {
    expect(glanceFacts([f('Location', 'Total number of rooms', { number: 17 })])).toEqual({ rooms: 17 });
    expect(glanceFacts([])).toEqual({});
  });
});
