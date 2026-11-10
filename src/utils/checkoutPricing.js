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
  // Set in the admin: Pricing & Rules → Deposit & Payment → Website Deposit.
  deposit: {
    enabled: false, type: 'percent', percent: 40, fixedAmount: 0, perPersonAmount: 0, minAmount: 0,
    balanceDueDaysBeforeDeparture: 42, products: { package: true, hotel: true, flight: false },
  },
  baggage: {
    enabled: true, placeholder: true,
    personalItem: { included: true, label: 'Personal item', note: 'A small bag that fits under the seat in front of you' },
    cabin: { enabled: true, label: 'Cabin baggage', note: 'A cabin bag stored in the overhead compartment', price: 25 },
    checked: [{ kg: 15, price: 25 }, { kg: 20, price: 35 }, { kg: 25, price: 45 }, { kg: 30, price: 55 }],
  },
};

/**
 * What one insurance option costs. Mirrors priceInsuranceOption on the server exactly — the
 * server re-computes this and rejects the booking if the two disagree, so any change here is
 * a change there.
 *
 * @param option  a block from pricing.insurance
 * @param ctx     { pax, nights, baseSubtotal } — pax excludes infants
 */
/**
 * How many days an insurance line is ACTUALLY charged for.
 *
 * EXPORTED SO THE SCREEN CANNOT CONTRADICT THE CHARGE. A one-way flight has no hotel nights,
 * so `booking.nights` is 0, and the insurance panel printed "0 reisdagen ... x 0 dagen" next
 * to a total of EUR 4. The price was never wrong: both this and the server's
 * `priceInsuranceOption` floor the count at one, and the server independently resolves a
 * dateless trip to 1 (`... || 1`). Only the label was reading the raw number.
 *
 * A single travel day is also the right answer rather than a fudge: the traveller is covered
 * for the day they fly, and insurance for zero days is not a thing anyone can buy.
 *
 * Changing this formula means changing `priceInsuranceOption` on the server with it, or the
 * booking is rejected for a price mismatch. Naming the existing floor, as here, does not.
 */
export const insuredDays = (nights) => Math.max(1, Number(nights) || 1);

export const priceInsurance = (option, { pax = 1, nights = 1, baseSubtotal = 0 } = {}) => {
  if (!option || option.enabled === false) return 0;
  const value = Number(option.value) || 0;
  const n = insuredDays(nights);
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

const cents = (v) => Math.round((Number(v) || 0) * 100);

/**
 * The first day of a trip: the earliest of the dates given ('YYYY-MM-DD', or a datetime), or
 * null. The server reads the same thing off the booking it creates: the earliest start date of
 * its products (the flight out, the check-in, the transfer).
 */
export const tripStartDate = (...dates) => {
  const days = dates.flat()
    .map((d) => String(d || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return days[0] || null;
};

/**
 * What kind of trip this is, for the deposit's product scope: 'package' (a flight with a stay),
 * 'hotel' (a stay, with or without a transfer), 'flight' (a flight without a stay), or null.
 * Mirrors depositKind on the server.
 */
export const depositKind = ({ flight = false, hotel = false } = {}) => {
  if (flight && hotel) return 'package';
  if (hotel) return 'hotel';
  if (flight) return 'flight';
  return null;
};

/**
 * The deposit due now, or null when there is none: deposits are off, this kind of trip is
 * excluded, the rule gives nothing useful (0, or the whole amount), or departure is too close for
 * a balance to fall due before it.
 *
 * MIRRORS computeDeposit on the server (website/services/checkoutPricing.service.js), which
 * re-computes it from the booking it creates and charges THAT: change both together, or the trip
 * page promises one deposit and the checkout charges another.
 *
 * @param pricing        the checkout config ({ deposit })
 * @param grandTotal     the whole trip price
 * @param departureDate  'YYYY-MM-DD' of the first service (flight out / check-in)
 * @param opts           { pax: paying travellers (babies do not pay), kind: depositKind(), today: 'YYYY-MM-DD' }
 * @returns { amount, balance, balanceDueDate, percent, type } | null
 */
export const computeDeposit = (pricing, grandTotal, departureDate, opts = {}) => {
  const d = pricing?.deposit;
  if (!d || !d.enabled) return null;
  const total = Number(grandTotal) || 0;
  if (!(total > 0)) return null;
  if (opts.kind && d.products && d.products[opts.kind] === false) return null;

  const type = d.type || 'percent';
  let raw = 0;
  if (type === 'fixed') raw = Number(d.fixedAmount) || 0;
  else if (type === 'perPerson') raw = (Number(d.perPersonAmount) || 0) * Math.max(1, Number(opts.pax) || 1);
  else {
    const pct = Number(d.percent) || 0;
    if (pct <= 0 || pct >= 100) return null;
    raw = total * (pct / 100);
  }
  const amount = Math.max(Math.round(Number(d.minAmount) || 0), Math.round(raw));
  // A deposit of the whole price (or more) is no deposit: the customer simply pays in full.
  if (!(amount > 0) || cents(amount) >= cents(total)) return null;

  let balanceDueDate = null;
  const days = Number(d.balanceDueDaysBeforeDeparture) || 0;
  if (departureDate && days > 0) {
    const dep = new Date(`${String(departureDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(dep.getTime())) {
      dep.setUTCDate(dep.getUTCDate() - days);
      // The server's "today" is the UTC date; using the same one keeps the two in step.
      const today = opts.today ? String(opts.today).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const due = dep.toISOString().slice(0, 10);
      // A balance already due is not a payment plan: the whole amount is due now.
      if (due > today) balanceDueDate = due;
      else return null;
    }
  }
  return {
    amount,
    balance: (cents(total) - cents(amount)) / 100,
    balanceDueDate,
    percent: type === 'percent' && cents(amount) === cents(Math.round(raw))
      ? Number(d.percent)
      : Math.round((amount / total) * 1000) / 10,
    type,
  };
};

export default { DEFAULT_PRICING, priceInsurance, priceBasisLabel, computeDeposit, depositKind, insuredDays };
