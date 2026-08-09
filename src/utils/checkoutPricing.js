/**
 * The prices SUNSKY sets itself at checkout — insurance, baggage, the booking fee — and the
 * deposit rule, as configured in the admin dashboard.
 *
 * These used to be two hardcoded catalogues, one here and one in the backend's price
 * validator, which had to be edited and deployed together or every booking came back
 * PRICE_CHANGED. Both now read one record; this module is the website's copy of the shape and
 * the arithmetic, so a page can price an option without a round trip per keystroke.
 *
 * The DEFAULTS below exist for one reason: the checkout must still work when the config call
 * fails. They mirror the server's own defaults — if you change one, change both.
 */

export const DEFAULT_PRICING = {
  insurance: {
    cancellation: { id: 'cancel', enabled: true, provider: 'Allianz', label: 'Allianz cancellation insurance', description: 'Cancellation insurance for all travellers', mode: 'percent', value: 6, scope: 'party' },
    travel: { id: 'travel', enabled: true, provider: 'Allianz', label: 'Allianz travel insurance', description: 'Travel insurance, per traveller per day', mode: 'perPersonPerDay', value: 4, scope: 'traveller' },
    allin: { id: 'allin', enabled: true, provider: 'Allianz', label: 'All-in protection', description: 'Cancellation and travel insurance combined', mode: 'percent', value: 8.5, scope: 'party' },
  },
  deposit: { enabled: false, percent: 40, balanceDueDaysBeforeDeparture: 42, minAmount: 0 },
  baggage: {
    enabled: true, placeholder: true,
    personalItem: { included: true, label: 'Personal item', note: 'A small bag that fits under the seat in front of you' },
    cabin: { enabled: true, label: 'Cabin baggage', note: 'A cabin bag stored in the overhead compartment', price: 25 },
    checked: [{ kg: 15, price: 25 }, { kg: 20, price: 35 }, { kg: 25, price: 45 }, { kg: 30, price: 55 }],
  },
  fees: { serviceFee: 20 },
};

/**
 * What one insurance option costs. Mirrors priceInsuranceOption on the server exactly — the
 * server re-computes this and rejects the booking if the two disagree, so any change here is
 * a change there.
 *
 * @param option  a block from pricing.insurance
 * @param ctx     { pax, nights, baseSubtotal } — pax excludes infants
 */
export const priceInsurance = (option, { pax = 1, nights = 1, baseSubtotal = 0 } = {}) => {
  if (!option || option.enabled === false) return 0;
  const value = Number(option.value) || 0;
  const n = Math.max(1, Number(nights) || 1);
  const p = Math.max(1, Number(pax) || 1);
  switch (option.mode) {
    case 'perPersonPerDay': return Math.max(0, Math.round(value * p * n));
    case 'perPerson':       return Math.max(0, Math.round(value * p));
    case 'fixed':           return Math.max(0, Math.round(value));
    case 'percent':
    default:                return Math.max(0, Math.round((Number(baseSubtotal) || 0) * (value / 100)));
  }
};

/** How an option's price reads under its name: "€4.00 per traveller per day", "6% of your trip". */
export const priceBasisLabel = (option, ccy = '€') => {
  if (!option) return '';
  const v = Number(option.value) || 0;
  switch (option.mode) {
    case 'perPersonPerDay': return `${ccy}${v.toFixed(2)} per traveller, per day`;
    case 'perPerson':       return `${ccy}${v.toFixed(2)} per traveller`;
    case 'fixed':           return `${ccy}${Math.round(v)} for the whole booking`;
    case 'percent':
    default:                return `${v}% of your trip`;
  }
};

/**
 * The deposit due now, or null when deposits are off / would not help.
 * Mirrors computeDeposit on the server.
 */
export const computeDeposit = (pricing, grandTotal, departureDate) => {
  const d = pricing?.deposit;
  if (!d || !d.enabled) return null;
  const pct = Number(d.percent) || 0;
  if (pct <= 0 || pct >= 100) return null;
  const amount = Math.max(Number(d.minAmount) || 0, Math.round((Number(grandTotal) || 0) * (pct / 100)));
  if (!(amount > 0) || amount >= grandTotal) return null;
  let balanceDueDate = null;
  const days = Number(d.balanceDueDaysBeforeDeparture) || 0;
  if (departureDate && days > 0) {
    const dep = new Date(`${String(departureDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(dep.getTime())) {
      dep.setUTCDate(dep.getUTCDate() - days);
      // A balance date already in the past is not a payment plan — the whole amount is due.
      if (dep.getTime() > Date.now()) balanceDueDate = dep.toISOString().slice(0, 10);
      else return null;
    }
  }
  return { amount, balance: Math.round((Number(grandTotal) || 0) - amount), balanceDueDate, percent: pct };
};

export default { DEFAULT_PRICING, priceInsurance, priceBasisLabel, computeDeposit };
