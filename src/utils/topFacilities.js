// Pick the guest-facing amenities a results card should lead with, from the ~80 raw facility
// rows the bulk content record carries per hotel. Pure logic (no JSX) so it's testable and
// Fast-Refresh-clean — the card maps each pick's `icon` key to an inline SVG.
//
// The raw list is NOT a list of amenities: it mixes in payment methods ("Visa"), structural
// data ("Number of floors", "Year of construction"), distances ("Beach — 250 m") and policy
// rows ("Check-out hour"). Those never belong on a card, so whole groups are excluded and the
// rest is matched against a priority ladder of things travellers actually choose hotels by.
// Frequencies verified against the live catalogue (67k hotels): Wi-fi 62k, pool 20k+, bar 38k,
// restaurant 36k, parking 62k, spa/massage 14k, gym 16k, airport shuttle 26k.
//
// NOTE: `isAvailable` (indYesOrNo) is NOT a presence flag — 92% of real rows carry 0 because
// Hotelbeds only sets it for yes/no facility types. Presence in the list IS the signal.

// Groups that can never yield a card amenity.
const EXCLUDED_GROUPS = new Set([
  'Methods of payment',
  'Distances (in meters)',
  'Location',
  'Things to keep in mind',
  'Hotel type',
  'Room Distribution',
  'Room distribution Alternative',
]);

// Junk names inside otherwise-useful groups.
const EXCLUDED_NAMES = /^(check-in hour|check-out hour|smoke detector|mobile phone coverage|newspapers|towels and bed linen|identification card at arrival|deposit on arrival|multilingual staff|clothes dryer)$/i;

// Priority ladder — first match wins the slot, one slot per icon so "Outdoor freshwater pool"
// and "Children's pool" don't spend two of the five slots saying "pool" twice. Order is what
// travellers scan for: pool → wifi → wellness → food → practicalities.
const LADDER = [
  { icon: 'pool',       label: 'Pool',            re: /pool/i,                          not: /poolside|pool.?side/i },
  { icon: 'wifi',       label: 'Free Wi-Fi',      re: /wi.?fi|internet/i },
  { icon: 'spa',        label: 'Spa & wellness',  re: /\bspa\b|massage|sauna|wellness|hammam|turkish bath|jacuzzi|hot tub/i },
  { icon: 'gym',        label: 'Fitness',         re: /gym|fitness/i },
  { icon: 'restaurant', label: 'Restaurant',      re: /restaurant/i,                    not: /air conditioning/i },
  { icon: 'bar',        label: 'Bar',             re: /^bar$|poolside snack bar|café/i },
  { icon: 'beach',      label: 'Beachfront',      re: /private beach|beach club|on the beach/i },
  { icon: 'parking',    label: 'Parking',         re: /car park|parking|garage/i },
  { icon: 'shuttle',    label: 'Airport shuttle', re: /airport shuttle|transfer service/i },
  { icon: 'ac',         label: 'Air conditioning', re: /air conditioning/i },
  { icon: 'kids',       label: 'Family friendly', re: /babysitting|playground|children|kids|mini.?club/i },
  { icon: 'room-service', label: 'Room service',  re: /room service/i },
  { icon: 'reception',  label: '24h reception',   re: /24-hour reception/i },
  { icon: 'terrace',    label: 'Terrace',         re: /terrace|garden/i },
  { icon: 'pets',       label: 'Pets allowed',    re: /pets allowed/i },
  { icon: 'accessible', label: 'Accessible',      re: /wheelchair/i },
];

const MAX_SHOWN = 5;

/**
 * @param {Array<{facilityName?:string, facilityGroupName?:string}>} facilities raw bulk rows
 * @returns {{ top: Array<{icon:string,label:string}>, more: number }}
 *   top  — at most 5 curated amenities, ladder order
 *   more — how many FURTHER distinct guest-facing amenities the hotel has (the "+12" chip);
 *          0 when everything fit.
 */
export function topFacilities(facilities) {
  if (!Array.isArray(facilities) || facilities.length === 0) return { top: [], more: 0 };

  // Distinct guest-facing names, junk excluded.
  const names = new Set();
  for (const f of facilities) {
    const group = String(f?.facilityGroupName || '');
    const name = String(f?.facilityName || '').trim();
    if (!name || EXCLUDED_GROUPS.has(group) || EXCLUDED_NAMES.test(name)) continue;
    names.add(name);
  }

  const top = [];
  const claimed = new Set();   // names consumed by a ladder slot
  for (const rung of LADDER) {
    if (top.length >= MAX_SHOWN) break;
    for (const name of names) {
      if (claimed.has(name)) continue;
      if (rung.re.test(name) && !(rung.not && rung.not.test(name))) {
        top.push({ icon: rung.icon, label: rung.label });
        // Claim EVERY name this rung matches, so "+N" doesn't recount a second pool.
        for (const n of names) {
          if (rung.re.test(n) && !(rung.not && rung.not.test(n))) claimed.add(n);
        }
        break;
      }
    }
  }

  return { top, more: Math.max(0, names.size - claimed.size) };
}

export default topFacilities;
