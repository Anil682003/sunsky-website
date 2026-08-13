// Turn a Hotelbeds room code into something a guest can read.
//
// The content catalogue ships no room names at all — `hotelRoomDescriptions` is empty in
// production — so a hotel opened without dates could only ever show "DBL.ST". The code itself
// is structured though: a room-type prefix, then one or more characteristic codes.
//
// Only two parts of that are decoded here, and the choice is deliberate:
//
//   * The 26 room-type prefixes. Small, closed, and unambiguous — DBL is a double room
//     wherever it appears.
//   * A short list of characteristics whose meaning is not in doubt (Standard, Superior,
//     Deluxe, and the N-bedroom codes).
//
// Everything else is left alone. There are 911 distinct characteristic suffixes in the live
// catalogue and they compound (DX-KG, QN-SU, SU-WV); several look like abbreviations of
// Spanish view descriptions, and a guess that renders "Sea View" on a room facing a car park
// is precisely the kind of invention the rest of this page refuses to make. An unrecognised
// characteristic simply doesn't reach the name, and the raw code is always displayed beneath
// it so nothing is hidden.
//
// A real supplier name, when a stay has actually been searched, always wins over this.

const ROOM_TYPES = {
  DBL: 'Double Room',
  ROO: 'Room',
  DBT: 'Double or Twin Room',
  TWN: 'Twin Room',
  SGL: 'Single Room',
  SUI: 'Suite',
  TPL: 'Triple Room',
  FAM: 'Family Room',
  DUS: 'Double Single Use',
  APT: 'Apartment',
  QUA: 'Quadruple Room',
  JSU: 'Junior Suite',
  STU: 'Studio',
  BED: 'Bed in Dormitory',
  VIL: 'Villa',
  CTG: 'Cottage',
  BUN: 'Bungalow',
  CUE: 'Cave Room',
  CHA: 'Chalet',
  HOM: 'Home',
  CAB: 'Cabin',
  TWH: 'Townhouse',
  TLN: 'Tree House',
  LOD: 'Lodge',
  MH: 'Mobile Home',
  BOA: 'Boat',
};

// Characteristics safe enough to print. Anything absent from this map is dropped, not guessed.
const CHARACTERISTICS = {
  ST: 'Standard',
  SU: 'Superior',
  DX: 'Deluxe',
  '1B': '1 Bedroom',
  '2B': '2 Bedrooms',
  '3B': '3 Bedrooms',
  '4B': '4 Bedrooms',
};

/**
 * @param {string} code e.g. "DBL.ST", "SUI.DX-KG", "FAM.2B"
 * @returns {string|null} a readable name, or null when the type prefix is unknown
 */
export function roomNameFromCode(code) {
  const raw = String(code || '').trim().toUpperCase();
  if (!raw) return null;

  const [typePart, characteristicPart] = raw.split('.');
  const type = ROOM_TYPES[typePart];
  if (!type) return null;

  // Trailing "-1"/"-2" are the supplier's disambiguators for otherwise identical rooms; they
  // carry no meaning for a guest.
  const parts = String(characteristicPart || '')
    .split('-')
    .filter((p) => p && !/^\d+$/.test(p));

  const qualifiers = parts.map((p) => CHARACTERISTICS[p]).filter(Boolean);

  // "Standard Double Room", "2 Bedrooms Family Room" → put the qualifier in front, which reads
  // the way English actually orders it.
  return qualifiers.length ? `${qualifiers.join(' ')} ${type}` : type;
}

export default roomNameFromCode;
