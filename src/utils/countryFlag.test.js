import { describe, it, expect } from 'vitest';
import { flagUrl, flagSrc } from './countryFlag';

/**
 * The four countries whose flag was missing in the destination picker, and why.
 *
 * Flags come from flagcdn, which keys every file by an ISO 3166-1 alpha-2 code. The codes the
 * admin stores are HOTELBEDS destination codes, and a handful are not ISO, so the flag URL the
 * admin built from them 404s and the picker fell through to the white-flag emoji.
 *
 * The codes are not corrected in the dashboard on purpose: they are what the availability
 * search sends, and renaming UK to GB there would break every search for Britain.
 */
describe('a country whose supplier code is not its ISO code', () => {
  it.each([
    ['Verenigd Koninkrijk', 'UK', 'gb'],
    ['Curaçao', 'C0', 'cw'],
    ['Bonaire', 'BK', 'bq'],
  ])('%s (%s) resolves to the %s flag, not a 404', (_name, code, slug) => {
    expect(flagSrc({ isoCode: code })).toBe(`https://flagcdn.com/w40/${slug}.png`);
  });

  it('ignores the broken URL the admin stored rather than trusting it', () => {
    // This is the exact row the API serves for the UK: a flagUrl that 404s.
    const uk = { isoCode: 'UK', code: 'UK', name: 'Verenigd Koninkrijk', flagUrl: 'https://flagcdn.com/uk.svg' };
    expect(flagSrc(uk)).toBe('https://flagcdn.com/w40/gb.png');
  });

  it('draws Northern Cyprus from the repo, since it has no ISO code for the CDN to key', () => {
    const src = flagSrc({ isoCode: 'NY', name: 'Noord-Cyprus' });
    expect(src).toBeTruthy();
    expect(src).not.toMatch(/flagcdn/);
  });

  it('leaves a country whose code is already ISO exactly as it was', () => {
    expect(flagSrc({ isoCode: 'TR' })).toBe('https://flagcdn.com/w40/tr.png');
    expect(flagSrc({ isoCode: 'ES' })).toBe('https://flagcdn.com/w40/es.png');
  });

  it('falls back to a stored URL only for a code it cannot read, and to null otherwise', () => {
    expect(flagSrc({ code: '', flagUrl: 'https://example.test/x.svg' })).toBe('https://example.test/x.svg');
    expect(flagSrc({ code: '' })).toBeNull();
    expect(flagSrc(null)).toBeNull();
  });

  // The existing export is untouched: four other screens draw flags through it.
  it('does not change flagUrl, which the result cards and airport pickers use', () => {
    expect(flagUrl('UK')).toBe('https://flagcdn.com/w40/gb.png');
    expect(flagUrl('0')).toBeNull();
  });
});
