import { describe, it, expect } from 'vitest';
import { nicePrice, priceFloorOf, priceScale, PRICE_SCALE_STEPS } from './priceScale';

describe('price slider scale', () => {
  it('rounds prices to a step that suits their size', () => {
    expect(nicePrice(247)).toBe(250);
    expect(nicePrice(1247)).toBe(1250);
    expect(nicePrice(12_340)).toBe(12_300);
    expect(nicePrice(38_767)).toBe(39_000);
  });

  it('starts the track at the cheapest result, never at 0 once results are in', () => {
    expect(priceFloorOf({ min: 407, max: 38_767 }, 38_800)).toBe(400);
    expect(priceFloorOf(null, 1000)).toBe(0);
    expect(priceFloorOf({ min: 980, max: 990 }, 1000)).toBe(950);
  });

  it('gives the common range most of the track over a wide spread (the live Zonvakanties case)', () => {
    const s = priceScale(400, 38_800);
    expect(s.log).toBe(true);
    const share = (s.toPos(3000) - s.toPos(600)) / PRICE_SCALE_STEPS;
    expect(share).toBeGreaterThan(0.3);            // was 6% on the linear EUR 0..38.800 track
    expect(s.toValue(0)).toBe(400);
    expect(s.toValue(PRICE_SCALE_STEPS)).toBe(38_800);
    expect(s.toPos(400)).toBe(0);
    expect(s.toPos(38_800)).toBe(PRICE_SCALE_STEPS);
  });

  it('round-trips a price through its position', () => {
    const s = priceScale(400, 38_800);
    for (const p of [500, 900, 1250, 2500, 7000]) expect(s.toValue(s.toPos(p))).toBe(p);
  });

  it('is monotonic and clamps to the track', () => {
    const s = priceScale(400, 38_800);
    let last = -1;
    for (let pos = 0; pos <= PRICE_SCALE_STEPS; pos += 10) {
      const v = s.toValue(pos);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(s.toValue(-50)).toBe(400);
    expect(s.toValue(5000)).toBe(38_800);
    expect(s.toPos(10)).toBe(0);
    expect(s.toPos(10_000_000)).toBe(PRICE_SCALE_STEPS);
  });

  it('stays linear for a narrow spread or before anything is known', () => {
    expect(priceScale(800, 1600).log).toBe(false);
    expect(priceScale(0, 1000).log).toBe(false);
    expect(priceScale(800, 1600).toValue(500)).toBe(1200);
  });
});
