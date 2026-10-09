/**
 * The checkout hand-off object, mapped to the marketing layer's context.
 *
 * ONE MAPPER, THREE CALL SITES: `begin_checkout` in Checkout.jsx, and `purchase` in both
 * Checkout.jsx (card, paid inline) and CheckoutReturn.jsx (Bancontact / iDEAL / PayPal, paid
 * after a redirect). The two purchase paths used to be the obvious place for the product
 * dimension to drift apart, so neither builds its own context.
 *
 * Tracking Master §3: "Tracking must automatically use existing data from SearchContext,
 * Selected Product, Selected Offer, Checkout and Confirmed Booking. Developers must not
 * create duplicate manual Google Ads fields for information already available in SUNSKY."
 * Everything below is read off the booking the checkout already has.
 */

import { countryName } from '../utils/countryName';
import { stayDays, packageTravelDays } from '../utils/durations';

/**
 * @param {object} booking the `state.booking` the checkout was opened with
 * @param {object} extra   `{ value, transactionId }` - the money and the booking reference,
 *                         which the booking object itself does not carry
 */
export function contextFromBooking(booking, extra = {}) {
  const b = booking || {};
  const s = b.search || {};

  // 'flight' | 'transfer' | undefined, passed straight through: `productType()` owns the
  // decision, including returning null for a transfer rather than mislabelling it.
  const kind = b.kind;
  const transport = s.transport
    || (b.flight ? 'package' : 'hotel_only');
  const isPackage = transport === 'package' && kind !== 'flight';

  const checkIn = s.checkin || null;
  const checkOut = s.checkout || null;

  // SUNSKY's own duration helpers, never a subtraction done here (§5).
  let duration = null;
  if (checkIn && checkOut) {
    duration = isPackage ? packageTravelDays(checkIn, checkOut) : stayDays(checkIn, checkOut);
  } else if (Number(b.nights) > 0) {
    // A hand-off that carried only a night count. Stay days are nights + 1 for hotel only;
    // for a package the travel days are not derivable from nights without the flight times,
    // so nothing is reported rather than a number that would be wrong for a red-eye return.
    duration = isPackage ? null : Number(b.nights) + 1;
  }

  return {
    kind,
    transport,
    country: b.countryIso ? countryName(b.countryIso, 'en', b.countryIso) : null,
    destination: b.cityName || b.loc || s.destination || null,
    hotelCode: b.hotelCode || null,
    hotelName: b.hotelName || null,
    // §5 and §16: for HOTEL_ONLY this IS the check-in date, which is the same field.
    departureDate: checkIn,
    departureAirport: s.origin || null,
    duration,
    adults: Number(s.adults) || null,
    children: Number(s.children) || 0,
    // The board the supplier actually quoted, which is what will be booked.
    board: s.boardCode || b.board || null,
    // FLIGHT_ONLY: no stable SUNSKY flight product id exists today, so §17's fallback applies
    // and `ecommerceItem()` builds "BRU-Barcelona" from the route instead of inventing one.
    flightProductId: null,
    ...extra,
  };
}
