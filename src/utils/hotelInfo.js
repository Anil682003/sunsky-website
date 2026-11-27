/**
 * "Belangrijke informatie van het hotel": the one information box per hotel (Levent, 27 Nov 2026).
 *   Mandatory Local Taxes, Charges & Deposits V1.1 FINAL   local charges + deposit
 *   Destination Hotel Transfer Notice V1.2 FINAL           the general hotel transfer notice
 *
 * The admin decides the data (its hotelInfo.js): the live rate check answers `localCharges`
 * `{ state, totals: [{ amount, currency }] , source }`, and `/hotel-availability/hotel-info`
 * answers `{ live, notice: { nl, en }, deposit }`. This turns them into the sections the box shows,
 * as i18n keys; nothing here adds, converts or guesses an amount.
 *
 * Pure: no React, no network.
 */
import { moneyFull } from './money';

export const LC_STATE = Object.freeze({
  CONFIRMED: 'confirmed', PARTIAL: 'partial', UNKNOWN: 'unknown', NONE: 'none', NO_INFO: 'noInfo', PENDING: 'pending',
});

/** Before the live check of the selected rate: never "none", never an amount. */
export const pendingCharges = (supplier = null) => ({ state: LC_STATE.PENDING, totals: [], source: supplier ? String(supplier).toLowerCase() : null });

/** The local charges of a rate as known on the page: the check's answer, else pending (Diana: no information). */
export function chargesOfRate({ supplier, checked } = {}) {
  if (checked && typeof checked === 'object' && checked.state) return checked;
  const s = String(supplier || 'hotelbeds').toLowerCase();
  if (s === 'diana') return { state: LC_STATE.NO_INFO, totals: [], source: 'diana' };
  return pendingCharges(s);
}

const validTotals = (lc) => (Array.isArray(lc?.totals) ? lc.totals : [])
  .filter((t) => t && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0 && typeof t.currency === 'string');

/**
 * PURE. The sections of the box, in order: local taxes and charges · security deposit · transfer
 * notice. Each line is { key, money? } for i18n (namespace common, `hotelInfo.*`), or { text } for
 * the admin's own notice text. An empty array means no box (V1.1 05 "hide box if empty").
 * @param {{ localCharges?: object, deposit?: object, notice?: {nl:string,en:string}, lang?: 'nl'|'en' }} info
 */
export function hotelInfoSections({ localCharges = null, deposit = null, notice = null, lang = 'nl' } = {}) {
  const out = [];
  const lc = localCharges;
  if (lc) {
    const totals = validTotals(lc);
    if (lc.state === LC_STATE.CONFIRMED && totals.length) {
      out.push({ key: 'local', lines: totals.map((t) => ({ key: 'hotelInfo.total', money: t })), note: 'hotelInfo.notIncluded' });
    } else if (lc.state === LC_STATE.PARTIAL && totals.length) {
      out.push({ key: 'local', lines: [...totals.map((t) => ({ key: 'hotelInfo.known', money: t })), { key: 'hotelInfo.furtherUnknown' }], note: 'hotelInfo.notIncluded' });
    } else if (lc.state === LC_STATE.UNKNOWN) {
      out.push({ key: 'local', lines: [{ key: 'hotelInfo.unknown' }] });
    } else if ((lc.state === LC_STATE.NO_INFO || lc.state === LC_STATE.PENDING) && lc.source !== 'diana') {
      out.push({ key: 'local', lines: [{ key: 'hotelInfo.generic' }] });
    }
  }
  if (deposit?.required) {
    const money = Number(deposit.amount) > 0 && deposit.currency ? { amount: Number(deposit.amount), currency: deposit.currency } : null;
    const both = deposit.creditCard && deposit.onArrival !== false;
    const key = deposit.creditCard
      ? (money ? 'hotelInfo.depositBothAmount' : (both ? 'hotelInfo.depositBoth' : 'hotelInfo.depositCard'))
      : (money ? 'hotelInfo.depositAmount' : 'hotelInfo.depositUnknown');
    out.push({ key: 'deposit', lines: [{ key, money }] });
  }
  const text = notice ? (lang === 'en' ? notice.en : notice.nl) : null;
  if (typeof text === 'string' && text.trim()) {
    out.push({ key: 'notice', lines: text.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => ({ text: p })) });
  }
  return out;
}

/**
 * PURE. The SUNSKY notation in both languages, as every other price on the site (Price Display
 * brief; utils/money.js): "€ 84,00", "USD 168,00". Kept to the cent, never rounded or converted.
 */
export function localMoney(amount, currency) {
  return moneyFull(amount, { currency: String(currency || 'EUR').toUpperCase() }) || '';
}

/** PURE. Splits text into plain parts and e-mail addresses, so a notice's address can be a link. */
export function withEmailLinks(text) {
  const parts = [];
  const str = String(text ?? '');
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  let last = 0;
  for (const m of str.matchAll(re)) {
    if (m.index > last) parts.push({ text: str.slice(last, m.index) });
    parts.push({ email: m[0] });
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push({ text: str.slice(last) });
  return parts;
}
