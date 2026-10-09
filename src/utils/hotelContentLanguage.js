// Hotel content (name, description, facilities) is Hotelbeds data served through the admin's
// `hotels` tables, not something our locale files can translate. The admin stores it per
// language in `hotelDescriptions` and returns every row it has as `descriptions[]`, alongside a
// flat `description` field that is hardcoded to the English row.
//
// So a Dutch traveller used to read the whole page in Dutch except the paragraph describing the
// hotel. Picking the right row here is the website's half of that fix; the other half is having
// the Dutch rows in the database at all (backfillDutchDescriptions.js in sunsky-admin).

/** Hotelbeds' own code for each language we offer. 'HOL' is Nederlands, confirmed against
 *  their types/languages endpoint rather than guessed from the ISO code. */
const HB_LANGUAGE = { nl: 'HOL', en: 'ENG' };

/** The Hotelbeds language code for an i18n language ('nl-BE' and 'nl' both mean Dutch). */
export const hbLanguageFor = (lang) => HB_LANGUAGE[String(lang || '').slice(0, 2).toLowerCase()] || 'ENG';

const rowText = (rows, code) => {
  const hit = rows.find((d) => d?.languageCode === code && String(d?.description || '').trim());
  return hit ? String(hit.description).trim() : '';
};

/**
 * The hotel description in the traveller's language, falling back rather than blanking.
 *
 * Order: their language, then English, then the flat field. The fallback matters because the
 * Dutch backfill skips properties Hotelbeds has no Dutch text for — for those, English prose
 * is a far better page than an empty one, and silently showing nothing would read as a bug.
 */
export function localizedDescription(info, lang) {
  if (!info) return '';
  const rows = Array.isArray(info.descriptions) ? info.descriptions : [];
  return (
    rowText(rows, hbLanguageFor(lang)) ||
    rowText(rows, 'ENG') ||
    String(info.description || '').trim()
  );
}
