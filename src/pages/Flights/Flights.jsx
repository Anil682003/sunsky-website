import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import './Flights.css';
import axiosInstance from '../../services/axiosInstance';
import { buildContext, paxLabel, fmtDateShort, mapAirtuerkFlight, badgeFlights, flightTotal, legContexts, combineTrip, cabinLabel } from './flightData';
import AirlineMark from '../../components/AirlineMark/AirlineMark';
import { useAirlineName } from '../../utils/airlineLogos';
import confirmFlight, { canConfirm, CONFIRMED, PRICE_CHANGED, NOT_AVAILABLE } from './confirmFlight';

/** The search body, shared by the cached search and the live fallback so both price the same party. */
const searchBody = (s) => ({
  from: s.from.code,
  to: s.to.code,
  depdate: s.depISO,
  retdate: s.tripType === 'roundtrip' ? s.retISO : undefined,
  adults: s.adults,
  children: s.children,
  infants: s.infants,
});

/**
 * One leg's flights, from the cache, falling back to the live search when the cache says its
 * answer is incomplete.
 *
 * `complete: false` on a round trip means the cache holds no return fare for that route and date
 * (the Airtürk feed only grew a return direction in October 2026). That is a gap in what we
 * imported, not a sold-out route, so showing an empty list would invent an answer the cache never
 * gave. The live search is slow but correct, and this is the only path that still calls it.
 */
async function fetchLegFlights(s) {
  const body = searchBody(s);
  const { data } = await axiosInstance.post('/flight-availability/cached-search', body);
  if (data?.complete === false) {
    const live = await axiosInstance.post('/flight-availability/search', body);
    return live.data;
  }
  return data;
}

/**
 * Does this fare still have to be checked live?
 *
 * A cached fare carries no bookable keys — the contract says `flightKeys` is always `[]` until
 * it is confirmed — so the empty list is the honest test rather than reading a source label. A
 * live fare (the `complete: false` fallback above) already has its keys and goes straight through.
 */
const needsConfirm = (f) => !(f?.flightKeys?.length) && canConfirm(f);

/** Shared empty value, so a search with nothing gone does not build a new Set on every render. */
const EMPTY_GONE = { key: '', ids: new Set() };

/**
 * Swap a cached card for the live, bookable flight the confirm returned.
 *
 * The answer arrives in the raw `/search` shape, so it goes through the same mapper the list
 * used; what is kept from the cached card is only its identity — the id the list and the
 * multi-city picks are keyed by, and the badge the user is looking at.
 */
const mergeLive = (cached, live, s) => {
  const mapped = mapAirtuerkFlight(live, s, 0);
  if (!mapped) return cached;
  return { ...mapped, id: cached.id, legIndex: cached.legIndex, badge: cached.badge };
};

// The identifier stays English (it also drives the CSS class via
// `f.badge.replace(/\s/g, '').toLowerCase()`); only the rendered label is translated.
const badgeLabel = (b) => ({
  Cheapest: i18n.t('flights:badge.cheapest', 'Cheapest'),
  Fastest: i18n.t('flights:badge.fastest', 'Fastest'),
  'Best Value': i18n.t('flights:badge.bestValue', 'Best Value'),
}[b] || b);


const S = ({ children, size = 16, sw = 2, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
);
const ICON = {
  clock: <S><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></S>,
  filter: <S><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></S>,
  x: <S sw={2.2}><path d="M18 6L6 18M6 6l12 12" /></S>,
  chev: <S sw={2.4}><path d="M6 9l6 6 6-6" /></S>,
  plane: <S fill="currentColor" sw={0}><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></S>,
  arrow: <S sw={2.4}><path d="M5 12h14M12 5l7 7-7 7" /></S>,
  bolt: <S fill="currentColor" sw={0}><path d="M13 2L3 14h7v8l10-12h-7z" /></S>,
  cal: <S><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></S>,
  users: <S><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></S>,
  swap: <S sw={2.2}><path d="M7 16l-4-4 4-4M3 12h18M17 8l4 4-4 4" /></S>,
  check: <S sw={3}><path d="M20 6L9 17l-5-5" /></S>,
  edit: <S><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></S>,
};

const TIME_SLOTS = [
  { key: 0, label: '00–06', lo: 0, hi: 360 },
  { key: 1, label: '06–12', lo: 360, hi: 720 },
  { key: 2, label: '12–18', lo: 720, hi: 1080 },
  { key: 3, label: '18–00', lo: 1080, hi: 1440 },
];
const sortOptions = () => [
  { v: 'price-asc', l: i18n.t('flights:sort.priceAsc', 'Price: Low to High') },
  { v: 'price-desc', l: i18n.t('flights:sort.priceDesc', 'Price: High to Low') },
  { v: 'dur', l: i18n.t('flights:sort.duration', 'Duration: Shortest') },
  { v: 'dep-early', l: i18n.t('flights:sort.depEarly', 'Departure: Earliest') },
  { v: 'dep-late', l: i18n.t('flights:sort.depLate', 'Departure: Latest') },
];
const hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function Section({ title, sub, open, onToggle, children }) {
  return (
    <div className={`fl-fsec${open ? ' open' : ''}`}>
      <div className="fl-fhead" onClick={onToggle}>
        <h3>{title}</h3>
        <span className="fl-farrow">{ICON.chev}</span>
      </div>
      <div className="fl-fbody">
        {sub && <div className="fl-fsub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

/* One direction of a fare. Hoisted OUT of FlightCard: defined inside it, this was a new
   component type on every render, so React unmounted and remounted the whole row each time —
   including the airline mark, which then re-ran its logo lookup on every pass. */
const Leg = ({ leg, tag }) => (
  <div className="fl-leg">
    {/* Name ahead of the mark, as everywhere else the site prints a carrier — and the mark
        is the airline's own logo from the dashboard (Products → Flights → Airlines), which
        the hotel and checkout screens have shown for a while and this one never did. No
        `name` is passed: the dashboard knows carriers the static table does not, so letting
        AirlineMark resolve it means "VF" reads as Vietjet here rather than as VF. */}
    <div className="fl-leg-air">
      <AirlineMark code={leg.airlineCode} className="fl-leg-logo" nameClassName="fl-leg-name" />
    </div>
    <div className="fl-leg-pt">
      <div className="fl-leg-time">{leg.depTime}</div>
      <div className="fl-leg-code">{leg.fromCode}</div>
    </div>
    <div className="fl-leg-mid">
      <div className="fl-leg-dur">{ICON.clock} {leg.durLabel}</div>
      <div className="fl-leg-line"><span className="fl-leg-tag">{tag}</span></div>
      <div className={`fl-leg-stops ${leg.stops === 0 ? 'ns' : 'st'}`}>{leg.stopsLabel}</div>
    </div>
    <div className="fl-leg-pt fl-leg-arr">
      <div className="fl-leg-time">{leg.arrTime}{leg.arrDay > 0 && <sup>+{leg.arrDay}</sup>}</div>
      <div className="fl-leg-code">{leg.toCode}</div>
    </div>
  </div>
);

function FlightCard({ f, onSelect, money, state, isGone }) {
  const { t } = useTranslation('flights');
  const checking = state?.kind === 'checking';
  // Only a definite NOT_AVAILABLE from the server disables the button. A check that failed
  // leaves it enabled so the traveller can simply try again (UI-16).
  const failed = state?.kind === 'sourceError';
  return (
    <article className={`fl-card${isGone ? ' gone' : ''}`}>
      {f.badge && <span className={`fl-badge ${f.badge.replace(/\s/g, '').toLowerCase()}`}>{f.badge === 'Fastest' && ICON.bolt} {badgeLabel(f.badge)}</span>}
      <div className="fl-card-in">
        <div className="fl-card-legs">
          <Leg leg={f.out} tag={t('flights:legTag.outbound', 'Outbound')} />
          {f.ret && <><div className="fl-legs-div" /><Leg leg={f.ret} tag={t('flights:legTag.return', 'Return')} /></>}
        </div>
        <div className="fl-card-price">
          {f.fareName && <div className="fl-fare-name">{f.fareName}</div>}
          {f.origPrice > f.price && <div className="fl-price-was">{money(f.origPrice)}</div>}
          <div className="fl-price">{money(f.price)}</div>
          <div className="fl-price-sub">
            {f.pax > 1
              ? `${t('flights:price.perPerson', 'per person')} · ${money(flightTotal(f))} ${t('flights:price.total', 'total')}`
              : t('flights:price.perPerson', 'per person')}
          </div>
          <button
            className="fl-select"
            onClick={() => onSelect(f)}
            disabled={checking || isGone}
            aria-busy={checking || undefined}
          >
            {checking
              ? t('flights:confirm.checking', 'Checking availability…')
              : isGone
                ? t('flights:confirm.gone', 'No longer available')
                : <>{t('flights:card.select', 'Select')} {ICON.arrow}</>}
          </button>

          {/* A failed check says so and offers another go. It never claims the seat is sold:
              the supplier being unreachable tells us nothing about the flight. */}
          {failed && (
            <p className="fl-confirm-msg err" role="status">
              {t('flights:confirm.couldNotCheck', 'Could not check right now. Please try again.')}
            </p>
          )}
          {isGone && (
            <p className="fl-confirm-msg gone" role="status">
              {t('flights:confirm.goneHint', 'This flight was taken while you were looking. Please pick another.')}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Flights() {
  const { t } = useTranslation('flights');
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const ctx = useMemo(() => buildContext(params), [params]);
  // A multi-city trip is priced ONE FLIGHT AT A TIME — the supplier takes a route per call —
  // so the page runs a search per leg and the traveller picks a fare for each. Everything
  // below works on a single search's results, so the rest of the page needs no special case:
  // it is handed whichever leg is being looked at.
  const multi = ctx.tripType === 'multicity' && ctx.legs.length >= 2;
  const searches = useMemo(() => (multi ? legContexts(ctx) : [ctx]), [ctx, multi]);
  const [activeLeg, setActiveLeg] = useState(0);
  // The fare chosen for each leg, by leg index. A trip is complete when every leg has one.
  const [picks, setPicks] = useState({});
  // A new search is a new trip — never carry a fare from the last one into it.
  useEffect(() => { setPicks({}); setActiveLeg(0); }, [ctx]);
  const view = searches[Math.min(activeLeg, searches.length - 1)] || ctx;
  const pickedAll = multi && searches.every((_, i) => picks[i]);
  // Only what the supplier actually returned. This used to fall back to generateFlights() —
  // sixteen invented itineraries at invented prices — whenever the live search came back
  // empty or errored, so a failed API call produced a full page of bookable-looking fares
  // that no supplier had quoted, carrying no flightKey, against which no booking could ever
  // complete. An empty result is now shown as an empty result.
  // One entry per search — a plain trip has exactly one, a multi-city trip one per flight.
  const [legFlights, setLegFlights] = useState(null); // null = not loaded; [][] = per leg
  const allFlights = useMemo(
    () => legFlights?.[Math.min(activeLeg, legFlights.length - 1)] || [],
    [legFlights, activeLeg],
  );

  const priceBounds = useMemo(() => {
    const ps = allFlights.map((f) => f.price);
    return { min: Math.min(...ps, 0), max: Math.max(...ps, 1000) };
  }, [allFlights]);

  const airlineName = useAirlineName();
  const airlineOpts = useMemo(() => {
    const m = new Map();
    allFlights.forEach((f) => m.set(f.out.airlineCode, (m.get(f.out.airlineCode) || 0) + 1));
    return [...m.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }, [allFlights]);

  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('price-asc');
  const [selAirlines, setSelAirlines] = useState(() => new Set());
  const [selStops, setSelStops] = useState(() => new Set());
  const [selSlots, setSelSlots] = useState(() => new Set());
  const [maxPrice, setMaxPrice] = useState(priceBounds.max);
  const [openSec, setOpenSec] = useState({ air: true, stops: true, time: true, price: true });
  const [drawer, setDrawer] = useState(false);
  /**
   * The live check on Select (UI-16): which flight is being checked, and what came back. One at
   * a time, because Select is one choice.
   *
   * Both pieces of state carry the search they belong to and are read as empty when it no longer
   * matches, the way `usePackageAirports` keys its answer. A new search rebuilds the flight ids
   * from scratch, so a "no longer available" from the previous one could otherwise land on a
   * card it was never about. Keying it costs one comparison; clearing it in an effect would
   * cost a second render pass on every search.
   */
  const searchKey = useMemo(
    () => JSON.stringify(searches.map((s) => [s.from?.code, s.to?.code, s.depISO, s.retISO, s.tripType, s.adults, s.children, s.infants])),
    [searches],
  );
  const [confirmRaw, setConfirmRaw] = useState(null);
  const [goneRaw, setGoneRaw] = useState(EMPTY_GONE);
  const confirmState = confirmRaw?.key === searchKey ? confirmRaw : null;
  const gone = goneRaw.key === searchKey ? goneRaw.ids : EMPTY_GONE.ids;
  const setConfirmState = (next) => setConfirmRaw(next ? { ...next, key: searchKey } : null);

  // reset price ceiling whenever the route/search changes
  useEffect(() => { setMaxPrice(priceBounds.max); }, [priceBounds.max]);
  // Flights from the flight cache (UI-16). The cache answers in milliseconds where a live
  // Airtürk search takes ten seconds or more, so the list appears at once; the price is real
  // but indicative and carries no bookable keys until Select confirms it.
  //
  // One request per search context: a plain trip fires one, a multi-city trip fires one per
  // flight, all at once. A leg that comes back empty is an empty leg, not an empty trip — the
  // others still list.
  useEffect(() => {
    const usable = searches.filter((s) => s.from?.code && s.to?.code && s.depISO);
    if (usable.length !== searches.length) { setLegFlights(null); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    Promise.all(searches.map((s, legIdx) =>
      fetchLegFlights(s)
        .then((data) => {
          const raw = data?.results?.airtuerk?.flights || [];
          return badgeFlights(
            raw.map((af, i) => mapAirtuerkFlight(af, s, i))
              .filter(Boolean)
              // Two legs of one trip can share a route, so the mapper's id is not unique
              // across a whole itinerary — the leg it belongs to makes it so.
              .map((fl) => ({ ...fl, id: `${fl.id}-l${legIdx}`, legIndex: legIdx })),
          );
        })
        .catch(() => []),
    )).then((lists) => { if (!cancelled) setLegFlights(lists); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [searches]);

  const toggle = (setter) => (key) => setter((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleAirline = toggle(setSelAirlines);
  const toggleStop = toggle(setSelStops);
  const toggleSlot = toggle(setSelSlots);

  const results = useMemo(() => {
    let data = allFlights.filter((f) => {
      if (selAirlines.size && !selAirlines.has(f.out.airlineCode)) return false;
      if (selStops.size) {
        const sk = f.out.stops >= 2 ? 2 : f.out.stops;
        if (!selStops.has(sk)) return false;
      }
      if (selSlots.size) {
        const dm = hm(f.out.depTime);
        const inSlot = [...selSlots].some((k) => { const s = TIME_SLOTS[k]; return dm >= s.lo && dm < s.hi; });
        if (!inSlot) return false;
      }
      if (f.price > maxPrice) return false;
      return true;
    });
    const byDep = (f) => hm(f.out.depTime);
    data = [...data].sort((a, b) => {
      switch (sort) {
        case 'price-desc': return b.price - a.price;
        case 'dur': return a.totalMin - b.totalMin;
        case 'dep-early': return byDep(a) - byDep(b);
        case 'dep-late': return byDep(b) - byDep(a);
        default: return a.price - b.price;
      }
    });
    return data;
  }, [allFlights, selAirlines, selStops, selSlots, maxPrice, sort]);

  const money = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;

  // On a plain trip, choosing a fare IS the choice and the detail page opens. On a multi-city
  // trip it answers one flight of several, so it stays on this page and moves to the next
  // flight still unanswered — the trip is not complete until every leg has a fare.
  /**
   * Carry a chosen flight forward: on a plain trip the detail page opens, on a multi-city trip
   * it answers one flight of several and the page moves to the next unanswered one.
   */
  const carry = (f) => {
    if (!multi) { navigate(`/flights/${f.id}`, { state: { flight: f, ctx } }); return; }
    const next = { ...picks, [activeLeg]: f };
    setPicks(next);
    const unanswered = searches.findIndex((_, i) => !next[i]);
    if (unanswered >= 0) { setActiveLeg(unanswered); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  /**
   * Select (UI-16). A cached fare is indicative and has no bookable keys, so one live check runs
   * here before the traveller goes any further. A live fare already carries its keys and skips
   * straight through.
   *
   * The live flight from the answer replaces the cached one: it is the priced, bookable
   * itinerary, and checkout uses it unchanged. Carrying the cached object forward would take an
   * indicative price and an empty key list into the booking.
   */
  const onSelect = async (f) => {
    if (!needsConfirm(f)) { carry(f); return; }

    const s = searches[f.legIndex ?? activeLeg] || searches[0];
    setConfirmState({ id: f.id, kind: 'checking' });
    const result = await confirmFlight(f, s);

    if (result.kind === CONFIRMED) {
      setConfirmState(null);
      carry(mergeLive(f, result.flight, s));
      return;
    }
    if (result.kind === PRICE_CHANGED) {
      // The traveller decides. Moving them on at a price they have not seen is the one thing
      // this check exists to prevent.
      setConfirmState({
        id: f.id, kind: 'priceChanged', cached: f,
        flight: mergeLive(f, result.flight, s), livePrice: result.livePrice, difference: result.difference,
      });
      return;
    }
    if (result.kind === NOT_AVAILABLE) {
      setGoneRaw((prev) => ({
        key: searchKey,
        ids: new Set(prev.key === searchKey ? prev.ids : []).add(f.id),
      }));
      setConfirmState({ id: f.id, kind: 'notAvailable' });
      return;
    }
    // SOURCE_ERROR: we could not ask. Never presented as sold out — the seat may well exist.
    setConfirmState({ id: f.id, kind: 'sourceError' });
  };

  /** Continue at the confirmed new price. */
  const acceptPriceChange = () => {
    const s = confirmState;
    if (!s?.flight) return;
    setConfirmState(null);
    carry(s.flight);
  };

  const trip = useMemo(
    () => (pickedAll ? combineTrip(searches.map((_, i) => picks[i]), ctx) : null),
    [pickedAll, picks, searches, ctx],
  );
  const tripTotal = searches.reduce((s, _, i) => s + (picks[i] ? flightTotal(picks[i]) : 0), 0);
  const goTrip = () => { if (trip) navigate(`/flights/${trip.id}`, { state: { flight: trip, ctx } }); };
  const clearAll = () => { setSelAirlines(new Set()); setSelStops(new Set()); setSelSlots(new Set()); setMaxPrice(priceBounds.max); };

  const activeFilters = selAirlines.size + selStops.size + selSlots.size + (maxPrice < priceBounds.max ? 1 : 0);

  // The whole journey as codes — "BRU → IST → AYT". Every leg's arrival in order, behind the
  // first leg's departure, which is the only origin the trip has.
  const chain = multi ? [ctx.legs[0].from, ...ctx.legs.map((l) => l.to)] : [];

  // The strip along the top of the results: one tab per flight of the trip, each saying what
  // it is, and — once answered — which fare answered it. It is the page's spine, so it also
  // carries the state: done, being chosen now, or still to do.
  const legTabs = multi && (
    <div className="fl-legtabs" role="tablist" aria-label={t('flights:legTabs.ariaLabel', 'Flights in this trip')}>
      {searches.map((s, i) => {
        const p = picks[i];
        const on = i === activeLeg;
        return (
          <button
            key={i}
            role="tab"
            aria-selected={on}
            className={`fl-legtab${on ? ' on' : ''}${p ? ' done' : ''}`}
            onClick={() => setActiveLeg(i)}
          >
            <span className="fl-legtab-n">{p ? ICON.check : i + 1}</span>
            <span className="fl-legtab-txt">
              <span className="fl-legtab-route">{s.from.code} <em>→</em> {s.to.code}</span>
              <span className="fl-legtab-sub">
                {p
                  ? `${p.out.airline} · ${p.out.depTime} · ${money(p.price)}`
                  : `${fmtDateShort(s.depISO)} · ${legFlights?.[i]?.length ?? '—'} fares`}
              </span>
            </span>
            {p && <span className="fl-legtab-edit">{ICON.edit}</span>}
          </button>
        );
      })}
    </div>
  );

  // The trip as it stands, above the filters: what has been chosen, what it adds up to, and
  // the way on once nothing is missing.
  const tripCard = multi && (
    <div className="fl-trip">
      <div className="fl-trip-head">
        <h3 className="hd">{t('flights:trip.title', 'Your trip')}</h3>
        <span className="fl-trip-count">{Object.keys(picks).length}/{searches.length} {t('flights:trip.chosen', 'chosen')}</span>
      </div>
      {searches.map((s, i) => {
        const p = picks[i];
        return (
          <button
            key={i}
            className={`fl-trip-row${i === activeLeg ? ' on' : ''}`}
            onClick={() => setActiveLeg(i)}
          >
            <span className="fl-trip-route">{s.from.code} → {s.to.code}</span>
            <span className="fl-trip-when">
              {p ? `${fmtDateShort(s.depISO)} · ${p.out.depTime}` : fmtDateShort(s.depISO)}
            </span>
            <span className={`fl-trip-fare${p ? '' : ' none'}`}>
              {p ? money(flightTotal(p)) : t('flights:trip.choose', 'Choose')}
            </span>
          </button>
        );
      })}
      <div className="fl-trip-total">
        <span>{pickedAll ? t('flights:trip.total', 'Trip total') : t('flights:trip.soFar', 'So far')}</span>
        <b>{money(tripTotal)}</b>
      </div>
      {/* Said plainly, because it is the one thing about this page that is not obvious: the
          supplier prices a route at a time, so this is separate one-way fares added up, not
          one through-fare for the whole journey. */}
      <p className="fl-trip-note">
        {t('flights:trip.note', { pax: paxLabel(ctx), defaultValue: 'Each flight is priced and booked as its own one-way fare. The total is the sum of them, for {{pax}}.' })}
      </p>
      <button className="fl-trip-cta" disabled={!pickedAll} onClick={goTrip}>
        {pickedAll
          ? <>{t('flights:trip.continue', 'Continue')} {ICON.arrow}</>
          : t('flights:trip.chooseMore', { count: searches.length - Object.keys(picks).length, defaultValue_one: 'Choose {{count}} more flight', defaultValue_other: 'Choose {{count}} more flights' })}
      </button>
    </div>
  );

  const stopFilterOptions = [
    { k: 0, l: t('flights:filters.nonstop', 'Non-stop') },
    { k: 1, l: t('flights:filters.oneStop', '1 Stop') },
    { k: 2, l: t('flights:filters.twoOrMoreStops', '2 Stops or more') },
  ];
  const filters = (
    <div className="fl-fcard">
      <Section title={t('flights:filters.airlines', 'Airlines')} open={openSec.air} onToggle={() => setOpenSec((s) => ({ ...s, air: !s.air }))}>
        {airlineOpts.map((a) => (
          <label className="fl-check" key={a.code}>
            <input type="checkbox" checked={selAirlines.has(a.code)} onChange={() => toggleAirline(a.code)} />
            <span>{airlineName(a.code)}</span><span className="fl-check-n">{a.count}</span>
          </label>
        ))}
      </Section>
      <Section title={t('flights:filters.stopsTitle', { from: view.from.code, to: view.to.code, defaultValue: '{{from}} → {{to}} Stops' })} open={openSec.stops} onToggle={() => setOpenSec((s) => ({ ...s, stops: !s.stops }))}>
        {stopFilterOptions.map((o) => (
          <label className="fl-check" key={o.k}>
            <input type="checkbox" checked={selStops.has(o.k)} onChange={() => toggleStop(o.k)} />
            <span>{o.l}</span>
            <span className="fl-check-n">{allFlights.filter((f) => (f.out.stops >= 2 ? 2 : f.out.stops) === o.k).length}</span>
          </label>
        ))}
      </Section>
      <Section title={t('flights:filters.departureFrom', { from: view.from.code, defaultValue: 'Departure from {{from}}' })} open={openSec.time} onToggle={() => setOpenSec((s) => ({ ...s, time: !s.time }))}>
        <div className="fl-slots">
          {TIME_SLOTS.map((s) => (
            <button key={s.key} className={`fl-slot${selSlots.has(s.key) ? ' on' : ''}`} onClick={() => toggleSlot(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('flights:filters.maxPrice', 'Max price')} open={openSec.price} onToggle={() => setOpenSec((s) => ({ ...s, price: !s.price }))}>
        <input
          type="range" className="fl-range"
          min={priceBounds.min} max={priceBounds.max} step={5}
          value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
          style={{ '--fill': `${((maxPrice - priceBounds.min) / ((priceBounds.max - priceBounds.min) || 1)) * 100}%` }}
        />
        <div className="fl-range-labels">
          <span>{money(priceBounds.min)}</span>
          <span className="fl-range-cur">{t('flights:filters.upTo', { amount: money(maxPrice), defaultValue: 'Up to {{amount}}' })}</span>
          <span>{money(priceBounds.max)}</span>
        </div>
      </Section>
    </div>
  );

  return (
    <div className="fl">
      {/* hero — the transparent navbar blends into this */}
      <header className="fl-hero">
        <span className="fl-hero-glow" />
        <span className="fl-hero-glow2" />
        <span className="fl-hero-grid" />
        <div className="fl-hero-in">
          <div className="fl-bc">
            <Link to="/">{t('common:nav.home', 'Home')}</Link><span className="fl-bc-sep">›</span>
            <Link to="/">{t('common:nav.services.flights', 'Flights')}</Link><span className="fl-bc-sep">›</span>
            <span className="fl-bc-here">{multi ? chain.join(' → ') : `${ctx.from.code} → ${ctx.to.code}`}</span>
          </div>
          <h1 className="fl-hero-title">
            {multi
              ? <>{t('flights:hero.tripThrough', 'Your trip through')} <em>{ctx.legs.map((l) => l.to).map((c) => c).join(', ')}</em></>
              : <>{t('flights:hero.flightsTo', 'Flights to')} <em>{ctx.to.city}</em></>}
          </h1>
          <div className="fl-hero-chips">
            {multi ? (
              <>
                <span className="fl-hchip">{ICON.plane} {chain.join(' → ')}</span>
                <span className="fl-hchip">{ICON.cal} {fmtDateShort(ctx.legs[0].date)} – {fmtDateShort(ctx.legs[ctx.legs.length - 1].date)}</span>
                <span className="fl-hchip">{t('flights:hero.flightsCount', { count: searches.length, defaultValue_one: '{{count}} flight', defaultValue_other: '{{count}} flights' })}</span>
              </>
            ) : (
              <>
                <span className="fl-hchip">{ICON.plane} {ctx.from.code} <span className="fl-hchip-arrow">{ICON.swap}</span> {ctx.to.code}</span>
                <span className="fl-hchip">{ICON.cal} {fmtDateShort(ctx.depISO)}{ctx.retISO ? ` – ${fmtDateShort(ctx.retISO)}` : ''}</span>
                <span className="fl-hchip">{ctx.tripType === 'oneway' ? t('home:hero.flights.oneway', 'One way') : t('home:hero.flights.roundtrip', 'Round trip')}</span>
              </>
            )}
            <span className="fl-hchip">{ICON.users} {paxLabel(ctx)}</span>
            <span className="fl-hchip fl-hchip-cabin">{cabinLabel(ctx.cabin)}</span>
          </div>
        </div>
      </header>

      {/* toolbar — glass, overlaps the hero edge */}
      <div className="fl-toolbar">
        <div className="fl-toolbar-in">
          <div className="fl-count hd">
            {loading ? <span className="fl-count-load"><span className="fl-count-dot" /> {t('flights:toolbar.searching', 'Searching…')}</span>
              : (
                <>
                  {multi && <span className="fl-count-leg">{t('flights:toolbar.legProgress', { n: activeLeg + 1, total: searches.length, defaultValue: 'Flight {{n}} of {{total}}' })} · {view.from.code} → {view.to.code}</span>}
                  <span>{results.length}</span> {t('flights:toolbar.of', 'of')} {allFlights.length} {t('flights:toolbar.flights', 'flights')}
                </>
              )}
          </div>
          <div className="fl-summary-right">
            <button className="fl-mfilter" onClick={() => setDrawer(true)}>{ICON.filter} {t('flights:toolbar.filters', 'Filters')}{activeFilters > 0 && <em>{activeFilters}</em>}</button>
            <div className="fl-sortwrap">
              <span className="fl-sortlbl">{t('flights:toolbar.sort', 'Sort')}</span>
              <select className="fl-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                {sortOptions().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="fl-main">
        <aside className="fl-sidebar">
          {tripCard}
          {activeFilters > 0 && (
            <button className="fl-clear" onClick={clearAll}>{ICON.x} {t('flights:filters.clearAllCount', { count: activeFilters, defaultValue: 'Clear all filters ({{count}})' })}</button>
          )}
          {filters}
        </aside>

        <section className="fl-results">
          {/* Second copy of the trip card, for the widths where the sidebar is not shown at
              all. Without it the running total and the way on would simply be missing on a
              phone, which is where most of these searches are run. */}
          {tripCard && <div className="fl-trip-mob">{tripCard}</div>}
          {legTabs}
          {loading ? (
            [0, 1, 2, 3].map((i) => (
              <div className="fl-skel" key={i}>
                <div className="fl-skel-legs">
                  <div className="fl-skel-line w60" /><div className="fl-skel-line w40" />
                  <div className="fl-skel-line w80" /><div className="fl-skel-line w50" />
                </div>
                <div className="fl-skel-price" />
              </div>
            ))
          ) : results.length === 0 ? (
            <div className="fl-empty">
              <div className="fl-empty-ic">{ICON.plane}</div>
              <h3>{allFlights.length === 0
                ? (multi
                  ? t('flights:empty.noFlightsMultiTitle', { from: view.from.code, to: view.to.code, date: fmtDateShort(view.depISO), defaultValue: 'No flights for {{from}} → {{to}} on {{date}}' })
                  : t('flights:empty.noFlightsTitle', 'No flights for this route and date'))
                : t('flights:empty.noMatchTitle', 'No flights match your filters')}</h3>
              <p>{allFlights.length === 0
                ? (multi
                  ? t('flights:empty.noFlightsMultiBody', 'This flight of the trip has no fare on that date. Change its date or airports in the search above, and the rest of the trip stays as it is.')
                  : t('flights:empty.noFlightsBody', 'We could not find a fare for this search. Try another date, or a different departure airport.'))
                : t('flights:empty.noMatchBody', 'Try widening your price range or clearing a filter.')}</p>
              {activeFilters > 0 && <button className="fl-empty-btn" onClick={clearAll}>{t('flights:filters.clearAll', 'Clear all filters')}</button>}
            </div>
          ) : (
            results.map((f, i) => (
              <div key={f.id} style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }} className="fl-card-wrap">
                <FlightCard
                  f={f}
                  onSelect={onSelect}
                  money={money}
                  state={confirmState?.id === f.id ? confirmState : null}
                  isGone={gone.has(f.id)}
                />
              </div>
            ))
          )}
        </section>
      </div>

      {/* mobile drawer */}
      {drawer && (
        <>
          <div className="fl-drawer-ov" onClick={() => setDrawer(false)} />
          <div className="fl-drawer">
            <div className="fl-drawer-head">
              <h2 className="hd">{t('flights:toolbar.filters', 'Filters')}</h2>
              <button className="fl-drawer-x" onClick={() => setDrawer(false)}>{ICON.x}</button>
            </div>
            <div className="fl-drawer-body">{filters}</div>
            <div className="fl-drawer-foot">
              <button className="fl-drawer-apply" onClick={() => setDrawer(false)}>{t('flights:drawer.show', { count: results.length, defaultValue: 'Show {{count}} flights' })}</button>
            </div>
          </div>
        </>
      )}

      {/* The live check found the flight at another price (UI-16). The contract says show the
          new price, then continue — so it is shown, and continuing stays the traveller's click.
          Built into the page rather than a browser confirm dialog. */}
      {confirmState?.kind === 'priceChanged' && (
        <>
          <div className="fl-drawer-ov" onClick={() => setConfirmState(null)} />
          <div className="fl-pricechg" role="dialog" aria-modal="true" aria-labelledby="fl-pricechg-h">
            <h2 className="hd" id="fl-pricechg-h">
              {t('flights:confirm.priceChangedTitle', 'The price has changed')}
            </h2>
            <p className="fl-pricechg-lede">
              {t(
                'flights:confirm.priceChangedLede',
                'This flight is still available, but the airline is now asking a different fare.',
              )}
            </p>
            <div className="fl-pricechg-rows">
              <div className="fl-pricechg-row">
                <span>{t('flights:confirm.priceWas', 'Price shown')}</span>
                <s>{money(flightTotal(confirmState.cached))}</s>
              </div>
              <div className="fl-pricechg-row now">
                <span>{t('flights:confirm.priceNow', 'Price now')}</span>
                <b>{money(confirmState.livePrice ?? flightTotal(confirmState.flight))}</b>
              </div>
            </div>
            <div className="fl-pricechg-btns">
              <button className="fl-pricechg-back" onClick={() => setConfirmState(null)}>
                {t('flights:confirm.backToList', 'Back to the list')}
              </button>
              <button className="fl-pricechg-go" onClick={acceptPriceChange}>
                {t('flights:confirm.continueAt', 'Continue at this price')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
