// Hotel photos come from the admin content API at the Hotelbeds CDN's DEFAULT size —
// 320x213. That is fine for a small row, and far too small for anything the site actually
// renders large: a result card's image box is 280-360 CSS px wide and ~204 tall, which on a
// 2x screen is ~720x408 REAL pixels. Stretching a 320px source over that is exactly the
// "why do our images look worse than theirs" blur.
//
// The CDN serves the same photo at several sizes, measured live:
//
//   (no folder)   320 x 213    17 KB    ← ALWAYS present
//   small/         74 x  49     2 KB
//   medium/       117 x  78     4 KB
//   bigger/       800 x 533    73 KB
//   xl/          1024 x 683   108 KB    ← OFTEN MISSING — returns 403 for many hotels
//   original/    2048 x 1365  328 KB
//
// So we rewrite the URL to the variant that suits the box it will be painted into. This is
// done client-side on purpose: the stored path stays canonical, every other consumer of the
// API is unaffected, and there is no second request to the admin.
//
// ── NOT EVERY IMAGE HAS EVERY SIZE. Verified live: "Bamboo Hotel" (196700) serves default,
// small, medium, bigger and original with 200, but `xl` with 403 — the size was never
// generated for those images. Requesting `xl` therefore painted a blank tile on the gallery
// while the lightbox (original) loaded fine. Two consequences baked in here:
//   1. `xl` is NEVER produced by the size helpers below — it is the one unreliable variant.
//   2. hotelImageChain() gives an ordered fallback list ending at `default`, which the CDN
//      always serves, so a component can step down on a 403/404 instead of showing nothing.

const GIATA_RE = /^(https?:\/\/photos\.hotelbeds\.com\/giata\/)(small\/|medium\/|bigger\/|xl\/|original\/)?(.+)$/i;

/** Pixel width each variant delivers — for choosing one against a render box. */
export const VARIANT_WIDTH = { small: 74, medium: 117, default: 320, bigger: 800, xl: 1024, original: 2048 };

// The RELIABLE sizes, largest → smallest. `xl` is deliberately excluded (it 403s for many
// images); `default` is the guaranteed floor. A fallback chain is a slice of this list.
const RELIABLE_DESC = ['original', 'bigger', 'default', 'medium', 'small'];

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
 * download 300 KB it cannot show. Never returns `xl` (unreliable — see the header note);
 * steps straight from `bigger` to `original`.
 */
export function hotelImageForWidth(url, cssWidth, dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) {
  const needed = cssWidth * Math.min(dpr, 3);   // beyond 3x the extra pixels are invisible
  const size = needed <= VARIANT_WIDTH.medium ? 'medium'
    : needed <= VARIANT_WIDTH.default ? 'default'
    : needed <= VARIANT_WIDTH.bigger ? 'bigger'
    : 'original';
  return hotelImage(url, size);
}

/**
 * Ordered fallback URLs for a hotel photo: the requested size first, then progressively safer
 * sizes, always ending at `default` (which the CDN never fails to serve). A component walks
 * this list on each `onError`, so a missing large variant degrades to a smaller real image
 * instead of a blank frame.
 *
 * A non-Hotelbeds photo (OVH upload, Unsplash) has no variants → returns just [url].
 *
 * @returns {string[]}
 */
export function hotelImageChain(url, size = 'default') {
  if (!url || typeof url !== 'string') return [];
  if (!GIATA_RE.test(url)) return [url];
  const floor = RELIABLE_DESC.indexOf('default');
  const start = RELIABLE_DESC.indexOf(size);
  let sizes;
  if (start < 0 || start === floor) {
    sizes = ['default'];                              // unknown, or already default
  } else if (start < floor) {
    sizes = RELIABLE_DESC.slice(start, floor + 1);    // larger than default → step down to it
  } else {
    sizes = [size, 'default'];                        // smaller than default → itself, then the floor
  }
  return [...new Set(sizes)].map((s) => hotelImage(url, s));
}

export default hotelImage;
