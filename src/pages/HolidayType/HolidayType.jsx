import { useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import styles from './HolidayType.module.css';
import { useHolidayTypeCountries } from '../../api';

// Mosaic rhythm — a hero tile, then alternating wide/narrow rows so the grid
// never reads as a plain 3-across. Index-based, so any count tiles cleanly.
const SPANS = ['hero', 'tall', 'narrow', 'narrow', 'wide', 'narrow', 'narrow', 'wide'];
const spanFor = (i) => SPANS[i % SPANS.length];

const titleFor = (name) => `Our best ${String(name || 'holidays').toLowerCase()}`;

// A raster flag big enough to blur into a full-bleed backdrop. flagcdn serves the
// SVG we already use, so no new dependency — just a wider raster of the same asset.
const flagBackdrop = (c) => {
  const iso = String(c.isoCode || c.code || '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(iso) ? `https://flagcdn.com/w1280/${iso}.jpg` : null;
};

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

  const openCountry = (c) => {
    const qs = new URLSearchParams({
      destination:      c.isoCode || c.code || '',
      destinationLabel: c.name,
    });
    navigate(`/results?${qs.toString()}`);
  };

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
          <div className={styles.mosaic}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${styles.tile} ${styles[spanFor(i)]} ${styles.skeleton}`} />
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

        {!loading && !error && countries.length === 0 && (
          <div className={styles.state}>
            <span className={styles.stateIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <h3>No destinations yet</h3>
            <p>We haven’t linked any countries to {typeName.toLowerCase()} yet. Check back soon.</p>
            <Link to="/" className={styles.cta}>Explore other holidays</Link>
          </div>
        )}

        {!loading && !error && countries.length > 0 && (
          <div className={styles.mosaic}>
            {countries.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.tile} ${styles[spanFor(i)]}`}
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                onClick={() => openCountry(c)}
              >
                {c.imageUrl ? (
                  <img className={styles.tileImg} src={c.imageUrl} alt={c.name} loading="lazy" />
                ) : (
                  // No mainImage in the admin — fall back to the country's own flag,
                  // blown up and blurred into a backdrop rather than a generic panel.
                  <div className={styles.tileFallback} aria-hidden="true">
                    {flagBackdrop(c) && (
                      <img className={styles.tileFallbackImg} src={flagBackdrop(c)} alt="" loading="lazy" />
                    )}
                    <div className={styles.tileFallbackWash} />
                  </div>
                )}

                <div className={styles.tileShade} />

                <div className={styles.tileBody}>
                  <div className={styles.tileFlagRow}>
                    {c.flagUrl && (
                      <img className={styles.tileFlag} src={c.flagUrl} alt="" loading="lazy" width="26" height="19" />
                    )}
                    <span className={styles.tileName}>{c.name}</span>
                  </div>

                  {c.description && <p className={styles.tileDesc}>{c.description}</p>}

                  <span className={styles.tileCta}>
                    Explore
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
