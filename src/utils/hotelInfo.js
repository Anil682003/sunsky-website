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

// A no-break space and the euro sign, written as char codes so no editor or tool can alter them:
// "€ 84,00" never breaks across lines.
const NBSP = String.fromCharCode(160);
const EURO = String.fromCharCode(8364);

/** PURE. "€ 84,00" / "USD 168,00" (nl), "€84.00" / "USD 168.00" (en). Kept to the cent, never rounded. */
export function localMoney(amount, currency, lang = 'nl') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const nl = lang !== 'en';
  const s = n.toLocaleString(nl ? 'nl-BE' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const c = String(currency || 'EUR').toUpperCase();
  if (c === 'EUR') return nl ? `${EURO}${NBSP}${s}` : `${EURO}${s}`;
  return `${c}${NBSP}${s}`;
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
