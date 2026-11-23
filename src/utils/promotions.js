// Promotions & Discounts (SUNSKY spec v1.2, 23 Nov 2026), the website side.
//
// The website never works a discount out itself: every page asks the admin's ONE central
// calculation (POST /website/promotions/quote) and shows what it answers, so the hotel page,
// the checkout and the confirmation always agree. When SUNSKY accepts the booking it decides
// again from its own verified prices; if that differs, the checkout is told (PROMOTION_CHANGED)
// and shows the new price before anyone pays.
import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

export const PROMOTION_QUOTE_URL = '/website/promotions/quote';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ask for the promotion. Never throws: "no promotion" is always a valid answer. */
export async function quotePromotion(input) {
  try {
    const { data } = await axiosInstance.post(PROMOTION_QUOTE_URL, input);
    return data?.data || { applied: null, code: null };
  } catch {
    return { applied: null, code: null, unavailable: true };
  }
}

/** The booking's product as promotions know it ('package' | 'hotel' | 'flight' | null). */
export function promotionProduct({ hasFlight, hasHotel }) {
  if (hasFlight && hasHotel) return 'package';
  if (hasHotel) return 'hotel';
  if (hasFlight) return 'flight';
  return null;
}

/**
 * The discount the page shows, kept in step with the trip: asked again (debounced) whenever
 * anything that decides it changes. `input` null = nothing to ask (no reliable price yet).
 * Returns { applied, code, loading }.
 */
export function usePromotionQuote(input, { delay = 350 } = {}) {
  const [state, setState] = useState({ applied: null, code: null, loading: false });
  const key = input ? JSON.stringify(input) : '';
  const seq = useRef(0);
  useEffect(() => {
    if (!key) {
      setState({ applied: null, code: null, loading: false });
      return undefined;
    }
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      const r = await quotePromotion(JSON.parse(key));
      if (mine === seq.current) setState({ applied: r.applied || null, code: r.code || null, loading: false });
    }, delay);
    return () => clearTimeout(t);
  }, [key, delay]);
  return state;
}

/** The input for a quote, or null when the price is not reliably known. */
export function promotionInput({
  product, hotelCode, arrivalAirport, travelDate, travellers, eligiblePrice, eligibleCost, code, email,
}) {
  const price = num(eligiblePrice);
  if (!product || !(price > 0)) return null;
  const cost = num(eligibleCost);
  return {
    product,
    hotelCode: hotelCode != null && hotelCode !== '' ? String(hotelCode) : null,
    arrivalAirport: arrivalAirport ? String(arrivalAirport).toUpperCase() : null,
    travelDate: travelDate ? String(travelDate).slice(0, 10) : null,
    travellers: Math.max(0, Number(travellers) || 0),
    eligiblePrice: Math.round(price * 100) / 100,
    eligibleCost: cost != null && cost >= 0 ? Math.round(cost * 100) / 100 : null,
    code: code ? String(code).trim() : '',
    email: email ? String(email).trim() : '',
  };
}

const EUR = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "−€ 123,40": the discount line's amount, always with cents (spec §5 "−€XX.XX"). */
export const formatDiscount = (amount) => `−€ ${EUR.format(Math.abs(Number(amount) || 0))}`;

/** A total after a discount: whole euros stay whole, a total with cents shows them. */
export const formatTotal = (amount, { locale = 'nl-BE', symbol = '€' } = {}) => {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const whole = Number.isInteger(n);
  return `${symbol}${new Intl.NumberFormat(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n)}`;
};

/** Round to cents. */
export const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
