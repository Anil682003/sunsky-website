import i18n from '../i18n';

/**
 * A facility, activity, kids or accommodation-type row from the filter facets (Hotelbeds'
 * catalogue): its Dutch name on the Dutch site, else the English one (Levent, 25 Nov 2026:
 * "translations in filter result page"). The admin sends `nameNl` from
 * facilityTypes.facilityNameNl, kept filled weekly (pm2 facility-names-nl-weekly); a code
 * Hotelbeds has no Dutch for stays English. Read at render time, so a renamed or newly filled
 * name shows without a website deploy.
 */
export const facetName = (row, lang = i18n.language) =>
  (row && String(lang || '').toLowerCase().startsWith('nl') && row.nameNl ? row.nameNl : row?.name);

export default facetName;
