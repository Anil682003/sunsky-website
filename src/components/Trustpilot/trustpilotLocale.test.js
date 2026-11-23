import { describe, it, expect } from 'vitest';
import { trustpilotLocale } from './trustpilotConfig';

describe('Trustpilot widget language', () => {
  it('follows the site: Belgian Dutch on the Dutch site, English otherwise', () => {
    expect(trustpilotLocale('nl')).toBe('nl-BE');
    expect(trustpilotLocale('nl-BE')).toBe('nl-BE');
    expect(trustpilotLocale('en')).toBe('en-GB');
    expect(trustpilotLocale(undefined)).toBe('en-GB');
  });
});
