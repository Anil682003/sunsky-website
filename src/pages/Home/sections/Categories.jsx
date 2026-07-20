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

const PlaneIcon = () => (
  <svg className={styles.headPlane} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13"/>
    <path d="M22 2l-7 20-4-9-9-4 22-7z"/>
  </svg>
);

/* Circular passport-style ink stamp — printed over the first ticket only */
const StampRing = () => (
  <span className={styles.stamp} aria-hidden="true">
    <svg viewBox="0 0 100 100" width="88" height="88">
      <defs>
        <path id="catStampArc" d="M 50,50 m -32,0 a 32,32 0 1,1 64,0 a 32,32 0 1,1 -64,0" />
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 5" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="10" fontWeight="700" letterSpacing="2.6" fill="currentColor">
        <textPath href="#catStampArc">SUNSKY · APPROVED · SUNSKY ·</textPath>
      </text>
      <path d="M50 42l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="currentColor"/>
    </svg>
  </span>
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
    (f) => f && (f.holidayTypeId != null || f.title) && f.active !== false
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

  // The CMS title keeps its text; only the last word is wrapped so it can
  // carry the cursive Golden Hour accent.
  const titleWords = String(title).trim().split(/\s+/);
  const titleLast = titleWords.pop();
  const titleLead = titleWords.join(' ');

  return (
    <section className={styles.sectionAlt}>
      {/* ── Background scene: glows, ghost numeral, dot paper, clouds, grain ── */}
      <div className={styles.bgArt} aria-hidden="true">
        <span className={styles.ghost}>01</span>
        <span className={styles.dots} />
        <span className={`${styles.cloud} ${styles.cloud1}`} />
        <span className={`${styles.cloud} ${styles.cloud2}`} />
        <span className={styles.grain} />
      </div>

      <div className={styles.section}>
        <div className={styles.header}>
          <div className={styles.headRow}>
            <span className={styles.headIndex}>01</span>
            <span className={styles.headEyebrow}>{tag}</span>
            <span className={styles.headRule} aria-hidden="true" />
            <span className={styles.headCode} aria-hidden="true">GATE 01 · NOW BOARDING</span>
            <PlaneIcon />
          </div>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>
              {titleLead && `${titleLead} `}
              <span className={styles.titleAccent}>{titleLast}</span>
            </h2>
            <span className={styles.scribble} aria-hidden="true">
              pick your vibe
              <svg className={styles.scribbleArrow} viewBox="0 0 32 36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4 C 24 6, 26 18, 14 30" />
                <path d="M9 25l5 6 7-3" />
              </svg>
            </span>
          </div>
          <p className={styles.sub}>{subtitle}</p>
        </div>

        {/* ── Tickets tossed on the desk, a flight route sketched beneath ── */}
        <div className={styles.gridWrap}>
          <svg className={styles.route} viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
            <path
              className={styles.routePath}
              d="M 40 280 Q 300 110 600 240 T 1160 150"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray="2 10" strokeLinecap="round"
            />
            <circle cx="40" cy="280" r="4.5" fill="currentColor" />
            <circle cx="600" cy="240" r="4.5" fill="currentColor" />
            <circle cx="1160" cy="150" r="4.5" fill="currentColor" />
            <g transform="translate(872,264) rotate(36) scale(1.1)">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 22-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>

          <div className={styles.grid}>
            {cards.map((c, i) => (
              <Link
                key={c.key}
                to={`/holidays/${c.slug}`}
                className={styles.card}
                style={{ '--i': i }}
              >
                {i === 0 && <StampRing />}
                <span className={styles.ticket}>
                  <span className={styles.imgWrap}>
                    <img src={c.img} alt={c.name} loading="lazy" />
                  </span>
                  <span className={styles.stub}>
                    <span className={styles.iconChip}>{c.icon}</span>
                    <span className={styles.stubText}>
                      <span className={styles.cardTitle}>{c.name}</span>
                      <span className={styles.explore}>Explore <ArrowIcon /></span>
                    </span>
                    <span className={styles.stubSide} aria-hidden="true">
                      <span className={styles.barcode} />
                      <span className={styles.stubCode}>
                        {`SSK · ${String(i + 1).padStart(2, '0')}`}
                      </span>
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
