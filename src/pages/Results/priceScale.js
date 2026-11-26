/* ═══════════════════════════════════════════════════════════════════════════
   The results page's price slider, as a scale (client remark, 26 Nov 2026).

   The track used to run linearly from EUR 0 to the single dearest result: "Zonvakanties" ran to
   EUR 38.800 for one villa while nearly every holiday cost EUR 400 to 3.000, so the whole useful
   range sat in the first few percent of the track and the handle jumped hundreds of euros per
   pixel. Now the track runs from the cheapest result to the dearest, and over a wide spread it
   is logarithmic: every step is the same PERCENTAGE of price, so EUR 600 to 3.000 gets about a
   third of the track instead of 6%. Positions are 0..PRICE_SCALE_STEPS; prices are rounded to a
   step that suits their size, so the handle reads EUR 1.250, not EUR 1.247.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PRICE_SCALE_STEPS = 1000;

/** A price rounded to a step that suits its size. */
export function nicePrice(value) {
  const v = Number(value) || 0;
  const step = v < 1000 ? 10 : v < 5000 ? 50 : v < 20000 ? 100 : 500;
  return Math.round(v / step) * step;
}

/**
 * The left end of the track: the cheapest price the search returned, rounded down to `step`,
 * and always below the ceiling. 0 while nothing is known yet.
 */
export function priceFloorOf(available, ceiling, step = 50) {
  const min = Number(available?.min);
  if (!Number.isFinite(min) || min <= 0) return 0;
  const floor = Math.floor(min / step) * step;
  return Math.max(0, Math.min(floor, Number(ceiling) - step));
}

/**
 * The mapping between handle positions and prices. Logarithmic when the dearest price is at
 * least four times the cheapest (a linear track is fine for a narrow spread, and log of 0 is
 * not), linear otherwise. Both directions clamp to the track.
 */
export function priceScale(floor, ceiling) {
  const lo = Math.max(0, Number(floor) || 0);
  const hi = Math.max(lo + 1, Number(ceiling) || 0);
  const log = lo > 0 && hi / lo >= 4;
  const steps = PRICE_SCALE_STEPS;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  const toValue = (pos) => {
    const p = clamp01(Number(pos) / steps);
    if (p <= 0) return lo;
    if (p >= 1) return hi;
    const raw = log ? lo * (hi / lo) ** p : lo + (hi - lo) * p;
    return Math.min(hi, Math.max(lo, nicePrice(raw)));
  };
  const toPos = (value) => {
    const v = Math.min(hi, Math.max(lo, Number(value) || 0));
    const p = log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
    return Math.round(steps * clamp01(p));
  };
  return { steps, log, floor: lo, ceiling: hi, toValue, toPos };
}
