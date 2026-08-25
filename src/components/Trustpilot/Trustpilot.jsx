import { useEffect, useRef } from 'react';
import styles from './Trustpilot.module.css';
import ReviewsPlaceholder from './ReviewsPlaceholder';
import { useConsent } from '../../context/ConsentContext';
import { loadTrustpilot } from './loadTrustpilot';
import {
  TRUSTPILOT_ENABLED,
  BUSINESS_UNIT_ID,
  TEMPLATES,
  DEFAULT_LOCALE,
  REVIEW_URL,
} from './trustpilotConfig';

/**
 * A Trustpilot TrustBox.
 *
 * THREE GATES, IN THIS ORDER.
 *
 *  1. No business-unit id configured → render NOTHING. Not a wrapper, not a link, not reserved
 *     space, and above all not a specimen rating. Until the agency's Trustpilot account exists
 *     there is no rating to show, and the only honest thing to draw is nothing at all.
 *  2. Consent absent or refused → render the placeholder, never a blank hole. The widget's
 *     iframe writes a cookie and reports the page back to Trustpilot, so it may not load until
 *     the visitor has agreed.
 *  3. Script blocked (adblocker, CSP, offline) → the container is already in the DOM carrying
 *     a plain link to the real profile, and Trustpilot never got far enough to replace it.
 *
 * Gate 1 sits before gate 2 deliberately: while the id is unset the widget is not a purpose at
 * all, and a visitor should never be told they are missing reviews that do not exist.
 *
 * `className` is passed through rather than owned, the same way AirlineMark does it — each
 * host stylesheet sizes its own slot.
 */
export default function Trustpilot({
  template = 'microStar',
  height = '24px',
  width = '100%',
  locale = DEFAULT_LOCALE,
  className = '',
}) {
  const ref = useRef(null);
  const { has } = useConsent();
  const consented = has('reviews');
  const templateId = TEMPLATES[template] || TEMPLATES.microStar;

  useEffect(() => {
    if (!TRUSTPILOT_ENABLED || !consented) return undefined;
    let cancelled = false;
    loadTrustpilot().then((ok) => {
      if (cancelled || !ok) return;
      const el = ref.current;
      // The second argument is what makes this a REBUILD. Without it an already-rendered
      // container is a no-op and a stale widget survives; with it the container is torn down
      // and built again. It is also what makes the effect safe under StrictMode's double
      // invoke — createWidget clears every child first, so two runs leave exactly one iframe.
      if (el && window.Trustpilot) window.Trustpilot.loadFromElement(el, true);
    });
    return () => { cancelled = true; };
    // Every dependency here is a module constant or a prop that does not change at runtime for
    // a given placement, so this runs once per mount. KEEP IT THAT WAY: each createWidget call
    // registers a fresh document.body subtree MutationObserver, and the previous one only
    // disconnects once the container is detached — which an in-place rebuild never does. An
    // unstable dependency leaks an observer per render.
  }, [consented, templateId, locale, height, width]);

  if (!TRUSTPILOT_ENABLED) return null;
  if (!consented) return <ReviewsPlaceholder className={className} />;

  return (
    <div
      ref={ref}
      // `trustpilot-widget` is not cosmetic: the bootstrap finds containers with
      // getElementsByClassName('trustpilot-widget').
      className={`trustpilot-widget ${styles.box} ${className}`.trim()}
      data-locale={locale}
      data-template-id={templateId}
      data-businessunit-id={BUSINESS_UNIT_ID}
      data-style-height={height}
      data-style-width={width}
      data-theme="light"
      // NO data-group. Setting it is what attaches a session id and an expiry to every
      // impression, view and click the widget reports. Leaving it off is a real reduction in
      // what leaves the visitor's browser and costs us nothing.
      //
      // The fallback link is raw HTML, NOT JSX, and that is load-bearing twice over. Trustpilot
      // empties the container child by child before inserting its iframe; if React thought it
      // owned that node, a later update would throw NotFoundError trying to remove a node that
      // is already gone. And their window.load re-scan skips any container with no firstChild,
      // so an empty div would simply never render.
      dangerouslySetInnerHTML={{
        __html:
          `<a href="${REVIEW_URL}" target="_blank" rel="noopener noreferrer">Trustpilot</a>`,
      }}
    />
  );
}
