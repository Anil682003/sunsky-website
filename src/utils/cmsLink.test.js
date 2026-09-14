import { describe, it, expect } from 'vitest';
import { resolveCmsLink } from './cmsLink';

// The dashboard's link box is a free-text field, and on this project the CMS write endpoints
// are open on production with no auth. So this is not only "did we parse the URL" — it is the
// check that stands between a string someone put in a database and an href on the homepage.

describe('links that leave the site', () => {
  it('takes a full URL as external', () => {
    expect(resolveCmsLink('https://www.vvr.be')).toEqual({
      href: 'https://www.vvr.be/', external: true,
    });
  });

  it('assumes https for a bare hostname, which is what people actually type', () => {
    expect(resolveCmsLink('www.vvr.be')).toEqual({
      href: 'https://www.vvr.be/', external: true,
    });
  });

  it('keeps the path, query and fragment', () => {
    expect(resolveCmsLink('https://www.vvr.be/leden?x=1#top')).toEqual({
      href: 'https://www.vvr.be/leden?x=1#top', external: true,
    });
  });

  it('treats a protocol-relative URL as the external link it is, not a local path', () => {
    // "//example.com" starts with a slash but goes to another site. Reading it as relative
    // would hand it to the router and it would silently 404.
    expect(resolveCmsLink('//example.com/x')).toEqual({
      href: 'https://example.com/x', external: true,
    });
  });

  it('allows mailto and tel', () => {
    expect(resolveCmsLink('mailto:info@sunsky.be').external).toBe(true);
    expect(resolveCmsLink('tel:+3231234567').external).toBe(true);
  });
});

describe("links to the agency's own pages", () => {
  it('keeps a site-relative path for the router', () => {
    expect(resolveCmsLink('/p/protection-insurance')).toEqual({
      href: '/p/protection-insurance', external: false,
    });
  });

  // Someone copying the live URL out of their address bar should not cause a full page reload.
  it('brings a pasted holidaybooking.be URL back to the router', () => {
    expect(resolveCmsLink('https://holidaybooking.be/p/terms#refunds')).toEqual({
      href: '/p/terms#refunds', external: false,
    });
  });
});

describe('what must never reach an href', () => {
  it('refuses javascript:, whatever the casing or padding', () => {
    expect(resolveCmsLink('javascript:alert(1)')).toBeNull();
    expect(resolveCmsLink('JavaScript:alert(1)')).toBeNull();
    expect(resolveCmsLink('  javascript:alert(1)  ')).toBeNull();
  });

  it('refuses data:, which can carry a whole HTML document', () => {
    expect(resolveCmsLink('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('refuses other schemes rather than allowing anything not blacklisted', () => {
    expect(resolveCmsLink('vbscript:msgbox(1)')).toBeNull();
    expect(resolveCmsLink('file:///etc/passwd')).toBeNull();
  });

  it('treats empty, blank and non-string values as no link', () => {
    expect(resolveCmsLink('')).toBeNull();
    expect(resolveCmsLink('   ')).toBeNull();
    expect(resolveCmsLink(undefined)).toBeNull();
    expect(resolveCmsLink(null)).toBeNull();
    expect(resolveCmsLink(42)).toBeNull();
  });
});
