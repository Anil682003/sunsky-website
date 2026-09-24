import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './PopularDest.module.css';
import SectionHead from './SectionHead';
import { groupLinkUrl, groupLinkLabel } from '../../../utils/cmsDestinations';
import { TONES, emojiTile, inferGroupStyle, inferLinkIcon, isEmoji, isGlyph } from '../../../utils/travelIcons';
import { TravelEmoji, TravelGlyph } from '../../../components/TravelIcon/TravelIcon';

// Shown only while the dashboard has no groups of its own. Their icons and tones come from
// the same automatic rules as a dashboard card left without them.
const FALLBACK_CARDS = [
  { key: 'distant', title: 'Distant Destinations', count: '480+ holidays',
    links: ['Bali', 'Thailand', 'Maldives', 'Sri Lanka', 'Mexico', 'Dominican Republic'] },
  { key: 'allInclusive', title: 'All Inclusive', count: '1,200+ holidays',
    links: ['Turkey All Inclusive', 'Egypt All Inclusive', 'Greece All Inclusive', 'Spain All Inclusive', 'Cape Verde'] },
  { key: 'lastMinute', title: 'Last Minutes', count: '320+ deals',
    links: ['Last Minute Spain', 'Last Minute Turkey', 'Last Minute Greece', 'Last Minute Egypt', 'Last Minute Canary Islands'] },
  { key: 'cities', title: 'Cities', count: '890+ trips',
    links: ['Paris', 'Rome', 'Barcelona', 'London', 'Prague', 'Amsterdam'] },
];

const ChevronIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

// The FALLBACK_CARDS `links` above are plain strings, this component's own copy rather
// than dashboard content, so they are translated here. A dashboard link is shown as typed.
const LINK_LABEL_KEYS = {
  'Bali': 'bali', 'Thailand': 'thailand', 'Maldives': 'maldives', 'Sri Lanka': 'sriLanka',
  'Mexico': 'mexico', 'Dominican Republic': 'dominicanRepublic',
  'Turkey All Inclusive': 'turkeyAllInclusive', 'Egypt All Inclusive': 'egyptAllInclusive',
  'Greece All Inclusive': 'greeceAllInclusive', 'Spain All Inclusive': 'spainAllInclusive',
  'Cape Verde': 'capeVerde',
  'Last Minute Spain': 'lastMinuteSpain', 'Last Minute Turkey': 'lastMinuteTurkey',
  'Last Minute Greece': 'lastMinuteGreece', 'Last Minute Egypt': 'lastMinuteEgypt',
  'Last Minute Canary Islands': 'lastMinuteCanaryIslands',
  'Paris': 'paris', 'Rome': 'rome', 'Barcelona': 'barcelona', 'London': 'london',
  'Prague': 'prague', 'Amsterdam': 'amsterdam',
};
const linkLabel = (t, raw) => {
  const k = LINK_LABEL_KEYS[raw];
  return k ? t(`popular.links.${k}`, raw) : raw;
};

/**
 * The search behind a card's "View all" when the dashboard has not set one: every place in
 * the card at once, plus the board type or holiday type if all of its links share it, so
 * "View all all-inclusive" keeps the All Inclusive board and "View all cities" searches
 * every city listed. Null when no link filters by anything.
 */
const combinedSearchUrl = (links, title) => {
  const objects = links.filter((l) => l && typeof l === 'object');
  const countries = new Set();
  const destinations = new Set();
  objects.forEach(({ dest }) => {
    if (!dest?.code) return;
    const code = String(dest.code).trim().toUpperCase();
    if (dest.type === 'country') countries.add(code);
    else if (dest.type === 'city') destinations.add(code);
  });
  const shared = (key) => {
    const values = objects.map((l) => l[key]).filter((v) => v != null && v !== '').map(String);
    return values.length && values.length === objects.length && new Set(values).size === 1 ? values[0] : null;
  };
  const board = shared('boardCode');
  const theme = shared('holidayTypeId');

  const qs = new URLSearchParams();
  if (countries.size) qs.set('countries', [...countries].join(','));
  if (destinations.size) qs.set('destinations', [...destinations].join(','));
  if (board) qs.set('boards', board.toUpperCase());
  if (theme) qs.set('themes', theme);
  if ([...qs.keys()].length === 0) return null;
  if (title) qs.set('destinationLabel', title);
  return `/results?${qs.toString()}`;
};

/**
 * One card, with everything the dashboard can set and a sensible stand-in for whatever it
 * left blank: header glyph and tone from the title, an emoji per link from its place.
 */
const resolveCard = (group, index, t) => {
  const auto = inferGroupStyle(group.title) || {};
  const links = (Array.isArray(group.links) ? group.links : []).map((l) => {
    const isObject = l && typeof l === 'object';
    const raw = isObject ? l.label : l;
    const icon = isObject && isEmoji(l.icon)
      ? l.icon
      : inferLinkIcon(raw, l?.dest?.name, l?.dest?.countryName) || inferLinkIcon(group.title) || 'world-map';
    return {
      label: isObject ? groupLinkLabel(l) : linkLabel(t, l),
      href: groupLinkUrl(l),
      icon,
    };
  });

  const title = group.title || '';
  const custom = group.viewAll && typeof group.viewAll === 'object' ? group.viewAll : null;
  const viewAllHref = (custom && groupLinkUrl({ ...custom, label: title })) || combinedSearchUrl(group.links || [], title);
  const viewAllLabel = custom?.label?.trim()
    || t('popular.viewAll', { title: title.toLowerCase(), defaultValue: 'View all {{title}}' });

  return {
    title,
    count: group.count,
    glyph: isGlyph(group.icon) ? group.icon : auto.glyph || 'map-marker',
    tone: TONES.includes(group.tone) ? group.tone : auto.tone || TONES[index % TONES.length],
    links,
    viewAll: viewAllHref ? { href: viewAllHref, label: viewAllLabel } : null,
  };
};

export default function PopularDest({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.popularDest;
  const tag      = sh?.tag      || t('popular.tag', 'Browse');
  const title    = sh?.title    || t('popular.title', 'Most popular destinations');
  const subtitle = sh?.subtitle || t('popular.subtitle', 'Browse our most searched and booked travel categories.');

  const groups = cms?.popularDestinationGroups?.length > 0
    ? cms.popularDestinationGroups
    : FALLBACK_CARDS.map((c) => ({
        ...c,
        title: t(`popular.groups.${c.key}.title`, c.title),
        count: t(`popular.groups.${c.key}.count`, c.count),
      }));
  const cards = groups.map((g, i) => resolveCard(g, i, t));

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} rule swash />

        <div className={styles.grid}>
          {cards.map((c, i) => (
            <article key={i} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={`${styles.tile} ${styles[`tone_${c.tone}`]}`}>
                  <TravelGlyph name={c.glyph} className={styles.tileGlyph} />
                </span>
                <div className={styles.cardHeadText}>
                  <h3 className={styles.cardTitle}>{c.title}</h3>
                  {c.count && <p className={styles.cardCount}>{c.count}</p>}
                </div>
              </div>

              <ul className={styles.links}>
                {c.links.map((l, li) => {
                  const row = (
                    <>
                      <span className={`${styles.linkTile} ${styles[`tile_${emojiTile(l.icon)}`]}`}>
                        <TravelEmoji name={l.icon} className={styles.linkEmoji} />
                      </span>
                      <span className={styles.linkBody}>
                        <span className={styles.linkLabel}>{l.label}</span>
                        <span className={styles.chevron}><ChevronIcon /></span>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${l.label}-${li}`}>
                      {l.href ? (
                        <Link to={l.href} className={styles.link} title={t('popular.search', { label: l.label, defaultValue: 'Search {{label}}' })}>
                          {row}
                        </Link>
                      ) : (
                        // Not linked in the dashboard yet: same row, nothing to click.
                        <span className={`${styles.link} ${styles.linkStatic}`}>{row}</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {c.viewAll && (
                <Link to={c.viewAll.href} className={styles.viewAll}>
                  {c.viewAll.label}
                  <ArrowIcon />
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
