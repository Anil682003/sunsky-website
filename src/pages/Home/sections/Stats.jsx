import { useEffect, useRef, useState } from 'react';
import styles from './Stats.module.css';

const FALLBACK_STATS = [
  { value:'10K+', label:'Holidays Worldwide' },
  { value:'2M+',  label:'Happy Travelers' },
  { value:'150+', label:'Destinations' },
  { value:'48',   label:'Travel Awards' },
];

/* Stroke icon stamps — plane / sun / pin / award, cycled per cell */
const CELL_ICONS = [
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>,
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
    <section className={styles.wrap} ref={ref}>
      {/* ── Layered sky scene behind the ticket ── */}
      <div className={styles.bg} aria-hidden="true">
        <span className={styles.ghost}>SSK</span>
        <svg className={styles.route} viewBox="0 0 1440 420" preserveAspectRatio="xMidYMid slice" fill="none">
          <path className={styles.routePath} d="M-60 96 C 320 8, 690 210, 1030 138 C 1250 92, 1380 210, 1500 300" strokeDasharray="7 8" />
          <circle className={styles.wp} cx="238" cy="53" r="4" />
          <circle className={`${styles.wp} ${styles.wp2}`} cx="742" cy="167" r="4" />
          <circle className={`${styles.wp} ${styles.wp3}`} cx="1216" cy="141" r="4" />
          <g className={styles.routePlane} transform="translate(1006 118) rotate(14)">
            <path d="M0 6 20 0 12 16 8 9 Z" />
          </g>
        </svg>
        <span className={styles.cloudA} />
        <span className={styles.cloudB} />
        <span className={styles.dots} />
        <span className={styles.grain} />
      </div>

      {/* ── The ticket, laid across the seam of the two pages ── */}
      <div className={styles.card}>
        <div className={styles.stamp} aria-hidden="true">
          <span>SSK</span>
          <i>✈</i>
          <em>Approved</em>
        </div>
        <span className={styles.note} aria-hidden="true">
          <svg className={styles.noteArrow} viewBox="0 0 34 26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M31 24 C 22 22, 8 18, 5 4" />
            <path d="M1 9 5 3l6 3" />
          </svg>
          still counting…
        </span>

        <div className={styles.ticket}>
          <span className={styles.guilloche} aria-hidden="true" />
          <span className={styles.microCode} aria-hidden="true">SSK · STATS</span>
          <span className={styles.barcode} aria-hidden="true" />
          <span className={styles.routeCode} aria-hidden="true">BRU ✈ AYT · GATE 07</span>
          <span className={styles.seatCode} aria-hidden="true">ROW 04 · SEAT 12A</span>
          <div className={styles.strip}>
            {stats.map((s, i) => (
              <div key={i} className={styles.item}>
                <span className={styles.icon} aria-hidden="true">{CELL_ICONS[i % CELL_ICONS.length]}</span>
                <div className={`${styles.number} ${vis ? styles.pop : ''}`}>{s.value || s.display}</div>
                <div className={styles.label}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
