/**
 * Builds the travel icon set used by "Most popular destinations" on the homepage and by
 * the icon pickers in the dashboard's Homepage Settings.
 *
 *   node scripts/travel-icons.mjs [--admin <dir>]
 *
 * Two icon families, both from Iconify's collections (the data npm publishes as
 * @iconify-json/*), rendered with @iconify/react:
 *   - emoji  Microsoft Fluent Emoji, "Color" style (MIT). One per link row.
 *   - glyphs One-colour icons for the card headers, tinted to the card: Material Design
 *            Icons and Material Symbols (both Apache 2.0) and Phosphor (MIT).
 *
 * The full Fluent collection is ~100 MB, so only the icons listed below are kept, one JSON
 * file per emoji, and the homepage loads just the ones the CMS actually uses. To offer a new
 * icon in the dashboard, add it here and re-run with --admin pointing at the dashboard's
 * copy (frontend/src/assets/travel-icons) so both apps keep the same list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src/assets/travel-icons');

// [name, label shown in the picker, tile colour behind it, search words]
const EMOJI = [
  // Beaches, nature, landscapes
  ['desert-island', 'Island', 'sunset', ['island', 'tropical', 'bali', 'maldives']],
  ['beach-with-umbrella', 'Beach', 'sky', ['beach', 'sea', 'caribbean']],
  ['umbrella-on-ground', 'Beach umbrella', 'beach', ['beach', 'spain', 'summer']],
  ['palm-tree', 'Palm tree', 'beach', ['palm', 'tropical', 'cape verde']],
  ['sunset', 'Sunset', 'sunset', ['evening', 'romantic']],
  ['volcano', 'Volcano', 'sand', ['canary islands', 'iceland']],
  ['snow-capped-mountain', 'Snowy mountain', 'sky', ['ski', 'alps', 'winter']],
  ['mountain', 'Mountain', 'mint', ['hiking', 'nature']],
  ['national-park', 'National park', 'mint', ['nature', 'park']],
  ['camping', 'Camping', 'mint', ['tent', 'outdoor']],
  ['desert', 'Desert', 'sand', ['sahara', 'dubai']],
  ['hut', 'Beach hut', 'sea', ['bungalow', 'maldives']],
  ['houses', 'Houses', 'rose', ['village', 'holiday home']],
  ['cityscape', 'City skyline', 'sky', ['city', 'city trip']],
  ['cityscape-at-dusk', 'City at dusk', 'lavender', ['city', 'night']],
  ['night-with-stars', 'Starry night', 'lavender', ['night']],
  ['bridge-at-night', 'Bridge', 'lavender', ['city', 'river']],
  // Landmarks
  ['classical-building', 'Classical temple', 'sky', ['greece', 'athens', 'rome']],
  ['stadium', 'Arena', 'sand', ['rome', 'colosseum']],
  ['church', 'Church', 'sky', ['barcelona', 'santorini']],
  ['mosque', 'Mosque', 'sky', ['turkey', 'istanbul', 'dubai']],
  ['hindu-temple', 'Temple', 'sky', ['thailand', 'india', 'bali']],
  ['shinto-shrine', 'Shrine', 'rose', ['japan']],
  ['castle', 'Castle', 'sky', ['prague', 'fairytale']],
  ['japanese-castle', 'Japanese castle', 'rose', ['japan', 'tokyo']],
  ['tokyo-tower', 'Tower', 'sky', ['paris', 'eiffel']],
  ['statue-of-liberty', 'Statue of Liberty', 'sky', ['new york', 'usa']],
  ['ferris-wheel', 'Ferris wheel', 'sky', ['london', 'fun']],
  ['moai', 'Moai', 'sand', ['easter island']],
  // Getting there
  ['airplane', 'Airplane', 'sky', ['flight', 'fly']],
  ['automobile', 'Car', 'rose', ['car', 'road trip', 'by car']],
  ['passenger-ship', 'Cruise ship', 'sea', ['cruise', 'boat']],
  ['sailboat', 'Sailboat', 'sea', ['sailing', 'croatia']],
  ['high-speed-train', 'Train', 'sky', ['rail', 'train']],
  ['bicycle', 'Bicycle', 'mint', ['amsterdam', 'cycling']],
  // Flowers and animals
  ['tulip', 'Tulip', 'rose', ['amsterdam', 'netherlands']],
  ['hibiscus', 'Hibiscus', 'rose', ['tropical', 'hawaii']],
  ['cherry-blossom', 'Cherry blossom', 'rose', ['japan', 'spring']],
  ['sunflower', 'Sunflower', 'sand', ['provence', 'tuscany']],
  ['cactus', 'Cactus', 'sand', ['mexico', 'desert']],
  ['camel', 'Camel', 'sand', ['egypt', 'morocco', 'desert']],
  ['elephant', 'Elephant', 'mint', ['thailand', 'sri lanka', 'safari']],
  ['dolphin', 'Dolphin', 'sea', ['sea', 'diving']],
  ['tropical-fish', 'Tropical fish', 'sea', ['snorkelling', 'red sea']],
  ['flamingo', 'Flamingo', 'rose', ['tropical']],
  // Food and drink
  ['croissant', 'Croissant', 'sand', ['france', 'paris']],
  ['pizza', 'Pizza', 'sand', ['italy']],
  ['spaghetti', 'Pasta', 'sand', ['italy']],
  ['pretzel', 'Pretzel', 'sand', ['germany']],
  ['taco', 'Taco', 'sand', ['mexico']],
  ['sushi', 'Sushi', 'rose', ['japan']],
  ['shallow-pan-of-food', 'Paella', 'sand', ['spain']],
  ['tropical-drink', 'Cocktail', 'sunset', ['all inclusive', 'drinks']],
  ['wine-glass', 'Wine', 'rose', ['wine', 'france', 'portugal']],
  // People
  ['guard', 'Royal guard', 'sky', ['london', 'england']],
  ['woman-dancing', 'Flamenco', 'rose', ['spain', 'seville']],
  // Deals, time and seasons
  ['sun', 'Sun', 'sunset', ['summer', 'sun holidays']],
  ['sun-behind-small-cloud', 'Sun and cloud', 'sky', ['spring', 'autumn']],
  ['snowflake', 'Snowflake', 'sky', ['winter', 'ski']],
  ['fire', 'Hot deal', 'sunset', ['deal', 'popular']],
  ['alarm-clock', 'Alarm clock', 'rose', ['last minute']],
  ['hourglass-not-done', 'Hourglass', 'sand', ['last minute', 'early booking']],
  ['label', 'Price tag', 'sand', ['deal', 'discount']],
  ['money-bag', 'Money bag', 'mint', ['budget', 'cheap']],
  ['gem-stone', 'Gem', 'lavender', ['luxury']],
  ['sparkles', 'Sparkles', 'lavender', ['special']],
  ['spiral-calendar', 'Calendar', 'sky', ['period', 'season', 'holidays']],
  ['christmas-tree', 'Christmas tree', 'mint', ['christmas', 'winter']],
  ['world-map', 'World map', 'sky', ['world', 'destinations']],
  ['globe-showing-europe-africa', 'Globe', 'sky', ['world', 'europe']],
  ['compass', 'Compass', 'sky', ['explore', 'adventure']],
  ['luggage', 'Luggage', 'sand', ['travel', 'suitcase']],
];

// Card-header glyphs, one colour each, tinted by the card's tone.
// [name saved in the CMS, Iconify icon, label shown in the picker]
const GLYPHS = [
  ['island', 'mdi:island', 'Island'],
  ['palm-tree', 'mdi:palm-tree', 'Palm tree'],
  ['beach', 'mdi:beach', 'Beach'],
  ['sun', 'mdi:white-balance-sunny', 'Sun'],
  ['sale', 'material-symbols:percent-discount', 'Discount badge'],
  ['city', 'ph:city-fill', 'City'],
  ['car', 'mdi:car', 'Car'],
  ['calendar', 'mdi:calendar-month', 'Calendar'],
  ['airplane', 'mdi:airplane', 'Airplane'],
  ['mountains', 'mdi:image-filter-hdr', 'Mountains'],
  ['snowflake', 'mdi:snowflake', 'Snowflake'],
  ['cruise', 'mdi:ferry', 'Cruise'],
  ['sailing', 'mdi:sail-boat', 'Sailing'],
  ['ski', 'mdi:ski', 'Ski'],
  ['heart', 'mdi:heart', 'Heart'],
  ['star', 'mdi:star', 'Star'],
  ['fire', 'mdi:fire', 'Hot'],
  ['tag', 'mdi:tag', 'Price tag'],
  ['clock-fast', 'mdi:clock-fast', 'Fast clock'],
  ['earth', 'mdi:earth', 'World'],
  ['map-marker', 'mdi:map-marker', 'Pin'],
  ['compass', 'mdi:compass', 'Compass'],
  ['bed', 'mdi:bed', 'Hotel'],
  ['suitcase', 'mdi:bag-suitcase', 'Suitcase'],
  ['food', 'mdi:silverware-fork-knife', 'Food'],
  ['family', 'mdi:human-male-female-child', 'Family'],
];

/*
 * Which emoji a link gets when the dashboard has not picked one: the first rule whose word
 * appears in the link's label or place name. Dutch names sit beside the English ones
 * because the dashboard is used in both.
 */
const DESTINATION_RULES = [
  [['maldives', 'malediven'], 'hut'],
  [['bali', 'seychelles', 'mauritius', 'zanzibar'], 'desert-island'],
  [['thailand', 'phuket', 'bangkok', 'india'], 'hindu-temple'],
  [['sri lanka'], 'palm-tree'],
  [['mexico', 'mexiko', 'cancun'], 'cactus'],
  [['dominican', 'dominicaanse', 'punta cana', 'curacao', 'curaçao', 'aruba', 'jamaica', 'cuba'], 'palm-tree'],
  [['barcelona', 'santorini'], 'church'],
  [['turkey', 'turkije', 'istanbul', 'antalya', 'alanya', 'side', 'bodrum', 'dalaman'], 'mosque'],
  [['egypt', 'egypte', 'hurghada', 'sharm', 'marsa alam', 'morocco', 'marokko', 'tunisia', 'tunesië'], 'camel'],
  [['greece', 'griekenland', 'crete', 'kreta', 'rhodes', 'rhodos', 'corfu', 'kos', 'athens', 'athene'], 'classical-building'],
  [['rome', 'italy', 'italië'], 'stadium'],
  [['canary', 'canarische', 'tenerife', 'gran canaria', 'lanzarote', 'fuerteventura', 'cape verde', 'kaapverdië'], 'palm-tree'],
  [['spain', 'spanje', 'mallorca', 'ibiza', 'costa', 'benidorm', 'malaga', 'málaga'], 'umbrella-on-ground'],
  [['paris', 'parijs', 'france', 'frankrijk'], 'tokyo-tower'],
  [['london', 'londen', 'england', 'engeland'], 'guard'],
  [['prague', 'praag', 'vienna', 'wenen', 'budapest'], 'castle'],
  [['amsterdam'], 'houses'],
  [['netherlands', 'nederland', 'holland'], 'tulip'],
  [['berlin', 'germany', 'duitsland'], 'pretzel'],
  [['new york', 'usa', 'amerika'], 'statue-of-liberty'],
  [['dubai', 'abu dhabi', 'doha'], 'cityscape'],
  [['japan', 'tokyo'], 'japanese-castle'],
  [['croatia', 'kroatië', 'montenegro'], 'sailboat'],
  [['portugal', 'algarve', 'lisbon', 'lissabon', 'madeira'], 'sun'],
  [['cyprus', 'malta', 'bulgaria', 'bulgarije'], 'sun'],
  [['ski', 'wintersport', 'alps', 'alpen'], 'snow-capped-mountain'],
  [['christmas', 'kerst', 'kerstmis'], 'christmas-tree'],
  [['winter'], 'snowflake'],
  [['summer', 'zomer', 'zomervakantie'], 'sun'],
  [['autumn', 'herfst', 'herfstvakantie'], 'sun-behind-small-cloud'],
  [['spring', 'lente', 'may', 'mei', 'meivakantie'], 'cherry-blossom'],
  [['all inclusive'], 'tropical-drink'],
  [['last minute', 'last minutes', 'lastminute', 'lastminutes'], 'alarm-clock'],
  [['by car', 'met de auto', 'autovakantie'], 'automobile'],
  [['city', 'cities', 'stad', 'steden', 'stedentrip'], 'cityscape'],
];

// A card's header glyph and tone when the dashboard has not set them, from its title.
const GROUP_RULES = [
  [['verre', 'distant', 'far away', 'exotic', 'exotisch'], 'island', 'blue'],
  [['all inclusive'], 'sun', 'orange'],
  [['last minute', 'last minutes', 'lastminute', 'lastminutes'], 'sale', 'pink'],
  [['cities', 'city', 'steden', 'stad'], 'city', 'green'],
  [['car', 'auto'], 'car', 'purple'],
  [['period', 'periode', 'season', 'seizoen'], 'calendar', 'yellow'],
  [['ski', 'winter'], 'snowflake', 'teal'],
  [['cruise'], 'cruise', 'teal'],
];

const fetchSet = async (prefix, names) => {
  const url = `https://api.iconify.design/${prefix}.json?icons=${names.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${prefix}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.not_found?.length) throw new Error(`${prefix}: not found: ${data.not_found.join(', ')}`);
  const out = {};
  for (const name of names) {
    const icon = data.icons[name];
    out[name] = { body: icon.body, width: icon.width ?? data.width ?? 16, height: icon.height ?? data.height ?? 16 };
  }
  return out;
};

// Glyphs come from more than one collection, so fetch each once and key them by our name.
const fetchGlyphs = async (list) => {
  const byPrefix = new Map();
  for (const [, id] of list) {
    const [prefix, icon] = id.split(':');
    byPrefix.set(prefix, [...(byPrefix.get(prefix) || []), icon]);
  }
  const sets = {};
  for (const [prefix, icons] of byPrefix) sets[prefix] = await fetchSet(prefix, icons);
  return Object.fromEntries(list.map(([name, id]) => {
    const [prefix, icon] = id.split(':');
    return [name, sets[prefix][icon]];
  }));
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
};

const emoji = await fetchSet('fluent-emoji', EMOJI.map(([name]) => name));
const glyphs = await fetchGlyphs(GLYPHS);

const catalog = {
  emoji: EMOJI.map(([name, label, tile, keywords]) => ({ name, label, tile, keywords })),
  glyphs: GLYPHS.map(([name, , label]) => ({ name, label })),
  destinationRules: DESTINATION_RULES,
  groupRules: GROUP_RULES,
};

fs.rmSync(path.join(OUT, 'emoji'), { recursive: true, force: true });
for (const [name, data] of Object.entries(emoji)) writeJson(path.join(OUT, 'emoji', `${name}.json`), data);
writeJson(path.join(OUT, 'glyphs.json'), glyphs);
writeJson(path.join(OUT, 'catalog.json'), catalog);
console.log(`website: ${Object.keys(emoji).length} emoji, ${Object.keys(glyphs).length} glyphs -> ${OUT}`);

const adminAt = process.argv.indexOf('--admin');
if (adminAt > -1 && process.argv[adminAt + 1]) {
  const dir = path.resolve(process.argv[adminAt + 1]);
  // The picker shows every icon at once, so the dashboard gets them in one file.
  writeJson(path.join(dir, 'icons.json'), { emoji, glyphs });
  writeJson(path.join(dir, 'catalog.json'), catalog);
  console.log(`dashboard: icons.json + catalog.json -> ${dir}`);
}
