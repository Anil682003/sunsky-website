import { useId, useMemo } from 'react';
import styles from './HotelPhotoFallback.module.css';

/* A designed stand-in for a hotel photo that doesn't exist (the property has no image set)
   or that the CDN refuses to serve (every size in HotelImg's chain 404/403'd).
 *
 * Before this, a missing photo either showed a stock Unsplash beach — a picture of a hotel
 * the traveller isn't looking at — or `display:none`, which left a bare navy hole in the
 * hero mosaic. Both read as broken. This paints an illustrated dawn-coast scene in the
 * brand palette instead: honest (it never pretends to be the property) and composed enough
 * to sit in the hero next to real photography.
 *
 *   variant="hero"  full panel with the hotel name, location and a reassurance line
 *   variant="tile"  scene only + a small camera mark, for one broken tile in the mosaic
 *
 * The scene is deterministic per hotel: `seed` (the hotel code) shifts the sun, the
 * headlands and the boat, so two hotels without photos don't render the identical picture,
 * and the SAME hotel looks the same on every visit.
 */

const hashSeed = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const Pin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

const Camera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default function HotelPhotoFallback({
  name = '',
  location = '',
  seed = '',
  variant = 'hero',
  badge = 'Photos on the way',
  className = '',
}) {
  const uid = useId().replace(/:/g, '');
  const v = useMemo(() => {
    const h = hashSeed(String(seed || name || 'sunsky'));
    return {
      sunX: 424 + (h % 5) * 46,            // 424 → 608
      capeX: 96 + ((h >> 3) % 5) * 22,     // left headland width
      boatX: 366 + ((h >> 6) % 6) * 48,    // 366 → 606 — clear of the palms on the left
      isle: ((h >> 9) % 3),                // how many far islands
    };
  }, [seed, name]);

  const tile = variant === 'tile';
  const id = (k) => `${uid}-${k}`;

  return (
    <div className={`${styles.wrap} ${tile ? styles.tile : styles.hero} ${className}`}>
      <svg className={styles.scene} viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E4EEFF" />
            <stop offset="46%" stopColor="#F2F7FF" />
            <stop offset="74%" stopColor="#FFF1DC" />
            <stop offset="100%" stopColor="#FFE0B8" />
          </linearGradient>
          <radialGradient id={id('glow')}>
            <stop offset="0%" stopColor="#FFD166" stopOpacity=".78" />
            <stop offset="42%" stopColor="#FFC46B" stopOpacity=".26" />
            <stop offset="100%" stopColor="#FFB35C" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('sun')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE9B0" />
            <stop offset="60%" stopColor="#FFC55E" />
            <stop offset="100%" stopColor="#FF9F1C" />
          </linearGradient>
          <linearGradient id={id('sea')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C4DEFF" />
            <stop offset="42%" stopColor="#93C2F8" />
            <stop offset="100%" stopColor="#6BA4EC" />
          </linearGradient>
          <linearGradient id={id('sand')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF3DF" />
            <stop offset="100%" stopColor="#F8DDB4" />
          </linearGradient>
          <linearGradient id={id('cape')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A9CDFF" />
            <stop offset="100%" stopColor="#7FB0F2" />
          </linearGradient>
        </defs>

        {/* sky */}
        <rect width="800" height="500" fill={`url(#${id('sky')})`} />

        {/* faint chart lines — the map texture the rest of the brand uses */}
        <g stroke="#8FBBF5" strokeOpacity=".22" strokeWidth="1" strokeDasharray="3 12" strokeLinecap="round">
          <path d="M-10 96H810" /><path d="M-10 152H810" /><path d="M-10 214H810" />
        </g>

        {/* sun + halo rings */}
        <circle cx={v.sunX} cy="272" r="210" fill={`url(#${id('glow')})`} className={styles.halo} />
        <g fill="none" stroke="#FFB65E" strokeOpacity=".2">
          <circle cx={v.sunX} cy="272" r="86" />
          <circle cx={v.sunX} cy="272" r="124" strokeOpacity=".13" />
          <circle cx={v.sunX} cy="272" r="168" strokeOpacity=".08" />
        </g>
        <circle cx={v.sunX} cy="272" r="48" fill={`url(#${id('sun')})`} />
        {/* haze banding across the disc */}
        <g fill="#FFF5E4" fillOpacity=".55">
          <rect x={v.sunX - 62} y="254" width="124" height="5" rx="2.5" />
          <rect x={v.sunX - 52} y="284" width="104" height="4" rx="2" />
        </g>

        {/* drifting cloud bars */}
        <g fill="#FFFFFF" fillOpacity=".62" className={styles.clouds}>
          <rect x="88" y="118" width="150" height="10" rx="5" />
          <rect x="128" y="140" width="92" height="8" rx="4" />
          <rect x="560" y="96" width="118" height="9" rx="4.5" fillOpacity=".45" />
          <rect x="596" y="116" width="66" height="7" rx="3.5" fillOpacity=".4" />
        </g>

        {!tile && (
          <>
            {/* dotted route + aircraft — the same travel language as the boarding-pass screens */}
            <path d="M28 250C168 140 392 126 552 176" fill="none" stroke="#5FA8FF" strokeOpacity=".5" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1 13" />
            {/* the placement lives on the outer <g>: a CSS transform on the same element
                would replace the transform attribute and drop the plane at 0,0. */}
            <g transform="translate(556 174) rotate(20)" fill="#3A6FE8" fillOpacity=".72">
              <g className={styles.plane}>
                <path d="M0-3.4 22 6l-22 9-7-4 6-5h-14l-5 5h-6l3-9-3-9h6l5 5h14l-6-5z" />
              </g>
            </g>
            {/* birds */}
            <g fill="none" stroke="#2F4E8C" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round">
              <path d="M628 218c6-7 11-7 16 0M652 208c5-6 10-6 14 0" />
            </g>
          </>
        )}

        {/* headlands */}
        {v.isle > 0 && (
          <path d="M300 322c48-12 74-40 112-44s62 24 104 44z" fill="#BCD9FF" fillOpacity=".85" />
        )}
        <path d={`M-10 322c${v.capeX * 0.5} -14 ${v.capeX * 0.7} -66 ${v.capeX} -70 44-6 84 40 148 70z`} fill={`url(#${id('cape')})`} fillOpacity=".92" />
        <path d="M556 322c62-20 96-58 148-62 44-3 78 34 116 62z" fill={`url(#${id('cape')})`} fillOpacity=".8" />

        {/* sea */}
        <rect x="0" y="320" width="800" height="180" fill={`url(#${id('sea')})`} />
        {/* sun path on the water */}
        <g fill="#FFFFFF" className={styles.shimmer}>
          <rect x={v.sunX - 26} y="328" width="52" height="5" rx="2.5" fillOpacity=".5" />
          <rect x={v.sunX - 42} y="344" width="84" height="5" rx="2.5" fillOpacity=".4" />
          <rect x={v.sunX - 30} y="362" width="60" height="5" rx="2.5" fillOpacity=".34" />
          <rect x={v.sunX - 58} y="382" width="116" height="6" rx="3" fillOpacity=".28" />
          <rect x={v.sunX - 36} y="406" width="72" height="6" rx="3" fillOpacity=".22" />
        </g>
        {/* swell */}
        <g fill="none" stroke="#FFFFFF" strokeOpacity=".3" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="26 44">
          <path d="M-10 350H810" /><path d="M-30 378H790" strokeDasharray="18 52" />
          <path d="M-10 412H810" strokeOpacity=".22" strokeDasharray="34 40" />
        </g>

        {!tile && (
          /* sailboat */
          <g transform={`translate(${v.boatX} 0)`}>
            <g className={styles.boat}>
              <path d="M0 396V344l-30 52z" fill="#2F4E8C" fillOpacity=".5" />
              <path d="M6 396v-44l28 44z" fill="#2F4E8C" fillOpacity=".36" />
              <path d="M-32 400h74c-8 12-20 17-37 17s-29-5-37-17z" fill="#24406F" fillOpacity=".55" />
            </g>
          </g>
        )}

        {/* foreshore */}
        <path d="M-10 500v-52c136-24 268 18 400-6 122-22 268 14 420-6v64z" fill={`url(#${id('sand')})`} />
        <path d="M-10 500v-30c150-18 260 12 402-4 128-14 258 10 418-6v40z" fill="#FFFFFF" fillOpacity=".35" />

        {!tile && (
          /* palms */
          <g stroke="#2F4E8C" strokeOpacity=".46" strokeLinecap="round" fill="none">
            <g strokeWidth="9">
              <path d="M96 486c-10-58 2-96 26-124" />
            </g>
            <g strokeWidth="7">
              <path d="M122 362c-20-24-52-32-80-24" />
              <path d="M122 362c-14-30-40-52-72-60" />
              <path d="M122 362c2-34-8-64-32-88" />
              <path d="M122 362c22-30 56-46 90-44" />
              <path d="M122 362c26-14 58-14 86-2" />
            </g>
            <g strokeWidth="6" strokeOpacity=".3">
              <path d="M214 492c-6-38 2-62 18-80" />
              <path d="M232 412c-14-16-36-22-56-16" />
              <path d="M232 412c-8-22-26-36-48-42" />
              <path d="M232 412c16-20 40-30 64-28" />
            </g>
            <g fill="#2F4E8C" fillOpacity=".4" stroke="none">
              <circle cx="118" cy="374" r="4" /><circle cx="130" cy="378" r="3.4" />
            </g>
          </g>
        )}
      </svg>

      {tile ? (
        <span className={styles.tileMark}><Camera /></span>
      ) : (
        <div className={styles.overlay}>
          <span className={styles.badge}><Camera />{badge}</span>
          {name && <p className={styles.name}>{name}</p>}
          {location && <p className={styles.loc}><Pin />{location}</p>}
          <p className={styles.note}>
            This property hasn’t sent its photo set yet. Rooms, board options and live prices below are real — you can book today.
          </p>
        </div>
      )}
    </div>
  );
}
