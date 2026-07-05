import { useLocation, useNavigate } from 'react-router-dom';
import mainLogo from '../../assets/main-logo.png';
import './HotelVoucher.css';

/* ── tiny SVG helper ── */
const S = ({ children, size = 18, sw = 1.8, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);

const ICON = {
  doc:    <S><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></S>,
  tag:    <S><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></S>,
  cal:    <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  checkO: <S><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></S>,
  moon:   <S><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></S>,
  bed:    <S><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" /><path d="M4 10V6a2 2 0 012-2h12a2 2 0 012 2v4" /><line x1="2" y1="20" x2="22" y2="20" /></S>,
  user:   <S><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></S>,
  users:  <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></S>,
  meal:   <S><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" /></S>,
  shieldCheck: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></S>,
  building: <S><path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18" /><path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2" /><path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></S>,
  pin:    <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></S>,
  phone:  <S><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></S>,
  fax:    <S><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></S>,
  mail:   <S><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></S>,
  globe:  <S><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></S>,
  clock:  <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  alert:  <S fill="currentColor" sw={0}><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v7h-2V7zm0 9h2v2h-2v-2z" /></S>,
  chat:   <S><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></S>,
  info:   <S><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  print:  <S><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></S>,
  back:   <S sw={2.2}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></S>,
};

/* ════ demo voucher — exact data from the approved design ════ */
const DEMO = {
  reference: 'SUN-258741',
  supplierRef: '77-4446011',
  bookingDate: '02 June 2026',
  status: 'Confirmed',
  hotel: {
    name: 'Miracle İstanbul Asia Airport Hotel & Spa',
    stars: 5,
    location: 'Pendik, Istanbul, Türkiye',
  },
  checkIn: { date: '06 Apr 2026', time: '14:00' },
  checkOut: { date: '07 Apr 2026', time: '12:00' },
  nights: 1, roomCount: 1, guests: 2,
  board: 'Room Only',
  travelers: [
    { n: 1, title: 'Mr', type: 'ADT', gender: 'Male', name: 'Levent Yardimci', dob: '12 Apr 1985' },
  ],
  rooms: [
    {
      label: 'ROOM 1', type: 'Double Superior Room', occupancy: '1 Adult',
      board: 'Room Only', status: 'Confirmed',
      confirmation: 'R305760544', assigned: ['Levent Yardimci'],
    },
  ],
  contact: {
    address: ['Harmandere Mah. Dedepasa Cad.', 'Site Sok 8 - Pendik', 'Istanbul, Türkiye'],
    telephone: '+90 216 510 04 04',
    fax: '+90 216 510 04 08',
    email: 'sales@miracleistanbulasia.com',
    website: 'www.miracleistanbulasia.com',
  },
  stay: {
    checkInTime: '14:00', checkOutTime: '12:00',
    earlyCheckIn: 'Subject to availability', lateCheckOut: 'Subject to availability',
  },
  important: [
    'Car park: Yes (without additional debit notes).',
    'Check-in hour: 14:00 - 00:00.',
    'Check-out hour: 11:30 - 12:00.',
    'Deposit on arrival.',
    'Please note: if cancelled, modified or in case of no-show, the hotel price of the reservation will be charged.',
  ],
  remarks: [
    { t: 'Luxury Collection – Exclusive privileges: 24/7 concierge service to support travel advisors and enhance their clients’ stays.' },
    { t: 'A gourmet welcome amenity arranged on demand, and complimentary early check-in (from 12 PM) and late check-out (until 2 PM) – subject to availability, peak-period restrictions, and at least 48 hours’ notice. To unlock these privileges and benefit from our dedicated concierge service, please email ', link: 'luxury@hbxgroup.com', href: 'mailto:luxury@hbxgroup.com', t2: ' with your booking number. Perks are eligible on a minimum of two-night stay and are subject to availability. Terms & Conditions: ', link2: 'https://www.privilege-terms.com/', href2: 'https://www.privilege-terms.com/' },
  ],
  emergency: { phone: '+32 2 808 60 68', email: 'support@sunskytravel.com', website: 'www.sunskytravel.com' },
  generated: '02 Jun 2026 14:35 CET',
};

const Cell = ({ icon, label, children }) => (
  <div className="hv-cell">
    <span className="hv-cell-ico">{icon}</span>
    <span className="hv-cell-meta">
      <span className="hv-cell-label">{label}</span>
      <span className="hv-cell-val">{children}</span>
    </span>
  </div>
);

export default function HotelVoucher() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const v = state?.voucher || DEMO;
  const statusClass = (v.status || '').toLowerCase();

  return (
    <div className="hv">
      {/* toolbar — never printed */}
      <div className="hv-toolbar">
        <button className="hv-tb-back" onClick={() => navigate(-1)}>{ICON.back} Back</button>
        <div className="hv-tb-right">
          <button className="hv-tb-print" onClick={() => window.print()}>{ICON.print} Print / Save PDF</button>
        </div>
      </div>

      <div className="hv-sheet">
        {/* ═══ HEADER ═══ */}
        <header className="hv-head">
          <div className="hv-logo">
            <img src={mainLogo} alt="Sunsky" />
            <span className="hv-logo-text">Sunsky</span>
          </div>
          <h1 className="hv-title hd">HOTEL VOUCHER</h1>
        </header>

        {/* ═══ REFERENCE STRIP ═══ */}
        <div className="hv-refs">
          <div className="hv-ref">
            <span className="hv-ref-ico">{ICON.doc}</span>
            <span className="hv-ref-meta">
              <span className="hv-ref-label">Booking Reference</span>
              <span className="hv-ref-val">{v.reference}</span>
            </span>
          </div>
          <div className="hv-ref">
            <span className="hv-ref-ico">{ICON.tag}</span>
            <span className="hv-ref-meta">
              <span className="hv-ref-label">Supplier Reference</span>
              <span className="hv-ref-val">{v.supplierRef}</span>
            </span>
          </div>
          <div className="hv-ref">
            <span className="hv-ref-ico">{ICON.cal}</span>
            <span className="hv-ref-meta">
              <span className="hv-ref-label">Booking Date</span>
              <span className="hv-ref-val">{v.bookingDate}</span>
            </span>
          </div>
          <div className="hv-ref">
            <span className="hv-ref-ico">{ICON.checkO}</span>
            <span className="hv-ref-meta">
              <span className="hv-ref-label">Status</span>
              <span className={`hv-status ${statusClass}`}>{v.status.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* ═══ TRAVEL SUMMARY ═══ */}
        <section className="hv-summary">
          <span className="hv-summary-tag">TRAVEL SUMMARY</span>
          <h2 className="hv-hotel-name hd">{v.hotel.name}</h2>
          <div className="hv-stars">{Array.from({ length: Math.min(v.hotel.stars, 5) }).map((_, i) => <span key={i}>★</span>)}</div>
          <div className="hv-hotel-loc">{ICON.pin} {v.hotel.location}</div>

          <div className="hv-stay-grid">
            <div className="hv-stat">
              <span className="hv-stat-label">{ICON.cal} Check-In</span>
              <span className="hv-stat-val">{v.checkIn.date}</span>
              <span className="hv-stat-sub">{v.checkIn.time}</span>
            </div>
            <div className="hv-stat">
              <span className="hv-stat-label">{ICON.cal} Check-Out</span>
              <span className="hv-stat-val">{v.checkOut.date}</span>
              <span className="hv-stat-sub">{v.checkOut.time}</span>
            </div>
            <div className="hv-stat">
              <span className="hv-stat-label">{ICON.moon} Nights</span>
              <span className="hv-stat-val">{v.nights}</span>
              <span className="hv-stat-sub">{v.nights === 1 ? 'Night' : 'Nights'}</span>
            </div>
            <div className="hv-stat">
              <span className="hv-stat-label">{ICON.bed} Rooms</span>
              <span className="hv-stat-val">{v.roomCount}</span>
              <span className="hv-stat-sub">{v.roomCount === 1 ? 'Room' : 'Rooms'}</span>
            </div>
            <div className="hv-stat">
              <span className="hv-stat-label">{ICON.user} Guests</span>
              <span className="hv-stat-val">{v.guests}</span>
              <span className="hv-stat-sub">{v.guests === 1 ? 'Guest' : 'Guests'}</span>
            </div>
            <div className="hv-board">
              <span className="hv-board-ico">{ICON.meal}</span>
              <span className="hv-board-label">Board Basis</span>
              <span className="hv-board-val">{v.board}</span>
            </div>
          </div>
        </section>

        {/* ═══ TRAVELERS ═══ */}
        <section className="hv-sec">
          <div className="hv-sec-head">
            <span className="hv-sec-ico">{ICON.user}</span>
            <h3 className="hv-sec-title hd">Travelers</h3>
            <span className="hv-sec-note">Per room / per voucher</span>
          </div>
          <table className="hv-table">
            <thead>
              <tr><th>#</th><th>Title</th><th>Type</th><th>Gender</th><th>Full Name</th><th>Date of Birth</th></tr>
            </thead>
            <tbody>
              {v.travelers.map((t) => (
                <tr key={t.n}>
                  <td>{t.n}</td><td>{t.title}</td><td>{t.type}</td><td>{t.gender}</td>
                  <td className="hv-td-name">{t.name}</td><td>{t.dob}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ═══ ROOM INFORMATION ═══ */}
        <section className="hv-sec">
          <div className="hv-sec-head">
            <span className="hv-sec-ico">{ICON.bed}</span>
            <h3 className="hv-sec-title hd">Room Information</h3>
            <span className="hv-sec-note">Per room</span>
          </div>
          {v.rooms.map((r) => (
            <div className="hv-room" key={r.label}>
              <div className="hv-room-head">
                <span className="hv-room-chip">{r.label}</span>
                {r.confirmation && (
                  <span className="hv-room-conf">Hotel Confirmation: <b>{r.confirmation}</b></span>
                )}
              </div>
              <div className="hv-room-grid">
                <Cell icon={ICON.bed} label="Room Type">{r.type}</Cell>
                <Cell icon={ICON.users} label="Occupancy">{r.occupancy}</Cell>
                <Cell icon={ICON.meal} label="Board Basis">{r.board}</Cell>
                <Cell icon={ICON.shieldCheck} label="Room Status">{r.status}</Cell>
              </div>
              {r.assigned?.length > 0 && (
                <div className="hv-room-assigned">
                  <span className="hv-ra-label">Assigned travelers</span>
                  {r.assigned.map((n) => <span className="hv-ra-chip" key={n}>{ICON.user} {n}</span>)}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* ═══ HOTEL INFORMATION ═══ */}
        <section className="hv-sec">
          <div className="hv-sec-head">
            <span className="hv-sec-ico">{ICON.building}</span>
            <h3 className="hv-sec-title hd">Hotel Information</h3>
          </div>
          <div className="hv-info-grid">
            <div className="hv-info-col">
              <div className="hv-info-sub">Contact Details</div>
              <div className="hv-irow">
                <span className="hv-irow-ico">{ICON.pin}</span>
                <span className="hv-irow-label">Address</span>
                <span className="hv-irow-val">{v.contact.address.map((l) => <span key={l} className="hv-addr-line">{l}</span>)}</span>
              </div>
              {/* contact rows render only when the data really exists — live
                  bookings don't yet carry the hotel's phone/fax/email */}
              {v.contact.telephone && (
                <div className="hv-irow">
                  <span className="hv-irow-ico">{ICON.phone}</span>
                  <span className="hv-irow-label">Telephone</span>
                  <span className="hv-irow-val">{v.contact.telephone}</span>
                </div>
              )}
              {v.contact.fax && (
                <div className="hv-irow">
                  <span className="hv-irow-ico">{ICON.fax}</span>
                  <span className="hv-irow-label">Fax</span>
                  <span className="hv-irow-val">{v.contact.fax}</span>
                </div>
              )}
              {v.contact.email && (
                <div className="hv-irow">
                  <span className="hv-irow-ico">{ICON.mail}</span>
                  <span className="hv-irow-label">Email</span>
                  <a className="hv-irow-val hv-link" href={`mailto:${v.contact.email}`}>{v.contact.email}</a>
                </div>
              )}
              {v.contact.website && (
                <div className="hv-irow">
                  <span className="hv-irow-ico">{ICON.globe}</span>
                  <span className="hv-irow-label">Website</span>
                  <a className="hv-irow-val hv-link" href={`https://${v.contact.website}`} target="_blank" rel="noreferrer">{v.contact.website}</a>
                </div>
              )}
            </div>
            <div className="hv-info-col">
              <div className="hv-info-sub">Stay Information</div>
              <div className="hv-srow">
                <span className="hv-srow-ico">{ICON.clock}</span>
                <span className="hv-srow-meta"><span className="hv-srow-label">Check-In Time</span><span className="hv-srow-val">{v.stay.checkInTime}</span></span>
              </div>
              <div className="hv-srow">
                <span className="hv-srow-ico">{ICON.clock}</span>
                <span className="hv-srow-meta"><span className="hv-srow-label">Check-Out Time</span><span className="hv-srow-val">{v.stay.checkOutTime}</span></span>
              </div>
              <div className="hv-srow">
                <span className="hv-srow-ico">{ICON.clock}</span>
                <span className="hv-srow-meta"><span className="hv-srow-label">Early Check-In</span><span className="hv-srow-val">{v.stay.earlyCheckIn}</span></span>
              </div>
              <div className="hv-srow">
                <span className="hv-srow-ico">{ICON.clock}</span>
                <span className="hv-srow-meta"><span className="hv-srow-label">Late Check-Out</span><span className="hv-srow-val">{v.stay.lateCheckOut}</span></span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ IMPORTANT HOTEL INFORMATION ═══ */}
        <section className="hv-important">
          <div className="hv-imp-head">
            <span className="hv-imp-ico">{ICON.alert}</span>
            <h3 className="hv-imp-title hd">Important Hotel Information</h3>
          </div>
          <ul className="hv-imp-list">
            {v.important.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>

        {/* ═══ HOTELIER REMARKS ═══ */}
        {v.remarks?.length > 0 && (
          <section className="hv-remarks">
            <div className="hv-sec-head" style={{ marginBottom: 8 }}>
              <span className="hv-sec-ico">{ICON.chat}</span>
              <h3 className="hv-sec-title hd">Hotelier Remarks</h3>
            </div>
            <div className="hv-remarks-body">
              {v.remarks.map((r, i) => (
                <p key={i}>
                  {r.t}
                  {r.link && <a className="hv-link" href={r.href}>{r.link}</a>}
                  {r.t2}
                  {r.link2 && <a className="hv-link" href={r.href2} target="_blank" rel="noreferrer">{r.link2}</a>}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* ═══ EMERGENCY ASSISTANCE ═══ */}
        <section className="hv-emergency">
          <div className="hv-em-head">
            <span className="hv-em-ico">{ICON.phone}</span>
            <div className="hv-em-titles">
              <h3 className="hv-em-title hd">Emergency Assistance</h3>
              <p className="hv-em-sub">If you need urgent assistance before or during your trip, please contact Sunsky 24/7.</p>
            </div>
          </div>
          <div className="hv-em-row">
            <span className="hv-em-item"><i className="hv-em-item-ico">{ICON.phone}</i><b>Phone</b>{v.emergency.phone}</span>
            <span className="hv-em-item"><i className="hv-em-item-ico">{ICON.mail}</i><b>Email</b>{v.emergency.email}</span>
            <span className="hv-em-item"><i className="hv-em-item-ico">{ICON.globe}</i><b>Website</b>{v.emergency.website}</span>
          </div>
        </section>

        {/* ═══ NOTE BAR + FOOTER ═══ */}
        <div className="hv-note">{ICON.info} Please have your booking reference and hotel confirmation number ready when contacting us.</div>
        <div className="hv-foot">
          Hotel Voucher&ensp;·&ensp;Booking Reference: {v.reference}&ensp;·&ensp;Generated: {v.generated}&ensp;·&ensp;Page 1 of 1
        </div>
      </div>
    </div>
  );
}
