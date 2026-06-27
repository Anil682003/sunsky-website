import { useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import './FlightDetail.css';
import { buildContext, generateFlights, fmtDate, fmtDateShort, fareBreakdown, paxLabel } from '../Flights/flightData';

const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);
const ICON = {
  plane: <S fill="currentColor" sw={0}><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></S>,
  clock: <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  cal: <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  user: <S><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></S>,
  bag: <S><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 7V5a4 4 0 00-8 0v2" /></S>,
  doc: <S><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></S>,
  layers: <S><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></S>,
  receipt: <S><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M8 7h8M8 11h8M8 15h5" /></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  shieldCheck: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></S>,
  check: <S sw={2.5}><path d="M20 6L9 17l-5-5" /></S>,
  arrow: <S sw={2.4}><path d="M5 12h14M12 5l7 7-7 7" /></S>,
  chev: <S sw={2.4}><path d="M6 9l6 6 6-6" /></S>,
  mail: <S><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></S>,
  lock: <S><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></S>,
  info: <S><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></S>,
  seat: <S><path d="M6 19v-7a6 6 0 0112 0v7" /><rect x="4" y="19" width="16" height="2" rx="1" /></S>,
  board: <S><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>,
};
const FLIGHT_IMG = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80';

const shiftDate = (iso, days) => {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
const dayDiff = (a, b) => {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  return Math.max(0, Math.round((d2 - d1) / 86400000));
};

/* one leg shown as a vertical timeline with airline strip + optional layover */
function LegBlock({ leg, dirLabel, dirClass }) {
  const depDate = fmtDate(leg.depDateISO);
  const arrDate = fmtDate(shiftDate(leg.depDateISO, leg.arrDay));
  return (
    <div className="fd-leg">
      <div className={`fd-leg-label ${dirClass}`}>{ICON.plane} {dirLabel} · {fmtDateShort(leg.depDateISO)}</div>
      <div className="fd-leg-visual">
        <div className="fd-leg-timeline">
          <span className="fd-dot" />
          <span className={`fd-vline${leg.layover ? ' stop' : ''}`} />
          <span className="fd-dot dest" />
        </div>
        <div className="fd-leg-info">
          <div className="fd-point">
            <div className="fd-point-time">{leg.depTime}</div>
            <div>
              <div className="fd-point-air">{leg.fromName} ({leg.fromCode})</div>
              <div className="fd-point-city">{leg.fromCity}</div>
              <div className="fd-point-date">{depDate} · {leg.fromTerminal}</div>
            </div>
          </div>

          <div className="fd-flight-strip">
            <span className="fd-airbadge"><span className="fd-airdot" style={{ background: leg.color }}>{leg.airlineCode}</span>{leg.airline}</span>
            <span className="fd-ftag">{ICON.doc} Flight <b>{leg.flightNo}</b></span>
            <span className="fd-ftag">{ICON.plane} <b>{leg.aircraft}</b></span>
            <span className="fd-dur-badge">{ICON.clock} {leg.durLabel} · {leg.stopsLabel}</span>
          </div>

          {leg.layover && (
            <div className="fd-layover">{ICON.clock} Layover · {leg.layover.durLabel} at {leg.layover.city} ({leg.layover.code})</div>
          )}

          <div className="fd-point">
            <div className="fd-point-time">{leg.arrTime}{leg.arrDay > 0 && <sup>+{leg.arrDay}</sup>}</div>
            <div>
              <div className="fd-point-air">{leg.toName} ({leg.toCode})</div>
              <div className="fd-point-city">{leg.toCity}</div>
              <div className="fd-point-date">{arrDate} · {leg.toTerminal}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FARE_RULES = [
  { id: 'cancel', icon: <S><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></S>, title: 'Cancellation', badge: 'Chargeable', tone: 'warn',
    rows: [['More than 72 hours', '€45 per person'], ['24–72 hours', '€70 per person'], ['Less than 24 hours', 'Non-refundable'], ['No-show', 'Non-refundable']] },
  { id: 'change', icon: <S><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>, title: 'Date change', badge: 'Chargeable', tone: 'warn',
    rows: [['More than 72 hours', '€35 + fare difference'], ['24–72 hours', '€50 + fare difference'], ['Less than 24 hours', 'Not permitted']] },
  { id: 'seat', icon: <S><path d="M6 19v-7a6 6 0 0112 0v7" /><rect x="4" y="19" width="16" height="2" rx="1" /></S>, title: 'Seat selection', badge: 'Chargeable', tone: 'warn',
    text: 'Standard seats from €5 per segment. Extra-legroom and preferred seats range €9–€22 depending on the route. Free seat assignment is given at check-in subject to availability.' },
  { id: 'meal', icon: <S><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>, title: 'Meals', badge: 'Not included', tone: 'no',
    text: 'Meals are not included in this fare. Pre-book online from €6 per segment, or purchase onboard subject to availability. Vegetarian and special meals can be pre-ordered up to 24h before departure.' },
];

export default function FlightDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  // resolve the flight — from router state, else regenerate deterministically by id
  const { flight, ctx } = useMemo(() => {
    if (state?.flight) return { flight: state.flight, ctx: state.ctx || buildContext(new URLSearchParams()) };
    const c = buildContext(new URLSearchParams());
    const list = generateFlights(c);
    return { flight: list.find((f) => f.id === id) || list[0], ctx: c };
  }, [state, id]);

  const [tab, setTab] = useState('details');
  const [openRule, setOpenRule] = useState('cancel');

  const fb = useMemo(() => fareBreakdown(flight), [flight]);
  const money = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
  const pax = flight.pax || 1;
  const isRound = !!flight.ret;
  const nights = isRound ? Math.max(1, dayDiff(flight.out.depDateISO, flight.ret.depDateISO)) : 0;
  const totalMin = flight.totalMin;
  const totalLabel = `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;

  const goCheckout = () => {
    const booking = {
      kind: 'flight',
      hotelName: `${flight.out.fromCity} → ${flight.out.toCity}`,
      loc: `${isRound ? 'Round trip' : 'One way'} · ${flight.cabin}`,
      img: FLIGHT_IMG,
      stars: 0,
      currency: '€',
      nights,
      adults: pax,
      ppPrice: flight.price,
      origPrice: flight.origPrice,
      dateLabel: isRound
        ? `${fmtDateShort(flight.out.depDateISO)} — ${fmtDateShort(flight.ret.depDateISO)}`
        : fmtDateShort(flight.out.depDateISO),
      cabin: flight.cabin,
      route: `${flight.out.fromCity} → ${flight.out.toCity}`,
      flight: {
        outDep: flight.out.depTime, outArr: flight.out.arrTime,
        outFrom: flight.out.fromCity, outTo: flight.out.toCity, outDur: flight.out.durLabel,
        outAirline: flight.out.airline, outDate: fmtDateShort(flight.out.depDateISO),
        ...(isRound ? {
          retDep: flight.ret.depTime, retArr: flight.ret.arrTime,
          retFrom: flight.ret.fromCity, retTo: flight.ret.toCity, retDur: flight.ret.durLabel,
          retAirline: flight.ret.airline, retDate: fmtDateShort(flight.ret.depDateISO),
        } : {}),
      },
      // ── payload for the backend Online-booking create call ──
      api: {
        flight: {
          from: flight.out.fromCode, to: flight.out.toCode,
          depdate: flight.out.depDateISO, retdate: isRound ? flight.ret.depDateISO : undefined,
          price: Math.round(fb.total), currency: 'EUR',
          tripType: isRound ? 'roundtrip' : 'oneway', supplier: 'Airtuerk',
          // Opaque Airtuerk bookable key(s) needed for live reservation (basket/create).
          // One-way → 1 key; round trip → 2 keys (outbound + return).
          flightKeys: Array.isArray(flight.flightKeys) && flight.flightKeys.length
            ? flight.flightKeys
            : [flight.flightKey].filter(Boolean),
          legs: [flight.out, isRound ? flight.ret : null].filter(Boolean).map((leg) => ({
            from: leg.fromCode, to: leg.toCode,
            departure: `${leg.depDateISO}T${(leg.depTime || '00:00')}:00`,
            arrival: `${shiftDate(leg.depDateISO, leg.arrDay || 0)}T${(leg.arrTime || '00:00')}:00`,
            airline: leg.airlineCode, flightNumber: (leg.flightNo || '').split(' ')[1] || '', duration: leg.durMin || 0,
          })),
        },
      },
    };
    navigate('/checkout', { state: { booking } });
  };

  const TABS = [
    { id: 'details', label: 'Flight Details', icon: ICON.layers },
    { id: 'rules', label: 'Fare Rules', icon: ICON.doc },
    { id: 'baggage', label: 'Baggage', icon: ICON.bag },
    { id: 'fare', label: 'Fare Summary', icon: ICON.receipt },
  ];

  const baggageFor = (leg, included) => (
    <>
      <div className="fd-bag-leglabel">{leg.dir === 'out' ? 'Outbound' : 'Return'}: {leg.fromCode} → {leg.toCode} ({leg.airline})</div>
      <div className="fd-bag-card">
        <div className="fd-bag-ic cabin">{ICON.bag}</div>
        <div className="fd-bag-info">
          <div className="fd-bag-title">Cabin baggage</div>
          <div className="fd-bag-desc">1 piece, max <b>7 kg</b> (55 × 40 × 23 cm), plus one small personal item that fits under the seat.</div>
          <span className="fd-bag-tag inc">Included</span>
        </div>
      </div>
      <div className="fd-bag-card">
        <div className={`fd-bag-ic ${included ? 'checkin' : 'extra'}`}>{ICON.bag}</div>
        <div className="fd-bag-info">
          <div className="fd-bag-title">Check-in baggage</div>
          {included
            ? <div className="fd-bag-desc">1 piece, max <b>23 kg</b> (158 cm total). Fragile or oversized items may incur handling fees.</div>
            : <div className="fd-bag-desc">Not in base fare. Add during booking: <b>15 kg</b> (€18), <b>23 kg</b> (€26), <b>30 kg</b> (€34).</div>}
          <span className={`fd-bag-tag ${included ? 'inc' : 'paid'}`}>{included ? 'Included' : 'Paid add-on'}</span>
        </div>
      </div>
    </>
  );

  return (
    <div className="fd">
      {/* hero — the transparent navbar blends into this */}
      <header className="fd-hero">
        <span className="fd-hero-glow" />
        <span className="fd-hero-glow2" />
        <span className="fd-hero-grid" />
        <div className="fd-hero-in">
          <div className="fd-bc">
            <Link to="/flights">Flights</Link><span className="fd-bc-sep">›</span>
            <a onClick={() => navigate(-1)}>{flight.out.fromCode} → {flight.out.toCode}</a><span className="fd-bc-sep">›</span>
            <span className="fd-bc-here">{flight.out.airline}{isRound && flight.ret.airline !== flight.out.airline ? ` + ${flight.ret.airline}` : ''}</span>
          </div>
          <div className="fd-hero-route">
            <div className="fd-hero-city">
              <div className="fd-hero-code">{flight.out.fromCode}</div>
              <div className="fd-hero-cname">{flight.out.fromCity}</div>
            </div>
            <div className="fd-hero-plane">{ICON.plane}<span className="fd-hero-trip">{isRound ? 'Round trip' : 'One way'}</span></div>
            <div className="fd-hero-city">
              <div className="fd-hero-code">{flight.out.toCode}</div>
              <div className="fd-hero-cname">{flight.out.toCity}</div>
            </div>
          </div>
          <div className="fd-hero-chips">
            <span className="fd-hchip">{ICON.cal} {fmtDate(flight.out.depDateISO)}</span>
            <span className="fd-hchip">{ICON.user} {paxLabel(ctx)}</span>
            <span className="fd-hchip">{ICON.board} {flight.cabin}</span>
            <span className="fd-hchip">{ICON.clock} {totalLabel} total</span>
            <span className="fd-hchip fd-hchip-price">from {money(flight.price)} pp</span>
          </div>
        </div>
      </header>

      <div className="fd-page">
        <div className="fd-main">
          {/* itinerary */}
          <div className="fd-itin">
            <LegBlock leg={flight.out} dirLabel="Outbound" dirClass="out" />
            {isRound && <LegBlock leg={flight.ret} dirLabel="Return" dirClass="ret" />}
          </div>

          {/* tabs */}
          <div className="fd-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`fd-tab${tab === t.id ? ' act' : ''}`} onClick={() => setTab(t.id)}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* details */}
          {tab === 'details' && (
            <div className="fd-panel">
              <div className="fd-panel-head">{ICON.layers}<h2>Flight details</h2></div>
              <div className="fd-panel-body">
                <div className="fd-stats">
                  <div className="fd-stat"><span className="fd-stat-k">Total travel time</span><span className="fd-stat-v">{totalLabel}</span></div>
                  <div className="fd-stat"><span className="fd-stat-k">{isRound ? 'Trip length' : 'Journey'}</span><span className="fd-stat-v">{isRound ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'One way'}</span></div>
                  <div className="fd-stat"><span className="fd-stat-k">Cabin class</span><span className="fd-stat-v">{flight.cabin}</span></div>
                </div>
                <div className="fd-detail-card out">
                  <div className="fd-detail-title">{ICON.plane} Outbound · {flight.out.fromCode} → {flight.out.toCode}</div>
                  <p><b>{flight.out.airline} · {flight.out.flightNo}</b><br />
                    Departs <b>{flight.out.depTime}</b> ({fmtDateShort(flight.out.depDateISO)}) · Arrives <b>{flight.out.arrTime}{flight.out.arrDay > 0 ? ` (+${flight.out.arrDay})` : ''}</b><br />
                    {flight.out.durLabel} · {flight.out.stopsLabel} · {flight.out.aircraft} · {flight.cabin}</p>
                </div>
                {isRound && (
                  <div className="fd-detail-card ret">
                    <div className="fd-detail-title">{ICON.plane} Return · {flight.ret.fromCode} → {flight.ret.toCode}</div>
                    <p><b>{flight.ret.airline} · {flight.ret.flightNo}</b><br />
                      Departs <b>{flight.ret.depTime}</b> ({fmtDateShort(flight.ret.depDateISO)}) · Arrives <b>{flight.ret.arrTime}{flight.ret.arrDay > 0 ? ` (+${flight.ret.arrDay})` : ''}</b><br />
                      {flight.ret.durLabel} · {flight.ret.stopsLabel} · {flight.ret.aircraft} · {flight.cabin}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* fare rules */}
          {tab === 'rules' && (
            <div className="fd-panel">
              <div className="fd-panel-head">{ICON.doc}<h2>Fare rules</h2></div>
              <div className="fd-panel-body fd-rules">
                {FARE_RULES.map((r) => (
                  <div className={`fd-rule${openRule === r.id ? ' open' : ''}`} key={r.id}>
                    <div className="fd-rule-head" onClick={() => setOpenRule(openRule === r.id ? '' : r.id)}>
                      <div className="fd-rule-left"><span className={`fd-rule-ic ${r.tone}`}>{r.icon}</span><span className="fd-rule-title">{r.title}</span></div>
                      <div className="fd-rule-right">
                        <span className={`fd-rule-badge ${r.tone}`}>{r.badge}</span>
                        <span className="fd-rule-arrow">{ICON.chev}</span>
                      </div>
                    </div>
                    <div className="fd-rule-body">
                      <div className="fd-rule-content">
                        {r.rows ? (
                          <table className="fd-rule-table">
                            <thead><tr><th>Time before departure</th><th>Fee</th></tr></thead>
                            <tbody>{r.rows.map((row) => <tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td></tr>)}</tbody>
                          </table>
                        ) : <p>{r.text}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* baggage */}
          {tab === 'baggage' && (
            <div className="fd-panel">
              <div className="fd-panel-head">{ICON.bag}<h2>Baggage allowance</h2></div>
              <div className="fd-panel-body fd-bags">
                {baggageFor(flight.out, true)}
                {isRound && baggageFor(flight.ret, flight.ret.stops === 0)}
                <div className="fd-note">{ICON.info} Allowances differ by airline. Pre-purchasing extra baggage online is cheaper than at the airport.</div>
              </div>
            </div>
          )}

          {/* fare summary */}
          {tab === 'fare' && (
            <div className="fd-panel">
              <div className="fd-panel-head">{ICON.receipt}<h2>Fare summary</h2></div>
              <div className="fd-panel-body">
                <div className="fd-fare">
                  <div className="fd-fare-row"><span>{ICON.user} Base fare ({pax} {pax === 1 ? 'traveller' : 'travellers'})</span><b>{money(fb.baseFare)}</b></div>
                  <div className="fd-fare-row"><span>{ICON.receipt} Taxes &amp; surcharges</span><b>{money(fb.taxes)}</b></div>
                  <div className="fd-fare-row"><span>{ICON.plane} Airline fuel surcharge</span><b>{money(fb.surcharge)}</b></div>
                  {fb.discount > 0 && <div className="fd-fare-row disc"><span>{ICON.check} Instant discount</span><b>− {money(fb.discount)}</b></div>}
                  <div className="fd-fare-row total"><span>Total amount</span><b>{money(fb.total)}</b></div>
                </div>
                <div className="fd-note">{ICON.info} All fares in EUR, per booking, incl. applicable taxes. Final price is confirmed at checkout.</div>
              </div>
            </div>
          )}
        </div>

        {/* sidebar */}
        <aside className="fd-side">
          <div className="fd-book">
            <div className="fd-book-price">
              <div className="fd-book-label">{pax > 1 ? `Total for ${pax}` : 'Total price'}</div>
              <div className="fd-book-amt">{money(fb.total)}</div>
              {flight.origPrice > flight.price && (
                <div className="fd-book-sub"><s>{money(flight.origPrice * pax)}</s><span className="fd-save">Save {money((flight.origPrice - flight.price) * pax)}</span></div>
              )}
            </div>
            <button className="fd-book-cta" onClick={goCheckout}>Book now {ICON.arrow}</button>
            <div className="fd-book-meta">
              <div className="fd-book-row">{ICON.plane}<span>Outbound · <b>{flight.out.durLabel}</b> {flight.out.stopsLabel.toLowerCase()}</span></div>
              {isRound && <div className="fd-book-row">{ICON.plane}<span>Return · <b>{flight.ret.durLabel}</b> {flight.ret.stopsLabel.toLowerCase()}</span></div>}
              <div className="fd-book-row">{ICON.cal}<span>{fmtDateShort(flight.out.depDateISO)}{isRound ? ` – ${fmtDateShort(flight.ret.depDateISO)}` : ''}</span></div>
              <div className="fd-book-row">{ICON.board}<span>{flight.cabin} class</span></div>
              <div className="fd-book-row">{ICON.bag}<span>Cabin <b>7 kg</b> + Check-in <b>23 kg</b></span></div>
            </div>
            <div className="fd-book-trav">
              <div className="fd-book-travlbl">Travellers</div>
              <div className="fd-book-travrow"><span className="fd-book-av">{ICON.user}</span><div><div className="fd-book-tn">{paxLabel(ctx)}</div><div className="fd-book-tt">Details added at checkout</div></div></div>
            </div>
            <div className="fd-book-secure">
              <span className="fd-secure">{ICON.shieldCheck} Secure SSL payment</span>
              <span className="fd-secure">{ICON.shield} Free cancellation within 24h</span>
              <span className="fd-secure">{ICON.mail} Instant e-ticket by email</span>
            </div>
          </div>
        </aside>
      </div>

      {/* mobile sticky bar */}
      <div className="fd-mbar">
        <div className="fd-mbar-price"><small>total</small>{money(fb.total)}</div>
        <button className="fd-mbar-btn" onClick={goCheckout}>Book now {ICON.arrow}</button>
      </div>
    </div>
  );
}
