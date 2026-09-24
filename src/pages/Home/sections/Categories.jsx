import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Categories.module.css';
import SectionHead from './SectionHead';
import { useHolidayTypes } from '../../../api';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import { normalizeDests, destUrl } from '../../../utils/cmsDestinations';
import { useTranslation } from 'react-i18next';

// The cards the homepage has always shown. They stay the visual source of truth:
// the holiday-types API supplies the real name + id, these supply the artwork.
const FALLBACK_CATS = [
  { key: 'sunVacations', title: 'Sun Vacations', img: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600&q=80' },
  { key: 'cityTrips', title: 'City Trips',    img: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&q=80' },
  { key: 'carHolidays', title: 'Car Holidays',  img: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80' },
  { key: 'lastMinute', title: 'Last Minute',   img: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80' },
];

const IMAGE_POOL = [
  ...FALLBACK_CATS.map((c) => c.img),
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
];

// The categories grid is built for exactly four cards; the CMS decides which
// holiday types fill them (Homepage Settings → Featured Holiday Types).
const MAX_CARDS = 4;
const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
);

const ChevronIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6"/>
  </svg>
);

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const GlobeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>
);

export default function Categories({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.categories;
  const tag      = sh?.tag      || t('categories.tag', 'Explore');
  const title    = sh?.title    || t('categories.title', 'Something for everyone');
  const subtitle = sh?.subtitle || t('categories.subtitle', 'Find the perfect holiday that suits your travel style and budget.');

  const { data: typesData } = useHolidayTypes();
  const types = typesData ?? [];

  // Which cards have their destination slip pulled out. Several can be open at
  // once — closing a neighbour the visitor did not touch reads as a glitch.
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const toggleCard = (key) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const cmsCats = cms?.categories ?? [];
  // Dashboard uploads are stored as "/uploads/…", which only resolves against the
  // ADMIN origin — without resolveCmsImageUrl they 404 against the customer site.
  const artworkFor = (name, i) =>
    resolveCmsImageUrl(cmsCats.find((c) => slugify(c.title) === slugify(name))?.imageUrl) ||
    FALLBACK_CATS.find((c) => slugify(c.title) === slugify(name))?.img ||
    IMAGE_POOL[i % IMAGE_POOL.length];

  // The grid is designed for MAX_CARDS cards, but the dashboard exposes every
  // holiday type. The CMS picks which ones are featured (and their artwork);
  // without a selection we simply show the first few types.
  const featured = (cms?.featuredHolidayTypes ?? []).filter(
    (f) => f && (f.holidayTypeId != null || f.title) && f.active !== false
  );

  const cardFromType = (type, i, f) => ({
    key:  type.id ?? type.name,
    name: type.name,
    slug: type.slug || slugify(type.name),
    img:  resolveCmsImageUrl(f?.imageUrl) || artworkFor(type.name, i),
    destinations: normalizeDests(f?.destinations),
  });

  let cards;
  if (featured.length > 0 && types.length > 0) {
    // Hand-picked selection: resolve each entry against the live holiday types
    // so names/slugs stay current; skip any type that no longer exists.
    cards = featured
      .map((f, i) => {
        const type =
          types.find((x) => String(x.id) === String(f.holidayTypeId)) ||
          types.find((x) => slugify(x.name) === slugify(f.title));
        return type ? cardFromType(type, i, f) : null;
      })
      .filter(Boolean);
  } else if (types.length > 0) {
    // No selection yet — show the first few types rather than all of them.
    cards = types.map((type, i) => cardFromType(type, i));
  } else {
    // Types API unreachable: keep the original cards so the section never blanks.
    cards = (cmsCats.length > 0 ? cmsCats : FALLBACK_CATS).map((c, i) => ({
      key:  c.title,
      // A shipped card carries a key; a dashboard one is already in its own words.
      name: c.key ? t(`categories.cats.${c.key}`, c.title) : c.title,
      slug: slugify(c.title),
      img:  resolveCmsImageUrl(c.imageUrl) || c.img || IMAGE_POOL[i % IMAGE_POOL.length],
      destinations: normalizeDests(c.destinations),
    }));
  }

  cards = cards.slice(0, MAX_CARDS);

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} />

        <div className={styles.grid}>
          {cards.map((c) => {
            const dests = c.destinations;
            const open = openKeys.has(c.key);
            const panelId = `cat-dests-${slugify(String(c.key))}`;
            return (
              <div key={c.key} className={styles.card}>
                <div className={styles.top}>
                  <Link to={`/holidays/${c.slug}`} className={styles.cardLink}>
                    <span className={styles.media}>
                      <img src={c.img} alt={c.name} loading="lazy" />
                    </span>
                    <span className={styles.body}>
                      <span className={styles.cardTitle}>{c.name}</span>
                      <span className={styles.explore}>{t('categories.explore', 'Explore')} <ArrowIcon /></span>
                    </span>
                  </Link>

                  {/* The holiday type's destinations, one tap away — only when the CMS gave
                      this holiday type destinations to reveal. It rides on the "Explore" line
                      rather than adding a row, so a card without destinations is no shorter
                      than its neighbours. */}
                  {dests.length > 0 && (
                    <button
                      type="button"
                      className={`${styles.destToggle} ${open ? styles.destToggleOpen : ''}`}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleCard(c.key)}
                    >
                      {/* The count stays put when open; the flipped chevron and aria-expanded
                          say the list is showing. */}
                      <span className={styles.destToggleLabel}>
                        {t('categories.destinationCount', {
                          count: dests.length,
                          defaultValue_one: '{{count}} destination',
                          defaultValue_other: '{{count}} destinations',
                        })}
                      </span>
                      <span className={styles.destToggleChevron}><ChevronIcon /></span>
                    </button>
                  )}
                </div>

                {dests.length > 0 && (
                  <div className={`${styles.destWrap} ${open ? styles.destWrapOpen : ''}`}>
                    <div className={styles.destInner}>
                      <div className={styles.destPanel} id={panelId}>
                        {dests.map((d) => (
                          <Link
                            key={`${d.type}:${d.code}`}
                            to={destUrl(d)}
                            className={styles.destChip}
                            tabIndex={open ? 0 : -1}
                          >
                            <span className={styles.destChipIcon}>
                              {d.type === 'country' ? <GlobeIcon /> : <PinIcon />}
                            </span>
                            <span className={styles.destChipName}>{d.name}</span>
                            <span className={styles.destChipCode}>{d.code}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
