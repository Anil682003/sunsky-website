// Supplier place names arrive in inconsistent casing — "BODRUM" beside "Istanbul". Used only
// as the FALLBACK when a record has no clean geo name; display-only, never sent back as a
// filter value. (Same helper as the admin repo.)

// Word boundaries that start a new capital: whitespace, hyphen, slash, apostrophe, dot and
// opening brackets — keeps "l'hospitalet" → "L'Hospitalet".
const WORD_START = /(^|[\s\-–—/\\.'’([])([\p{L}\p{N}])/gu;

export const toTitleCase = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .toLocaleLowerCase()
    .replace(WORD_START, (_, sep, ch) => sep + ch.toLocaleUpperCase());
};

export default toTitleCase;
