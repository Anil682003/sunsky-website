/**
 * Google Consent Mode v2.
 *
 * Tracking Master §23:
 *   - "The default Google Consent Mode state must be established before Google measurement
 *      tags process user activity."
 *   - "The consent state must then be updated immediately when the visitor makes or changes
 *      a consent choice."
 *   - "Consent must never be hard-coded as granted."
 *
 * HOW "BEFORE" IS SATISFIED HERE. The container is not in index.html - the project's standing
 * rule forbids a third-party tag there, and `src/test/preConsent.test.jsx` fails the build if
 * one appears. So the order is enforced in code instead: `setConsentDefaults()` queues the
 * default command into the dataLayer array, and only afterwards does `loadGtm()` append the
 * container script. The defaults are therefore at index 0 of the array the container reads on
 * startup, which is exactly what §23 asks for and is strictly earlier than a tag in <head>
 * would manage.
 *
 * WHY DEFAULTS ARE PUSHED AT ALL WHEN NOTHING IS LOADED YET. Two reasons. If the visitor
 * later accepts, the container loads into an array that already denies everything and is then
 * updated - never a window where it starts up unconstrained. And if SUNSKY ever moves to
 * loading the container up front for Consent Mode modelling, the defaults are already correct
 * and only the gate in gtm.js changes.
 */

import { pushConsentCommand } from './dataLayer';

/**
 * SUNSKY consent purposes -> Google Consent Mode v2 signals.
 *
 * `analytics` covers measurement. The three advertising signals all hang off `marketing`,
 * because that is the single thing the cookie notice asks about: a visitor who agreed to
 * "Marketingcookies - Advertenties, remarketing, profilering of marketingmeting" agreed to
 * advertising storage, to their data being used for it, and to personalisation. Splitting one
 * disclosed purpose into three separately-granted signals would claim a granularity the
 * banner never offered.
 */
export function signalsFor({ analytics = false, marketing = false } = {}) {
  const g = (ok) => (ok ? 'granted' : 'denied');
  return {
    analytics_storage: g(analytics),
    ad_storage: g(marketing),
    ad_user_data: g(marketing),
    ad_personalization: g(marketing),
  };
}

/**
 * Everything denied, plus the two signals Google expects alongside them.
 *
 * `functionality_storage` and `security_storage` are granted because they describe strictly
 * necessary storage, which is the one category the visitor is not asked about and which runs
 * regardless. `personalization_storage` follows the marketing choice and so starts denied.
 *
 * `wait_for_update` gives a visitor who already has a stored decision a window in which the
 * container holds off rather than acting on the denied defaults it booted with.
 */
export function setConsentDefaults() {
  return pushConsentCommand('consent', 'default', {
    ...signalsFor({ analytics: false, marketing: false }),
    personalization_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  });
}

/**
 * Apply the visitor's actual decision.
 *
 * Called on every consent change, including a withdrawal - ConsentContext reloads the page
 * when a purpose is revoked, so in practice a withdrawal arrives here as a fresh page whose
 * defaults are denied and which never loads the container at all.
 */
export function updateConsent({ analytics = false, marketing = false } = {}) {
  return pushConsentCommand('consent', 'update', {
    ...signalsFor({ analytics, marketing }),
    personalization_storage: marketing ? 'granted' : 'denied',
  });
}
