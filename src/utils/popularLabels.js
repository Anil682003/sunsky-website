// The popular-destination names (CMS > Homepage > Popular destinations) in the visitor's
// language. The dashboard stores each link and card title as one plain text, typed in English
// ("Turkey All Inclusive", "Cities"), so the known names are translated here from the home
// namespace (popular.links.*, popular.groups.*.title). A name not in the list shows as typed.
// Shared by the homepage cards, the header's destinations menu and the search's idle chips,
// so the three never disagree.

const LINK_KEYS = {
  'bali': 'bali', 'thailand': 'thailand', 'maldives': 'maldives', 'sri lanka': 'sriLanka',
  'mexico': 'mexico', 'dominican republic': 'dominicanRepublic',
  'turkey all inclusive': 'turkeyAllInclusive', 'egypt all inclusive': 'egyptAllInclusive',
  'greece all inclusive': 'greeceAllInclusive', 'spain all inclusive': 'spainAllInclusive',
  'cape verde': 'capeVerde',
  'last minute spain': 'lastMinuteSpain', 'last minute turkey': 'lastMinuteTurkey',
  'last minute greece': 'lastMinuteGreece', 'last minute egypt': 'lastMinuteEgypt',
  'last minute canary islands': 'lastMinuteCanaryIslands',
  'paris': 'paris', 'rome': 'rome', 'barcelona': 'barcelona', 'london': 'london',
  'prague': 'prague', 'amsterdam': 'amsterdam',
};

const GROUP_KEYS = {
  'distant destinations': 'distant',
  'all inclusive': 'allInclusive',
  'last minutes': 'lastMinute', 'last minute': 'lastMinute',
  'cities': 'cities',
};

// Case and spacing as typed in the dashboard do not matter: "Turkey all inclusive" is the same.
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const popularLinkLabel = (t, raw) => {
  const k = LINK_KEYS[norm(raw)];
  return k ? t(`home:popular.links.${k}`, raw) : raw;
};

export const popularGroupTitle = (t, raw) => {
  const k = GROUP_KEYS[norm(raw)];
  return k ? t(`home:popular.groups.${k}.title`, raw) : raw;
};
