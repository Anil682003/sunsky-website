import styles from './Trustpilot.module.css';
import { useConsent } from '../../context/ConsentContext';

/**
 * What stands where the reviews would be, for a visitor who declined optional cookies.
 *
 * This is not decoration. The APD expects a notice to say what refusing costs you, and the
 * honest place to say it is the spot where the cost actually appears. It also stops a refusal
 * from looking like a bug: a blank gap where a widget belongs reads as a broken page, and the
 * traveller has no way to tell that they did it to themselves, or how to undo it.
 *
 * "Cookie settings" is a button rather than a link because it opens an in-page control and
 * navigates nowhere.
 */
export default function ReviewsPlaceholder({ className = '' }) {
  const { reopen, decided } = useConsent();
  return (
    <p className={`${styles.placeholder} ${className}`.trim()}>
      {/* "No decision yet" and "said no" both leave consent false, but they are not the same
          thing to say out loud. Telling a first-time visitor they declined — while the notice
          is still on screen asking them to choose — is simply untrue, and it is the one claim
          on this page about what the visitor themselves did. */}
      {decided
        ? 'Reviews hidden — you declined optional cookies. '
        : 'Reviews load once you allow optional cookies. '}
      <button type="button" className={styles.placeholderBtn} onClick={reopen}>
        Cookie settings
      </button>
    </p>
  );
}
