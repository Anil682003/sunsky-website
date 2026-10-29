import { useTranslation } from 'react-i18next';
import styles from './TrustpilotRating.module.css';
import { REVIEW_URL } from './trustpilotConfig';
import { langOf } from '../../utils/siteHeader';

/**
 * The agency's Trustpilot rating as Trustpilot itself presents it: five star tiles, the band
 * word ("Uitstekend") and the TrustScore, linking to the real review profile.
 *
 * The score comes from CMS -> Layout -> Header -> Reviews, where the editor copies it from the
 * agency's own Trustpilot page. Nothing here invents or rounds one up: with no score the caller
 * shows TrustpilotBadge (a plain "read our reviews" link) instead. Trustpilot's paid TrustBox
 * widget would read the score live; the account is on the free plan, which has none.
 */

// Trustpilot's TrustScore bands (Excellent from 4.3, Great 3.8, Average 2.8, Poor 1.8, else Bad).
export const bandOf = (score) => {
  if (score >= 4.3) return 'excellent';
  if (score >= 3.8) return 'great';
  if (score >= 2.8) return 'average';
  if (score >= 1.8) return 'poor';
  return 'bad';
};

// The star image is the score to the nearest half star, coloured by its whole stars, the way
// Trustpilot draws its own badge.
const STAR_COLOUR = { 5: '#00b67a', 4: '#73cf11', 3: '#ffce00', 2: '#ff8622', 1: '#ff3722' };
const EMPTY = '#dcdce6';

const Star = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#fff" d="M12 3.6l2.36 5.3 5.77.53-4.36 3.82 1.29 5.65L12 15.98 6.94 18.9l1.29-5.65-4.36-3.82 5.77-.53L12 3.6z" />
  </svg>
);

export default function TrustpilotRating({ score, tone = 'onLight', showLabel = true, className = '' }) {
  const { t, i18n } = useTranslation('common');
  const lang = langOf(i18n.resolvedLanguage || i18n.language);
  const stars = Math.round(score * 2) / 2;
  const colour = STAR_COLOUR[Math.max(1, Math.floor(stars))];
  const shown = lang === 'nl' ? score.toFixed(1).replace('.', ',') : score.toFixed(1);
  const band = t(`nav.trustBand.${bandOf(score)}`, bandOf(score));
  const label = t('nav.trustRatingAria', {
    band,
    score: shown,
    defaultValue: `${band}, ${shown} out of 5 on Trustpilot. Read our reviews (opens in a new tab)`,
  });

  return (
    <a
      href={REVIEW_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.rating} ${tone === 'onDark' ? styles.onDark : ''} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <span className={styles.stars} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = stars >= n ? colour : stars >= n - 0.5 ? `linear-gradient(90deg, ${colour} 50%, ${EMPTY} 50%)` : EMPTY;
          return <span key={n} className={styles.tile} style={{ background: fill }}><Star /></span>;
        })}
      </span>
      {showLabel && (
        <span className={styles.text} aria-hidden="true">
          <span className={styles.band}>{band}</span>
          <span className={styles.score}>{shown}</span>
        </span>
      )}
    </a>
  );
}
