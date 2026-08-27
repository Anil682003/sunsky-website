/**
 * Trustpilot TrustBox configuration — the single place the business-unit id is read.
 *
 * NOTHING RENDERS UNTIL THE ID IS SET. There is no placeholder rating, no sample star count,
 * no "4.8 from 2,300 reviews" waiting to be swapped out. A review score is a real company's
 * real reputation; inventing one to fill a gap in a layout would be fabricating it.
 */

/**
 * Set on the SERVER, not here. `.env` and `.env.production` are tracked in git and the
 * server's copies are authoritative (see .claude/CLAUDE.md standing rules), so the variable is
 * added there and the site rebuilt — Vite bakes it in at build time, so a `pm2 restart` alone
 * will not pick it up.
 */
export const BUSINESS_UNIT_ID = String(import.meta.env.VITE_TRUSTPILOT_BU_ID || '').trim();

/** The dormancy gate. `REPLACE` mirrors how Checkout.jsx skips a placeholder Stripe key. */
export const TRUSTPILOT_ENABLED =
  BUSINESS_UNIT_ID !== '' && !/REPLACE/i.test(BUSINESS_UNIT_ID);

// The likeliest mistake by far is pasting the TEMPLATE id — same 24-hex shape — into the
// business-unit slot, which renders nothing and looks exactly like "not configured yet". Warn
// in development only, and never hard-fail: Trustpilot does not document the id format, so
// rejecting on shape could reject a valid id.
if (import.meta.env.DEV && BUSINESS_UNIT_ID && !/^[0-9a-f]{24}$/i.test(BUSINESS_UNIT_ID)) {
  console.warn(
    `[trustpilot] VITE_TRUSTPILOT_BU_ID is "${BUSINESS_UNIT_ID}", which is not the usual `
    + '24-character form. If the widget stays blank, check you copied the business unit id '
    + 'and not the template id.',
  );
}

/**
 * TrustBox templates.
 *
 * Trustpilot publishes no public table of these. `microStar` was read out of Trustpilot's own
 * shipped bundle, where the template self-registers as `{name:"MicroStar"}` — as verified as
 * it gets without dashboard access, but NOT authoritative. If the widget stays blank with a
 * correct business-unit id, compare this against the snippet in Trustpilot Business →
 * Share & promote → Website widgets → Micro Star → Get code, and change the one string.
 *
 * Micro Star is also plan-gated (Plus and above). A correct id on too small a plan looks
 * identical to a misconfiguration.
 */
export const TEMPLATES = {
  // The only one this account can actually use today. Verified by asking Trustpilot's own
  // widget data endpoint for every template: this is the single one that answers with the
  // business's data instead of "BusinessUnit does not have access to that trustbox".
  reviewCollector: '56278e9abfbbba0bdcd568bc',
  // Score widgets. All of these need a PAID plan; on the free plan Trustpilot serves its own
  // bare logo instead, which shows no rating and links to trustpilot.com rather than the
  // agency's profile. Kept here so switching one on is a one-line change, not a rewrite.
  microStar: '5419b732fbfb950b10de65e5',
  microCombo: '5419b6ffb0d04a076446a9af',
  horizontal: '5406e65db0d04a09e042d5fc',
};

/**
 * Which widget may show the TrustScore and stars — EMPTY until the plan allows one.
 *
 * Trustpilot gates score widgets behind a paid plan and, rather than failing, quietly serves a
 * logo with no rating on it. That is worse than showing nothing: it takes up a slot, says
 * nothing about the agency, and its link goes to Trustpilot's homepage. So no score widget is
 * rendered at all until this names one.
 *
 * When the plan is upgraded, set VITE_TRUSTPILOT_SCORE_TEMPLATE to a key from TEMPLATES
 * (`microStar` is the one the agency picked) and rebuild. Nothing else changes.
 */
export const SCORE_TEMPLATE = String(import.meta.env.VITE_TRUSTPILOT_SCORE_TEMPLATE || '').trim();

/**
 * MANDATORY on the container: the TrustBox constructor throws a bare string, "No locale
 * supplied for TrustBox", without it. `en-GB` because the site is English (<html lang="en">,
 * og:locale en_GB). `nl-BE` and `fr-BE` exist too, so a Dutch/French split is a one-prop change.
 */
export const DEFAULT_LOCALE = 'en-GB';

/**
 * The Trustpilot profile these reviews belong to.
 *
 * NOT holidaybooking.be. The agency's reviewed profile is sunsky.be — "Sunsky Vliegvakanties",
 * claimed by BVBA Sunsky Belgium, which is where their reviews actually live. holidaybooking.be
 * has an auto-generated Trustpilot page of its own with no reviews on it at all, so linking
 * there would send a traveller to an empty profile.
 *
 * It has to match whichever business unit VITE_TRUSTPILOT_BU_ID names: the widget shows one
 * profile's score and this link must open that same profile, or the two contradict each other.
 */
export const REVIEW_DOMAIN = String(import.meta.env.VITE_TRUSTPILOT_DOMAIN || 'sunsky.be').trim();

/** Where the fallback link goes when the script is blocked or has not loaded yet. */
export const REVIEW_URL = `https://nl-be.trustpilot.com/review/${REVIEW_DOMAIN}`;

/**
 * Explicit `https:`, not the protocol-relative `//` in Trustpilot's own docs — protocol-
 * relative is wrong for a script injected through createElement.
 */
export const BOOTSTRAP_SRC = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
