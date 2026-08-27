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
 * MODULE CONSTANT, NOT AN INLINE LITERAL, and that is load-bearing. React 19 compares
 * dangerouslySetInnerHTML BY REFERENCE: a fresh `{ __html }` object each render is a changed
 * prop, so React re-sets innerHTML on every re-render — wiping out the iframe Trustpilot put
 * there and leaving the fallback link behind for good. Hoisting it means React writes the
 * fallback once on mount and never touches the node again.
 */
const FALLBACK_HTML = {
  __html: `<a href="${REVIEW_URL}" target="_blank" rel="noopener noreferrer">Trustpilot</a>`,
};

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
  // A host with no room for a sentence can turn the refusal note off and render nothing
  // instead. The note still has to appear SOMEWHERE — the footer carries it — because a
  // visitor who declined is owed an explanation and a way back, once.
  showPlaceholder = true,
}) {
  const ref = useRef(null);
  const { has } = useConsent();
  const consented = has('reviews');
  // A named template, a raw Trustpilot id, or nothing at all. Falling back to a default here
  // would resurrect the very widget the caller is trying not to render.
  const templateId = template ? (TEMPLATES[template] || template) : '';

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
  // No template means the plan has nothing to show here. Render nothing rather than let
  // Trustpilot fill the slot with its own rating-less logo.
  if (!templateId) return null;
  if (!consented) return showPlaceholder ? <ReviewsPlaceholder className={className} /> : null;

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
      // Raw HTML, not JSX: Trustpilot empties this container child by child before inserting
      // its iframe, and if React believed it owned that node a later update would throw
      // trying to remove something already gone. Their window.load re-scan also skips any
      // container with no firstChild, so an empty div would simply never render.
      // See FALLBACK_HTML above for why the object must not be built inline.
      dangerouslySetInnerHTML={FALLBACK_HTML}
    />
  );
}
