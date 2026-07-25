// Hotel photos come from the admin content API at the Hotelbeds CDN's DEFAULT size —
// 320x213. That is fine for a small row, and far too small for anything the site actually
// renders large: a result card's image box is 280-360 CSS px wide and ~204 tall, which on a
// 2x screen is ~720x408 REAL pixels. Stretching a 320px source over that is exactly the
// "why do our images look worse than theirs" blur.
//
// The CDN serves the same photo at several sizes, measured live:
//
//   (no folder)   320 x 213    17 KB
//   small/         74 x  49     2 KB
//   medium/       117 x  78     4 KB
//   bigger/       800 x 533    73 KB
//   xl/          1024 x 683   108 KB
//   original/    2048 x 1365  328 KB
//
// So we rewrite the URL to the variant that suits the box it will be painted into. This is
// done client-side on purpose: the stored path stays canonical, every other consumer of the
// API is unaffected, and there is no second request to the admin.

const GIATA_RE = /^(https?:\/\/photos\.hotelbeds\.com\/giata\/)(small\/|medium\/|bigger\/|xl\/|original\/)?(.+)$/i;

/** Pixel width each variant delivers — for choosing one against a render box. */
export const VARIANT_WIDTH = { small: 74, medium: 117, default: 320, bigger: 800, xl: 1024, original: 2048 };

/**
 * Rewrite a Hotelbeds photo URL to a given size variant.
 *
 * Anything that is not a Hotelbeds giata URL — a manually uploaded OVH image, a data: URI,
 * an Unsplash fallback — is returned untouched, because those have no size variants and
 * rewriting them would produce a 404.
 *
 * @param {string|null|undefined} url
 * @param {'small'|'medium'|'default'|'bigger'|'xl'|'original'} size
 * @returns {string|null|undefined} the rewritten URL, or the input unchanged
 */
export function hotelImage(url, size = 'default') {
  if (!url || typeof url !== 'string') return url;
  const m = GIATA_RE.exec(url);
  if (!m) return url;                       // not a giata URL — leave it alone
  const [, base, , path] = m;               // group 2 (any existing variant) is dropped
  const folder = size === 'default' || !VARIANT_WIDTH[size] ? '' : `${size}/`;
  return `${base}${folder}${path}`;
}

/**
 * The variant to use for a box of `cssWidth` logical pixels, accounting for the device's
 * pixel ratio — so a retina laptop gets a sharp image and a low-DPI screen is not made to
 * download 300 KB it cannot show.
 */
export function hotelImageForWidth(url, cssWidth, dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) {
  const needed = cssWidth * Math.min(dpr, 3);   // beyond 3x the extra pixels are invisible
  const size = needed <= VARIANT_WIDTH.medium ? 'medium'
    : needed <= VARIANT_WIDTH.default ? 'default'
    : needed <= VARIANT_WIDTH.bigger ? 'bigger'
    : 'xl';
  return hotelImage(url, size);
}

export default hotelImage;
