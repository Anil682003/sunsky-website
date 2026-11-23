/**
 * What to call a country on screen, in the language being read.
 *
 * The dashboard's country list is English seed data — "Spain", "Turkey", "Greece" — and
 * nobody is going to retype fifty-seven country names in Dutch. A country has exactly one
 * right name in each language and the browser already knows it, so the ISO code decides the
 * WORD and the dashboard decides which countries are sold.
 *
 * The caller's own name is what shows for a row with no usable ISO code, so a destination
 * the browser has never heard of is never renamed to nothing.
 *
 * ZZ is excluded by name: it is CLDR's "unknown region" and resolves to the phrase
 * "onbekend gebied" rather than failing, which would read as a country called Unknown.
 *
 * NOT a "keep names edited by hand" rule. An earlier version tried that, comparing the
 * stored name against the English one and keeping anything that differed. It could not
 * work: Intl calls TR "Türkiye" in English now, so the seed's own "Turkey" looked
 * hand-edited and stayed English on a Dutch page.
 */
export function countryName(iso, language, fallback = '') {
  const code = String(iso || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') return fallback;
  try {
    return new Intl.DisplayNames([language], { type: 'region', fallback: 'none' }).of(code) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * What to call a SOLD country (one from the dashboard's Geo Data) in the destination search.
 *
 * Dutch: the name exactly as entered in Geo Data > Countries. The agency writes those names in
 * Dutch ("Turkije", "Spanje", "Noord-Cyprus") and the Dutch site must say what they wrote, not
 * what the browser would call the country (23/11/2026). Only a row with no stored name at
 * all asks the browser.
 *
 * Any other language: the stored names are Dutch, so the browser names the country from its
 * ISO code, and the stored name covers a code the browser does not know.
 *
 * Not for checkout or register: their country lists are the site's own English list, not Geo
 * Data, and keep countryName() above.
 */
export function geoCountryName(iso, language, storedName = '') {
  const stored = String(storedName ?? '').trim();
  if (/^nl\b/i.test(String(language || '')) && stored) return stored;
  return countryName(iso, language, stored);
}

export default countryName;
