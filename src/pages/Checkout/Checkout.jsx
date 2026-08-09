import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axiosInstance from '../../services/axiosInstance';
import { ENDPOINTS } from '../../api/endpoints';
import { ageAtCheckIn } from '../../utils/childDob';
import { cancellationState, parseRateKey, boardInfo } from '../../utils/rateDetails';
import { DEFAULT_PRICING, priceInsurance, priceBasisLabel } from '../../utils/checkoutPricing';
import { useCheckoutConfig } from '../../api';
import Confirmation from './Confirmation';
import HotelPhotoFallback from '../../components/HotelPhotoFallback/HotelPhotoFallback';
import './Checkout.css';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const stripePromise = (STRIPE_PK && !STRIPE_PK.includes('REPLACE')) ? loadStripe(STRIPE_PK) : null;

const STRIPE_ELEMENT_STYLE = {
  base: {
    fontSize: '14px',
    color: '#1a2744',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    '::placeholder': { color: '#94a3bf' },
    lineHeight: '22px',
  },
  invalid: { color: '#ef4444', iconColor: '#ef4444' },
};

/* ── tiny SVG helper (same pattern as HotelDetail) ── */
const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);

const ICON = {
  user:   <S><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></S>,
  users:  <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  shieldCheck: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></S>,
  card:   <S><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></S>,
  lock:   <S><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></S>,
  check:  <S sw={2.5}><path d="M20 6L9 17l-5-5" /></S>,
  arrow:  <S sw={2.5}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></S>,
  arrowL: <S sw={2.5}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></S>,
  pin:    <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></S>,
  cal:    <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  moon:   <S><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></S>,
  plane:  <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></S>,
  bed:    <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  board:  <S><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
  clock:  <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  briefcase: <S><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></S>,
  passport: <S><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17h8" /></S>,
  plus:   <S sw={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></S>,
  x:      <S sw={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>,
  sparkle:<S><path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3L12 3z" /></S>,
  mail:   <S><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></S>,
  bank:   <S><path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><path d="M4 10v11" /><path d="M20 10v11" /><path d="M8 14v3" /><path d="M12 14v3" /><path d="M16 14v3" /></S>,
  umbrella: <S><path d="M23 12a11.05 11.05 0 00-22 0zm-5 7a3 3 0 01-6 0v-7" /></S>,
  heartPulse: <S><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /><path d="M3.5 12h4l2-3 3 6 2-3h5.5" /></S>,
  ban:    <S><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></S>,
  // Baggage, told apart by silhouette rather than by label: a rucksack under the seat, a
  // wheeled cabin case, a hold suitcase.
  bag:    <S><path d="M6 8V6a3 3 0 013-3h6a3 3 0 013 3v2" /><rect x="4" y="8" width="16" height="13" rx="2.5" /><path d="M10 12h4" /></S>,
  cabinBag: <S><rect x="6" y="7" width="12" height="14" rx="2.5" /><path d="M10 7V4h4v3" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></S>,
  checkedBag: <S><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" /><line x1="8" y1="20" x2="8" y2="22" /><line x1="16" y1="20" x2="16" y2="22" /></S>,
  planeOut: <S sw={1.8}><path d="M2 16l20-7-6 12-3-5-5-1z" /><line x1="2" y1="21" x2="22" y2="21" /></S>,
  planeIn:  <S sw={1.8}><path d="M22 16L2 9l6 12 3-5 5-1z" /><line x1="2" y1="21" x2="22" y2="21" /></S>,
  checkCircle: <S sw={2.2}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></S>,
  van:    <S sw={1.8}><path d="M3 17V8a1 1 0 011-1h9v10" /><path d="M13 10h4l4 4v3h-2" /><circle cx="7.5" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /><line x1="9.5" y1="17" x2="15.5" y2="17" /></S>,
  plusCircle: <S sw={2.2}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8.5" x2="12" y2="15.5" /><line x1="8.5" y1="12" x2="15.5" y2="12" /></S>,
};

/* ════════ static config ════════ */
const STEPS = [
  { id: 'info',    name: 'Your details', sub: 'Customer & travellers', icon: ICON.user },
  { id: 'addons',  name: 'Add-ons',      sub: 'Insurance & extras',    icon: ICON.shield },
  { id: 'payment', name: 'Payment',      sub: 'Secure checkout',       icon: ICON.card },
];

const GENDERS_TRAVELLER = [
  { v: 'MALE', l: 'Male' }, { v: 'FEMALE', l: 'Female' }, { v: 'OTHER', l: 'Other' },
];
const GENDERS_CUSTOMER = [...GENDERS_TRAVELLER, { v: 'PREFER_NOT_TO_SAY', l: 'Prefer not to say' }];
const NATIONALITIES = [
  'Belgian', 'Dutch', 'German', 'French', 'British', 'Spanish', 'Italian', 'Portuguese',
  'Greek', 'Turkish', 'Austrian', 'Swiss', 'Polish', 'Swedish', 'Norwegian', 'Danish',
  'Irish', 'Luxembourgish', 'American', 'Canadian', 'Australian', 'Indian', 'Moroccan', 'Other',
];
const COUNTRIES = [
  'Belgium', 'Netherlands', 'Germany', 'France', 'United Kingdom', 'Spain', 'Italy',
  'Portugal', 'Greece', 'Turkey', 'Austria', 'Switzerland', 'Poland', 'Sweden', 'Norway',
  'Denmark', 'Ireland', 'Luxembourg', 'United States', 'Canada', 'Australia', 'India', 'Other',
];
const IDEAL_BANKS = ['ING', 'ABN AMRO', 'Rabobank', 'ASN Bank', 'SNS', 'Bunq', 'Knab', 'Revolut', 'N26'];

/**
 * The insurance choices, built from the rates the dashboard holds.
 *
 * The prices are NOT written here any more: they come from /website/checkout-config, which is
 * the same record the server re-prices the booking against. What stays here is the part that
 * is genuinely presentation — the icon, the plain-English pitch and what each policy covers.
 *
 * `pricing.insurance.<key>.enabled = false` in the dashboard removes an option from sale, so
 * the list is filtered rather than fixed.
 */
const INSURANCE_PRESENTATION = {
  cancellation: {
    id: 'cancel', icon: ICON.cal,
    desc: 'Get your money back if you unexpectedly can’t travel.',
    covers: ['Illness, accident or injury', 'Job loss or new employment', 'Damage to your home'],
  },
  travel: {
    id: 'travel', icon: ICON.umbrella,
    desc: 'Worldwide cover for you and your luggage while travelling.',
    covers: ['Medical expenses abroad', 'Luggage loss & theft', 'Delay & missed connection'],
  },
  allin: {
    id: 'allin', icon: ICON.heartPulse, featured: true,
    desc: 'Cancellation + travel insurance combined. Zero worries.',
    covers: ['Everything in Cancellation', 'Everything in Travel', 'Curtailment & repatriation'],
  },
};
const NO_INSURANCE = {
  id: 'none', name: 'No insurance', icon: ICON.ban,
  desc: 'I accept the risk and travel without extra protection.',
  covers: [], option: null,
};
const buildInsurances = (pricing) => [
  NO_INSURANCE,
  ...Object.entries(pricing?.insurance || {})
    .filter(([, o]) => o && o.enabled !== false)
    .map(([key, option]) => {
      const p = INSURANCE_PRESENTATION[key] || {};
      return {
        id: p.id || option.id || key,
        name: option.label || key,
        provider: option.provider || null,
        icon: p.icon || ICON.shield,
        desc: option.description || p.desc || '',
        covers: p.covers || [],
        featured: !!p.featured,
        option,
      };
    }),
];

// Reaching /checkout with no router state used to render a COMPLETE fabricated booking —
// "Cavo Vezal", a 5-star Greek hotel, an ARKEFLY/TRANSAVIA itinerary, €365 p.p. struck
// through from €399 — which the traveller could take all the way to Stripe. The dangerous
// path was not a stray URL but a REFRESH: react-router state does not survive one, so a
// customer reloading mid-checkout silently had their real booking replaced by this one.
//
// This shell exists only so the hooks below can run before the "nothing to check out" panel
// renders. It names no hotel, no flight, no room and no price.
const EMPTY_BOOKING = {
  hotelCode: '', hotelName: '', stars: 0, loc: '', img: '',
  board: '', nights: 0, adults: 1, currency: '€',
  ppPrice: 0, dateLabel: '', flight: null, room: '', roomExtra: 0, meal: '',
};

const SGR_FEE = 20;

/* ── the non-refundable accommodation consent ──────────────────────────────────
   Stored VERBATIM with the booking alongside the timestamp, because "the customer accepted
   the terms" is worth nothing in a dispute without the words they were shown. Bump the
   version whenever this text changes; old bookings keep the wording they actually saw. */
const NR_CONSENT = {
  code: 'NON_REFUNDABLE_ACCOMMODATION',
  version: 'v1',
  notice: 'This accommodation has a non-refundable rate. If you cancel the booking, 100% cancellation costs apply to this accommodation from the moment the booking is confirmed.',
  accept: 'I understand and accept that 100% cancellation costs apply to the selected non-refundable accommodation.',
};
const TERMS_CONSENT = {
  code: 'BOOKING_CONDITIONS',
  version: 'v1',
  accept: 'I agree to the booking conditions, the privacy policy and the terms of the travel providers.',
};

/**
 * Is the booked room one where cancelling costs the whole price from today?
 *
 * Two independent signals, either of which is enough: the rateKey carries the supplier's own
 * NRF flag, and the cancellation policies say what a cancellation costs right now. `kind:
 * 'none'` means the penalty window has already opened — the traveller would lose the full
 * amount — which is exactly the case the warning is for. A rate with a FUTURE deadline
 * ('free' / 'partial') is not this, and must not be labelled non-refundable.
 */
const isNonRefundableStay = (hotel) => {
  if (!hotel) return false;
  const price = Number(hotel.price) || null;
  const state = cancellationState(hotel.cancellation || [], price);
  if (state.kind === 'none') return true;
  return parseRateKey(hotel.rateKey).nonRefundable === true;
};
// No passport fields. Nothing in the booking chain carried them — no supplier call sent a
// passport number, no voucher or confirmation printed one — so they were two more fields
// between a traveller and paying, collecting a document number we then did nothing with.

// Latest selectable date of birth. The picker itself refuses tomorrow, so nobody has to be
// told about it afterwards; the submit-time check stays as the guarantee. Computed at module
// load so it is not an impure call during render.
const TODAY_ISO = new Date().toISOString().split('T')[0];

/* ════════ helpers ════════ */
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
// Why a re-check failed, in words a traveller can act on — never the axios message.
const friendlyReprice = (err) => {
  const code = err?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'The supplier took too long to answer.';
  if (code === 'ERR_NETWORK') return 'We could not reach the supplier.';
  return 'We could not re-check the price just now.';
};
const phoneOk = (v) => /^\+[1-9]\d{6,14}$/.test((v || '').replace(/[\s\-.()]/g, ''));

const ageFromDob = (dob) => {
  const b = new Date(dob); const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
};
// "1995-11-19" → "19/11/1995". Day-first, like every travel document a Belgian traveller
// will be holding next to the screen while they check it.
const dmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};
// mirrors the admin traveller rules: <2 INF, <12 CHD, else ADT
const ageType = (dob) => {
  const a = ageFromDob(dob);
  return a < 2 ? { code: 'INF', label: 'Infant' } : a < 12 ? { code: 'CHD', label: 'Child' } : { code: 'ADT', label: 'Adult' };
};

const detectBrand = (num) => {
  const n = num.replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^6/.test(n)) return 'discover';
  return '';
};
const formatCardNum = (v, brand) => {
  const max = brand === 'amex' ? 15 : 16;
  const n = v.replace(/\D/g, '').slice(0, max);
  if (brand === 'amex') return n.replace(/^(\d{1,4})(\d{1,6})?(\d{1,5})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  return n.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};
const formatExpiry = (v) => {
  const n = v.replace(/\D/g, '').slice(0, 4);
  if (n.length <= 2) return n;
  return `${n.slice(0, 2)}/${n.slice(2)}`;
};
const expiryOk = (v) => {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const mm = +m[1], yy = 2000 + +m[2];
  if (mm < 1 || mm > 12) return false;
  const now = new Date();
  return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
};

/* animated number — eases towards the new value whenever it changes */
function useCountUp(value, dur = 650) {
  const [disp, setDisp] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    if (from === to) return undefined;
    prev.current = to;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return Math.round(disp);
}

/* ════════ small building blocks ════════ */
/**
 * `ok` draws the green tick that says "this one is done".
 *
 * Only ever passed inside the boxed sections (step 1), and only for fields where DONE is a
 * fact rather than an opinion — a name that has been typed, a date that parses, a country
 * that was picked. A tick next to an optional empty field would be meaningless, and a tick
 * that appears on every keystroke of a half-typed name is noise.
 */
const Field = ({ label, req, err, hint, ok, children, span }) => (
  <div className={`ck-field${err ? ' ck-err' : ''}${ok ? ' ck-done' : ''}${span ? ` ck-span-${span}` : ''}`}>
    <label className="ck-label">{label}{req && <span className="ck-req"> *</span>}</label>
    {children}
    {ok && <span className="ck-tick">{ICON.check}</span>}
    {err ? <div className="ck-errmsg">{err}</div> : hint ? <div className="ck-hint">{hint}</div> : null}
  </div>
);

/**
 * One kind of baggage, shown per traveller and per direction.
 *
 * The layout is the client's: what the fare ALREADY carries is stated, not sold, and only the
 * legs where it is missing offer anything. "Included" here is the supplier's own allowance
 * (Airtuerk sends kilos and piece counts on the fare) — the site never guesses it, because
 * telling somebody their bag is included when it is not is how people get charged at a desk.
 *
 * The prices to ADD are SunSky's, from the dashboard: no supplier sells us an ancillary yet,
 * so anything bought here is arranged by hand with the airline afterwards.
 */
const BaggageCard = ({ icon, title, note, legend, children }) => (
  <section className="ck-card ck-reveal">
    <div className="ck-card-head">
      <div className="ck-card-titles">
        <h2 className="ck-card-title hd">Choose extras per traveller</h2>
        <p className="ck-card-sub">See which baggage is included for each traveller on the outbound and return journey.</p>
      </div>
    </div>
    <div className="ck-bagkind">
      <span className="ck-bagkind-ico">{icon}</span>
      <div className="ck-bagkind-text">
        <b>{title}</b>
        <span>{note}</span>
      </div>
    </div>
    {children}
    <div className="ck-bag-legend">{legend}</div>
  </section>
);

/** One traveller's block inside a baggage card: their name, then a row per direction. */
const BagTraveller = ({ index, name, children }) => (
  <div className="ck-bagtrav">
    <div className="ck-bagtrav-head">
      <span className="ck-bagtrav-n">{index + 1}</span>
      <span className="ck-bagtrav-name hd">Traveller {index + 1}{name ? <span className="ck-trav-who"> — {name}</span> : null}</span>
    </div>
    {children}
  </div>
);

/**
 * A traveller field: label above, control, and the "done" tick in its own column beside it.
 *
 * The tick's column is reserved whether or not it is showing, so a field never jumps sideways
 * the moment it becomes valid — and putting it outside the control means the date of birth's
 * three lists can share one tick between them, which is what they are: one date.
 */
const TravField = ({ label, req, err, hint, ok, children }) => (
  <div className={`ck-tvf${err ? ' ck-err' : ''}`}>
    <label className="ck-tvf-label">{label}{req && <span className="ck-req"> *</span>}</label>
    <div className="ck-tvf-row">
      <div className="ck-tvf-control">{children}</div>
      <span className="ck-tvf-tick">{ok ? ICON.check : null}</span>
    </div>
    {err ? <div className="ck-errmsg">{err}</div> : hint ? <div className="ck-hint">{hint}</div> : null}
  </div>
);

/** The courtesy title a ticket carries, from the gender — not a fourth dropdown to fill. */
const titleFor = (gender) => (gender === 'MALE' ? 'Mr' : gender === 'FEMALE' ? 'Ms' : '');

/** Male / female, as the ticket carries it. Radios, because there are two and both fit. */
const GenderPick = ({ name, value, onChange }) => (
  <div className="ck-radio-row">
    {[{ v: 'MALE', l: 'Male' }, { v: 'FEMALE', l: 'Female' }].map((g) => (
      <label key={g.v} className={`ck-radio${value === g.v ? ' on' : ''}`}>
        <input type="radio" name={name} checked={value === g.v} onChange={() => onChange(g.v)} />
        <span className="ck-radio-dot" />
        {g.l}
      </label>
    ))}
  </div>
);

const Check = ({ checked, onChange, children }) => (
  <label className={`ck-check${checked ? ' on' : ''}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="ck-check-box">{checked && ICON.check}</span>
    <span className="ck-check-label">{children}</span>
  </label>
);

const emptyTraveller = () => ({
  title: '', firstName: '', lastName: '', gender: '', nationality: '',
  dateOfBirth: '',
  // `searchDob` is the date this traveller's price was quoted for, carried from the search
  // bar. Present only on the children the search actually described; it makes the row
  // read-only until the traveller asks to change it, and it is what a re-price is measured
  // against. `dobLocked` follows it and is dropped by the Change button.
  searchDob: '', dobLocked: false,
  // The age this SLOT was priced at, and the fact that the search called it a child. Set on
  // every child the search described, whether or not a date came with it — it is what a date
  // typed here is measured against, so a slot quoted as a 10-year-old cannot quietly become
  // an adult (or the reverse) between the search and the payment.
  isSearchChild: false, searchAge: null,
});

/**
 * The traveller rows a search implies: adults first, then one row per child pre-filled with
 * the date of birth typed into the search bar.
 *
 * The children are the whole point. Their age is what priced the stay and the fare, so the
 * checkout must not ask for it a second time and risk being told something different — and
 * must not silently accept a change either (see the re-price gate). A search with no dates
 * (an older link, or ages edited on the results page after the dates stopped matching) simply
 * yields empty rows, exactly as before.
 */
const seedTravellers = (booking) => {
  const s = booking.search || {};
  const adults = Math.max(1, Number(s.adults) || Number(booking.adults) || 2);
  const children = Math.max(0, Number(s.children) || 0);
  const dobs = String(s.childDobs || '').split(',').map((d) => d.trim()).filter(Boolean);
  const ages = String(s.childAges || '').split(',').map((a) => a.trim()).filter((a) => a !== '');
  // Only LOCK what we really know — as many children as we have dates for — but every child
  // slot remembers the age it was priced at, so a slot with no date still cannot be filled
  // with a birthday that contradicts the quote.
  const rows = Array.from({ length: adults }, emptyTraveller);
  for (let i = 0; i < children; i++) {
    const dob = dobs[i] || '';
    const age = ages[i] !== undefined ? Number(ages[i]) : null;
    rows.push({
      ...emptyTraveller(),
      dateOfBirth: dob, searchDob: dob, dobLocked: !!dob,
      isSearchChild: true, searchAge: Number.isFinite(age) ? age : null,
    });
  }
  // Older hand-offs carry only a pax total (booking.adults counted everyone) — keep that
  // shape rather than dropping rows the traveller would have to add back by hand.
  if (!s.adults && !children && booking.adults > adults) {
    while (rows.length < booking.adults) rows.push(emptyTraveller());
  }
  return rows;
};

/**
 * How a party splits into fare types, using the SAME boundaries as the server's paxCounts
 * (backend/website/services/priceValidation.service.js): under 2 an infant, under 12 a child,
 * otherwise an adult, measured on the travel date. The two must agree — the server re-prices
 * the flight from the passengers' dates of birth, so a client that classified them differently
 * would send a total the server rejects as PRICE_CHANGED and the traveller would be stopped at
 * the last step with nothing to fix.
 *
 * @param searchedAdults how many adults the search itself described (their rows carry no
 *   searched date of birth, so they are counted, not derived)
 * @param childAges ages of the searched children, in search order
 */
const splitFareTypes = (searchedAdults, childAges) => {
  const grown = childAges.filter((a) => a >= 12).length;
  return {
    adults: searchedAdults + grown,
    children: childAges.filter((a) => a >= 2 && a < 12).length,
    infants: childAges.filter((a) => a < 2).length,
    // Hotelbeds wants an age for every non-adult in the room, infants included.
    childAges: childAges.filter((a) => a < 12),
  };
};
/** Two itineraries are the same flight when every leg is the same number at the same minute. */
const sameItinerary = (a = [], b = []) => a.length === b.length && a.every((leg, i) => (
  String(leg.flightNumber || '') === String(b[i]?.flightNumber || '')
  && String(leg.departure || '').slice(0, 16) === String(b[i]?.departure || '').slice(0, 16)
));

/* ════════════════════════════════════════════════════════ */
function CheckoutContent({ stripe, elements }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  // No booking in router state means there is nothing to pay for — say so rather than
  // inventing one. Guarded at render (below), since the hooks must still run.
  const hasBooking = !!state?.booking;
  const booking = state?.booking || EMPTY_BOOKING;
  const isFlight = booking.kind === 'flight';
  const isTransfer = booking.kind === 'transfer';
  const { isAuthenticated, user } = useSelector((s) => s.auth);
  const ccy = booking.currency || '€';
  const paneRef = useRef(null);

  /* ── steps ── */
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [dir, setDir] = useState(1);

  /* ── step 1 : customer + travellers ──
     One form, not two behind a Private/Professional switch. Almost nobody arriving at a
     checkout thinks of themselves as choosing a customer type; they think "this is for work"
     — so it is a checkbox on the same form, exactly as the sign-up page asks it, and ticking
     it registers a professional customer with this person as the primary contact. */
  const [isCompany, setIsCompany] = useState(false);
  const customerType = isCompany ? 'professional' : 'private';
  const [priv, setPriv] = useState({
    firstName: user?.firstName || '', lastName: user?.lastName || '',
    dateOfBirth: '', gender: '', nationality: '', preferredLanguage: 'en',
    hasEmail: true, email: user?.email || '', phone: user?.phone || '',
    street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
    emergencyPhone: '',
  });
  /* Traveller 1 is usually the person booking. Ticked, their name, gender, date of birth and
     nationality FOLLOW that traveller — typed once, kept in step if they are corrected. What
     the traveller form does not hold (company, address, phone, email, emergency contact) is
     still filled in here either way. Unticked, all of it becomes independent again. */
  const [leadIsBooker, setLeadIsBooker] = useState(true);
  const [pro, setPro] = useState({
    tradingName: '', legalName: '', vatNumber: '', industry: '', website: '',
    street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
    hasInvoiceEmail: true, invoiceEmail: '', paymentTerms: '', invoicingAddress: '',
    primaryContactFirstName: user?.firstName || '', primaryContactLastName: user?.lastName || '',
    hasContactEmail: true, primaryContactEmail: user?.email || '', primaryContactPhone: '',
    primaryContactRole: '', preferredLanguage: 'en',
  });
  const [travellers, setTravellers] = useState(() => seedTravellers(booking));

  /* ── the name check, between step 1 and the extras ──
     A misspelled name is the one checkout mistake the traveller pays for later: airlines
     charge to correct one, and some refuse outright. So leaving step 1 is gated on the
     traveller reading their OWN typing back — one tick per person, against the name and
     date of birth as we will send them. Editing any of those fields drops that person's
     tick (see setT), because a confirmation of the previous spelling is worth nothing. */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewOk, setReviewOk] = useState({});
  const allReviewed = travellers.every((_, i) => reviewOk[i]);

  /* ── unlocking a child's date of birth ──
     `dobPrompt` is the traveller whose warning is on screen; `dobUnlocked` is the last one
     opened, only so the date input takes focus when it appears. */
  const [dobPrompt, setDobPrompt] = useState(null);
  const [dobUnlocked, setDobUnlocked] = useState(null);
  const unlockDob = (i) => {
    setTravellers((ts) => ts.map((t, ti) => (ti === i ? { ...t, dobLocked: false } : t)));
    setDobUnlocked(i);
    setDobPrompt(null);
  };

  /* ══ re-pricing after a date-of-birth change ══════════════════════════════════
     A corrected birthday can change what this holiday costs, or whether it exists at all:
     the room was quoted for a party of certain ages and the fare for certain passenger
     types. So the change is not accepted quietly — the supplier is asked again, nothing can
     be paid while the answer is outstanding, and a new price has to be accepted by the
     person paying it. The booking then carries the identifiers from THAT check (a fresh
     rateKey, fresh flight keys), which is what makes the server's own re-price agree.

     `quote` is the live hotel/flight pair the page prices from — it starts as whatever the
     hotel page quoted and is replaced only by an accepted re-check. */
  // NB: not `S` — that is the inline SVG component this file renders every icon with.
  const srch = booking.search || {};
  const [quote, setQuote] = useState(() => ({
    hotel: Number(booking.api?.hotel?.price) || 0,
    flight: Number(booking.api?.flight?.price) || 0,
    rateKey: booking.api?.hotel?.rateKey || null,
    roomCode: booking.api?.hotel?.roomCode || null,
    boardCode: booking.api?.hotel?.boardCode || null,
    // Carried because refundability is a property of the RATE: a re-priced room can be
    // non-refundable where the first one wasn't, and the warning has to follow it.
    cancellation: booking.api?.hotel?.cancellation || [],
    flightKeys: booking.api?.flight?.flightKeys || null,
  }));
  // null → nothing to settle. Otherwise: checking | same | changed | unavailable | error
  const [reprice, setReprice] = useState(null);
  const repriceSeq = useRef(0);

  /* ── does what was typed still match what was priced? ──
     EVERY child slot the search described is measured, not only the ones a date arrived for.
     A holiday quoted for a 10-year-old and then booked for a 30-year-old is the cheapest
     obvious way to game a price, and the slot with no date is exactly where that would be
     tried: the results page lets a child's AGE be edited, and an edited age used to arrive
     here as an empty, unguarded field. The age the slot was PRICED at is remembered
     regardless, so the date typed here always has something to be checked against. */
  const searchedChildren = travellers.filter((t) => t.isSearchChild);
  const searchedAges = searchedChildren.map((t) => t.searchAge);
  const currentChildAges = searchedChildren.map((t) => ageAtCheckIn(t.dateOfBirth, srch.checkin));
  const agesReady = currentChildAges.every((a) => a != null);
  const pricedKnown = searchedAges.every((a) => a != null);
  const agesSignature = agesReady ? currentChildAges.join(',') : null;
  const searchedSignature = pricedKnown ? searchedAges.join(',') : null;
  // Only a change of AGE can move a price — every supplier call we make carries ages, never
  // dates. Correcting the day of a birthday inside the same year is therefore free, and
  // asking the supplier about it would be a call whose answer we already know.
  const needsReprice = !!(srch.checkin && agesSignature && searchedSignature
    && agesSignature !== searchedSignature);

  const runReprice = async (ages) => {
    const seq = ++repriceSeq.current;
    const party = splitFareTypes(Number(srch.adults) || 1, ages);
    setReprice({ status: 'checking' });
    try {
      const hotelReq = axiosInstance.post('/hotel-availability/search', {
        hotelCode: String(booking.api?.hotel?.hotelCode || booking.hotelCode),
        checkin: srch.checkin, checkout: srch.checkout,
        adults: party.adults, children: party.childAges.length,
        childAges: party.childAges, rooms: Number(srch.rooms) || 1,
      });
      // The fare is only re-searched when the PASSENGER MIX changed — an 11-year-old
      // turning 12 is a different ticket, an 8-year-old turning 9 is not, and the flight
      // search takes counts, not ages.
      const mixChanged = party.adults !== (Number(srch.adults) || 1) || party.infants > 0;
      const flightReq = (mixChanged && booking.api?.flight && srch.destination)
        ? axiosInstance.post('/flight-availability/search', {
            from: srch.origin, to: srch.destination,
            depdate: srch.checkin, retdate: srch.checkout,
            adults: party.adults, children: party.children, infants: party.infants,
          })
        : null;

      const [hotelRes, flightRes] = await Promise.all([hotelReq, flightReq]);
      if (seq !== repriceSeq.current) return;   // a newer edit owns the screen

      // ── the room, re-priced for the corrected party ──
      const raw = hotelRes?.data?.results;
      const rooms = [...(raw?.hotelbeds?.rooms || []), ...(raw?.diana?.rooms || [])]
        .map((r) => ({
          price: r.sellingRate ?? r.net ?? r.price ?? null,
          roomCode: r.roomCode || null, boardCode: r.boardCode || null,
          rateKey: r.rateKey || null, name: r.roomName || 'Room',
          board: r.boardName || r.boardCode || '',
          cancellation: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies : [],
        }))
        .filter((r) => r.price != null)
        .sort((a, b) => a.price - b.price);
      // Prefer the room and board that were actually chosen; a hotel that still has rooms
      // but not THAT one is a changed offer, not an unavailable holiday, so fall back to
      // the cheapest and let the new price be accepted or refused.
      const match = rooms.find((r) => r.roomCode === quote.roomCode && r.boardCode === quote.boardCode)
        || rooms.find((r) => r.boardCode === quote.boardCode)
        || rooms[0];
      if (!match) {
        setReprice({ status: 'unavailable', reason: 'room', ages });
        return;
      }

      // ── the flight, if it had to be re-searched ──
      let flight = { price: quote.flight, keys: quote.flightKeys };
      if (flightRes) {
        const list = flightRes.data?.results;
        const flights = Array.isArray(list) ? list : (list?.flights || []);
        const wanted = booking.api.flight.legs || [];
        const same = flights.find((f) => sameItinerary([...(f.outLegs || f.legs || [])], wanted))
          || flights.find((f) => sameItinerary([...(f.legs || [])], wanted));
        if (!same) {
          setReprice({ status: 'unavailable', reason: 'flight', ages });
          return;
        }
        flight = {
          price: Number(same.totalPrice ?? same.price) || 0,
          keys: same.flightKeys || same.flightKey ? [same.flightKey].filter(Boolean) : quote.flightKeys,
        };
      }

      const nextQuote = {
        hotel: Number(match.price) || 0,
        flight: flight.price,
        rateKey: match.rateKey, roomCode: match.roomCode, boardCode: match.boardCode,
        cancellation: match.cancellation,
        flightKeys: flight.keys,
      };
      const was = quote.hotel + quote.flight;
      const now = nextQuote.hotel + nextQuote.flight;
      // Within a euro is the same price — supplier rounding is not a price change worth
      // stopping a booking for.
      if (Math.abs(now - was) < 1) {
        setQuote(nextQuote);          // keep the fresh identifiers even when the money matches
        setReprice({ status: 'same', ages });
      } else {
        setReprice({ status: 'changed', ages, was, now, next: nextQuote, room: match });
      }
    } catch (err) {
      if (seq !== repriceSeq.current) return;
      setReprice({ status: 'error', ages, message: friendlyReprice(err) });
    }
  };

  // Debounced: a date input fires on every keystroke of a typed year, and each one would
  // otherwise be a supplier call for a party that existed for 80 milliseconds.
  useEffect(() => {
    if (!needsReprice) { if (reprice) setReprice(null); return undefined; }
    if (reprice && reprice.ages?.join(',') === agesSignature) return undefined;  // already settled
    const t = setTimeout(() => runReprice(currentChildAges), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReprice, agesSignature]);

  const acceptNewPrice = () => {
    if (reprice?.status !== 'changed') return;
    setQuote(reprice.next);
    // A different rate means different cancellation terms: whatever was accepted was accepted
    // about the OLD room, so the tick goes back to unticked.
    setNrAccept(false);
    setReprice({ status: 'accepted', ages: reprice.ages });
  };
  // Putting the searched date back is the one-click way out of both the "changed" and the
  // "not available" states — it restores the holiday that was actually priced.
  const restoreSearchDob = () => {
    setTravellers((ts) => ts.map((t) => (t.searchDob ? { ...t, dateOfBirth: t.searchDob, dobLocked: true } : t)));
    setReprice(null);
  };
  // Nothing may be paid while an answer is outstanding, or while a new price is unaccepted,
  // or when the corrected party has no holiday to book.
  const repriceBlocks = !!reprice && ['checking', 'changed', 'unavailable', 'error'].includes(reprice.status);

  // Refundability of the rate CURRENTLY quoted — after an accepted re-price that is the new
  // room's, not the one the traveller arrived with.
  const nonRefundable = isNonRefundableStay(booking.api?.hotel && {
    ...booking.api.hotel,
    rateKey: quote.rateKey ?? booking.api.hotel.rateKey,
    cancellation: quote.cancellation ?? booking.api.hotel.cancellation,
    price: quote.hotel || booking.api.hotel.price,
  });

  /* ── step 2 : add-ons ── */
  // The rate card the dashboard holds — insurance rates, the booking fee, baggage prices,
  // the deposit rule. Falls back to the shipped defaults (which mirror the server's) so a
  // failed config call quotes the right numbers rather than none.
  const { data: pricingCfg } = useCheckoutConfig();
  const pricing = pricingCfg || DEFAULT_PRICING;
  const insurances = useMemo(() => buildInsurances(pricing), [pricing]);
  /* Two separate decisions, because they are two separate policies:
     — cancellation cover is bought ONCE for the whole booking (if one traveller cancels the
       trip, the trip is cancelled), so it is a single yes/no;
     — travel cover is per traveller, because it insures a person: a family can cover the
       children and not the adult who is already covered by a card.
     `null` on either means "not answered yet" — different from "no", so the step can ask. */
  const [cancelIns, setCancelIns] = useState(null);
  const [travelIns, setTravelIns] = useState({});
  // The policy holder is the lead traveller. It stopped being a question when travel cover
  // became per-traveller: each policy already names the person it covers.
  const holderIsLead = true;
  const holder = { firstName: '', lastName: '' };

  /* Baggage the traveller ADDED, keyed `travellerIndex:direction`. What the fare already
     includes is never in here — that comes from the supplier's own allowance and cannot be
     bought twice. `cabin: true` or `checked: <kg>`. */
  const [bags, setBags] = useState({});
  const bagKey = (i, dir) => `${i}:${dir}`;
  const setBag = (i, dir, patch) => setBags((b) => {
    const key = bagKey(i, dir);
    const next = { ...(b[key] || {}), ...patch };
    if (next.cabin === false) delete next.cabin;
    if (next.checked === null) delete next.checked;
    return { ...b, [key]: next };
  });

  /* ══ does this email already have an account? ═══════════════════════════════
     A guest typing an address they already have a login for is about to create a second
     identity for themselves: the booking would land on a customer record their account
     cannot see, and "my bookings" would be missing the holiday they just paid for. So the
     address is checked as they type — by the SERVER, which answers one boolean and nothing
     else — and if it belongs to an account, the way forward is to sign in rather than to
     carry on. Signing in also brings their saved details into this form.

     `emailTaken`: null = unasked/unknown, false = free, true = an account exists. Anything
     other than a definite `true` lets the traveller continue: a checkout must not be held up
     by a check that failed to answer. */
  const [emailTaken, setEmailTaken] = useState(null);
  const emailAskedFor = useRef('');
  useEffect(() => {
    // Nothing to warn a signed-in customer about — this IS their address.
    if (isAuthenticated) { setEmailTaken(null); return undefined; }
    const email = (priv.email || '').trim().toLowerCase();
    if (!emailOk(email)) { setEmailTaken(null); emailAskedFor.current = ''; return undefined; }
    if (emailAskedFor.current === email) return undefined;
    // Debounced: an address is typed one character at a time and every prefix is a valid
    // string to POST. 600ms is after the typing, before the tab-out.
    const t = setTimeout(() => {
      emailAskedFor.current = email;
      axiosInstance.post(ENDPOINTS.emailCheck, { email })
        .then(({ data }) => setEmailTaken(data?.data?.exists === true))
        .catch(() => setEmailTaken(null));   // unanswered is not "taken"
    }, 600);
    return () => clearTimeout(t);
  }, [priv.email, isAuthenticated]);

  // Where to come back to. The booking lives in router state, so it has to travel with them
  // or they return to an empty "nothing to check out" screen.
  const goSignIn = (path) => navigate(path, { state: { from: '/checkout', resume: { booking } } });

  /* ── the airport transfer, bought here rather than on the hotel page ──
     The flight is already chosen by now, so the pickup can be timed to the arrival that will
     actually be booked — which is what the supplier's rateKey encodes. One call, on arrival
     at this step, and never for a traveller who said they are making their own way there. */
  const [transfers, setTransfers] = useState(null);      // {loading|error|services[]|pickupISO}
  const [transferPick, setTransferPick] = useState(-1);  // -1 = no transfer (opt-in, always)
  const pickedTransfer = (transferPick >= 0 && transfers?.services?.length)
    ? transfers.services[transferPick] : null;

  /* ── step 3 : payment ── */
  const [payMethod, setPayMethod] = useState('card');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [cvcFocus, setCvcFocus] = useState(false);
  const [stripeBrand, setStripeBrand] = useState('');
  const [stripeReady, setStripeReady] = useState({ number: false, expiry: false, cvc: false });
  const [idealBank, setIdealBank] = useState('');
  const [billingSame, setBillingSame] = useState(true);
  const [agree, setAgree] = useState(false);
  // Unticked by default, always — a pre-ticked acceptance of a 100% cancellation cost is not
  // an acceptance. Only asked for when a selected rate really is non-refundable.
  const [nrAccept, setNrAccept] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  // True when payment succeeded but the supplier reservation/confirm step failed —
  // the booking needs manual finalisation rather than being shown as fully confirmed.
  const [reservationPending, setReservationPending] = useState(false);

  const [errors, setErrors] = useState({});

  /* No fake "price hold" countdown — nothing is actually locked server-side.
     The sidebar shows an honest live-pricing note instead. */

  /* ── pricing ── */
  const pax = travellers.length;
  // Transfers are priced PER VEHICLE (the rate covers the whole party), so the
  // base is the fixed total — never multiplied by the traveller count.
  // An ACCEPTED re-check replaces the quoted stay+fare; until then nothing about the money
  // moves, so a booking nobody re-priced prices exactly as it did before this existed.
  // `quotedThen` is read straight off the hand-off rather than from a ref — the payload is
  // fixed for the life of the page, and a ref read during render is not.
  const quotedNow = quote.hotel + quote.flight;
  const quotedThen = (Number(booking.api?.hotel?.price) || 0) + (Number(booking.api?.flight?.price) || 0);
  const base = isTransfer ? booking.ppPrice
    : quotedNow !== quotedThen ? quotedNow
    : booking.ppPrice * pax;
  const roomExtraTotal = (booking.roomExtra || 0) * pax;
  // Package add-on: the airport transfer, chosen HERE (extras step) and priced per vehicle,
  // so it is never multiplied by the traveller count. A transfer-only booking has it in
  // `base` already. `booking.api.transfer` is the legacy path — hand-offs from before the
  // transfer moved to this page can still carry one.
  const transferTotal = !isTransfer && pickedTransfer
    ? Math.round(Number(pickedTransfer.price) || 0)
    : (!isTransfer && booking.api?.transfer ? Math.round(Number(booking.api.transfer.price) || 0) : 0);
  const serviceFee = Number(pricing?.fees?.serviceFee);
  const SGR = Number.isFinite(serviceFee) ? serviceFee : SGR_FEE;
  /* ── baggage the traveller added ──
     Every line is priced from the dashboard table and re-priced by the server from the same
     row; an amount that appears here and not there would be money we display but never take. */
  const bagRates = pricing?.baggage || DEFAULT_PRICING.baggage;
  // What the FARE carries, from the supplier. A return trip merges its two options by MIN, so
  // this is the allowance that survives both legs — which is what a traveller has to pack for.
  const allowance = booking.api?.flight?.baggage || null;

  /* ── what the fare carries, and what may be added on top ──
     Three rules, all the client's:
     1. No baggage object at all means the airline told us NOTHING. That is not "not included"
        — it is unknown, and it is said that way while still offering the bag for sale.
     2. A fare with hold baggage carries a cabin bag too. Airtuerk reports `handLuggage` as 0
        on every option seen, so reading it literally would offer to sell a cabin bag that the
        ticket already includes.
     3. Extra bags come from the AIRLINE when the airline offers them (`baggage.addOns`), and
        only otherwise from our own table — and then they are ours to arrange by hand. Either
        way the server re-prices from the same source, so nothing is quoted that cannot be
        charged. Included does not mean nothing more can be bought: a second bag is still a
        sale when the airline sells one. */
  const bagKnown = !!allowance;
  const checkedIncludedKg = Number(allowance?.checkedKg) || 0;
  const checkedIncludedPieces = Number(allowance?.checkedPieces) || 0;
  const checkedIncluded = checkedIncludedKg > 0 || checkedIncludedPieces > 0;
  const cabinIncludedKg = Number(allowance?.handKg) || 0;
  const cabinIncluded = cabinIncludedKg > 0 || checkedIncluded;
  // Airline-offered extras first; our placeholder table only when the airline offers none.
  const airlineAddOns = allowance?.addOns || null;
  const cabinAddOns = (airlineAddOns?.cabin?.length ? airlineAddOns.cabin : null)
    || (bagRates?.cabin?.enabled !== false && Number(bagRates?.cabin?.price)
      ? [{ kg: Number(bagRates?.cabin?.kg) || null, price: Number(bagRates.cabin.price) }]
      : []);
  const checkedAddOns = (airlineAddOns?.checked?.length ? airlineAddOns.checked : null)
    || (bagRates?.checked || []);
  const addOnsAreOurs = !airlineAddOns;
  const hasFlight = !!booking.api?.flight;
  const directions = booking.api?.flight?.tripType === 'roundtrip'
    ? [{ key: 'out', label: 'Outbound', icon: ICON.planeOut }, { key: 'ret', label: 'Return', icon: ICON.planeIn }]
    : [{ key: 'out', label: 'Outbound', icon: ICON.planeOut }];
  const travellerName = (t) => [titleFor(t.gender), t.firstName, t.lastName].filter(Boolean).join(' ').trim();
  // A selection is only a line if it is still on sale: the option it names has to exist in the
  // list it came from. Anything else is dropped here exactly as the server drops it, so the
  // two totals cannot diverge.
  const extraLines = useMemo(() => {
    const out = [];
    Object.entries(bags).forEach(([key, sel]) => {
      const [idx, direction] = key.split(':');
      if (sel?.cabin) {
        const row = cabinAddOns.find((r) => Number(r.kg || 0) === Number(sel.cabin === true ? (cabinAddOns[0]?.kg || 0) : sel.cabin || 0))
          || cabinAddOns[0];
        if (row) {
          out.push({ code: 'baggage.cabin', travellerIndex: Number(idx), direction,
            kg: row.kg ? Number(row.kg) : undefined,
            label: row.kg ? `Cabin baggage ${row.kg} kg` : (bagRates?.cabin?.label || 'Cabin baggage'),
            price: Number(row.price) || 0 });
        }
      }
      if (sel?.checked) {
        const row = checkedAddOns.find((r) => Number(r.kg) === Number(sel.checked));
        if (row) {
          out.push({ code: 'baggage.checked', travellerIndex: Number(idx), direction, kg: Number(row.kg),
            label: `Checked baggage ${row.kg} kg`, price: Number(row.price) || 0 });
        }
      }
    });
    return out;
  }, [bags, cabinAddOns, checkedAddOns, bagRates]);
  const extrasTotal = extraLines.reduce((s, l) => s + l.price, 0);

  const subtotal = base + roomExtraTotal + transferTotal + extrasTotal + SGR;
  // Priced from the dashboard's rate card, by the same arithmetic the server will re-run.
  // Cancellation covers the party; travel cover is charged per traveller who took it.
  const cancelOption = insurances.find((i) => i.id === 'cancel')?.option || null;
  const travelOption = insurances.find((i) => i.id === 'travel')?.option || null;
  const travelCount = travellers.filter((_, i) => travelIns[i]).length;
  const cancelAmount = (cancelIns && cancelOption)
    ? priceInsurance(cancelOption, { pax, nights: booking.nights, baseSubtotal: subtotal }) : 0;
  const travelAmount = (travelCount && travelOption)
    ? priceInsurance(travelOption, { pax: travelCount, nights: booking.nights, baseSubtotal: subtotal }) : 0;
  const insAmount = cancelAmount + travelAmount;
  const total = subtotal + insAmount;
  const animTotal = useCountUp(total);
  const money = (n) => `${ccy}${Math.round(n).toLocaleString('en-US')}`;

  /* ── scroll to top on step change + reveal anims ── */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);
  useEffect(() => {
    const els = paneRef.current?.querySelectorAll('.ck-reveal:not(.vis)') || [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [step]);

  /* ── fetch the airport transfer options, once, when the extras step opens ──
     Not on mount: a traveller who never reaches step 2 costs the supplier nothing. The pickup
     datetime is the ARRIVAL of the last outbound leg — the rateKey encodes it as the booked
     pickup time, so a transfer bought here is timed to the flight in the same booking. With
     no flight (hotel only, or own transport) there is nothing to meet and no call is made. */
  const arrivalISO = (() => {
    const legs = booking.api?.flight?.legs || [];
    const outLegs = booking.api?.flight?.tripType === 'roundtrip' ? legs.slice(0, Math.ceil(legs.length / 2)) : legs;
    const arr = outLegs.length ? outLegs[outLegs.length - 1]?.arrival : null;
    return arr && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(arr)) ? `${String(arr).slice(0, 16)}:00` : null;
  })();
  const wantsTransfer = !isTransfer && !isFlight && srch.transport !== 'hotel_only'
    && !!srch.destination && !!(booking.api?.hotel?.hotelCode || booking.hotelCode);
  useEffect(() => {
    if (step !== 1 || !wantsTransfer || transfers) return;
    const checkin = srch.checkin || booking.api?.hotel?.checkin;
    if (!checkin) return;
    const outbound = arrivalISO || `${checkin}T12:00:00`;
    setTransfers({ loading: true });
    axiosInstance.post('/transfer-availability/search', {
      fromType: 'IATA', fromCode: srch.destination,
      toType: 'ATLAS', toCode: String(booking.api?.hotel?.hotelCode || booking.hotelCode),
      outbound,
      adults: Number(srch.adults) || pax, children: Number(srch.children) || 0, infants: 0,
    })
      .then(({ data }) => setTransfers({ services: data?.results?.hotelbeds?.services || [], pickupISO: outbound }))
      .catch((e) => setTransfers({ error: friendlyReprice(e), pickupISO: outbound }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, wantsTransfer]);

  /* ── review modal: Escape closes it, and the page behind it stops scrolling ── */
  useEffect(() => {
    if (!reviewOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setReviewOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [reviewOpen]);

  /* ── field setters ── */
  const setP = (k) => (v) => { setPriv((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [`priv.${k}`]: undefined })); };
  const setB = (k) => (v) => { setPro((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [`pro.${k}`]: undefined })); };
  const setT = (i, k) => (v) => {
    setTravellers((ts) => ts.map((t, ti) => (ti === i ? { ...t, [k]: v } : t)));
    setErrors((e) => ({ ...e, [`t${i}.${k}`]: undefined }));
    // Any edit to the identity we print on the ticket invalidates that traveller's tick.
    if (k === 'firstName' || k === 'lastName' || k === 'title' || k === 'dateOfBirth') {
      setReviewOk((r) => (r[i] ? { ...r, [i]: false } : r));
    }
  };

  // The party is FIXED by the search. Adding a traveller here would have added a person the
  // room, the fare and the transfer were never priced for — the supplier quoted an occupancy,
  // and a fourth name on a room quoted for three is not a booking anyone can honour. To travel
  // with more people, the search is where that is decided.
  /* ── traveller 1 is also the booker ──
     The copy runs from the TRAVELLER to the booker, and keeps running: a name corrected on
     the traveller card two minutes later has to reach the booker too, or the booking goes out
     with the old spelling on the invoice. Only the four facts the traveller form actually
     holds are copied — the address, phone, email, emergency number and company are the
     booker's own and are never touched by this. */
  const lead = travellers[0];
  useEffect(() => {
    if (!leadIsBooker || !lead) return;
    setPriv((prv) => {
      const next = {
        ...prv,
        firstName: lead.firstName,
        lastName: lead.lastName,
        gender: lead.gender,
        dateOfBirth: lead.dateOfBirth,
        nationality: lead.nationality,
      };
      const same = ['firstName', 'lastName', 'gender', 'dateOfBirth', 'nationality']
        .every((k) => prv[k] === next[k]);
      return same ? prv : next;      // no state churn when nothing moved
    });
  }, [leadIsBooker, lead?.firstName, lead?.lastName, lead?.gender, lead?.dateOfBirth, lead?.nationality]);

  /* ── validation ── */
  const validateInfo = () => {
    const e = {};
    // One set of rules for the person, whoever they are booking for. Country is required
    // because a company record cannot be created without one, and asking for it only after
    // the box is ticked moves a field around under the traveller's cursor.
    if (!priv.firstName.trim()) e['priv.firstName'] = 'First name is required';
    if (!priv.lastName.trim()) e['priv.lastName'] = 'Last name is required';
    if (!priv.nationality) e['priv.nationality'] = 'Nationality is required';
    if (priv.hasEmail && !emailOk(priv.email)) e['priv.email'] = 'A valid email is required';
    // An address that already has a login cannot go through as a guest — the booking would
    // attach to a customer record their account cannot see. Only a definite `true` blocks:
    // a check that failed to answer must not hold up a checkout.
    else if (!isAuthenticated && emailTaken === true) {
      e['priv.email'] = 'This email already has an account — please log in to continue';
    }
    if (!phoneOk(priv.phone)) e['priv.phone'] = 'Use international format, e.g. +32475123456';
    // The emergency number is the one field nobody wants to be missing when it is needed.
    if (!phoneOk(priv.emergencyPhone)) e['priv.emergencyPhone'] = 'Use international format, e.g. +32476987654';
    if (!priv.street.trim()) e['priv.street'] = 'Street is required';
    if (!priv.houseNumber.trim()) e['priv.houseNumber'] = 'House number is required';
    if (!priv.postalCode.trim()) e['priv.postalCode'] = 'Postal code is required';
    if (!priv.city.trim()) e['priv.city'] = 'City is required';
    if (!priv.country) e['priv.country'] = 'Country is required';
    if (priv.dateOfBirth && new Date(priv.dateOfBirth) >= new Date()) e['priv.dateOfBirth'] = 'Date of birth must be in the past';
    if (isCompany) {
      // Two facts a company can always give: the name it is registered under and its VAT
      // number. No trading name (it is the same string for almost every SME) and no industry.
      if (!pro.legalName.trim()) e['pro.legalName'] = 'Company name is required';
      if (!pro.vatNumber.trim() || pro.vatNumber.trim().length < 3) e['pro.vatNumber'] = 'VAT number is required';
    }
    travellers.forEach((t, i) => {
      if (!t.gender) e[`t${i}.gender`] = 'Required';
      if (!t.firstName.trim()) e[`t${i}.firstName`] = 'Required';
      if (!t.lastName.trim()) e[`t${i}.lastName`] = 'Required';
      if (!t.nationality) e[`t${i}.nationality`] = 'Required';
      if (!t.dateOfBirth) e[`t${i}.dateOfBirth`] = 'Required';
      else if (new Date(t.dateOfBirth) >= new Date()) e[`t${i}.dateOfBirth`] = 'Must be in the past';
    });
    return e;
  };

  const validatePayment = () => {
    const e = {};
    if (payMethod === 'card') {
      if (!card.name.trim()) e['card.name'] = 'Cardholder name is required';
      if (stripe) {
        if (!stripeReady.number) e['card.number'] = 'Enter a valid card number';
        if (!stripeReady.expiry) e['card.expiry'] = 'Enter a valid expiry date';
        if (!stripeReady.cvc) e['card.cvc'] = 'Enter a valid CVC';
      } else {
        const digits = card.number.replace(/\D/g, '');
        const need = detectBrand(card.number) === 'amex' ? 15 : 16;
        if (digits.length < need) e['card.number'] = 'Enter a valid card number';
        if (!expiryOk(card.expiry)) e['card.expiry'] = 'Invalid expiry';
        if (card.cvc.replace(/\D/g, '').length < 3) e['card.cvc'] = 'Invalid CVC';
      }
    }
    if (payMethod === 'ideal' && !idealBank) e.idealBank = 'Please choose your bank';
    if (!agree) e.agree = 'Please accept the booking conditions to continue';
    // A separate, explicit tick — the general conditions checkbox does not stand in for it.
    if (nonRefundable && !nrAccept) e.nrAccept = 'Please confirm you accept the cancellation costs for the non-refundable accommodation';
    return e;
  };

  const flashErrors = (e) => {
    setErrors(e);
    setTimeout(() => {
      document.querySelector('.ck-err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const goStep = (i) => {
    if (i > furthest) return;
    // The stepper is a shortcut, not a bypass: a traveller who came back to fix a spelling
    // has an unticked name again, and clicking "Payment" in the header must land on the
    // same check as the Continue button rather than sliding past it.
    if (i > 0 && step === 0 && !allReviewed) return next();
    setDir(i > step ? 1 : -1);
    setStep(i);
  };

  const advance = () => {
    setErrors({});
    setDir(1);
    const n = Math.min(step + 1, 2);
    setStep(n);
    setFurthest((f) => Math.max(f, n));
  };
  const next = () => {
    if (step === 0) {
      const e = validateInfo();
      if (Object.keys(e).filter((k) => e[k]).length) return flashErrors(e);
      // Form is complete and internally valid — but "valid" and "spelled like the passport"
      // are different claims, and only the traveller can make the second one. The modal is
      // the last thing between a typo and a fee, so it opens even when they have already
      // ticked everyone: re-reading two lines costs nothing next to an airline name change.
      setReviewOpen(true);
      return;
    }
    advance();
  };
  // Leaving the review modal is the only way past step 1, and it needs every traveller ticked.
  const confirmReview = () => {
    if (!allReviewed) return;
    setReviewOpen(false);
    advance();
  };
  const back = () => { setDir(-1); setStep((s) => Math.max(0, s - 1)); };

  /* Booking flow: create → Stripe PaymentIntent → confirm card → record payment → supplier confirm. */
  const pay = async () => {
    // "During this check, the customer must not be able to complete the booking/payment."
    // Belt and braces: the button is already disabled, this is the path a stray Enter takes.
    if (repriceBlocks) {
      setErrors({ submit: reprice.status === 'checking'
        ? 'We are re-checking your price — one moment.'
        : reprice.status === 'unavailable'
          ? 'This trip is not available for the updated traveller details.'
          : 'Please review the updated price for your booking before paying.' });
      return;
    }
    const e = validatePayment();
    if (Object.keys(e).filter((k) => e[k]).length) return flashErrors(e);
    setErrors({});
    setPaying(true);
    try {
      // One form, two records. Ticking "I am a business customer" registers a PROFESSIONAL
      // customer — the same thing the sign-up page does — with the person who filled the form
      // as its primary contact and their address as the company address. No trading name (the
      // server defaults it to the legal name) and no industry: neither is something the
      // person booking a holiday can answer better than an agent can later.
      const address = {
        street: priv.street, houseNumber: priv.houseNumber, boxNumber: priv.boxNumber,
        city: priv.city, postalCode: priv.postalCode, country: priv.country,
      };
      const customer = isCompany
        ? {
            type: 'professional',
            legalName: pro.legalName, vatNumber: pro.vatNumber,
            address,
            primaryContact: {
              firstName: priv.firstName, lastName: priv.lastName,
              phone: priv.phone,
              contactEmail: priv.hasEmail ? priv.email : undefined,
              hasContactEmail: priv.hasEmail,
            },
            // Invoicing terms are agreed with an agent, never collected at a checkout — but
            // the invoice has to reach somebody, and that is the person who just paid.
            invoicing: { hasInvoiceEmail: priv.hasEmail, invoiceEmail: priv.hasEmail ? priv.email : undefined },
          }
        : {
            type: 'private',
            firstName: priv.firstName, lastName: priv.lastName,
            dateOfBirth: priv.dateOfBirth || undefined,
            gender: priv.gender || undefined,
            nationality: priv.nationality,
            hasEmail: priv.hasEmail, email: priv.hasEmail ? priv.email : undefined,
            phone: priv.phone,
            address,
          };

      const passengers = travellers.map((t, i) => ({
        title: titleFor(t.gender) || undefined, firstName: t.firstName, lastName: t.lastName,
        gender: t.gender || undefined, dateOfBirth: t.dateOfBirth,
        nationality: t.nationality || undefined, isLead: i === 0,
      }));

      const api = booking.api || {};
      // The identifiers from the LAST SUCCESSFUL check, not from the search. After an accepted
      // re-price the rateKey, room and board are the ones quoted for the corrected ages — send
      // the old ones and the supplier would book a room priced for a child who doesn't exist,
      // while the server's own re-price (which reads these dates of birth) rejects the total.
      const hotelPayload = api.hotel
        ? {
            ...api.hotel,
            rateKey: quote.rateKey ?? api.hotel.rateKey,
            roomCode: quote.roomCode ?? api.hotel.roomCode,
            boardCode: quote.boardCode ?? api.hotel.boardCode,
            price: quote.hotel || api.hotel.price,
            // What the customer was SHOWN about this rate. The server refuses to create the
            // booking when this is true and the matching consent is absent, so the record can
            // never disagree with the screen.
            nonRefundable,
          }
        : null;
      // Flight price must reflect the ACTUAL travellers entered at checkout, not the
      // search-time pax count. For a flights-only booking the flight line total is
      // (per-person price × travellers) + any per-person extras = `base + roomExtraTotal`.
      // For packages the flight/hotel payloads already carry their own full totals, so
      // we leave them untouched.
      const flightPayload = api.flight
        ? {
            ...api.flight,
            flightKeys: quote.flightKeys ?? api.flight.flightKeys,
            price: hotelPayload ? (quote.flight || api.flight.price) : (base + roomExtraTotal),
          }
        : null;
      // Transfer price is per vehicle — fixed regardless of the traveller count. The backend
      // independently re-prices it by re-running availability with these same params, which
      // is also how it gets a fresh (unexpired) rateKey for the reservation. The flight
      // number and airline come off the arrival leg: the supplier needs them to know which
      // plane the driver is meeting.
      const outLegs = api.flight?.legs || [];
      const arrivalLeg = outLegs.length
        ? outLegs[(api.flight?.tripType === 'roundtrip' ? Math.ceil(outLegs.length / 2) : outLegs.length) - 1]
        : null;
      const transferPayload = pickedTransfer
        ? {
            fromType: 'IATA', fromCode: srch.destination,
            toType: 'ATLAS', toCode: String(api.hotel?.hotelCode || booking.hotelCode),
            // The EXACT datetime the shown price was fetched with — the rateKey encodes it
            // as the booked pickup time.
            outbound: transfers?.pickupISO || `${srch.checkin}T12:00:00`,
            price: pickedTransfer.price, currency: 'EUR',
            rateKey: pickedTransfer.rateKey,
            transferType: pickedTransfer.transferType, vehicleCode: pickedTransfer.vehicleCode,
            vehicle: pickedTransfer.vehicle, direction: pickedTransfer.direction,
            from: pickedTransfer.pickup?.from, to: pickedTransfer.pickup?.to,
            flightNumber: (arrivalLeg?.flightNumber || '').slice(0, 7) || undefined,
            companyName: arrivalLeg?.airline || undefined,
          }
        : (api.transfer || null);
      // One entry per POLICY. The server re-prices each from the same rate card with the count
      // it was sold for, so travel cover taken by two of four travellers is charged for two —
      // not for the party, and not for one.
      const insurancesPayload = [
        cancelAmount > 0 && { type: 'cancel', label: cancelOption?.label || 'Cancellation insurance', pax, price: cancelAmount },
        travelAmount > 0 && { type: 'travel', label: travelOption?.label || 'Travel insurance', pax: travelCount, price: travelAmount },
      ].filter(Boolean);
      // Kept for older readers of the booking: the first policy.
      const insurancePayload = insurancesPayload[0] || null;
      const contactPhone = priv.phone;

      // What the customer agreed to, in the words they were shown, with the moment they
      // agreed. A tick in a database column is not evidence; the text is.
      const acceptedAt = new Date().toISOString();
      const consents = [
        { code: TERMS_CONSENT.code, version: TERMS_CONSENT.version, text: TERMS_CONSENT.accept, acceptedAt },
        ...(nonRefundable ? [{
          code: NR_CONSENT.code,
          version: NR_CONSENT.version,
          text: `${NR_CONSENT.notice} ${NR_CONSENT.accept}`,
          acceptedAt,
          // The rate it was accepted ABOUT — a re-price mid-checkout changes the terms, and
          // the audit trail has to say which room's terms these were.
          scope: { product: 'hotel', hotelCode: String(hotelPayload?.hotelCode || ''), rateKey: hotelPayload?.rateKey || null },
        }] : []),
      ];

      // Step 1 — create the booking
      const paymentMode = import.meta.env.VITE_PAYMENT_MODE || 'test';
      const createRes = await axiosInstance.post('/website/online-bookings', {
        mode: paymentMode,
        currency: ccy === '€' ? 'EUR' : ccy,
        customer,
        hotel: hotelPayload || undefined,
        flight: flightPayload || undefined,
        transfer: transferPayload || undefined,
        insurance: insurancePayload || undefined,
        insurances: insurancesPayload.length ? insurancesPayload : undefined,
        // What was added on top of the fare. Prices are sent for comparison only — the server
        // looks every line up in its own table and charges that.
        extras: extraLines.length ? extraLines.map(({ code, travellerIndex, direction, kg }) => ({ code, travellerIndex, direction, kg })) : undefined,
        extrasTotal: extrasTotal || undefined,
        // Booking & service fee (SGR) shown to the customer — recorded on the booking
        // so the stored grand total matches what was charged.
        serviceFee: SGR,
        passengers,
        // The number to ring, and the number to ring when that one cannot be reached — the
        // second is the whole point of asking for it, so it travels with the booking rather
        // than living only in a form the traveller closed.
        contact: { phone: contactPhone, emergencyPhone: priv.emergencyPhone || undefined },
        consents,
      });

      const created = createRes.data?.data || createRes.data || {};
      const bookingId = created.bookingId;
      const ref = created.bookingReference;
      if (!bookingId) throw new Error('Booking could not be created');

      let paidViaStripe = false;
      if (stripe && elements) {
        // Step 2 — create Stripe PaymentIntent.
        // In TEST mode, if the server has no Stripe configured (STRIPE_NOT_CONFIGURED),
        // fall back to the dummy-pay path instead of blocking the booking. In LIVE mode
        // this must surface as a real error — never silently fake a payment.
        let clientSecret;
        try {
          const intentRes = await axiosInstance.post(`/website/online-bookings/${bookingId}/create-payment-intent`);
          clientSecret = intentRes.data?.data?.clientSecret;
        } catch (intentErr) {
          const code = intentErr?.response?.data?.errorCode;
          if (paymentMode !== 'live' && code === 'STRIPE_NOT_CONFIGURED') {
            console.warn('[Checkout] Stripe not configured — using test dummy-pay fallback.');
          } else {
            throw intentErr;
          }
        }

        if (clientSecret) {
          // Where the customer returns after a redirect-based method (Bancontact /
          // iDEAL / PayPal). Stripe appends payment_intent & redirect_status; we add
          // bookingId + mode so the return page can finalise payment + supplier confirm.
          const returnUrl = `${window.location.origin}/checkout/return`
            + `?bookingId=${encodeURIComponent(bookingId)}&mode=${encodeURIComponent(paymentMode)}`;
          const payerName = (customerType === 'private'
            ? `${priv.firstName} ${priv.lastName}`
            : (pro.legalName || `${priv.firstName} ${priv.lastName}`)).trim();
          const billing_details = { name: payerName || card.name || undefined, email: customerEmail || undefined };

          if (payMethod === 'card') {
            // Card: no redirect — confirm inline, then record the payment here.
            // Card declines / authentication failures must propagate to the user.
            const cardEl = elements.getElement(CardNumberElement);
            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
              payment_method: { card: cardEl, billing_details },
            });
            if (error) throw new Error(error.message);
            if (paymentIntent.status !== 'succeeded') throw new Error('Payment was not completed');
            await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, {
              paymentIntentId: paymentIntent.id,
            });
            paidViaStripe = true;
          } else {
            // Redirect methods: Stripe sends the customer to the bank / PayPal and
            // back to returnUrl, where payment + supplier confirm are finalised. On a
            // successful redirect the browser navigates away and the code below never runs.
            let res;
            if (payMethod === 'bancontact') {
              res = await stripe.confirmBancontactPayment(clientSecret, { payment_method: { billing_details }, return_url: returnUrl });
            } else if (payMethod === 'ideal') {
              res = await stripe.confirmIdealPayment(clientSecret, { payment_method: { billing_details }, return_url: returnUrl });
            } else if (payMethod === 'paypal') {
              res = await stripe.confirmPayPalPayment(clientSecret, { return_url: returnUrl });
            } else {
              throw new Error('Unsupported payment method');
            }
            // Only reached if Stripe could NOT start the redirect (setup/validation error).
            if (res?.error) throw new Error(res.error.message);
            return; // redirect in progress; finally{} resets the button
          }
        } else if (payMethod !== 'card') {
          // Redirect methods require a real Stripe PaymentIntent (no dummy fallback).
          throw new Error('This payment method is temporarily unavailable. Please pay by card.');
        }
      }
      if (!paidViaStripe) {
        if (paymentMode === 'live') throw new Error('Payment could not be processed. Please try again.');
        await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, { mode: 'test' });
      }

      // Step 5 — reserve with suppliers + confirm.
      // Payment has already succeeded here, so a confirm failure must NOT look like a
      // payment failure — but it also must NOT be silently hidden. We flag the booking
      // as "pending finalisation" so the success screen tells the customer the truth.
      try {
        await axiosInstance.post(`/website/online-bookings/${bookingId}/confirm`, { mode: paymentMode });
      } catch (confErr) {
        console.error('[Checkout] confirm/reservation step failed:', confErr?.response?.data?.message || confErr.message);
        setReservationPending(true);
      }

      setBookingRef(ref || `SSK-${Date.now().toString(36).toUpperCase().slice(-6)}`);
      setPaid(true);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Payment failed. Please try again.';
      flashErrors({ submit: msg });
    } finally {
      setPaying(false);
    }
  };

  const brand = detectBrand(card.number);
  // One person filled this in, company booking or not — there is no second set of contact
  // fields to choose between any more.
  const customerEmail = priv.email;
  const contactPhoneShown = priv.phone;
  // What the confirmation screen prints as "the cover you took".
  const selIns = insAmount > 0
    ? {
        id: cancelAmount && travelAmount ? 'both' : cancelAmount ? 'cancel' : 'travel',
        name: [cancelAmount && (cancelOption?.label || 'Cancellation insurance'),
          travelAmount && (travelOption?.label || 'Travel insurance')].filter(Boolean).join(' + '),
        covers: [],
      }
    : null;

  /* primary CTA per step (shared by bottom bar + mobile bar) */
  const ctaLabel = repriceBlocks && reprice.status === 'checking' ? 'Re-checking your price…'
    : step === 0 ? 'Continue to add-ons'
    : step === 1 ? 'Continue to payment'
    : `Pay ${money(total)}`;
  const ctaAction = step === 2 ? pay : next;
  // One rule for every way forward (button, mobile bar): an outstanding re-check, an
  // unaccepted new price or an unavailable party stops the traveller here, at the panel that
  // explains why, rather than at the payment sheet.
  const ctaBlocked = paying || repriceBlocks;

  /* ═══ full-page confirmation after payment ═══ */
  if (paid) {
    return (
      <Confirmation
        booking={booking}
        bookingRef={bookingRef}
        travellers={travellers}
        customerType={customerType}
        priv={priv}
        pro={pro}
        insurance={selIns}
        insAmount={insAmount}
        holderIsLead={holderIsLead}
        holder={holder}
        payMethod={payMethod}
        card={card}
        idealBank={idealBank}
        pricing={{ base, roomExtraTotal, transferTotal, sgr: SGR, total, pax }}
        ccy={ccy}
        reservationPending={reservationPending}
        nonRefundable={nonRefundable}
      />
    );
  }

  /* ═══ nothing to check out ═══
     Router state is lost on refresh, so this is the state a customer lands in when they
     reload mid-checkout. It must never resolve to somebody else's holiday. */
  if (!hasBooking) {
    return (
      <div className="ck">
        <div className="ck-gone">
          <div className="ck-gone-ico">{ICON.briefcase}</div>
          <h1 className="ck-gone-title hd">There’s no booking to pay for</h1>
          <p className="ck-gone-sub">
            Checkout details aren’t kept when a page is reloaded. Nothing has been charged —
            open your hotel again and re-check availability to pick your dates back up.
          </p>
          <div className="ck-gone-actions">
            <button type="button" className="ck-gone-btn" onClick={() => navigate('/results')}>Back to search</button>
            <button type="button" className="ck-gone-link" onClick={() => navigate('/')}>Go to homepage</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ck">
      {/* ═══ HERO ═══ */}
      <header className="ck-hero">
        <div className="ck-hero-bg"><span className="ck-hero-glow" /><span className="ck-hero-grid" /></div>
        <div className="ck-hero-inner">
          <div className="ck-bc">
            <Link to="/">Home</Link><span className="ck-bc-sep">›</span>
            <a onClick={() => navigate(-1)}>{booking.hotelName}</a><span className="ck-bc-sep">›</span>
            <span className="ck-bc-here">Checkout</span>
          </div>
          <div className="ck-hero-row">
            <div className="ck-hero-left">
              <div className="ck-eyebrow">{ICON.lock} Secure checkout</div>
              <h1 className="ck-title hd">Complete your booking</h1>
              <p className="ck-hero-sub">You're moments away from {isFlight ? 'your flight' : isTransfer ? 'your transfer' : booking.hotelName} — {(booking.loc || '').split(',')[0]}</p>
            </div>
            <div className="ck-hero-badges">
              <span className="ck-hbadge">{ICON.shieldCheck} SGR guaranteed</span>
              <span className="ck-hbadge">{ICON.lock} 256-bit SSL</span>
              <span className="ck-hbadge">{ICON.check} Instant confirmation</span>
            </div>
          </div>
        </div>
      </header>

      <div className="ck-main">
        {/* ═══ STEPPER ═══ */}
        <div className="ck-stepper-wrap">
          <div className="ck-stepper">
            {STEPS.map((s, i) => (
              <Fragment key={s.id}>
                <button
                  className={`ck-step${i === step ? ' act' : ''}${i < step ? ' done' : ''}${i <= furthest ? ' reach' : ''}`}
                  onClick={() => goStep(i)}>
                  <span className="ck-step-dot">{i < step ? ICON.check : s.icon}</span>
                  <span className="ck-step-meta">
                    <span className="ck-step-name hd">{i + 1}. {s.name}</span>
                    <span className="ck-step-sub">{s.sub}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && <span className={`ck-step-line${i < step ? ' done' : ''}`} />}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="ck-grid">
          {/* ═══ LEFT — STEP PANES ═══ */}
          <div className="ck-col" ref={paneRef}>
            <div key={step} className={`ck-pane ${dir === 1 ? 'ck-fwd' : 'ck-back'}`}>

              {/* ──────── STEP 1 : INFO ──────── */}
              {step === 0 && (
                <>
                  {isAuthenticated ? (
                    <div className="ck-auth-banner ck-reveal">
                      <div className="ck-auth-avatar">{(user?.firstName || 'U').slice(0, 1).toUpperCase()}{(user?.lastName || '').slice(0, 1).toUpperCase()}</div>
                      <div className="ck-auth-text">
                        <b>Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!</b>
                        <span>We've pre-filled your customer details from your account — just review and complete what's missing.</span>
                      </div>
                      <span className="ck-auth-check">{ICON.check}</span>
                    </div>
                  ) : (
                    <div className="ck-signin-invite ck-reveal">
                      <div className="ck-si-ico">{ICON.sparkle}</div>
                      <div className="ck-auth-text">
                        <b>Have a SunSky account?</b>
                        <span>Sign in and we'll fill in your customer details automatically.</span>
                      </div>
                      <button className="ck-si-btn" onClick={() => navigate('/login')}>{ICON.user} Sign in</button>
                    </div>
                  )}

                  {/* ── Contact person details ──
                      One form. The private/professional tabs are gone: a traveller does not
                      arrive thinking "which kind of customer am I", and making them choose
                      before typing anything sent half of them into a nine-field company form
                      they did not need. It is the same shape as signup now — the person, then
                      an optional "I am a business customer" tick that asks the two things a
                      company can always answer and registers them as a professional customer
                      exactly as signup does.

                      Boxed fields (label inside the frame) for this card only: it is the
                      densest form on the site and the label-above layout doubled its height. */}
                  <section className="ck-card ck-reveal">
                    <div className="ck-card-head">
                      <div className="ck-ico">{isCompany ? ICON.briefcase : ICON.user}</div>
                      <div className="ck-card-titles">
                        <h2 className="ck-card-title hd">Contact person details</h2>
                        <p className="ck-card-sub">The person we contact about this booking</p>
                      </div>
                    </div>

                    <label className={`ck-biz${isCompany ? ' on' : ''}`}>
                      <input type="checkbox" checked={isCompany}
                        onChange={(e) => { setIsCompany(e.target.checked); setErrors({}); }} />
                      <span className="ck-biz-box">{isCompany && ICON.check}</span>
                      <span className="ck-biz-text">
                        <b>I am a business customer</b>
                        <span>Booking on behalf of a company. You stay the contact person on the booking.</span>
                      </span>
                      <span className="ck-biz-ico">{ICON.briefcase}</span>
                    </label>

                    <div className="ck-form ck-boxed">
                      {isCompany && (
                        <div className="ck-row">
                          <Field label="Company name" req err={errors['pro.legalName']} ok={!!pro.legalName.trim()}>
                            <input className="ck-input" value={pro.legalName} onChange={(e) => setB('legalName')(e.target.value)} placeholder="SunSky Travel BV" maxLength={150} />
                          </Field>
                          <Field label="VAT number" req err={errors['pro.vatNumber']} ok={pro.vatNumber.trim().length > 2}>
                            <input className="ck-input" value={pro.vatNumber} onChange={(e) => setB('vatNumber')(e.target.value)} placeholder="BE 0123.456.789" maxLength={50} />
                          </Field>
                        </div>
                      )}

                      {/* Identity. When traveller 1 is also the booker these four follow
                          that traveller and are shown read-only — the same person is not
                          asked for the same name twice. Everything the traveller form does
                          NOT hold (company, address, phone, email, emergency contact) is
                          still filled in here, whatever the tick says. */}
                      <div className="ck-row">
                        <Field label="First name" req err={errors['priv.firstName']} ok={!!priv.firstName.trim()}
                          hint={leadIsBooker ? 'From traveller 1' : undefined}>
                          <input className="ck-input" value={priv.firstName} readOnly={leadIsBooker}
                            onChange={(e) => setP('firstName')(e.target.value)} placeholder="John" maxLength={100} />
                        </Field>
                        <Field label="Last name" req err={errors['priv.lastName']} ok={!!priv.lastName.trim()}
                          hint={leadIsBooker ? 'From traveller 1' : undefined}>
                          <input className="ck-input" value={priv.lastName} readOnly={leadIsBooker}
                            onChange={(e) => setP('lastName')(e.target.value)} placeholder="Doe" maxLength={100} />
                        </Field>
                      </div>

                      <div className="ck-row">
                        <Field label="Gender" err={errors['priv.gender']} ok={!!priv.gender}
                          hint={leadIsBooker ? 'From traveller 1' : undefined}>
                          <select className="ck-input ck-select" value={priv.gender} disabled={leadIsBooker}
                            onChange={(e) => setP('gender')(e.target.value)}>
                            <option value="">Select…</option>
                            {GENDERS_CUSTOMER.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                          </select>
                        </Field>
                        <Field label="Date of birth" err={errors['priv.dateOfBirth']} ok={!!priv.dateOfBirth}
                          hint={leadIsBooker ? 'From traveller 1' : undefined}>
                          <input className="ck-input" type="date" value={priv.dateOfBirth} max={TODAY_ISO}
                            readOnly={leadIsBooker}
                            onChange={(e) => setP('dateOfBirth')(e.target.value)} />
                        </Field>
                      </div>

                      <div className="ck-row">
                        <Field label="Nationality" req err={errors['priv.nationality']} ok={!!priv.nationality}
                          hint={leadIsBooker ? 'From traveller 1' : undefined}>
                          <select className="ck-input ck-select" value={priv.nationality} disabled={leadIsBooker}
                            onChange={(e) => setP('nationality')(e.target.value)}>
                            <option value="">Select…</option>
                            {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </Field>
                        <span />
                      </div>
                    </div>
                  </section>

                  {/* ── Address ──
                      Its own card, because it is a different kind of fact from a name and
                      because a company booking addresses the COMPANY. The ways to reach this
                      person live here too: they are the booking's contact details, not the
                      traveller's identity. */}
                  <section className="ck-card ck-reveal">
                    <div className="ck-card-head">
                      <div className="ck-ico">{ICON.pin}</div>
                      <div className="ck-card-titles">
                        <h2 className="ck-card-title hd">Address</h2>
                        <p className="ck-card-sub">{isCompany ? 'Company address' : 'Where we send the invoice'}</p>
                      </div>
                    </div>

                    <div className="ck-form ck-boxed">
                      <div className="ck-row-3">
                        <Field label="Street name" span={2} req err={errors['priv.street']} ok={!!priv.street.trim()}>
                          <input className="ck-input" value={priv.street} onChange={(e) => setP('street')(e.target.value)} placeholder="Rue de la Loi" maxLength={255} />
                        </Field>
                        <Field label="House no." req err={errors['priv.houseNumber']} ok={!!priv.houseNumber.trim()}>
                          <input className="ck-input" value={priv.houseNumber} onChange={(e) => setP('houseNumber')(e.target.value)} placeholder="42" maxLength={20} />
                        </Field>
                        <Field label="Box no." hint="Apartment, suite or bus">
                          <input className="ck-input" value={priv.boxNumber} onChange={(e) => setP('boxNumber')(e.target.value)} placeholder="3A" maxLength={20} />
                        </Field>
                      </div>
                      <div className="ck-row-3">
                        <Field label="Postal code" req err={errors['priv.postalCode']} ok={!!priv.postalCode.trim()}>
                          <input className="ck-input" value={priv.postalCode} onChange={(e) => setP('postalCode')(e.target.value)} placeholder="1000" maxLength={20} />
                        </Field>
                        <Field label="City" req err={errors['priv.city']} ok={!!priv.city.trim()}>
                          <input className="ck-input" value={priv.city} onChange={(e) => setP('city')(e.target.value)} placeholder="Brussels" maxLength={100} />
                        </Field>
                        {/* Required, as at signup: it is the invoice country, and a company
                            record cannot be created without one. */}
                        <Field label="Country" req err={errors['priv.country']} ok={!!priv.country}>
                          <select className="ck-input ck-select" value={priv.country} onChange={(e) => setP('country')(e.target.value)}>
                            <option value="">Select…</option>
                            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                      </div>

                      <div className="ck-row">
                        <Field label="Phone number" req err={errors['priv.phone']} ok={phoneOk(priv.phone)}
                          hint="International format, e.g. +32 475 12 34 56">
                          <input className="ck-input" type="tel" value={priv.phone} onChange={(e) => setP('phone')(e.target.value)} placeholder="+32 475 12 34 56" maxLength={30} />
                        </Field>
                        <Field label="Email address" req err={errors['priv.email']} ok={emailOk(priv.email) && emailTaken === false}>
                          <input className="ck-input" type="email" value={priv.email} onChange={(e) => setP('email')(e.target.value)} placeholder="john@example.com" />
                        </Field>
                      </div>

                      {/* This address already has a login. Said once, plainly, with the two
                          things that actually help — and nothing about the account itself:
                          not the name on it, not when it was made. Whoever typed the address
                          learns only what they would learn by trying to sign in. */}
                      {emailTaken === true && (
                        <div className="ck-email-known" role="status">
                          <span className="ck-email-known-ico">{ICON.user}</span>
                          <div className="ck-email-known-text">
                            <b>An account already exists with this email address.</b>
                            <span>Please log in to continue — we'll bring your details into this booking.</span>
                          </div>
                          <div className="ck-email-known-btns">
                            <button type="button" className="ck-email-login" onClick={() => goSignIn('/login')}>
                              Log in
                            </button>
                            <button type="button" className="ck-email-forgot" onClick={() => goSignIn('/forgot-password')}>
                              Forgot your password?
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Someone to call who is NOT on the trip. Required, because the moment
                          it is needed is the moment nobody has time to look for it. */}
                      <Field label="Emergency contact phone number" req
                        err={errors['priv.emergencyPhone']} ok={phoneOk(priv.emergencyPhone)}
                        hint="Someone we can reach who is not travelling with you">
                        <input className="ck-input" type="tel" value={priv.emergencyPhone}
                          onChange={(e) => setP('emergencyPhone')(e.target.value)}
                          placeholder="+32 476 98 76 54" maxLength={30} />
                      </Field>
                    </div>
                  </section>

                  {/* travellers */}
                  <section className="ck-card ck-reveal">
                    <div className="ck-card-head">
                      <div className="ck-ico">{ICON.users}</div>
                      <div className="ck-card-titles">
                        <h2 className="ck-card-title hd">Travellers <span className="ck-count-badge">{pax}</span></h2>
                        <p className="ck-card-sub">Enter names exactly as they appear in the passport</p>
                      </div>
                    </div>

                    {travellers.map((t, i) => {
                      const at = t.dateOfBirth ? ageType(t.dateOfBirth) : null;
                      return (
                        <div className="ck-trav" key={i} style={{ animationDelay: `${i * 0.07}s` }}>
                          {/* The heading names the person as they will appear on the ticket —
                              "Traveller 2 — Mr Ilhan Vanli" — so a party of four never becomes
                              four identical blocks of fields. The courtesy title comes from the
                              gender rather than from a fourth dropdown nobody wants to fill. */}
                          <div className="ck-trav-head">
                            <div className="ck-trav-av">{i + 1}</div>
                            <div className="ck-trav-name hd">
                              Traveller {i + 1}
                              {(t.firstName || t.lastName) && (
                                <span className="ck-trav-who"> — {[titleFor(t.gender), t.firstName, t.lastName].filter(Boolean).join(' ')}</span>
                              )}
                            </div>
                            {i === 0 && <span className="ck-lead-badge">{ICON.sparkle} Lead</span>}
                            {at && <span className={`ck-age-badge ${at.code.toLowerCase()}`} key={at.code}>{at.label}</span>}
                          </div>

                          {/* Only on traveller 1, and only ever ONE direction: what is typed
                              here fills the booker above. Nobody types their own name twice.
                              Unticking makes the booker's details independent again — the two
                              are the same person by default, not by assumption. */}
                          {i === 0 && (
                            <label className={`ck-biz ck-leadbook${leadIsBooker ? ' on' : ''}`}>
                              <input type="checkbox" checked={leadIsBooker}
                                onChange={(e) => setLeadIsBooker(e.target.checked)} />
                              <span className="ck-biz-box">{leadIsBooker && ICON.check}</span>
                              <span className="ck-biz-text">
                                <b>This traveller is also the lead booker</b>
                                <span>The lead booker details will be filled in automatically using this traveller's details.</span>
                              </span>
                            </label>
                          )}

                          {/* Labels ABOVE the field here, not inside it. A boxed label is fine
                              over one input; over three side-by-side date lists it collides
                              with the first one and the row stops reading as a single date.
                              The tick sits OUTSIDE the control, in a column of its own, so
                              nothing shifts sideways when it appears. */}
                          <div className="ck-tvf-grid">
                            <div className={`ck-tvf ck-tvf-full${errors[`t${i}.gender`] ? ' ck-err' : ''}`}>
                              <label className="ck-tvf-label">Gender <span className="ck-req">*</span></label>
                              <GenderPick name={`ck-gender-${i}`} value={t.gender} onChange={setT(i, 'gender')} />
                              {errors[`t${i}.gender`] && <div className="ck-errmsg">{errors[`t${i}.gender`]}</div>}
                            </div>

                            <TravField label="First name" req err={errors[`t${i}.firstName`]} ok={!!t.firstName.trim()}>
                              <input className="ck-input" value={t.firstName} onChange={(e) => setT(i, 'firstName')(e.target.value)} placeholder="As in passport" maxLength={100} />
                            </TravField>
                            <TravField label="Last name" req err={errors[`t${i}.lastName`]} ok={!!t.lastName.trim()}>
                              <input className="ck-input" value={t.lastName} onChange={(e) => setT(i, 'lastName')(e.target.value)} placeholder="As in passport" maxLength={100} />
                            </TravField>

                            {/* A child whose date of birth came from the search opens READ-ONLY.
                                That date is what the stay and the fare were priced on, so it is
                                not a field to be casually retyped — but it is also the one thing
                                a traveller might genuinely need to fix, so there is a way in,
                                behind a warning that says what will happen. */}
                            <TravField label="Date of birth" req err={errors[`t${i}.dateOfBirth`]}
                              ok={!t.dobLocked && !!t.dateOfBirth}
                              hint={t.dobLocked ? 'From your search — this set the price'
                                : t.searchDob ? 'Changing this re-checks price and availability'
                                : t.isSearchChild && t.searchAge != null
                                  ? `Priced as a ${t.searchAge}-year-old — another age re-checks the price`
                                  : undefined}>
                              {t.dobLocked ? (
                                <div className="ck-dob-lock">
                                  <span className="ck-dob-val">{dmy(t.dateOfBirth)}</span>
                                  <span className="ck-dob-age">{ageType(t.dateOfBirth).label}</span>
                                  <button type="button" className="ck-dob-change" onClick={() => setDobPrompt(i)}>
                                    Change
                                  </button>
                                </div>
                              ) : (
                                <input className="ck-input" type="date" value={t.dateOfBirth}
                                  max={TODAY_ISO}
                                  autoFocus={dobUnlocked === i}
                                  onChange={(e) => setT(i, 'dateOfBirth')(e.target.value)} />
                              )}
                            </TravField>
                            <TravField label="Nationality" req err={errors[`t${i}.nationality`]} ok={!!t.nationality}>
                              <select className="ck-input ck-select" value={t.nationality} onChange={(e) => setT(i, 'nationality')(e.target.value)}>
                                <option value="">Select…</option>
                                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </TravField>
                          </div>

                          {/* The warning the traveller sees BEFORE the field opens — the whole
                              point is that changing this is not free, and saying so afterwards
                              would be too late. Wording is the client's. */}
                          {dobPrompt === i && (
                            <div className="ck-dob-warn" role="alertdialog" aria-labelledby={`ck-dobw-${i}`}>
                              <div className="ck-dob-warn-head">
                                <span className="ck-dob-warn-ico">{ICON.clock}</span>
                                <p id={`ck-dobw-${i}`}>
                                  Changing the date of birth may affect the price or availability of your
                                  trip. We will check this automatically before you continue.
                                </p>
                              </div>
                              <div className="ck-dob-warn-btns">
                                <button type="button" className="ck-dob-keep" onClick={() => setDobPrompt(null)}>
                                  Keep {dmy(t.searchDob)}
                                </button>
                                <button type="button" className="ck-dob-go" onClick={() => unlockDob(i)}>
                                  Change date of birth
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}

                    {/* ── what the supplier said about the corrected party ──
                        Every branch of the spec lands here: waiting, unchanged, dearer or
                        cheaper, gone, or unreachable. The traveller stays in the checkout in
                        all of them — nothing sends them back to the search. */}
                    {reprice && (
                      <div className={`ck-rp ck-rp-${reprice.status}`} role="status" aria-live="polite">
                        {reprice.status === 'checking' && (
                          <div className="ck-rp-row">
                            <span className="ck-spin ck-rp-spin" />
                            <div>
                              <b>Re-checking price and availability…</b>
                              <span>The dates of birth changed, so we are asking the hotel{booking.api?.flight ? ' and the airline' : ''} again. You can finish the rest of the form meanwhile.</span>
                            </div>
                          </div>
                        )}
                        {(reprice.status === 'same' || reprice.status === 'accepted') && (
                          <div className="ck-rp-row">
                            <span className="ck-rp-ok">{ICON.check}</span>
                            <div>
                              <b>{reprice.status === 'same' ? 'Your price is unchanged' : 'New price accepted'}</b>
                              <span>Confirmed for the updated traveller details{reprice.status === 'accepted' ? ` — ${money(total)} total` : ''}.</span>
                            </div>
                          </div>
                        )}
                        {reprice.status === 'changed' && (
                          <>
                            <div className="ck-rp-row">
                              <span className="ck-rp-warn">{ICON.clock}</span>
                              <div>
                                <b>The price for this holiday has changed</b>
                                <span>The updated dates of birth change what the supplier charges. Accept the new price to continue, or put the original date back.</span>
                              </div>
                            </div>
                            <div className="ck-rp-prices">
                              <span className="ck-rp-was">{money(reprice.was + roomExtraTotal + transferTotal + SGR + insAmount)}</span>
                              <span className="ck-rp-arrow">{ICON.arrow}</span>
                              <span className="ck-rp-now">{money(reprice.now + roomExtraTotal + transferTotal + SGR + insAmount)}</span>
                              <span className={`ck-rp-diff${reprice.now > reprice.was ? ' up' : ' down'}`}>
                                {reprice.now > reprice.was ? '+' : '−'}{money(Math.abs(reprice.now - reprice.was))}
                              </span>
                            </div>
                            <div className="ck-rp-btns">
                              <button type="button" className="ck-rp-restore" onClick={restoreSearchDob}>Keep the original date</button>
                              <button type="button" className="ck-rp-accept" onClick={acceptNewPrice}>Accept the new price</button>
                            </div>
                          </>
                        )}
                        {reprice.status === 'unavailable' && (
                          <>
                            <div className="ck-rp-row">
                              <span className="ck-rp-no">{ICON.ban}</span>
                              <div>
                                <b>This trip is not available for the updated traveller details</b>
                                <span>
                                  {reprice.reason === 'flight'
                                    ? 'The airline has no seats for this party on these flights.'
                                    : 'The hotel has no room for this party on these dates.'}
                                  {' '}You can put the original date of birth back, or change your dates on the hotel page.
                                </span>
                              </div>
                            </div>
                            <div className="ck-rp-btns">
                              <button type="button" className="ck-rp-restore" onClick={restoreSearchDob}>Put the original date back</button>
                              <button type="button" className="ck-rp-accept" onClick={() => navigate(-1)}>Change dates</button>
                            </div>
                          </>
                        )}
                        {reprice.status === 'error' && (
                          <>
                            <div className="ck-rp-row">
                              <span className="ck-rp-warn">{ICON.ban}</span>
                              <div>
                                <b>{reprice.message}</b>
                                <span>We will not take a payment on a price we could not verify. Try again in a moment.</span>
                              </div>
                            </div>
                            <div className="ck-rp-btns">
                              <button type="button" className="ck-rp-restore" onClick={restoreSearchDob}>Put the original date back</button>
                              <button type="button" className="ck-rp-accept" onClick={() => runReprice(currentChildAges)}>Try again</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* ──────── STEP 2 : ADD-ONS ────────
                  Baggage first (it belongs to the flight the traveller just chose), then the
                  transfer, then the two insurance decisions. The client's order. */}
              {step === 1 && hasFlight && bagRates?.enabled !== false && (
                <>
                  {/* A. Personal item — stated, never sold: every fare carries one, and an
                      "add" button next to something already included is a trap. */}
                  {bagRates?.personalItem?.included !== false && (
                    <BaggageCard
                      icon={ICON.bag}
                      title={bagRates?.personalItem?.label || 'Personal item'}
                      note={bagRates?.personalItem?.note || 'A small personal item that fits under the seat in front of you.'}
                      legend={<><span className="ck-lg ok">{ICON.check} Included in your ticket</span></>}>
                      {travellers.map((t, i) => (
                        <BagTraveller key={i} index={i} name={travellerName(t)}>
                          {directions.map((d) => (
                            <div className="ck-bagrow" key={d.key}>
                              <span className="ck-bagrow-dir">{d.icon} {d.label}</span>
                              <span className="ck-bagrow-item">{ICON.bag} {bagRates?.personalItem?.label || 'Personal item'}</span>
                              <span className="ck-bagrow-state"><span className="ck-chip-inc">Included</span>{ICON.checkCircle}</span>
                            </div>
                          ))}
                        </BagTraveller>
                      ))}
                    </BaggageCard>
                  )}

                  {/* B. Cabin baggage. Included when the fare states a hand allowance OR when
                      it carries hold baggage — a ticket with a suitcase has a cabin bag, and
                      Airtuerk reports handLuggage as 0 on every option, so reading it
                      literally would sell a bag the traveller already has. An airline that
                      offers extra cabin bags is offered here too, even on an included row. */}
                  {(cabinAddOns.length > 0 || bagKnown) && (
                    <BaggageCard
                      icon={ICON.cabinBag}
                      title={bagRates?.cabin?.label || 'Cabin baggage'}
                      note={bagRates?.cabin?.note || 'A cabin bag that is stored in the overhead compartment.'}
                      legend={<><span className="ck-lg ok">{ICON.check} Included in your ticket</span><span className="ck-lg add">{ICON.plusCircle} Available to add</span>{addOnsAreOurs && <span className="ck-lg note">Extra bags are arranged by SUNSKY after booking</span>}</>}>
                      {travellers.map((t, i) => (
                        <BagTraveller key={i} index={i} name={travellerName(t)}>
                          {directions.map((d) => {
                            const added = !!bags[bagKey(i, d.key)]?.cabin;
                            const price = Number(cabinAddOns[0]?.price) || 0;
                            return (
                              <div className="ck-bagrow" key={d.key}>
                                <span className="ck-bagrow-dir">{d.icon} {d.label}</span>
                                <span className="ck-bagrow-item">{ICON.cabinBag} {bagRates?.cabin?.label || 'Cabin baggage'}</span>
                                <span className="ck-bagrow-state">
                                  {/* The state, then — separately — whether more can be bought.
                                      An included bag and a second bag are different questions. */}
                                  {cabinIncluded ? (
                                    <><span className="ck-chip-inc">Included{cabinIncludedKg ? ` · ${cabinIncludedKg} kg` : ''}</span>{ICON.checkCircle}</>
                                  ) : added ? (
                                    <span className="ck-chip-added">Added · {money(price)}</span>
                                  ) : (
                                    <span className="ck-chip-not">{bagKnown ? 'Not included' : 'Not confirmed'}</span>
                                  )}
                                  {added ? (
                                    <button type="button" className="ck-bag-remove" onClick={() => setBag(i, d.key, { cabin: false })}>Remove</button>
                                  ) : cabinAddOns.length > 0 ? (
                                    <button type="button" className="ck-bag-add" onClick={() => setBag(i, d.key, { cabin: true })}>
                                      + Add {cabinIncluded ? 'another cabin bag' : 'cabin baggage'} · {money(price)}
                                    </button>
                                  ) : null}
                                </span>
                              </div>
                            );
                          })}
                        </BagTraveller>
                      ))}
                    </BaggageCard>
                  )}

                  {/* C. Checked baggage — the allowance the fare carries, in the airline's own
                      kilos or pieces, and a weight menu wherever more can be bought: on a leg
                      with none, and on a leg that has some but allows a second bag. */}
                  {(checkedAddOns.length > 0 || bagKnown) && (
                    <BaggageCard
                      icon={ICON.checkedBag}
                      title="Checked baggage"
                      note="Baggage transported in the aircraft hold."
                      legend={<><span className="ck-lg ok">{ICON.check} Included in your ticket</span><span className="ck-lg add">{ICON.plusCircle} Available to add</span>{addOnsAreOurs && <span className="ck-lg note">Extra bags are arranged by SUNSKY after booking</span>}</>}>
                      {travellers.map((t, i) => (
                        <BagTraveller key={i} index={i} name={travellerName(t)}>
                          {directions.map((d) => {
                            const kg = checkedIncludedKg;
                            const pieces = checkedIncludedPieces;
                            const included = checkedIncluded;
                            const chosen = bags[bagKey(i, d.key)]?.checked;
                            return (
                              <div className="ck-bagrow" key={d.key}>
                                <span className="ck-bagrow-dir">{d.icon} {d.label}</span>
                                <span className="ck-bagrow-item">{ICON.checkedBag} Checked baggage</span>
                                <span className="ck-bagrow-state">
                                  {/* What the ticket carries, then — separately — what can be
                                      added. An included allowance does not end the question:
                                      a traveller with 20 kg may still want a second bag, and
                                      the airline (or our table) may sell one. */}
                                  {included ? (
                                    <><span className="ck-chip-inc">Included · {kg > 0 ? `${kg} kg` : `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`}</span>{ICON.checkCircle}</>
                                  ) : (
                                    <span className={chosen ? 'ck-chip-added' : 'ck-chip-not'}>
                                      {chosen ? `Added · ${chosen} kg` : (bagKnown ? 'Not included' : 'Not confirmed')}
                                    </span>
                                  )}
                                  {included && chosen ? (
                                    <span className="ck-chip-added">+ {chosen} kg</span>
                                  ) : null}
                                  {checkedAddOns.length > 0 && (
                                    <select className="ck-bag-select" value={chosen || ''}
                                      aria-label={`Add checked baggage for traveller ${i + 1}, ${d.label.toLowerCase()}`}
                                      onChange={(e) => setBag(i, d.key, { checked: e.target.value ? Number(e.target.value) : null })}>
                                      <option value="">+ Add {included ? 'more baggage' : 'checked baggage'}</option>
                                      {checkedAddOns.map((r) => (
                                        <option key={r.kg} value={r.kg}>{r.kg} kg — {money(r.price)}</option>
                                      ))}
                                    </select>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </BagTraveller>
                      ))}
                    </BaggageCard>
                  )}
                </>
              )}

              {step === 1 && wantsTransfer && (
                /* The airport transfer. One choice for everyone in the booking — the vehicle
                   carries the party, so it is priced per vehicle and never per traveller.
                   "No transfer" is the default: an opt-in extra that arrives pre-selected is
                   a charge nobody agreed to. */
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Choose your transfer</h2>
                      <p className="ck-card-sub">Select one transfer option for all travellers.</p>
                    </div>
                  </div>
                  <div className="ck-bagkind">
                    <span className="ck-bagkind-ico">{ICON.van}</span>
                    <div className="ck-bagkind-text">
                      <b>Airport transfer</b>
                      <span>
                        From {srch.destination} airport to {booking.hotelName}
                        {transfers?.pickupISO && arrivalISO ? ` — pickup ~${transfers.pickupISO.slice(11, 16)}, timed to your arrival` : ''}
                      </span>
                      <span className="ck-kind-chips">
                        <span className="ck-kind-chip">{ICON.users} {pax} traveller{pax === 1 ? '' : 's'}</span>
                        <span className="ck-kind-chip">{ICON.check} Arrival transfer</span>
                      </span>
                    </div>
                  </div>

                  {transfers?.loading ? (
                    <div className="ck-tr-wait"><span className="ck-spin" /> Checking transfer prices…</div>
                  ) : transfers?.error ? (
                    <div className="ck-tr-err">
                      {ICON.ban} <span>{transfers.error} You can still book — add a transfer later by contacting us.</span>
                    </div>
                  ) : transfers?.services?.length ? (
                    <div className="ck-tr-list">
                      {transfers.services.slice(0, 5).map((t, ti) => (
                        <button type="button" key={ti}
                          className={`ck-tr${transferPick === ti ? ' act' : ''}`}
                          onClick={() => setTransferPick(ti)}>
                          <span className="ck-tr-radio">{transferPick === ti && <i />}</span>
                          <span className="ck-tr-main">
                            <span className="ck-tr-name hd">
                              {t.vehicle || 'Transfer'}
                              <em>{t.transferType === 'SHARED' ? 'Shared' : 'Private'}</em>
                            </span>
                            <span className="ck-tr-sub">
                              {t.pickup?.from || `${srch.destination} Airport`} → {t.pickup?.to || booking.hotelName}
                              {t.maxPax ? ` · up to ${t.maxPax} passengers` : ''}
                            </span>
                          </span>
                          <span className="ck-tr-price">
                            <small>total</small>{money(t.price)}
                          </span>
                        </button>
                      ))}
                      <button type="button" className={`ck-tr${transferPick === -1 ? ' act' : ''}`}
                        onClick={() => setTransferPick(-1)}>
                        <span className="ck-tr-radio">{transferPick === -1 && <i />}</span>
                        <span className="ck-tr-main">
                          <span className="ck-tr-name hd">No transfer</span>
                          <span className="ck-tr-sub">I'll arrange my own way to the hotel</span>
                        </span>
                        <span className="ck-tr-price"><small>total</small>{money(0)}</span>
                      </button>
                      <p className="ck-tr-note">{ICON.check} Prices are for the whole party and cover the airport pickup on arrival day.</p>
                    </div>
                  ) : transfers ? (
                    <div className="ck-tr-err">{ICON.ban} <span>No transfers are offered for this hotel on your arrival date.</span></div>
                  ) : null}
                </section>
              )}

              {/* D. Cancellation insurance — ONE decision for the booking. If one traveller
                  cancels the holiday, the holiday is cancelled, so it is not a per-person
                  choice; the client's screen says exactly that and so does this. */}
              {step === 1 && cancelOption && (
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Cancellation insurance</h2>
                      <p className="ck-card-sub">Choose whether you would like cancellation insurance for all travellers.</p>
                    </div>
                  </div>
                  <div className="ck-bagkind">
                    <span className="ck-bagkind-ico">{ICON.shield}</span>
                    <div className="ck-bagkind-text">
                      <b>Protect your trip</b>
                      <span>One selection applies to all travellers in this booking.</span>
                      <span className="ck-kind-chips">
                        <span className="ck-kind-chip">{ICON.users} {pax} traveller{pax === 1 ? '' : 's'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="ck-tr-list">
                    <button type="button" className={`ck-tr${cancelIns === true ? ' act' : ''}`}
                      onClick={() => setCancelIns(true)}>
                      <span className="ck-tr-radio">{cancelIns === true && <i />}</span>
                      <span className="ck-tr-main">
                        <span className="ck-tr-name hd">{cancelOption.label}</span>
                        <span className="ck-tr-sub">{cancelOption.description || 'Cancellation insurance for all travellers'}</span>
                        {cancelOption.provider && <span className="ck-ins-by">Provided by {cancelOption.provider}</span>}
                      </span>
                      <span className="ck-tr-price">
                        <small>total</small>
                        {money(priceInsurance(cancelOption, { pax, nights: booking.nights, baseSubtotal: subtotal }))}
                      </span>
                    </button>
                    <button type="button" className={`ck-tr${cancelIns === false ? ' act' : ''}`}
                      onClick={() => setCancelIns(false)}>
                      <span className="ck-tr-radio">{cancelIns === false && <i />}</span>
                      <span className="ck-tr-main">
                        <span className="ck-tr-name hd">No cancellation insurance</span>
                        <span className="ck-tr-sub">Continue without cancellation cover</span>
                      </span>
                      <span className="ck-tr-price"><small>total</small>{money(0)}</span>
                    </button>
                  </div>
                  {cancelIns === null && <p className="ck-pick-note">Please select one option to continue.</p>}

                  {cancelOption.provider && (
                    <div className="ck-ins-legal">
                      {ICON.shield}
                      <p>
                        SUNSKY acts solely as an insurance intermediary. For complete information about
                        the insurance, its coverage, exclusions and policy terms, please refer to the
                        insurer's own documents.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* E. Travel insurance — PER TRAVELLER, because it insures a person: one of a
                  party may already be covered by a card or by a policy of their own. */}
              {step === 1 && travelOption && (
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Travel insurance</h2>
                      <p className="ck-card-sub">Choose travel insurance separately for each traveller.</p>
                    </div>
                  </div>
                  <div className="ck-bagkind">
                    <span className="ck-bagkind-ico">{ICON.umbrella}</span>
                    <div className="ck-bagkind-text">
                      <b>{travelOption.label}</b>
                      <span>{travelOption.description || 'Cover for you and your luggage while travelling.'}</span>
                      <span className="ck-kind-chips">
                        <span className="ck-kind-chip">{ICON.cal} {booking.nights} travel day{booking.nights === 1 ? '' : 's'}</span>
                        <span className="ck-kind-chip">{ICON.shieldCheck} {priceBasisLabel(travelOption, ccy)}</span>
                      </span>
                      <span className="ck-kind-note">Each traveller can make a different choice.</span>
                    </div>
                  </div>

                  {travellers.map((t, i) => {
                    const each = priceInsurance(travelOption, { pax: 1, nights: booking.nights, baseSubtotal: subtotal });
                    return (
                      <div className="ck-bagtrav" key={i}>
                        <div className="ck-bagtrav-head">
                          <span className="ck-bagtrav-n">{i + 1}</span>
                          <span className="ck-bagtrav-name hd">
                            Traveller {i + 1}{travellerName(t) ? <span className="ck-trav-who"> — {travellerName(t)}</span> : null}
                          </span>
                        </div>
                        <div className="ck-tr-list">
                          <button type="button" className={`ck-tr${travelIns[i] === true ? ' act' : ''}`}
                            onClick={() => setTravelIns((v) => ({ ...v, [i]: true }))}>
                            <span className="ck-tr-radio">{travelIns[i] === true && <i />}</span>
                            <span className="ck-tr-main">
                              <span className="ck-tr-name hd">{travelOption.label}</span>
                              <span className="ck-tr-sub">{priceBasisLabel(travelOption, ccy)} × {booking.nights} day{booking.nights === 1 ? '' : 's'}</span>
                              {travelOption.provider && <span className="ck-ins-by">Provided by {travelOption.provider}</span>}
                            </span>
                            <span className="ck-tr-price"><small>total</small>{money(each)}</span>
                          </button>
                          <button type="button" className={`ck-tr${travelIns[i] === false ? ' act' : ''}`}
                            onClick={() => setTravelIns((v) => ({ ...v, [i]: false }))}>
                            <span className="ck-tr-radio">{travelIns[i] === false && <i />}</span>
                            <span className="ck-tr-main">
                              <span className="ck-tr-name hd">No travel insurance</span>
                              <span className="ck-tr-sub">Continue without travel insurance</span>
                            </span>
                            <span className="ck-tr-price"><small>total</small>{money(0)}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {travellers.some((_, i) => travelIns[i] === undefined) && (
                    <p className="ck-pick-note">Please select one option for each traveller to continue.</p>
                  )}

                  {travelOption.provider && (
                    <div className="ck-ins-legal">
                      {ICON.shield}
                      <p>
                        SUNSKY acts solely as an insurance intermediary. For complete information about
                        the insurance, its coverage, exclusions and policy terms, please refer to the
                        insurer's own documents.
                      </p>
                    </div>
                  )}
                </section>
              )}


              {/* ──────── STEP 3 : OVERVIEW ────────
                  Everything about to be bought, in one place, before the card comes out. The
                  sidebar summary is a running total; this is the record — the same facts a
                  traveller will look for on the confirmation, in the same order. Nothing here
                  is decorative: every line is something they could still go back and change. */}
              {step === 2 && (
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-ico">{ICON.check}</div>
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Your trip</h2>
                      <p className="ck-card-sub">Please check these details before you pay</p>
                    </div>
                  </div>

                  <div className="ck-ov-grid">
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Accommodation</span>
                      <span className="ck-ov-v">{booking.hotelName}</span>
                    </div>
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Destination</span>
                      <span className="ck-ov-v">{booking.loc || '—'}</span>
                    </div>
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Travel start date</span>
                      <span className="ck-ov-v">{dmy(srch.checkin || booking.api?.hotel?.checkin) || booking.dateLabel}</span>
                    </div>
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Travel end date</span>
                      <span className="ck-ov-v">{dmy(srch.checkout || booking.api?.hotel?.checkout) || '—'}</span>
                    </div>
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Board</span>
                      {/* Still normalised through boardInfo so the WORDING is ours and
                          consistent ("All inclusive", never a supplier's stray spelling); the
                          capitals are applied in CSS on top. Uppercasing here instead would
                          put shouted text into `booking.board`, which is carried into the
                          reservation payload — the display is the only thing that changes. */}
                      <span className="ck-ov-v ck-caps">
                        {boardInfo(booking.api?.hotel?.boardCode, booking.board || booking.meal).label}
                      </span>
                    </div>
                    <div className="ck-ov-item">
                      <span className="ck-ov-k">Transport</span>
                      <span className="ck-ov-v">{booking.api?.flight ? 'Flight' : 'Own transport'}</span>
                    </div>
                  </div>

                  {booking.room && (
                    <div className="ck-ov-block">
                      <div className="ck-ov-title hd">Rooms</div>
                      <p className="ck-ov-line">
                        {Number(srch.rooms) > 1 ? `${srch.rooms} × ` : '1 × '}
                        <span className="ck-caps">{booking.room}</span>
                        {booking.board ? <> — <span className="ck-caps">{booking.board}</span></> : ''}
                      </p>
                    </div>
                  )}

                  {booking.flight && (
                    <div className="ck-ov-block">
                      <div className="ck-ov-title hd">Transport</div>
                      <div className="ck-ov-flights">
                        <div className="ck-ov-flight">
                          <span className="ck-ov-dir">Outbound</span>
                          <span className="ck-ov-line">
                            {booking.flight.outDate ? `${booking.flight.outDate} · ` : ''}
                            {booking.flight.outDep} {booking.flight.outFrom} → {booking.flight.outArr} {booking.flight.outTo}
                          </span>
                          {booking.flight.outAirline && <span className="ck-ov-sub">{booking.flight.outAirline}</span>}
                        </div>
                        {booking.flight.retDep && (
                          <div className="ck-ov-flight">
                            <span className="ck-ov-dir">Return</span>
                            <span className="ck-ov-line">
                              {booking.flight.retDate ? `${booking.flight.retDate} · ` : ''}
                              {booking.flight.retDep} {booking.flight.retFrom} → {booking.flight.retArr} {booking.flight.retTo}
                            </span>
                            {booking.flight.retAirline && <span className="ck-ov-sub">{booking.flight.retAirline}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="ck-ov-block">
                    <div className="ck-ov-title hd">Your details</div>
                    <p className="ck-ov-line">
                      {[travellers[0]?.title, travellers[0]?.firstName, travellers[0]?.lastName].filter(Boolean).join(' ')}
                      {travellers[0]?.dateOfBirth ? ` (${dmy(travellers[0].dateOfBirth)})` : ''}
                    </p>
                    <p className="ck-ov-sub">{customerEmail}{contactPhoneShown ? ` · ${contactPhoneShown}` : ''}</p>
                    {travellers.length > 1 && (
                      <p className="ck-ov-sub">
                        Travelling with {travellers.slice(1).map((t) => [t.firstName, t.lastName].filter(Boolean).join(' ') || 'traveller').join(', ')}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* ──────── STEP 3 : PAYMENT ──────── */}
              {step === 2 && (
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-ico">{ICON.card}</div>
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Payment</h2>
                      <p className="ck-card-sub">All transactions are encrypted and processed securely</p>
                    </div>
                    <div className="ck-secure-pill">{ICON.lock} Secure</div>
                  </div>

                  <div className="ck-pm-row">
                    {[
                      { id: 'card', label: 'Card', logo: <span className="ck-pm-cards"><i className="v">VISA</i><i className="m"><b /><b /></i></span> },
                      { id: 'ideal', label: 'iDEAL', logo: <span className="ck-pm-ideal">iDEAL</span> },
                      { id: 'bancontact', label: 'Bancontact', logo: <span className="ck-pm-bc">B<i>ancontact</i></span> },
                      { id: 'paypal', label: 'PayPal', logo: <span className="ck-pm-pp">Pay<i>Pal</i></span> },
                    ].map((m) => (
                      <button key={m.id} className={`ck-pm${payMethod === m.id ? ' act' : ''}`} onClick={() => { setPayMethod(m.id); setErrors({}); }}>
                        {m.logo}
                        <span className="ck-pm-label">{m.label}</span>
                        <span className="ck-pm-radio">{payMethod === m.id && <i />}</span>
                      </button>
                    ))}
                  </div>

                  {payMethod === 'card' && (
                    <div className="ck-cc-zone">
                      {/* animated card preview */}
                      <div className="ck-cc-wrap">
                        <div className={`ck-cc${cvcFocus ? ' flip' : ''}`}>
                          <div className="ck-cc-front">
                            <div className="ck-cc-top">
                              <span className="ck-cc-chip" />
                              <S size={26} sw={1.6}><path d="M5 12.55a11 11 0 0114.08 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></S>
                            </div>
                            <div className="ck-cc-num">{stripe ? '•••• •••• •••• ••••' : (card.number || '•••• •••• •••• ••••')}</div>
                            <div className="ck-cc-bottom">
                              <div><small>Card holder</small><span>{card.name || 'YOUR NAME'}</span></div>
                              <div><small>Expires</small><span>{stripe ? '••/••' : (card.expiry || 'MM/YY')}</span></div>
                              <div className={`ck-cc-brand ${stripe ? stripeBrand : brand}`}>
                                {(stripe ? stripeBrand : brand) === 'visa' && 'VISA'}
                                {(stripe ? stripeBrand : brand) === 'mastercard' && <span className="ck-mc"><b /><b /></span>}
                                {(stripe ? stripeBrand : brand) === 'amex' && 'AMEX'}
                                {(stripe ? stripeBrand : brand) === 'discover' && 'DISC'}
                              </div>
                            </div>
                          </div>
                          <div className="ck-cc-back">
                            <div className="ck-cc-mag" />
                            <div className="ck-cc-sig"><span>{stripe ? '•••' : (card.cvc || 'CVC')}</span></div>
                            <div className="ck-cc-back-note">Your CVC is the 3–4 digit code on the back of your card</div>
                          </div>
                        </div>
                      </div>

                      <div className="ck-pay-form">
                        <Field label="Cardholder name" req err={errors['card.name']}>
                          <input className="ck-input" value={card.name} onChange={(e) => { setCard((c) => ({ ...c, name: e.target.value.toUpperCase() })); setErrors((er) => ({ ...er, 'card.name': undefined })); }} placeholder="NAME ON CARD" />
                        </Field>
                        {stripe ? (
                          <>
                            <Field label="Card number" req err={errors['card.number']}>
                              <div className="ck-input ck-stripe-el">
                                <CardNumberElement options={{ style: STRIPE_ELEMENT_STYLE, showIcon: true }}
                                  onChange={(e) => {
                                    setStripeBrand(e.brand === 'unknown' ? '' : e.brand);
                                    setStripeReady((r) => ({ ...r, number: e.complete }));
                                    setErrors((er) => ({ ...er, 'card.number': e.error ? e.error.message : undefined }));
                                  }} />
                              </div>
                            </Field>
                            <div className="ck-row">
                              <Field label="Expiry date" req err={errors['card.expiry']}>
                                <div className="ck-input ck-stripe-el">
                                  <CardExpiryElement options={{ style: STRIPE_ELEMENT_STYLE }}
                                    onChange={(e) => {
                                      setStripeReady((r) => ({ ...r, expiry: e.complete }));
                                      setErrors((er) => ({ ...er, 'card.expiry': e.error ? e.error.message : undefined }));
                                    }} />
                                </div>
                              </Field>
                              <Field label="CVC" req err={errors['card.cvc']}>
                                <div className="ck-input ck-stripe-el">
                                  <CardCvcElement options={{ style: STRIPE_ELEMENT_STYLE }}
                                    onFocus={() => setCvcFocus(true)} onBlur={() => setCvcFocus(false)}
                                    onChange={(e) => {
                                      setStripeReady((r) => ({ ...r, cvc: e.complete }));
                                      setErrors((er) => ({ ...er, 'card.cvc': e.error ? e.error.message : undefined }));
                                    }} />
                                </div>
                              </Field>
                            </div>
                          </>
                        ) : (
                          <>
                            <Field label="Card number" req err={errors['card.number']}>
                              <div className="ck-input-ico">
                                <input className="ck-input" inputMode="numeric" value={card.number}
                                  onChange={(e) => { const b = detectBrand(e.target.value); setCard((c) => ({ ...c, number: formatCardNum(e.target.value, b) })); setErrors((er) => ({ ...er, 'card.number': undefined })); }}
                                  placeholder="1234 5678 9012 3456" />
                                <span className="ck-input-brand">{brand ? brand.toUpperCase().slice(0, 4) : ICON.card}</span>
                              </div>
                            </Field>
                            <div className="ck-row">
                              <Field label="Expiry date" req err={errors['card.expiry']}>
                                <input className="ck-input" inputMode="numeric" value={card.expiry}
                                  onChange={(e) => { setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) })); setErrors((er) => ({ ...er, 'card.expiry': undefined })); }}
                                  placeholder="MM/YY" maxLength={5} />
                              </Field>
                              <Field label="CVC" req err={errors['card.cvc']}>
                                <input className="ck-input" inputMode="numeric" value={card.cvc}
                                  onFocus={() => setCvcFocus(true)} onBlur={() => setCvcFocus(false)}
                                  onChange={(e) => { setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })); setErrors((er) => ({ ...er, 'card.cvc': undefined })); }}
                                  placeholder="123" maxLength={4} />
                              </Field>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {payMethod === 'ideal' && (
                    <div className="ck-alt-pay">
                      <Field label="Choose your bank" req err={errors.idealBank}>
                        <select className="ck-input ck-select" value={idealBank} onChange={(e) => { setIdealBank(e.target.value); setErrors((er) => ({ ...er, idealBank: undefined })); }}>
                          <option value="">Select your bank…</option>
                          {IDEAL_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </Field>
                      <div className="ck-redirect-note">{ICON.bank} After clicking <b>Pay</b> you'll be securely redirected to your bank to confirm the payment.</div>
                    </div>
                  )}

                  {(payMethod === 'bancontact' || payMethod === 'paypal') && (
                    <div className="ck-alt-pay">
                      <div className="ck-redirect-note">
                        {ICON.lock} After clicking <b>Pay</b> you'll be securely redirected to {payMethod === 'paypal' ? 'PayPal' : 'Bancontact'} to complete your payment.
                      </div>
                    </div>
                  )}

                  <div className="ck-divider" />

                  {/* ── non-refundable accommodation ──
                      Said once on the room card, and again HERE, because this is the last
                      moment it can still be avoided. Scoped deliberately to the accommodation:
                      the flight, the transfer and the insurance have their own terms, and
                      telling someone their whole holiday is non-refundable when only the hotel
                      is would be a worse error than saying nothing. */}
                  {nonRefundable && (
                    <div className={`ck-nr${errors.nrAccept ? ' ck-err' : ''}`}>
                      <div className="ck-nr-head">
                        <span className="ck-nr-ico">{ICON.ban}</span>
                        <div>
                          <b>Non-refundable accommodation</b>
                          <p>{NR_CONSENT.notice}</p>
                        </div>
                      </div>
                      <div className="ck-nr-check">
                        <Check checked={nrAccept} onChange={(v) => { setNrAccept(v); setErrors((er) => ({ ...er, nrAccept: undefined })); }}>
                          {NR_CONSENT.accept}
                        </Check>
                        {errors.nrAccept && <div className="ck-errmsg" style={{ marginLeft: 30 }}>{errors.nrAccept}</div>}
                      </div>
                    </div>
                  )}

                  <Check checked={billingSame} onChange={setBillingSame}>
                    Billing address is the same as my customer details
                  </Check>

                  {/* ── Conditions & booking ──
                      What accepting actually commits the traveller to, itemised, above the one
                      tick that accepts all of it. A single "I agree to the conditions" line is
                      technically the same consent and practically a different one: nobody reads
                      a link, and this at least says what is behind them. */}
                  <div className="ck-cond">
                    <div className="ck-cond-title hd">Conditions &amp; booking</div>
                    <ul className="ck-cond-list">
                      <li>{ICON.check} I have read the information relating to this holiday.</li>
                      <li>{ICON.check} I agree to the <Link className="ck-a" to="/p/terms-and-conditions" target="_blank">general terms and conditions</Link> and the <Link className="ck-a" to="/p/package-travel-information" target="_blank">package travel information</Link>.</li>
                      {insAmount > 0 && (
                        <li>{ICON.check} I accept the <Link className="ck-a" to="/p/insurance-conditions" target="_blank">insurance conditions</Link> for the cover I selected.</li>
                      )}
                      <li>{ICON.check} I am making a definite booking with an obligation to pay. It can only be
                        cancelled against payment of <Link className="ck-a" to="/p/cancellation-costs" target="_blank">cancellation costs</Link>, which
                        depend on how close to departure the cancellation is made.</li>
                    </ul>
                  </div>

                  <div className={errors.agree ? 'ck-err' : ''}>
                    <Check checked={agree} onChange={(v) => { setAgree(v); setErrors((er) => ({ ...er, agree: undefined })); }}>
                      Yes, I agree to the above conditions
                    </Check>
                    <div className="ck-hint" style={{ marginLeft: 30 }}>
                      You cannot confirm your booking unless you accept all applicable conditions.
                    </div>
                    {errors.agree && <div className="ck-errmsg" style={{ marginLeft: 30 }}>{errors.agree}</div>}
                  </div>

                  {errors.submit && (
                    <div className="ck-submit-err">{ICON.ban} {errors.submit}</div>
                  )}

                  <div className="ck-secure-row">
                    <span className="ck-stripe-badge">Powered by <b>stripe</b></span>
                    <span className="ck-ssl">{ICON.lock} 256-bit SSL encrypted</span>
                    <span className="ck-ssl">{ICON.shieldCheck} PCI-DSS compliant</span>
                  </div>
                </section>
              )}

              {/* ──────── NAV BUTTONS ──────── */}
              <div className="ck-navbtns">
                {step > 0
                  ? <button className="ck-back-btn" onClick={back}>{ICON.arrowL} Back</button>
                  : <button className="ck-back-btn" onClick={() => navigate(-1)}>{ICON.arrowL} {isFlight ? 'Back to flight' : isTransfer ? 'Back to transfers' : 'Back to hotel'}</button>}
                <button className={`ck-next-btn${paying ? ' busy' : ''}${repriceBlocks ? ' held' : ''}`}
                  onClick={ctaAction} disabled={ctaBlocked}>
                  {paying
                    ? <><span className="ck-spin" /> Processing payment…</>
                    : repriceBlocks && reprice.status === 'checking'
                      ? <><span className="ck-spin" /> {ctaLabel}</>
                      : <>{step === 2 && ICON.lock} {ctaLabel} {step < 2 && ICON.arrow}</>}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT — SUMMARY ═══ */}
          <aside className="ck-aside">
            <div className="ck-sum">
              <div className="ck-sum-img">
                {/* A hotel with no photo set arrives with no `img`, and a CDN error hides the
                    <img>; either way the illustrated stand-in sits behind it, so the band is
                    never empty under the hotel name. */}
                {booking.img
                  ? <img src={booking.img} alt={booking.hotelName} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : null}
                <div className="hotel-fallback-fill"><HotelPhotoFallback variant="tile" seed={booking.hotelCode || booking.hotelName} /></div>
                <div className="ck-sum-imgov" />
                <div className="ck-sum-imgtxt">
                  <div className="ck-sum-stars">{'★'.repeat(Math.min(booking.stars, 5))}</div>
                  <div className="ck-sum-name hd">{booking.hotelName}</div>
                  <div className="ck-sum-loc">{ICON.pin} {booking.loc}</div>
                </div>
              </div>

              <div className="ck-sum-body">
                <div className="ck-sum-chips">
                  <span className="ck-sum-chip">{ICON.cal} {booking.dateLabel}</span>
                  {isFlight && <span className="ck-sum-chip">{ICON.plane} {booking.loc}</span>}
                  {isTransfer && <span className="ck-sum-chip">{ICON.pin} {booking.transfer?.type === 'SHARED' ? 'Shared' : 'Private'} transfer</span>}
                  {!isFlight && !isTransfer && <span className="ck-sum-chip">{ICON.moon} {booking.nights} nights</span>}
                  <span className="ck-sum-chip">{ICON.users} {pax} {pax === 1 ? 'traveller' : 'travellers'}</span>
                  {!isFlight && !isTransfer && <span className="ck-sum-chip">{ICON.board} <span className="ck-caps">{booking.board}</span></span>}
                </div>

                {booking.transfer && (
                  <>
                    <div className="ck-sum-sec">{ICON.pin} Transfer</div>
                    <div className="ck-sum-flight">
                      <div className="ck-sum-leg">
                        <span className="ck-sum-leg-dir">OUT</span>
                        <span className="ck-sum-leg-time">{booking.transfer.time || ''}</span>
                        <span className="ck-sum-leg-route">{booking.transfer.from} → {booking.transfer.to}</span>
                      </div>
                      {booking.transfer.retDate && (
                        <div className="ck-sum-leg">
                          <span className="ck-sum-leg-dir ret">RET</span>
                          <span className="ck-sum-leg-time" />
                          <span className="ck-sum-leg-route">{booking.transfer.retDate}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {booking.flight && (
                  <>
                    <div className="ck-sum-sec">{ICON.plane} Flights</div>
                    <div className="ck-sum-flight">
                      <div className="ck-sum-leg">
                        <span className="ck-sum-leg-dir">OUT</span>
                        <span className="ck-sum-leg-time">{booking.flight.outDep} → {booking.flight.outArr}</span>
                        <span className="ck-sum-leg-route">{booking.flight.outFrom.split(' ')[0]} – {booking.flight.outTo.split(' ')[0]}</span>
                      </div>
                      {booking.flight.retDep && (
                        <div className="ck-sum-leg">
                          <span className="ck-sum-leg-dir ret">RET</span>
                          <span className="ck-sum-leg-time">{booking.flight.retDep} → {booking.flight.retArr}</span>
                          <span className="ck-sum-leg-route">{booking.flight.retFrom.split(' ')[0]} – {booking.flight.retTo.split(' ')[0]}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!isFlight && !isTransfer && (
                  <>
                    <div className="ck-sum-sec">{ICON.bed} Room & board</div>
                    <div className="ck-sum-room">
                      <span className="ck-caps">{booking.room}</span>
                      <small><span className="ck-caps">{booking.meal}</span> · included in price</small>
                    </div>
                  </>
                )}

                <div className="ck-sum-sec">{ICON.card} Price breakdown</div>
                <div className="ck-sum-rows">
                  {isTransfer
                    ? <div className="ck-sum-row"><span>Transfer (per vehicle, up to {booking.maxPax || pax} pax)</span><b>{money(base)}</b></div>
                    : <div className="ck-sum-row"><span>{pax} × {money(booking.ppPrice)} p.p.</span><b>{money(base)}</b></div>}
                  {roomExtraTotal > 0 && <div className="ck-sum-row"><span>Room upgrade</span><b>{money(roomExtraTotal)}</b></div>}
                  {transferTotal > 0 && <div className="ck-sum-row"><span>Airport transfer (per vehicle)</span><b>{money(transferTotal)}</b></div>}
                  <div className="ck-sum-row"><span>{isFlight ? 'Booking & service fee' : 'SGR Guarantee Fund'}</span><b>{money(SGR)}</b></div>
                  {extrasTotal > 0 && (
                    <div className="ck-sum-row"><span>Baggage ({extraLines.length})</span><b>{money(extrasTotal)}</b></div>
                  )}
                  {/* One row per policy: they are separate policies, and a merged
                      "Insurance €91" says nothing about what was actually bought. */}
                  {cancelAmount > 0 && (
                    <div className="ck-sum-row ck-sum-row-ins">
                      <span>{ICON.shieldCheck} {cancelOption?.label || 'Cancellation insurance'}</span><b>{money(cancelAmount)}</b>
                    </div>
                  )}
                  {travelAmount > 0 && (
                    <div className="ck-sum-row ck-sum-row-ins">
                      <span>{ICON.shieldCheck} {travelOption?.label || 'Travel insurance'} × {travelCount}</span><b>{money(travelAmount)}</b>
                    </div>
                  )}
                </div>

                <div className="ck-sum-total">
                  <div>
                    <span className="ck-sum-total-label">Total</span>
                    <span className="ck-sum-total-sub">incl. VAT & taxes</span>
                  </div>
                  <span className="ck-sum-total-val hd">{ccy}{animTotal.toLocaleString('en-US')}</span>
                </div>

                <div className="ck-countdown">
                  {ICON.clock}
                  <>Prices are live and are only final once your payment completes</>
                </div>

                <div className="ck-trust">
                  <span className="ck-trust-item">{ICON.check} Secure Stripe payment</span>
                  <span className="ck-trust-item">{ICON.check} Instant confirmation by email</span>
                  <span className="ck-trust-item">{ICON.check} SGR & travel guarantee protected</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ═══ MOBILE STICKY BAR ═══ */}
      <div className="ck-mbar">
        <div className="ck-mbar-price"><small>total</small>{ccy}{animTotal.toLocaleString('en-US')}</div>
        <button className="ck-mbar-btn" onClick={ctaAction} disabled={ctaBlocked}>
          {paying || (repriceBlocks && reprice.status === 'checking')
            ? <span className="ck-spin" />
            : <>{ctaLabel} {ICON.arrow}</>}
        </button>
      </div>

      {/* ═══ REVIEW YOUR DETAILS — the gate out of step 1 ═══
          Deliberately a modal and not another card: the traveller has just spent five
          minutes typing and is in "next, next, next" mode, and a panel further down the
          same page is read at that speed. What they are agreeing to is on the left, why it
          matters on the right, and the only way forward needs every name ticked. */}
      {reviewOpen && (
        <div className="ck-modal-wrap" onClick={() => setReviewOpen(false)}>
          <div className="ck-modal" role="dialog" aria-modal="true" aria-labelledby="ck-review-title"
            onClick={(e) => e.stopPropagation()}>
            <div className="ck-modal-head">
              <h2 className="ck-modal-title hd" id="ck-review-title">Review your details</h2>
              <button className="ck-modal-x" onClick={() => setReviewOpen(false)} aria-label="Close">{ICON.x}</button>
            </div>

            <div className="ck-modal-body">
              <div className="ck-rv-main">
                <p className="ck-rv-lede">
                  It is important to review your details before you continue. Names and dates of
                  birth cannot be changed free of charge once the booking is made — please check
                  them against each traveller's passport or identity card.
                </p>

                {travellers.map((t, i) => {
                  const name = [titleFor(t.gender), t.firstName, t.lastName].filter(Boolean).join(' ').trim();
                  return (
                    <div className={`ck-rv-trav${reviewOk[i] ? ' ok' : ''}`} key={i}>
                      <div className="ck-rv-name hd">
                        {name || `Traveller ${i + 1}`}
                        {t.dateOfBirth && <span className="ck-rv-dob"> ({dmy(t.dateOfBirth)})</span>}
                      </div>
                      <Check checked={!!reviewOk[i]} onChange={(v) => setReviewOk((r) => ({ ...r, [i]: v }))}>
                        Yes, this is my first name, last name and date of birth exactly as they
                        appear on my passport or identity card.
                      </Check>
                    </div>
                  );
                })}
              </div>

              <aside className="ck-rv-aside">
                <div className="ck-rv-tip">
                  <span className="ck-rv-tick">{ICON.check}</span>
                  <p>Enter only the <b>first (given) name</b> and the <b>last name</b> as shown on the
                    travel document. No nicknames, no initials, no middle names.</p>
                </div>
                <div className="ck-rv-tip">
                  <span className="ck-rv-tick">{ICON.check}</span>
                  <p>Check the <b>date of birth</b> too — it sets the fare type for each traveller,
                    so a wrong year can change the price of the trip.</p>
                </div>
              </aside>
            </div>

            <div className="ck-modal-foot">
              <button className="ck-rv-edit" onClick={() => setReviewOpen(false)}>Edit details</button>
              <button className="ck-rv-confirm" onClick={confirmReview} disabled={!allReviewed}>
                {allReviewed
                  ? <>Yes, I have checked and confirmed {ICON.arrow}</>
                  : <>Tick every traveller to continue</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutWithStripe() {
  const stripe = useStripe();
  const elements = useElements();
  return <CheckoutContent stripe={stripe} elements={elements} />;
}

export default function Checkout() {
  if (stripePromise) {
    return (
      <Elements stripe={stripePromise} options={{ locale: 'en' }}>
        <CheckoutWithStripe />
      </Elements>
    );
  }
  return <CheckoutContent stripe={null} elements={null} />;
}
