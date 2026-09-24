import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Destinations.module.css';
import SectionHead from './SectionHead';
import { normalizeDests, destUrl } from '../../../utils/cmsDestinations';
import { useTranslation } from 'react-i18next';

/* Shown only until the dashboard's own destination tabs arrive. Place names are
   NOT translated — Mallorca is Mallorca — but the country tab labels and the
   badges are words rather than places, so those carry keys. */
const FALLBACK_TABS = {
  spain:  { key:'spain',  label:'Spain', dest:[{name:'Costa del Sol',n:342,badgeKey:'popular',badge:'Popular',img:'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800&q=80'},{name:'Mallorca',n:289,img:'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800&q=80'},{name:'Barcelona',n:198,badgeKey:'trending',badge:'Trending',img:'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80'}] },
  turkey: { key:'turkey', label:'Turkey', dest:[{name:'Antalya',n:456,badgeKey:'bestValue',badge:'Best Value',img:'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80'},{name:'Bodrum',n:234,img:'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&q=80'},{name:'Istanbul',n:178,img:'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=800&q=80'}] },
  egypt:  { key:'egypt',  label:'Egypt', dest:[{name:'Hurghada',n:312,badgeKey:'topRated',badge:'Top Rated',img:'https://images.unsplash.com/photo-1539768942893-daf53e736b68?w=800&q=80'},{name:'Sharm El Sheikh',n:267,img:'https://images.unsplash.com/photo-1568322445389-f64e1bbea1b4?w=800&q=80'},{name:'Marsa Alam',n:145,img:'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=80'}] },
  greece: { key:'greece', label:'Greece', dest:[{name:'Santorini',n:198,badgeKey:'iconic',badge:'Iconic',img:'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80'},{name:'Crete',n:345,img:'https://images.unsplash.com/photo-1580502304784-8985b7eb7260?w=800&q=80'},{name:'Rhodes',n:213,img:'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&q=80'}] },
  canary: { key:'canary', label:'Canary Islands', dest:[{name:'Tenerife',n:423,badgeKey:'yearRoundSun',badge:'Year-Round Sun',img:'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&q=80'},{name:'Gran Canaria',n:312,img:'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80'},{name:'Lanzarote',n:187,img:'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80'}] },
  italy:  { key:'italy',  label:'Italy', dest:[{name:'Amalfi Coast',n:156,badgeKey:'luxury',badge:'Luxury',img:'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80'},{name:'Sicily',n:234,img:'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=800&q=80'},{name:'Sardinia',n:189,img:'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80'}] },
};

/* The fallback tabs in the reader's language. Only ever called when the CMS has
   no tabs of its own, in which case its words would win anyway. */
const localiseTabs = (t) =>
  Object.fromEntries(
    Object.entries(FALLBACK_TABS).map(([key, tab]) => [
      key,
      {
        label: t(`destinations.tabs.${tab.key}`, tab.label),
        dest: tab.dest.map((d) => ({
          ...d,
          count: t('destinations.holidayCount', { count: d.n, defaultValue: '{{count}} holidays' }),
          badge: d.badgeKey ? t(`destinations.badges.${d.badgeKey}`, d.badge) : undefined,
        })),
      },
    ])
  );

function buildTabsFromCms(destinationTabs) {
  if (!destinationTabs?.length) return null;
  const result = {};
  destinationTabs.forEach((tab, i) => {
    const key = `tab_${i}`;
    result[key] = {
      label: tab.tab || `Tab ${i + 1}`,
      dest: (tab.cards || []).map((c) => {
        // A card is clickable only once the dashboard links it to a real
        // country/city; otherwise it stays decorative, exactly as before.
        const [linked] = normalizeDests(c.dest ? [c.dest] : []);
        return {
          name: c.name,
          count: c.holidays,
          badge: c.badge,
          img: c.imageUrl,
          href: linked ? destUrl(linked) : null,
        };
      }),
    };
  });
  return result;
}

const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function Destinations({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.destinations;
  const tag      = sh?.tag      || t('destinations.tag', 'Destinations');
  const title    = sh?.title    || t('destinations.title', 'Our best sun destinations');
  const subtitle = sh?.subtitle || t('destinations.subtitle', 'Handpicked destinations with guaranteed sunshine and incredible value.');

  const cmsTabs = buildTabsFromCms(cms?.destinationTabs);
  const TABS = cmsTabs || localiseTabs(t);

  const [active, setActive] = useState(Object.keys(TABS)[0]);
  const safeActive = TABS[active] ? active : Object.keys(TABS)[0];
  const panel = TABS[safeActive];

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} />

        <div className={styles.tabs}>
          {Object.entries(TABS).map(([key, tab]) => (
            <button
              key={key}
              type="button"
              aria-pressed={safeActive === key}
              className={`${styles.tab} ${safeActive === key ? styles.tabActive : ''}`}
              onClick={() => setActive(key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div key={safeActive} className={styles.panel}>
          {panel.dest.map((d, i) => {
            // Linked cards become real anchors so they can be opened in a new tab;
            // unlinked ones stay plain divs and keep the current behaviour.
            const Card = d.href ? Link : 'div';
            const cardProps = d.href ? {
              to: d.href,
              title: t('destinations.searchStaysIn', {
                place: d.name,
                defaultValue: 'Search stays in {{place}}',
              }),
            } : {};
            // The tall lead card only earns its two rows when there is a second row for it to
            // sit beside; with three cards it would just hang one grid gap below the others.
            const feat = i === 0 && panel.dest.length > 3;
            return (
            <Card
              key={i}
              {...cardProps}
              className={`${styles.card} ${feat ? styles.cardFeat : ''} ${d.href ? styles.cardLink : ''}`}
            >
              <img src={d.img} alt={d.name} loading="lazy" />
              <div className={styles.overlay}>
                <div className={styles.overlayText}>
                  <div className={styles.destName}>{d.name}</div>
                  {d.count && <div className={styles.destCount}>{d.count}</div>}
                </div>
                {d.href && <span className={styles.go}><ArrowIcon /></span>}
              </div>
              {d.badge && <div className={styles.badge}>{d.badge}</div>}
            </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
