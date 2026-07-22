import { Link } from 'react-router-dom';
import styles from './VacationTypes.module.css';

// Board-filtered search link. The results page seeds its Board Type filter from
// `?boards=` on entry, so the card lands on a list already narrowed to that board.
const boardUrl = (code, label) => {
  const qs = new URLSearchParams();
  qs.set('boards', String(code).trim().toUpperCase());
  if (label) qs.set('boardLabel', label);
  return `/results?${qs.toString()}`;
};

const FALLBACK_TYPES = [
  { label:'Worry-Free',    title:'All Inclusive',    desc:'Everything taken care of. Just relax and enjoy.',     img:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80' },
  { label:'Premium Escape',title:'Adults Only',      desc:'Tranquil retreats for couples and friends.',           img:'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=80' },
  { label:'Family Fun',    title:'Family Friendly',  desc:"Fun for the whole family with kids' activities.",      img:'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80' },
];

/* decorative airline-style route codes, one per tag */
const ROUTES = ['BRU ✈ AYT', 'AMS ✈ RHO', 'CGN ✈ HRG'];

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
        // Set in the dashboard; without it the card stays non-clickable.
        href:  v.boardCode ? boardUrl(v.boardCode, v.title) : null,
      }))
    : FALLBACK_TYPES;

  // Split the CMS title so the last word gets the cursive golden accent
  const words = title.trim().split(' ');
  const lastWord = words.pop();
  const titleLead = words.join(' ');

  return (
    <section className={styles.sectionAlt}>

      {/* ── Layered sky scene (decorative) ── */}
      <div className={styles.bgScene} aria-hidden="true">
        <span className={styles.glowBlue} />
        <span className={styles.glowGold} />
        <span className={styles.dots} />
        <span className={styles.ghostNum}>03</span>
        <svg className={styles.route} viewBox="0 0 1200 320" fill="none" preserveAspectRatio="none">
          <path
            d="M-40 230 C 200 140, 380 250, 620 170 C 800 110, 980 150, 1240 70"
            stroke="rgba(31,79,216,0.15)" strokeWidth="1.6"
            strokeDasharray="7 9" strokeLinecap="round"
          />
          <circle cx="290" cy="196" r="4"   fill="rgba(31,79,216,0.22)" />
          <circle cx="620" cy="170" r="4.5" fill="rgba(255,159,28,0.42)" />
          <circle cx="900" cy="128" r="4"   fill="rgba(31,79,216,0.22)" />
          <g transform="translate(1046 88) rotate(14)">
            <path d="M2.5 12.4 21 4l-6.6 17-2.7-7.1-9.2-1.5z" fill="rgba(255,159,28,0.45)" />
          </g>
        </svg>
        <span className={`${styles.vtCloud} ${styles.vtCloud1}`} />
        <span className={`${styles.vtCloud} ${styles.vtCloud2}`} />
        <span className={styles.grain} />
      </div>

      <div className={styles.section}>

        {/* Boarding-pass section header */}
        <div className={styles.headRow}>
          <span className={styles.headIndex}>03</span>
          <span className={styles.headEyebrow}>{tag}</span>
          <span className={styles.headRule} aria-hidden="true" />
          <span className={styles.headCode} aria-hidden="true">VAC · GATE 03</span>
          <svg className={styles.headPlane} width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2.5 12.4 21 4l-6.6 17-2.7-7.1-9.2-1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {titleLead && `${titleLead} `}
            <span className={styles.titleAccent}>{lastWord}</span>
          </h2>
          <p className={styles.sub}>{subtitle}</p>
        </div>

        {/* Luggage-tag ticket cards */}
        <div className={styles.grid}>
          {types.map((t, i) => (
            <article key={i} className={`${styles.card} ${i === 1 ? styles.offset : ''}`}>
              {/* tag carries rotation + hover lift; card shell carries entrance + drop-shadow */}
              <div className={styles.tag}>
                {t.label && <span className={styles.stamp}>{t.label}</span>}

                {/* ticket carries the notch + punch-hole mask so the shadow follows every cut */}
                <div className={styles.ticket}>
                  <span className={styles.eyelet} aria-hidden="true" />
                  <div className={styles.cardMedia}>
                    <img src={t.img} alt={t.title} loading="lazy" />
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.vacTitle}>{t.title}</h3>
                    <p className={styles.vacDesc}>{t.desc}</p>
                  </div>
                  <div className={styles.cardFoot}>
                    <span className={styles.footMeta}>
                      <span className={styles.vacRoute}>{ROUTES[i % ROUTES.length]}</span>
                      <span className={styles.vacCode}>SSK · 03 · {String(i + 1).padStart(2, '0')}</span>
                    </span>
                    <span className={styles.barcode} aria-hidden="true" />
                    {t.href ? (
                      <Link className={styles.vacBtn} to={t.href} title={`Search ${t.title} stays`}>
                        {t.buttonText || 'Explore'}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    ) : (
                      <button className={styles.vacBtn} type="button">
                        {t.buttonText || 'Explore'}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* luggage-tag string looping out of the punched eyelet */}
                <svg className={styles.string} width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                  <path
                    d="M42 54 C 22 48, 6 34, 10 17 C 13 4, 32 3, 37 14 C 41 24, 31 30, 25 27"
                    stroke="rgba(174,126,58,0.55)" strokeWidth="2" strokeLinecap="round"
                  />
                </svg>
              </div>
            </article>
          ))}

          {/* handwritten note pointing at the offset middle tag */}
          <div className={styles.annot} aria-hidden="true">
            <span className={styles.annotText}>traveller favourite</span>
            <svg className={styles.annotArrow} width="46" height="40" viewBox="0 0 46 40" fill="none">
              <path d="M6 4 C 20 7, 31 15, 37 31" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M30 27 l7.5 5.5 1.5-9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

      </div>
    </section>
  );
}
