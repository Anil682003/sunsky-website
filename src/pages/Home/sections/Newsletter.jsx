import { useState } from 'react';
import styles from './Newsletter.module.css';

export default function Newsletter({ cms }) {
  const [email, setEmail] = useState('');

  const nl = cms?.newsletter;
  const title       = nl?.title            || 'Get exclusive holiday deals';
  const subtitle    = nl?.subtitle         || 'Subscribe for last-minute offers, travel inspiration, and member-only prices.';
  const placeholder = nl?.inputPlaceholder || 'Enter your email address';
  const btnText     = nl?.buttonText       || 'Subscribe';

  // Split the CMS title so the last word gets the Caveat gradient accent
  const words  = String(title).trim().split(/\s+/);
  const accent = words.length ? words.pop() : '';
  const lead   = words.join(' ');

  return (
    <div className={styles.wrap}>
      {/* ── the Golden Hour sky scene — all decorative, all behind content ── */}
      <div className={styles.bgArt} aria-hidden="true">
        <div className={styles.bgGrad} />
        <div className={styles.blob} />
        <div className={styles.sun}>
          <div className={styles.sunRays} />
          <div className={styles.sunCore} />
        </div>
        <div className={styles.ring} />
        <div className={`${styles.cloud} ${styles.cloud1}`} />
        <div className={`${styles.cloud} ${styles.cloud2}`} />
        <span className={styles.ghostWord}>bon voyage!</span>
        <svg className={styles.flightPath} viewBox="0 0 1200 260" fill="none" preserveAspectRatio="none">
          <path
            d="M-40 228 C 220 192, 420 82, 640 98 S 1040 44, 1240 28"
            stroke="rgba(31,79,216,0.16)" strokeWidth="1.6" strokeDasharray="7 9"
          />
          <circle cx="238" cy="188" r="4" fill="rgba(31,79,216,0.22)" />
          <circle cx="640" cy="98" r="4" fill="rgba(255,159,28,0.42)" />
          <circle cx="972" cy="52" r="4" fill="rgba(31,79,216,0.22)" />
          <g transform="translate(1100 34) rotate(9)">
            <path d="M0 6 L22 0 L8 9 L10 16 L5 11 L-4 12 Z" fill="rgba(31,79,216,0.35)" />
          </g>
        </svg>
        <div className={styles.dots} />
        <div className={styles.grain} />
      </div>

      <div className={styles.section}>
        <div className={styles.cardWrap}>

          {/* hot-air balloon drifting behind the ticket's left edge */}
          <svg className={styles.balloon} viewBox="0 0 120 164" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="ssbGradNL" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2E62E6" />
                <stop offset="0.55" stopColor="#3D7BF0" />
                <stop offset="1" stopColor="#7FB8FF" />
              </linearGradient>
            </defs>
            <path d="M60 4C27 4 8 30 8 60c0 30 27 51 39 64h26c12-13 39-34 39-64C112 30 93 4 60 4Z" fill="url(#ssbGradNL)" />
            <path d="M60 4C43 4 33 30 33 60c0 30 13 51 19 64h8V4Z" fill="rgba(255,255,255,0.28)" />
            <path d="M60 4c17 0 27 26 27 56 0 30-13 51-19 64h-8V4Z" fill="rgba(10,35,110,0.12)" />
            <path d="M10 47c16-9 84-9 100 0 1.5 4 2 9 2 13-18-8-86-8-104 0 0-4 .5-9 2-13Z" fill="#FFC24D" />
            <path d="M47 124l6 18M73 124l-6 18M60 124v18" stroke="#B07A22" strokeWidth="1.6" />
            <rect x="48" y="140" width="24" height="17" rx="4" fill="#D89B3F" />
            <rect x="48" y="140" width="24" height="6" rx="3" fill="#B07A22" />
          </svg>

          {/* circular ink stamp crossing the ticket's top-right corner */}
          <svg className={styles.stampRing} viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <path id="nlStampArc" d="M60 16 a44 44 0 1 1 -0.01 0" />
            </defs>
            <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
            <text fontSize="11" fontWeight="700" letterSpacing="2" fill="currentColor" fontFamily="Sora, sans-serif">
              <textPath href="#nlStampArc">SUNSKY AIRMAIL · GOLDEN HOUR ·</textPath>
            </text>
            <path d="M44 63 L76 54 L58 66 L61 75 L54 68 L42 71 Z" fill="currentColor" opacity="0.85" />
          </svg>

          <div className={styles.card}>
            <div className={styles.ticket}>

              {/* ── text zone ── */}
              <div className={styles.body}>
                <div className={styles.eyebrowRow} aria-hidden="true">
                  <span className={styles.eyebrowRule} />
                  <div className={styles.stamp}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M3.5 19.5h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path
                        d="M4.2 15.2l4.6 1.3 8.9-7.1c.8-.6 1.9-.5 2.4.25.4.65.2 1.5-.5 1.95l-10.9 6.9-5.1-1.4.6-1.9z"
                        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
                      />
                    </svg>
                    <span>SunSky Airmail</span>
                  </div>
                  <span className={styles.eyebrowRule} />
                </div>

                <h2 className={styles.title}>
                  {lead ? `${lead} ` : ''}
                  {accent && <em className={styles.accent}>{accent}</em>}
                </h2>
                <p className={styles.subtitle}>{subtitle}</p>
              </div>

              {/* ── form stub, below the perforation ── */}
              <div className={styles.stub}>
                <span className={styles.annotation} aria-hidden="true">
                  no spam, promise ✈
                  <svg className={styles.annotationArrow} viewBox="0 0 44 34" fill="none">
                    <path d="M40 3 C 30 22, 18 27, 6 25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 20 L5.5 25.2 L13 28.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>

                <div className={styles.form}>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder={placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button className={styles.btn}>
                    <span className={styles.btnLabel}>{btnText}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className={styles.meta} aria-hidden="true">
                  <span className={styles.code}>SSK · NEWS · 26</span>
                  <span className={styles.routeCodes}>
                    BRU
                    <span className={styles.routeDash} />
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 12L3 4l3.5 8L3 20l18-8z" />
                    </svg>
                    <span className={styles.routeDash} />
                    AYT
                  </span>
                  <span className={styles.barcode} />
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
