// The whole-euro rules for online Flight + Hotel, Hotel Only and Flight Only bookings (Levent,
// 26 Nov 2026, update to the Price Display specification). roundUpForParty and roundUpLine are a
// VERBATIM copy of the admin's services/pricing/partyRounding.js: the checkout shows what the
// server charges only while the two agree to the cent.
//
//   - After the live check, the base offer (flight + hotel, after its discount) goes up to the
//     smallest whole-euro amount that divides by the travellers, infants included: € 409,61 for 2
//     -> € 410 (€ 205 p.p.); € 964 for 2 stays € 964.
//   - Each paid extra's line goes up to a whole euro once, then is added: € 964 + € 29,99 -> € 994.
//   - That sum is the final amount for checkout, payment and confirmation.
//
// On when the page carries <meta name="sunsky-party-rounding" content="on"> (the site server
// writes it from the admin's PRICE_PARTY_ROUNDING, server/pricingRounding.js). Off: every amount
// as before.

const META = 'sunsky-party-rounding';
let forced = null;

/** Whether the whole-euro rules apply on this page. */
export function partyRoundingActive() {
  if (forced != null) return forced;
  if (typeof document === 'undefined') return false;
  return document.querySelector(`meta[name="${META}"]`)?.getAttribute('content') === 'on';
}

/** Tests only: force the switch (null: back to the page's tag). */
export function setPartyRoundingForTest(on) { forced = on == null ? null : !!on; }

const cents = (x) => Math.round(Number(x) * 100);

/**
 * PURE. The base offer for the party: up to whole euros, then up to the next multiple of the
 * number of travellers (infants included). Zero or less, or not a number: returned unchanged
 * (nothing to round up).
 */
export function roundUpForParty(amount, travellers) {
  const c = cents(amount);
  if (!Number.isFinite(c) || c <= 0) return Number.isFinite(Number(amount)) ? Number(amount) : amount;
  const n = Math.max(1, Math.floor(Number(travellers)) || 1);
  const euros = Math.ceil(c / 100);
  return Math.ceil(euros / n) * n;
}

/** PURE. One paid extra's line, up to a whole euro. Zero or less stays as it is. */
export function roundUpLine(amount) {
  const c = cents(amount);
  if (!Number.isFinite(c) || c <= 0) return Number.isFinite(Number(amount)) ? Number(amount) : amount;
  return Math.ceil(c / 100);
}

/** The base offer as charged: rounded for the party when the rules are on, else as it was. */
export const baseForParty = (amount, travellers) => (partyRoundingActive() ? roundUpForParty(amount, travellers) : amount);

/** One extra's line as charged: up to a whole euro when the rules are on, else as it was. */
export const extraLine = (amount) => (partyRoundingActive() ? roundUpLine(amount) : amount);
