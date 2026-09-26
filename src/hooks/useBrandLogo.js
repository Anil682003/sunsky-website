// useBrandLogo — the SUNSKY logo, answered in one place for the whole site.
//
// The logo used to be resolved separately everywhere it was drawn, and each place looked in a
// different cupboard: the navbar read the header CMS, the footer read its own footer CMS, and
// the sign-in, register, verify and voucher pages read the file bundled with the build. All
// three cupboards had a logo in them, so nothing looked broken — the site simply showed three
// different marks, and changing the one in CMS → Layout → Header changed only the navbar.
//
// So there is now ONE order, written here and used by every caller:
//
//   1. CMS → Layout → Header `logoUrl`   — the slot the dashboard treats as "the logo"
//   2. CMS → Layout → Homepage `logo.mainUrl`
//   3. CMS → Layout → Footer `brandLogoUrl`
//   4. the file bundled with the build
//
// The header slot leads deliberately, and that is a change for the footer, which used to
// prefer its own. A footer-only logo is still honoured when the header has none, but it can no
// longer outrank the logo the agency actually edits.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { ENDPOINTS } from '../api/endpoints';
import { resolveCmsImageUrl } from '../utils/cmsImage';
import bundledLogo from '../assets/main-logo.png';

export const BUNDLED_LOGO = bundledLogo;

/**
 * The logo to draw, from whichever CMS slots the caller happens to hold.
 *
 * Pure, so the precedence can be proven without a network or a component. Every argument is
 * optional: a caller that only knows about one slot passes one.
 *
 * @param {{header?:string, homepage?:string, footer?:string}} sources raw CMS values
 * @returns {string} a loadable URL — never empty, because the bundled file is the last resort
 */
export function resolveBrandLogo({ header, homepage, footer } = {}) {
  return (
    resolveCmsImageUrl(header)
    || resolveCmsImageUrl(homepage)
    || resolveCmsImageUrl(footer)
    || bundledLogo
  );
}

// The header config is one small object (under a kilobyte) that every logo on the site now
// reads, so it is fetched once per session and shared, the way the departure-airport master
// list is. Without this, a page drawing the logo twice would ask for it twice.
let _cache = null;
let _inflight = null;

function loadHeaderConfig() {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  // Guarded whole: a CMS that is down or a test with no axios mock must fall through to the
  // bundled logo, never throw inside a render.
  try {
    _inflight = axiosInstance
      .get(ENDPOINTS.headerConfig)
      .then((res) => {
        const body = res?.data;
        _cache = (body?.success ? body.data?.headerConfig ?? body.data : null) || {};
        return _cache;
      })
      .catch(() => { _cache = {}; return _cache; })
      .finally(() => { _inflight = null; });
    return _inflight;
  } catch {
    _cache = {};
    return Promise.resolve(_cache);
  }
}

/** Forget the cached header config — for tests, and for anything that re-reads the CMS. */
export function clearBrandLogoCache() { _cache = null; _inflight = null; }

/**
 * The site's logo for a page that has no CMS data of its own (sign-in, register, verify, the
 * printable voucher). Renders the bundled logo first and swaps to the CMS one when it lands,
 * so the page never shows an empty space where its logo should be.
 *
 * @param {{homepage?:string, footer?:string}} [fallbacks] slots the caller already has
 * @returns {{src:string, alt:string}}
 */
export function useBrandLogo(fallbacks = {}) {
  const [header, setHeader] = useState(_cache);

  useEffect(() => {
    if (_cache) return undefined;
    let live = true;
    loadHeaderConfig().then((cfg) => { if (live) setHeader(cfg); });
    return () => { live = false; };
  }, []);

  return {
    src: resolveBrandLogo({ header: header?.logoUrl, ...fallbacks }),
    // The dashboard's own wording when it has any. It is the company's name for its own mark,
    // so it wins over the one written into a page.
    alt: header?.logoAltText?.trim() || '',
  };
}

export default useBrandLogo;
