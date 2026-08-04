import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ScopePicker.module.css';
import { fetchDestinations, fetchZones } from '../../api/filters';
import { zoneKey, zoneCity, scopeLeafCount } from '../../utils/scopeLeaves';

/**
 * Where-picker for the results sidebar: countries → cities → areas.
 *
 * Three collapsible sections, one open at a time, so the rail never stacks three
 * scrolling lists. Cities load for every ticked country in a single call and group
 * under country headings; areas group under their city.
 *
 * The parent owns the committed scope; this drafts locally and calls
 * onApply({ countries, destinations, zones }) on commit.
 */

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

function Flag({ flagUrl, flag, className }) {
  return flagUrl
    ? <img className={className || styles.flag} src={flagUrl} alt="" loading="lazy" />
    : <span className={className || styles.flag} data-emoji="true">{flag || '\u{1F3F3}️'}</span>;
}

function Row({ label, code, checked, onToggle, flagUrl, flag }) {
  return (
    <button type="button" className={`${styles.row} ${checked ? styles.rowOn : ''}`} onClick={onToggle}>
      <span className={`${styles.box} ${checked ? styles.boxOn : ''}`}>{checked && <Check />}</span>
      {(flagUrl || flag) && <Flag flagUrl={flagUrl} flag={flag} />}
      <span className={styles.rowName}>{label}</span>
      {code && <span className={styles.code}>{code}</span>}
    </button>
  );
}

function Section({ title, summary, count, open, locked, onToggle, children }) {
  return (
    <div className={`${styles.section} ${open ? styles.sectionOpen : ''} ${locked ? styles.locked : ''}`}>
      <button type="button" className={styles.sectionHead} onClick={locked ? undefined : onToggle} aria-expanded={open}>
        <span className={styles.sectionText}>
          <span className={styles.sectionTitle}>{title}</span>
          <span className={styles.sectionSummary}>{summary}</span>
        </span>
        {count > 0 && <span className={styles.badge}>{count}</span>}
        {!locked && (
          <svg className={`${styles.chev} ${open ? styles.chevOpen : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        )}
      </button>
      {open && !locked && <div className={styles.sectionBody}>{children}</div>}
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
  // Which accordion sections are expanded. A Set (not a single key) so picking a country
  // can reveal Cities AND Areas at once while Countries stays open — they behave like
  // independent disclosures, not a one-at-a-time accordion.
  const [open, setOpen] = useState(() => {
    // Countries is always open; Cities/Areas start open too when there's already a
    // selection to show (e.g. reopening the picker after a destination search).
    const s = new Set(['country']);
    if (value.countries?.length || value.destinations?.length) s.add('city');
    if (value.destinations?.length || value.zones?.length) s.add('area');
    return s;
  });
  const isOpen = (k) => open.has(k);
  const toggleSection = (k) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });


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
  const toggleCountry = (code) => {
    const adding = !draftCountries.has(code);
    setDraftCountries((prev) => {
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
    // Picking a country drills down: reveal Cities and Areas together (Areas stays locked
    // until a city is ticked, then expands on its own since it's already marked open).
    if (adding) setOpen((prev) => new Set([...prev, 'city', 'area']));
  };

  const toggleCity = (code) => {
    const adding = !draftCities.has(code);
    setDraftCities((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        setDraftZones((zs) => new Set([...zs].filter((z) => zoneCity(z) !== code)));
      } else next.add(code);
      return next;
    });
    // Picking a city reveals its areas/zones (they were closed by default).
    if (adding) setOpen((prev) => new Set([...prev, 'area']));
  };

  const toggleZone = (key) => setDraftZones((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const clearAll = () => {
    setDraftCountries(new Set()); setDraftCities(new Set()); setDraftZones(new Set()); setOpen(new Set(['country']));
  };

  const countryOf   = (code) => countries.find((c) => c.code === code);
  const cityOf      = (code) => cities.find((c) => c.code === code);
  const nameOfZone  = (key) => zones.find((z) => zoneKey(z) === key)?.name || key;

  const shownCountries = countries;

  const cityGroups = useMemo(() => {
    const by = new Map();
    for (const c of cities) {
      const g = by.get(c.countryCode)
        || { code: c.countryCode, name: c.countryName, flag: c.flag, flagUrl: c.flagUrl, items: [] };
      g.items.push(c);
      by.set(c.countryCode, g);
    }
    return [...by.values()];
  }, [cities]);

  const zoneGroups = useMemo(() => {
    const by = new Map();
    for (const z of zones) {
      const g = by.get(z.destinationCode) || { code: z.destinationCode, name: z.destinationName, items: [] };
      g.items.push(z);
      by.set(z.destinationCode, g);
    }
    return [...by.values()];
  }, [zones]);

  // Select-all / clear for one group — the shortcut a 27-city country needs.
  const toggleAllCities = (group) => {
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

  const toggleAllZones = (group) => {
    const all = group.items.map(zoneKey);
    const every = all.every((k) => draftZones.has(k));
    setDraftZones((prev) => {
      const next = new Set(prev);
      all.forEach((k) => (every ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  // How many places this search actually covers — leaves, not the sum of the three tiers
  // (see utils/scopeLeaves). The results hero counts the committed scope the same way.
  const total = useMemo(
    () => scopeLeafCount(
      { countries: [...draftCountries], destinations: [...draftCities], zones: [...draftZones] },
      cities,
    ),
    [draftCountries, draftCities, draftZones, cities],
  );
  const dirty =
    countryKey !== [...value.countries].sort().join(',') ||
    cityKey !== [...value.destinations].sort().join(',') ||
    [...draftZones].sort().join(',') !== [...(value.zones || [])].sort().join(',');

  if (status === 'error') return <p className={styles.note}>Destination filter unavailable.</p>;
  if (!countries.length) return <p className={styles.note}>Loading countries&hellip;</p>;

  return (
    <div className={styles.wrap}>
      {total > 0 && (
        <div className={styles.selected}>
          <div className={styles.selectedHead}>
            <span className={styles.selectedLabel}>Selected</span>
            <button type="button" className={styles.clear} onClick={clearAll}>Clear all</button>
          </div>
          <div className={styles.pills}>
            {[...draftCountries].map((c) => {
              const m = countryOf(c);
              return (
                <span className={styles.pill} key={`c-${c}`}>
                  {m && <Flag flagUrl={m.flagUrl} flag={m.flag} className={styles.pillFlag} />}
                  {m?.name || c}
                  <button className={styles.pillX} onClick={() => toggleCountry(c)} aria-label={`Remove ${m?.name || c}`}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </span>
              );
            })}
            {[...draftCities].map((c) => (
              <span className={styles.pill} key={`d-${c}`}>
                {cityOf(c)?.name || c}
                <button className={styles.pillX} onClick={() => toggleCity(c)} aria-label={`Remove ${cityOf(c)?.name || c}`}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            {[...draftZones].map((z) => (
              <span className={styles.pill} key={`z-${z}`}>
                {nameOfZone(z)}
                <button className={styles.pillX} onClick={() => toggleZone(z)} aria-label={`Remove ${nameOfZone(z)}`}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.sections}>
        <Section
          title="Countries" count={draftCountries.size}
          summary={draftCountries.size ? `${draftCountries.size} selected` : 'Any country'}
          open={isOpen('country')} onToggle={() => toggleSection('country')}
        >
          <div className={styles.list}>
            {shownCountries.length === 0 && <p className={styles.note}>No country matches that.</p>}
            {shownCountries.map((c) => (
              <Row
                key={c.code} label={c.name} flagUrl={c.flagUrl} flag={c.flag}
                checked={draftCountries.has(c.code)} onToggle={() => toggleCountry(c.code)}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Cities" count={draftCities.size} locked={draftCountries.size === 0}
          summary={draftCountries.size === 0 ? 'Select a country first'
            : citiesBusy ? 'Loading'
            : draftCities.size ? `${draftCities.size} selected`
            : `All ${cities.length} cities`}
          open={isOpen('city')} onToggle={() => toggleSection('city')}
        >
          <div className={styles.list}>
            {citiesBusy && <p className={styles.note}>Loading cities&hellip;</p>}
            {!citiesBusy && cityGroups.length === 0 && <p className={styles.note}>No city matches that.</p>}
            {cityGroups.map((g) => {
              const every = g.items.every((i) => draftCities.has(i.code));
              return (
                <div className={styles.group} key={g.code}>
                  <div className={styles.groupHead}>
                    <Flag flagUrl={g.flagUrl} flag={g.flag} className={styles.groupFlag} />
                    <span className={styles.groupName}>{g.name}</span>
                    <button type="button" className={styles.groupAll} onClick={() => toggleAllCities(g)}>
                      {every ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  {g.items.map((c) => (
                    <Row key={c.code} label={c.name} code={c.code} checked={draftCities.has(c.code)} onToggle={() => toggleCity(c.code)} />
                  ))}
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Areas" count={draftZones.size} locked={draftCities.size === 0}
          summary={draftCities.size === 0 ? 'Select a city first'
            : zonesBusy ? 'Loading'
            : draftZones.size ? `${draftZones.size} selected`
            : zones.length ? `All ${zones.length} areas` : 'None available'}
          open={isOpen('area')} onToggle={() => toggleSection('area')}
        >
          <div className={styles.list}>
            {zonesBusy && <p className={styles.note}>Loading areas&hellip;</p>}
            {!zonesBusy && zoneGroups.length === 0 && <p className={styles.note}>No areas available for these cities.</p>}
            {zoneGroups.map((g) => {
              const every = g.items.every((i) => draftZones.has(zoneKey(i)));
              return (
                <div className={styles.group} key={g.code}>
                  <div className={styles.groupHead}>
                    <span className={styles.groupName}>{g.name}</span>
                    <button type="button" className={styles.groupAll} onClick={() => toggleAllZones(g)}>
                      {every ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  {g.items.map((z) => (
                    <Row key={zoneKey(z)} label={z.name} checked={draftZones.has(zoneKey(z))} onToggle={() => toggleZone(zoneKey(z))} />
                  ))}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <button
        type="button" className={styles.apply}
        disabled={!dirty || total === 0}
        onClick={() => onApply({ countries: [...draftCountries], destinations: [...draftCities], zones: [...draftZones] })}
      >
        {total === 0 ? 'Select a destination' : `Search ${total} place${total === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
