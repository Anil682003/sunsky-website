import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsentProvider } from '../context/ConsentContext';
import Trustpilot from '../components/Trustpilot/Trustpilot';
import CookieBanner from '../components/CookieBanner/CookieBanner';

// The banner resolves its policy link out of the footer CMS; there is no server here.
vi.mock('../api', () => ({
  useFooterConfig: () => ({ data: null, loading: false, error: null }),
}));

/**
 * CONFIGURED AS IF THE ACCOUNT WERE LIVE. Without this the whole file is theatre: no
 * VITE_TRUSTPILOT_BU_ID is set in a test run, so Trustpilot returns null at its FIRST gate
 * and never reaches the consent check — the suite would pass just as happily with the consent
 * gate deleted outright. Forcing the id on means the only thing standing between the visitor
 * and Trustpilot's runtime here is consent, which is the thing under test.
 */
vi.mock('../components/Trustpilot/trustpilotConfig', async (importOriginal) => ({
  ...(await importOriginal()),
  BUSINESS_UNIT_ID: '4f2c1a9b8d6e5f0a1b2c3d4e',
  TRUSTPILOT_ENABLED: true,
}));

/**
 * NOTHING THIRD-PARTY MAY REACH THE PAGE BEFORE THE VISITOR AGREES.
 *
 * This is the one test in the set that keeps working after everyone involved has forgotten
 * the reasoning. It is written as an ALLOWLIST, so it does not care what a future developer
 * adds — a pixel, a chat widget, a tag manager, an embed. Anything that puts a foreign script
 * or iframe on the page before consent breaks the build here, rather than shipping quietly and
 * being discovered by somebody else.
 *
 * If this fails because you added something legitimate: do not widen the allowlist. Register
 * the thing as a purpose in utils/consentStore.js and gate it, the way Trustpilot is gated.
 */

// Origins the site may talk to without asking, because they are ours or are strictly
// necessary. Fonts are here as a statement of current fact, not approval — they load from
// Google at document parse, before any React runs, which is worth fixing by self-hosting.
const OWN_ORIGINS = [
  'localhost',
  '127.0.0.1',
  'holidaybooking.be',
  'admin.holidaybooking.be',
  'cache.holidaybooking.be',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

const isForeign = (url) => {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (url.startsWith('/') || url.startsWith('./')) return false;
  try {
    const host = new URL(url, 'http://localhost').hostname;
    return !OWN_ORIGINS.some((ok) => host === ok || host.endsWith(`.${ok}`));
  } catch {
    return false;
  }
};

const foreignNodes = () => [
  ...[...document.querySelectorAll('script[src]')].map((n) => n.getAttribute('src')),
  ...[...document.querySelectorAll('iframe[src]')].map((n) => n.getAttribute('src')),
].filter(isForeign);

const clearCookies = () => {
  for (const c of document.cookie.split(';')) {
    document.cookie = `${c.split('=')[0].trim()}=; Path=/; Max-Age=0`;
  }
};

beforeEach(clearCookies);

const renderTree = () => render(
  <MemoryRouter>
    <ConsentProvider>
      <CookieBanner />
      <Trustpilot />
    </ConsentProvider>
  </MemoryRouter>,
);

describe('a visitor who has not agreed to anything', () => {
  // Guards the guard: if this ever stops being true, every other assertion in the file is
  // passing for the wrong reason.
  it('is looking at a page where the widget WOULD otherwise load', async () => {
    const { TRUSTPILOT_ENABLED } = await import('../components/Trustpilot/trustpilotConfig');
    expect(TRUSTPILOT_ENABLED).toBe(true);
  });

  it('gets no third-party script or frame on the page', async () => {
    renderTree();
    // Give any effect that wanted to inject something the chance to do it.
    await new Promise((r) => setTimeout(r, 20));
    expect(foreignNodes()).toEqual([]);
  });

  it('gets no Trustpilot runtime in particular', async () => {
    renderTree();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll('[src*="trustpilot"]')).toHaveLength(0);
    expect(window.Trustpilot).toBeUndefined();
  });

  it('is asked, rather than quietly opted in', () => {
    const { getByRole } = renderTree();
    expect(getByRole('region', { name: /cookie consent/i })).toBeInTheDocument();
    expect(document.cookie).not.toMatch(/sunsky_consent/);
  });
});
