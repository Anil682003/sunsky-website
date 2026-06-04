import styles from './PopularDest.module.css';

const FALLBACK_CARDS = [
  { title:'Distant Destinations', count:'480+ holidays', colorClass:'blue',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>,
    links:['Bali','Thailand','Maldives','Sri Lanka','Mexico','Dominican Republic'] },
  { title:'All Inclusive', count:'1,200+ holidays', colorClass:'gold',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    links:['Turkey All Inclusive','Egypt All Inclusive','Greece All Inclusive','Spain All Inclusive','Cape Verde'] },
  { title:'Last Minutes', count:'320+ deals', colorClass:'coral',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    links:['Last Minute Spain','Last Minute Turkey','Last Minute Greece','Last Minute Egypt','Last Minute Canary Islands'] },
  { title:'Cities', count:'890+ trips', colorClass:'teal',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h6"/></svg>,
    links:['Paris','Rome','Barcelona','London','Prague','Amsterdam'] },
  { title:'Car Destinations', count:'1,250+ routes', colorClass:'purple',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>,
    links:['France by Car','Italy by Car','Spain by Car','Portugal by Car','Germany by Car'] },
  { title:'Popular Periods', count:'Seasonal picks', colorClass:'green',
    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    links:['May Holidays','Summer Holidays','Autumn Break','Christmas Travel','Winter Sun'] },
];

const COLOR_CLASSES = ['blue','gold','coral','teal','purple','green'];

export default function PopularDest({ cms }) {
  const sh = cms?.sectionHeaders?.popularDest;
  const tag      = sh?.tag      || '🗺 Browse';
  const title    = sh?.title    || 'Most popular destinations';
  const subtitle = sh?.subtitle || 'Browse our most searched and booked travel categories.';

  const cards = (cms?.popularDestinationGroups?.length > 0)
    ? cms.popularDestinationGroups.map((g, i) => ({
        title:      g.title,
        count:      g.count,
        colorClass: COLOR_CLASSES[i % COLOR_CLASSES.length],
        links:      Array.isArray(g.links) ? g.links : [],
      }))
    : FALLBACK_CARDS;

  return (
    <div className={styles.sectionAlt}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>{tag}</div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.sub}>{subtitle}</p>
          </div>
        </div>
        <div className={styles.grid}>
          {cards.map((c, i) => (
            <div key={i} className={`${styles.card} ${styles[`card${i+1}`]}`}>
              <div className={styles.cardHead}>
                {c.icon && <div className={`${styles.icon} ${styles[c.colorClass]}`}>{c.icon}</div>}
                <div>
                  <div className={styles.cardTitle}>{c.title}</div>
                  <div className={styles.cardCount}>{c.count}</div>
                </div>
              </div>
              <div className={styles.links}>
                {c.links.map((l) => <a key={l} href="#">{l}</a>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
