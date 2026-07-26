import { Link } from 'react-router-dom';
import styles from './VacationTypes.module.css';

// Search links for the cards. The results page seeds these filters from the URL on entry, so a
// card lands on a list already narrowed to that vacation type (empty scope → popular destinations,
// then the filter applied). `?boards=` = board type, `?kids=` = kids amenity, `?adultsOnly=1` =
// adults-only hotels — all real, live filters (verified non-empty over the default scope).
const boardUrl = (code, label) => {
  const qs = new URLSearchParams();
  qs.set('boards', String(code).trim().toUpperCase());
  if (label) qs.set('boardLabel', label);
  return `/results?${qs.toString()}`;
};
const searchUrl = (params) => `/results?${new URLSearchParams(params).toString()}`;

// A dashboard card can carry a list of filter criteria instead of a single board code. Each is
// { filterKey, value, label }; criteria sharing a filterKey OR together, which is exactly how the
// results sidebar already treats a multi-ticked group. Values stay verbatim — an activity may be
// group-qualified ("74:620"), and coercing it to a number would silently match another group.
const starGlyphs = (value) => {
  const n = Math.round(Number(value));
  return n >= 1 && n <= 5 ? '★'.repeat(n) : '';
};
// `label` is captured in the dashboard at pick time, so the homepage never has to load the
// facility catalogue just to name a filter — and never invents a name it cannot verify.
const criterionText = (c) => (c?.filterKey === 'stars' ? starGlyphs(c.value) : String(c?.label ?? '').trim());
const criterionLabel = (c) => String(c?.label ?? '').trim() || criterionText(c);

// The query string collapses a repeated criterion on its own, so drop it here too — otherwise the
// card prints the same chip twice while the link filters on it once.
const uniqueCriteria = (criteria) => {
  const seen = new Set();
  return criteria.filter((c) => {
    const k = `${c?.filterKey}:${c?.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const criteriaUrl = (criteria, cardTitle) => {
  const byKey = new Map();
  for (const c of criteria) {
    const key = String(c?.filterKey || '').trim();
    if (!key) continue;
    // adultsOnly is the one boolean dimension; the results page reads it as `?adultsOnly=1`.
    if (key === 'adultsOnly') { if (c.value) byKey.set(key, new Set(['1'])); continue; }
    const value = String(c?.value ?? '').trim();
    if (!value) continue;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(value);
  }
  // Nothing usable in the list — leave the card non-clickable rather than ship a button that
  // lands on an unfiltered search while claiming to be a vacation type.
  if (!byKey.size) return null;

  const qs = new URLSearchParams();
  for (const [key, values] of byKey) qs.set(key, [...values].join(','));
  // Results names what was applied from these two; without them it can only fall back to the
  // facet catalogue, which is not loaded yet on first paint.
  if (cardTitle) qs.set('cardLabel', cardTitle);
  const labels = criteria.map(criterionLabel).filter(Boolean);
  if (labels.length) qs.set('filterLabels', labels.join('|'));
  return `/results?${qs.toString()}`;
};

const FALLBACK_TYPES = [
  { label:'Worry-Free',    title:'All Inclusive',    desc:'Everything taken care of. Just relax and enjoy.',     img:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80', href: boardUrl('AI', 'All Inclusive') },
  { label:'Premium Escape',title:'Adults Only',      desc:'Tranquil retreats for couples and friends.',           img:'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=80', href: searchUrl({ adultsOnly: '1' }) },
  { label:'Family Fun',    title:'Family Friendly',  desc:"Fun for the whole family with kids' activities.",      img:'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80', href: searchUrl({ kids: '340' }) },
];

/* decorative airline-style route codes, one per tag */
const ROUTES = ['BRU ✈ AYT', 'AMS ✈ RHO', 'CGN ✈ HRG'];

export default function VacationTypes({ cms }) {
  const sh = cms?.sectionHeaders?.vacationTypes;
  const tag      = sh?.tag      || '♡ Curated';
  const title    = sh?.title    || 'Your favorite type of vacation';
  const subtitle = sh?.subtitle || 'Curated experiences designed around how you love to travel.';

  const types = (cms?.vacationTypes?.length > 0)
    ? cms.vacationTypes.map((v) => {
        const criteria = uniqueCriteria(Array.isArray(v.search?.criteria) ? v.search.criteria : []);
        // Criteria win over boardCode, which the dashboard keeps mirrored so a stale bundle that
        // predates criteria still links somewhere sane. With neither the card stays non-clickable.
        const href = criteria.length ? criteriaUrl(criteria, v.title)
                   : v.boardCode    ? boardUrl(v.boardCode, v.title)
                   : null;
        return {
          label: v.label,
          title: v.title,
          desc:  v.description || v.desc || '',
          img:   v.imageUrl,
          buttonText: v.buttonText || 'Explore',
          href,
          // The chips name what the link applies, so a criteria list that produced no usable
          // filter prints none of them rather than promising a search the button cannot run.
          chips: (href && criteria.length && v.search?.showFacts !== false)
            ? criteria.map((c) => ({ text: criterionText(c), star: c?.filterKey === 'stars' }))
                      .filter((c) => c.text)
            : [],
        };
      })
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
                    {/* the filters this card's link applies — stays above the perforation so the
                        stub keeps its fixed 62px height and the notch mask stays aligned */}
                    {t.chips?.length > 0 && (
                      <div className={styles.chips}>
                        {t.chips.map((c, ci) => (
                          <span key={ci} className={`${styles.chip} ${c.star ? styles.chipStar : ''}`}>{c.text}</span>
                        ))}
                      </div>
                    )}
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
