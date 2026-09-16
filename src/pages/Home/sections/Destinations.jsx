import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Destinations.module.css';
import { normalizeDests, destUrl } from '../../../utils/cmsDestinations';
import { cmsText } from '../../../utils/cmsText';
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

/* Decorative IATA-style route code derived from a destination name */
function routeCode(name) {
  const letters = String(name || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'SUN';
}

export default function Destinations({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.destinations;
  const tag      = sh?.tag      || t('destinations.tag', '☀ Destinations');
  const title    = sh?.title    || t('destinations.title', 'Our best sun destinations');
  const subtitle = sh?.subtitle || t('destinations.subtitle', 'Handpicked destinations with guaranteed sunshine and incredible value.');

  const cmsTabs = buildTabsFromCms(cms?.destinationTabs);
  const TABS = cmsTabs || localiseTabs(t);

  const [active, setActive] = useState(Object.keys(TABS)[0]);
  const safeActive = TABS[active] ? active : Object.keys(TABS)[0];
  const panel = TABS[safeActive];

  // Split the CMS title so the last word gets the cursive golden accent
  const titleWords = String(title).trim().split(/\s+/);
  const titleAccent = titleWords.pop();
  const titleLead = titleWords.join(' ');

  return (
    <section className={styles.section}>
      {/* ── Layered sky scene behind everything ── */}
      <div className={styles.bgArt} aria-hidden="true">
        <span className={styles.glowBlue} />
        <span className={styles.glowGold} />
        <span className={styles.dots} />
        <span className={styles.blob} />
        <span className={styles.cloudA} />
        <span className={styles.cloudB} />
        <span className={styles.ghostWord}>escape</span>
        <span className={styles.grain} />
      </div>

      {/* Dashed flight route — departure ring, waypoint stops, tiny plane */}
      <svg className={styles.route} viewBox="0 0 560 190" fill="none" aria-hidden="true" focusable="false">
        <circle cx="14" cy="158" r="3.6" fill="var(--sun-orange)" opacity="0.55" />
        <circle cx="14" cy="158" r="8.5" stroke="var(--sun-orange)" strokeWidth="1.4" opacity="0.3" />
        <path
          d="M26 152 C 150 40, 330 16, 508 64"
          stroke="var(--blue-deep)"
          strokeWidth="1.6"
          strokeDasharray="2 9"
          strokeLinecap="round"
          opacity="0.32"
        />
        <circle cx="163" cy="73" r="2.8" fill="var(--blue-deep)" opacity="0.4" />
        <circle cx="163" cy="73" r="6.5" stroke="var(--blue-deep)" strokeWidth="1.2" opacity="0.18" />
        <circle cx="330" cy="40" r="2.8" fill="var(--blue-deep)" opacity="0.4" />
        <circle cx="330" cy="40" r="6.5" stroke="var(--blue-deep)" strokeWidth="1.2" opacity="0.18" />
        <g transform="translate(506 52) rotate(18)" opacity="0.55">
          <path
            d="M18 1.2 L10.4 8.8 L2.2 6.4 L0.3 8.3 L7 12.2 L3.6 15.8 L-1 15.3 L-2.4 16.7 L2.5 18.9 L4.7 23.8 L6.1 22.4 L5.6 17.8 L9.2 14.4 L13.1 21.1 L15 19.2 L12.6 11 L20.2 3.4 C 21.3 2.3 21.3 0.9 20.5 0.3 C 19.7 -0.3 18.9 0.3 18 1.2 Z"
            fill="var(--blue-deep)"
          />
        </g>
      </svg>

      <div className={styles.inner}>
        {/* Editorial two-column header — title left, deck right */}
        <div className={styles.header}>
          <div className={styles.headMain}>
            <div className={styles.headRow}>
              <span className={styles.headIndex}>02</span>
              <span className={styles.headEyebrow}>{tag}</span>
              <span className={styles.headRule} aria-hidden="true" />
              <span className={styles.headMeta} aria-hidden="true">GATE 02 · SUN ROUTES ✈</span>
            </div>
            <h2 className={styles.title}>
              {titleLead && <>{titleLead}{' '}</>}
              <span className={styles.titleAccent}>{titleAccent}</span>
            </h2>
          </div>
          <p className={styles.sub}>{cmsText(subtitle)}</p>
        </div>

        <div className={styles.tabs}>
          {Object.entries(TABS).map(([key, tab]) => (
            <button
              key={key}
              type="button"
              className={`${styles.tab} ${safeActive === key ? styles.tabActive : ''}`}
              onClick={() => setActive(key)}
            >
              <span className={styles.tabHole} aria-hidden="true" />
              {tab.label}
              {safeActive === key && (
                <svg className={styles.tabPlane} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M1 9.5 L19 1.5 L11.6 18.5 L9.4 11.4 Z" fill="currentColor" />
                </svg>
              )}
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
            return (
            <Card
              key={i}
              {...cardProps}
              className={`${styles.card} ${i === 0 ? styles.cardFeat : ''} ${d.href ? styles.cardLink : ''}`}
            >
              <div className={styles.cardMask}>
                <img src={d.img} alt={d.name} loading="lazy" />
                <div className={styles.overlay}>
                  <span className={styles.perf} aria-hidden="true" />
                  <div className={styles.overlayRow}>
                    <div className={styles.overlayText}>
                      <div className={styles.destName}>{d.name}</div>
                      <div className={styles.destCount}>{d.count}</div>
                    </div>
                    <span className={styles.barcode} aria-hidden="true" />
                  </div>
                  {i === 0 && (
                    <div className={styles.routeFoot} aria-hidden="true">
                      <span className={styles.routeCodeTxt}>BRU</span>
                      <span className={styles.routeLine}>
                        <svg viewBox="0 0 20 20" focusable="false">
                          <path d="M1 9.5 L19 1.5 L11.6 18.5 L9.4 11.4 Z" fill="currentColor" />
                        </svg>
                      </span>
                      <span className={styles.routeCodeTxt}>{routeCode(d.name)}</span>
                      <span className={styles.routeSeat}>SEAT 12A</span>
                    </div>
                  )}
                </div>
              </div>
              {d.badge && <div className={styles.badge}>{d.badge}</div>}
              {i === 0 && (
                <div className={styles.featNote} aria-hidden="true">
                  <span className={styles.featNoteTxt}>{t('destinations.topThisSeason', '№1 this season')}</span>
                  <svg className={styles.featArrow} viewBox="0 0 46 34" fill="none" focusable="false">
                    <path d="M42 3 C 34 20, 20 27, 6 26" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M13 19.5 L5.5 26.5 L14.5 29.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
