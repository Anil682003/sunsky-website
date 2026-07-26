import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ScopePicker.module.css';
import { fetchDestinations, fetchZones } from '../../api/filters';

/**
 * Where-picker for the results sidebar, built as a ROUTE: country → city → area,
 * three stations strung along a dotted flight path. Each station opens one
 * searchable list, so the rail never stacks three scrolling lists at once.
 *
 * Cities are fetched for every ticked country in a single call and grouped under
 * country headers; areas group under their city. Codes (PMI, AYT) ride on the
 * right of each row — the same boarding-pass language the rest of the site uses.
 *
 * The parent owns the committed scope; this drafts locally and calls
 * onApply({ countries, destinations, zones }) on commit.
 */

// zoneCode is unique only inside a destination, so a picked area is keyed by both:
// "AYT:16". Anything less collides with the same number in another city.
const zoneKey  = (z) => `${z.destinationCode}:${z.zoneCode}`;
const zoneCity = (key) => String(key).split(':')[0];

const Tick = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

function Flag({ flagUrl, flag, className }) {
  return flagUrl
    ? <img className={className || styles.flag} src={flagUrl} alt="" loading="lazy" />
    : <span className={className || styles.flag} data-emoji="true">{flag || '\u{1F3F3}️'}</span>;
}

/** One selectable row: tick, optional flag, name, and its code as a tag. */
function Row({ label, code, checked, onToggle, flagUrl, flag }) {
  return (
    <button type="button" className={`${styles.row} ${checked ? styles.rowOn : ''}`} onClick={onToggle}>
      <span className={`${styles.tick} ${checked ? styles.tickOn : ''}`}>{checked && <Tick />}</span>
      {(flagUrl || flag) && <Flag flagUrl={flagUrl} flag={flag} />}
      <span className={styles.rowName}>{label}</span>
      {code && <span className={styles.code}>{code}</span>}
    </button>
  );
}

/** A station on the route: dot + label on the flight path, body below. */
function Leg({ label, sub, count, open, locked, onToggle, children }) {
  return (
    <div className={`${styles.leg} ${open ? styles.legOpen : ''} ${locked ? styles.legLocked : ''}`}>
      <button type="button" className={styles.legHead} onClick={locked ? undefined : onToggle} aria-expanded={open}>
        <span className={`${styles.dot} ${count > 0 ? styles.dotOn : ''}`}>
          {count > 0 ? count : <span className={styles.dotPip} />}
        </span>
        <span className={styles.legText}>
          <span className={styles.legLabel}>{label}</span>
          <span className={styles.legSub}>{sub}</span>
        </span>
        {!locked && (
          <svg className={`${styles.chev} ${open ? styles.chevOpen : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        )}
      </button>
      {open && !locked && <div className={styles.legBody}>{children}</div>}
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
  const [leg, setLeg] = useState(1);

  const [countrySearch, setCountrySearch] = useState('');
  const [citySearch, setCitySearch]       = useState('');
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

  // Dropping a country drops the cities it owned; dropping a city drops its areas.
  const toggleCountry = (code) => setDraftCountries((prev) => {
    const next = new Set(prev);
    if (next.has(code)) {
      next.delete(code);
      const orphan = new Set(cities.filter((c) => c.countryCode === code).map((c) => c.code));
      if (orphan.size) {
        setDraftCities((cs) => new Set([...cs].filter((c) => !orphan.has(c))));
        setDraftZones((zs) => new Set([...zs].filter((z) => !orphan.has(zoneCity(z)))));
      }
    } else next.add(code);
    return next;
  });

  const toggleCity = (code) => setDraftCities((prev) => {
    const next = new Set(prev);
    if (next.has(code)) {
      next.delete(code);
      setDraftZones((zs) => new Set([...zs].filter((z) => zoneCity(z) !== code)));
    } else next.add(code);
    return next;
  });

  const toggleZone = (key) => setDraftZones((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const clearAll = () => {
    setDraftCountries(new Set()); setDraftCities(new Set()); setDraftZones(new Set()); setLeg(1);
  };

  const countryOf = (code) => countries.find((c) => c.code === code);
  const cityOf    = (code) => cities.find((c) => c.code === code);
  const nameOfZone = (key) => zones.find((z) => zoneKey(z) === key)?.name || key;

  const hit = (q, ...fields) => {
    const s = q.trim().toLowerCase();
    return !s || fields.some((f) => String(f || '').toLowerCase().includes(s));
  };

  const shownCountries = countries.filter((c) => hit(countrySearch, c.name, c.code));

  const cityGroups = useMemo(() => {
    const by = new Map();
    for (const c of cities) {
      if (!hit(citySearch, c.name, c.code)) continue;
      const g = by.get(c.countryCode)
        || { code: c.countryCode, name: c.countryName, flag: c.flag, flagUrl: c.flagUrl, items: [] };
      g.items.push(c);
      by.set(c.countryCode, g);
    }
    return [...by.values()];
  }, [cities, citySearch]);

  const zoneGroups = useMemo(() => {
    const by = new Map();
    for (const z of zones) {
      if (!hit(zoneSearch, z.name)) continue;
      const g = by.get(z.destinationCode) || { code: z.destinationCode, name: z.destinationName, items: [] };
      g.items.push(z);
      by.set(z.destinationCode, g);
    }
    return [...by.values()];
  }, [zones, zoneSearch]);

  // Select-all / clear for one country's cities — the shortcut a long list needs.
  const toggleWholeCountry = (group) => {
    const all = group.items.map((i) => i.code);
    const every = all.every((c) => draftCities.has(c));
    setDraftCities((prev) => {
      const next = new Set(prev);
      if (every) {
        all.forEach((c) => next.delete(c));
        setDraftZones((zs) => new Set([...zs].filter((z) => !all.includes(zoneCity(z)))));
      } else all.forEach((c) => next.add(c));
      return next;
    });
  };

  const total = draftCountries.size + draftCities.size + draftZones.size;
  const dirty =
    countryKey !== [...value.countries].sort().join(',') ||
    cityKey !== [...value.destinations].sort().join(',') ||
    [...draftZones].sort().join(',') !== [...(value.zones || [])].sort().join(',');

  if (status === 'error') return <p className={styles.note}>Destination filter unavailable.</p>;
  if (!countries.length) return <p className={styles.note}>Loading countries&hellip;</p>;

  return (
    <div className={styles.wrap}>
      {/* ── Ticket stub: everything picked so far ── */}
      {total > 0 && (
        <div className={styles.stub}>
          <div className={styles.stubTop}>
            <span className={styles.stubLabel}>Your route</span>
            <button type="button" className={styles.clearAll} onClick={clearAll}>Clear all</button>
          </div>
          <div className={styles.stubTags}>
            {[...draftCountries].map((c) => {
              const m = countryOf(c);
              return (
                <span className={`${styles.tag} ${styles.tagCountry}`} key={`c-${c}`}>
                  {m && <Flag flagUrl={m.flagUrl} flag={m.flag} className={styles.tagFlag} />}
                  {m?.name || c}
                  <button className={styles.tagX} onClick={() => toggleCountry(c)} aria-label={`Remove ${m?.name || c}`}>&times;</button>
                </span>
              );
            })}
            {[...draftCities].map((c) => (
              <span className={`${styles.tag} ${styles.tagCity}`} key={`d-${c}`}>
                <em className={styles.tagCode}>{c}</em>
                {cityOf(c)?.name || c}
                <button className={styles.tagX} onClick={() => toggleCity(c)} aria-label={`Remove ${cityOf(c)?.name || c}`}>&times;</button>
              </span>
            ))}
            {[...draftZones].map((z) => (
              <span className={`${styles.tag} ${styles.tagZone}`} key={`z-${z}`}>
                {nameOfZone(z)}
                <button className={styles.tagX} onClick={() => toggleZone(z)} aria-label={`Remove ${nameOfZone(z)}`}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── The route: three stations on a dotted flight path ── */}
      <div className={styles.route}>
        <Leg
          label="Country" count={draftCountries.size}
          sub={draftCountries.size ? `${draftCountries.size} picked` : 'Where in the world?'}
          open={leg === 1} onToggle={() => setLeg(leg === 1 ? 0 : 1)}
        >
          <input
            className={styles.search} type="text" placeholder="Search countries…"
            value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
          />
          <div className={styles.list}>
            {shownCountries.length === 0 && <p className={styles.note}>No country matches that.</p>}
            {shownCountries.map((c) => (
              <Row
                key={c.code} label={c.name} flagUrl={c.flagUrl} flag={c.flag}
                checked={draftCountries.has(c.code)} onToggle={() => toggleCountry(c.code)}
              />
            ))}
          </div>
        </Leg>

        <Leg
          label="City" count={draftCities.size} locked={draftCountries.size === 0}
          sub={draftCountries.size === 0 ? 'Pick a country first'
            : citiesBusy ? 'Loading…'
            : draftCities.size ? `${draftCities.size} picked`
            : `${cities.length} available — searching all`}
          open={leg === 2} onToggle={() => setLeg(leg === 2 ? 0 : 2)}
        >
          <input
            className={styles.search} type="text" placeholder="Search cities…"
            value={citySearch} onChange={(e) => setCitySearch(e.target.value)}
          />
          <div className={styles.list}>
            {citiesBusy && <p className={styles.note}>Loading cities&hellip;</p>}
            {!citiesBusy && cityGroups.length === 0 && <p className={styles.note}>No city matches that.</p>}
            {cityGroups.map((g) => {
              const every = g.items.every((i) => draftCities.has(i.code));
              return (
                <div className={styles.group} key={g.code}>
                  <div className={styles.groupHead}>
                    <Flag flagUrl={g.flagUrl} flag={g.flag} />
                    <span className={styles.groupName}>{g.name}</span>
                    <em className={styles.groupCount}>{g.items.length}</em>
                    <button type="button" className={styles.groupAll} onClick={() => toggleWholeCountry(g)}>
                      {every ? 'None' : 'All'}
                    </button>
                  </div>
                  {g.items.map((c) => (
                    <Row key={c.code} label={c.name} code={c.code} checked={draftCities.has(c.code)} onToggle={() => toggleCity(c.code)} />
                  ))}
                </div>
              );
            })}
          </div>
        </Leg>

        <Leg
          label="Area" count={draftZones.size} locked={draftCities.size === 0}
          sub={draftCities.size === 0 ? 'Pick a city first'
            : zonesBusy ? 'Loading…'
            : draftZones.size ? `${draftZones.size} picked`
            : zones.length ? `${zones.length} available` : 'None listed'}
          open={leg === 3} onToggle={() => setLeg(leg === 3 ? 0 : 3)}
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
                  <span className={styles.groupName}>{g.name}</span>
                  <em className={styles.groupCount}>{g.items.length}</em>
                </div>
                {g.items.map((z) => (
                  <Row key={zoneKey(z)} label={z.name} checked={draftZones.has(zoneKey(z))} onToggle={() => toggleZone(zoneKey(z))} />
                ))}
              </div>
            ))}
          </div>
        </Leg>
      </div>

      <button
        type="button" className={styles.apply}
        disabled={!dirty || total === 0}
        onClick={() => onApply({ countries: [...draftCountries], destinations: [...draftCities], zones: [...draftZones] })}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        {total === 0 ? 'Pick a destination' : `Search ${total} place${total === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
