import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import i18n from '../../i18n';
import axiosInstance from '../../services/axiosInstance';
import './Transfers.css';

// Fallback visual for the checkout/confirmation summary card when HotelBeds
// returns no vehicle image (matches the FlightDetail FLIGHT_IMG pattern).
const TRANSFER_IMG = 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=900&q=80';

/* ── tiny inline icon helper (matches the Flights page approach) ── */
const S = ({ children, size = 18, sw = 1.7, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);
const ICON = {
  plane: <S><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></S>,
  pin: <S><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></S>,
  cal: <S><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></S>,
  clock: <S><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></S>,
  users: <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></S>,
  swap: <S sw={2}><path d="M7 16l-4-4 4-4M3 12h18M17 8l4 4-4 4"/></S>,
  search: <S sw={2.4}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></S>,
  arrow: <S sw={2.2}><path d="M5 12h14M12 5l7 7-7 7"/></S>,
  car: <S><path d="M5 17H3v-4l2-5h14l2 5v4h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></S>,
  van: <S><path d="M3 17V8h11l4 4v5"/><path d="M18 17h3v-3l-3-2"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/></S>,
  users2: <S><circle cx="9" cy="8" r="3"/><path d="M15 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2"/><path d="M16 3.1a4 4 0 010 7.7M21 21v-2a4 4 0 00-3-3.8"/></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></S>,
};

// `v` is sent to the transfer-search API, so it stays English; only the label is translated.
const locTypeOptions = () => [
  { v: 'IATA', label: i18n.t('transfers:locType.airport', 'Airport') },
  { v: 'ATLAS', label: i18n.t('transfers:locType.hotel', 'Hotel') },
  { v: 'PORT', label: i18n.t('transfers:locType.port', 'Port') },
  { v: 'STATION', label: i18n.t('transfers:locType.station', 'Station') },
];
// A few popular airport codes for quick pick / autocomplete.
const AIRPORTS = ['PMI', 'BCN', 'MAD', 'AGP', 'ALC', 'IBZ', 'TFS', 'AYT', 'IST', 'SAW', 'DLM', 'BJV', 'HER', 'BRU', 'CRL'];

const sortOptions = () => [
  { v: 'price-asc', l: i18n.t('transfers:sort.priceAsc', 'Price: Low to High') },
  { v: 'price-desc', l: i18n.t('transfers:sort.priceDesc', 'Price: High to Low') },
  { v: 'pax', l: i18n.t('transfers:sort.capacity', 'Capacity: Largest') },
];

const money = (n) => `€${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;
const vehicleIcon = (type) => (type === 'SHARED' ? ICON.van : ICON.car);
// Dates are read by the browser, so they need the reader's locale rather than a hard-coded en-GB.
const dateLocale = () => (i18n.language === 'nl' ? 'nl-BE' : 'en-GB');

function Stepper({ label, hint, value, set, min = 0, max = 9 }) {
  return (
    <div className="tr-step">
      <div className="tr-step-txt"><span>{label}</span>{hint && <small>{hint}</small>}</div>
      <div className="tr-stepper">
        <button type="button" onClick={() => set(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <span>{value}</span>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

function LocField({ icon, label, type, setType, code, setCode, placeholder }) {
  return (
    <div className="tr-loc">
      <span className="tr-loc-ic">{icon}</span>
      <div className="tr-loc-body">
        <div className="tr-loc-top">
          <span className="tr-loc-label">{label}</span>
          <select className="tr-loc-type" value={type} onChange={(e) => setType(e.target.value)}>
            {locTypeOptions().map((lt) => <option key={lt.v} value={lt.v}>{lt.label}</option>)}
          </select>
        </div>
        <input
          className="tr-loc-input"
          list={type === 'IATA' ? 'tr-airports' : undefined}
          placeholder={placeholder}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
        />
      </div>
    </div>
  );
}

function TransferCard({ svc, onSelect }) {
  const { t } = useTranslation('transfers');
  const freeCancel = Array.isArray(svc.cancellationPolicies) && svc.cancellationPolicies.length > 0;
  return (
    <article className="tr-card">
      <div className="tr-card-media">
        {svc.image
          ? <img src={svc.image} alt={svc.vehicle || t('transfers:card.transfer', 'Transfer')} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : <span className="tr-card-vic">{vehicleIcon(svc.transferType)}</span>}
        <span className={`tr-chip ${svc.transferType === 'SHARED' ? 'shared' : 'private'}`}>
          {svc.transferType === 'SHARED' ? t('transfers:card.shared', 'Shared') : t('transfers:card.private', 'Private')}
        </span>
      </div>
      <div className="tr-card-mid">
        <h3 className="tr-card-title">{svc.vehicle || t('transfers:card.transfer', 'Transfer')}{svc.category ? ` · ${svc.category}` : ''}</h3>
        <div className="tr-card-route">
          <span>{svc.pickup?.from || '—'}</span>
          <span className="tr-card-arrow">{ICON.arrow}</span>
          <span>{svc.pickup?.to || '—'}</span>
        </div>
        <div className="tr-card-tags">
          {(svc.minPax || svc.maxPax) && (
            <span className="tr-tag">{ICON.users2} {t('transfers:card.pax', { min: svc.minPax || 1, max: svc.maxPax || svc.minPax, defaultValue: '{{min}}–{{max}} pax' })}</span>
          )}
          <span className="tr-tag">{svc.direction === 'DEPARTURE' ? t('transfers:card.hotelToAirport', 'Hotel → Airport') : t('transfers:card.airportToHotel', 'Airport → Hotel')}</span>
          {freeCancel && <span className="tr-tag ok">{ICON.shield} {t('transfers:card.freeCancellation', 'Free cancellation')}</span>}
        </div>
      </div>
      <div className="tr-card-price">
        <div className="tr-price">{money(svc.price)}</div>
        <div className="tr-price-sub">{t('transfers:card.totalPrice', 'total price')}</div>
        <button className="tr-select" onClick={() => onSelect(svc)}>{t('transfers:card.select', 'Select')} {ICON.arrow}</button>
      </div>
    </article>
  );
}

export default function Transfers() {
  const { t } = useTranslation('transfers');
  const navigate = useNavigate();
  const [fromType, setFromType] = useState('IATA');
  const [fromCode, setFromCode] = useState('');
  const [toType, setToType] = useState('ATLAS');
  const [toCode, setToCode] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('12:00');
  const [roundtrip, setRoundtrip] = useState(false);
  const [inDate, setInDate] = useState('');
  const [inTime, setInTime] = useState('12:00');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  const [results, setResults] = useState(null); // null = not searched yet, [] = searched/none
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('price-asc');
  // Customer's arrival/departure ride number — HotelBeds requires it on the
  // booking's transferDetails (defaults to 'NA' server-side when left blank).
  const [flightNo, setFlightNo] = useState('');
  // Snapshot of the params the CURRENT results were fetched with — checkout must
  // use these, not the live form values (the user may edit the form after searching).
  const [lastSearch, setLastSearch] = useState(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  const paxLabel = [
    t('transfers:pax.adults', { count: adults, defaultValue_one: '{{count}} adult', defaultValue_other: '{{count}} adults' }),
    children ? t('transfers:pax.children', { count: children, defaultValue_one: '{{count}} child', defaultValue_other: '{{count}} children' }) : null,
    infants ? t('transfers:pax.infants', { count: infants, defaultValue_one: '{{count}} infant', defaultValue_other: '{{count}} infants' }) : null,
  ].filter(Boolean).join(', ');

  const swap = () => {
    setFromType(toType); setFromCode(toCode);
    setToType(fromType); setToCode(fromCode);
  };

  const doSearch = async () => {
    if (!fromCode.trim() || !toCode.trim() || !date) {
      setError(t('transfers:errors.missingFields', 'Please choose a pickup, a drop-off and a date.'));
      return;
    }
    setError(''); setSelected(null); setLoading(true); setResults(null);
    const outbound = `${date}T${time}:00`;
    const inbound = roundtrip && inDate ? `${inDate}T${inTime}:00` : undefined;
    const params = {
      fromType, fromCode: fromCode.trim().toUpperCase(),
      toType, toCode: toCode.trim().toUpperCase(),
      outbound, inbound, adults, children, infants,
    };
    setLastSearch({ ...params, date, time, roundtrip, inDate, inTime });
    try {
      const { data } = await axiosInstance.post('/transfer-availability/search', params);
      const hb = data?.results?.hotelbeds;
      if (hb?.error && !(hb?.services?.length)) setError(hb.error);
      setResults(hb?.services || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || t('transfers:errors.searchFailed', 'Transfer search failed.'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(() => {
    const list = [...(results || [])];
    list.sort((a, b) => {
      if (sort === 'price-desc') return (b.price || 0) - (a.price || 0);
      if (sort === 'pax') return (b.maxPax || 0) - (a.maxPax || 0);
      return (a.price || 0) - (b.price || 0);
    });
    return list;
  }, [results, sort]);

  const fmtDateLabel = (iso, hhmm) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    return `${d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${hhmm ? ` · ${hhmm}` : ''}`;
  };

  // Hand the selected transfer to the shared Checkout (same contract as
  // FlightDetail/HotelDetail: display fields + `api` payload for the backend).
  // Uses the SNAPSHOTTED search params — the results belong to those, not to
  // whatever the form fields currently hold.
  const goCheckout = (svc) => {
    const s = lastSearch;
    if (!s) return;
    const booking = {
      kind: 'transfer',
      hotelName: `${svc.vehicle || t('transfers:card.transfer', 'Transfer')}${svc.category ? ` · ${svc.category}` : ''}`,
      loc: `${svc.pickup?.from || s.fromCode} → ${svc.pickup?.to || s.toCode}`,
      img: svc.image || TRANSFER_IMG,
      stars: 0,
      currency: '€',
      nights: 1,               // keeps per-day insurance maths sane for a transfer
      // Seed one checkout traveller form per searched passenger (adults+children+
      // infants) — the server re-prices from the travellers' dates of birth, so the
      // party entered at checkout must match the searched occupancy.
      adults: (s.adults || 1) + (s.children || 0) + (s.infants || 0),
      maxPax: svc.maxPax || 9, // checkout caps "add traveller" at vehicle capacity
      ppPrice: Math.round((svc.price || 0) * 100) / 100, // TOTAL per vehicle (checkout does not multiply for transfers)
      origPrice: svc.price,
      dateLabel: fmtDateLabel(s.date, s.time),
      transfer: {
        from: svc.pickup?.from || s.fromCode,
        to: svc.pickup?.to || s.toCode,
        date: s.date, time: s.time,
        retDate: s.roundtrip && s.inDate ? fmtDateLabel(s.inDate, s.inTime) : null,
        type: svc.transferType, vehicle: svc.vehicle,
        direction: svc.direction, maxPax: svc.maxPax,
      },
      // ── payload for the backend Online-booking create call ──
      api: {
        transfer: {
          fromType: s.fromType, fromCode: s.fromCode,
          toType: s.toType, toCode: s.toCode,
          outbound: s.outbound, inbound: s.inbound,
          price: svc.price, currency: 'EUR',
          rateKey: svc.rateKey,
          transferType: svc.transferType, vehicleCode: svc.vehicleCode,
          vehicle: svc.vehicle, direction: svc.direction,
          from: svc.pickup?.from, to: svc.pickup?.to,
          flightNumber: flightNo.trim().toUpperCase() || undefined,
        },
      },
    };
    navigate('/checkout', { state: { booking } });
  };

  return (
    <div className="tr">
      {/* hero + search */}
      <header className="tr-hero">
        <span className="tr-hero-glow" />
        <div className="tr-hero-in">
          <div className="tr-bc">
            <Link to="/">{t('common:nav.home', 'Home')}</Link><span>›</span><span className="tr-bc-here">{t('common:nav.services.transfers', 'Transfers')}</span>
          </div>
          <h1 className="tr-hero-title"><Trans i18nKey="transfers:hero.title" t={t}>Airport <em>transfers</em></Trans></h1>
          <p className="tr-hero-sub">{t('transfers:hero.sub', 'Private & shared rides between airports, hotels, ports and stations — booked in seconds.')}</p>

          <div className="tr-searchcard">
            <div className="tr-locrow">
              <LocField icon={ICON.plane} label={t('transfers:fields.from', 'From')} type={fromType} setType={setFromType} code={fromCode} setCode={setFromCode}
                placeholder={fromType === 'IATA' ? t('transfers:fields.airportCodePlaceholder', 'Airport code (e.g. PMI)') : fromType === 'ATLAS' ? t('transfers:fields.hotelCodePlaceholder', 'Hotel code') : t('transfers:fields.codePlaceholder', 'Code')} />
              <button className="tr-swap" type="button" title={t('transfers:fields.swap', 'Swap')} onClick={swap}>{ICON.swap}</button>
              <LocField icon={ICON.pin} label={t('transfers:fields.to', 'To')} type={toType} setType={setToType} code={toCode} setCode={setToCode}
                placeholder={toType === 'ATLAS' ? t('transfers:fields.hotelCodePlaceholder', 'Hotel code') : toType === 'IATA' ? t('transfers:fields.airportCodePlaceholder', 'Airport code (e.g. PMI)') : t('transfers:fields.codePlaceholder', 'Code')} />
            </div>

            <div className="tr-daterow">
              <div className="tr-field">
                <span className="tr-field-ic">{ICON.cal}</span>
                <div className="tr-field-body">
                  <span className="tr-field-label">{t('transfers:fields.pickupDate', 'Pickup date')}</span>
                  <input type="date" min={todayISO} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="tr-field">
                <span className="tr-field-ic">{ICON.clock}</span>
                <div className="tr-field-body">
                  <span className="tr-field-label">{t('transfers:fields.pickupTime', 'Pickup time')}</span>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>

              {roundtrip && (
                <>
                  <div className="tr-field">
                    <span className="tr-field-ic">{ICON.cal}</span>
                    <div className="tr-field-body">
                      <span className="tr-field-label">{t('transfers:fields.returnDate', 'Return date')}</span>
                      <input type="date" min={date || todayISO} value={inDate} onChange={(e) => setInDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="tr-field">
                    <span className="tr-field-ic">{ICON.clock}</span>
                    <div className="tr-field-body">
                      <span className="tr-field-label">{t('transfers:fields.returnTime', 'Return time')}</span>
                      <input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="tr-field tr-field-pax">
                <span className="tr-field-ic">{ICON.users}</span>
                <div className="tr-field-body">
                  <span className="tr-field-label">{t('transfers:fields.passengers', 'Passengers')}</span>
                  <details className="tr-paxdrop">
                    <summary>{paxLabel}</summary>
                    <div className="tr-paxpanel">
                      <Stepper label={t('transfers:fields.adults', 'Adults')} hint="13+" value={adults} set={setAdults} min={1} />
                      <Stepper label={t('transfers:fields.children', 'Children')} hint="3–12" value={children} set={setChildren} />
                      <Stepper label={t('transfers:fields.infants', 'Infants')} hint="0–2" value={infants} set={setInfants} />
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <div className="tr-searchfoot">
              <label className="tr-round">
                <input type="checkbox" checked={roundtrip} onChange={(e) => setRoundtrip(e.target.checked)} />
                <span>{t('transfers:fields.addReturnTransfer', 'Add return transfer')}</span>
              </label>
              <button className="tr-searchbtn" onClick={doSearch} disabled={loading}>
                {ICON.search} {loading ? t('transfers:fields.searching', 'Searching…') : t('transfers:fields.searchTransfers', 'Search transfers')}
              </button>
            </div>
          </div>
          <datalist id="tr-airports">{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
      </header>

      {/* results */}
      <div className="tr-main">
        {error && <div className="tr-error">{error}</div>}

        {results !== null && !loading && (
          <div className="tr-toolbar">
            <div className="tr-count">{t('transfers:results.found', { count: sorted.length, defaultValue_one: '{{count}} transfer found', defaultValue_other: '{{count}} transfers found' })}</div>
            {sorted.length > 0 && (
              <div className="tr-sortwrap">
                <span>{t('transfers:results.sort', 'Sort')}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {sortOptions().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {loading && [0, 1, 2].map((i) => (
          <div className="tr-skel" key={i}><div className="tr-skel-media" /><div className="tr-skel-lines"><span /><span /><span /></div><div className="tr-skel-price" /></div>
        ))}

        {!loading && results !== null && sorted.length === 0 && !error && (
          <div className="tr-empty">
            <div className="tr-empty-ic">{ICON.car}</div>
            <h3>{t('transfers:results.noneFoundTitle', 'No transfers found')}</h3>
            <p>{t('transfers:results.noneFoundBody', 'Try a different date, or check the pickup / drop-off codes.')}</p>
          </div>
        )}

        {!loading && sorted.map((svc, i) => (
          <div key={svc.rateKey || svc.serviceId || i} className="tr-card-wrap" style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}>
            <TransferCard svc={svc} onSelect={setSelected} />
          </div>
        ))}

        {results === null && !loading && !error && (
          <div className="tr-intro">
            <div className="tr-intro-ic">{ICON.car}</div>
            <h3>{t('transfers:results.introTitle', 'Where are you headed?')}</h3>
            <p>{t('transfers:results.introBody', 'Enter a pickup and drop-off above to see available transfers.')}</p>
          </div>
        )}
      </div>

      {/* selected summary bar (handoff to checkout) */}
      {selected && (
        <div className="tr-selbar">
          <div className="tr-selbar-in">
            <div className="tr-selbar-txt">
              <strong>{selected.vehicle}{selected.category ? ` · ${selected.category}` : ''}</strong>
              <span>{selected.pickup?.from} → {selected.pickup?.to} · {money(selected.price)}</span>
            </div>
            <div className="tr-selbar-flight">
              <label>{ICON.plane} <Trans i18nKey="transfers:selbar.flightNo" t={t}>Flight no. <small>(recommended)</small></Trans></label>
              <input
                value={flightNo}
                onChange={(e) => setFlightNo(e.target.value.toUpperCase())}
                placeholder={t('transfers:selbar.flightNoPlaceholder', 'e.g. SN3721')}
                maxLength={7}
              />
            </div>
            <button className="tr-selbar-btn" onClick={() => goCheckout(selected)}>
              {t('transfers:selbar.continue', 'Continue to book')} {ICON.arrow}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
