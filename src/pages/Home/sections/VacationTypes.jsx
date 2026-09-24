import { Link } from 'react-router-dom';
import styles from './VacationTypes.module.css';
import SectionHead from './SectionHead';
import { useTranslation } from 'react-i18next';

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
  { key:'allInclusive', label:'Worry-Free',    title:'All Inclusive',    desc:'Everything taken care of. Just relax and enjoy.',     img:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80', href: boardUrl('AI', 'All Inclusive') },
  { key:'adultsOnly', label:'Premium Escape',title:'Adults Only',      desc:'Tranquil retreats for couples and friends.',           img:'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=80', href: searchUrl({ adultsOnly: '1' }) },
  { key:'family', label:'Family Fun',    title:'Family Friendly',  desc:"Fun for the whole family with kids' activities.",      img:'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80', href: searchUrl({ kids: '340' }) },
];

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

// The dashboard label ("Luxury Collection") often just repeats the title; a label only earns
// its badge when it says something the title does not.
const sameWords = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export default function VacationTypes({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.vacationTypes;
  const tag      = sh?.tag      || t('vacationTypes.tag', 'Curated');
  const title    = sh?.title    || t('vacationTypes.title', 'Your favorite type of vacation');
  const subtitle = sh?.subtitle || t('vacationTypes.subtitle', 'Curated experiences designed around how you love to travel.');

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
          buttonText: v.buttonText || t('vacationTypes.explore', 'Explore'),
          href,
          // The chips name what the link applies, so a criteria list that produced no usable
          // filter prints none of them rather than promising a search the button cannot run.
          chips: (href && criteria.length && v.search?.showFacts !== false)
            ? criteria.map((c) => ({ text: criterionText(c), star: c?.filterKey === 'stars' }))
                      .filter((c) => c.text)
            : [],
        };
      })
    : FALLBACK_TYPES.map((v) => ({
        ...v,
        label: t(`vacationTypes.types.${v.key}.label`, v.label),
        title: t(`vacationTypes.types.${v.key}.title`, v.title),
        desc: t(`vacationTypes.types.${v.key}.desc`, v.desc),
        buttonText: t('vacationTypes.explore', 'Explore'),
      }));

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} />

        <div className={styles.grid}>
          {types.map((vac, i) => (
            <article key={i} className={styles.card}>
              <div className={styles.media}>
                <img src={vac.img} alt={vac.title} loading="lazy" />
                {vac.label && !sameWords(vac.label, vac.title) && (
                  <span className={styles.label}>{vac.label}</span>
                )}
              </div>
              <div className={styles.body}>
                <h3 className={styles.vacTitle}>{vac.title}</h3>
                {vac.desc && <p className={styles.vacDesc}>{vac.desc}</p>}
                {/* the filters this card's link applies */}
                {vac.chips?.length > 0 && (
                  <div className={styles.chips}>
                    {vac.chips.map((c, ci) => (
                      <span key={ci} className={`${styles.chip} ${c.star ? styles.chipStar : ''}`}>{c.text}</span>
                    ))}
                  </div>
                )}
                {/* No link, no call to action: a button that goes nowhere is worse than none. */}
                {vac.href && (
                  <Link className={styles.vacBtn} to={vac.href} title={t('vacationTypes.searchStays', {
                    type: vac.title,
                    defaultValue: 'Search {{type}} stays',
                  })}>
                    {vac.buttonText || t('vacationTypes.explore', 'Explore')}
                    <ArrowIcon />
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
