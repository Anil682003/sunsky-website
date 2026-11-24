/**
 * The text the checkout shows when paying fails. The server's own `message` is English, so a
 * refusal it explains with an `errorCode` gets the reader's language instead:
 *
 *   PRICE_UNVERIFIED  a supplier could not price a part at all (4 Nov 2026: Airtuerk's price
 *                     service was down for every Antalya charter). Nothing changed and the
 *                     customer was not charged; trying again later is what helps.
 *   PRICE_CHANGED     a supplier priced a part differently; the page has to show the new price.
 *   DEPOSIT_UNAVAILABLE  the customer chose a deposit the server no longer offers for this trip
 *                     (the rule changed, or the balance would already be due): pay in full.
 *   PROMOTION_CHANGED SUNSKY would grant a different discount than the page showed (dates,
 *                     travellers or price changed, a code was used up): the page now shows the
 *                     new price, and the next click pays exactly that.
 *
 * Both refusals come from creating the booking, before any payment, so "not charged" is true.
 * Anything else keeps the old behaviour: the server's message, the error's, or a generic line.
 */
export function bookingErrorMessage(err, t) {
  const data = err?.response?.data || {};
  if (data.errorCode === 'PRICE_UNVERIFIED') {
    const flight = Array.isArray(data.errors) && data.errors.some((e) => e?.product === 'Flight');
    return flight
      ? t('checkout:errors.flightPriceUnverified', "The airline can't confirm this flight's price right now. You have not been charged. Please try again in a few minutes.")
      : t('checkout:errors.priceUnverified', "The supplier can't confirm the price right now. You have not been charged. Please try again in a few minutes.");
  }
  if (data.errorCode === 'PRICE_CHANGED') {
    return t('checkout:errors.priceChanged', 'The price of this trip has changed. You have not been charged. Refresh the page to see the current price.');
  }
  if (data.errorCode === 'PROMOTION_CHANGED') {
    return t('checkout:errors.promotionChanged', 'The discount on this trip has changed. You have not been charged. Check the new total and confirm again.');
  }
  if (data.errorCode === 'BOOKER_UNDER_18') {
    return t('checkout:validation.bookerUnder18', 'The main booker must be at least 18 years old. Travellers under 18 can travel with you, but cannot make the booking.');
  }
  if (data.errorCode === 'BOOKER_DOB_REQUIRED') {
    return t('checkout:validation.bookerDobRequired', "The main booker's date of birth is required");
  }
  if (data.errorCode === 'REMARKS_CHANGED') {
    return t('checkout:errors.remarksChanged', "The hotel's information for this room has changed. You have not been charged. Please read it below and confirm again.");
  }
  if (data.errorCode === 'DEPOSIT_UNAVAILABLE') {
    return t('checkout:errors.depositUnavailable', 'A deposit is no longer possible for this trip. You have not been charged. Please pay the full amount to book it.');
  }
  return data.message || err?.message || t('checkout:errors.paymentFailed', 'Payment failed. Please try again.');
}
