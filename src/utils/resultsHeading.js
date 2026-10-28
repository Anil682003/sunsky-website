// The results page heading, built from what the search is about (Levent 28 Oct):
//   type or theme only   → "Ontdek onze stedentrips", "Ontdek onze All Inclusive vakanties"
//   one place            → "Ontdek onze vakanties in Turkije / op Cyprus / aan de Turkse Riviera"
//   city trips + a city  → "Ontdek onze stedentrips naar Rome"
//   anything else        → "Ontdek onze vakanties"
// Never "Verblijven in Stedentrips": a type is not a place. Rules, not a list of names, so new
// destinations and types get a correct heading without a code change; the admin can override
// any one of them (Homepage Settings → Results page headings).
//
// Returns { before, em, after }: `em` is the part the page highlights in orange.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const isCityTrip = (name) => /stedentrip|city ?trip|citytrip/.test(norm(name));

// Islands and island groups take "op" in Dutch. Matched on the Dutch and English name, so the
// cascade's spelling and the CMS label both hit.
const ISLANDS = [
  'cyprus', 'mallorca', 'majorca', 'menorca', 'ibiza', 'formentera', 'kreta', 'crete', 'rhodos', 'rhodes',
  'kos', 'corfu', 'korfoe', 'zakynthos', 'kefalonia', 'lesbos', 'samos', 'santorini', 'mykonos', 'naxos', 'paros',
  'karpathos', 'thassos', 'skiathos', 'chios', 'sicilie', 'sicily', 'sardinie', 'sardinia', 'corsica', 'elba',
  'malta', 'gozo', 'madeira', 'tenerife', 'gran canaria', 'lanzarote', 'fuerteventura', 'la palma', 'la gomera',
  'el hierro', 'bali', 'lombok', 'java', 'phuket', 'koh samui', 'ko samui', 'mauritius', 'sri lanka', 'cuba',
  'jamaica', 'aruba', 'curacao', 'bonaire', 'sint maarten', 'barbados', 'zanzibar', 'kaapverdie', 'cape verde',
  'sal', 'boa vista', 'djerba', 'ijsland', 'iceland', 'ierland', 'ireland', 'hawaii', 'tahiti', 'langkawi',
  'penang', 'boracay', 'hvar', 'krk', 'brac', 'evia', 'aegina',
];
// Island groups and countries named with "de".
const WITH_ARTICLE = [
  'malediven', 'maldives', 'seychellen', 'seychelles', 'canarische eilanden', 'canary islands', 'balearen',
  'balearic islands', 'azoren', 'azores', 'filipijnen', 'philippines', 'verenigde staten', 'united states',
  'verenigde arabische emiraten', 'united arab emirates', 'dominicaanse republiek', 'dominican republic',
  'antillen', 'bahamas', 'cycladen', 'dodekanesos', 'kanaaleilanden', 'algarve', 'provence', 'dolomieten',
];
const ISLAND_GROUPS = ['malediven', 'maldives', 'seychellen', 'seychelles', 'canarische eilanden', 'canary islands',
  'balearen', 'balearic islands', 'azoren', 'azores', 'filipijnen', 'philippines', 'antillen', 'bahamas', 'cycladen',
  'dodekanesos', 'kanaaleilanden'];

/** "op", "aan" or "in" (+ "de" where Dutch needs it) for one place, in Dutch. */
export function dutchPlace(place) {
  const n = norm(place);
  const article = WITH_ARTICLE.includes(n) && !/^de /.test(n) ? 'de ' : '';
  if (/(riviera|kust|costa|coast)\b/.test(n) || /^costa /.test(n)) {
    return { prep: 'aan', place: /^(de|het) /.test(n) || /^costa /.test(n) ? place : `de ${place}` };
  }
  if (ISLANDS.includes(n) || ISLAND_GROUPS.includes(n) || /eiland(en)?\b|island(s)?\b/.test(n)) {
    return { prep: 'op', place: `${article}${place}` };
  }
  return { prep: 'in', place: `${article}${place}` };
}

/** The type or theme as a noun phrase: "stedentrips", "lastminutes", "All Inclusive vakanties". */
export function typePhrase(name, lang = 'nl') {
  const n = norm(name);
  const en = lang === 'en';
  if (/last ?minute/.test(n)) return en ? 'last-minute deals' : 'lastminutes';
  if (/^winter ?zon/.test(n)) return en ? 'winter sun holidays' : 'winterzonvakanties';
  if (isCityTrip(name)) return en ? 'city trips' : 'stedentrips';
  // Already a plural holiday noun ("Zonvakanties", "Verre reizen", "Autovakanties"): as it is.
  if (/(vakanties|vakantie|reizen|reis|trips|holidays|tours|cruises)$/.test(n)) return String(name).trim().toLowerCase();
  // A label ("All Inclusive", "Adults Only", "Wellness"): keep its capitals, add the noun.
  return `${String(name).trim()} ${en ? 'holidays' : 'vakanties'}`;
}

/**
 * @param {object} ctx
 * @param {string} [ctx.type]   name of the ONE active holiday type or theme (or '')
 * @param {string} [ctx.place]  name of the ONE place searched (or '')
 * @param {'nl'|'en'} [ctx.lang]
 * @param {string} [ctx.custom] the admin's override for this context, used verbatim
 */
export function resultsHeading({ type = '', place = '', lang = 'nl', custom = '' } = {}) {
  const en = lang === 'en';
  const lead = en ? 'Discover our ' : 'Ontdek onze ';
  if (custom && String(custom).trim()) return { before: '', em: String(custom).trim(), after: '' };
  // "Rome, Italië" from a card label: the heading names the place, not its country.
  const where = String(place || '').split(',')[0].trim();
  const what = type ? typePhrase(type, lang) : '';

  if (where) {
    if (type && isCityTrip(type)) return { before: `${lead}${what} ${en ? 'to' : 'naar'} `, em: where, after: '' };
    const noun = what || (en ? 'holidays' : 'vakanties');
    if (en) return { before: `${lead}${noun} in `, em: where, after: '' };
    const { prep, place: p } = dutchPlace(where);
    const article = p.slice(0, p.length - where.length);
    return { before: `${lead}${noun} ${prep} ${article}`, em: where, after: '' };
  }
  if (what) {
    // "All Inclusive vakanties": the label is highlighted, the noun is not.
    const noun = en ? ' holidays' : ' vakanties';
    if (what.endsWith(noun) && what !== noun.trim()) {
      return { before: lead, em: what.slice(0, -noun.length), after: noun };
    }
    return { before: lead, em: what, after: '' };
  }
  return { before: lead, em: en ? 'holidays' : 'vakanties', after: '' };
}

/** The admin's override for this search, or ''. Rows come from Homepage Settings → Results page
 * headings: { kind: 'type' | 'country' | 'destination', code, nl, en }. A place row wins over a
 * type row, as the more specific of the two. `placeKeys` are "country:TR", "destination:PMI". */
export function customHeading(rows, { type = '', placeKeys = [], lang = 'nl' } = {}) {
  if (!Array.isArray(rows)) return '';
  const text = (row) => String(row?.[lang] || '').trim();
  const keyOf = (row) => {
    const kind = row?.kind || 'type';
    const code = kind === 'type' ? norm(row?.code) : String(row?.code ?? '').trim().toUpperCase();
    return code ? `${kind}:${code}` : '';
  };
  const byKey = new Map();
  rows.forEach((r) => { const k = keyOf(r); if (k && text(r) && !byKey.has(k)) byKey.set(k, text(r)); });
  for (const k of placeKeys) {
    const [kind, code] = String(k).split(':');
    const v = byKey.get(`${kind}:${String(code ?? '').toUpperCase()}`);
    if (v) return v;
  }
  if (type && !placeKeys.length) return byKey.get(`type:${norm(type)}`) || '';
  return '';
}
