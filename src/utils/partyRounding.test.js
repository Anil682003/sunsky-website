// Levent's whole-euro rules (26 Nov 2026): the website's copy must answer exactly as the admin's
// (services/pricing/partyRounding.js) — same examples as its test.
import { describe, it, expect, afterEach } from 'vitest';
import { roundUpForParty, roundUpLine, partyRoundingActive, setPartyRoundingForTest, baseForParty, extraLine } from './partyRounding';

afterEach(() => { setPartyRoundingForTest(null); document.head.innerHTML = ''; });

describe('partyRounding (copy of the admin rules)', () => {
  it('the base offer: up to a whole euro that divides by the travellers, infants included', () => {
    expect(roundUpForParty(409.61, 2)).toBe(410);
    expect(roundUpForParty(963, 2)).toBe(964);
    expect(roundUpForParty(964, 2)).toBe(964);
    expect(roundUpForParty(359.61, 2)).toBe(360);
    expect(roundUpForParty(1001, 3)).toBe(1002);
    expect(roundUpForParty(1000.01, 3)).toBe(1002);
    expect(roundUpForParty(500.2, 4)).toBe(504);
    expect(roundUpForParty(100.004, 2)).toBe(100);
    expect(roundUpForParty(0, 2)).toBe(0);
  });

  it('each paid extra line up to a whole euro', () => {
    expect(roundUpLine(29.99)).toBe(30);
    expect(964 + roundUpLine(29.99)).toBe(994);
    expect(roundUpLine(30)).toBe(30);
    expect(roundUpLine(0)).toBe(0);
  });

  it('on only with the page tag the site server writes; off: amounts unchanged', () => {
    expect(partyRoundingActive()).toBe(false);
    expect(baseForParty(409.61, 2)).toBe(409.61);
    expect(extraLine(29.99)).toBe(29.99);
    document.head.innerHTML = '<meta name="sunsky-party-rounding" content="on">';
    expect(partyRoundingActive()).toBe(true);
    expect(baseForParty(409.61, 2)).toBe(410);
    expect(extraLine(29.99)).toBe(30);
  });
});
