import { Link } from 'react-router-dom';
import styles from './PopularDest.module.css';
import SectionHead from './SectionHead';
import { groupLinkUrl, groupLinkLabel } from '../../../utils/cmsDestinations';
import { useTranslation } from 'react-i18next';

const FALLBACK_CARDS = [
  { key:'distant', title:'Distant Destinations', count:'480+ holidays',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>,
    links:['Bali','Thailand','Maldives','Sri Lanka','Mexico','Dominican Republic'] },
  { key:'allInclusive', title:'All Inclusive', count:'1,200+ holidays',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    links:['Turkey All Inclusive','Egypt All Inclusive','Greece All Inclusive','Spain All Inclusive','Cape Verde'] },
  { key:'lastMinute', title:'Last Minutes', count:'320+ deals',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    links:['Last Minute Spain','Last Minute Turkey','Last Minute Greece','Last Minute Egypt','Last Minute Canary Islands'] },
  { key:'cities', title:'Cities', count:'890+ trips',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h6"/></svg>,
    links:['Paris','Rome','Barcelona','London','Prague','Amsterdam'] },
  { key:'car', title:'Car Destinations', count:'1,250+ routes',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>,
    links:['France by Car','Italy by Car','Spain by Car','Portugal by Car','Germany by Car'] },
  { key:'periods', title:'Popular Periods', count:'Seasonal picks',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    links:['May Holidays','Summer Holidays','Autumn Break','Christmas Travel','Winter Sun'] },
];

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// The FALLBACK_CARDS `links` above are plain strings (legacy, unlinked-to-CMS quick
// links), so — unlike a dashboard-entered CMS link — they are this component's own
// copy and get translated here rather than left as dashboard content.
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
  'France by Car': 'franceByCar', 'Italy by Car': 'italyByCar', 'Spain by Car': 'spainByCar',
  'Portugal by Car': 'portugalByCar', 'Germany by Car': 'germanyByCar',
  'May Holidays': 'mayHolidays', 'Summer Holidays': 'summerHolidays', 'Autumn Break': 'autumnBreak',
  'Christmas Travel': 'christmasTravel', 'Winter Sun': 'winterSun',
};
const linkLabel = (t, raw) => {
  const k = LINK_LABEL_KEYS[raw];
  return k ? t(`popular.links.${k}`, raw) : raw;
};

export default function PopularDest({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.popularDest;
  const tag      = sh?.tag      || t('popular.tag', 'Browse');
  const title    = sh?.title    || t('popular.title', 'Most popular destinations');
  const subtitle = sh?.subtitle || t('popular.subtitle', 'Browse our most searched and booked travel categories.');

  const cards = (cms?.popularDestinationGroups?.length > 0)
    ? cms.popularDestinationGroups.map((g) => ({
        title:      g.title,
        count:      g.count,
        links:      Array.isArray(g.links) ? g.links : [],
      }))
    : FALLBACK_CARDS.map((c) => ({
        ...c,
        title: t(`popular.groups.${c.key}.title`, c.title),
        count: t(`popular.groups.${c.key}.count`, c.count),
      }));

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} />

        <div className={styles.grid}>
          {cards.map((c, i) => (
            <article key={i} className={styles.card}>
              <div className={styles.cardHead}>
                {c.icon && <div className={styles.icon}>{c.icon}</div>}
                <div className={styles.cardHeadText}>
                  <h3 className={styles.cardTitle}>{c.title}</h3>
                  {c.count && <div className={styles.cardCount}>{c.count}</div>}
                </div>
              </div>
              <div className={styles.links}>
                {c.links.map((l, li) => {
                  const label = typeof l === 'string' ? linkLabel(t, l) : groupLinkLabel(l);
                  const href  = groupLinkUrl(l);
                  // Legacy string links (and any the dashboard has not linked
                  // yet) keep the previous inert anchor.
                  return href ? (
                    <Link key={`${label}-${li}`} to={href} title={t('popular.search', { label, defaultValue: 'Search {{label}}' })}>
                      <span>{label}</span>
                      <ChevronIcon />
                    </Link>
                  ) : (
                    <a key={`${label}-${li}`} href="#">
                      <span>{label}</span>
                      <ChevronIcon />
                    </a>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
