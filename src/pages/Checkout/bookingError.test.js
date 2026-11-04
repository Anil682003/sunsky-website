import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import nlCheckout from '../../i18n/locales/nl/checkout.json';
import enCheckout from '../../i18n/locales/en/checkout.json';
import { bookingErrorMessage } from './bookingError';

// The server answers a refused booking with a 409 and an errorCode. On 4 Nov 2026 Airtuerk's price
// service was down, every Antalya package was refused, and the customer read the server's English
// "Prices have changed ... refresh" and retried a booking that could not pass.

const refused = (data) => ({ response: { status: 409, data } });
const t = (key, fallback) => fallback; // the English defaults in the component
const tNl = i18n.createInstance();
await tNl.init({ lng: 'nl', resources: { nl: { checkout: nlCheckout }, en: { checkout: enCheckout } }, defaultNS: 'checkout' });

describe('the message after a refused booking', () => {
  it('a flight nobody could price says the airline cannot confirm it and to try again later', () => {
    const err = refused({
      errorCode: 'PRICE_UNVERIFIED',
      message: 'The price could not be confirmed with the supplier right now.',
      errors: [{ product: 'Flight', clientPrice: 536, serverPrice: null, reason: 'Airtuerk: AirTurk servisi şu anda yanıt vermiyor' }],
    });
    expect(bookingErrorMessage(err, t)).toMatch(/airline can't confirm this flight's price.*not been charged.*few minutes/);
    expect(bookingErrorMessage(err, tNl.t.bind(tNl))).toBe(
      'De luchtvaartmaatschappij kan de prijs van deze vlucht op dit moment niet bevestigen. Er is niets afgeschreven. Probeer het over een paar minuten opnieuw.',
    );
  });

  it('another part nobody could price names the supplier, not the airline', () => {
    const err = refused({ errorCode: 'PRICE_UNVERIFIED', errors: [{ product: 'Hotel', clientPrice: 63, serverPrice: null }] });
    expect(bookingErrorMessage(err, tNl.t.bind(tNl))).toMatch(/^De leverancier kan de prijs/);
  });

  it('a changed price asks for a refresh, in Dutch', () => {
    const err = refused({ errorCode: 'PRICE_CHANGED', message: 'Prices have changed or could not be verified. Please refresh and try again.', errors: [{ product: 'Insurance (cancel)', clientPrice: 38, serverPrice: 35 }] });
    expect(bookingErrorMessage(err, tNl.t.bind(tNl))).toBe('De prijs van deze reis is gewijzigd. Er is niets afgeschreven. Vernieuw de pagina om de actuele prijs te zien.');
  });

  it('any other failure keeps the old text: the server message, then the error, then the generic line', () => {
    expect(bookingErrorMessage(refused({ message: 'Customer details are required' }), t)).toBe('Customer details are required');
    expect(bookingErrorMessage(new Error('Your card was declined.'), t)).toBe('Your card was declined.');
    expect(bookingErrorMessage(undefined, t)).toBe('Payment failed. Please try again.');
  });
});
