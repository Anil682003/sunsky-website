import { useEffect, useRef } from 'react';
import { useConsent } from '../context/ConsentContext';
import { GTM_ENABLED } from './config';
import { setCollectionAllowed } from './dataLayer';
import { setConsentDefaults, updateConsent } from './consentMode';
import { loadGtm, unloadGtm } from './gtm';

/**
 * Wires consent to Google. Renders nothing.
 *
 * THE ORDER OF THE THREE STEPS IS THE WHOLE COMPONENT, and it is what Tracking Master §23
 * requires ("the default Consent Mode state must be established before Google measurement
 * tags process user activity"):
 *
 *   1. push the denied defaults into the dataLayer;
 *   2. push the visitor's actual decision as an update;
 *   3. only then, and only if something was granted, inject the container.
 *
 * Steps 1 and 2 touch nothing but a JavaScript array on `window` - no cookie, no request -
 * so they are safe to run for a visitor who has refused or not yet answered. Step 3 is the
 * gate: a refusal means the container is never fetched at all, which is stricter than Consent
 * Mode alone and is what the project's standing consent rule requires of any tag manager.
 *
 * Mounted above the router in App.jsx, beside <CookieBanner />, because what someone agreed
 * to has nothing to do with which page they are on.
 */
export default function Analytics() {
  const { has, decided } = useConsent();

  const analytics = has('analytics');
  const marketing = has('marketing');
  const granted = analytics || marketing;

  // The defaults must be pushed exactly once, before anything else reaches the array.
  const defaultsPushed = useRef(false);

  useEffect(() => {
    if (!GTM_ENABLED) return;

    if (!defaultsPushed.current) {
      setConsentDefaults();
      defaultsPushed.current = true;
    }

    // Only once the visitor has actually answered. Sending an update for an undecided
    // visitor would overwrite `wait_for_update` with a denial they never expressed.
    if (decided) updateConsent({ analytics, marketing });

    // The event gate in dataLayer.js. Kept in step with consent on every change, so a
    // withdrawal stops collection in this tick rather than at the next reload.
    setCollectionAllowed(granted);

    if (granted) loadGtm();
  }, [analytics, marketing, granted, decided]);

  // Revoking a purpose makes ConsentContext reload the page, so this is belt and braces for
  // the case where that behaviour ever changes.
  useEffect(() => () => {
    setCollectionAllowed(false);
    if (!granted) unloadGtm();
  }, [granted]);

  return null;
}
