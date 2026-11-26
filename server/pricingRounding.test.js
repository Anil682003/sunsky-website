import { describe, it, expect } from 'vitest';
import { roundingMetaTag, withRoundingMeta } from './pricingRounding.js';
import { ruleFromMeta } from '../src/utils/pricingRounding.js';

const PAGE = '<html><head>\n  <title>x</title>\n  </head><body></body></html>';

describe('the rounding rule written into the page', () => {
  it('a rule switched on becomes a <meta> the browser reads back as the same rule', () => {
    const html = withRoundingMeta(PAGE, { apply: true, strategy: 'ceil', decimals: 2 });
    const content = /<meta name="sunsky-pricing-rounding" content="([^"]+)">/.exec(html)[1].replace(/&quot;/g, '"');
    expect(ruleFromMeta(content)).toEqual({ strategy: 'ceil', decimals: 2 });
    expect(html.indexOf('sunsky-pricing-rounding')).toBeLessThan(html.indexOf('</head>'));
  });
  it('switched off, unknown or never answered: no tag, the page unchanged (legacy rounding)', () => {
    expect(withRoundingMeta(PAGE, { apply: false, strategy: 'ceil', decimals: 2 })).toBe(PAGE);
    expect(withRoundingMeta(PAGE, null)).toBe(PAGE);
    expect(roundingMetaTag(undefined)).toBe('');
  });
});

describe('the whole-euro rules tag (26 Nov 2026)', () => {
  const PAGE2 = '<html><head><title>x</title></head><body></body></html>';
  it('is written when the admin says partyRounding, with or without the Pricing Logic rule', () => {
    expect(withRoundingMeta(PAGE2, { apply: false, partyRounding: true })).toContain('<meta name="sunsky-party-rounding" content="on">');
    const both = withRoundingMeta(PAGE2, { apply: true, strategy: 'ceil', decimals: 2, partyRounding: true });
    expect(both).toContain('sunsky-pricing-rounding');
    expect(both).toContain('sunsky-party-rounding');
  });
  it('is not written when it is off', () => {
    expect(withRoundingMeta(PAGE2, { apply: false, partyRounding: false })).toBe(PAGE2);
    expect(withRoundingMeta(PAGE2, { apply: true, strategy: 'ceil', decimals: 2 })).not.toContain('sunsky-party-rounding');
  });
});
