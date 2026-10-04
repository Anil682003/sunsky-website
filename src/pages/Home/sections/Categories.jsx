import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Categories.module.css';
import SectionHead from './SectionHead';
import { useHolidayTypes } from '../../../api';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import { destUrl } from '../../../utils/cmsDestinations';
import { categoryCards, categoriesShowAllUrl } from '../../../utils/showAllSearches';
import ShowAllLink from '../../../components/ShowAllLink/ShowAllLink';
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

  // Which cards, and the places each links, come from utils/showAllSearches — shared with the
  // "Show all" warmer, so the warmed search is the one behind this button. This adds the artwork
  // and the wording.
  const cards = categoryCards(cms, types, { fallbackCount: FALLBACK_CATS.length }).map((c, i) => {
    if (c.type) {
      return {
        key:  c.type.id ?? c.type.name,
        name: c.type.name,
        slug: c.type.slug || slugify(c.type.name),
        img:  resolveCmsImageUrl(c.featured?.imageUrl) || artworkFor(c.type.name, c.index ?? i),
        destinations: c.destinations,
      };
    }
    // Types API unreachable: keep the original cards so the section never blanks.
    const cat = c.cmsCategory || FALLBACK_CATS[i];
    return {
      key:  cat.title,
      // A shipped card carries a key; a dashboard one is already in its own words.
      name: cat.key ? t(`categories.cats.${cat.key}`, cat.title) : cat.title,
      slug: slugify(cat.title),
      img:  resolveCmsImageUrl(cat.imageUrl) || cat.img || IMAGE_POOL[i % IMAGE_POOL.length],
      destinations: c.destinations,
    };
  });

  // "Show all" searches every place the cards feature, in one search. Places only: see
  // sectionSearchUrl for why the holiday types do not travel as a filter.
  const showAllHref = categoriesShowAllUrl(cms, types);

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead
          eyebrow={tag}
          title={title}
          subtitle={subtitle}
          action={showAllHref ? (
            <ShowAllLink to={showAllHref}>{t('sections.showAll', 'Show all')}</ShowAllLink>
          ) : null}
        />

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
