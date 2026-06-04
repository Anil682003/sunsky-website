import styles from './VacationTypes.module.css';

const FALLBACK_TYPES = [
  { label:'Worry-Free',    title:'All Inclusive',    desc:'Everything taken care of. Just relax and enjoy.',     img:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80' },
  { label:'Premium Escape',title:'Adults Only',      desc:'Tranquil retreats for couples and friends.',           img:'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=80' },
  { label:'Family Fun',    title:'Family Friendly',  desc:"Fun for the whole family with kids' activities.",      img:'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80' },
];

export default function VacationTypes({ cms }) {
  const sh = cms?.sectionHeaders?.vacationTypes;
  const tag      = sh?.tag      || '♡ Curated';
  const title    = sh?.title    || 'Your favorite type of vacation';
  const subtitle = sh?.subtitle || 'Curated experiences designed around how you love to travel.';

  const types = (cms?.vacationTypes?.length > 0)
    ? cms.vacationTypes.map((v) => ({
        label: v.label,
        title: v.title,
        desc:  v.description || v.desc || '',
        img:   v.imageUrl,
        buttonText: v.buttonText || 'Explore',
      }))
    : FALLBACK_TYPES;

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
          {types.map((t, i) => (
            <div key={i} className={`${styles.card} ${i === 1 ? styles.offset : ''}`}>
              <img src={t.img} alt={t.title} loading="lazy" />
              <div className={styles.overlay}>
                <div className={styles.vacLabel}>{t.label}</div>
                <div className={styles.vacTitle}>{t.title}</div>
                <div className={styles.vacDesc}>{t.desc}</div>
                <button className={styles.vacBtn}>{t.buttonText || 'Explore'} →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
