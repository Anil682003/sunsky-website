import { useTranslation } from 'react-i18next';
import styles from './TrustpilotBadge.module.css';
import { REVIEW_URL } from './trustpilotConfig';

/**
 * A compact "Trustpilot / Read our reviews" link to the agency's real review profile.
 *
 * This is what the header shows when its Reviews block is switched on (CMS -> Layout -> Header)
 * but the live star score cannot be drawn: the account is on Trustpilot's free plan, where
 * score widgets come back as a bare logo with no rating (see trustpilotConfig.js SCORE_TEMPLATE),
 * or the visitor has not allowed the external-media cookies the TrustBox iframe needs.
 *
 * Deliberately NO score and NO stars count. The rating lives on Trustpilot; drawing one here
 * from anything but their widget would be inventing a company's reputation. The badge only says
 * where the reviews are and opens them.
 *
 * It is a plain link: no script, no iframe, no cookie, so it needs no consent and cannot be
 * blocked into an empty gap.
 */
export default function TrustpilotBadge({ className = '' }) {
  const { t } = useTranslation('common');
  const label = t('nav.trustpilotAria', 'Read our reviews on Trustpilot (opens in a new tab)');
  return (
    <a
      href={REVIEW_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.badge} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <span className={styles.star} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5l2.95 6.6 7.2.66-5.45 4.78 1.62 7.06L12 17.9l-6.32 3.7 1.62-7.06L1.85 9.76l7.2-.66L12 2.5z" />
        </svg>
      </span>
      <span className={styles.text} aria-hidden="true">
        <span className={styles.brand}>Trustpilot</span>
        <span className={styles.sub}>{t('nav.trustpilotReviews', 'Read our reviews')}</span>
      </span>
    </a>
  );
}
