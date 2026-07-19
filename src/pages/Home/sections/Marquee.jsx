import styles from './Marquee.module.css';

const FALLBACK = ['Best Price Guarantee','10,000+ Holidays','No Booking Fees','Secure Payments','24/7 Support','Trusted by 2M+ Travelers','Free Cancellation','Award-Winning Service'];

/* decorative ghost belt content — airport routes interleaved with handwriting */
const GHOST_ITEMS = [
  'BRU ✈ AYT', 'wanderlust', 'TFS ✈ HRG', 'golden hour',
  'JFK ✈ PMI', 'boarding soon…', 'CDG ✈ RHO', 'sea breeze',
  'IST ✈ BKK', 'now arriving', 'LIS ✈ DXB', 'sun-chasing',
];

export default function Marquee({ cms }) {
  const items = (cms?.marqueeItems?.length > 0) ? cms.marqueeItems : FALLBACK;
  const doubled = [...items, ...items];
  const ghostDoubled = [...GHOST_ITEMS, ...GHOST_ITEMS];

  return (
    <div className={styles.wrap}>
      {/* ambient page layers */}
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.dots} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      {/* handwritten margin note pointing at the belt */}
      <div className={styles.note} aria-hidden="true">
        <span className={styles.noteText}>fresh finds, every day!</span>
        <svg
          className={styles.noteArrow}
          width="30" height="26" viewBox="0 0 30 26"
          fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M26 2c-4 9-11 15-21 17" />
          <path d="M9 14l-4 5 6.5 1" />
        </svg>
      </div>

      {/* the tilted baggage-belt sticker strip */}
      <div className={styles.strip}>
        {/* ghost belt — slower, counter-direction routes + handwriting */}
        <div className={styles.ghostBelt} aria-hidden="true">
          <div className={styles.ghostTrack}>
            {ghostDoubled.map((g, i) => (
              <span key={i} className={styles.ghostItem}>{g}</span>
            ))}
          </div>
        </div>

        {/* main stamp-chip belt — loop mechanics unchanged */}
        <div className={styles.track}>
          {doubled.map((item, i) => (
            <div key={i} className={styles.item}>
              <span className={styles.chip}>
                <span className={styles.spark} aria-hidden="true">✦</span>
                {item}
              </span>
              <svg
                className={styles.plane}
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12 3 4.5 6 12l-3 7.5L21 12Z" />
              </svg>
            </div>
          ))}
        </div>

        {/* dashed flight track with waypoints + gliding plane */}
        <div className={styles.rail} aria-hidden="true">
          <span className={styles.railDot} />
          <span className={styles.railDot} />
          <span className={styles.railDot} />
          <svg
            className={styles.railPlane}
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12 3 4.5 6 12l-3 7.5L21 12Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
