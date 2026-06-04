import { useState } from 'react';
import styles from './Destinations.module.css';

const FALLBACK_TABS = {
  spain:  { label:'Spain',          dest:[{name:'Costa del Sol',count:'342 holidays',badge:'Popular',img:'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800&q=80'},{name:'Mallorca',count:'289 holidays',img:'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800&q=80'},{name:'Barcelona',count:'198 holidays',badge:'Trending',img:'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80'}] },
  turkey: { label:'Turkey',         dest:[{name:'Antalya',count:'456 holidays',badge:'Best Value',img:'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80'},{name:'Bodrum',count:'234 holidays',img:'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&q=80'},{name:'Istanbul',count:'178 holidays',img:'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=800&q=80'}] },
  egypt:  { label:'Egypt',          dest:[{name:'Hurghada',count:'312 holidays',badge:'Top Rated',img:'https://images.unsplash.com/photo-1539768942893-daf53e736b68?w=800&q=80'},{name:'Sharm El Sheikh',count:'267 holidays',img:'https://images.unsplash.com/photo-1568322445389-f64e1bbea1b4?w=800&q=80'},{name:'Marsa Alam',count:'145 holidays',img:'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=80'}] },
  greece: { label:'Greece',         dest:[{name:'Santorini',count:'198 holidays',badge:'Iconic',img:'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80'},{name:'Crete',count:'345 holidays',img:'https://images.unsplash.com/photo-1580502304784-8985b7eb7260?w=800&q=80'},{name:'Rhodes',count:'213 holidays',img:'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&q=80'}] },
  canary: { label:'Canary Islands',  dest:[{name:'Tenerife',count:'423 holidays',badge:'Year-Round Sun',img:'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&q=80'},{name:'Gran Canaria',count:'312 holidays',img:'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80'},{name:'Lanzarote',count:'187 holidays',img:'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80'}] },
  italy:  { label:'Italy',          dest:[{name:'Amalfi Coast',count:'156 holidays',badge:'Luxury',img:'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80'},{name:'Sicily',count:'234 holidays',img:'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=800&q=80'},{name:'Sardinia',count:'189 holidays',img:'https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80'}] },
};

function buildTabsFromCms(destinationTabs) {
  if (!destinationTabs?.length) return null;
  const result = {};
  destinationTabs.forEach((tab, i) => {
    const key = `tab_${i}`;
    result[key] = {
      label: tab.tab || `Tab ${i + 1}`,
      dest: (tab.cards || []).map((c) => ({
        name: c.name,
        count: c.holidays,
        badge: c.badge,
        img: c.imageUrl,
      })),
    };
  });
  return result;
}

export default function Destinations({ cms }) {
  const sh = cms?.sectionHeaders?.destinations;
  const tag      = sh?.tag      || '☀ Destinations';
  const title    = sh?.title    || 'Our best sun destinations';
  const subtitle = sh?.subtitle || 'Handpicked destinations with guaranteed sunshine and incredible value.';

  const cmsTabs = buildTabsFromCms(cms?.destinationTabs);
  const TABS = cmsTabs || FALLBACK_TABS;

  const [active, setActive] = useState(Object.keys(TABS)[0]);
  const safeActive = TABS[active] ? active : Object.keys(TABS)[0];
  const panel = TABS[safeActive];

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <div className={styles.tag}>{tag}</div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.sub}>{subtitle}</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {Object.entries(TABS).map(([key, t]) => (
          <button key={key} className={`${styles.tab} ${safeActive === key ? styles.tabActive : ''}`} onClick={() => setActive(key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        {panel.dest.map((d, i) => (
          <div key={i} className={`${styles.card} ${i === 0 ? styles.cardFeat : ''}`}>
            <img src={d.img} alt={d.name} loading="lazy" />
            <div className={styles.overlay}>
              <div className={styles.destName}>{d.name}</div>
              <div className={styles.destCount}>{d.count}</div>
            </div>
            {d.badge && <div className={styles.badge}>{d.badge}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
