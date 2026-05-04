import { useEffect, useRef, useState } from 'react';
import styles from './Stats.module.css';

const STATS = [
  { end:10000,  suffix:'K+', label:'Holidays Worldwide',  display:'10K+' },
  { end:2000000,suffix:'M+', label:'Happy Travelers',     display:'2M+' },
  { end:150,    suffix:'+',  label:'Destinations',        display:'150+' },
  { end:48,     suffix:'',   label:'Travel Awards',       display:'48' },
];

export default function Stats() {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className={styles.dark} ref={ref}>
      <div className={styles.strip}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.item}>
            <div className={`${styles.number} ${vis ? styles.pop : ''}`}>{s.display}</div>
            <div className={styles.label}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
