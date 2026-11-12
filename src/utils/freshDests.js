// The names of places the dashboard linked, as GeoData calls them NOW (Levent, 12 Nov 2026:
// "Mallorca" on a homepage card opened results titled "Majorca, Spain").
//
// A CMS item stores the place as it was when it was picked — { type, code, name, countryName },
// copied from the Hotelbeds-sourced search at that moment ("Majorca", "Spain"). GeoData has since
// been edited to the Dutch names ("Mallorca", "Spanje"), and that is what the site must say. The
// CODE is the stable part; the names are looked up by it:
//   city     → GeoData's current name, and its country in the reader's language
//   country  → the country in the reader's language (countryName.js, by ISO code)
// Until the lookup answers (one shared, cached request), the stored names are used as before.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchDestinationCountries } from '../api/filters';
import { countryName } from './countryName';

/** PURE. `d` with its names refreshed from `byCode` (code → { name, countryCode, countryName }). */
export function freshDest(d, byCode, language) {
  if (!d || !d.code) return d;
  if (d.type === 'country') return { ...d, name: countryName(d.code, language, d.name) };
  const geo = byCode?.get(String(d.code).trim().toUpperCase());
  if (!geo) return d;
  return {
    ...d,
    name: geo.name || d.name,
    countryName: countryName(geo.countryCode, language, geo.countryName || d.countryName),
  };
}

/** Hook: a `fresh(d)` function for the given stored places (cities are looked up once). */
export function useFreshDests(dests) {
  const { i18n } = useTranslation();
  const language = i18n?.language || 'nl';
  const codesKey = useMemo(() => [...new Set((Array.isArray(dests) ? dests : [])
    .filter((d) => d?.type === 'city' && d.code)
    .map((d) => String(d.code).trim().toUpperCase()))].sort().join(','), [dests]);
  const [byCode, setByCode] = useState(() => new Map());
  useEffect(() => {
    if (!codesKey) return undefined;
    let live = true;
    fetchDestinationCountries(codesKey.split(','))
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        setByCode(new Map(rows.filter((r) => r?.code).map((r) => [String(r.code).trim().toUpperCase(), r])));
      })
      .catch(() => {});   // keep the stored names: a label is never worth an error
    return () => { live = false; };
  }, [codesKey]);
  return useCallback((d) => freshDest(d, byCode, language), [byCode, language]);
}

export default useFreshDests;
