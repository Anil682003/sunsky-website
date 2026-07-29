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

export default flagUrl;
