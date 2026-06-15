import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import './Flights.css';
import axiosInstance from '../../services/axiosInstance';
import { buildContext, generateFlights, paxLabel, fmtDateShort, mapAirtuerkFlight, badgeFlights } from './flightData';

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
};

const TIME_SLOTS = [
  { key: 0, label: '00–06', lo: 0, hi: 360 },
  { key: 1, label: '06–12', lo: 360, hi: 720 },
  { key: 2, label: '12–18', lo: 720, hi: 1080 },
  { key: 3, label: '18–00', lo: 1080, hi: 1440 },
];
const SORTS = [
  { v: 'price-asc', l: 'Price: Low to High' },
  { v: 'price-desc', l: 'Price: High to Low' },
  { v: 'dur', l: 'Duration: Shortest' },
  { v: 'dep-early', l: 'Departure: Earliest' },
  { v: 'dep-late', l: 'Departure: Latest' },
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

function FlightCard({ f, onSelect, money }) {
  const Leg = ({ leg, tag }) => (
    <div className="fl-leg">
      <div className="fl-leg-air">
        <span className="fl-leg-logo" style={{ background: leg.color }}>{leg.airlineCode}</span>
        <span className="fl-leg-name">{leg.airline}</span>
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
  return (
    <article className="fl-card">
      {f.badge && <span className={`fl-badge ${f.badge.replace(/\s/g, '').toLowerCase()}`}>{f.badge === 'Fastest' && ICON.bolt} {f.badge}</span>}
      <div className="fl-card-in">
        <div className="fl-card-legs">
          <Leg leg={f.out} tag="Outbound" />
          {f.ret && <><div className="fl-legs-div" /><Leg leg={f.ret} tag="Return" /></>}
        </div>
        <div className="fl-card-price">
          {f.origPrice > f.price && <div className="fl-price-was">{money(f.origPrice)}</div>}
          <div className="fl-price">{money(f.price)}</div>
          <div className="fl-price-sub">{f.pax > 1 ? `per person · ${money(f.price * f.pax)} total` : 'per person'}</div>
          <button className="fl-select" onClick={() => onSelect(f)}>Select {ICON.arrow}</button>
        </div>
      </div>
    </article>
  );
}

export default function Flights() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const ctx = useMemo(() => buildContext(params), [params]);
  const generated = useMemo(() => generateFlights(ctx), [ctx]);
  const [apiFlights, setApiFlights] = useState(null); // null = not loaded; [] = none/failed
  const live = Array.isArray(apiFlights) && apiFlights.length > 0;
  const allFlights = live ? apiFlights : generated;

  const priceBounds = useMemo(() => {
    const ps = allFlights.map((f) => f.price);
    return { min: Math.min(...ps, 0), max: Math.max(...ps, 1000) };
  }, [allFlights]);

  const airlineOpts = useMemo(() => {
    const m = new Map();
    allFlights.forEach((f) => m.set(f.out.airline, (m.get(f.out.airline) || 0) + 1));
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [allFlights]);

  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('price-asc');
  const [selAirlines, setSelAirlines] = useState(() => new Set());
  const [selStops, setSelStops] = useState(() => new Set());
  const [selSlots, setSelSlots] = useState(() => new Set());
  const [maxPrice, setMaxPrice] = useState(priceBounds.max);
  const [openSec, setOpenSec] = useState({ air: true, stops: true, time: true, price: true });
  const [drawer, setDrawer] = useState(false);

  // reset price ceiling whenever the route/search changes
  useEffect(() => { setMaxPrice(priceBounds.max); }, [priceBounds.max]);
  // Live flights from the Airtürk availability API; fall back to sample results.
  useEffect(() => {
    if (!ctx.from?.code || !ctx.to?.code || !ctx.depISO) { setApiFlights(null); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    axiosInstance.post('/flight-availability/search', {
      from: ctx.from.code, to: ctx.to.code, depdate: ctx.depISO,
      retdate: ctx.tripType === 'roundtrip' ? ctx.retISO : undefined,
      adults: ctx.adults, children: ctx.children, infants: ctx.infants,
    }).then(({ data }) => {
      if (cancelled) return;
      const raw = data?.results?.airtuerk?.flights || [];
      const mapped = badgeFlights(raw.map((af, i) => mapAirtuerkFlight(af, ctx, i)).filter(Boolean));
      setApiFlights(mapped);
    }).catch(() => { if (!cancelled) setApiFlights([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ctx]);

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
      if (selAirlines.size && !selAirlines.has(f.out.airline)) return false;
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
  const onSelect = (f) => navigate(`/flights/${f.id}`, { state: { flight: f, ctx } });
  const clearAll = () => { setSelAirlines(new Set()); setSelStops(new Set()); setSelSlots(new Set()); setMaxPrice(priceBounds.max); };

  const activeFilters = selAirlines.size + selStops.size + selSlots.size + (maxPrice < priceBounds.max ? 1 : 0);

  const filters = (
    <div className="fl-fcard">
      <Section title="Airlines" open={openSec.air} onToggle={() => setOpenSec((s) => ({ ...s, air: !s.air }))}>
        {airlineOpts.map((a) => (
          <label className="fl-check" key={a.name}>
            <input type="checkbox" checked={selAirlines.has(a.name)} onChange={() => toggleAirline(a.name)} />
            <span>{a.name}</span><span className="fl-check-n">{a.count}</span>
          </label>
        ))}
      </Section>
      <Section title={`${ctx.from.code} → ${ctx.to.code} Stops`} open={openSec.stops} onToggle={() => setOpenSec((s) => ({ ...s, stops: !s.stops }))}>
        {[{ k: 0, l: 'Non-stop' }, { k: 1, l: '1 Stop' }, { k: 2, l: '2 Stops or more' }].map((o) => (
          <label className="fl-check" key={o.k}>
            <input type="checkbox" checked={selStops.has(o.k)} onChange={() => toggleStop(o.k)} />
            <span>{o.l}</span>
            <span className="fl-check-n">{allFlights.filter((f) => (f.out.stops >= 2 ? 2 : f.out.stops) === o.k).length}</span>
          </label>
        ))}
      </Section>
      <Section title={`Departure from ${ctx.from.code}`} open={openSec.time} onToggle={() => setOpenSec((s) => ({ ...s, time: !s.time }))}>
        <div className="fl-slots">
          {TIME_SLOTS.map((s) => (
            <button key={s.key} className={`fl-slot${selSlots.has(s.key) ? ' on' : ''}`} onClick={() => toggleSlot(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Max price" open={openSec.price} onToggle={() => setOpenSec((s) => ({ ...s, price: !s.price }))}>
        <input
          type="range" className="fl-range"
          min={priceBounds.min} max={priceBounds.max} step={5}
          value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
          style={{ '--fill': `${((maxPrice - priceBounds.min) / ((priceBounds.max - priceBounds.min) || 1)) * 100}%` }}
        />
        <div className="fl-range-labels">
          <span>{money(priceBounds.min)}</span>
          <span className="fl-range-cur">Up to {money(maxPrice)}</span>
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
            <Link to="/">Home</Link><span className="fl-bc-sep">›</span>
            <Link to="/">Flights</Link><span className="fl-bc-sep">›</span>
            <span className="fl-bc-here">{ctx.from.code} → {ctx.to.code}</span>
          </div>
          <h1 className="fl-hero-title">Flights to <em>{ctx.to.city}</em></h1>
          <div className="fl-hero-chips">
            <span className="fl-hchip">{ICON.plane} {ctx.from.code} <span className="fl-hchip-arrow">{ICON.swap}</span> {ctx.to.code}</span>
            <span className="fl-hchip">{ICON.cal} {fmtDateShort(ctx.depISO)}{ctx.retISO ? ` – ${fmtDateShort(ctx.retISO)}` : ''}</span>
            <span className="fl-hchip">{ctx.tripType === 'oneway' ? 'One way' : 'Round trip'}</span>
            <span className="fl-hchip">{ICON.users} {paxLabel(ctx)}</span>
            <span className="fl-hchip fl-hchip-cabin">{ctx.cabin}</span>
          </div>
        </div>
      </header>

      {/* toolbar — glass, overlaps the hero edge */}
      <div className="fl-toolbar">
        <div className="fl-toolbar-in">
          <div className="fl-count hd">
            {loading ? <span className="fl-count-load"><span className="fl-count-dot" /> Searching…</span>
              : <><span>{results.length}</span> of {allFlights.length} flights</>}
          </div>
          <div className="fl-summary-right">
            <button className="fl-mfilter" onClick={() => setDrawer(true)}>{ICON.filter} Filters{activeFilters > 0 && <em>{activeFilters}</em>}</button>
            <div className="fl-sortwrap">
              <span className="fl-sortlbl">Sort</span>
              <select className="fl-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="fl-main">
        <aside className="fl-sidebar">
          {activeFilters > 0 && (
            <button className="fl-clear" onClick={clearAll}>{ICON.x} Clear all filters ({activeFilters})</button>
          )}
          {filters}
        </aside>

        <section className="fl-results">
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
              <h3>No flights match your filters</h3>
              <p>Try widening your price range or clearing a filter.</p>
              {activeFilters > 0 && <button className="fl-empty-btn" onClick={clearAll}>Clear all filters</button>}
            </div>
          ) : (
            results.map((f, i) => (
              <div key={f.id} style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }} className="fl-card-wrap">
                <FlightCard f={f} onSelect={onSelect} money={money} />
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
              <h2 className="hd">Filters</h2>
              <button className="fl-drawer-x" onClick={() => setDrawer(false)}>{ICON.x}</button>
            </div>
            <div className="fl-drawer-body">{filters}</div>
            <div className="fl-drawer-foot">
              <button className="fl-drawer-apply" onClick={() => setDrawer(false)}>Show {results.length} flights</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
