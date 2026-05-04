import styles from './Categories.module.css';

const CATS = [
  { title:'Sun Vacations', count:'2,430+ holidays', img:'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600&q=80',
    icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> },
  { title:'City Trips', count:'890+ destinations', img:'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&q=80',
    icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h6"/></svg> },
  { title:'Car Holidays', count:'1,250+ routes', img:'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80',
    icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg> },
  { title:'Last Minute', count:'320+ deals', img:'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80',
    icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
];

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M7 17L17 7M17 7H7M17 7v10"/>
  </svg>
);

export default function Categories() {
  return (
    <div className={styles.sectionAlt}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>✦ Explore</div>
            <h2 className={styles.title}>Something for <span className={styles.accent}>everyone</span></h2>
            <p className={styles.sub}>Find the perfect holiday that suits your travel style and budget.</p>
          </div>
        </div>
        <div className={styles.grid}>
          {CATS.map((c, i) => (
            <div key={i} className={styles.card}>
              <img src={c.img} alt={c.title} loading="lazy" />
              <div className={styles.overlay}>
                <div className={styles.icon}>{c.icon}</div>
                <div className={styles.cardTitle}>{c.title}</div>
                <div className={styles.cardCount}>{c.count}</div>
              </div>
              <div className={styles.arrow}><ArrowIcon /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
