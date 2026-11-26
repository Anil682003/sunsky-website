/* ═══════════════════════════════════════════════════════════════════════════
   Checkout Terms & Conditions (SUNSKY spec V1.3 FINAL): talking to the server.

   The server decides the whole "Garantie en voorwaarden" section: which documents apply to
   this booking (legal booking type, airlines, extras, Allianz products, market, language),
   the approved wording and which checkboxes are mandatory. The page renders it as given and
   returns its `termsKey` with the acceptance, so the server can tell whether what the customer
   accepted is still what applies (TERMS_CHANGED when it is not).
   ═══════════════════════════════════════════════════════════════════════════ */
import axiosInstance from '../../services/axiosInstance';

/** The terms view for a booking body; null when the server sent nothing usable. */
export const fetchCheckoutTerms = (body) =>
  axiosInstance.post('/website/checkout-terms', body).then((res) => res?.data?.data || null);

const CARRIER_FIELDS = ['airline', 'airlineCode', 'marketingCarrier', 'marketingAirline', 'carrier', 'operatingAirline', 'operatingCarrier', 'operatingAirlineCode'];

/** The refusals that come with fresh terms attached and need a fresh acceptance. */
export const TERMS_ERROR_CODES = ['TERMS_CHANGED', 'ACCEPTANCE_REQUIRED', 'INSURANCE_ACCEPTANCE_REQUIRED', 'TERMS_UNAVAILABLE'];

/**
 * What the terms depend on, in the shape POST /online-bookings takes, so the section always
 * matches what will actually be booked. Prices are left out: they do not change which
 * conditions apply, and leaving them out keeps the request stable while a price is re-checked.
 */
export function termsRequestBody({ flight, hotel, transfer, insurances = [], extras = [], supportPackage = null, language }) {
  return {
    // Every carrier field the server reads, as the booking will carry them: a field dropped here
    // would make the server see another airline at booking time and ask for fresh acceptance.
    flight: flight ? { legs: (flight.legs || []).map((l) => Object.fromEntries(
      CARRIER_FIELDS.filter((k) => l?.[k] != null && l[k] !== '').map((k) => [k, l[k]]),
    )) } : null,
    hotel: hotel ? { supplier: hotel.supplier || null, supplierCode: hotel.supplierCode || null } : null,
    transfer: transfer ? { selected: true } : null,
    insurances: insurances.map((i) => ({ type: i.type })),
    extras: extras.map((e) => ({ code: e.code })),
    supportPackage: supportPackage?.code ? { code: supportPackage.code } : null,
    language,
  };
}

const SESSION_KEY = 'sunsky.checkoutSession.v1';

/** One id per checkout visit (tab), so a fresh acceptance can point at the one it replaces. */
export function checkoutSessionId() {
  const make = () => (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  try {
    const have = sessionStorage.getItem(SESSION_KEY);
    if (have) return have;
    const id = make();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return make();
  }
}

/** "Boek en betaal {amount}" with the amount payable now (never a hardcoded example). */
export const payButtonText = (template, amountText) =>
  String(template || 'Boek en betaal {amount}').replace('{amount}', amountText);
