import { describe, it, expect } from 'vitest';
import { resolveBrandLogo, BUNDLED_LOGO } from './useBrandLogo';

// The site draws its logo in six places: the bar, the footer, sign-in, register, verify and
// the printable voucher. Each of them used to decide for itself which CMS slot to read, and
// they disagreed — changing the logo in CMS → Layout → Header moved the bar and left the rest
// showing the previous mark. One order, proven here, is what stops that happening again.
describe('which logo the site draws', () => {
  const HEADER = 'https://cdn.test/header.png';
  const HOMEPAGE = 'https://cdn.test/homepage.png';
  const FOOTER = 'https://cdn.test/footer.png';

  it('takes the header slot first, because that is the one the dashboard calls "the logo"', () => {
    expect(resolveBrandLogo({ header: HEADER, homepage: HOMEPAGE, footer: FOOTER })).toBe(HEADER);
  });

  // The footer used to prefer its own upload. That is the exact bug: three slots, three
  // marks, and the one nobody edits winning on the page nobody checks.
  it('outranks a footer logo, rather than letting the footer keep an older one', () => {
    expect(resolveBrandLogo({ header: HEADER, footer: FOOTER })).toBe(HEADER);
  });

  it('falls back through homepage, then footer', () => {
    expect(resolveBrandLogo({ homepage: HOMEPAGE, footer: FOOTER })).toBe(HOMEPAGE);
    expect(resolveBrandLogo({ footer: FOOTER })).toBe(FOOTER);
  });

  it('ends at the bundled file, so a logo is never simply missing', () => {
    expect(resolveBrandLogo({})).toBe(BUNDLED_LOGO);
    expect(resolveBrandLogo()).toBe(BUNDLED_LOGO);
    // Empty strings are what an untouched CMS field actually sends, not undefined.
    expect(resolveBrandLogo({ header: '', homepage: '   ', footer: null })).toBe(BUNDLED_LOGO);
  });

  // A dashboard upload is stored as a path on the ADMIN origin, which resolves to nothing at
  // all against the customer site. This is where that gets fixed for every caller at once.
  it('makes a dashboard upload path absolute', () => {
    const src = resolveBrandLogo({ header: '/uploads/header/logo-1789237328170.png' });
    expect(src).toMatch(/^https?:\/\//);
    expect(src).toMatch(/\/uploads\/header\/logo-1789237328170\.png$/);
    expect(src).not.toMatch(/\/api\/uploads/);
  });
});
