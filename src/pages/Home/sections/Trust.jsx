import styles from './Trust.module.css';

const FALLBACK_ITEMS = [
  { title:'Best Price Guarantee', desc:"Found it cheaper? We'll match and beat it.",
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg> },
  { title:'No Booking Fees', desc:'What you see is what you pay. Zero hidden charges.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg> },
  { title:'Secure Payment', desc:'256-bit SSL encryption on every transaction.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg> },
  { title:'Trusted Partners', desc:'Only verified hotels and airlines.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
];

export default function Trust({ cms }) {
  const sh = cms?.sectionHeaders?.trust;
  const tag      = sh?.tag      || '✓ Trust';
  const title    = sh?.title    || 'Why book with Sunsky?';
  const subtitle = sh?.subtitle || 'Thousands of travelers trust us for stress-free holidays.';

  const items = (cms?.trustItems?.length > 0)
    ? cms.trustItems.map((t) => ({ title: t.title, desc: t.description || t.desc }))
    : FALLBACK_ITEMS;

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <div className={styles.tag}>{tag}</div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.sub}>{subtitle}</p>
        </div>
      </div>
      <div className={styles.banner}>
        <div className={styles.deco} />
        {items.map((item, i) => (
          <div key={i} className={styles.item}>
            {item.icon && <div className={styles.icon}>{item.icon}</div>}
            <div className={styles.itemTitle}>{item.title}</div>
            <div className={styles.itemDesc}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
