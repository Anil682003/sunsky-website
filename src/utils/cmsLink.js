/**
 * Resolve a link typed into the dashboard into something safe to put in an href.
 *
 * WHY THIS IS NOT JUST `href={item.url}`. Two reasons, and the second is the serious one.
 *
 * First, a CMS link can be either kind. "https://www.vvr.be" leaves the site and wants a real
 * anchor with a new tab; "/p/protection-insurance" is one of the agency's own pages and wants
 * the router, or the whole app reloads on click. The dashboard offers one box, so this decides
 * from the value instead of asking the person filling it in to know the difference.
 *
 * Second, `javascript:` is a URL scheme. A string from the CMS reaching an href unchecked is
 * script execution on the homepage, and on this project that is not theoretical: every
 * /api/cms/* write endpoint is open on production with no auth, so the CMS is not a trusted
 * input. Only schemes that navigate are allowed through; anything else resolves to null and
 * the caller renders the mark unlinked rather than rendering something that runs.
 *
 * `data:` is refused along with `javascript:` — a data: URL can carry an HTML document, and
 * following one puts attacker-authored markup on an origin the user just came from.
 */

/** Schemes that merely go somewhere. Everything absolute that is not one of these is refused. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * @param {string} raw  whatever was typed in the dashboard
 * @returns {{href: string, external: boolean} | null}
 *   null when there is no usable link, so `if (!link)` is the "render it plain" branch.
 */
export function resolveCmsLink(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;

  // Site-relative: "/p/terms", "/contact". Handed to the router as-is.
  // "//evil.example" is NOT this — it is protocol-relative and leaves the site — so it is
  // parsed as absolute below rather than being waved through by the leading slash.
  if (value.startsWith('/') && !value.startsWith('//')) {
    return { href: value, external: false };
  }

  // A bare hostname is the most likely thing a person types into a link box. Treated as an
  // external site and given the scheme it meant, rather than being read as a relative path
  // that would resolve under holidaybooking.be and 404.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith('//')
    ? value
    : `https://${value}`;

  let url;
  try {
    url = new URL(candidate, 'https://holidaybooking.be');
  } catch {
    return null;
  }
  if (!SAFE_SCHEMES.has(url.protocol)) return null;

  // Same-origin absolute URLs still belong to the router: someone pasting the live URL of one
  // of the agency's own pages should not trigger a full page load.
  if ((url.protocol === 'https:' || url.protocol === 'http:')
      && url.hostname === 'holidaybooking.be') {
    return { href: url.pathname + url.search + url.hash, external: false };
  }

  return { href: url.href, external: true };
}
