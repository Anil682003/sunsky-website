import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ScopePicker.module.css';
import { fetchDestinations, fetchZones } from '../../api/filters';

/**
 * Cascading Where-picker for the results sidebar: countries → cities → zones.
 *
 * Each level unlocks the next and is its own collapsible step, so a narrow sidebar
 * shows one searchable list at a time instead of three stacked ones. Cities are
 * grouped under their country (with flag), zones under their city.
 *
 * The parent owns the committed scope; this component drafts locally and calls
 * onApply({ countries, destinations, zones }) when the traveller commits.
 */

const Chevron = ({ open }) => (
  <svg className={`${styles.chev} ${open ? styles.chevOpen : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

const Tick = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

function Flag({ flagUrl, flag }) {
  return flagUrl
    ? <img className={styles.flag} src={flagUrl} alt="" loading="lazy" />
    : <span className={styles.flag} data-emoji="true">{flag || '\u{1F3F3}️'}</span>;
}

/** One selectable row with a checkbox tick. */
function Row({ label, sub, checked, onToggle, flagUrl, flag }) {
  return (
    <button type="button" className={`${styles.row} ${checked ? styles.rowOn : ''}`} onClick={onToggle}>
      <span className={`${styles.tick} ${checked ? styles.tickOn : ''}`}>{checked && <Tick />}</span>
      {(flagUrl || flag) && <Flag flagUrl={flagUrl} flag={flag} />}
      <span className={styles.rowName}>{label}</span>
      {sub != null && <em className={styles.rowSub}>{sub}</em>}
    </button>
  );
}

/** A collapsible cascade step. */
function Step({ n, title, hint, count, open, onToggle, disabled, children }) {
  return (
    <div className={`${styles.step} ${open ? styles.stepOpen : ''} ${disabled ? styles.stepOff : ''}`}>
      <button type="button" className={styles.stepHead} onClick={disabled ? undefined : onToggle} aria-expanded={open}>
        <span className={`${styles.stepNum} ${count > 0 ? styles.stepNumOn : ''}`}>{count > 0 ? count : n}</span>
        <span className={styles.stepText}>
          <span className={styles.stepTitle}>{title}</span>
          <span className={styles.stepHint}>{hint}</span>
        </span>
        {!disabled && <Chevron open={open} />}
      </button>
      {open && !disabled && <div className={styles.stepBody}>{children}</div>}
    </div>
  );
}

export default function ScopePicker({
  countries = [],
  status = 'ok',
  value = { countries: [], destinations: [], zones: [] },
  onApply,
}) {
  const [draftCountries, setDraftCountries] = useState(() => new Set(value.countries));
  const [draftCities, setDraftCities]       = useState(() => new Set(value.destinations));
  const [draftZones, setDraftZones]         = useState(() => new Set(value.zones));
  const [step, setStep] = useState(1);

  const [citySearch, setCitySearch]       = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [zoneSearch, setZoneSearch]       = useState('');

  const [cities, setCities]         = useState([]);
  const [citiesBusy, setCitiesBusy] = useState(false);
  const [zones, setZones]           = useState([]);
  const [zonesBusy, setZonesBusy]   = useState(false);

  // Re-seed the draft whenever the committed scope changes (back/forward nav).
  const committedKey = `${value.countries.join(',')}|${value.destinations.join(',')}|${(value.zones || []).join(',')}`;
  const [prevKey, setPrevKey] = useState(committedKey);
  if (prevKey !== committedKey) {
    setPrevKey(committedKey);
    setDraftCountries(new Set(value.countries));
    setDraftCities(new Set(value.destinations));
    setDraftZones(new Set(value.zones || []));
  }

  const countryKey = useMemo(() => [...draftCountries].sort().join(','), [draftCountries]);
  const cityKey    = useMemo(() => [...draftCities].sort().join(','), [draftCities]);

  // Cities for every ticked country, in one request.
  const cityReq = useRef(0);
  useEffect(() => {
    if (!countryKey) { setCities([]); return; }
    const seq = ++cityReq.current;
    setCitiesBusy(true);
    fetchDestinations(countryKey.split(','))
      .then((d) => { if (seq === cityReq.current) setCities(d); })
      .catch(() => { if (seq === cityReq.current) setCities([]); })
      .finally(() => { if (seq === cityReq.current) setCitiesBusy(false); });
  }, [countryKey]);

  // Zones for every ticked city.
  const zoneReq = useRef(0);
  useEffect(() => {
    if (!cityKey) { setZones([]); return; }
    const seq = ++zoneReq.current;
    setZonesBusy(true);
    fetchZones(cityKey.split(','))
      .then((z) => { if (seq === zoneReq.current) setZones(z); })
      .catch(() => { if (seq === zoneReq.current) setZones([]); })
      .finally(() => { if (seq === zoneReq.current) setZonesBusy(false); });
  }, [cityKey]);

  // Dropping a country drops the cities it owned; dropping a city drops its zones.
  const toggleCountry = (code) => setDraftCountries((prev) => {
    const next = new Set(prev);
    if (next.has(code)) {
      next.delete(code);
      const orphan = new Set(cities.filter((c) => c.countryCode === code).map((c) => c.code));
      if (orphan.size) {
        setDraftCities((cs) => new Set([...cs].filter((c) => !orphan.has(c))));
        setDraftZones((zs) => new Set([...zs].filter((z) => !zones.some((zz) => zz.zoneCode === z && orphan.has(zz.destinationCode)))));
      }
    } else next.add(code);
    return next;
  });

  const toggleCity = (code) => setDraftCities((prev) => {
    const next = new Set(prev);
    if (next.has(code)) {
      next.delete(code);
      setDraftZones((zs) => new Set([...zs].filter((z) => !zones.some((zz) => zz.zoneCode === z && zz.destinationCode === code))));
    } else next.add(code);
    return next;
  });

  const toggleZone = (code) => setDraftZones((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });

  const clearAll = () => { setDraftCountries(new Set()); setDraftCities(new Set()); setDraftZones(new Set()); setStep(1); };

  const nameOfCountry = (code) => countries.find((c) => c.code === code)?.name || code;
  const nameOfCity    = (code) => cities.find((c) => c.code === code)?.name || code;
  const nameOfZone    = (code) => zones.find((z) => z.zoneCode === code)?.name || code;

  const match = (q) => (s) => !q || String(s).toLowerCase().includes(q.toLowerCase());

  const shownCountries = countries.filter((c) => match(countrySearch)(c.name) || match(countrySearch)(c.code));

  // Cities grouped under their country, search applied inside each group.
  const cityGroups = useMemo(() => {
    const q = citySearch.trim();
    const byCountry = new Map();
    for (const c of cities) {
      if (q && !match(q)(c.name) && !match(q)(c.code)) continue;
      const g = byCountry.get(c.countryCode) || { code: c.countryCode, name: c.countryName, flag: c.flag, flagUrl: c.flagUrl, items: [] };
      g.items.push(c);
      byCountry.set(c.countryCode, g);
    }
    return [...byCountry.values()];
  }, [cities, citySearch]);

  // Zones grouped under their city.
  const zoneGroups = useMemo(() => {
    const q = zoneSearch.trim();
    const byCity = new Map();
    for (const z of zones) {
      if (q && !match(q)(z.name)) continue;
      const g = byCity.get(z.destinationCode) || { code: z.destinationCode, name: z.destinationName, items: [] };
      g.items.push(z);
      byCity.set(z.destinationCode, g);
    }
    return [...byCity.values()];
  }, [zones, zoneSearch]);

  const total = draftCountries.size + draftCities.size + draftZones.size;
  const dirty =
    countryKey !== [...value.countries].sort().join(',') ||
    cityKey !== [...value.destinations].sort().join(',') ||
    [...draftZones].sort().join(',') !== [...(value.zones || [])].sort().join(',');

  if (status === 'error') return <p className={styles.note}>Destination filter unavailable.</p>;
  if (!countries.length) return <p className={styles.note}>Loading countries&hellip;</p>;

  return (
    <div className={styles.wrap}>
      {total > 0 && (
        <div className={styles.chips}>
          {[...draftCountries].map((c) => {
            const meta = countries.find((x) => x.code === c);
            return (
              <span className={`${styles.chip} ${styles.chipCountry}`} key={`c-${c}`}>
                {meta && <Flag flagUrl={meta.flagUrl} flag={meta.flag} />}
                {nameOfCountry(c)}
                <button className={styles.chipX} onClick={() => toggleCountry(c)} aria-label={`Remove ${nameOfCountry(c)}`}>&times;</button>
              </span>
            );
          })}
          {[...draftCities].map((c) => (
            <span className={`${styles.chip} ${styles.chipCity}`} key={`d-${c}`}>
              {nameOfCity(c)}
              <button className={styles.chipX} onClick={() => toggleCity(c)} aria-label={`Remove ${nameOfCity(c)}`}>&times;</button>
            </span>
          ))}
          {[...draftZones].map((z) => (
            <span className={`${styles.chip} ${styles.chipZone}`} key={`z-${z}`}>
              {nameOfZone(z)}
              <button className={styles.chipX} onClick={() => toggleZone(z)} aria-label={`Remove ${nameOfZone(z)}`}>&times;</button>
            </span>
          ))}
          <button type="button" className={styles.clearAll} onClick={clearAll}>Clear</button>
        </div>
      )}

      <Step
        n="1" title="Countries" count={draftCountries.size}
        hint={draftCountries.size ? `${draftCountries.size} selected` : 'Pick where to fly'}
        open={step === 1} onToggle={() => setStep(step === 1 ? 0 : 1)}
      >
        <input
          className={styles.search} type="text" placeholder="Search countries…"
          value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
        />
        <div className={styles.list}>
          {shownCountries.length === 0 && <p className={styles.note}>No match.</p>}
          {shownCountries.map((c) => (
            <Row
              key={c.code} label={c.name} flagUrl={c.flagUrl} flag={c.flag}
              checked={draftCountries.has(c.code)} onToggle={() => toggleCountry(c.code)}
            />
          ))}
        </div>
      </Step>

      <Step
        n="2" title="Cities" count={draftCities.size} disabled={draftCountries.size === 0}
        hint={draftCountries.size === 0 ? 'Pick a country first'
          : citiesBusy ? 'Loading…'
          : draftCities.size ? `${draftCities.size} selected`
          : `${cities.length} available — all by default`}
        open={step === 2} onToggle={() => setStep(step === 2 ? 0 : 2)}
      >
        <input
          className={styles.search} type="text" placeholder="Search cities…"
          value={citySearch} onChange={(e) => setCitySearch(e.target.value)}
        />
        <div className={styles.list}>
          {citiesBusy && <p className={styles.note}>Loading cities&hellip;</p>}
          {!citiesBusy && cityGroups.length === 0 && <p className={styles.note}>No cities match.</p>}
          {cityGroups.map((g) => (
            <div className={styles.group} key={g.code}>
              <div className={styles.groupHead}>
                <Flag flagUrl={g.flagUrl} flag={g.flag} />
                {g.name}
                <em className={styles.groupCount}>{g.items.length}</em>
              </div>
              {g.items.map((c) => (
                <Row key={c.code} label={c.name} checked={draftCities.has(c.code)} onToggle={() => toggleCity(c.code)} />
              ))}
            </div>
          ))}
        </div>
      </Step>

      <Step
        n="3" title="Areas" count={draftZones.size} disabled={draftCities.size === 0}
        hint={draftCities.size === 0 ? 'Pick a city first'
          : zonesBusy ? 'Loading…'
          : draftZones.size ? `${draftZones.size} selected`
          : zones.length ? `${zones.length} available` : 'None listed'}
        open={step === 3} onToggle={() => setStep(step === 3 ? 0 : 3)}
      >
        <input
          className={styles.search} type="text" placeholder="Search areas…"
          value={zoneSearch} onChange={(e) => setZoneSearch(e.target.value)}
        />
        <div className={styles.list}>
          {zonesBusy && <p className={styles.note}>Loading areas&hellip;</p>}
          {!zonesBusy && zoneGroups.length === 0 && <p className={styles.note}>No areas listed for these cities.</p>}
          {zoneGroups.map((g) => (
            <div className={styles.group} key={g.code}>
              <div className={styles.groupHead}>
                {g.name}
                <em className={styles.groupCount}>{g.items.length}</em>
              </div>
              {g.items.map((z) => (
                <Row key={z.zoneCode} label={z.name} checked={draftZones.has(z.zoneCode)} onToggle={() => toggleZone(z.zoneCode)} />
              ))}
            </div>
          ))}
        </div>
      </Step>

      <button
        type="button" className={styles.apply}
        disabled={!dirty || total === 0}
        onClick={() => onApply({ countries: [...draftCountries], destinations: [...draftCities], zones: [...draftZones] })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        {total === 0 ? 'Pick a destination' : `Search ${total} place${total === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
