import { useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import styles from './HolidayType.module.css';
import { useHolidayTypeCountries, useHomepageConfig, useCountries } from '../../api';
import { destsForHolidayType, destUrl, destLabel } from '../../utils/cmsDestinations';

const titleFor = (name) => `Our best ${String(name || 'holidays').toLowerCase()}`;

// 'last-minute' → 'Last Minute'. Lets the banner read correctly from the URL
// alone, so a slow or failing API never leaves the header blank.
const nameFromSlug = (slug) =>
  String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export default function HolidayType() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { execute, data, loading, error } = useHolidayTypeCountries();

  useEffect(() => {
    if (slug) execute(slug);
  }, [slug, execute]);

  const holidayType = data?.holidayType ?? null;
  const countries   = data?.countries ?? [];

  const typeName = holidayType?.name || nameFromSlug(slug);
  const heading  = holidayType?.title || titleFor(typeName);

  // What the dashboard picked for this holiday type. When set, it REPLACES the
  // linked-country grid — that list is the editorial one, so it wins.
  const { data: cms } = useHomepageConfig();
  const cmsDests = destsForHolidayType(cms, { id: holidayType?.id, slug });

  // Every country, purely to borrow flags/artwork for the CMS entries (a picked
  // country need not be linked to this holiday type, so `countries` may not hold it).
  const { data: allCountries } = useCountries();
  const countryLookup = useMemo(() => {
    const byCode = new Map();
    const byName = new Map();
    (allCountries ?? []).forEach((c) => {
      if (c?.code) byCode.set(String(c.code).toUpperCase(), c);
      if (c?.isoCode) byCode.set(String(c.isoCode).toUpperCase(), c);
      if (c?.name) byName.set(String(c.name).toLowerCase(), c);
    });
    return { byCode, byName };
  }, [allCountries]);

  // One shape for both sources so the grid below renders them identically.
  const items = useMemo(() => {
    if (cmsDests.length) {
      return cmsDests.map((d) => {
        const parent =
          d.type === 'country'
            ? countryLookup.byCode.get(String(d.code).toUpperCase())
            : countryLookup.byName.get(String(d.countryName || '').toLowerCase());
        return {
          key: `${d.type}:${d.code}`,
          name: d.name || d.code,
          desc: d.type === 'city' ? d.countryName || 'City' : parent?.description || null,
          flagUrl: parent?.flagUrl || null,
          // Only a whole country carries usable artwork; a city would show its
          // country's photo, which misleads.
          imageUrl: d.type === 'country' ? parent?.imageUrl || null : null,
          href: destUrl(d),
          title: destLabel(d),
        };
      });
    }
    // No CMS selection — fall back to the countries linked in the dashboard.
    return countries.map((c) => {
      const qs = new URLSearchParams();
      // The results page matches Country.code (the Hotelbeds code), NOT the ISO
      // code — they diverge (Cyprus is NY, the UK is UK).
      qs.set('countries', c.code || c.isoCode || '');
      qs.set('destinationLabel', c.name || '');
      return {
        key: `country:${c.id}`,
        name: c.name,
        desc: c.description || null,
        flagUrl: c.flagUrl || null,
        imageUrl: c.imageUrl || null,
        href: `/results?${qs.toString()}`,
        title: c.name,
      };
    });
  }, [cmsDests, countries, countryLookup]);

  return (
    <div className={styles.page}>
      {/* Dark banner — carries the hero's glass/gold language onto this page */}
      <div className={styles.banner}>
        <div className={styles.bannerBlob1} />
        <div className={styles.bannerBlob2} />
        <div className={styles.bannerInner}>
          <nav className={styles.crumbs}>
            <Link to="/" className={styles.crumbLink}>Home</Link>
            <span className={styles.crumbSep}>/</span>
            <span className={styles.crumbActive}>{typeName || 'Holidays'}</span>
          </nav>

          <h1 className={styles.title}>{heading}</h1>

          {holidayType?.paragraph1 ? (
            <p className={styles.lede}>{holidayType.paragraph1}</p>
          ) : (
            <p className={styles.lede}>
              Pick a country and we’ll show you every stay we have there.
            </p>
          )}
        </div>
      </div>

      <div className={styles.inner}>
        {loading && (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`${styles.card} ${styles.skeleton}`} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className={styles.state}>
            <span className={styles.stateIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            </span>
            <h3>We couldn’t load these destinations</h3>
            <p>The connection to our travel data failed. Give it another try.</p>
            <button className={styles.cta} onClick={() => execute(slug)}>Try again</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className={styles.state}>
            <span className={styles.stateIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <h3>No destinations yet</h3>
            <p>We haven’t linked any countries to {typeName.toLowerCase()} yet. Check back soon.</p>
            <Link to="/" className={styles.cta}>Explore other holidays</Link>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className={styles.grid}>
            {items.map((c, i) => {
              const hasPhoto = Boolean(c.imageUrl);
              return (
                <button
                  key={c.key}
                  type="button"
                  title={c.title}
                  className={`${styles.card} ${hasPhoto ? styles.cardPhoto : styles.cardFlag}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 55}ms`, '--theme': i % 6 }}
                  onClick={() => navigate(c.href)}
                >
                  {hasPhoto ? (
                    <img className={styles.cardImg} src={c.imageUrl} alt={c.name} loading="lazy" />
                  ) : (
                    // No mainImage: a designed flag card — themed gradient, a subtle
                    // globe motif, and the crisp flag shown as a floating badge.
                    <div className={styles.flagArt} aria-hidden="true">
                      <span className={styles.flagOrbit} />
                      <span className={styles.flagOrbit2} />
                      <svg className={styles.flagGlobe} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.6">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                      </svg>
                      {c.flagUrl && (
                        <img className={styles.flagBadge} src={c.flagUrl} alt="" loading="lazy" />
                      )}
                    </div>
                  )}

                  <div className={styles.cardShade} />

                  <div className={styles.cardBody}>
                    <div className={styles.cardTop}>
                      {c.flagUrl && (
                        <img className={styles.cardChip} src={c.flagUrl} alt="" loading="lazy" width="26" height="19" />
                      )}
                    </div>

                    <div className={styles.cardFoot}>
                      <h3 className={styles.cardName}>{c.name}</h3>
                      {c.desc && <p className={styles.cardDesc}>{c.desc}</p>}
                      <span className={styles.cardCta}>
                        Explore stays
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </span>
                    </div>
                  </div>

                  <span className={styles.cardGo} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
