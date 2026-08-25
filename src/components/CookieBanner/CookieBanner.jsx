import { Link } from 'react-router-dom';
import styles from './CookieBanner.module.css';
import { useConsent } from '../../context/ConsentContext';
import { useFooterConfig } from '../../api';
import { findLegalLink } from '../../utils/legalLinks';
import { CONTROLLER } from '../../utils/controller';

/**
 * The cookie notice.
 *
 * WHAT IT IS FOR. Nothing on this site may be stored on a visitor's device for a non-essential
 * purpose until they have said yes. Today there is exactly one such thing — the Trustpilot
 * widget, whose iframe writes a `TrustboxSplitTest_*` cookie and reports the page you are on
 * back to Trustpilot. Everything else the site stores (your session, your search, your party,
 * Stripe on the checkout) is strictly necessary and needs no permission.
 *
 * WHY TWO BUTTONS IS ENOUGH. The APD requires consent per purpose, at the latest in a second
 * layer. There is exactly ONE optional purpose here, so "per purpose" and "all" are the same
 * set and a binary control is already fully granular — nobody is forced to bundle anything.
 * That argument stops holding the moment a second optional purpose is registered, which is why
 * `PURPOSES` in utils/consentStore.js is category-keyed from day one and why a test fails if a
 * second one appears. Do not add analytics without adding the settings layer in the same
 * change.
 *
 * WHY BOTH BUTTONS LOOK THE SAME. The client's mockup had an outlined "reject" beside a filled
 * orange "accept". Colour-weighting the two choices is the nudge the APD checklist names
 * directly; refusing has to be as easy as accepting. Two identical buttons satisfy that with
 * nothing left to argue about — and because the house rule is white ink on orange, making both
 * of them the orange lockup satisfies both rules at once.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a modal, and there is no close button. It does not trap
 * focus and Escape does nothing. A visitor who ignores it is a visitor with no consent, which
 * is a perfectly lawful state to leave them in; an X that silently records "yes" would not be.
 */
export default function CookieBanner() {
  const { open } = useConsent();
  // The card is a separate component because it calls useFooterConfig(), and hooks/useApi.js
  // does not cache: mounting it would fire a footer request on every page for the large
  // majority of visitors who decided long ago. Rendering null here costs nothing.
  if (!open) return null;
  return <CookieBannerCard />;
}

function CookieBannerCard() {
  const { acceptAll, rejectAll, reopened, close } = useConsent();
  const { data: footer } = useFooterConfig();
  // The real cookie-policy page out of the CMS, by label keyword — the same resolution the
  // checkout uses, so renaming that page in the dashboard never leaves a dead link here.
  const policyUrl = findLegalLink(footer, ['cookie'], '/p/privacy-legal#cookie-policy');
  const internal = typeof policyUrl === 'string' && policyUrl.startsWith('/');

  const policyLink = internal
    ? <Link className={styles.policy} to={policyUrl}>Cookie policy</Link>
    : <a className={styles.policy} href={policyUrl} target="_blank" rel="noreferrer">Cookie policy</a>;

  return (
    <div className={styles.wrap} role="region" aria-label="Cookie consent">
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.glyph} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z" />
              <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="14" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h2 className={styles.title}>Cookies on holidaybooking.be</h2>
        </div>

        <div className={styles.body}>
          <p>
            Cookies that make this site work are always on. They keep your search and your
            booking together, and they keep payment secure.
          </p>
          <p>
            With your permission we also load our Trustpilot review widget. Trustpilot then
            sees that you visited this page and stores a cookie on your device.
          </p>
          <p>
            If you decline, everything on the site keeps working. You will see a short note
            where the reviews would be, and you can change your mind at any time using
            Cookie settings in the footer.
          </p>
        </div>

        {/* Named controller, as the APD asks for in the first layer. Rendered only when the
            agency has actually told us who it is — a placeholder in this line would be worse
            than the line being absent. */}
        {CONTROLLER.name && (
          <p className={styles.controller}>
            Cookies are placed by {CONTROLLER.name}
            {CONTROLLER.enterpriseNumber ? ` (${CONTROLLER.enterpriseNumber})` : ''}, the
            operator of holidaybooking.be. One third party is involved: Trustpilot.
          </p>
        )}

        <div className={styles.links}>
          {policyLink}
          {/* Reopened over an existing decision, there has to be a way back out that changes
              nothing. On the first showing there is none, by design. */}
          {reopened && (
            <button type="button" className={styles.cancel} onClick={close}>
              Keep current settings
            </button>
          )}
        </div>

        {/* Reject first: reading order reaches it first, which can never be read as
            privileging acceptance. Both are one click to a final answer — neither opens
            a settings pane. */}
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={rejectAll}>
            Reject optional cookies
          </button>
          <button type="button" className={styles.btn} onClick={acceptAll}>
            Accept all cookies
          </button>
        </div>
      </div>
    </div>
  );
}
