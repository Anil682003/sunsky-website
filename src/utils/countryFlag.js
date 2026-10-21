import northCyprus from '../assets/flags/north-cyprus.svg';

// Country flag URL from the SUPPLIER country code carried on hotel records.
//
// Hotelbeds codes are mostly ISO 3166-1 alpha-2, but a handful diverge — and flagcdn only
// knows real ISO codes, so those must be translated or the flag 404s. Verified against the
// live catalogue: UK→GB (United Kingdom), C0→CW (Curaçao), SF→MF (St-Martin), BK→BQ
// (Bonaire), KV→XK (Kosovo — flagcdn carries the XK user-assigned code).
const SUPPLIER_TO_ISO = {
  UK: 'GB',
  C0: 'CW',
  SF: 'MF',
  BK: 'BQ',
  KV: 'XK',
};

/**
 * Resolve a flagcdn PNG for a supplier/ISO country code, or null when the code can't be a
 * flag ("0", "", null). w40 = 40px-wide PNG — crisp on a 2x screen at the ~20px the card
 * renders, and far lighter than the SVG.
 */
export function flagUrl(code) {
  const raw = String(code || '').trim().toUpperCase();
  const iso = SUPPLIER_TO_ISO[raw] || raw;
  return /^[A-Z]{2}$/.test(iso) ? `https://flagcdn.com/w40/${iso.toLowerCase()}.png` : null;
}

/**
 * Codes flagcdn has no file for AT ALL, drawn from the repo instead.
 *
 * Northern Cyprus has no ISO 3166 code, so there is nothing for the CDN to key a flag by and
 * no translation above can rescue it. It is the only one of the agency's 46 countries in this
 * position; everything else resolves through flagUrl.
 */
const LOCAL_FLAGS = {
  NY: northCyprus,
};

/**
 * PURE. The image to draw for a COUNTRY record, or null when there is nothing to draw.
 *
 * The destination picker and the homepage search field both hold whole country rows, whose
 * stored `flagUrl` the admin built straight from the supplier code — so for UK, C0 and BK it
 * is a 404. This ignores that field and resolves from the code, which is what the map above
 * is for, falling back to the stored URL only for a code it cannot read.
 */
export function flagSrc(country) {
  const code = String(country?.isoCode || country?.code || '').trim().toUpperCase();
  if (LOCAL_FLAGS[code]) return LOCAL_FLAGS[code];
  return flagUrl(code) || country?.flagUrl || null;
}

export default flagUrl;
