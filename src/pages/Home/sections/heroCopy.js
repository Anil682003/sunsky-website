/**
 * Which line of hero copy to show: the dashboard's, the built-in one, or none.
 *
 * Unset (null or undefined) means the dashboard has never said anything about
 * the field, so the built-in line shows. Set but blank means someone cleared it
 * on purpose, and the hero shows nothing there: emptying a field in the
 * dashboard is how it is taken off the homepage. The API sends a cleared field
 * as "", which is why this cannot be a truthiness test.
 *
 * Blank includes whitespace only. A field holding a stray space would otherwise
 * draw an empty line that still takes up its margins.
 */
export function heroCopy(cmsValue, fallback) {
  if (cmsValue == null) return fallback;
  return String(cmsValue).trim() ? cmsValue : null;
}
