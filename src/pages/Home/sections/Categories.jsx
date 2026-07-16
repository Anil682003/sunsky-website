import { Link } from 'react-router-dom';
import styles from './Categories.module.css';
import { useHolidayTypes } from '../../../api';

const SunIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
const CityIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h6"/></svg>;
const CarIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>;
const BoltIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
const CompassIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>;

// The cards the homepage has always shown. They stay the visual source of truth:
// the holiday-types API supplies the real name + id, these supply the artwork.
const FALLBACK_CATS = [
  { title: 'Sun Vacations', img: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600&q=80', icon: <SunIcon /> },
  { title: 'City Trips',    img: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&q=80', icon: <CityIcon /> },
  { title: 'Car Holidays',  img: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80', icon: <CarIcon /> },
  { title: 'Last Minute',   img: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80', icon: <BoltIcon /> },
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

// `icon` in the dashboard is free text, so the card icon is picked from the name.
function iconFor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('sun') || n.includes('beach')) return <SunIcon />;
  if (n.includes('city')) return <CityIcon />;
  if (n.includes('car') || n.includes('road')) return <CarIcon />;
  if (n.includes('last minute') || n.includes('deal')) return <BoltIcon />;
  return <CompassIcon />;
}

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M7 17L17 7M17 7H7M17 7v10"/>
  </svg>
);

export default function Categories({ cms }) {
  const sh = cms?.sectionHeaders?.categories;
  const tag      = sh?.tag      || '✦ Explore';
  const title    = sh?.title    || 'Something for everyone';
  const subtitle = sh?.subtitle || 'Find the perfect holiday that suits your travel style and budget.';

  const { data: typesData } = useHolidayTypes();
  const types = typesData ?? [];

  const cmsCats = cms?.categories ?? [];
  const artworkFor = (name, i) =>
    cmsCats.find((c) => slugify(c.title) === slugify(name))?.imageUrl ||
    FALLBACK_CATS.find((c) => slugify(c.title) === slugify(name))?.img ||
    IMAGE_POOL[i % IMAGE_POOL.length];

  // The grid is designed for MAX_CARDS cards, but the dashboard exposes every
  // holiday type. The CMS picks which ones are featured (and their artwork);
  // without a selection we simply show the first few types.
  const featured = (cms?.featuredHolidayTypes ?? []).filter(
    (f) => f && (f.holidayTypeId != null || f.title)
  );

  const cardFromType = (t, i, imageUrl) => ({
    key:  t.id ?? t.name,
    name: t.name,
    slug: t.slug || slugify(t.name),
    img:  imageUrl || artworkFor(t.name, i),
    icon: iconFor(t.name),
  });

  let cards;
  if (featured.length > 0 && types.length > 0) {
    // Hand-picked selection: resolve each entry against the live holiday types
    // so names/slugs stay current; skip any type that no longer exists.
    cards = featured
      .map((f, i) => {
        const t =
          types.find((x) => String(x.id) === String(f.holidayTypeId)) ||
          types.find((x) => slugify(x.name) === slugify(f.title));
        return t ? cardFromType(t, i, f.imageUrl) : null;
      })
      .filter(Boolean);
  } else if (types.length > 0) {
    // No selection yet — show the first few types rather than all of them.
    cards = types.map((t, i) => cardFromType(t, i));
  } else {
    // Types API unreachable: keep the original cards so the section never blanks.
    cards = (cmsCats.length > 0 ? cmsCats : FALLBACK_CATS).map((c, i) => ({
      key:  c.title,
      name: c.title,
      slug: slugify(c.title),
      img:  c.imageUrl || c.img || IMAGE_POOL[i % IMAGE_POOL.length],
      icon: c.icon || iconFor(c.title),
    }));
  }

  cards = cards.slice(0, MAX_CARDS);

  return (
    <div className={styles.sectionAlt}>
      <div className={styles.section}>
        <div className={styles.header}>
          <div>
            <div className={styles.tag}>{tag}</div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.sub}>{subtitle}</p>
          </div>
        </div>
        <div className={styles.grid}>
          {cards.map((c) => (
            <Link key={c.key} to={`/holidays/${c.slug}`} className={styles.card}>
              <img src={c.img} alt={c.name} loading="lazy" />
              <div className={styles.overlay}>
                <div className={styles.icon}>{c.icon}</div>
                <div className={styles.cardTitle}>{c.name}</div>
              </div>
              <div className={styles.arrow}><ArrowIcon /></div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
