import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './DestinationModal.module.css';
import { fetchGeoPlaces } from '../../api';
import { useTranslation } from 'react-i18next';
import { geoCountryName } from '../../utils/countryName';
import { flagSrc } from '../../utils/countryFlag';
import { orderCountries } from '../../utils/countryOrder';

/**
 * Multi-destination picker, laid out to the client's mock (23/11/2026).
 *
 * Left: the countries, popular ones first, each with a checkbox and, once ticked, a pill saying
 * what will be searched there ("Whole country" or "2 destinations"). Right: one card per ticked
 * country. The open card asks HOW to search that country, as two radio cards: the whole country,
 * or specific destinations; the second shows its regions and cities as checkbox chips. Footer:
 * a plain-text "Selected:" summary, Clear and Apply.
 *
 * Only a country wears its flag. A region or city chip sits inside its country's card, so the
 * flag repeated on every place was noise, and the client asked for it to go.
 *
 * The caller owns the committed selection and passes it as `value`:
 *   {
 *     countries: [{ id, code, isoCode, name, flag, flagUrl }],
 *     places:    [{ key, type:'region'|'city', id, code, name,
 *                   countryId, countryIso, countryName, flag, flagUrl }]
 *   }
 * A country with no places in `places` is searched whole. "Specific destinations" with nothing
 * ticked yet is still the whole country to the search, and the summary says so.
 *
 * Apply → onApply(draft). Close/Escape/backdrop ALSO hand back the draft: what the picker shows
 * is what the search gets. Discarding it meant a traveller who removed every country and closed
 * still saw the old countries in the search box, with no way to clear them (Apply is disabled
 * while nothing is picked).
 *
 * Regions + cities are fetched per country (fetchGeoPlaces) the first time a country is ticked
 * and cached for the lifetime of the component, which stays mounted across open/close.
 */

const CHIP_LIMIT = 36;   // chips shown per group before the "+N more" expander

const placeKey = (type, id) => `${type}-${id}`;

/**
 * PURE. How a picked place is recognised again: its type, its country and its CODE.
 *
 * Not its id. A selection restored from the store may predate the store keeping ids, and a
 * place with no id could not be matched to the row it came from: the footer counted
 * "1 place selected" while every chip in the list sat unticked, and removing it removed every
 * other keyless place with it. A code is stable, is unique inside its country, and the store
 * has always kept it.
 */
const draftKey = (type, countryId, code) =>
  `${type}-${countryId ?? ''}-${String(code ?? '').toUpperCase()}`;

const CheckIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
);
const CloseIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
);
const PinIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
  </svg>
);

// Takes the country, not just its stored URL. Four of the admin's codes are Hotelbeds codes
// rather than ISO, so the flag URL it built for them 404s and the picker fell through to the
// white-flag emoji; flagSrc rebuilds those (see utils/countryFlag).
function Flag({ country, className }) {
  const src = flagSrc(country);
  return src
    ? <img className={className} src={src} alt="" loading="lazy" />
    : <span className={className} data-emoji="true">{country?.flag || '🏳️'}</span>;
}

/**
 * @param isUnavailable (item) => boolean — a destination no flight reaches from the departure
 *   airport the traveller chose. Shown, greyed, not selectable, with the reason on it. The
 *   modal knows nothing about flights; it asks, exactly as DateCalendar does. Omit it (the
 *   default says "no") and nothing is ever greyed, which is what every caller without a
 *   departure airport wants.
 * @param unavailableReason text for those chips, e.g. "Not available from Charleroi".
 */
export default function DestinationModal({
  open,
  countries = [],
  loading = false,
  error = null,
  value = { countries: [], places: [] },
  isUnavailable,
  unavailableReason = '',
  onApply,
  onClose,
}) {
  const { t, i18n } = useTranslation('common');

  // The rail, the cards and the summary all name the same country: in Dutch exactly as Geo
  // Data has it, in English by its ISO code. utils/countryName (geoCountryName) holds the rule.
  const countryLabel = (c) => geoCountryName(c?.isoCode, i18n.language, c?.name || '');
  const [draft, setDraft] = useState(value);
  const [placesByCountry, setPlacesByCountry] = useState({});   // countryId → group
  const [errorIds, setErrorIds] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());    // `${countryId}-${type}`
  // Countries the traveller set to "Specific destinations". A country with places picked is
  // always specific; this also holds one switched to specific before its first tick.
  const [specificIds, setSpecificIds] = useState(() => new Set());
  // Accordion: only one country's card is open at a time, so ten picked countries stay a
  // ten-row list instead of ten full chip lists to scroll past.
  const [activeId, setActiveId] = useState(null);
  const inflightRef = useRef(new Set());   // countryIds being fetched (guards duplicates)
  // Closing keeps the current picks (see the header comment).
  const dismiss = useCallback(() => (onApply ? onApply(draft) : onClose?.()), [onApply, onClose, draft]);

  // Re-seed the draft from the committed value each time the modal opens
  // (state adjustment during render, per the React "derived state" pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(value);
      setExpanded(new Set());
      setSpecificIds(new Set((value.places || []).map((p) => p.countryId)));
      // Reopen focused on the last country picked, not the first.
      setActiveId(value.countries?.[value.countries.length - 1]?.id ?? null);
    }
  }

  // Close on Escape, stop background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

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

  // The rail's order: the countries the agency marked Popular in GeoData lead, in the rank it
  // set, then the rest alphabetically. `popularCount` is how many rows that block is, so the
  // rail can head it "Popular countries" and rule a line under it. See utils/countryOrder.
  const { list: railCountries, popularCount } = useMemo(() => orderCountries(countries), [countries]);

  const selectedIds = useMemo(() => new Set(draft.countries.map((c) => c.id)), [draft.countries]);

  // Which places are picked, by the identity above rather than by a stored key, so a
  // selection restored from an older record ticks its chips on the first open.
  const selectedKeys = useMemo(
    () => new Set(draft.places.map((p) => draftKey(p.type, p.countryId, p.code))),
    [draft.places]
  );

  const placesInCountry = (countryId) => draft.places.filter((p) => p.countryId === countryId);
  const isSpecific = (countryId) =>
    specificIds.has(countryId) || draft.places.some((p) => p.countryId === countryId);

  const toggleCountry = (country) => {
    const isOn = selectedIds.has(country.id);
    setDraft((d) => {
      if (isOn) {
        return {
          countries: d.countries.filter((c) => c.id !== country.id),
          places: d.places.filter((p) => p.countryId !== country.id),
        };
      }
      return { ...d, countries: [...d.countries, country] };
    });
    // Ticking a country focuses it (that's what you came to refine); unticking
    // the focused one falls back to whichever country remains last.
    if (isOn) {
      setSpecificIds((prev) => {
        if (!prev.has(country.id)) return prev;
        const next = new Set(prev);
        next.delete(country.id);
        return next;
      });
      setActiveId((prev) => {
        if (prev !== country.id) return prev;
        const rest = draft.countries.filter((c) => c.id !== country.id);
        return rest[rest.length - 1]?.id ?? null;
      });
    } else {
      setActiveId(country.id);
    }
  };

  // "Whole country" drops the country's picked places; "Specific destinations" only opens the
  // chips. Nothing else changes, so flipping back and forth costs the traveller nothing until
  // they actually pick the whole country.
  const setMode = (countryId, mode) => {
    if (mode === 'whole') {
      setDraft((d) => ({ ...d, places: d.places.filter((p) => p.countryId !== countryId) }));
      setSpecificIds((prev) => {
        if (!prev.has(countryId)) return prev;
        const next = new Set(prev);
        next.delete(countryId);
        return next;
      });
    } else {
      setSpecificIds((prev) => (prev.has(countryId) ? prev : new Set([...prev, countryId])));
    }
  };

  const togglePlace = (group, type, item) => {
    const key = placeKey(type, item.id);
    const dk = draftKey(type, group.countryId, item.code);
    setDraft((d) => {
      if (d.places.some((p) => draftKey(p.type, p.countryId, p.code) === dk)) {
        return { ...d, places: d.places.filter((p) => draftKey(p.type, p.countryId, p.code) !== dk) };
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

  const clearAll = () => {
    setDraft({ countries: [], places: [] });
    setSpecificIds(new Set());
    setActiveId(null);
  };

  const retryCountry = (countryId) =>
    setErrorIds((prev) => {
      const next = new Set(prev);
      next.delete(countryId);
      return next;
    });

  const totalDestinations = draft.places.length +
    draft.countries.filter((c) => !draft.places.some((p) => p.countryId === c.id)).length;

  if (!open) return null;

  // What the search will cover in one country, as the rail pill and the collapsed card say it.
  const coverage = (c, { selected = false } = {}) => {
    const n = placesInCountry(c.id).length;
    if (n > 0) {
      return t(selected ? 'destinationModal.destinationsSelected' : 'destinationModal.destinationsCount', {
        count: n,
        defaultValue_one: selected ? '{{count}} destination selected' : '{{count}} destination',
        defaultValue_other: selected ? '{{count}} destinations selected' : '{{count}} destinations',
      });
    }
    return selected
      ? t('destinationModal.wholeCountrySelected', 'Whole country selected')
      : t('destinationModal.wholeCountry', 'Whole country');
  };

  // "Turkije (hele land) - Egypte (Hurghada, Marsa Alam)": the footer's plain-text summary.
  const summary = draft.countries.map((c) => {
    const names = placesInCountry(c.id).map((p) => p.name);
    const scope = names.length ? names.join(', ') : t('destinationModal.wholeCountryLower', 'whole country');
    return `${countryLabel(c)} (${scope})`;
  }).join(' - ');

  const renderChip = (group, type, item) => {
    const key = placeKey(type, item.id);
    const active = selectedKeys.has(draftKey(type, group.countryId, item.code));
    // A place already picked is never greyed, even when the airport since chosen cannot reach
    // it: Ch1 §9A says a traveller's choice stays visible and keeps its tick, so they can see
    // what no longer fits and decide for themselves.
    const blocked = !active && typeof isUnavailable === 'function' && isUnavailable(item);
    return (
      <button
        key={key}
        type="button"
        className={`${styles.chip} ${active ? styles.chipActive : ''} ${blocked ? styles.chipBlocked : ''}`}
        onClick={() => !blocked && togglePlace(group, type, item)}
        disabled={blocked}
        aria-pressed={active}
        aria-disabled={blocked || undefined}
        title={blocked ? unavailableReason || undefined : undefined}
      >
        <span className={`${styles.box} ${active ? styles.boxOn : ''}`} aria-hidden="true">
          {active && <CheckIcon size={12} />}
        </span>
        {item.name}
      </button>
    );
  };

  const renderGroup = (group, type, label, items, groupKey) => {
    if (!items.length) return null;
    const expKey = `${group.countryId}-${groupKey}`;
    const isExpanded = expanded.has(expKey);
    const shown = isExpanded ? items : items.slice(0, CHIP_LIMIT);
    const hidden = items.length - shown.length;
    return (
      <div className={styles.group} key={groupKey}>
        <span className={styles.groupLabel}>
          {label}
          <em className={styles.groupCount}>{items.length}</em>
        </span>
        <div className={styles.chips}>
          {shown.map((item) => renderChip(group, type, item))}
          {hidden > 0 && (
            <button
              type="button"
              className={styles.moreChip}
              onClick={() => setExpanded((prev) => new Set([...prev, expKey]))}
            >
              +{hidden} {t('destinationModal.more', 'more')}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Regions, then the cities grouped by their holiday theme ("Zonvakanties"), then the cities
  // with no theme under a plain "Cities" heading.
  const renderPlaces = (c, group) => {
    const ctx = { ...group, name: c.name };
    const regions = group.regions || [];
    const cities = group.cities || [];
    if (!regions.length && !cities.length) {
      return (
        <p className={styles.blockNote}>
          {t('destinationModal.noPlaces', 'No regions or cities listed yet. We’ll search the whole country.')}
        </p>
      );
    }
    const themed = new Map();
    const plain = [];
    for (const city of cities) {
      if (city.themes?.length) {
        for (const theme of city.themes) {
          const bucket = themed.get(theme.id) || { name: theme.name, cities: [] };
          bucket.cities.push(city);
          themed.set(theme.id, bucket);
        }
      } else {
        plain.push(city);
      }
    }
    return (
      <>
        {renderGroup(ctx, 'region', t('destinationModal.regions', 'Regions'), regions, 'region')}
        {[...themed.entries()].map(([id, b]) => renderGroup(ctx, 'city', b.name, b.cities, `theme-${id}`))}
        {renderGroup(ctx, 'city', t('destinationModal.cities', 'Cities'), plain, 'city')}
      </>
    );
  };

  return createPortal(
    <div className={styles.backdrop} onClick={dismiss}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('destinationModal.dialogLabel', 'Choose your destinations')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headText}>
            <h3 className={styles.title}>{t('destinationModal.title', 'Where would you like to go?')}</h3>
            <p className={styles.subtitle}>
              {t(
                'destinationModal.subtitle',
                'Choose one or more countries, then search the whole country or only specific destinations.'
              )}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={dismiss} aria-label={t('destinationModal.close', 'Close')}>
            <CloseIcon size={18} />
          </button>
        </div>

        {/* ── Body: countries rail + one card per picked country ── */}
        <div className={styles.main}>
          <aside className={styles.rail}>
            <span className={styles.railLabel}>
              {popularCount > 0
                ? t('destinationModal.popularCountries', 'Popular countries')
                : t('destinationModal.countries', 'Countries')}
              {draft.countries.length > 0 && <em className={styles.railBadge}>{draft.countries.length}</em>}
            </span>

            {loading && (
              <div className={styles.railState}>
                {Array.from({ length: 9 }).map((_, i) => <span key={i} className={styles.skelRow} />)}
              </div>
            )}
            {!loading && error && (
              <div className={`${styles.railState} ${styles.railError}`}>
                {t('destinationModal.countriesError', 'Could not load countries. Please try again.')}
              </div>
            )}
            {!loading && !error && countries.length === 0 && (
              <div className={styles.railState}>{t('destinationModal.noCountries', 'No countries available.')}</div>
            )}

            {!loading && !error && railCountries.map((c, i) => {
              const active = selectedIds.has(c.id);
              return (
                <Fragment key={c.id ?? c.isoCode}>
                  {i === popularCount && popularCount > 0 && (
                    <div className={styles.railDivider} role="presentation">
                      <span>{t('destinationModal.allCountries', 'All countries')}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`${styles.countryRow} ${active ? styles.countryRowActive : ''}`}
                    onClick={() => toggleCountry(c)}
                    aria-pressed={active}
                  >
                    <span className={`${styles.box} ${active ? styles.boxOn : ''}`} aria-hidden="true">
                      {active && <CheckIcon size={13} />}
                    </span>
                    <Flag country={c} className={styles.rowFlag} />
                    <span className={styles.rowName}>{countryLabel(c)}</span>
                    {active && <span className={styles.rowBadge}>{coverage(c)}</span>}
                  </button>
                </Fragment>
              );
            })}
          </aside>

          <section className={styles.panel}>
            {draft.countries.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.emptyArt} aria-hidden="true">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.5 2.6 4 6.2 4 10s-1.5 7.4-4 10c-2.5-2.6-4-6.2-4-10s1.5-7.4 4-10z"/></svg>
                </span>
                <p className={styles.emptyTitle}>{t('destinationModal.emptyTitle', 'Start with a country')}</p>
                <p className={styles.emptyText}>
                  {t('destinationModal.emptyText', 'Tick a country on the left, then choose the whole country or only the destinations you want.')}
                </p>
              </div>
            )}

            {draft.countries.map((c) => {
              const group = placesByCountry[c.id];
              const isError = errorIds.has(c.id);
              const isLoading = !group && !isError;
              const specific = isSpecific(c.id);
              const isOpen = activeId === c.id;
              const toggleOpen = () => setActiveId(isOpen ? null : c.id);

              return (
                <div
                  className={`${styles.block} ${isOpen ? styles.blockOpen : ''}`}
                  key={c.id}
                  ref={isOpen ? (el) => el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) : undefined}
                >
                  <div
                    className={styles.blockHead}
                    onClick={toggleOpen}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
                    }}
                  >
                    <span className={`${styles.chev} ${isOpen ? styles.chevOpen : ''}`} aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </span>
                    <Flag country={c} className={styles.blockFlag} />
                    <div className={styles.blockText}>
                      <span className={styles.blockName}>{countryLabel(c)}</span>
                      {isOpen && (
                        <span className={styles.blockSub}>
                          {t('destinationModal.howToSearch', 'Select how you want to search within this country.')}
                        </span>
                      )}
                    </div>
                    {!isOpen && <span className={styles.statusPill}>{coverage(c, { selected: true })}</span>}
                    <button
                      type="button"
                      className={styles.blockRemove}
                      onClick={(e) => { e.stopPropagation(); toggleCountry(c); }}
                      aria-label={t('destinationModal.remove', { name: countryLabel(c), defaultValue: 'Remove {{name}}' })}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className={styles.blockBody}>
                      <div
                        className={styles.modes}
                        role="radiogroup"
                        aria-label={t('destinationModal.howToSearch', 'Select how you want to search within this country.')}
                      >
                        {[
                          { mode: 'whole', on: !specific,
                            title: t('destinationModal.modeWhole', 'Whole country'),
                            text: t('destinationModal.modeWholeText', 'Search all active destinations') },
                          { mode: 'specific', on: specific,
                            title: t('destinationModal.modeSpecific', 'Specific destinations'),
                            text: t('destinationModal.modeSpecificText', 'Choose only the region(s)/city(ies) you want') },
                        ].map((m) => (
                          <button
                            key={m.mode}
                            type="button"
                            role="radio"
                            aria-checked={m.on}
                            className={`${styles.mode} ${m.on ? styles.modeOn : ''}`}
                            onClick={() => setMode(c.id, m.mode)}
                          >
                            <span className={`${styles.radio} ${m.on ? styles.radioOn : ''}`} aria-hidden="true" />
                            <span className={styles.modeText}>
                              <span className={styles.modeTitle}>{m.title}</span>
                              <span className={styles.modeSub}>{m.text}</span>
                            </span>
                          </button>
                        ))}
                      </div>

                      {specific && isLoading && (
                        <div className={styles.chips}>
                          {Array.from({ length: 6 }).map((_, i) => <span key={i} className={styles.skelChip} />)}
                        </div>
                      )}

                      {specific && isError && (
                        <div className={styles.blockError}>
                          {t('destinationModal.placesError', {
                            country: countryLabel(c),
                            defaultValue: 'Couldn’t load places for {{country}}.',
                          })}
                          <button type="button" className={styles.retryBtn} onClick={() => retryCountry(c.id)}>
                            {t('destinationModal.retry', 'Retry')}
                          </button>
                        </div>
                      )}

                      {specific && !isLoading && !isError && group && renderPlaces(c, group)}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        {/* ── Footer: what will be searched, Clear, Apply ── */}
        <div className={styles.footer}>
          <div className={styles.recap} aria-live="polite">
            <span className={styles.recapPin}><PinIcon /></span>
            {draft.countries.length === 0 ? (
              <span className={styles.recapEmpty}>{t('destinationModal.recapEmpty', 'Your picks will appear here')}</span>
            ) : (
              <span className={styles.recapText}>
                <strong>{t('destinationModal.selected', 'Selected:')}</strong> {summary}
              </span>
            )}
          </div>

          <div className={styles.footActions}>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={clearAll}
              disabled={draft.countries.length === 0}
            >
              {t('destinationModal.clear', 'Clear')}
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              disabled={totalDestinations === 0}
              onClick={() => onApply(draft)}
            >
              {t('destinationModal.applyShort', 'Apply')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
