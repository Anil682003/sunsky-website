import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, MapPin, Building2, ChevronDown, X, Search } from 'lucide-react';
import styles from './ScopePicker.module.css';
import { fetchDestinations, fetchZones } from '../../api/filters';
import { zoneKey, zoneCity } from '../../utils/scopeLeaves';
import { useTranslation } from 'react-i18next';
import { countryName } from '../../utils/countryName';

/**
 * Where-picker for the results sidebar: country → city → area.
 *
 * Three fields that look like selects and behave like search boxes. Clicking one
 * opens a list under it and puts the cursor in the field, so a traveller who knows
 * where they are going types two letters instead of scrolling forty countries, and
 * one who does not scrolls a list that starts with the places we actually sell.
 *
 * Picking applies straight away. The previous version drafted a selection behind an
 * Apply button, which meant the results behind it disagreed with the filter in front
 * of it until you pressed the button, and a selection you never applied was silently
 * thrown away when the panel closed.
 *
 * Each level is scoped by the one above: cities load for the chosen countries, areas
 * for the chosen cities, and dropping a country drops the cities it owned.
 *
 * The parent owns the committed scope and receives { countries, destinations, zones }
 * on every change.
 */

/* Rows carry the flag of the country they belong to, at every level, because with
   three countries picked a list of city names alone does not say which is which. */
function Flag({ flagUrl, flag, className }) {
  if (flagUrl) return <img className={className} src={flagUrl} alt="" loading="lazy" />;
  if (flag) return <span className={className} data-emoji="true">{flag}</span>;
  return null;
}

/* Diacritics stripped both sides, so "Griekenland" is reachable by "grie" and
   "Málaga" by "mala". Matches anywhere in the name rather than only at the start:
   people search for "Canaria" as readily as for "Gran". */
const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase();

/**
 * One field: a closed summary, and an open panel with its own search.
 *
 * `items` are { key, label, flag, flagUrl, hint }. `selected` is a Set of keys.
 * Everything else is presentation.
 */
function PickerField({
  icon,
  placeholder,
  summary,
  items,
  selected,
  popularKeys,
  busy,
  emptyNote,
  onToggle,
  labelOf,
  testId,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // The search term belongs to one visit to the panel, so it is cleared where the
  // panel opens and closes rather than in an effect watching `open` — an effect that
  // sets state runs a second render for something these two handlers already know.
  const openPanel = () => { setQuery(''); setOpen(true); };
  const closePanel = () => { setQuery(''); setOpen(false); };

  // Closing on an outside click rather than on blur: blur fires when the cursor
  // moves to the panel's own scrollbar, which would shut the list mid-scroll.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) closePanel(); };
    const onKey = (e) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus only. The field is read-only until it opens, so it cannot be focused
  // before the render that makes it editable.
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return items;
    return items.filter((i) => norm(i.label).includes(q) || norm(i.hint).includes(q));
  }, [items, query]);

  // While searching the headings go away: two groups over three results is more
  // furniture than list. Unsearched, the places we actually sell come first.
  const searching = Boolean(query.trim());
  const popular = searching ? [] : matches.filter((i) => popularKeys?.has(i.key));
  const rest = searching ? matches : matches.filter((i) => !popularKeys?.has(i.key));

  const renderRow = (item) => {
    const on = selected.has(item.key);
    return (
      <li key={item.key}>
        <button
          type="button"
          role="option"
          aria-selected={on}
          className={`${styles.option} ${on ? styles.optionOn : ''}`}
          onClick={() => { onToggle(item.key); closePanel(); }}
        >
          <Flag flagUrl={item.flagUrl} flag={item.flag} className={styles.optionFlag} />
          <span className={styles.optionName}>{item.label}</span>
          {item.hint && <span className={styles.optionHint}>{item.hint}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className={styles.field} ref={rootRef}>
      <div className={`${styles.control} ${open ? styles.controlOpen : ''}`}>
        <span className={styles.controlIcon}>{icon}</span>
        {/* One element in both states: closed it reads as the current value, open it
            is the search box. Swapping elements would lose the cursor on open. */}
        <input
          ref={inputRef}
          type="text"
          className={styles.controlInput}
          data-testid={testId}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
          placeholder={open ? t('scopePicker.typeToSearch', 'Type to search…') : placeholder}
          value={open ? query : summary}
          readOnly={!open}
          onChange={(e) => setQuery(e.target.value)}
          onMouseDown={openPanel}
          onFocus={openPanel}
        />
        {open
          ? <Search size={16} className={styles.controlChev} aria-hidden="true" />
          : <ChevronDown size={18} className={styles.controlChev} aria-hidden="true" />}
      </div>

      {open && (
        <div className={styles.panel}>
          {selected.size > 0 && (
            <div className={styles.chips}>
              {[...selected].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={styles.chip}
                  onClick={() => onToggle(key)}
                  aria-label={t('scopePicker.remove', { name: labelOf(key), defaultValue: 'Remove {{name}}' })}
                >
                  {labelOf(key)}
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <ul className={styles.list} role="listbox">
            {busy && <li className={styles.note}>{t('scopePicker.loading', 'Loading…')}</li>}
            {!busy && !items.length && <li className={styles.note}>{emptyNote}</li>}
            {!busy && items.length > 0 && !matches.length && (
              <li className={styles.note}>{t('scopePicker.noMatches', 'Nothing matches that.')}</li>
            )}
            {popular.length > 0 && (
              <li className={styles.heading}>{t('scopePicker.popular', 'Popular')}</li>
            )}
            {popular.map(renderRow)}
            {rest.length > 0 && popular.length > 0 && (
              <li className={styles.heading}>{t('scopePicker.everywhereElse', 'Everywhere else')}</li>
            )}
            {rest.map(renderRow)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ScopePicker({
  countries = [],
  status = 'ok',
  value = { countries: [], destinations: [], zones: [] },
  popular = { countries: [], cities: [] },
  onApply,
}) {
  const { t, i18n } = useTranslation('common');
  // Same rule as the destination picker: the ISO code decides the word, the dashboard
  // decides which countries are sold. See utils/countryName.
  const countryLabel = (c) => countryName(c?.code, i18n.language, c?.name || '');

  const picked = {
    countries: useMemo(() => new Set(value.countries), [value.countries]),
    cities: useMemo(() => new Set(value.destinations), [value.destinations]),
    zones: useMemo(() => new Set(value.zones || []), [value.zones]),
  };

  const [cities, setCities] = useState([]);
  const [citiesBusy, setCitiesBusy] = useState(false);
  const [zones, setZones] = useState([]);
  const [zonesBusy, setZonesBusy] = useState(false);

  const countryKey = [...picked.countries].sort().join(',');
  const cityKey = [...picked.cities].sort().join(',');

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

  const commit = (next) => onApply?.({
    countries: [...next.countries],
    destinations: [...next.cities],
    zones: [...next.zones],
  });

  /* Dropping a country drops the cities it owned and their areas, so the scope can
     never keep a city the country list no longer covers. */
  const toggleCountry = (code) => {
    const nextCountries = new Set(picked.countries);
    let nextCities = new Set(picked.cities);
    let nextZones = new Set(picked.zones);
    if (nextCountries.has(code)) {
      nextCountries.delete(code);
      const orphan = new Set(cities.filter((c) => c.countryCode === code).map((c) => c.code));
      if (orphan.size) {
        nextCities = new Set([...nextCities].filter((c) => !orphan.has(c)));
        nextZones = new Set([...nextZones].filter((z) => !orphan.has(zoneCity(z))));
      }
    } else nextCountries.add(code);
    commit({ countries: nextCountries, cities: nextCities, zones: nextZones });
  };

  const toggleCity = (code) => {
    const nextCities = new Set(picked.cities);
    let nextZones = new Set(picked.zones);
    if (nextCities.has(code)) {
      nextCities.delete(code);
      nextZones = new Set([...nextZones].filter((z) => zoneCity(z) !== code));
    } else nextCities.add(code);
    commit({ countries: picked.countries, cities: nextCities, zones: nextZones });
  };

  const toggleZone = (key) => {
    const nextZones = new Set(picked.zones);
    if (nextZones.has(key)) nextZones.delete(key); else nextZones.add(key);
    commit({ countries: picked.countries, cities: picked.cities, zones: nextZones });
  };

  const countryOf = (code) => countries.find((c) => c.code === code);
  const cityOf = (code) => cities.find((c) => c.code === code);
  const zoneOf = (key) => zones.find((z) => zoneKey(z) === key);

  const countryItems = useMemo(() => countries.map((c) => ({
    key: c.code, label: countryLabel(c), flag: c.flag, flagUrl: c.flagUrl, hint: '',
  })), [countries, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const cityItems = useMemo(() => cities.map((c) => ({
    key: c.code, label: c.name, flag: c.flag, flagUrl: c.flagUrl, hint: '',
  })), [cities]);

  const zoneItems = useMemo(() => zones.map((z) => ({
    key: zoneKey(z), label: z.name, flag: '', flagUrl: '',
    // Which city an area belongs to, since two countries can both have a "Centro".
    hint: z.destinationName || '',
  })), [zones]);

  /* Hoisted above the early returns below: these are hooks, and a hook that only
     runs when the countries loaded would change the hook order on the render where
     they have not. */
  const popularCountryKeys = useMemo(() => new Set(popular.countries), [popular.countries]);
  const popularCityKeys = useMemo(() => new Set(popular.cities), [popular.cities]);

  /* The closed field says what is chosen, in the fewest words that stay true: one
     place by name, several as a count. A count alone for a single pick would make
     the reader open the field to find out which one. */
  const summarise = (keys, labelFor, countKey, fallback) => {
    if (!keys.size) return '';
    if (keys.size === 1) return labelFor([...keys][0]) || fallback;
    return t(countKey, { count: keys.size, defaultValue: fallback });
  };

  if (status === 'error') return <p className={styles.note}>{t('scopePicker.unavailable', 'Destination filter unavailable.')}</p>;
  if (!countries.length) return <p className={styles.note}>{t('scopePicker.loadingCountries', 'Loading countries…')}</p>;

  return (
    <div className={styles.wrap}>
      <PickerField
        t={t}
        testId="scope-country"
        icon={<Globe size={17} aria-hidden="true" />}
        placeholder={t('scopePicker.chooseCountry', 'Choose country…')}
        summary={summarise(
          picked.countries,
          (k) => countryLabel(countryOf(k)),
          'scopePicker.countryCount',
          `${picked.countries.size} countries`,
        )}
        items={countryItems}
        selected={picked.countries}
        popularKeys={popularCountryKeys}
        onToggle={toggleCountry}
        labelOf={(k) => countryLabel(countryOf(k)) || k}
        emptyNote={t('scopePicker.noCountries', 'No countries available.')}
      />

      <PickerField
        t={t}
        testId="scope-city"
        icon={<MapPin size={17} aria-hidden="true" />}
        placeholder={t('scopePicker.chooseCity', 'Choose city…')}
        summary={summarise(
          picked.cities,
          (k) => cityOf(k)?.name,
          'scopePicker.cityCount',
          `${picked.cities.size} cities`,
        )}
        items={cityItems}
        selected={picked.cities}
        popularKeys={popularCityKeys}
        busy={citiesBusy}
        onToggle={toggleCity}
        labelOf={(k) => cityOf(k)?.name || k}
        emptyNote={t('scopePicker.pickCountryFirst', 'Choose a country first.')}
      />

      <PickerField
        t={t}
        testId="scope-area"
        icon={<Building2 size={17} aria-hidden="true" />}
        placeholder={t('scopePicker.chooseArea', 'Choose area…')}
        summary={summarise(
          picked.zones,
          (k) => zoneOf(k)?.name,
          'scopePicker.areaCount',
          `${picked.zones.size} areas`,
        )}
        items={zoneItems}
        selected={picked.zones}
        busy={zonesBusy}
        onToggle={toggleZone}
        labelOf={(k) => zoneOf(k)?.name || k}
        emptyNote={t('scopePicker.pickCityFirst', 'Choose a city first.')}
      />
    </div>
  );
}
