import styles from './Marquee.module.css';
import { useTranslation } from 'react-i18next';

/* Shown only when the dashboard's own marquee is empty. Key first, English
   second: the English is what the key renders if a translation is ever missing. */
const FALLBACK = [
  ['bestPrice', 'Best Price Guarantee'],
  ['holidayCount', '10,000+ Holidays'],
  ['noFees', 'No Booking Fees'],
  ['securePayments', 'Secure Payments'],
  ['support', '24/7 Support'],
  ['trustedBy', 'Trusted by 2M+ Travelers'],
  ['freeCancellation', 'Free Cancellation'],
  ['awardWinning', 'Award-Winning Service'],
];

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export default function Marquee({ cms }) {
  const { t } = useTranslation('home');
  // The translated fallback, in the reader's language.
  const translated = FALLBACK.map(([key, en]) => t(`marquee.${key}`, en));
  // A CMS marquee wins ONLY once it says something other than the shipped
  // English seed. The stored value on this site is byte-for-byte that seed — it
  // was never really customised, just the default sitting in the DB — and
  // honouring it would freeze the belt in English on a Dutch page. The moment
  // SUNSKY types their own strip in the dashboard it differs from the seed and
  // takes over, exactly as a CMS field should.
  const cmsItems = cms?.marqueeItems ?? [];
  const isUntouchedSeed =
    cmsItems.length === FALLBACK.length &&
    cmsItems.every((v, i) => v === FALLBACK[i][1]);
  const items = cmsItems.length > 0 && !isUntouchedSeed ? cmsItems : translated;
  // The track holds the list twice so the loop is seamless; the copy is for the eye only.
  const doubled = [...items, ...items];

  return (
    <div className={styles.wrap}>
      <div className={styles.viewport}>
        <ul className={styles.track}>
          {doubled.map((item, i) => (
            <li key={i} className={styles.item} aria-hidden={i >= items.length || undefined}>
              <span className={styles.check}><Check /></span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
