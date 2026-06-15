import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../../services/axiosInstance';
import './HotelDetail.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';
const DEFAULT_ORIGIN = 'BRU'; // departure airport used for the live flight search
const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calDay  = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? '' : WK[d.getDay()]; };
const calDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? iso : `${d.getDate()} ${MO[d.getMonth()]}`; };
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00'); if (isNaN(d.getTime())) return iso; d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(s);
};
const fmtDur = (min) => { const m = Number(min); if (!m || m <= 0) return ''; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const fmtDateLong = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d.getTime())) return ''; return `${WK[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}. ${d.getFullYear()}`; };

/* ── tiny SVG helper ── */
const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);

const ICON = {
  pin:   <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></S>,
  cal:   <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  users: <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>,
  plane: <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></S>,
  board: <S><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
  moon:  <S><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></S>,
  check: <S sw={2.5}><path d="M20 6L9 17l-5-5" /></S>,
  share: <S><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></S>,
  heart: <S><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></S>,
  gallery: <S><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></S>,
  bed:   <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  shield:<S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  noTransfer: <S><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /></S>,
  clock: <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  arrow: <S sw={2.5}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></S>,
  warn:  <S><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></S>,
  info:  <S><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  tag:   <S><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></S>,
};

const TAB_ICON = {
  Prices: <S sw={2}><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5z" /><path d="M6 9.01V9" /></S>,
  Information: <S sw={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  Facilities: <S sw={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></S>,
  Weather: <S sw={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></S>,
  Map: <S sw={2}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></S>,
  Reviews: <S sw={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></S>,
};

/* ── static demo data (from the design) ── */
const TABS = ['Prices', 'Information', 'Facilities' /*, 'Weather', 'Map', 'Reviews' */];
const FILTERS = [
  { label: 'Departure date', val: 'Thu, 19 March 2026', icon: ICON.cal },
  { label: 'Travelling company', val: '4 persons', icon: ICON.users },
  { label: 'Care (Meals)', val: 'No preference', icon: ICON.board },
  { label: 'Transport', val: 'All airports', icon: ICON.plane },
  { label: 'Duration', val: '6–10 days', icon: ICON.moon },
];
const DURATIONS = ['6 days', '7 days', '8 days', '9 days', '10 days'];
const PRICE_DAYS = [
  { day: 'Monday', date: '16 Mar.', price: 395, orig: 420, nights: 7 },
  { day: 'Tuesday', date: '17 Mar.', price: 378, orig: 410, nights: 7 },
  { day: 'Wednesday', date: '18 Mar.', price: 365, orig: 399, nights: 7 },
  { day: 'Thursday', date: '19 Mar.', price: 345, orig: 389, nights: 7, lowest: true },
  { day: 'Friday', date: '20 Mar.', price: 361, orig: 395, nights: 7 },
  { day: 'Saturday', date: '21 Mar.', price: 382, orig: 415, nights: 7 },
  { day: 'Sunday', date: '22 Mar.', price: 398, orig: 430, nights: 7 },
];
const PRICE_MIN = Math.min(...PRICE_DAYS.map((p) => p.price));
const PRICE_MAX = Math.max(...PRICE_DAYS.map((p) => p.price));
const FLIGHTS = [
  { outDate: 'Fri 10 Apr. 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 15 Apr. 2026', retAirline: 'TRANSAVIA', retDep: '12:45', retArr: '16:00', retDur: '4h 15m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)' },
  { outDate: 'Fri 10 Apr. 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 15 Apr. 2026', retAirline: 'ARKEFLY', retDep: '22:45', retArr: '02:10', retDur: '4h 25m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)', warning: 'Note: you arrive on Thursday.' },
];
const MODAL_FLIGHTS = [
  { outDate: 'Fri 01 May 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 06 May 2026', retAirline: 'TRANSAVIA', retDep: '12:45', retArr: '16:00', retDur: '4h 15m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)' },
  { outDate: 'Fri 01 May 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 06 May 2026', retAirline: 'ARKEFLY', retDep: '22:45', retArr: '02:10', retDur: '4h 25m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)', warning: 'Note: you arrive on Thursday.' },
  { outDate: 'Fri 01 May 2026', outAirline: 'ARKEFLY', outDep: '07:00', outArr: '11:50', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 06 May 2026', retAirline: 'ARKEFLY', retDep: '22:00', retArr: '01:25', retDur: '4h 25m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)' },
  { outDate: 'Fri 01 May 2026', outAirline: 'TRANSAVIA', outDep: '14:30', outArr: '18:20', outDur: '3h 50m', outFrom: 'Amsterdam (Schiphol)', outTo: 'Antalya Intl', retDate: 'Wed 06 May 2026', retAirline: 'TRANSAVIA', retDep: '12:45', retArr: '16:00', retDur: '4h 15m', retFrom: 'Antalya Intl', retTo: 'Amsterdam (Schiphol)' },
];
const SIDEBAR_FILTERS = [
  { title: 'Departure time outbound', opts: ['Early morning 00:00 - 06:59', 'Morning 07:00 - 11:59', 'Afternoon 12:00 - 17:59', 'Evening 18:00 - 23:59'] },
  { title: 'Departure time return', opts: ['Early morning 00:00 - 06:59', 'Morning 07:00 - 11:59', 'Afternoon 12:00 - 17:59', 'Evening 18:00 - 23:59'] },
  { title: 'Stopover', opts: ['Direct flights'] },
];
const ALT_AIRPORTS = [
  { name: 'Weeze', extra: '+€ 6 p.p.' }, { name: 'Charleroi', extra: '+€ 7 p.p.' },
  { name: 'Düsseldorf', extra: '+€ 23 p.p.' }, { name: 'Brussels', extra: '+€ 33 p.p.' },
  { name: 'Eindhoven', extra: '+€ 67 p.p.' }, { name: 'Schiphol', extra: '+€ 68 p.p.' },
  { name: 'Rotterdam', extra: '+€ 113 p.p.' },
];
const MEAL_PLANS = [
  { id: 'ro', name: 'Room Only', desc: 'No meals included', price: 420 },
  { id: 'bb', name: 'Bed & Breakfast', desc: 'Breakfast included', price: 460 },
  { id: 'hb', name: 'Half Board', desc: 'Breakfast + Dinner', price: 530 },
  { id: 'ai', name: 'All Inclusive', desc: 'All meals + drinks', price: 690 },
];
const ROOM_TYPES = [
  { name: 'Double Room Design Room', included: true, cap: 'min. 2 / max. 2 persons.', avail: null, lowAvail: null },
  { name: 'Double Room Premium', included: false, extra: '+€ 24', cap: 'min. 2 / max. 2 persons.', avail: 'Only 7 available!', lowAvail: 'Only 7 rooms available!' },
  { name: 'Double Room Penthouse', included: false, extra: '+€ 34', cap: 'min. 2 / max. 2 persons.', avail: 'Only 5 available!', lowAvail: 'Only 5 rooms available!' },
  { name: 'Double Room Junior Suite', included: false, extra: '+€ 56', cap: 'min. 2 / max. 2 persons.', avail: 'Only 2 available!', lowAvail: 'Only 1 room available!' },
];
const STAYS = [{ stayNum: 1, guests: '2 adults' }, { stayNum: 2, guests: '2 adults' }];
const FACILITIES = ['Swimming pool', 'Private beach', 'Restaurant', 'Spa & wellness', 'Fitness center', 'Pool bar', 'Free WiFi', 'Air conditioning', 'Elevator', 'Free parking', 'Room service', 'Fine dining'];
const MORE_FACILITIES = ['Tennis court', 'Bike rental', 'Water sports', 'Babysitting', 'Business center', 'Live music'];
const FAC_ICON = {
  'Swimming pool': <S sw={2}><path d="M2 20c.9-.4 1.8-.6 2.8-.6 1.8 0 3.5.9 5.2.9s3.5-.9 5.2-.9 3.5.9 5.2.9c.9 0 1.8-.2 2.8-.6" /><path d="M2 16c.9-.4 1.8-.6 2.8-.6 1.8 0 3.5.9 5.2.9s3.5-.9 5.2-.9 3.5.9 5.2.9c.9 0 1.8-.2 2.8-.6" /><path d="M8 14V6a2 2 0 012-2h0a2 2 0 012 2v3" /></S>,
  'Free WiFi': <S sw={2}><path d="M5 12.55a11 11 0 0114.08 0" /><path d="M1.42 9a16 16 0 0121.16 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></S>,
  'Restaurant': <S sw={2}><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
};
const WEATHER = [
  { m: 'Jan', i: '🌧️', t: 12, s: 4, r: 12 }, { m: 'Feb', i: '🌧️', t: 13, s: 5, r: 10 },
  { m: 'Mar', i: '⛅', t: 15, s: 6, r: 8 }, { m: 'Apr', i: '🌤️', t: 18, s: 8, r: 5 },
  { m: 'May', i: '☀️', t: 23, s: 10, r: 3, hl: true }, { m: 'Jun', i: '☀️', t: 28, s: 12, r: 1 },
  { m: 'Jul', i: '☀️', t: 31, s: 13, r: 0 }, { m: 'Aug', i: '☀️', t: 31, s: 12, r: 0 },
  { m: 'Sep', i: '☀️', t: 27, s: 10, r: 2 }, { m: 'Oct', i: '🌤️', t: 22, s: 7, r: 6 },
  { m: 'Nov', i: '⛅', t: 17, s: 5, r: 10 }, { m: 'Dec', i: '🌧️', t: 13, s: 3, r: 13 },
];
const RATINGS = [
  { l: 'Location', v: 9.6 }, { l: 'Cleanliness', v: 9.4 }, { l: 'Service', v: 9.2 },
  { l: 'Rooms', v: 9.1 }, { l: 'Food', v: 8.9 },
];
const REVIEWS = [
  { n: 'Anna K.', init: 'AK', d: 'March 2026', s: 9.5, t: 'Absolutely stunning hotel! The views from our room were breathtaking and the staff went above and beyond.' },
  { n: 'Marco B.', init: 'MB', d: 'February 2026', s: 9.2, t: 'Perfect adults-only getaway. The spa treatments were world-class and the private beach felt truly exclusive.' },
  { n: 'Sophie L.', init: 'SL', d: 'January 2026', s: 9.4, t: 'We celebrated our anniversary here and it was magical. The attention to detail and the incredible cocktail bar made this trip unforgettable.' },
];
const GALLERY = [
  'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=80',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=500&q=80',
  'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=500&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=500&q=80',
];

/* ── Flight card sub-component ── */
function FlightCard({ f, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const Leg = ({ dir, date, airline, dep, arr, dur, from, to, stopsLabel }) => (
    <div className="flight-leg">
      <div className="flight-leg-dir">{dir}</div>
      <div className="flight-leg-date">{date}</div>
      <div className="flight-airline">{airline}</div>
      <div className="flight-times">
        <div className="flight-time">{dep}</div>
        <div className="flight-path">
          <div className="flight-duration">{dur}</div>
          <div className="flight-line" />
          <div className="flight-direct">{stopsLabel || 'Direct flight'}</div>
        </div>
        <div className="flight-time">{arr}</div>
      </div>
      <div className="flight-airports"><span className="flight-airport">{from}</span><span className="flight-airport">{to}</span></div>
    </div>
  );

  const layoverMin = (a, b) => {
    if (!a?.arrival || !b?.departure) return null;
    const da = new Date(a.arrival), db = new Date(b.departure);
    if (isNaN(da) || isNaN(db)) return null;
    const m = Math.round((db - da) / 60000);
    return m > 0 ? m : null;
  };

  const renderTimeline = (legs, label, date) => {
    if (!legs?.length) return null;
    return (
      <div className="fd-journey">
        <div className="fd-dir"><span className="fd-dir-label">{label}</span><span className="fd-dir-date">{date}</span></div>
        {legs.map((leg, i) => (
          <div key={i} className="fd-seg-wrap">
            {i > 0 && (() => {
              const lay = layoverMin(legs[i - 1], leg);
              return lay ? <div className="fd-layover"><span className="fd-lay-icon">{ICON.clock}</span> {fmtDur(lay)} layover in {leg.from}</div> : null;
            })()}
            <div className="fd-segment">
              <div className="fd-seg-timeline">
                <div className="fd-dot" />
                <div className="fd-line" />
                <div className="fd-dot" />
              </div>
              <div className="fd-seg-body">
                <div className="fd-seg-row"><span className="fd-seg-airport">{leg.from}</span><span className="fd-seg-time">{fmtTime(leg.departure)}</span></div>
                <div className="fd-seg-meta"><span className="fd-seg-air">{leg.airline} {leg.flightNumber}</span><span className="fd-seg-dur">{fmtDur(leg.duration)}</span></div>
                <div className="fd-seg-row"><span className="fd-seg-airport">{leg.to}</span><span className="fd-seg-time">{fmtTime(leg.arrival)}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const paxLabel = (t) => t === 'ADT' ? 'Adult' : t === 'CHD' ? 'Child' : 'Infant';
  const hasDetails = f.outLegs?.length > 0 || f.fareBreakdown?.length > 0;

  return (
    <div className={`flight-card${selected ? ' selected' : ''}${expanded ? ' expanded' : ''}`}>
      <div className="flight-row">
        <Leg dir="Outbound" date={f.outDate} airline={f.outAirline} dep={f.outDep} arr={f.outArr} dur={f.outDur} from={f.outFrom} to={f.outTo} stopsLabel={f.outStops} />
        {(f.retDep || f.retDate) && <Leg dir="Return" date={f.retDate} airline={f.retAirline} dep={f.retDep} arr={f.retArr} dur={f.retDur} from={f.retFrom} to={f.retTo} stopsLabel={f.retStops} />}
      </div>
      <div className="flight-bottom">
        {hasDetails
          ? <button className="flight-details-btn" onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}>{expanded ? 'Hide details' : 'View details'}</button>
          : <button className="flight-details-btn">View details</button>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {f.price != null && <b className="live-price">€{f.price}</b>}
          <span className="flight-incl">{ICON.check} Including</span>
          {selected
            ? <div className="flight-selected-badge">{ICON.check} Selected</div>
            : <button className="flight-select-btn" onClick={onSelect}>Select</button>}
        </div>
      </div>
      {f.warning && <div className="flight-warning">{ICON.warn} {f.warning}</div>}

      {expanded && hasDetails && (
        <div className="fd-panel">
          <div className="fd-journeys">
            {renderTimeline(f.outLegs, 'Outbound', f.outDate)}
            {renderTimeline(f.retLegs, 'Return', f.retDate)}
          </div>
          {f.fareBreakdown?.length > 0 && (
            <div className="fd-fare">
              <div className="fd-fare-title">{ICON.tag} Fare breakdown</div>
              {f.fareBreakdown.map((fb, i) => (
                <div key={i} className="fd-fare-row">
                  <span className="fd-fare-pax">{fb.quantity} × {paxLabel(fb.paxType)}</span>
                  <span className="fd-fare-calc">€{Number(fb.basePrice).toFixed(2)} + €{Number(fb.tax).toFixed(2)} tax</span>
                  <span className="fd-fare-pp">€{Number(fb.totalPerPax).toFixed(2)} /pp</span>
                  <span className="fd-fare-sub">€{Number(fb.subtotal).toFixed(2)}</span>
                </div>
              ))}
              <div className="fd-fare-total">
                <span>Total</span>
                <span>€{Number(f.rawPrice || f.price || 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HotelDetail() {
  const { hotelCode } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const hotel = state?.hotel || null;
  const info  = state?.info || null;            // full bulk record (images, description, facilities)
  const pageRef = useRef(null);

  console.log('HotelDetail state:', state);
  // Header / booking facts pulled from the clicked result, with demo fallbacks
  const hotelName = hotel?.name || 'Cavo Vezal';
  const stars = hotel?.stars || 5;
  const locLabel = hotel?.loc ? `${hotel.loc}` : 'Greece, Zakynthos, Agios Sostis';
  const currency = hotel?.currency || '€';
  const ccy = currency === 'EUR' ? '€' : currency;
  const nights = state?.nights || 7;
  const ppPrice = hotel?.totalAmount ? Math.round(hotel.totalAmount / 2) : 765;

  // real photos from the bulk hotel record (fallback to demo gallery)
  const realImages = Array.isArray(info?.images) && info.images.length
    ? [...info.images].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map((im) => im.url).filter(Boolean)
    : null;
  const images = realImages && realImages.length ? realImages.slice(0, 30) : [hotel?.img || GALLERY[0], ...GALLERY.slice(1)];
  const photoCount = realImages?.length || 48;

  // search context (for the live calendar + availability calls)
  const destination  = state?.destination || '';
  const baseCheckIn  = state?.checkIn || '';
  const baseCheckOut = state?.checkOut || '';
  const sAdults   = String(state?.adults ?? '2');
  const sChildren = String(state?.children ?? '0');
  const sRooms    = String(state?.rooms ?? '1');

  const [activeTab, setActiveTab] = useState('Prices');
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selectedDur, setSelectedDur] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [selectedFlight, setSelectedFlight] = useState(0);
  const [modalFlight, setModalFlight] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [sidebarChecked, setSidebarChecked] = useState({});
  const [showAllFac, setShowAllFac] = useState(false);
  const [reviewsSeen, setReviewsSeen] = useState(false);
  // selected room index per stay; meal index per `${stay}-${room}`
  const [selectedRoom, setSelectedRoom] = useState({ 1: 0, 2: 0 });
  const [selectedMeal, setSelectedMeal] = useState({ '1-0': 1, '2-0': 1 });

  // live data: 7-day calendar + per-day availability
  const [calData, setCalData]       = useState(null);   // [{date, price, currency, isLowest}]
  const [calLoading, setCalLoading] = useState(false);
  const [liveRooms, setLiveRooms]   = useState(null);   // {loading?|error?|rooms[]|cheapest}
  const [liveFlights, setLiveFlights] = useState(null); // {loading?|error?|flights[]|cheapest}

  // scroll-reveal
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.reveal:not(.vis)') || [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [activeTab]);

  // lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  // lightbox: scroll lock + keyboard nav
  const closeLightbox = () => setLightbox(null);
  const prevImg = (e) => { e?.stopPropagation(); setLightbox((i) => (i - 1 + images.length) % images.length); };
  const nextImg = (e) => { e?.stopPropagation(); setLightbox((i) => (i + 1) % images.length); };
  useEffect(() => {
    if (lightbox === null) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') prevImg();
      else if (e.key === 'ArrowRight') nextImg();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox]);

  // animate rating bars once Reviews tab is opened
  useEffect(() => { if (activeTab === 'Reviews') setReviewsSeen(true); }, [activeTab]);

  // preload gallery images so the lightbox and tiles paint instantly
  useEffect(() => {
    images.forEach((src) => { const im = new window.Image(); im.src = src; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const toggleSidebar = (key) => setSidebarChecked((p) => ({ ...p, [key]: !p[key] }));

  // ── 7-day price calendar ──
  useEffect(() => {
    if (!hotelCode || !destination || !baseCheckIn || !baseCheckOut) { setCalData(null); return; }
    setCalLoading(true);
    const roomsN = Math.max(1, parseInt(sRooms, 10) || 1);
    const qs = new URLSearchParams({
      hotelCode: String(hotelCode), destination, checkIn: baseCheckIn, checkOut: baseCheckOut,
      adults: sAdults, children: sChildren, rooms: String(roomsN), source: 'combined',
      maxAdultsPerRoom: String(Math.ceil((parseInt(sAdults, 10) || 1) / roomsN)),
      maxChildrenPerRoom: String(Math.ceil((parseInt(sChildren, 10) || 0) / roomsN)),
    });
    let cancelled = false;
    fetch(`${CONTRACTS_API}/contracts/hotel-price-calendar?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setCalData(Array.isArray(j?.calendar) ? j.calendar : []); })
      .catch(() => { if (!cancelled) setCalData([]); })
      .finally(() => { if (!cancelled) setCalLoading(false); });
    return () => { cancelled = true; };
  }, [hotelCode, destination, baseCheckIn, baseCheckOut, sAdults, sChildren, sRooms]);

  // calendar drives the price boxes; fall back to the demo set when no live data
  const usingLive = Array.isArray(calData) && calData.length > 0;
  const priceDays = usingLive
    ? calData.map((c) => ({ iso: c.date, day: calDay(c.date), date: calDate(c.date), price: Math.round(c.price), currency: c.currency || 'EUR', lowest: !!c.isLowest, nights }))
    : PRICE_DAYS;
  const pMin = priceDays.length ? Math.min(...priceDays.map((p) => p.price)) : 0;
  const pMax = priceDays.length ? Math.max(...priceDays.map((p) => p.price)) : 1;
  const pd = selectedPrice != null ? priceDays[selectedPrice] : null;

  // live selection → live price shown in the Book Now card / mobile bar / checkout
  const liveRoom = liveRooms?.rooms?.length ? liveRooms.rooms[selectedRoom.live ?? 0] : null;
  const liveFlight = liveFlights?.flights?.length ? liveFlights.flights[selectedFlight] : null;
  const liveTotal = liveRoom ? Math.round((liveRoom.price || 0) + (liveFlight?.totalPrice || 0)) : null;
  const displayTotal = liveTotal != null ? liveTotal : (hotel?.totalAmount ? Math.round(hotel.totalAmount) : ppPrice * 2);

  // ── shared flight fetch (used on mount + day-click) ──
  const fetchFlights = (checkin, checkout) => {
    if (!destination) { setLiveFlights(null); return; }
    setLiveFlights({ loading: true });
    axiosInstance.post('/flight-availability/search', {
      from: DEFAULT_ORIGIN, to: destination, depdate: checkin, retdate: checkout,
      adults: Number(sAdults) || 2, children: Number(sChildren) || 0, infants: 0,
    }).then(({ data }) => {
      console.log('[Detail] flight-availability response', data?.results);
      const raw = data?.results?.airtuerk?.flights || [];
      const origin = DEFAULT_ORIGIN.toUpperCase();
      const outbound = [], inbound = [];
      raw.forEach((f) => {
        const legs = f.legs || [];
        if (!legs.length) return;
        if ((legs[0].from || '').toUpperCase() === origin) outbound.push(f);
        else if ((legs[legs.length - 1].to || '').toUpperCase() === origin) inbound.push(f);
      });
      let flights = [];
      if (outbound.length && inbound.length) {
        for (const ob of outbound) {
          for (const ib of inbound) {
            flights.push({
              totalPrice: (ob.totalPrice || 0) + (ib.totalPrice || 0),
              currency: ob.currency || 'EUR',
              outLegs: ob.legs || [], retLegs: ib.legs || [],
              stops: Math.max((ob.legs || []).length - 1, (ib.legs || []).length - 1),
              fareBreakdown: [...(ob.fareBreakdown || []), ...(ib.fareBreakdown || [])],
              offerKey: ob.offerKey || ib.offerKey || null,
            });
          }
        }
        flights.sort((a, b) => a.totalPrice - b.totalPrice);
      } else {
        flights = raw.map((f) => ({
          totalPrice: f.totalPrice || 0, currency: f.currency || 'EUR',
          outLegs: f.legs || [], retLegs: [], stops: (f.legs || []).length - 1,
          fareBreakdown: f.fareBreakdown || [], offerKey: f.offerKey || f.key || null,
        }));
      }
      setSelectedFlight(0);
      setLiveFlights({ flights, cheapest: data?.results?.cheapest || null });
    }).catch((e) => setLiveFlights({ error: e?.response?.data?.message || e?.message || 'Could not load live flights' }));
  };

  // ── fetch flights on mount using dates from results screen ──
  useEffect(() => {
    if (baseCheckIn && destination) fetchFlights(baseCheckIn, baseCheckOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── select a day → fetch live hotel + flight availability ──
  const selectDay = (i) => {
    setSelectedPrice(i);
    const day = priceDays[i];
    const checkin = day?.iso || baseCheckIn;
    const checkout = checkin ? addDaysISO(checkin, nights) : '';
    console.log('[Detail] day clicked → live availability', { hotelCode, destination, checkin, checkout });
    if (!hotelCode || !checkin) { setLiveRooms(null); setLiveFlights(null); return; }

    // Live hotel rooms
    setLiveRooms({ loading: true });
    axiosInstance.post('/hotel-availability/search', {
      hotelCode: String(hotelCode), checkin, checkout, adults: Number(sAdults) || 2, children: Number(sChildren) || 0,
    }).then(({ data }) => {
      console.log('[Detail] hotel-availability response', data?.results);
      const hb = data?.results?.hotelbeds, dn = data?.results?.diana;
      const dianaHotelId = dn?.dianaHotelId ?? dn?.hotelId ?? null;
      const rooms = [
        ...((hb?.rooms) || []).map((r) => ({ ...r, supplier: 'hotelbeds' })),
        ...((dn?.rooms) || []).map((r) => ({ ...r, supplier: 'diana', dianaHotelId })),
      ].map((r) => ({
        name: r.roomName || 'Room', board: r.boardName || r.boardCode || '',
        price: r.sellingRate ?? r.net ?? r.price ?? null, currency: r.currency || 'EUR', supplier: r.supplier,
        refundable: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies.length === 0 : undefined,
        cancellation: Array.isArray(r.cancellationPolicies) ? r.cancellationPolicies : [],
        rateKey: r.rateKey || null, roomCode: r.roomCode || null, boardCode: r.boardCode || null,
        net: r.net ?? null, dianaHotelId: r.dianaHotelId || null,
      })).filter((r) => r.price != null).sort((a, b) => a.price - b.price);
      setSelectedRoom((p) => ({ ...p, live: 0 }));
      setLiveRooms({ rooms, cheapest: data?.results?.cheapest || null });
    }).catch((e) => setLiveRooms({ error: e?.response?.data?.message || e?.message || 'Could not load live room prices' }));

    // Live flights
    fetchFlights(checkin, checkout);
  };

  // goReviews removed — Reviews tab commented out for now

  // hand the full selection over to the checkout screen
  const goCheckout = () => {
    const useLive = liveTotal != null;
    const pax = Number(sAdults) || 2;
    const checkin = pd?.iso || baseCheckIn;
    const checkout = pd?.iso ? addDaysISO(pd.iso, nights) : baseCheckOut;
    const total = useLive ? liveTotal : (hotel?.totalAmount ? Math.round(hotel.totalAmount) : ppPrice * pax);
    const perPerson = Math.max(1, Math.round(total / pax));

    const staticRoom = ROOM_TYPES[selectedRoom[1] ?? 0];
    const staticMeal = MEAL_PLANS[selectedMeal[`1-${selectedRoom[1] ?? 0}`] ?? 1];
    const roomName = useLive ? liveRoom.name : staticRoom.name;
    const board = useLive ? (liveRoom.board || hotel?.board || 'All inclusive') : (hotel?.board || 'All inclusive');

    const outLg = liveFlight?.outLegs || [];
    const retLg = liveFlight?.retLegs || [];
    const allLegs = [...outLg, ...retLg];
    const dispFlight = (useLive && liveFlight && allLegs.length)
      ? {
          outDep: fmtTime(outLg[0]?.departure), outArr: fmtTime(outLg[outLg.length - 1]?.arrival),
          outFrom: outLg[0]?.from || DEFAULT_ORIGIN, outTo: outLg[outLg.length - 1]?.to || destination,
          outDate: pd?.date, outAirline: outLg[0]?.airline,
          ...(retLg.length ? {
            retDep: fmtTime(retLg[0]?.departure), retArr: fmtTime(retLg[retLg.length - 1]?.arrival),
            retFrom: retLg[0]?.from, retTo: retLg[retLg.length - 1]?.to,
            retDate: calDate(checkout), retAirline: retLg[0]?.airline,
          } : {}),
        }
      : (FLIGHTS[selectedFlight] || FLIGHTS[0]);

    const dateLabel = useLive
      ? `${pd?.date} — ${calDate(checkout)}`
      : `${dispFlight.outDate.replace('.', '')} — ${dispFlight.retDate.replace('.', '')}`;

    navigate('/checkout', {
      state: {
        booking: {
          hotelCode, hotelName, stars: Math.min(stars, 5), loc: locLabel,
          img: images[0], board,
          nights, adults: pax, currency: ccy,
          ppPrice: useLive ? perPerson : (pd?.price ?? ppPrice), origPrice: useLive ? null : (pd?.orig ?? null),
          dateLabel,
          flight: dispFlight,
          room: roomName,
          roomExtra: 0,
          meal: useLive ? (liveRoom.board || 'Room only') : staticMeal.name,
          mealPrice: useLive ? 0 : staticMeal.price,
          // ── payload for the backend Online-booking create call ──
          api: {
            hotel: {
              hotelCode: String(hotelCode), hotelName, checkin, checkout, nights,
              room: roomName, supplier: useLive ? (liveRoom.supplier || 'hotelbeds') : 'hotelbeds',
              // identifiers the supplier reservation needs (from the live availability response)
              rateKey: useLive ? (liveRoom.rateKey || null) : null,
              roomCode: useLive ? (liveRoom.roomCode || null) : null,
              boardCode: useLive ? (liveRoom.boardCode || null) : null,
              dianaHotelId: useLive ? (liveRoom.dianaHotelId || null) : null,
              price: useLive ? Math.round(liveRoom.price) : total, currency: ccy,
            },
            flight: (useLive && liveFlight)
              ? { from: DEFAULT_ORIGIN, to: destination, depdate: checkin, retdate: checkout, price: Math.round(liveFlight.totalPrice), currency: ccy, legs: allLegs, fareBreakdown: liveFlight.fareBreakdown || [], offerKey: liveFlight.offerKey || null, tripType: retLg.length ? 'roundtrip' : 'oneway', supplier: 'airtuerk' }
              : null,
          },
        },
      },
    });
  };

  return (
    <div className="sd" ref={pageRef}>
      {/* Hero — blends into the transparent app navbar; mosaic lives inside it */}
      <header className="sd-hero">
        <div className="sd-hero-bg">
          <span className="sd-hero-glow2" />
          <span className="sd-hero-grid" />
        </div>
        <div className="sd-hero-inner">
          <div className="sd-hero-top">
            <div className="bc">
              <Link to="/">Home</Link><span style={{ opacity: .4 }}>›</span>
              <a onClick={() => navigate(-1)}>Results</a><span style={{ opacity: .4 }}>›</span>
              <span style={{ color: '#fff' }}>{hotelName}</span>
            </div>
            <div className="hha">
              <button className="hhb">{ICON.share} Share</button>
              <button className={`hhb${saved ? ' saved' : ''}`} onClick={() => setSaved((s) => !s)}>
                {ICON.heart} {saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>

          <div className="sd-hero-main">
            <div className="sd-hero-left">
              <div className="sd-hero-eyebrow">{ICON.shield} Verified stay · {Math.min(stars, 5)}-star hotel</div>
              <h1 className="hhn">{hotelName}</h1>
              <div className="hhm">
                <span className="hhs">{'★'.repeat(Math.min(stars, 5))}</span>
                <span className="hhl">{ICON.pin} {locLabel}</span>
              </div>
              <span className="sd-hero-rule" />
              <div className="sd-hero-chips">
                <span className="sd-chip">{ICON.board} {hotel?.board || 'All inclusive'}</span>
                <span className="sd-chip">{ICON.moon} {nights} nights</span>
                <span className="sd-chip">{ICON.users} 2 adults</span>
                <span className="sd-chip sd-chip-price">{ICON.tag} from {ccy}{ppPrice} p.p.</span>
              </div>
              <div className="sd-hero-trust">
                <span className="sd-hc-item">{ICON.check} Free cancellation</span>
                <span className="sd-hc-item">{ICON.check} No booking fees</span>
                <span className="sd-hc-item">{ICON.check} Best price guarantee</span>
                <span className="sd-hc-item">{ICON.check} Instant confirmation</span>
              </div>
            </div>

            <div className="sd-hero-photos">
              <div className="gi gi-hero" onClick={() => setLightbox(0)}>
                <img src={images[0]} alt={hotelName} fetchPriority="high" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className="gi-zoom"><S size={18} sw={2}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></S></span>
              </div>
              {images.slice(1, 5).map((src, i) => (
                <div className="gi" key={i} onClick={() => setLightbox(i + 1)}>
                  <img src={src} alt={`${hotelName} ${i + 2}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  {i === 3 && photoCount > 5 && <span className="gi-more">+{photoCount - 5}</span>}
                  <span className="gi-zoom"><S size={18} sw={2}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></S></span>
                </div>
              ))}
              <button className="ga" onClick={() => setLightbox(0)}>{ICON.gallery} View all {photoCount} photos</button>
            </div>
          </div>
        </div>
      </header>

      <div className="pg">
        <div className="grid">
          <div>
            {/* Tabs */}
            <div className="tw">
              <div className="tabs">
                {TABS.map((t) => (
                  <button key={t} className={`tb${activeTab === t ? ' act' : ''}`} onClick={() => setActiveTab(t)}>
                    {TAB_ICON[t]} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ── PRICES ── */}
            <div className={`tp${activeTab === 'Prices' ? ' act' : ''}`}>
              <div className="section-title"><span className="st-step">1</span> Compare the lowest prices</div>

              <div className="filter-bar">
                <div className="filter-fields">
                  {FILTERS.map((f) => (
                    <div className="filter-item" key={f.label}>
                      <span className="fi-ico">{f.icon}</span>
                      <div className="fi-body">
                        <div className="filter-label">{f.label}</div>
                        <select className="filter-val"><option>{f.val}</option></select>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="filter-foot">
                  <span className="filter-foot-label">Exact duration</span>
                  <div className="dur-chips">
                    {DURATIONS.map((d, i) => (
                      <button key={d} className={`dur-chip${selectedDur === i ? ' act' : ''}`} onClick={() => setSelectedDur(i)}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>

              {calLoading && !usingLive ? (
                <div className="price-boxes">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="price-box pb-skel" />)}
                </div>
              ) : (
                <div className="price-boxes">
                  {priceDays.map((p, i) => (
                    <div key={p.iso || i}
                      className={`price-box${p.lowest ? ' lowest' : ''}${selectedPrice === i ? ' selected' : ''}`}
                      onClick={() => selectDay(i)}>
                      <div className="pb-day">{(p.day || '').substring(0, 3)}</div>
                      <div className="pb-date">{p.date}</div>
                      <div className="pb-from">from</div>
                      <div className="pb-price">€{p.price}</div>
                      <div className="pb-nights">{p.nights} {p.nights === 1 ? 'night' : 'nights'}</div>
                      <div className="pb-bar"><span style={{ height: `${Math.round(35 + 65 * ((p.price - pMin) / ((pMax - pMin) || 1)))}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}

              <div className={`avail-banner${pd ? ' show' : ''}`}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981" /><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <div>
                  <div className="avail-text">
                    {liveRooms?.loading ? 'Checking live availability…'
                      : liveRooms?.error ? 'Showing estimated price'
                      : liveRoom ? 'Your holiday is available!'
                      : 'Your holiday is available!'}
                  </div>
                  <div className="avail-sub">
                    {pd && `Selected ${pd.day} ${pd.date} · ${nights} ${nights === 1 ? 'night' : 'nights'}`}
                    {liveRoom ? ` · ${liveRoom.supplier}` : ''}
                  </div>
                </div>
                <div className="avail-price">
                  <div className="avail-price-label">{liveRoom ? 'live price' : 'from'}</div>
                  <div className="avail-price-val">
                    {liveRooms?.loading
                      ? <span className="avail-spin" />
                      : <><small>€</small>{liveRoom ? Math.round(liveRoom.price) : pd?.price}</>}
                  </div>
                  <div className="avail-you-low">
                    {liveRoom ? `Live room price · ${nights} ${nights === 1 ? 'night' : 'nights'}`
                      : liveRooms?.error ? 'Live price unavailable — estimate shown'
                      : (pd?.lowest ? 'Lowest estimated price' : 'Estimated price')}
                  </div>
                </div>
              </div>

              {/* Flights */}
              <div className="flight-section reveal">
                <div className="section-title"><span className="st-step">3</span> Your flights</div>
                {liveFlights ? (
                  liveFlights.loading ? (
                    <div className="live-loading"><span className="live-spin" /> Checking live flight prices…</div>
                  ) : liveFlights.error ? (
                    <div className="live-error">{ICON.warn} {liveFlights.error}</div>
                  ) : liveFlights.flights?.length ? (
                    <>
                      <div className="flight-note">Live fares from {DEFAULT_ORIGIN} for your selected dates:</div>
                      {liveFlights.flights.slice(0, 6).map((f, i) => {
                        const oF = f.outLegs[0], oL = f.outLegs[f.outLegs.length - 1];
                        const rF = f.retLegs[0], rL = f.retLegs[f.retLegs.length - 1];
                        const oStops = Math.max(0, f.outLegs.length - 1);
                        const rStops = Math.max(0, f.retLegs.length - 1);
                        const cardData = {
                          outDate: fmtDateLong(oF?.departure), outAirline: `${oF?.airline || ''} ${oF?.flightNumber || ''}`.trim(),
                          outDep: fmtTime(oF?.departure), outArr: fmtTime(oL?.arrival),
                          outDur: fmtDur(f.outLegs.reduce((s, l) => s + (Number(l.duration) || 0), 0)),
                          outFrom: oF?.from || '', outTo: oL?.to || '',
                          outStops: oStops === 0 ? 'Direct flight' : `${oStops} stop${oStops > 1 ? 's' : ''}`,
                          retDate: rF ? fmtDateLong(rF.departure) : '', retAirline: rF ? `${rF.airline || ''} ${rF.flightNumber || ''}`.trim() : '',
                          retDep: fmtTime(rF?.departure), retArr: fmtTime(rL?.arrival),
                          retDur: f.retLegs.length ? fmtDur(f.retLegs.reduce((s, l) => s + (Number(l.duration) || 0), 0)) : '',
                          retFrom: rF?.from || '', retTo: rL?.to || '',
                          retStops: rStops === 0 ? 'Direct flight' : `${rStops} stop${rStops > 1 ? 's' : ''}`,
                          price: Math.round(f.totalPrice), rawPrice: f.totalPrice,
                          outLegs: f.outLegs, retLegs: f.retLegs, fareBreakdown: f.fareBreakdown,
                        };
                        return <FlightCard key={i} f={cardData} selected={selectedFlight === i} onSelect={() => setSelectedFlight(i)} />;
                      })}
                    </>
                  ) : (
                    <div className="live-empty">{ICON.plane} No live flights found for these dates.</div>
                  )
                ) : (
                  <>
                    <div className="flight-note">We have selected the cheapest flight for you:</div>
                    {FLIGHTS.map((f, i) => (
                      <FlightCard key={i} f={f} selected={selectedFlight === i} onSelect={() => setSelectedFlight(i)} />
                    ))}
                    <button className="show-more-flights" onClick={() => setModalOpen(true)}>{ICON.plane} Show more flights</button>
                    <div className="alt-airports">
                      <div className="alt-airports-label">Or flying from another airport?</div>
                      <div className="alt-airport-chips">
                        {ALT_AIRPORTS.map((a) => (
                          <div className="alt-chip" key={a.name}>
                            <div className="alt-chip-name">{a.name}</div>
                            <div className="alt-chip-price">{a.extra}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Rooms — live availability, revealed only after a date is picked */}
              {selectedPrice != null && (
              <div className="room-section reveal vis">
                <div className="section-title"><span className="st-step">2</span> Choose your room</div>
                {liveRooms ? (
                  liveRooms.loading ? (
                    <div className="live-loading"><span className="live-spin" /> Checking live room availability…</div>
                  ) : liveRooms.error ? (
                    <div className="live-error">{ICON.warn} {liveRooms.error}</div>
                  ) : liveRooms.rooms?.length ? (
                    <div className="stay-block">
                      <div className="stay-header"><div className="stay-icon">{ICON.bed}</div><div className="stay-title">Available rooms <span className="stay-guests">(live prices)</span></div></div>
                      {liveRooms.rooms.slice(0, 8).map((rm, ri) => {
                        const isSel = selectedRoom.live === ri;
                        return (
                          <div key={ri} className={`room-option${isSel ? ' selected' : ''}`} onClick={() => setSelectedRoom((p) => ({ ...p, live: ri }))}>
                            <div className="room-radio" />
                            <div className="room-info">
                              <div className="room-name">{rm.name}</div>
                              <div className="room-cap">{[rm.board, rm.supplier].filter(Boolean).join(' · ')}</div>
                              {rm.cancellation?.length > 0 ? (
                                <div className="room-cancel room-cancel-nr">
                                  {ICON.warn} Non-refundable — cancel before {(() => { const d = new Date(rm.cancellation[0].from); return isNaN(d.getTime()) ? rm.cancellation[0].from : `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`; })()} or pay €{Number(rm.cancellation[0].amount).toFixed(0)} penalty
                                </div>
                              ) : rm.refundable === true ? (
                                <div className="room-cancel room-cancel-free">{ICON.check} Free cancellation</div>
                              ) : null}
                            </div>
                            <div className="room-price">€{Math.round(rm.price)}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="live-empty">{ICON.bed} No live rooms found for these dates.</div>
                  )
                ) : (
                  STAYS.map((stay) => (
                  <div className="stay-block" key={stay.stayNum}>
                    <div className="stay-header">
                      <div className="stay-icon">{ICON.bed}</div>
                      <div className="stay-title">Stay {stay.stayNum} <span className="stay-guests">({stay.guests})</span></div>
                    </div>
                    {ROOM_TYPES.map((rm, ri) => {
                      const isSel = selectedRoom[stay.stayNum] === ri;
                      const mealKey = `${stay.stayNum}-${ri}`;
                      return (
                        <div key={ri}
                          className={`room-option${isSel ? ' selected' : ''}`}
                          onClick={() => setSelectedRoom((p) => ({ ...p, [stay.stayNum]: ri }))}>
                          <div className="room-radio" />
                          <div className="room-info">
                            <div className="room-name">{rm.name} <span className="room-name-info">{ICON.info}</span></div>
                            <div className="room-cap">{rm.cap}</div>
                            {rm.avail && <div className="room-avail">{rm.avail}</div>}
                          </div>
                          {rm.included
                            ? <div className="room-price included">{ICON.check}&nbsp;Including</div>
                            : <div className="room-price">{rm.extra}</div>}

                          {/* meal panel (shown when room selected via CSS) */}
                          <div className="room-meals">
                            {MEAL_PLANS.map((m, mi) => {
                              const mealSel = (selectedMeal[mealKey] ?? 1) === mi;
                              return (
                                <div key={m.id}
                                  className={`meal-row${mealSel ? ' meal-selected' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setSelectedMeal((p) => ({ ...p, [mealKey]: mi })); }}>
                                  <div className="meal-radio" />
                                  <div className="meal-info">
                                    <div className="meal-name">{m.name}</div>
                                    <div className="meal-desc">{m.desc}</div>
                                  </div>
                                  <div className="meal-price">€{m.price}</div>
                                  {mealSel
                                    ? <span className="meal-action selected-badge">{ICON.check} Selected</span>
                                    : <button className="meal-action select-btn">Select</button>}
                                </div>
                              );
                            })}
                          </div>
                          {isSel && rm.lowAvail && <div className="room-low-avail">{ICON.warn} {rm.lowAvail}</div>}
                        </div>
                      );
                    })}
                  </div>
                  ))
                )}
              </div>
              )}

              {/* Overview */}
              <div className="overview-section reveal">
                <div className="section-title"><span className="st-step">4</span> Overview of your holiday</div>
                <div className="overview-card">
                  <div className="overview-head">
                    <div className="overview-head-main">
                    <div className="overview-hotel">{hotelName}</div>
                    <div className="overview-stars">{'★'.repeat(Math.min(stars, 5))}</div>
                    <div className="overview-loc">{ICON.pin} {locLabel}</div>
                    <div className="overview-dates">{ICON.cal} Friday 10 April 2026 - Wednesday 15 April 2026 <span style={{ color: 'var(--text-light)' }}>({nights} nights)</span></div>
                    </div>
                    {/* overview-score removed — no real review data yet */}
                  </div>
                  <div className="overview-body">
                    <div className="overview-row"><span className="overview-row-label">{ICON.users} 4 × {ccy}361 p.p.</span><span className="overview-leader" /><span className="overview-row-val">{ccy} 1,444</span></div>
                    <div className="overview-row"><span className="overview-row-label">{ICON.shield} SGR Guarantee Fund</span><span className="overview-leader" /><span className="overview-row-val">{ccy} 20</span></div>
                    <div className="overview-row"><span className="overview-row-label">{ICON.noTransfer} Transfer not included</span><span className="overview-leader" /><span className="overview-row-val" style={{ color: 'var(--text-light)' }}>—</span></div>
                    <div className="overview-extras">
                      <div className="overview-extra">{ICON.check} No booking fees</div>
                      <div className="overview-extra">{ICON.check} Hand luggage included</div>
                    </div>
                  </div>
                  <div className="overview-total"><span className="overview-total-label">Total for 4 people</span><span className="overview-total-val">{ccy}1,424</span></div>
                  <div className="overview-deposit">{ICON.info} At this low price, no deposit is possible.</div>
                  <div className="overview-book-wrap">
                    <button className="overview-book-btn" onClick={goCheckout}>Now book {ICON.arrow}</button>
                  </div>
                  <div className="overview-spot-costs">
                    <div className="overview-spot-costs-label">{ICON.tag} Not included — pay on the spot</div>
                    <div className="overview-spot-list">
                      <span className="overview-spot-cost">{ccy} 20,00</span>
                      <span className="overview-spot-cost">{ccy} 20,00</span>
                    </div>
                  </div>
                  <div className="overview-urgency"><div className="overview-urgency-text">{ICON.clock} You now have the lowest price. It can change quickly.</div></div>
                </div>
              </div>
            </div>

            {/* ── INFORMATION ── */}
            <div className={`tp${activeTab === 'Information' ? ' act' : ''}`}>
              {/* About card */}
              <div className="inf-card reveal">
                <div className="inf-card-header">
                  <div className="inf-card-icon">{ICON.info}</div>
                  <h3 className="inf-card-title">About {hotelName}</h3>
                </div>
                <div className={`inf-desc${expanded.d1 ? ' exp' : ''}`}>
                  {info?.description || `${hotelName} is a stunning boutique hotel nestled on the pristine shores of ${locLabel}. This retreat combines contemporary luxury with natural beauty, offering guests an unparalleled holiday experience.`}
                </div>
                {((info?.description?.length || 0) > 200 || !info?.description) && (
                  <button className="inf-read-more" onClick={() => toggleExpand('d1')}>
                    {expanded.d1 ? 'Show less' : 'Read more'}
                    <S size={14} sw={2.5}><path d={expanded.d1 ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} /></S>
                  </button>
                )}
              </div>

              {/* Quick stats tiles */}
              {(() => {
                const facLoc = (info?.facilities || []).filter((f) => f.facilityGroupName === 'Location');
                const year = facLoc.find((f) => f.facilityName === 'Year of construction');
                const reno = facLoc.find((f) => f.facilityName === 'Year of most recent renovation');
                const floors = facLoc.find((f) => f.facilityName === 'Number of floors (main building)');
                const totalRooms = facLoc.find((f) => f.facilityName === 'Total number of rooms');
                const stats = [
                  year?.number && { icon: ICON.cal, label: 'Built', value: year.number },
                  reno?.number && { icon: <S sw={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></S>, label: 'Renovated', value: reno.number },
                  floors?.number && { icon: <S sw={2}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></S>, label: 'Floors', value: floors.number },
                  totalRooms?.number && { icon: ICON.bed, label: 'Total rooms', value: totalRooms.number },
                  { icon: <S sw={2}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></S>, label: 'Category', value: `${Math.min(stars, 5)}-Star` },
                  { icon: ICON.board, label: 'Board', value: hotel?.board || 'All inclusive' },
                ].filter(Boolean);
                return stats.length > 0 && (
                  <div className="inf-stats reveal">
                    {stats.map((s, i) => (
                      <div className="inf-stat" key={i}>
                        <div className="inf-stat-icon">{s.icon}</div>
                        <div className="inf-stat-label">{s.label}</div>
                        <div className="inf-stat-value">{s.value}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Location card */}
              {(info?.address || info?.city) && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--loc">{ICON.pin}</div>
                    <h3 className="inf-card-title">Location & Address</h3>
                  </div>
                  <div className="inf-loc-body">
                    {info?.latitude && info?.longitude && (
                      <div className="inf-minimap">
                        <iframe
                          title="Hotel location"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(info.longitude) - 0.008},${Number(info.latitude) - 0.006},${Number(info.longitude) + 0.008},${Number(info.latitude) + 0.006}&layer=mapnik&marker=${info.latitude},${info.longitude}`}
                        />
                      </div>
                    )}
                    <div className="inf-loc-details">
                      {info.address && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon">{ICON.pin}</div>
                          <div><div className="inf-loc-lbl">Address</div><div className="inf-loc-val">{info.address}</div></div>
                        </div>
                      )}
                      {info.city && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon"><S sw={2}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></S></div>
                          <div><div className="inf-loc-lbl">City / Region</div><div className="inf-loc-val">{info.city}</div></div>
                        </div>
                      )}
                      {info.latitude && (
                        <div className="inf-loc-row">
                          <div className="inf-loc-icon"><S sw={2}><polygon points="3 11 22 2 13 21 11 13 3 11" /></S></div>
                          <div><div className="inf-loc-lbl">Coordinates</div><div className="inf-loc-val">{Number(info.latitude).toFixed(4)}° N, {Number(info.longitude).toFixed(4)}° E</div></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact card */}
              {info?.phones?.length > 0 && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--contact"><S sw={2}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></S></div>
                    <h3 className="inf-card-title">Contact</h3>
                  </div>
                  <div className="inf-contacts">
                    {info.phones.map((p, i) => {
                      const type = p.phoneType === 'PHONEBOOKING' ? 'Booking' : p.phoneType === 'PHONEHOTEL' ? 'Hotel' : p.phoneType === 'FAXNUMBER' ? 'Fax' : 'Phone';
                      const iconEl = p.phoneType === 'FAXNUMBER'
                        ? <S sw={2}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V2H8v5" /><line x1="6" y1="13" x2="6.01" y2="13" /></S>
                        : <S sw={2}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></S>;
                      return (
                        <div className="inf-contact-card" key={i}>
                          <div className="inf-contact-icon">{iconEl}</div>
                          <div className="inf-contact-type">{type}</div>
                          <div className="inf-contact-number">{p.phoneNumber}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Room types card */}
              {info?.rooms?.length > 0 && (
                <div className="inf-card reveal">
                  <div className="inf-card-header">
                    <div className="inf-card-icon inf-card-icon--room">{ICON.bed}</div>
                    <h3 className="inf-card-title">Room Types</h3>
                    <span className="inf-card-count">{info.rooms.length} types</span>
                  </div>
                  <div className="inf-room-grid">
                    {info.rooms.map((rm, i) => (
                      <div className="inf-room-tile" key={i}>
                        <div className="inf-room-badge">{rm.roomCode}</div>
                        <div className="inf-room-guests">
                          <S size={14} sw={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>
                          {rm.minPax}–{rm.maxPax} guests
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── FACILITIES ── */}
            <div className={`tp${activeTab === 'Facilities' ? ' act' : ''}`}>
              {info?.facilities?.length > 0 ? (() => {
                const groups = {};
                const skipGroups = ['Location', 'Methods of payment'];
                info.facilities.forEach((f) => {
                  if (skipGroups.includes(f.facilityGroupName)) return;
                  const g = f.facilityGroupName || 'Other';
                  if (!groups[g]) groups[g] = [];
                  groups[g].push(f);
                });
                const entries = Object.entries(groups);
                const shown = showAllFac ? entries : entries.slice(0, 5);
                return <>
                  <div className="fac-header reveal">
                    <div className="inf-card-icon">{TAB_ICON.Facilities}</div>
                    <div>
                      <h3 className="inf-card-title">Hotel Facilities</h3>
                      <div className="fac-subtitle">{entries.length} categories · {info.facilities.filter((f) => !skipGroups.includes(f.facilityGroupName)).length} amenities</div>
                    </div>
                  </div>
                  {shown.map(([group, items]) => (
                    <div className="fac-card reveal" key={group}>
                      <div className="fac-card-head">
                        <div className="fac-card-dot" />
                        <span className="fac-card-name">{group}</span>
                        <span className="fac-card-count">{items.length}</span>
                      </div>
                      <div className="fac-card-items">
                        {items.map((f, i) => (
                          <div className={`fac-item${f.isPaid ? ' fac-item--paid' : ''}`} key={i}>
                            <div className="fac-item-icon">{ICON.check}</div>
                            <span className="fac-item-name">{f.facilityName}{f.number ? ` (${f.number})` : ''}</span>
                            {f.isPaid && <span className="fac-item-badge">Paid</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!showAllFac && entries.length > 5 && (
                    <button className="fac-show-all" onClick={() => setShowAllFac(true)}>
                      Show all {entries.length} categories
                      <S size={14} sw={2.5}><path d="M6 9l6 6 6-6" /></S>
                    </button>
                  )}
                  {showAllFac && entries.length > 5 && (
                    <button className="fac-show-all" onClick={() => setShowAllFac(false)}>
                      Show less
                      <S size={14} sw={2.5}><path d="M18 15l-6-6-6 6" /></S>
                    </button>
                  )}
                </>;
              })() : (
                <>
                  <div className="fac-header reveal">
                    <div className="inf-card-icon">{TAB_ICON.Facilities}</div>
                    <div>
                      <h3 className="inf-card-title">Hotel Facilities</h3>
                      <div className="fac-subtitle">{FACILITIES.length + MORE_FACILITIES.length} amenities</div>
                    </div>
                  </div>
                  <div className="fac-card reveal">
                    <div className="fac-card-items">
                      {FACILITIES.map((f) => (
                        <div className="fac-item" key={f}>
                          <div className="fac-item-icon">{FAC_ICON[f] || ICON.check}</div>
                          <span className="fac-item-name">{f}</span>
                        </div>
                      ))}
                      {showAllFac && MORE_FACILITIES.map((f, i) => (
                        <div className="fac-item" key={f} style={{ animation: `sdFadeUp .4s var(--ease) ${i * 0.06}s both` }}>
                          <div className="fac-item-icon">{ICON.check}</div>
                          <span className="fac-item-name">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {!showAllFac && <button className="fac-show-all" onClick={() => setShowAllFac(true)}>Show all facilities <S size={14} sw={2.5}><path d="M6 9l6 6 6-6" /></S></button>}
                </>
              )}
            </div>

            {/* ── WEATHER (commented out for now) ──
            <div className={`tp${activeTab === 'Weather' ? ' act' : ''}`}>
              <h3 className="section-title">
                {TAB_ICON.Weather} Climate
              </h3>
              <div className="ws">
                {WEATHER.map((w) => (
                  <div className={`wc${w.hl ? ' hl' : ''}`} key={w.m}>
                    <div className="wm">{w.m}</div>
                    <div className="wi">{w.i}</div>
                    <div className="wt">{w.t}°</div>
                    <div className="wd">☀ {w.s}h · 🌧 {w.r}d</div>
                  </div>
                ))}
              </div>
            </div>
            */}

            {/* ── MAP (commented out for now) ──
            <div className={`tp${activeTab === 'Map' ? ' act' : ''}`}>
              {info?.latitude && info?.longitude ? (
                <iframe
                  className="map-embed"
                  title="Hotel location"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(info.longitude) - 0.01},${Number(info.latitude) - 0.008},${Number(info.longitude) + 0.01},${Number(info.latitude) + 0.008}&layer=mapnik&marker=${info.latitude},${info.longitude}`}
                  style={{ width: '100%', height: 400, border: 'none', borderRadius: 16 }}
                />
              ) : (
                <div className="mc">
                  <div className="mp"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" className="mpin"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg></div>
                  <div className="mi"><span className="ml">{ICON.pin} {locLabel}</span></div>
                </div>
              )}
              <div className="map-address">
                {ICON.pin} {info?.address ? `${info.address}, ${info?.city || ''}` : locLabel}
              </div>
            </div>
            */}

            {/* ── REVIEWS (commented out for now) ──
            <div className={`tp${activeTab === 'Reviews' ? ' act' : ''}`}>
              <div className="rs reveal">
                <div className="rb">9.3</div>
                <div><div className="rl">Fantastic</div><div className="rn">Based on 247 verified reviews</div></div>
                <div className="rbs">
                  {RATINGS.map((r) => (
                    <div className="rr" key={r.l}>
                      <span className="rrl">{r.l}</span>
                      <div className="rrt"><div className="rrf" style={{ width: reviewsSeen ? `${r.v * 10}%` : 0 }} /></div>
                      <span className="rrv">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rvl">
                {REVIEWS.map((r) => (
                  <div className="rv" key={r.n}>
                    <div className="rvt">
                      <div className="rva">{r.init}</div>
                      <div><div className="rvna">{r.n}</div><div className="rvd">{r.d}</div></div>
                      <div className="rvs">{r.s}</div>
                    </div>
                    <div className="rvx">{r.t}</div>
                  </div>
                ))}
              </div>
            </div>
            */}
          </div>

          {/* Booking sidebar */}
          <aside>
            <div className="bk">
              {/* bkr review score removed — no real review data yet */}
              <div className="bkp">
                <div className="bkpl">{liveTotal != null ? `live price · ${pd?.day} ${pd?.date}` : 'per person from'}</div>
                <div className="bkpr hd">{ccy}{liveTotal != null ? liveTotal.toLocaleString('en-GB') : ppPrice} {liveTotal == null && <span>p.p.</span>}</div>
                <div className="bkp-total">
                  {liveTotal != null
                    ? `${liveRoom ? 'Room' : ''}${liveRoom && liveFlight ? ' + flight' : liveFlight ? 'Flight' : ''} · ${sAdults} ${Number(sAdults) === 1 ? 'adult' : 'adults'}`
                    : `${ccy}${displayTotal.toLocaleString('en-GB')} total · 2 adults`}
                </div>
              </div>
              <div className="bkd">
                <div className="bkdi"><span className="bkdk">{ICON.cal}</span>Wed 06 May — Wed 13 May 2026</div>
                <div className="bkdi"><span className="bkdk">{ICON.users}</span>2 adults</div>
                <div className="bkdi"><span className="bkdk">{ICON.plane}</span>Amsterdam (Schiphol)</div>
                <div className="bkdi"><span className="bkdk">{ICON.board}</span>{hotel?.board || 'All inclusive'}</div>
                <div className="bkdi"><span className="bkdk">{ICON.moon}</span>{nights} nights</div>
              </div>
              <div className="bkcw">
                <button className="bkc" onClick={goCheckout}>Book Now {ICON.arrow}</button>
                <div className="bkc-note">{ICON.check} Free cancellation · {ICON.check} Instant confirmation</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="mbar">
        <div className="mbi">
          <div className="mbp"><small>{liveTotal != null ? 'live total' : 'per person from'}</small>{ccy}{liveTotal != null ? liveTotal.toLocaleString('en-GB') : ppPrice}</div>
          <button className="mbc" onClick={goCheckout}>{liveTotal != null ? 'Book now' : 'Check price'} →</button>
        </div>
      </div>

      {/* Photo lightbox */}
      {lightbox !== null && (
        <div className="lb-overlay" onClick={closeLightbox}>
          <div className="lb-counter">{lightbox + 1} / {images.length}</div>
          <button className="lb-close" onClick={closeLightbox} aria-label="Close">
            <S size={22} sw={2.2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
          </button>
          <button className="lb-nav lb-prev" onClick={prevImg} aria-label="Previous">
            <S size={26} sw={2.2}><path d="M15 18l-6-6 6-6" /></S>
          </button>
          <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
            <img className="lb-img" key={lightbox} src={images[lightbox]} alt={`${hotelName} photo ${lightbox + 1}`} />
          </div>
          <button className="lb-nav lb-next" onClick={nextImg} aria-label="Next">
            <S size={26} sw={2.2}><path d="M9 18l6-6-6-6" /></S>
          </button>
          <div className="lb-thumbs" onClick={(e) => e.stopPropagation()}>
            {images.map((src, i) => (
              <button key={i} className={`lb-thumb${i === lightbox ? ' active' : ''}`} onClick={() => setLightbox(i)}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Flight modal */}
      <div className={`modal-overlay${modalOpen ? ' show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Choose your flights</div>
            <div className="modal-sort">Sort: <select><option>Price</option><option>Duration</option><option>Departure</option></select></div>
            <button className="modal-close" onClick={() => setModalOpen(false)}>
              <S sw={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-sidebar">
              {SIDEBAR_FILTERS.map((g) => (
                <div className="modal-filter-group" key={g.title}>
                  <div className="modal-filter-title">{g.title}</div>
                  {g.opts.map((o) => {
                    const key = `${g.title}-${o}`;
                    return (
                      <div key={o} className={`modal-filter-opt${sidebarChecked[key] ? ' checked' : ''}`} onClick={() => toggleSidebar(key)}>
                        <div className="modal-filter-cb">{sidebarChecked[key] && <S size={11} sw={3}><path d="M20 6L9 17l-5-5" /></S>}</div>{o}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="modal-flights">
              {MODAL_FLIGHTS.map((f, i) => (
                <FlightCard key={i} f={f} selected={modalFlight === i} onSelect={() => setModalFlight(i)} />
              ))}
            </div>
          </div>
          <div className="modal-save-bar">
            <button className="modal-save-btn" onClick={() => setModalOpen(false)}>Save {ICON.arrow}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
