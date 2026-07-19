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
    ? cms.trustItems.map((t, i) => ({
        title: t.title,
        desc: t.description || t.desc,
        icon: FALLBACK_ITEMS[i % FALLBACK_ITEMS.length].icon,
      }))
    : FALLBACK_ITEMS;

  const titleWords = String(title).trim().split(/\s+/);
  const titleLast  = titleWords.pop();
  const titleLead  = titleWords.join(' ');

  return (
    <section className={styles.section}>

      {/* ── layered background scene (all decorative) ── */}
      <div className={styles.scene} aria-hidden="true">
        <span className={styles.glowBlue} />
        <span className={styles.glowGold} />
        <span className={styles.ghostNum}>06</span>
        <span className={styles.ghostWord}>bon voyage!</span>
        <span className={styles.dots} />

        {/* scattered mini passport stamps */}
        <svg className={`${styles.miniStamp} ${styles.miniStampA}`} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" />
          <g transform="translate(33 32) rotate(-16)">
            <path d="M13 0 L-9 8 L-3.5 0 L-9 -8 Z" fill="currentColor" />
          </g>
        </svg>
        <svg className={`${styles.miniStamp} ${styles.miniStampB}`} viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" />
          <circle cx="28" cy="28" r="7" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M28 14v-4M28 46v-4M42 28h4M10 28h4M38 18l2.8-2.8M15.2 40.8L18 38M38 38l2.8 2.8M15.2 15.2L18 18" />
          </g>
        </svg>
        <svg className={`${styles.miniStamp} ${styles.miniStampC}`} viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="23" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3.5 4.5" />
          <text x="26" y="30.5" textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="11" fontWeight="800" letterSpacing="1" fill="currentColor">SSK</text>
        </svg>

        <span className={styles.cloudPuff} />
        <span className={styles.grain} />
      </div>

      <div className={styles.inner}>

        {/* dashed flight route + tiny plane, drifting toward the stamps */}
        <svg className={styles.route} viewBox="0 0 260 96" fill="none" aria-hidden="true">
          <circle cx="10" cy="82" r="3.5" fill="var(--sun-orange)" />
          <circle cx="10" cy="82" r="7.5" stroke="var(--sun-orange)" strokeWidth="1.2" opacity="0.35" />
          <path d="M18 78 C 78 26, 158 12, 236 38" stroke="var(--blue-soft)" strokeWidth="1.6" strokeDasharray="1 8" strokeLinecap="round" />
          <circle cx="112" cy="34" r="2.5" fill="var(--blue-soft)" />
          <g transform="translate(238 38) rotate(16)">
            <path d="M9 0 L-7 6 L-2.5 0 L-7 -6 Z" fill="var(--blue-deep)" />
          </g>
        </svg>

        {/* handwritten margin note + hand-drawn arrow toward the stamps */}
        <div className={styles.annotation} aria-hidden="true">
          <span className={styles.annotationText}>stamped &amp; approved!</span>
          <svg className={styles.annotationArrow} viewBox="0 0 60 46" fill="none">
            <path d="M52 4 C 40 26, 24 34, 10 36" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 30 L8 37 L19 40" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionIndex}>06</span>
          <span className={styles.eyebrow}>{tag}</span>
          <span className={styles.sectionRule} aria-hidden="true" />
          <span className={styles.headCode} aria-hidden="true">PASSPORT CONTROL · SSK-06</span>
        </div>

        <div className={styles.header}>
          <h2 className={styles.title}>
            {titleLead && <>{titleLead}{' '}</>}
            <span className={styles.accent}>{titleLast}</span>
          </h2>
          <p className={styles.sub}>{subtitle}</p>
        </div>

        {/* ── the passport double-page the stamps sit on ── */}
        <div className={styles.passport}>
          <span className={styles.passportCaption} aria-hidden="true">SUNSKY PASSPORT · EST. 2026</span>
          <span className={styles.passportFold} aria-hidden="true" />
          <span className={styles.passportPage} aria-hidden="true">PAGE 06 — ENTRY STAMPS</span>

          <div className={styles.grid}>
            {items.map((item, i) => (
              <div key={i} className={styles.item}>
                <span className={styles.stampCode} aria-hidden="true">
                  SSK · {String(i + 1).padStart(2, '0')}
                </span>
                {i === 1 && (
                  <svg className={styles.approvedStamp} viewBox="0 0 110 110" aria-hidden="true">
                    <defs>
                      <path id="trustStampArc" d="M55 16 A39 39 0 1 1 54.99 16" fill="none" />
                    </defs>
                    <circle cx="55" cy="55" r="52" stroke="currentColor" strokeWidth="2.6" fill="rgba(255,255,255,0.55)" />
                    <circle cx="55" cy="55" r="33" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 4.5" fill="none" />
                    <text fontFamily="Sora, sans-serif" fontSize="10.5" fontWeight="800" letterSpacing="2.2" fill="currentColor">
                      <textPath href="#trustStampArc">APPROVED · SUNSKY · APPROVED</textPath>
                    </text>
                    <g transform="translate(55 55) rotate(-18)">
                      <path d="M14 0 L-10 9 L-4 0 L-10 -9 Z" fill="currentColor" />
                    </g>
                  </svg>
                )}
                {item.icon && <div className={styles.icon}>{item.icon}</div>}
                <div className={styles.itemTitle}>{item.title}</div>
                <div className={styles.itemDesc}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
