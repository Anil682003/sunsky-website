/**
 * The fixed header's full height in px: the bar plus the announcement strip above it, when one
 * is showing. For scroll maths in JS; stylesheets use var(--nav-h) directly.
 *
 * Why not just read --nav-h: it is now `calc(var(--nav-bar-h) + var(--announce-h))`, and a
 * custom property's computed value keeps the calc text ("calc(88px + 36px)"), which parseFloat
 * reads as NaN. Its two parts are plain lengths, so they are read and added here instead.
 *
 * @param fallback returned when the stylesheet cannot be read (no DOM, or no --nav-bar-h)
 */
export function navHeightPx(fallback = 0) {
  try {
    const css = getComputedStyle(document.documentElement);
    const bar = parseFloat(css.getPropertyValue('--nav-bar-h'));
    if (!Number.isFinite(bar)) return fallback;
    const strip = parseFloat(css.getPropertyValue('--announce-h'));
    return bar + (Number.isFinite(strip) ? strip : 0);
  } catch {
    return fallback;
  }
}
