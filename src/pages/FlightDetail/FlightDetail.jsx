import { useState, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import './FlightDetail.css';
import { buildContext, fmtDate, fmtDateShort, fareBreakdown, paxLabel } from '../Flights/flightData';

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
              <div className="fd-point-date">{[depDate, leg.fromTerminal].filter(Boolean).join(' · ')}</div>
            </div>
          </div>

          <div className="fd-flight-strip">
            <span className="fd-airbadge">{leg.airline}<span className="fd-airdot" style={{ background: leg.color }}>{leg.airlineCode}</span></span>
            <span className="fd-ftag">{ICON.doc} Flight <b>{leg.flightNo}</b></span>
            {leg.aircraft && <span className="fd-ftag">{ICON.plane} <b>{leg.aircraft}</b></span>}
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
              <div className="fd-point-date">{[arrDate, leg.toTerminal].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FARE_RULES = [
  // These two used to print fee TABLES — "€45 per person", "€35 + fare difference", "Not
  // permitted" — as though they were this fare's conditions. Airtuerk returns no rule data
  // of any kind (no cancellation, change, penalty or refundability field anywhere in the
  // search or price response), so every one of those figures was invented, and the table
  // sat directly above a "Free cancellation within 24h" badge that contradicted it.
  // Cancellation terms are a term of the carriage contract; a traveller charged a fee this
  // page told them they would not pay is not a styling problem.
  { id: 'cancel', icon: <S><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></S>, title: 'Cancellation', badge: 'Airline terms', tone: 'warn',
    text: 'Cancellation terms are set by the operating airline and depend on the fare booked. The exact conditions, and any charge, are confirmed before payment.' },
  { id: 'change', icon: <S><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>, title: 'Date change', badge: 'Airline terms', tone: 'warn',
    text: 'Whether the dates can be changed, and any fee or fare difference that applies, is set by the operating airline for the fare booked. Confirmed before payment.' },
  { id: 'seat', icon: <S><path d="M6 19v-7a6 6 0 0112 0v7" /><rect x="4" y="19" width="16" height="2" rx="1" /></S>, title: 'Seat selection', badge: 'Chargeable', tone: 'warn',
    text: 'Seat selection is offered by the operating airline and priced by them; the charge is shown before payment. A seat is assigned free at check-in if none is chosen.' },
  { id: 'meal', icon: <S><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /></S>, title: 'Meals', badge: 'Not included', tone: 'no',
    text: 'Catering varies by airline and route. Where a meal is not part of the fare it can usually be pre-ordered or bought on board; any charge is shown before payment.' },
];

export default function FlightDetail() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // The flight is whatever the results page handed over. There is no second source: a
  // supplier fare cannot be re-resolved from an id, and the opaque flightKey it is booked
  // with lives only in that hand-off.
  const { flight, ctx } = useMemo(() => ({
    flight: state?.flight || null,
    ctx: state?.ctx || buildContext(new URLSearchParams()),
  }), [state]);

  const [tab, setTab] = useState('details');
  const [openRule, setOpenRule] = useState('cancel');

  const fb = useMemo(() => (flight ? fareBreakdown(flight) : null), [flight]);
  const money = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;

  // Reloading this URL, or opening it from a bookmark, used to fall back to
  // generateFlights() — a fabricated itinerary on a default LON→DXB route, at a fabricated
  // price, with a working "Book now" button beneath it. None of it had ever been quoted by
  // a supplier and no booking could have completed against it. Send the traveller back to
  // search instead of inventing an offer.
  if (!flight) {
    return (
      <div className="fd">
        <div className="fd-page fd-page-empty">
          <div className="fd-panel">
            <div className="fd-panel-head">{ICON.plane}<h2>This flight is no longer loaded</h2></div>
            <div className="fd-panel-body">
              <p>Flight fares are held only for the search that found them, so this page cannot be
                reopened on its own. Run the search again to see the current fares and times.</p>
              <p style={{ marginTop: 16 }}>
                <Link className="fd-book-cta" to="/flights">Search flights {ICON.arrow}</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const pax = flight.pax || 1;
  const isRound = !!flight.ret;
  // A multi-city trip arrives as a `legs` array — the fares chosen for each of its flights,
  // assembled by the results page (flightData.combineTrip). Everything below reads THIS, so
  // one way, round trip and multi-city are the same page with a different number of legs;
  // out/ret stay the source for the two shapes that have always used them.
  const isMulti = flight.tripType === 'multicity' && Array.isArray(flight.legs) && flight.legs.length > 1;
  const legs = isMulti ? flight.legs : [flight.out, isRound ? flight.ret : null].filter(Boolean);
  // Multi-city legs are numbered; a round trip's two are named by direction.
  const legLabel = (i) => (isMulti ? `Flight ${i + 1}` : i === 0 ? 'Outbound' : 'Return');
  const legClass = (i) => (isMulti ? (i % 2 === 0 ? 'out' : 'ret') : i === 0 ? 'out' : 'ret');
  const tripLabel = isMulti ? 'Multi-city' : isRound ? 'Round trip' : 'One way';
  const lastLeg = legs[legs.length - 1] || flight.out;
  const nights = isRound ? Math.max(1, dayDiff(flight.out.depDateISO, flight.ret.depDateISO)) : 0;
  const totalMin = flight.totalMin;
  const totalLabel = `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;

  // "8h 30m · Non-stop · Economy" — built by joining only the parts the fare actually
  // states. Airtuerk sends no aircraft type and no cabin, and this line used to render
  // them anyway, producing "8h 30m · Non-stop ·  · " with the separators left stranded.
  const legMeta = (leg) => [leg.durLabel, leg.stopsLabel, leg.aircraft, flight.cabin, flight.fareName]
    .filter(Boolean).join(' · ');

  // The trip-level allowance is the more restrictive of the two directions (the supplier
  // computes it that way), so it is the only figure true of the whole journey.
  const tripBag = flight.baggage || flight.out?.baggage || null;
  const bagKg = Number(tripBag?.checkedKg) || 0;
  const bagPieces = Number(tripBag?.checkedPieces) || 0;
  const bagLine = !tripBag
    ? 'Baggage allowance confirmed with your fare'
    : bagKg > 0
      ? `Check-in ${bagKg} kg included`
      : bagPieces > 0
        ? `Check-in ${bagPieces} ${bagPieces === 1 ? 'piece' : 'pieces'} included`
        : 'No hold baggage in this fare';

  const goCheckout = () => {
    const booking = {
      kind: 'flight',
      hotelName: isMulti
        ? [legs[0].fromCity, ...legs.map((l) => l.toCity)].join(' → ')
        : `${flight.out.fromCity} → ${flight.out.toCity}`,
      loc: [tripLabel, flight.cabin].filter(Boolean).join(' · '),
      img: FLIGHT_IMG,
      stars: 0,
      currency: '€',
      nights,
      adults: pax,
      ppPrice: fb.perPerson,
      origPrice: flight.origPrice,
      dateLabel: legs.length > 1
        ? `${fmtDateShort(legs[0].depDateISO)} — ${fmtDateShort(lastLeg.depDateISO)}`
        : fmtDateShort(flight.out.depDateISO),
      cabin: flight.cabin,
      route: isMulti
        ? [legs[0].fromCity, ...legs.map((l) => l.toCity)].join(' → ')
        : `${flight.out.fromCity} → ${flight.out.toCity}`,
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
          from: flight.out.fromCode, to: lastLeg.toCode,
          depdate: flight.out.depDateISO, retdate: isRound ? flight.ret.depDateISO : undefined,
          price: fb.total, currency: 'EUR',
          tripType: isMulti ? 'multicity' : isRound ? 'roundtrip' : 'oneway', supplier: 'Airtuerk',
          // Opaque Airtuerk bookable key(s) needed for live reservation (basket/create).
          // One-way → 1 key; round trip → 2 keys (outbound + return).
          flightKeys: Array.isArray(flight.flightKeys) && flight.flightKeys.length
            ? flight.flightKeys
            : [flight.flightKey].filter(Boolean),
          legs: legs.map((leg) => ({
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

  /* Allowances are stated ONLY when the fare tells us what they are.
     This block used to print "1 piece, max 7 kg (55 × 40 × 23 cm)", "max 23 kg (158 cm total)"
     and an extra-bag price list of "15 kg (€18), 23 kg (€26), 30 kg (€34)". None of those
     numbers came from anywhere: this page resolves its flight from generateFlights(), so the
     figures were invented and then presented in bold as though they were the airline's terms.
     Baggage allowance is a term of the carriage contract — a traveller turned away at a bag
     drop is not a styling problem.
     `leg.baggage` is the supplier's real allowance (kilos, 0 = not included) once this page is
     fed live flights; until then it is absent and the card says plainly that the allowance is
     confirmed with the fare rather than inventing one. */
  const baggageFor = (leg, label) => {
    const kg = Number(leg?.baggage?.checkedKg) || 0;
    const pieces = Number(leg?.baggage?.checkedPieces) || 0;
    const handKg = Number(leg?.baggage?.handKg) || 0;
    const known = !!leg?.baggage;
    const hasChecked = kg > 0 || pieces > 0;
    return (
      <>
        <div className="fd-bag-leglabel">{label}: {leg.fromCode} → {leg.toCode} ({leg.airline})</div>
        <div className="fd-bag-card">
          <div className="fd-bag-ic cabin">{ICON.bag}</div>
          <div className="fd-bag-info">
            <div className="fd-bag-title">Cabin baggage</div>
            <div className="fd-bag-desc">
              {handKg > 0
                ? <>Up to <b>{handKg} kg</b> of hand baggage, plus one small personal item.</>
                : <>Hand baggage rules are set by the operating airline and are confirmed with your fare before payment.</>}
            </div>
            {handKg > 0 && <span className="fd-bag-tag inc">Included</span>}
          </div>
        </div>
        <div className="fd-bag-card">
          <div className={`fd-bag-ic ${hasChecked ? 'checkin' : 'extra'}`}>{ICON.bag}</div>
          <div className="fd-bag-info">
            <div className="fd-bag-title">Check-in baggage</div>
            <div className="fd-bag-desc">
              {kg > 0 ? <><b>{kg} kg</b> of hold baggage is included in this fare.</>
                : pieces > 0 ? <><b>{pieces} {pieces === 1 ? 'piece' : 'pieces'}</b> of hold baggage is included in this fare.</>
                : known ? <>This fare includes no hold baggage. It can be added during booking — the price depends on the airline and the weight.</>
                : <>Hold baggage allowance is confirmed with your fare before payment.</>}
            </div>
            {known && (
              <span className={`fd-bag-tag ${hasChecked ? 'inc' : 'paid'}`}>
                {hasChecked ? 'Included' : 'Paid add-on'}
              </span>
            )}
          </div>
        </div>
      </>
    );
  };

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
            <a onClick={() => navigate(-1)}>{[legs[0]?.fromCode, ...legs.map((l) => l.toCode)].join(' → ')}</a><span className="fd-bc-sep">›</span>
            {/* Every carrier flying this trip, named once each — a four-leg trip on two
                airlines reads as two names, not four. */}
            <span className="fd-bc-here">{[...new Set(legs.map((l) => l.airline))].join(' + ')}</span>
          </div>
          <div className="fd-hero-route">
            <div className="fd-hero-city">
              <div className="fd-hero-code">{flight.out.fromCode}</div>
              <div className="fd-hero-cname">{flight.out.fromCity}</div>
            </div>
            <div className="fd-hero-plane">{ICON.plane}<span className="fd-hero-trip">{tripLabel}</span></div>
            {/* Where the journey ENDS, which on a multi-city trip is the last leg's arrival
                rather than the first leg's. */}
            <div className="fd-hero-city">
              <div className="fd-hero-code">{lastLeg.toCode}</div>
              <div className="fd-hero-cname">{lastLeg.toCity}</div>
            </div>
          </div>
          <div className="fd-hero-chips">
            <span className="fd-hchip">{ICON.cal} {fmtDate(flight.out.depDateISO)}</span>
            {isMulti && <span className="fd-hchip">{ICON.plane} {legs.length} flights</span>}
            <span className="fd-hchip">{ICON.user} {paxLabel(ctx)}</span>
            {flight.cabin && <span className="fd-hchip">{ICON.board} {flight.cabin}</span>}
            {flight.fareName && <span className="fd-hchip">{ICON.doc} {flight.fareName}</span>}
            <span className="fd-hchip">{ICON.clock} {totalLabel} total</span>
            <span className="fd-hchip fd-hchip-price">from {money(flight.price)} pp</span>
          </div>
        </div>
      </header>

      <div className="fd-page">
        <div className="fd-main">
          {/* itinerary */}
          <div className="fd-itin">
            {legs.map((leg, i) => (
              <LegBlock key={i} leg={leg} dirLabel={legLabel(i)} dirClass={legClass(i)} />
            ))}
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
                  <div className="fd-stat">
                    <span className="fd-stat-k">{isMulti ? 'Flights' : isRound ? 'Trip length' : 'Journey'}</span>
                    <span className="fd-stat-v">
                      {isMulti ? `${legs.length} one-way fares` : isRound ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'One way'}
                    </span>
                  </div>
                  {flight.cabin && <div className="fd-stat"><span className="fd-stat-k">Cabin class</span><span className="fd-stat-v">{flight.cabin}</span></div>}
                  {flight.fareName && <div className="fd-stat"><span className="fd-stat-k">Fare</span><span className="fd-stat-v">{flight.fareName}</span></div>}
                </div>
                {legs.map((leg, i) => (
                  <div className={`fd-detail-card ${legClass(i)}`} key={i}>
                    <div className="fd-detail-title">{ICON.plane} {legLabel(i)} · {leg.fromCode} → {leg.toCode}</div>
                    <p><b>{leg.airline} · {leg.flightNo}</b><br />
                      Departs <b>{leg.depTime}</b> ({fmtDateShort(leg.depDateISO)}) · Arrives <b>{leg.arrTime}{leg.arrDay > 0 ? ` (+${leg.arrDay})` : ''}</b><br />
                      {legMeta(leg)}</p>
                  </div>
                ))}
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
                {legs.map((leg, i) => (
                  <div key={i}>{baggageFor(leg, legLabel(i))}</div>
                ))}
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
                  {fb.baseFare != null && (
                    <div className="fd-fare-row"><span>{ICON.user} Base fare ({pax} {pax === 1 ? 'traveller' : 'travellers'})</span><b>{money(fb.baseFare)}</b></div>
                  )}
                  {fb.taxes != null && (
                    <div className="fd-fare-row"><span>{ICON.receipt} Taxes &amp; surcharges</span><b>{money(fb.taxes)}</b></div>
                  )}
                  {fb.perAdult != null && fb.pax > 1 && (
                    <div className="fd-fare-row"><span>{ICON.user} Fare per adult</span><b>{money(fb.perAdult)}</b></div>
                  )}
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
              {legs.map((leg, i) => (
                <div className="fd-book-row" key={i}>
                  {ICON.plane}
                  <span>{isMulti ? `${leg.fromCode} → ${leg.toCode}` : legLabel(i)} · <b>{leg.durLabel}</b> {leg.stopsLabel.toLowerCase()}</span>
                </div>
              ))}
              <div className="fd-book-row">{ICON.cal}<span>{fmtDateShort(flight.out.depDateISO)}{legs.length > 1 ? ` – ${fmtDateShort(lastLeg.depDateISO)}` : ''}</span></div>
              {flight.cabin && <div className="fd-book-row">{ICON.board}<span>{flight.cabin} class</span></div>}
              {/* Was a flat "Cabin 7 kg + Check-in 23 kg" on every fare — printed in bold next
                  to a Book button, on fares that include no hold baggage at all, and directly
                  contradicting the Baggage tab three inches away. Now it states the fare's own
                  allowance, or says plainly that there isn't one to state yet. */}
              <div className="fd-book-row">{ICON.bag}<span>{bagLine}</span></div>
            </div>
            <div className="fd-book-trav">
              <div className="fd-book-travlbl">Travellers</div>
              <div className="fd-book-travrow"><span className="fd-book-av">{ICON.user}</span><div><div className="fd-book-tn">{paxLabel(ctx)}</div><div className="fd-book-tt">Details added at checkout</div></div></div>
            </div>
            <div className="fd-book-secure">
              <span className="fd-secure">{ICON.shieldCheck} Secure SSL payment</span>
              <span className="fd-secure">{ICON.shield} Fare conditions shown before payment</span>
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
