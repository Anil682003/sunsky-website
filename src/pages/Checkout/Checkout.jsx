import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axiosInstance from '../../services/axiosInstance';
import Confirmation from './Confirmation';
import './Checkout.css';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const STRIPE_AVAILABLE = !!STRIPE_PK && !STRIPE_PK.includes('REPLACE');
console.log('Stripe public key:', STRIPE_PK, 'Stripe available:', STRIPE_AVAILABLE);
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
};

/* ════════ static config ════════ */
const STEPS = [
  { id: 'info',    name: 'Your details', sub: 'Customer & travellers', icon: ICON.user },
  { id: 'addons',  name: 'Add-ons',      sub: 'Insurance & extras',    icon: ICON.shield },
  { id: 'payment', name: 'Payment',      sub: 'Secure checkout',       icon: ICON.card },
];

const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr'];
const GENDERS_TRAVELLER = [
  { v: 'MALE', l: 'Male' }, { v: 'FEMALE', l: 'Female' }, { v: 'OTHER', l: 'Other' },
];
const GENDERS_CUSTOMER = [...GENDERS_TRAVELLER, { v: 'PREFER_NOT_TO_SAY', l: 'Prefer not to say' }];
const NATIONALITIES = [
  'Belgian', 'Dutch', 'German', 'French', 'British', 'Spanish', 'Italian', 'Portuguese',
  'Greek', 'Turkish', 'Austrian', 'Swiss', 'Polish', 'Swedish', 'Norwegian', 'Danish',
  'Irish', 'Luxembourgish', 'American', 'Canadian', 'Australian', 'Indian', 'Moroccan', 'Other',
];
const LANGUAGES = [
  { v: 'en', l: 'English' }, { v: 'nl', l: 'Dutch' }, { v: 'fr', l: 'French' },
  { v: 'de', l: 'German' }, { v: 'es', l: 'Spanish' }, { v: 'it', l: 'Italian' },
];
const INDUSTRIES = [
  'Travel & Tourism', 'IT & Software', 'Finance & Banking', 'Healthcare', 'Education',
  'Retail & E-commerce', 'Manufacturing', 'Construction', 'Hospitality', 'Logistics',
  'Media & Marketing', 'Government', 'Other',
];
const PAYMENT_TERMS = ['Prepaid', '7 days', '14 days', '30 days', '60 days'];
const COUNTRIES = [
  'Belgium', 'Netherlands', 'Germany', 'France', 'United Kingdom', 'Spain', 'Italy',
  'Portugal', 'Greece', 'Turkey', 'Austria', 'Switzerland', 'Poland', 'Sweden', 'Norway',
  'Denmark', 'Ireland', 'Luxembourg', 'United States', 'Canada', 'Australia', 'India', 'Other',
];
const IDEAL_BANKS = ['ING', 'ABN AMRO', 'Rabobank', 'ASN Bank', 'SNS', 'Bunq', 'Knab', 'Revolut', 'N26'];

const INSURANCES = [
  {
    id: 'none', name: 'No insurance', icon: ICON.ban, pct: 0,
    desc: 'I accept the risk and travel without extra protection.',
    covers: [],
  },
  {
    id: 'cancel', name: 'Cancellation insurance', icon: ICON.cal, pct: 0.06,
    desc: 'Get your money back if you unexpectedly can’t travel.',
    covers: ['Illness, accident or injury', 'Job loss or new employment', 'Damage to your home'],
  },
  {
    id: 'travel', name: 'Travel insurance', icon: ICON.umbrella, perDay: 3.2,
    desc: 'Worldwide cover for you and your luggage while travelling.',
    covers: ['Medical expenses abroad', 'Luggage loss & theft', 'Delay & missed connection'],
  },
  {
    id: 'allin', name: 'All-in protection', icon: ICON.heartPulse, pct: 0.085, featured: true,
    desc: 'Cancellation + travel insurance combined. Zero worries.',
    covers: ['Everything in Cancellation', 'Everything in Travel', 'Curtailment & repatriation'],
  },
];

const FALLBACK_BOOKING = {
  hotelCode: 'demo', hotelName: 'Cavo Vezal', stars: 5,
  loc: 'Greece, Zakynthos, Agios Sostis',
  img: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=80',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 365, origPrice: 399, dateLabel: 'Fri 10 Apr — Wed 15 Apr 2026',
  flight: {
    outDate: 'Fri 10 Apr. 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50',
    outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl',
    retDate: 'Wed 15 Apr. 2026', retAirline: 'TRANSAVIA', retDep: '12:45', retArr: '16:00',
    retDur: '4h 15m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)',
  },
  room: 'Double Room Design Room', roomExtra: 0, meal: 'Bed & Breakfast',
};

const SGR_FEE = 20;

/* ════════ helpers ════════ */
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const phoneOk = (v) => /^\+[1-9]\d{6,14}$/.test((v || '').replace(/[\s\-.()]/g, ''));
const urlOk = (v) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/.test(v || '');

const ageFromDob = (dob) => {
  const b = new Date(dob); const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
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
const Field = ({ label, req, err, hint, children, span }) => (
  <div className={`ck-field${err ? ' ck-err' : ''}${span ? ` ck-span-${span}` : ''}`}>
    <label className="ck-label">{label}{req && <span className="ck-req"> *</span>}</label>
    {children}
    {err ? <div className="ck-errmsg">{err}</div> : hint ? <div className="ck-hint">{hint}</div> : null}
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
  dateOfBirth: '', passportNumber: '', passportExpiry: '',
});

/* ════════════════════════════════════════════════════════ */
function CheckoutContent({ stripe, elements }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const booking = state?.booking || FALLBACK_BOOKING;
  const isFlight = booking.kind === 'flight';
  const { isAuthenticated, user } = useSelector((s) => s.auth);
  const ccy = booking.currency || '€';
  const paneRef = useRef(null);

  /* ── steps ── */
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [dir, setDir] = useState(1);

  /* ── step 1 : customer + travellers ── */
  const [customerType, setCustomerType] = useState('private');
  const [priv, setPriv] = useState({
    firstName: user?.firstName || '', lastName: user?.lastName || '',
    dateOfBirth: '', gender: '', nationality: '', preferredLanguage: 'en',
    hasEmail: true, email: user?.email || '', phone: user?.phone || '',
    street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
  });
  const [pro, setPro] = useState({
    tradingName: '', legalName: '', vatNumber: '', industry: '', website: '',
    street: '', houseNumber: '', boxNumber: '', city: '', postalCode: '', country: '',
    hasInvoiceEmail: true, invoiceEmail: '', paymentTerms: '', invoicingAddress: '',
    primaryContactFirstName: user?.firstName || '', primaryContactLastName: user?.lastName || '',
    hasContactEmail: true, primaryContactEmail: user?.email || '', primaryContactPhone: '',
    primaryContactRole: '', preferredLanguage: 'en',
  });
  const [travellers, setTravellers] = useState(() =>
    Array.from({ length: booking.adults || 2 }, emptyTraveller));

  /* ── step 2 : add-ons ── */
  const [insurance, setInsurance] = useState('none');
  const [holderIsLead, setHolderIsLead] = useState(true);
  const [holder, setHolder] = useState({ firstName: '', lastName: '' });

  /* ── step 3 : payment ── */
  const [payMethod, setPayMethod] = useState('card');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [cvcFocus, setCvcFocus] = useState(false);
  const [stripeBrand, setStripeBrand] = useState('');
  const [stripeReady, setStripeReady] = useState({ number: false, expiry: false, cvc: false });
  const [idealBank, setIdealBank] = useState('');
  const [billingSame, setBillingSame] = useState(true);
  const [agree, setAgree] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [bookingRef, setBookingRef] = useState('');

  const [errors, setErrors] = useState({});

  /* ── price lock countdown ── */
  const [secsLeft, setSecsLeft] = useState(20 * 60);
  useEffect(() => {
    const id = setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  /* ── pricing ── */
  const pax = travellers.length;
  const base = booking.ppPrice * pax;
  const roomExtraTotal = (booking.roomExtra || 0) * pax;
  const subtotal = base + roomExtraTotal + SGR_FEE;
  const insAmount = useMemo(() => {
    const ins = INSURANCES.find((i) => i.id === insurance);
    if (!ins || ins.id === 'none') return 0;
    if (ins.perDay) return Math.round(ins.perDay * pax * booking.nights);
    return Math.round(subtotal * ins.pct);
  }, [insurance, pax, subtotal, booking.nights]);
  const total = subtotal + insAmount;
  const animTotal = useCountUp(total);
  const money = (n) => `${ccy}${Math.round(n).toLocaleString('en-US')}`;
  const insPrice = (ins) => ins.id === 'none' ? 0
    : ins.perDay ? Math.round(ins.perDay * pax * booking.nights)
    : Math.round(subtotal * ins.pct);

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

  /* ── field setters ── */
  const setP = (k) => (v) => { setPriv((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [`priv.${k}`]: undefined })); };
  const setB = (k) => (v) => { setPro((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [`pro.${k}`]: undefined })); };
  const setT = (i, k) => (v) => {
    setTravellers((ts) => ts.map((t, ti) => (ti === i ? { ...t, [k]: v } : t)));
    setErrors((e) => ({ ...e, [`t${i}.${k}`]: undefined }));
  };

  const addTraveller = () => { if (pax < 9) setTravellers((ts) => [...ts, emptyTraveller()]); };
  const removeTraveller = (i) => {
    if (pax <= 1) return;
    setTravellers((ts) => ts.filter((_, ti) => ti !== i));
    setErrors({});
  };
  const copyCustomerToLead = () => {
    setTravellers((ts) => ts.map((t, i) => (i === 0 ? {
      ...t,
      firstName: priv.firstName, lastName: priv.lastName,
      gender: priv.gender === 'PREFER_NOT_TO_SAY' ? '' : priv.gender,
      nationality: NATIONALITIES.includes(priv.nationality) ? priv.nationality : t.nationality,
      dateOfBirth: priv.dateOfBirth || t.dateOfBirth,
    } : t)));
  };

  /* ── validation ── */
  const validateInfo = () => {
    const e = {};
    if (customerType === 'private') {
      if (!priv.firstName.trim()) e['priv.firstName'] = 'First name is required';
      if (!priv.lastName.trim()) e['priv.lastName'] = 'Last name is required';
      if (!priv.nationality) e['priv.nationality'] = 'Nationality is required';
      if (!priv.preferredLanguage) e['priv.preferredLanguage'] = 'Language is required';
      if (priv.hasEmail && !emailOk(priv.email)) e['priv.email'] = 'A valid email is required';
      if (!phoneOk(priv.phone)) e['priv.phone'] = 'Use international format, e.g. +32475123456';
      if (priv.dateOfBirth && new Date(priv.dateOfBirth) >= new Date()) e['priv.dateOfBirth'] = 'Date of birth must be in the past';
    } else {
      if (!pro.tradingName.trim()) e['pro.tradingName'] = 'Trading name is required';
      if (!pro.legalName.trim()) e['pro.legalName'] = 'Legal name is required';
      if (!pro.vatNumber.trim() || pro.vatNumber.trim().length < 3) e['pro.vatNumber'] = 'VAT number is required';
      if (!pro.industry) e['pro.industry'] = 'Industry is required';
      if (pro.website && !urlOk(pro.website)) e['pro.website'] = 'Enter a valid website URL';
      if (!pro.country) e['pro.country'] = 'Country is required';
      if (pro.hasInvoiceEmail && !emailOk(pro.invoiceEmail)) e['pro.invoiceEmail'] = 'A valid invoice email is required';
      if (!pro.primaryContactFirstName.trim()) e['pro.primaryContactFirstName'] = 'First name is required';
      if (!pro.primaryContactLastName.trim()) e['pro.primaryContactLastName'] = 'Last name is required';
      if (pro.hasContactEmail && !emailOk(pro.primaryContactEmail)) e['pro.primaryContactEmail'] = 'A valid email is required';
      if (!phoneOk(pro.primaryContactPhone)) e['pro.primaryContactPhone'] = 'Use international format, e.g. +32475123456';
    }
    travellers.forEach((t, i) => {
      if (!t.firstName.trim()) e[`t${i}.firstName`] = 'Required';
      if (!t.lastName.trim()) e[`t${i}.lastName`] = 'Required';
      if (!t.nationality) e[`t${i}.nationality`] = 'Required';
      if (!t.dateOfBirth) e[`t${i}.dateOfBirth`] = 'Required';
      else if (new Date(t.dateOfBirth) >= new Date()) e[`t${i}.dateOfBirth`] = 'Must be in the past';
      if (t.passportExpiry && new Date(t.passportExpiry) <= new Date()) e[`t${i}.passportExpiry`] = 'Must be a future date';
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
    setDir(i > step ? 1 : -1);
    setStep(i);
  };

  const next = () => {
    if (step === 0) {
      const e = validateInfo();
      if (Object.keys(e).filter((k) => e[k]).length) return flashErrors(e);
    }
    setErrors({});
    setDir(1);
    const n = Math.min(step + 1, 2);
    setStep(n);
    setFurthest((f) => Math.max(f, n));
  };
  const back = () => { setDir(-1); setStep((s) => Math.max(0, s - 1)); };

  /* Booking flow: create → Stripe PaymentIntent → confirm card → record payment → supplier confirm. */
  const pay = async () => {
    const e = validatePayment();
    if (Object.keys(e).filter((k) => e[k]).length) return flashErrors(e);
    setErrors({});
    setPaying(true);
    try {
      const customer = customerType === 'professional'
        ? {
            type: 'professional',
            tradingName: pro.tradingName, legalName: pro.legalName, vatNumber: pro.vatNumber,
            industry: pro.industry, website: pro.website || undefined,
            preferredLanguage: pro.preferredLanguage || 'en',
            address: { street: pro.street, houseNumber: pro.houseNumber, boxNumber: pro.boxNumber, city: pro.city, postalCode: pro.postalCode, country: pro.country },
            primaryContact: { firstName: pro.primaryContactFirstName, lastName: pro.primaryContactLastName, phone: pro.primaryContactPhone, contactEmail: pro.primaryContactEmail || undefined, role: pro.primaryContactRole || undefined, hasContactEmail: pro.hasContactEmail },
            invoicing: { hasInvoiceEmail: pro.hasInvoiceEmail, invoiceEmail: pro.invoiceEmail || undefined, paymentTerms: pro.paymentTerms || undefined, invoicingAddress: pro.invoicingAddress || undefined },
          }
        : {
            type: 'private',
            firstName: priv.firstName, lastName: priv.lastName,
            dateOfBirth: priv.dateOfBirth || undefined,
            gender: priv.gender || undefined,
            nationality: priv.nationality,
            preferredLanguage: priv.preferredLanguage || 'en',
            hasEmail: priv.hasEmail, email: priv.hasEmail ? priv.email : undefined,
            phone: priv.phone,
            address: { street: priv.street, houseNumber: priv.houseNumber, boxNumber: priv.boxNumber, city: priv.city, postalCode: priv.postalCode, country: priv.country },
          };

      const passengers = travellers.map((t, i) => ({
        title: t.title || undefined, firstName: t.firstName, lastName: t.lastName,
        gender: t.gender || undefined, dateOfBirth: t.dateOfBirth,
        passportNumber: t.passportNumber || undefined, passportExpiry: t.passportExpiry || undefined,
        nationality: t.nationality || undefined, isLead: i === 0,
      }));

      const api = booking.api || {};
      const hotelPayload = api.hotel || null;
      const flightPayload = api.flight || null;
      const insurancePayload = (selIns && selIns.id !== 'none' && insAmount > 0)
        ? { type: selIns.id, label: selIns.name, price: insAmount } : null;
      const contactPhone = customerType === 'professional' ? pro.primaryContactPhone : priv.phone;

      // Step 1 — create the booking
      const createRes = await axiosInstance.post('/website/online-bookings', {
        mode: 'test',
        currency: ccy === '€' ? 'EUR' : ccy,
        customer,
        hotel: hotelPayload || undefined,
        flight: flightPayload || undefined,
        insurance: insurancePayload || undefined,
        passengers,
        contact: { phone: contactPhone },
      });

      const created = createRes.data?.data || createRes.data || {};
      const bookingId = created.bookingId;
      const ref = created.bookingReference;
      if (!bookingId) throw new Error('Booking could not be created');

      let paidViaStripe = false;
      if (stripe && elements) {
        try {
          // Step 2 — create Stripe PaymentIntent
          const intentRes = await axiosInstance.post(`/website/online-bookings/${bookingId}/create-payment-intent`);
          const { clientSecret } = intentRes.data?.data || {};
          if (!clientSecret) throw new Error('Could not initialize payment');

          // Step 3 — confirm card payment with Stripe
          const cardEl = elements.getElement(CardNumberElement);
          const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardEl,
              billing_details: {
                name: card.name || undefined,
                email: customerEmail || undefined,
              },
            },
          });
          if (error) throw new Error(error.message);
          if (paymentIntent.status !== 'succeeded') throw new Error('Payment was not completed');

          // Step 4 — record payment on backend
          await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, {
            paymentIntentId: paymentIntent.id,
          });
          paidViaStripe = true;
        } catch (stripeErr) {
          console.warn('[Checkout] Stripe flow failed, falling back to test payment:', stripeErr?.response?.data?.message || stripeErr.message);
        }
      }
      if (!paidViaStripe) {
        await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, { mode: 'test' });
      }

      // Step 5 — reserve with suppliers + confirm (non-fatal)
      try {
        await axiosInstance.post(`/website/online-bookings/${bookingId}/confirm`, { mode: 'test' });
      } catch (confErr) {
        console.warn('[Checkout] confirm step failed:', confErr?.response?.data?.message || confErr.message);
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
  const lead = travellers[0];
  const leadName = `${lead?.firstName || ''} ${lead?.lastName || ''}`.trim();
  const customerEmail = customerType === 'private' ? priv.email : pro.primaryContactEmail;
  const selIns = INSURANCES.find((i) => i.id === insurance);

  /* primary CTA per step (shared by bottom bar + mobile bar) */
  const ctaLabel = step === 0 ? 'Continue to add-ons' : step === 1 ? 'Continue to payment' : `Pay ${money(total)}`;
  const ctaAction = step === 2 ? pay : next;

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
        pricing={{ base, roomExtraTotal, sgr: SGR_FEE, total, pax }}
        ccy={ccy}
      />
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
              <p className="ck-hero-sub">You're moments away from {isFlight ? 'your flight' : booking.hotelName} — {(booking.loc || '').split(',')[0]}</p>
            </div>
            <div className="ck-hero-badges">
              <span className="ck-hbadge">{ICON.shieldCheck} SGR guaranteed</span>
              <span className="ck-hbadge">{ICON.lock} 256-bit SSL</span>
              <span className="ck-hbadge">{ICON.check} Free cancellation 24h</span>
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

                  {/* customer card */}
                  <section className="ck-card ck-reveal">
                    <div className="ck-card-head">
                      <div className="ck-ico">{customerType === 'private' ? ICON.user : ICON.briefcase}</div>
                      <div className="ck-card-titles">
                        <h2 className="ck-card-title hd">Customer details</h2>
                        <p className="ck-card-sub">The person or company making this booking</p>
                      </div>
                    </div>

                    <div className="ck-seg" data-pos={customerType === 'private' ? 0 : 1}>
                      <span className="ck-seg-thumb" />
                      <button className={`ck-seg-btn${customerType === 'private' ? ' act' : ''}`} onClick={() => setCustomerType('private')}>
                        {ICON.user} Private
                      </button>
                      <button className={`ck-seg-btn${customerType === 'professional' ? ' act' : ''}`} onClick={() => setCustomerType('professional')}>
                        {ICON.briefcase} Professional
                      </button>
                    </div>

                    {customerType === 'private' ? (
                      <div className="ck-form" key="priv">
                        <div className="ck-row">
                          <Field label="First name" req err={errors['priv.firstName']}>
                            <input className="ck-input" value={priv.firstName} onChange={(e) => setP('firstName')(e.target.value)} placeholder="John" maxLength={100} />
                          </Field>
                          <Field label="Last name" req err={errors['priv.lastName']}>
                            <input className="ck-input" value={priv.lastName} onChange={(e) => setP('lastName')(e.target.value)} placeholder="Doe" maxLength={100} />
                          </Field>
                        </div>
                        <div className="ck-row">
                          <Field label="Date of birth" err={errors['priv.dateOfBirth']}>
                            <input className="ck-input" type="date" value={priv.dateOfBirth} onChange={(e) => setP('dateOfBirth')(e.target.value)} />
                          </Field>
                          <Field label="Gender">
                            <select className="ck-input ck-select" value={priv.gender} onChange={(e) => setP('gender')(e.target.value)}>
                              <option value="">Select…</option>
                              {GENDERS_CUSTOMER.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                            </select>
                          </Field>
                        </div>
                        <div className="ck-row">
                          <Field label="Nationality" req err={errors['priv.nationality']}>
                            <select className="ck-input ck-select" value={priv.nationality} onChange={(e) => setP('nationality')(e.target.value)}>
                              <option value="">Select…</option>
                              {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </Field>
                          <Field label="Preferred language" req err={errors['priv.preferredLanguage']}>
                            <select className="ck-input ck-select" value={priv.preferredLanguage} onChange={(e) => setP('preferredLanguage')(e.target.value)}>
                              {LANGUAGES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                            </select>
                          </Field>
                        </div>

                        <Check checked={priv.hasEmail} onChange={(v) => setP('hasEmail')(v)}>
                          I have an email address <small>(booking confirmation is sent by email)</small>
                        </Check>

                        <div className="ck-row">
                          {priv.hasEmail && (
                            <Field label="Email address" req err={errors['priv.email']}>
                              <input className="ck-input" type="email" value={priv.email} onChange={(e) => setP('email')(e.target.value)} placeholder="john@example.com" />
                            </Field>
                          )}
                          <Field label="Phone number" req err={errors['priv.phone']} hint="International format, e.g. +32 475 12 34 56">
                            <input className="ck-input" type="tel" value={priv.phone} onChange={(e) => setP('phone')(e.target.value)} placeholder="+32 475 12 34 56" maxLength={30} />
                          </Field>
                        </div>

                        <div className="ck-subhead">{ICON.pin} Home address <small>(optional)</small></div>
                        <div className="ck-row-3">
                          <Field label="Street" span={2}>
                            <input className="ck-input" value={priv.street} onChange={(e) => setP('street')(e.target.value)} placeholder="Avenue Louise" maxLength={255} />
                          </Field>
                          <Field label="No.">
                            <input className="ck-input" value={priv.houseNumber} onChange={(e) => setP('houseNumber')(e.target.value)} placeholder="12" maxLength={20} />
                          </Field>
                          <Field label="Box">
                            <input className="ck-input" value={priv.boxNumber} onChange={(e) => setP('boxNumber')(e.target.value)} placeholder="A" maxLength={20} />
                          </Field>
                        </div>
                        <div className="ck-row-3">
                          <Field label="City" span={2}>
                            <input className="ck-input" value={priv.city} onChange={(e) => setP('city')(e.target.value)} placeholder="Brussels" maxLength={100} />
                          </Field>
                          <Field label="Postal code">
                            <input className="ck-input" value={priv.postalCode} onChange={(e) => setP('postalCode')(e.target.value)} placeholder="1000" maxLength={20} />
                          </Field>
                          <Field label="Country">
                            <select className="ck-input ck-select" value={priv.country} onChange={(e) => setP('country')(e.target.value)}>
                              <option value="">Select…</option>
                              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </Field>
                        </div>
                      </div>
                    ) : (
                      <div className="ck-form" key="pro">
                        <div className="ck-row">
                          <Field label="Trading name" req err={errors['pro.tradingName']}>
                            <input className="ck-input" value={pro.tradingName} onChange={(e) => setB('tradingName')(e.target.value)} placeholder="SunTravel BV" maxLength={150} />
                          </Field>
                          <Field label="Legal name" req err={errors['pro.legalName']}>
                            <input className="ck-input" value={pro.legalName} onChange={(e) => setB('legalName')(e.target.value)} placeholder="SunTravel Belgium BV" maxLength={150} />
                          </Field>
                        </div>
                        <div className="ck-row">
                          <Field label="VAT number" req err={errors['pro.vatNumber']}>
                            <input className="ck-input" value={pro.vatNumber} onChange={(e) => setB('vatNumber')(e.target.value)} placeholder="BE 0123.456.789" maxLength={50} />
                          </Field>
                          <Field label="Industry" req err={errors['pro.industry']}>
                            <select className="ck-input ck-select" value={pro.industry} onChange={(e) => setB('industry')(e.target.value)}>
                              <option value="">Select…</option>
                              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                          </Field>
                        </div>
                        <div className="ck-row">
                          <Field label="Website" err={errors['pro.website']}>
                            <input className="ck-input" value={pro.website} onChange={(e) => setB('website')(e.target.value)} placeholder="https://company.com" maxLength={255} />
                          </Field>
                          <Field label="Preferred language">
                            <select className="ck-input ck-select" value={pro.preferredLanguage} onChange={(e) => setB('preferredLanguage')(e.target.value)}>
                              {LANGUAGES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                            </select>
                          </Field>
                        </div>

                        <div className="ck-subhead">{ICON.pin} Company address</div>
                        <div className="ck-row-3">
                          <Field label="Street" span={2}>
                            <input className="ck-input" value={pro.street} onChange={(e) => setB('street')(e.target.value)} maxLength={255} />
                          </Field>
                          <Field label="No.">
                            <input className="ck-input" value={pro.houseNumber} onChange={(e) => setB('houseNumber')(e.target.value)} maxLength={20} />
                          </Field>
                          <Field label="Box">
                            <input className="ck-input" value={pro.boxNumber} onChange={(e) => setB('boxNumber')(e.target.value)} maxLength={20} />
                          </Field>
                        </div>
                        <div className="ck-row-3">
                          <Field label="City" span={2}>
                            <input className="ck-input" value={pro.city} onChange={(e) => setB('city')(e.target.value)} maxLength={100} />
                          </Field>
                          <Field label="Postal code">
                            <input className="ck-input" value={pro.postalCode} onChange={(e) => setB('postalCode')(e.target.value)} maxLength={20} />
                          </Field>
                          <Field label="Country" req err={errors['pro.country']}>
                            <select className="ck-input ck-select" value={pro.country} onChange={(e) => setB('country')(e.target.value)}>
                              <option value="">Select…</option>
                              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </Field>
                        </div>

                        <div className="ck-subhead">{ICON.mail} Invoicing</div>
                        <Check checked={pro.hasInvoiceEmail} onChange={(v) => setB('hasInvoiceEmail')(v)}>
                          Invoices by email
                        </Check>
                        <div className="ck-row">
                          {pro.hasInvoiceEmail && (
                            <Field label="Invoice email" req err={errors['pro.invoiceEmail']}>
                              <input className="ck-input" type="email" value={pro.invoiceEmail} onChange={(e) => setB('invoiceEmail')(e.target.value)} placeholder="invoices@company.com" />
                            </Field>
                          )}
                          <Field label="Payment terms">
                            <select className="ck-input ck-select" value={pro.paymentTerms} onChange={(e) => setB('paymentTerms')(e.target.value)}>
                              <option value="">Select…</option>
                              {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </Field>
                        </div>
                        <Field label="Invoicing address" hint="Only if different from the company address">
                          <textarea className="ck-input ck-textarea" rows={2} value={pro.invoicingAddress} onChange={(e) => setB('invoicingAddress')(e.target.value)} placeholder="Street 1, 1000 Brussels, Belgium" />
                        </Field>

                        <div className="ck-subhead">{ICON.user} Primary contact</div>
                        <div className="ck-row">
                          <Field label="First name" req err={errors['pro.primaryContactFirstName']}>
                            <input className="ck-input" value={pro.primaryContactFirstName} onChange={(e) => setB('primaryContactFirstName')(e.target.value)} maxLength={100} />
                          </Field>
                          <Field label="Last name" req err={errors['pro.primaryContactLastName']}>
                            <input className="ck-input" value={pro.primaryContactLastName} onChange={(e) => setB('primaryContactLastName')(e.target.value)} maxLength={100} />
                          </Field>
                        </div>
                        <div className="ck-row">
                          <Field label="Role / function">
                            <input className="ck-input" value={pro.primaryContactRole} onChange={(e) => setB('primaryContactRole')(e.target.value)} placeholder="Office manager" maxLength={100} />
                          </Field>
                          <Field label="Phone number" req err={errors['pro.primaryContactPhone']} hint="International format, e.g. +32 475 12 34 56">
                            <input className="ck-input" type="tel" value={pro.primaryContactPhone} onChange={(e) => setB('primaryContactPhone')(e.target.value)} placeholder="+32 475 12 34 56" maxLength={30} />
                          </Field>
                        </div>
                        <Check checked={pro.hasContactEmail} onChange={(v) => setB('hasContactEmail')(v)}>
                          Contact has an email address
                        </Check>
                        {pro.hasContactEmail && (
                          <div className="ck-row">
                            <Field label="Contact email" req err={errors['pro.primaryContactEmail']}>
                              <input className="ck-input" type="email" value={pro.primaryContactEmail} onChange={(e) => setB('primaryContactEmail')(e.target.value)} placeholder="name@company.com" />
                            </Field>
                          </div>
                        )}
                      </div>
                    )}
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
                          <div className="ck-trav-head">
                            <div className="ck-trav-av">{i + 1}</div>
                            <div className="ck-trav-name hd">
                              {t.firstName || t.lastName ? `${t.firstName} ${t.lastName}` : `Traveller ${i + 1}`}
                            </div>
                            {i === 0 && <span className="ck-lead-badge">{ICON.sparkle} Lead traveller</span>}
                            {at && <span className={`ck-age-badge ${at.code.toLowerCase()}`} key={at.code}>{at.label} · {at.code}</span>}
                            <div className="ck-trav-actions">
                              {i === 0 && customerType === 'private' && (priv.firstName || priv.lastName) && (
                                <button className="ck-link-btn" onClick={copyCustomerToLead}>{ICON.check} Same as customer</button>
                              )}
                              {pax > 1 && (
                                <button className="ck-remove-btn" onClick={() => removeTraveller(i)} aria-label="Remove traveller">{ICON.x}</button>
                              )}
                            </div>
                          </div>

                          <div className="ck-row-t1">
                            <Field label="Title">
                              <select className="ck-input ck-select" value={t.title} onChange={(e) => setT(i, 'title')(e.target.value)}>
                                <option value="">—</option>
                                {TITLES.map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                            </Field>
                            <Field label="First name" req err={errors[`t${i}.firstName`]}>
                              <input className="ck-input" value={t.firstName} onChange={(e) => setT(i, 'firstName')(e.target.value)} placeholder="As in passport" maxLength={100} />
                            </Field>
                            <Field label="Last name" req err={errors[`t${i}.lastName`]}>
                              <input className="ck-input" value={t.lastName} onChange={(e) => setT(i, 'lastName')(e.target.value)} placeholder="As in passport" maxLength={100} />
                            </Field>
                          </div>
                          <div className="ck-row-3">
                            <Field label="Gender">
                              <select className="ck-input ck-select" value={t.gender} onChange={(e) => setT(i, 'gender')(e.target.value)}>
                                <option value="">Select…</option>
                                {GENDERS_TRAVELLER.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                              </select>
                            </Field>
                            <Field label="Nationality" req err={errors[`t${i}.nationality`]}>
                              <select className="ck-input ck-select" value={t.nationality} onChange={(e) => setT(i, 'nationality')(e.target.value)}>
                                <option value="">Select…</option>
                                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </Field>
                            <Field label="Date of birth" req err={errors[`t${i}.dateOfBirth`]}>
                              <input className="ck-input" type="date" value={t.dateOfBirth} onChange={(e) => setT(i, 'dateOfBirth')(e.target.value)} />
                            </Field>
                          </div>
                          <div className="ck-pass">
                            <div className="ck-pass-label">{ICON.passport} Passport <small>(optional — required for some destinations)</small></div>
                            <div className="ck-row">
                              <Field label="Passport number">
                                <input className="ck-input" value={t.passportNumber} onChange={(e) => setT(i, 'passportNumber')(e.target.value)} placeholder="EH123456" maxLength={30} />
                              </Field>
                              <Field label="Passport expiry" err={errors[`t${i}.passportExpiry`]}>
                                <input className="ck-input" type="date" value={t.passportExpiry} onChange={(e) => setT(i, 'passportExpiry')(e.target.value)} />
                              </Field>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {pax < 9 && (
                      <button className="ck-add-trav" onClick={addTraveller}>{ICON.plus} Add another traveller</button>
                    )}
                  </section>
                </>
              )}

              {/* ──────── STEP 2 : ADD-ONS ──────── */}
              {step === 1 && (
                <section className="ck-card ck-reveal">
                  <div className="ck-card-head">
                    <div className="ck-ico">{ICON.shield}</div>
                    <div className="ck-card-titles">
                      <h2 className="ck-card-title hd">Protect your holiday</h2>
                      <p className="ck-card-sub">87% of our travellers add insurance — cancel or get help abroad without losing money</p>
                    </div>
                  </div>

                  <div className="ck-ins-grid">
                    {INSURANCES.map((ins, idx) => {
                      const price = insPrice(ins);
                      const act = insurance === ins.id;
                      return (
                        <button
                          key={ins.id}
                          className={`ck-ins${act ? ' act' : ''}${ins.featured ? ' feat' : ''}`}
                          style={{ animationDelay: `${idx * 0.08}s` }}
                          onClick={() => setInsurance(ins.id)}>
                          {ins.featured && <span className="ck-ins-pop">{ICON.sparkle} Most chosen</span>}
                          <span className="ck-ins-top">
                            <span className="ck-ins-ico">{ins.icon}</span>
                            <span className="ck-ins-radio">{act && <i />}</span>
                          </span>
                          <span className="ck-ins-name hd">{ins.name}</span>
                          <span className="ck-ins-desc">{ins.desc}</span>
                          {ins.covers.length > 0 && (
                            <span className="ck-ins-covers">
                              {ins.covers.map((c) => <span key={c} className="ck-ins-cover">{ICON.check} {c}</span>)}
                            </span>
                          )}
                          <span className="ck-ins-price">
                            {ins.id === 'none'
                              ? <b>{ccy}0</b>
                              : <><b>+{money(price)}</b><small>{ins.perDay ? ` ${ccy}${ins.perDay.toFixed(2)} p.p. / day` : ' for your whole trip'}</small></>}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* insurance details panel */}
                  <div className={`ck-ins-details${insurance !== 'none' ? ' open' : ''}`}>
                    <div className="ck-ins-details-in">
                      <div className="ck-subhead" style={{ marginTop: 0 }}>{ICON.shieldCheck} Insurance details — {selIns?.name}</div>
                      <Check checked={holderIsLead} onChange={setHolderIsLead}>
                        The lead traveller {leadName ? <b>({leadName})</b> : ''} is the policy holder
                      </Check>
                      {!holderIsLead && (
                        <div className="ck-row">
                          <Field label="Policy holder first name" req>
                            <input className="ck-input" value={holder.firstName} onChange={(e) => setHolder((h) => ({ ...h, firstName: e.target.value }))} />
                          </Field>
                          <Field label="Policy holder last name" req>
                            <input className="ck-input" value={holder.lastName} onChange={(e) => setHolder((h) => ({ ...h, lastName: e.target.value }))} />
                          </Field>
                        </div>
                      )}
                      <div className="ck-ins-meta">
                        <div className="ck-ins-meta-item">{ICON.users} Covered travellers
                          <div className="ck-ins-chips">
                            {travellers.map((t, i) => (
                              <span className="ck-chip-check" key={i}>{ICON.check} {t.firstName ? `${t.firstName} ${t.lastName}` : `Traveller ${i + 1}`}</span>
                            ))}
                          </div>
                        </div>
                        <div className="ck-ins-meta-item">{ICON.cal} Cover starts <b>today</b> and ends when you return home</div>
                        <div className="ck-ins-meta-item">{ICON.mail} Policy documents are emailed to <b>{customerEmail || 'your email address'}</b></div>
                      </div>
                    </div>
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

                  <Check checked={billingSame} onChange={setBillingSame}>
                    Billing address is the same as my customer details
                  </Check>
                  <div className={errors.agree ? 'ck-err' : ''}>
                    <Check checked={agree} onChange={(v) => { setAgree(v); setErrors((er) => ({ ...er, agree: undefined })); }}>
                      I agree to the <a className="ck-a" onClick={(e) => e.stopPropagation()}>booking conditions</a>, <a className="ck-a">privacy policy</a> and the terms of the travel providers
                    </Check>
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
                  : <button className="ck-back-btn" onClick={() => navigate(-1)}>{ICON.arrowL} Back to hotel</button>}
                <button className={`ck-next-btn${paying ? ' busy' : ''}`} onClick={ctaAction} disabled={paying}>
                  {paying
                    ? <><span className="ck-spin" /> Processing payment…</>
                    : <>{step === 2 && ICON.lock} {ctaLabel} {step < 2 && ICON.arrow}</>}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT — SUMMARY ═══ */}
          <aside className="ck-aside">
            <div className="ck-sum">
              <div className="ck-sum-img">
                <img src={booking.img} alt={booking.hotelName} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
                  {isFlight
                    ? <span className="ck-sum-chip">{ICON.plane} {booking.loc}</span>
                    : <span className="ck-sum-chip">{ICON.moon} {booking.nights} nights</span>}
                  <span className="ck-sum-chip">{ICON.users} {pax} {pax === 1 ? 'traveller' : 'travellers'}</span>
                  {!isFlight && <span className="ck-sum-chip">{ICON.board} {booking.board}</span>}
                </div>

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

                {!isFlight && (
                  <>
                    <div className="ck-sum-sec">{ICON.bed} Room & board</div>
                    <div className="ck-sum-room">
                      <span>{booking.room}</span>
                      <small>{booking.meal} · included in price</small>
                    </div>
                  </>
                )}

                <div className="ck-sum-sec">{ICON.card} Price breakdown</div>
                <div className="ck-sum-rows">
                  <div className="ck-sum-row"><span>{pax} × {money(booking.ppPrice)} p.p.</span><b>{money(base)}</b></div>
                  {roomExtraTotal > 0 && <div className="ck-sum-row"><span>Room upgrade</span><b>{money(roomExtraTotal)}</b></div>}
                  <div className="ck-sum-row"><span>{isFlight ? 'Booking & service fee' : 'SGR Guarantee Fund'}</span><b>{money(SGR_FEE)}</b></div>
                  {insAmount > 0 && (
                    <div className="ck-sum-row ck-sum-row-ins" key={insurance}>
                      <span>{ICON.shieldCheck} {selIns?.name}</span><b>{money(insAmount)}</b>
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

                <div className={`ck-countdown${secsLeft === 0 ? ' over' : secsLeft < 120 ? ' low' : ''}`}>
                  {ICON.clock}
                  {secsLeft > 0
                    ? <>We're holding this price for <b>{mm}:{ss}</b></>
                    : <>Price hold expired — prices may update</>}
                </div>

                <div className="ck-trust">
                  <span className="ck-trust-item">{ICON.check} Free cancellation within 24h</span>
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
        <button className="ck-mbar-btn" onClick={ctaAction} disabled={paying}>
          {paying ? <span className="ck-spin" /> : <>{ctaLabel} {ICON.arrow}</>}
        </button>
      </div>
    </div>
  );
}

function CheckoutWithStripe() {
  const stripe = useStripe();
  const elements = useElements();
  return <CheckoutContent stripe={stripe} elements={elements} />;
}

export default function Checkout() {

  console.log('Stripe public key:', STRIPE_PK, 'Stripe available:', STRIPE_AVAILABLE);
  if (stripePromise) {
    return (
      <Elements stripe={stripePromise} options={{ locale: 'en' }}>
        <CheckoutWithStripe />
      </Elements>
    );
  }
  return <CheckoutContent stripe={null} elements={null} />;
}
