import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import './Confirmation.css';

/* ── tiny SVG helper (same pattern as Checkout) ── */
const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);

const ICON = {
  check:  <S sw={2.5}><path d="M20 6L9 17l-5-5" /></S>,
  arrow:  <S sw={2.5}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></S>,
  copy:   <S><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></S>,
  mail:   <S><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></S>,
  pin:    <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></S>,
  cal:    <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  moon:   <S><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></S>,
  users:  <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></S>,
  user:   <S><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></S>,
  plane:  <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></S>,
  bed:    <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  board:  <S><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></S>,
  card:   <S><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></S>,
  download: <S><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></S>,
  calPlus: <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" /></S>,
  phone:  <S><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></S>,
  passport: <S><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17h8" /></S>,
  briefcase: <S><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></S>,
  sun:    <S><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></S>,
  doc:    <S><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></S>,
  laptop: <S><rect x="3" y="4" width="18" height="12" rx="2" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
// mirrors the admin traveller rules: <2 INF, <12 CHD, else ADT
const ageType = (dob) => {
  const b = new Date(dob); const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a < 2 ? { code: 'INF', label: 'Infant' } : a < 12 ? { code: 'CHD', label: 'Child' } : { code: 'ADT', label: 'Adult' };
};

/* deterministic faux-QR from the booking reference (decorative only) */
const seedFrom = (str) => {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};
function FauxQR({ value }) {
  const cells = useMemo(() => {
    const rnd = seedFrom(value || 'SSK');
    const n = 21, out = [];
    const inFinder = (x, y) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!inFinder(x, y) && rnd() > 0.52) out.push([x, y]);
    }
    return out;
  }, [value]);
  const F = ({ x, y }) => (
    <g>
      <rect x={x} y={y} width="7" height="7" fill="currentColor" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="currentColor" />
    </g>
  );
  return (
    <svg className="ckc-qr" viewBox="0 0 21 21" shapeRendering="crispEdges" aria-hidden="true">
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />)}
      <F x={0} y={0} /><F x={14} y={0} /><F x={0} y={14} />
    </svg>
  );
}

/* eased count-up for the paid amount */
function useCountUp(target, dur = 1100, delay = 600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now() + delay;
    const tick = (t) => {
      if (t < t0) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, delay]);
  return v;
}

export default function Confirmation({
  booking, bookingRef, travellers, customerType, priv, pro,
  insurance, insAmount, holderIsLead, holder,
  payMethod, card, idealBank, pricing, ccy,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);

  const money = (n) => `${ccy}${Math.round(n).toLocaleString('en-US')}`;
  const animPaid = useCountUp(pricing.total);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, []);

  /* scroll-reveal for the lower sections */
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.ckc-reveal:not(.vis)') || [];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const lead = travellers[0] || {};
  const destination = (booking.loc || '').split(',')[1]?.trim() || (booking.loc || '').split(',')[0]?.trim() || 'the sun';
  const customerEmail = customerType === 'private' ? priv.email : pro.primaryContactEmail;
  const paidOn = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const payLabel = payMethod === 'card'
    ? `${(detectBrandName(card.number) || 'Card')} •••• ${card.number.replace(/\D/g, '').slice(-4) || '••••'}`
    : payMethod === 'ideal' ? `iDEAL — ${idealBank || 'your bank'}`
    : payMethod === 'bancontact' ? 'Bancontact' : 'PayPal';

  /* days until departure — defensive parse of the display date */
  const daysToGo = useMemo(() => {
    const raw = booking.flight?.outDate || '';
    const d = new Date(raw.replace(/^[A-Za-z]+\s/, '').replace('.', ''));
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.ceil((d - new Date()) / 86400000);
    return diff > 0 ? diff : null;
  }, [booking]);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(bookingRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast(`Your reference: ${bookingRef}`, 'info');
    }
  };

  /* build a hotel-voucher payload from this booking and open the printable voucher */
  const openVoucher = () => {
    const stripDay = (s) => (s || '').replace(/^[A-Za-z]+\s/, '').replace('.', '');
    const adt = travellers.filter((t) => !t.dateOfBirth || ageType(t.dateOfBirth).code === 'ADT').length;
    const chd = travellers.length - adt;
    navigate('/voucher', {
      state: {
        voucher: {
          reference: bookingRef,
          supplierRef: '77-4446011',
          bookingDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
          status: 'Confirmed',
          hotel: { name: booking.hotelName, stars: Math.min(booking.stars, 5), location: booking.loc },
          checkIn: { date: stripDay(booking.flight?.outDate) || booking.dateLabel, time: '14:00' },
          checkOut: { date: stripDay(booking.flight?.retDate) || '', time: '12:00' },
          nights: booking.nights, roomCount: 1, guests: travellers.length,
          board: booking.meal || booking.board,
          travelers: travellers.map((t, i) => ({
            n: i + 1,
            title: t.title || (t.gender === 'FEMALE' ? 'Mrs' : 'Mr'),
            type: t.dateOfBirth ? ageType(t.dateOfBirth).code : 'ADT',
            gender: t.gender ? t.gender.charAt(0) + t.gender.slice(1).toLowerCase() : '—',
            name: `${t.firstName} ${t.lastName}`,
            dob: fmtDate(t.dateOfBirth),
          })),
          rooms: [{
            label: 'ROOM 1', type: booking.room,
            occupancy: `${adt} ${adt === 1 ? 'Adult' : 'Adults'}${chd > 0 ? ` + ${chd} ${chd === 1 ? 'Child' : 'Children'}` : ''}`,
            board: booking.meal || booking.board, status: 'Confirmed',
            confirmation: `R${String(Math.abs(bookingRef.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 7919)).padStart(9, '0').slice(0, 9)}`,
            assigned: travellers.map((t) => `${t.firstName} ${t.lastName}`),
          }],
          contact: {
            address: [booking.loc],
            telephone: '+90 216 510 04 04', fax: '+90 216 510 04 08',
            email: 'reservations@hotel.com', website: 'www.hotel.com',
          },
          stay: { checkInTime: '14:00', checkOutTime: '12:00', earlyCheckIn: 'Subject to availability', lateCheckOut: 'Subject to availability' },
          important: [
            'Deposit on arrival.',
            'Please note: if cancelled, modified or in case of no-show, the hotel price of the reservation will be charged.',
          ],
          remarks: [],
          emergency: { phone: '+32 2 808 60 68', email: 'support@sunskytravel.com', website: 'www.sunskytravel.com' },
          generated: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} CET`,
        },
      },
    });
  };

  const TIMELINE = [
    { icon: ICON.mail, title: 'Confirmation email', sub: 'Arriving in your inbox right now' },
    { icon: ICON.doc, title: 'Travel documents', sub: '7 days before departure' },
    { icon: ICON.laptop, title: 'Online check-in', sub: 'Opens 48h before your flight' },
    { icon: ICON.sun, title: 'Enjoy your holiday!', sub: `${destination} awaits you` },
  ];

  return (
    <div className="ckc" ref={rootRef}>
      {/* ═══ CELEBRATION HERO ═══ */}
      <header className="ckc-hero">
        <div className="ckc-hero-bg">
          <span className="ckc-glow g1" /><span className="ckc-glow g2" /><span className="ckc-gridbg" />
        </div>
        <div className="ckc-confetti" aria-hidden="true">
          {Array.from({ length: 26 }).map((_, i) => <i key={i} />)}
        </div>
        <div className="ckc-hero-inner">
          <div className="ckc-check-wrap">
            <span className="ckc-ring r1" /><span className="ckc-ring r2" /><span className="ckc-ring r3" />
            <svg className="ckc-check" viewBox="0 0 96 96">
              <circle className="ckc-check-bg" cx="48" cy="48" r="44" />
              <circle className="ckc-check-circ" cx="48" cy="48" r="44" />
              <path className="ckc-check-tick" d="M30 50l13 13 24-27" />
            </svg>
          </div>
          <h1 className="ckc-title hd">Booking confirmed!</h1>
          <p className="ckc-sub">
            Pack your bags{lead.firstName ? `, ${lead.firstName}` : ''} — <b>{destination}</b> is calling
            {daysToGo ? <> in only <b>{daysToGo} days</b></> : ''}! ☀️
          </p>
          <div className="ckc-ref-row">
            <button className={`ckc-ref${copied ? ' copied' : ''}`} onClick={copyRef} title="Copy booking reference">
              <span className="ckc-ref-label">Booking reference</span>
              <span className="ckc-ref-val hd">{bookingRef}</span>
              <span className="ckc-ref-copy">{copied ? <>{ICON.check} Copied!</> : <>{ICON.copy} Copy</>}</span>
            </button>
          </div>
          <div className="ckc-mail-note">{ICON.mail} Confirmation sent to <b>{customerEmail || 'your email address'}</b></div>
        </div>
      </header>

      <div className="ckc-main">
        {/* ═══ BOARDING-PASS TICKET ═══ */}
        <div className="ckc-ticket">
          <div className="ckc-ticket-main">
            <div className="ckc-ticket-img">
              <img src={booking.img} alt={booking.hotelName} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div className="ckc-ticket-imgov" />
              <div className="ckc-ticket-imgtxt">
                <span className="ckc-ticket-stars">{'★'.repeat(Math.min(booking.stars, 5))}</span>
                <span className="ckc-ticket-name hd">{booking.hotelName}</span>
                <span className="ckc-ticket-loc">{ICON.pin} {booking.loc}</span>
              </div>
              <span className="ckc-paid-badge">{ICON.check} Paid</span>
            </div>
            <div className="ckc-ticket-body">
              <div className="ckc-ticket-chips">
                <span className="ckc-chip">{ICON.cal} {booking.dateLabel}</span>
                <span className="ckc-chip">{ICON.moon} {booking.nights} nights</span>
                <span className="ckc-chip">{ICON.users} {pricing.pax} {pricing.pax === 1 ? 'traveller' : 'travellers'}</span>
                <span className="ckc-chip">{ICON.board} {booking.board}</span>
              </div>
              {booking.flight && (
                <div className="ckc-ticket-flights">
                  <div className="ckc-leg">
                    <span className="ckc-leg-dir">OUT</span>
                    <div className="ckc-leg-route">
                      <b>{booking.flight.outDep}</b><span className="ckc-leg-line"><i className="ckc-leg-plane">{ICON.plane}</i></span><b>{booking.flight.outArr}</b>
                    </div>
                    <span className="ckc-leg-meta">{booking.flight.outFrom} → {booking.flight.outTo} · {booking.flight.outAirline} · {booking.flight.outDate}</span>
                  </div>
                  <div className="ckc-leg">
                    <span className="ckc-leg-dir ret">RET</span>
                    <div className="ckc-leg-route">
                      <b>{booking.flight.retDep}</b><span className="ckc-leg-line"><i className="ckc-leg-plane ret">{ICON.plane}</i></span><b>{booking.flight.retArr}</b>
                    </div>
                    <span className="ckc-leg-meta">{booking.flight.retFrom} → {booking.flight.retTo} · {booking.flight.retAirline} · {booking.flight.retDate}</span>
                  </div>
                </div>
              )}
              <div className="ckc-ticket-room">
                {ICON.bed}
                <div><b>{booking.room}</b><span>{booking.meal} · included in price</span></div>
              </div>
            </div>
          </div>

          <div className="ckc-ticket-stub">
            <div className="ckc-stub-paid">
              <span className="ckc-stub-label">Total paid</span>
              <span className="ckc-stub-amount hd">{ccy}{animPaid.toLocaleString('en-US')}</span>
              <span className="ckc-stub-method">{ICON.card} {payLabel}</span>
              <span className="ckc-stub-date">{paidOn}</span>
            </div>
            <FauxQR value={bookingRef} />
            <span className="ckc-stub-ref hd">{bookingRef}</span>
            <span className="ckc-stub-hint">Show this at check-in</span>
          </div>
        </div>

        {/* ═══ ACTIONS ═══ */}
        <div className="ckc-actions ckc-reveal">
          <button className="ckc-act primary" onClick={() => navigate('/account/bookings')}>{ICON.arrow} View my bookings</button>
          <button className="ckc-act" onClick={openVoucher}>{ICON.download} Download voucher</button>
          <button className="ckc-act" onClick={() => showToast('Holiday added to your calendar!', 'success')}>{ICON.calPlus} Add to calendar</button>
          <button className="ckc-act ghost" onClick={() => navigate('/')}>Back to home</button>
        </div>

        {/* ═══ DETAIL CARDS ═══ */}
        <div className="ckc-grid">
          {/* travellers */}
          <section className="ckc-card ckc-reveal">
            <div className="ckc-card-head"><span className="ckc-card-ico">{ICON.users}</span><h3 className="hd">Travellers</h3><span className="ckc-card-n">{travellers.length}</span></div>
            {travellers.map((t, i) => {
              const at = t.dateOfBirth ? ageType(t.dateOfBirth) : null;
              return (
                <div className="ckc-trav" key={i}>
                  <span className="ckc-trav-av">{(t.firstName || 'T').slice(0, 1)}{(t.lastName || String(i + 1)).slice(0, 1)}</span>
                  <div className="ckc-trav-info">
                    <div className="ckc-trav-name">
                      {t.title ? `${t.title} ` : ''}{t.firstName} {t.lastName}
                      {i === 0 && <span className="ckc-mini-badge lead">Lead</span>}
                      {at && <span className={`ckc-mini-badge ${at.code.toLowerCase()}`}>{at.code}</span>}
                    </div>
                    <div className="ckc-trav-meta">
                      {t.nationality}{t.dateOfBirth ? ` · born ${fmtDate(t.dateOfBirth)}` : ''}
                      {t.passportNumber ? <span className="ckc-pass-chip">{ICON.passport} {t.passportNumber}</span> : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* customer */}
          <section className="ckc-card ckc-reveal">
            <div className="ckc-card-head">
              <span className="ckc-card-ico">{customerType === 'private' ? ICON.user : ICON.briefcase}</span>
              <h3 className="hd">{customerType === 'private' ? 'Booked by' : 'Company details'}</h3>
            </div>
            {customerType === 'private' ? (
              <div className="ckc-kv">
                <div className="ckc-kv-row"><span>Name</span><b>{priv.firstName} {priv.lastName}</b></div>
                {priv.hasEmail && priv.email && <div className="ckc-kv-row"><span>Email</span><b>{priv.email}</b></div>}
                <div className="ckc-kv-row"><span>Phone</span><b>{priv.phone}</b></div>
                <div className="ckc-kv-row"><span>Nationality</span><b>{priv.nationality}</b></div>
                {(priv.street || priv.city) && (
                  <div className="ckc-kv-row"><span>Address</span><b>{[`${priv.street} ${priv.houseNumber}`.trim(), priv.postalCode && `${priv.postalCode} ${priv.city}`.trim(), priv.country].filter(Boolean).join(', ')}</b></div>
                )}
              </div>
            ) : (
              <div className="ckc-kv">
                <div className="ckc-kv-row"><span>Company</span><b>{pro.tradingName}</b></div>
                <div className="ckc-kv-row"><span>VAT</span><b>{pro.vatNumber}</b></div>
                <div className="ckc-kv-row"><span>Contact</span><b>{pro.primaryContactFirstName} {pro.primaryContactLastName}{pro.primaryContactRole ? ` · ${pro.primaryContactRole}` : ''}</b></div>
                {pro.hasContactEmail && pro.primaryContactEmail && <div className="ckc-kv-row"><span>Email</span><b>{pro.primaryContactEmail}</b></div>}
                <div className="ckc-kv-row"><span>Phone</span><b>{pro.primaryContactPhone}</b></div>
                {pro.hasInvoiceEmail && pro.invoiceEmail && <div className="ckc-kv-row"><span>Invoices</span><b>{pro.invoiceEmail}</b></div>}
              </div>
            )}
          </section>

          {/* insurance */}
          {insurance && insurance.id !== 'none' && (
            <section className="ckc-card ckc-reveal">
              <div className="ckc-card-head"><span className="ckc-card-ico green">{ICON.shield}</span><h3 className="hd">{insurance.name}</h3><span className="ckc-card-amt">{money(insAmount)}</span></div>
              <div className="ckc-covers">
                {insurance.covers.map((c) => <span key={c} className="ckc-cover">{ICON.check} {c}</span>)}
              </div>
              <div className="ckc-card-foot">
                Policy holder: <b>{holderIsLead ? `${lead.firstName} ${lead.lastName}` : `${holder.firstName} ${holder.lastName}`}</b> · documents sent by email
              </div>
            </section>
          )}

          {/* payment breakdown */}
          <section className="ckc-card ckc-reveal">
            <div className="ckc-card-head"><span className="ckc-card-ico">{ICON.card}</span><h3 className="hd">Payment summary</h3></div>
            <div className="ckc-kv">
              <div className="ckc-kv-row"><span>{pricing.pax} × {money(booking.ppPrice)} p.p.</span><b>{money(pricing.base)}</b></div>
              {pricing.roomExtraTotal > 0 && <div className="ckc-kv-row"><span>Room upgrade</span><b>{money(pricing.roomExtraTotal)}</b></div>}
              <div className="ckc-kv-row"><span>SGR Guarantee Fund</span><b>{money(pricing.sgr)}</b></div>
              {insAmount > 0 && <div className="ckc-kv-row"><span>{insurance?.name}</span><b>{money(insAmount)}</b></div>}
              <div className="ckc-kv-row total"><span>Paid with {payLabel}</span><b>{money(pricing.total)}</b></div>
            </div>
          </section>
        </div>

        {/* ═══ WHAT HAPPENS NEXT ═══ */}
        <section className="ckc-next ckc-reveal">
          <h3 className="ckc-next-title hd">{ICON.sun} What happens next?</h3>
          <div className="ckc-timeline">
            {TIMELINE.map((t, i) => (
              <div className="ckc-tl-step" key={t.title} style={{ '--d': `${0.15 + i * 0.18}s` }}>
                <span className="ckc-tl-dot">{t.icon}</span>
                <span className="ckc-tl-name hd">{t.title}</span>
                <span className="ckc-tl-sub">{t.sub}</span>
                {i < TIMELINE.length - 1 && <span className="ckc-tl-line" />}
              </div>
            ))}
          </div>
        </section>

        {/* ═══ HELP STRIP ═══ */}
        <div className="ckc-help ckc-reveal">
          <div className="ckc-help-txt">
            <b>Questions about your booking?</b>
            <span>Our travel experts are here 7 days a week.</span>
          </div>
          <div className="ckc-help-links">
            <span className="ckc-help-item">{ICON.phone} +32 2 123 45 67</span>
            <span className="ckc-help-item">{ICON.mail} help@sunsky.travel</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function detectBrandName(num) {
  const n = (num || '').replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^6/.test(n)) return 'Discover';
  return '';
}
