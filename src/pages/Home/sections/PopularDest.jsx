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

  const titleWords = String(title).trim().split(/\s+/);
  const titleLast  = titleWords.pop();
  const titleRest  = titleWords.join(' ');

  return (
    <section className={styles.sectionAlt}>

      {/* ── layered sky scene behind everything ── */}
      <div className={styles.bgArt} aria-hidden="true">
        <span className={styles.glowBlue} />
        <span className={styles.glowGold} />
        <span className={styles.dotTexture} />
        <span className={styles.ghostNum}>05</span>
        <span className={styles.ghostWord}>wanderlust</span>
        <span className={styles.cloudA} />
        <span className={styles.cloudB} />

        {/* dashed flight route weaving behind the stamp wall */}
        <svg className={styles.bgRoute} viewBox="0 0 1440 780" fill="none" preserveAspectRatio="xMidYMid slice">
          <path d="M-40 220 C140 110 300 300 480 250 C640 205 700 90 880 110 C1060 130 1120 260 1290 220 C1380 199 1420 170 1500 150"
                stroke="rgba(31,79,216,0.15)" strokeWidth="2" strokeDasharray="0.5 9" strokeLinecap="round" />
          <circle cx="480" cy="250" r="3.4" fill="rgba(255,159,28,0.55)" />
          <circle cx="480" cy="250" r="7.5" stroke="rgba(255,159,28,0.28)" strokeWidth="1.4" />
          <circle cx="880" cy="110" r="3.4" fill="rgba(31,79,216,0.38)" />
          <circle cx="880" cy="110" r="7.5" stroke="rgba(31,79,216,0.2)" strokeWidth="1.4" />
          <circle cx="1290" cy="220" r="3.4" fill="rgba(255,159,28,0.55)" />
          <circle cx="1290" cy="220" r="7.5" stroke="rgba(255,159,28,0.28)" strokeWidth="1.4" />
          <g transform="translate(1362 158) rotate(16)">
            <path d="M22 2L11 13" stroke="rgba(31,79,216,0.4)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="rgba(31,79,216,0.4)" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(232,241,255,0.9)" />
          </g>
        </svg>

        {/* oversized rotating passport stamp at the warm seam */}
        <svg className={styles.bgStamp} viewBox="0 0 200 200" fill="none">
          <defs>
            <path id="pdBigArc" d="M100 100 m-70 0 a70 70 0 1 1 140 0 a70 70 0 1 1 -140 0" />
          </defs>
          <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="2" strokeDasharray="5 8" />
          <circle cx="100" cy="100" r="52" stroke="currentColor" strokeWidth="1.4" />
          <text fontSize="14" letterSpacing="3" fill="currentColor" fontFamily="Sora, sans-serif" fontWeight="700">
            <textPath href="#pdBigArc">POPULAR DESTINATIONS · SUNSKY TRAVEL ·</textPath>
          </text>
          <g transform="translate(85 85) scale(1.25)">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        </svg>

        <span className={styles.grain} />
      </div>

      <div className={styles.section}>

        <div className={styles.header}>
          <div className={styles.headRow}>
            <span className={styles.headIndex}>05</span>
            <span className={styles.headEyebrow}>{tag}</span>
            <span className={styles.headRule} aria-hidden="true" />
            <span className={styles.headMicro} aria-hidden="true">GATE B12 · STAMP WALL · SSK-05</span>
          </div>
          <div className={styles.headMain}>
            <div className={styles.headCopy}>
              <h2 className={styles.title}>
                {titleRest && <>{titleRest}{' '}</>}
                <span className={styles.titleAccent}>{titleLast}</span>
              </h2>
              <p className={styles.sub}>{subtitle}</p>
            </div>
            <div className={styles.headAside} aria-hidden="true">
              <span className={styles.headNote}>go on — collect them all!</span>
              <svg className={styles.headArrow} viewBox="0 0 90 64" fill="none">
                <path d="M82 6 C60 10 34 22 20 48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 6" />
                <path d="M18 36 L19 50 L32 46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <div className={styles.grid}>
          {cards.map((c, i) => (
            <article key={i} className={styles.card}>
              {i === 0 && <span className={styles.featBadge}>Most loved</span>}

              {/* passport stamp crossing the ticket edge */}
              <svg className={`${styles.stamp} ${styles[c.colorClass]}`} viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <defs>
                  <path id={`pdStampArc${i}`} d="M50 50 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0" />
                </defs>
                <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 5.5" />
                <circle cx="50" cy="50" r="23.5" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
                <text fontSize="9.5" letterSpacing="1.9" fill="currentColor" fontFamily="Sora, sans-serif" fontWeight="700">
                  <textPath href={`#pdStampArc${i}`}>{`SUNSKY · COLLECTED · Nº ${String(i + 1).padStart(2, '0')}`}</textPath>
                </text>
                <g transform="translate(39 39) scale(0.92)">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </g>
              </svg>

              <div className={styles.cardInner}>
                <span className={styles.strip} aria-hidden="true" />
                <div className={styles.cardHead}>
                  {c.icon && <div className={`${styles.icon} ${styles[c.colorClass]}`}>{c.icon}</div>}
                  <div className={styles.cardHeadText}>
                    <div className={styles.cardTitle}>{c.title}</div>
                    <div className={styles.cardCount}>{c.count}</div>
                  </div>
                </div>
                <div className={styles.links}>
                  {c.links.map((l) => <a key={l} href="#">{l}</a>)}
                </div>
                <div className={styles.cardFoot}>
                  <span className={styles.footCode}>{`SSK · ${String(i + 1).padStart(2, '0')}`}</span>
                  <span className={styles.footRoute} aria-hidden="true">{`BRU ✈ ${(String(c.title).replace(/[^A-Za-z]/g, '').slice(0, 3) || 'SKY').toUpperCase()}`}</span>
                  <span className={styles.footBarcode} aria-hidden="true" />
                </div>
              </div>
            </article>
          ))}

          {/* scrapbook empty slot — next stamp placeholder */}
          <div className={styles.slotGhost} aria-hidden="true">
            <svg className={styles.slotRing} viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 7" />
              <circle cx="60" cy="60" r="31" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
              <g transform="translate(47 47) scale(1.05)">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </g>
            </svg>
            <span className={styles.slotNote}>your next stamp goes here…</span>
          </div>
        </div>

      </div>
    </section>
  );
}
