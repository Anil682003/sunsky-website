import { useEffect, useRef, useState } from 'react';
import styles from './Stats.module.css';

const FALLBACK_STATS = [
  { value:'10K+', label:'Holidays Worldwide' },
  { value:'2M+',  label:'Happy Travelers' },
  { value:'150+', label:'Destinations' },
  { value:'48',   label:'Travel Awards' },
];

export default function Stats({ cms }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const stats = (cms?.stats?.length > 0) ? cms.stats : FALLBACK_STATS;

  return (
    <div className={styles.dark} ref={ref}>
      <div className={styles.strip}>
        {stats.map((s, i) => (
          <div key={i} className={styles.item}>
            <div className={`${styles.number} ${vis ? styles.pop : ''}`}>{s.value || s.display}</div>
            <div className={styles.label}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
