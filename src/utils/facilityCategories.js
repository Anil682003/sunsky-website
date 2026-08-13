// Turn the raw Hotelbeds facility rows into the shape the Facilities tab renders: a handful of
// travel-shaped category cards, a "popular" hero row, and the distances the Information tab
// shows as "Nearby". Pure logic (no JSX) so it is testable and Fast-Refresh-clean — the page
// maps each `icon` key to an inline SVG.
//
// The raw list is not a list of amenities. It mixes payment methods, structural facts ("Number
// of floors"), distances and policy rows in with the real thing, and its own grouping is far
// coarser than anything worth showing a traveller: one group called "Facilities" carries 53 of
// a resort's 166 rows, everything from the car park to the private beach. Rendering the supplier
// groups verbatim — which is what this page did — produces a card titled "Facilities" inside a
// tab titled "Facilities", and a card titled "Distances (in meters)" full of ticks with no
// distance beside them.
//
// So the rows are re-bucketed by name into categories a guest would actually scan for. Order
// matters: every specific rule runs before the Hotel Services catch-all, and the first rule to
// match a row claims it, so nothing is counted twice.
//
// Two things this deliberately does NOT do:
//   * No "Free" chip. `isPaid` (indFee) is real, but its absence means "no fee recorded", not
//     "included" — a green Free badge on a row that merely lacks data is an invention, and the
//     one thing this page has consistently refused to do is invent.
//   * No `isAvailable` filtering. indYesOrNo is 0 on 92% of real rows because Hotelbeds only
//     sets it for yes/no types; presence in the list IS the signal (see topFacilities.js).

// Groups that can never yield a facility card.
//   Location (10)            — structural facts, feeds "Hotel at a glance"
//   Distances (40)           — feeds the Information tab's "Nearby" list
//   Hotel type (20)          — a single row saying "hotel"
//   Methods of payment (30)  — not an amenity
//   Room Distribution (61/62)— per-room counts, not hotel facilities
const EXCLUDED_GROUPS = new Set([
  'Location',
  'Distances (in meters)',
  'Hotel type',
  'Methods of payment',
  'Room Distribution',
  'Room distribution Alternative',
]);

// Rows that are policy or plumbing rather than something you'd choose a hotel for.
const EXCLUDED_NAMES = /^(check-?in hour|check-?out hour|smoke detector|mobile phone coverage|newspapers|towels and bed linen|identification card at arrival|deposit on arrival|key collection)$/i;

// The supplier writes some names with a curly apostrophe and some with trailing spaces
// ("Kids’ club", "Solarium "). Normalise so regexes and de-duplication both behave.
export const cleanName = (raw) => String(raw || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim();

// `number` is a count only in these groups. In Location it is a year or a room total, and in
// "Things to keep in mind" it is a threshold (Minimum check-in age = 18) — printing either as
// "(18)" beside a facility name would read as eighteen of them.
const COUNTABLE_GROUPS = new Set(['Facilities', 'Catering', 'Business', 'Entertainment']);

// First match wins. `g` restricts a rule to one supplier group; `re`/`not` match the name.
const CATEGORIES = [
  {
    key: 'food', title: 'Food & Drink', icon: 'restaurant',
    match: (g) => g === 'Catering' || g === 'Meals',
  },
  {
    key: 'pool', title: 'Pool & Beach', icon: 'pool',
    match: (g, n) =>
      (g === 'Entertainment' && /pool|water ?slide|waterpark|beach/i.test(n)) ||
      (g === 'Facilities' && /private (pool|beach)|sun terrace/i.test(n)),
  },
  {
    key: 'family', title: 'Family & Children', icon: 'kids',
    match: (g, n) =>
      (g === 'Entertainment' && /kids|child|playground/i.test(n)) ||
      (g === 'Facilities' && /babysitting|day-?care/i.test(n)) ||
      (g === 'Catering' && /highchair/i.test(n)),
  },
  {
    key: 'wellness', title: 'Wellness & Spa', icon: 'spa',
    match: (g) => g === 'Health',
  },
  {
    key: 'sports', title: 'Sports & Fitness', icon: 'gym',
    match: (g, n) => g === 'Sports' || (g === 'Facilities' && /^gym$/i.test(n)),
  },
  {
    key: 'entertainment', title: 'Entertainment', icon: 'entertainment',
    match: (g) => g === 'Entertainment',
  },
  {
    key: 'transport', title: 'Transport & Parking', icon: 'parking',
    match: (g, n) =>
      g === 'Facilities' &&
      /car park|garage|parking|valet|shuttle|transfer service|car hire|bicycle|bike|ski (storage|to door)|electric vehicle/i.test(n),
  },
  {
    key: 'shops', title: 'Shops & Services', icon: 'shop',
    match: (g, n) =>
      g === 'Facilities' &&
      /^(shop|supermarket|newspaper stand|launderette|laundry service|currency exchange facilities|library)$/i.test(n),
  },
  {
    key: 'internet', title: 'Internet', icon: 'wifi',
    match: (g, n) => g === 'Facilities' && /wi.?fi|wired internet/i.test(n),
  },
  {
    key: 'accessibility', title: 'Accessibility', icon: 'accessible',
    match: (g, n) => g === 'Facilities' && /wheelchair|lift access|universal accessib/i.test(n),
  },
  {
    key: 'safety', title: 'Safety & Security', icon: 'shield',
    match: (g, n) =>
      g === 'Facilities' && /24-hour security|hotel safe|medical service|security/i.test(n),
  },
  {
    key: 'outdoors', title: 'Outdoors', icon: 'garden',
    match: (g, n) =>
      (g === 'Facilities' && /^(garden|terrace)$|bbq|grill/i.test(n)) ||
      (g === 'Entertainment' && /sun lounger|parasol/i.test(n)),
  },
  {
    key: 'business', title: 'Business & Meetings', icon: 'business',
    match: (g) => g === 'Business',
  },
  {
    key: 'sustainability', title: 'Sustainability', icon: 'leaf',
    match: (g) => g === 'Green Programmes - Worldwide',
  },
  {
    key: 'goodtoknow', title: 'Good to know', icon: 'info',
    match: (g, n) =>
      (g === 'Things to keep in mind' &&
        /only adults|lgtbiq|non-smoking|accessib|minimum check-?in age|pets|sustainable|zero waste/i.test(n)) ||
      (g === 'Facilities' && /pets allowed/i.test(n)),
  },
  // Catch-all, and the home for anything a thin card spills into. Must stay last.
  { key: 'services', title: 'Hotel Services', icon: 'concierge', match: () => true },
];

// A small card is not a broken card — a hotel that offers Wi-Fi and nothing else online is
// honestly described by an Internet card holding one row, and the reference design shows
// exactly that. What IS broken is a "Hotel Services" card holding twenty-three unrelated rows
// because every specific category was dissolved into it, which is what a higher threshold here
// produced: an aparthotel with Wi-Fi, a terrace, a meeting room, a TV lounge and a no-smoking
// policy showed four categories, one of them a bin.
//
// So nothing spills. The catch-all is kept honest by the specific rules above claiming their
// rows first, and the grid sorts by size so the substantial cards lead.
const MIN_CARD_ITEMS = 1;

/**
 * Bucket the raw rows into renderable category cards.
 *
 * @param {Array} facilities raw rows from /hotels/bulk
 * @returns {{ categories: Array<{key,title,icon,items:Array<{name,isPaid,count}>}>, total:number }}
 *   categories — biggest first, with Hotel Services and Food & Drink pinned to the front
 *   total      — how many distinct amenities survived, for the subtitle
 */
export function categoriseFacilities(facilities) {
  if (!Array.isArray(facilities) || !facilities.length) return { categories: [], total: 0 };

  const buckets = new Map();
  const seen = new Set();

  for (const f of facilities) {
    const group = String(f?.facilityGroupName || '');
    const name = cleanName(f?.facilityName);
    // A row with no name renders as a bare tick — ~0.6% of the catalogue does this.
    if (!name || EXCLUDED_GROUPS.has(group) || EXCLUDED_NAMES.test(name)) continue;
    // The same amenity can arrive twice under different codes.
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const cat = CATEGORIES.find((c) => c.match(group, name));
    if (!buckets.has(cat.key)) buckets.set(cat.key, []);
    buckets.get(cat.key).push({
      name,
      isPaid: !!f?.isPaid,
      count: COUNTABLE_GROUPS.has(group) && Number(f?.number) > 1 ? Number(f.number) : null,
    });
  }

  // Spill the thin cards into Hotel Services rather than render a wall of near-empty shells.
  const services = buckets.get('services') || [];
  for (const [key, items] of [...buckets]) {
    if (key !== 'services' && items.length < MIN_CARD_ITEMS) {
      services.push(...items);
      buckets.delete(key);
    }
  }
  if (services.length) buckets.set('services', services);

  const PINNED = ['services', 'food'];
  const categories = [...buckets.entries()]
    .map(([key, items]) => {
      const meta = CATEGORIES.find((c) => c.key === key);
      return { key, title: meta.title, icon: meta.icon, items: items.sort((a, b) => a.name.localeCompare(b.name)) };
    })
    .sort((a, b) => {
      const pa = PINNED.indexOf(a.key);
      const pb = PINNED.indexOf(b.key);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return b.items.length - a.items.length;
    });

  return { categories, total: seen.size };
}

// The hero row. One slot per concept, so "Outdoor freshwater pool" and "Children's pool" don't
// spend two tiles saying pool. Ordered by how much a traveller cares, not by how common it is.
const POPULAR_LADDER = [
  { key: 'beach', label: 'Private Beach', icon: 'beach', re: /private beach/i },
  { key: 'pool', label: 'Outdoor Pools', icon: 'pool', re: /outdoor .*pool/i },
  { key: 'slides', label: 'Waterslides', icon: 'slide', re: /water ?slide|waterpark/i },
  { key: 'restaurant', label: 'Restaurants', icon: 'restaurant', re: /^restaurant$/i },
  { key: 'bar', label: 'Bar', icon: 'bar', re: /^bar$|rooftop bar|swim-?up bar/i },
  { key: 'kids', label: "Kids' Club", icon: 'kids', re: /kids' club|children playground/i },
  { key: 'spa', label: 'Spa & Hamam', icon: 'spa', re: /spa centre|turkish bath|hamam|massage|sauna/i },
  { key: 'gym', label: 'Gym', icon: 'gym', re: /^gym$|^fitness$/i },
  { key: 'wifi', label: 'Wi-Fi', icon: 'wifi', re: /wi.?fi/i },
  { key: 'parking', label: 'Parking', icon: 'parking', re: /^car park$/i },
  { key: 'shuttle', label: 'Airport Shuttle', icon: 'shuttle', re: /airport shuttle/i },
  { key: 'indoorpool', label: 'Indoor Pool', icon: 'pool', re: /indoor .*pool/i },
];

const POPULAR_MAX = 9;
// Below this the row reads as a sparse afterthought rather than a highlight reel.
const POPULAR_MIN = 4;

/**
 * The "Popular facilities" tiles. Empty array means render nothing — deliberately, because a
 * two-tile hero row looks worse than none. There is no popular-facility feed from the supplier
 * (hotelPopularFacilities is empty in production), so this is derived from what the hotel has.
 *
 * @returns {Array<{key,label,icon,count:number|null}>}
 */
export function popularFacilities(facilities) {
  if (!Array.isArray(facilities) || !facilities.length) return [];

  const rows = facilities
    .map((f) => ({
      group: String(f?.facilityGroupName || ''),
      name: cleanName(f?.facilityName),
      number: Number(f?.number) > 1 ? Number(f.number) : null,
    }))
    .filter((r) => r.name && !EXCLUDED_GROUPS.has(r.group));

  const picks = [];
  for (const rung of POPULAR_LADDER) {
    if (picks.length >= POPULAR_MAX) break;
    const hits = rows.filter((r) => rung.re.test(r.name));
    if (!hits.length) continue;
    // The supplier often files the same amenity twice, once bare and once with the count
    // ("Restaurant" and "Restaurant ×9"). Whichever arrives first, the tile should show 9.
    const counted = hits.find((h) => h.number != null);
    picks.push({ key: rung.key, label: rung.label, icon: rung.icon, count: counted ? counted.number : null });
  }

  return picks.length >= POPULAR_MIN ? picks : [];
}

// What the supplier measures distance to, in the order a traveller cares about it. Anything not
// listed here is dropped rather than guessed at.
const NEARBY_ORDER = [
  { re: /^beach$/i, label: 'Beach', icon: 'beach' },
  { re: /^city centre$/i, label: 'City centre', icon: 'city' },
  { re: /^entertainment area$/i, label: 'Entertainment area', icon: 'entertainment' },
  { re: /^harbour$/i, label: 'Harbour', icon: 'harbour' },
  { re: /^nearest bus ?\/ ?metro stop$/i, label: 'Bus / metro stop', icon: 'bus' },
  { re: /^bus\/train station$/i, label: 'Bus / train station', icon: 'bus' },
  { re: /^golf course$/i, label: 'Golf course', icon: 'golf' },
  { re: /^ski slopes$/i, label: 'Ski slopes', icon: 'ski' },
  { re: /^airport$/i, label: 'Airport', icon: 'plane' },
];

// Distances arrive in metres. A handful of rows are plainly wrong (a station "1 m" away, an
// airport 900 km away); those say less than nothing, so they are dropped.
const MIN_METRES = 10;
const MAX_METRES = 500000;

export const formatDistance = (metres) =>
  metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0).replace(/\.0$/, '')} km`;

/**
 * The Information tab's "Nearby" list, from the supplier's "Distances (in meters)" group.
 * @returns {Array<{label,icon,metres,text}>} nearest first, or [] when the hotel carries none
 */
export function nearbyDistances(facilities) {
  if (!Array.isArray(facilities)) return [];

  const out = [];
  for (const f of facilities) {
    if (String(f?.facilityGroupName || '') !== 'Distances (in meters)') continue;
    const name = cleanName(f?.facilityName);
    const metres = Number(f?.distance);
    if (!name || !Number.isFinite(metres) || metres < MIN_METRES || metres > MAX_METRES) continue;
    const spec = NEARBY_ORDER.find((n) => n.re.test(name));
    if (!spec || out.some((o) => o.label === spec.label)) continue;
    out.push({ label: spec.label, icon: spec.icon, metres, text: formatDistance(metres) });
  }

  return out.sort((a, b) => a.metres - b.metres);
}

// Structural facts the supplier files under "Location" — the raw material for "Hotel at a glance".
const GLANCE_FIELDS = [
  { re: /^total number of rooms$/i, key: 'rooms', label: 'Rooms' },
  { re: /^number of floors \(main building\)$/i, key: 'floors', label: 'Floors' },
  { re: /^year of most recent renovation$/i, key: 'renovated', label: 'Renovated' },
  { re: /^year of construction$/i, key: 'built', label: 'Built' },
];

/**
 * @returns {{rooms?:number, floors?:number, renovated?:number, built?:number}}
 */
export function glanceFacts(facilities) {
  const out = {};
  if (!Array.isArray(facilities)) return out;
  for (const f of facilities) {
    if (String(f?.facilityGroupName || '') !== 'Location') continue;
    const name = cleanName(f?.facilityName);
    const spec = GLANCE_FIELDS.find((g) => g.re.test(name));
    const value = Number(f?.number);
    if (spec && Number.isFinite(value) && value > 0 && out[spec.key] == null) out[spec.key] = value;
  }
  return out;
}

export default { categoriseFacilities, popularFacilities, nearbyDistances, glanceFacts, formatDistance, cleanName };
