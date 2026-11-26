/**
 * THE price notation of the website (SUNSKY Frontend Price Display brief, 26 Nov 2026).
 *
 * One standard on sunsky.be and sunsky.nl, desktop and mobile, whatever the interface language:
 *   - a space after €, a comma for decimals, a period for thousands: € 100,00 · € 10.000,00
 *   - discounts as −€ 50,00 (a real minus sign, before the euro sign)
 *   - the space is a NO-BREAK space, so "€ 2.587,00" never splits over two lines
 *
 * Two decimal styles, chosen by WHERE the price is shown, never by the amount:
 *   compact  cards, hotel headline, calendars, date strip, live headline and change badge:
 *            whole euros without ",00", cents with two digits      → € 647 · € 647,50
 *   full     breakdowns, add-ons, cart, checkout, payment, booking summary: always two decimals
 *                                                                   → € 647,00 · € 2.587,00
 *
 * This file FORMATS only. It never rounds a price up, adds a margin or recalculates anything:
 * the amount it is given is the amount it shows (to the cent). Which amount that is stays the
 * caller's business (the backend's, per the brief).
 */

export const NBSP = ' ';
export const MINUS = '−';

const SYMBOLS = { EUR: '€', '€': '€' };
const NUMBER = {
  compactWhole: new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  two: new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** A finite number, or null. A missing price must never print as € 0. */
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Cents settled first, so float noise (646.9999999) never shows as € 647,00 vs € 646,99. */
const toCents = (n) => Math.round(n * 100);

/** The digits only, "2.587,00" / "647": for the rare place that lays the symbol out itself. */
export function formatAmount(amount, style = 'full') {
  const n = num(amount);
  if (n == null) return null;
  const c = Math.abs(toCents(n));
  const value = c / 100;
  if (style === 'compact' && c % 100 === 0) return NUMBER.compactWhole.format(value);
  return NUMBER.two.format(value);
}

/**
 * "€ 2.587,00" (full) or "€ 647" / "€ 647,50" (compact). Negative amounts get "−€ …".
 *
 * @param amount   number (or numeric string)
 * @param opts.style     'full' (default) | 'compact'
 * @param opts.currency  'EUR' (default) or a symbol; another code prints as "USD 12,00"
 * @param opts.sign      true: a positive amount gets "+€ …" (change badges)
 * @returns the formatted price, or null when there is no amount
 */
export function formatMoney(amount, { style = 'full', currency = 'EUR', sign = false } = {}) {
  const n = num(amount);
  if (n == null) return null;
  const digits = formatAmount(n, style);
  const symbol = SYMBOLS[currency] || String(currency || '€');
  const negative = toCents(n) < 0;
  const prefix = negative ? MINUS : (sign && toCents(n) > 0 ? '+' : '');
  return `${prefix}${symbol}${NBSP}${digits}`;
}

/** Cards, headline, calendars, badges: € 647 / € 647,50. */
export const moneyCompact = (amount, opts = {}) => formatMoney(amount, { ...opts, style: 'compact' });

/** Breakdowns, cart, checkout, payment, booking: € 647,00 / € 2.587,00. */
export const moneyFull = (amount, opts = {}) => formatMoney(amount, { ...opts, style: 'full' });

/** A discount line, always negative and always two decimals: −€ 50,00 (whatever sign it arrives with). */
export const moneyDiscount = (amount, opts = {}) => {
  const n = num(amount);
  return n == null ? null : formatMoney(-Math.abs(n), { ...opts, style: 'full' });
};

export default formatMoney;
