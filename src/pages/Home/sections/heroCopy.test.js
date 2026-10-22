import { describe, it, expect } from 'vitest';
import { heroCopy } from './heroCopy';

/**
 * Hero copy the dashboard has cleared stays off the homepage.
 *
 * Emptying the hero subtitle in the dashboard used to bring the site's own
 * built-in sentence back in its place, because an empty string read the same
 * as "never configured".
 */

const BUILT_IN = 'Zonovergoten stranden, bruisende steden en verborgen parels.';

describe('hero copy from the dashboard', () => {
  it('shows the dashboard text when it has some', () => {
    expect(heroCopy('Vind jouw perfecte vakantie.', BUILT_IN)).toBe('Vind jouw perfecte vakantie.');
  });

  it('shows nothing when the dashboard field was cleared', () => {
    expect(heroCopy('', BUILT_IN)).toBeNull();
  });

  it('treats a field holding only spaces or line breaks as cleared', () => {
    expect(heroCopy('   ', BUILT_IN)).toBeNull();
    expect(heroCopy('\n', BUILT_IN)).toBeNull();
  });

  it('falls back to the built-in line while the dashboard has never set it', () => {
    expect(heroCopy(undefined, BUILT_IN)).toBe(BUILT_IN);
    expect(heroCopy(null, BUILT_IN)).toBe(BUILT_IN);
  });
});
