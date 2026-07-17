import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './DestinationModal.module.css';
import { fetchGeoPlaces } from '../../api';

/**
 * Multi-destination picker. The traveller ticks one or more COUNTRIES on the
 * left rail, and each ticked country unfolds its REGIONS and CITIES as flag
 * chips on the right. No chips picked in a country = "anywhere in it".
 *
 * The caller owns the committed selection and passes it as `value`:
 *   {
 *     countries: [{ id, code, isoCode, name, flag, flagUrl }],
 *     places:    [{ key, type:'region'|'city', id, code, name,
 *                   countryId, countryIso, countryName, flag, flagUrl }]
 *   }
 * Apply → onApply(draft). Close/Escape/backdrop discards the draft.
 *
 * Regions + cities are fetched per country (fetchGeoPlaces) the first time a
 * country is ticked and cached for the lifetime of the component, which stays
 * mounted across open/close.
 */

const CHIP_LIMIT = 36;   // chips shown per group before the "+N more" expander

const placeKey = (type, id) => `${type}-${id}`;

const CheckIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

function Flag({ flagUrl, flag, className }) {
  return flagUrl
    ? <img className={className} src={flagUrl} alt="" loading="lazy" />
    : <span className={className} data-emoji="true">{flag || '🏳️'}</span>;
}

export default function DestinationModal({
  open,
  countries = [],
  loading = false,
  error = null,
  value = { countries: [], places: [] },
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState('');
  const [placesByCountry, setPlacesByCountry] = useState({});   // countryId → group
  const [errorIds, setErrorIds] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());    // `${countryId}-${type}`
  const searchRef = useRef(null);
  const inflightRef = useRef(new Set());   // countryIds being fetched (guards duplicates)

  // Re-seed the draft from the committed value each time the modal opens
  // (state adjustment during render, per the React "derived state" pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(value);
      setSearch('');
      setExpanded(new Set());
    }
  }

  // Close on Escape, stop background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Fetch regions+cities for ticked countries that aren't cached yet. The
  // in-flight guard lives in a ref (no sync setState in the effect body);
  // the skeleton is derived from "selected but not cached and not errored".
  useEffect(() => {
    if (!open) return;
    const missing = draft.countries
      .map((c) => c.id)
      .filter((id) => id != null && !placesByCountry[id] && !inflightRef.current.has(id) && !errorIds.has(id));
    if (!missing.length) return;

    for (const id of missing) inflightRef.current.add(id);
    fetchGeoPlaces(missing)
      .then((groups) => {
        setPlacesByCountry((prev) => {
          const next = { ...prev };
          for (const g of groups) next[g.countryId] = g;
          // A country the API didn't return (inactive/removed) still resolves,
          // so it doesn't refetch forever.
          for (const id of missing) if (!next[id]) next[id] = { countryId: id, regions: [], cities: [] };
          return next;
        });
      })
      .catch(() => {
        setErrorIds((prev) => new Set([...prev, ...missing]));
      })
      .finally(() => {
        for (const id of missing) inflightRef.current.delete(id);
      });
  }, [open, draft.countries, placesByCountry, errorIds]);

  const q = search.trim().toLowerCase();

  const filteredCountries = useMemo(() => {
    if (!q) return countries;
    return countries.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.isoCode && c.isoCode.toLowerCase().includes(q))
    );
  }, [countries, q]);

  const selectedIds = useMemo(() => new Set(draft.countries.map((c) => c.id)), [draft.countries]);
  const selectedKeys = useMemo(() => new Set(draft.places.map((p) => p.key)), [draft.places]);

  const placesInCountry = (countryId) => draft.places.filter((p) => p.countryId === countryId);

  const toggleCountry = (country) => {
    setDraft((d) => {
      if (selectedIds.has(country.id)) {
        return {
          countries: d.countries.filter((c) => c.id !== country.id),
          places: d.places.filter((p) => p.countryId !== country.id),
        };
      }
      return { ...d, countries: [...d.countries, country] };
    });
  };

  const togglePlace = (group, type, item) => {
    const key = placeKey(type, item.id);
    setDraft((d) => {
      if (d.places.some((p) => p.key === key)) {
        return { ...d, places: d.places.filter((p) => p.key !== key) };
      }
      return {
        ...d,
        places: [
          ...d.places,
          {
            key, type,
            id: item.id, code: item.code, name: item.name,
            countryId: group.countryId, countryIso: group.isoCode, countryName: group.name,
            flag: group.flag, flagUrl: group.flagUrl,
          },
        ],
      };
    });
  };

  const clearCountryPlaces = (countryId) =>
    setDraft((d) => ({ ...d, places: d.places.filter((p) => p.countryId !== countryId) }));

  const removePlace = (key) =>
    setDraft((d) => ({ ...d, places: d.places.filter((p) => p.key !== key) }));

  const clearAll = () => setDraft({ countries: [], places: [] });

  const retryCountry = (countryId) =>
    setErrorIds((prev) => {
      const next = new Set(prev);
      next.delete(countryId);
      return next;
    });

  const wholeCountries = draft.countries.filter((c) => !draft.places.some((p) => p.countryId === c.id));
  const totalDestinations = draft.places.length + wholeCountries.length;
  const cityCount = draft.places.filter((p) => p.type === 'city').length;
  const regionCount = draft.places.filter((p) => p.type === 'region').length;

  const summaryText = draft.countries.length
    ? [
        `${draft.countries.length} ${draft.countries.length === 1 ? 'country' : 'countries'}`,
        regionCount ? `${regionCount} region${regionCount === 1 ? '' : 's'}` : null,
        cityCount ? `${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}` : null,
      ].filter(Boolean).join(' · ')
    : 'Nothing selected yet';

  if (!open) return null;

  const renderChips = (group, type, items) => {
    const matched = q ? items.filter((i) => i.name && i.name.toLowerCase().includes(q)) : items;
    if (!matched.length) return null;

    const expKey = `${group.countryId}-${type}`;
    const isExpanded = expanded.has(expKey) || !!q;
    const shown = isExpanded ? matched : matched.slice(0, CHIP_LIMIT);
    const hidden = matched.length - shown.length;

    return (
      <div className={styles.group}>
        <span className={styles.groupLabel}>
          {type === 'region' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
          )}
          {type === 'region' ? 'Regions' : 'Cities'}
          <em className={styles.groupCount}>{matched.length}</em>
        </span>
        <div className={styles.chips}>
          {shown.map((item) => {
            const key = placeKey(type, item.id);
            const active = selectedKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                onClick={() => togglePlace(group, type, item)}
              >
                <Flag flagUrl={group.flagUrl} flag={group.flag} className={styles.chipFlag} />
                {item.name}
                {active && <span className={styles.chipCheck}><CheckIcon size={10} /></span>}
              </button>
            );
          })}
          {hidden > 0 && (
            <button
              type="button"
              className={styles.moreChip}
              onClick={() => setExpanded((prev) => new Set([...prev, expKey]))}
            >
              +{hidden} more
            </button>
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your destinations"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className={styles.header}>
          <svg className={styles.route} viewBox="0 0 220 70" fill="none" aria-hidden="true">
            <path d="M4 62C50 54 68 20 110 22c38 2 52 26 102 10" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round"/>
            <circle cx="4" cy="62" r="3" fill="currentColor"/>
            <g transform="translate(196 22) rotate(18)">
              <path d="M10.5 0.8L8.7 6.1l4.9 3.4-0.3 1-5.9-1.5-2.9 4.2-1-0.1 0.9-4.8-4.1-1.1 0.1-0.9 4.5-0.6 1.9-5.6z" fill="currentColor"/>
            </g>
          </svg>
          <div className={styles.headText}>
            <h3 className={styles.title}>Where&rsquo;s the sun taking you?</h3>
            <p className={styles.subtitle}>Pick one or more countries — then narrow it down to the regions &amp; cities you love.</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ── Search ── */}
        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search countries, regions or cities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <span className={styles.searchHint}>{summaryText}</span>
        </div>

        {/* ── Body: countries rail + places panel ── */}
        <div className={styles.main}>
          <aside className={styles.rail}>
            <span className={styles.railLabel}>
              Countries
              {draft.countries.length > 0 && <em className={styles.railBadge}>{draft.countries.length}</em>}
            </span>

            {loading && (
              <div className={styles.railState}>
                {Array.from({ length: 9 }).map((_, i) => <span key={i} className={styles.skelRow} />)}
              </div>
            )}
            {!loading && error && (
              <div className={`${styles.railState} ${styles.railError}`}>Could not load countries. Please try again.</div>
            )}
            {!loading && !error && filteredCountries.length === 0 && (
              <div className={styles.railState}>No country matches &ldquo;{search}&rdquo;.</div>
            )}

            {!loading && !error && filteredCountries.map((c) => {
              const active = selectedIds.has(c.id);
              const picked = active ? placesInCountry(c.id).length : 0;
              return (
                <button
                  key={c.id ?? c.isoCode}
                  type="button"
                  className={`${styles.countryRow} ${active ? styles.countryRowActive : ''}`}
                  onClick={() => toggleCountry(c)}
                >
                  <span className={`${styles.tick} ${active ? styles.tickOn : ''}`}>
                    {active && <CheckIcon />}
                  </span>
                  <Flag flagUrl={c.flagUrl} flag={c.flag} className={styles.rowFlag} />
                  <span className={styles.rowName}>{c.name}</span>
                  {active && (
                    <span className={styles.rowBadge}>{picked > 0 ? picked : 'All'}</span>
                  )}
                </button>
              );
            })}
          </aside>

          <section className={styles.panel}>
            {draft.countries.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.emptyArt} aria-hidden="true">
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.5 2.6 4 6.2 4 10s-1.5 7.4-4 10c-2.5-2.6-4-6.2-4-10s1.5-7.4 4-10z"/></svg>
                </span>
                <p className={styles.emptyTitle}>Start with a country</p>
                <p className={styles.emptyText}>Tick any country on the left and its regions &amp; cities will appear here — mix as many as you like.</p>
              </div>
            )}

            {draft.countries.map((c) => {
              const group = placesByCountry[c.id];
              const isError = errorIds.has(c.id);
              const isLoading = !group && !isError;
              const picked = placesInCountry(c.id);
              const whole = picked.length === 0;

              return (
                <div className={styles.block} key={c.id}>
                  <div className={styles.blockHead}>
                    <Flag flagUrl={c.flagUrl} flag={c.flag} className={styles.blockFlag} />
                    <div className={styles.blockText}>
                      <span className={styles.blockName}>{c.name}</span>
                      <span className={styles.blockSub}>
                        {whole
                          ? 'Anywhere in the country'
                          : `${picked.length} place${picked.length === 1 ? '' : 's'} selected`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.wholeChip} ${whole ? styles.wholeChipActive : ''}`}
                      onClick={() => clearCountryPlaces(c.id)}
                      title={`Search all of ${c.name}`}
                    >
                      {whole && <CheckIcon size={10} />}
                      Entire country
                    </button>
                    <button
                      type="button"
                      className={styles.blockRemove}
                      onClick={() => toggleCountry(c)}
                      aria-label={`Remove ${c.name}`}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {isLoading && (
                    <div className={styles.blockBody}>
                      <div className={styles.chips}>
                        {Array.from({ length: 8 }).map((_, i) => <span key={i} className={styles.skelChip} />)}
                      </div>
                    </div>
                  )}

                  {isError && (
                    <div className={styles.blockBody}>
                      <div className={styles.blockError}>
                        Couldn&rsquo;t load places for {c.name}.
                        <button type="button" className={styles.retryBtn} onClick={() => retryCountry(c.id)}>Retry</button>
                      </div>
                    </div>
                  )}

                  {!isLoading && !isError && group && (
                    <div className={styles.blockBody}>
                      {renderChips({ ...group, name: c.name }, 'region', group.regions || [])}
                      {renderChips({ ...group, name: c.name }, 'city', group.cities || [])}
                      {!(group.regions || []).length && !(group.cities || []).length && (
                        <p className={styles.blockNote}>No regions or cities listed yet — we&rsquo;ll search the whole country.</p>
                      )}
                      {q &&
                        !(group.regions || []).some((r) => r.name?.toLowerCase().includes(q)) &&
                        !(group.cities || []).some((d) => d.name?.toLowerCase().includes(q)) &&
                        ((group.regions || []).length > 0 || (group.cities || []).length > 0) && (
                        <p className={styles.blockNote}>No match for &ldquo;{search}&rdquo; in {c.name}.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        {/* ── Footer: selection recap + apply ── */}
        <div className={styles.footer}>
          <div className={styles.recap}>
            {totalDestinations === 0 && (
              <span className={styles.recapEmpty}>Your picks will appear here</span>
            )}
            {wholeCountries.map((c) => (
              <span className={styles.recapChip} key={`country-${c.id}`}>
                <Flag flagUrl={c.flagUrl} flag={c.flag} className={styles.chipFlag} />
                {c.name}
                <em className={styles.recapAll}>Anywhere</em>
                <button type="button" className={styles.recapX} onClick={() => toggleCountry(c)} aria-label={`Remove ${c.name}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            {draft.places.map((p) => (
              <span className={styles.recapChip} key={p.key}>
                <Flag flagUrl={p.flagUrl} flag={p.flag} className={styles.chipFlag} />
                {p.name}
                <button type="button" className={styles.recapX} onClick={() => removePlace(p.key)} aria-label={`Remove ${p.name}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>

          <div className={styles.footActions}>
            {totalDestinations > 0 && (
              <button type="button" className={styles.clearBtn} onClick={clearAll}>Clear all</button>
            )}
            <button
              type="button"
              className={styles.applyBtn}
              disabled={totalDestinations === 0}
              onClick={() => onApply(draft)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              {totalDestinations === 0
                ? 'Choose destinations'
                : `Apply · ${totalDestinations} destination${totalDestinations === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
