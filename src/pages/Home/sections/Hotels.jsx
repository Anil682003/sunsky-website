import styles from './Hotels.module.css';

const FALLBACK_HOTELS = [
  { name:'Rixos Premium Belek',    loc:'🇹🇷 Antalya, Turkey',     score:'9.2', stars:5, price:'€899',  img:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80' },
  { name:'Atlantica Mare Village', loc:'🇨🇾 Ayia Napa, Cyprus',   score:'8.8', stars:5, price:'€749',  img:'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=80' },
  { name:'Iberostar Selection',    loc:'🇪🇸 Mallorca, Spain',      score:'9.0', stars:5, price:'€1,049',img:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80' },
  { name:'Steigenberger Aldau',    loc:'🇪🇬 Hurghada, Egypt',      score:'8.6', stars:5, price:'€599',  img:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80' },
  { name:'Secrets Lanzarote',      loc:'🇪🇸 Lanzarote, Spain',    score:'9.1', stars:5, price:'€879',  img:'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&q=80' },
];

const Star = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFD166"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const Heart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;

const Barcode = () => (
  <svg className={styles.barcode} viewBox="0 0 46 18" aria-hidden="true">
    <g fill="currentColor">
      <rect x="0" width="2" height="18"/><rect x="3.4" width="1" height="18"/>
      <rect x="5.8" width="2.6" height="18"/><rect x="9.8" width="1" height="18"/>
      <rect x="12.2" width="1.6" height="18"/><rect x="15.4" width="3" height="18"/>
      <rect x="19.8" width="1" height="18"/><rect x="22.2" width="2.2" height="18"/>
      <rect x="25.8" width="1" height="18"/><rect x="28.2" width="1.6" height="18"/>
      <rect x="31.2" width="2.8" height="18"/><rect x="35.4" width="1" height="18"/>
      <rect x="37.8" width="2" height="18"/><rect x="41.2" width="1.2" height="18"/>
      <rect x="44" width="2" height="18"/>
    </g>
  </svg>
);

export default function Hotels({ cms }) {
  const sh = cms?.sectionHeaders?.hotels;
  const tag      = sh?.tag      || '★ Top Rated';
  const title    = sh?.title    || 'Popular with our holidaymakers';
  const subtitle = sh?.subtitle || 'Top-rated hotels loved by thousands of happy travelers.';

  const hotels = (cms?.popularHotels?.length > 0)
    ? cms.popularHotels.map((h) => ({
        name:  h.name,
        loc:   h.location || h.loc,
        score: h.score,
        stars: h.stars || 5,
        price: h.price,
        img:   h.imageUrl || h.img,
      }))
    : FALLBACK_HOTELS;

  // Split the CMS title so the last word can carry the cursive accent
  const titleWords = String(title).trim().split(/\s+/);
  const titleLast  = titleWords.pop();
  const titleHead  = titleWords.join(' ');

  return (
    <section className={styles.section}>

      {/* ══ Layered background scene ══ */}
      <div className={styles.bgArt} aria-hidden="true">
        <div className={styles.glowBlue} />
        <div className={styles.glowGold} />
        <div className={styles.dots} />
        <span className={styles.ghostNum}>04</span>
        <span className={styles.ghostWord}>checked-in ✓</span>
        <svg className={styles.bgRoute} viewBox="0 0 900 260" fill="none">
          <path d="M10 224 C 230 92, 500 38, 886 96" stroke="rgba(31,79,216,0.15)" strokeWidth="1.6" strokeDasharray="3 9" strokeLinecap="round" />
          <circle cx="10" cy="224" r="3.4" fill="rgba(255,159,28,0.55)" />
          <circle cx="10" cy="224" r="8" stroke="rgba(255,159,28,0.32)" strokeWidth="1" />
          <circle cx="368" cy="70" r="3" fill="rgba(31,79,216,0.25)" />
          <circle cx="638" cy="50" r="3" fill="rgba(31,79,216,0.20)" />
          <g transform="translate(856 82) rotate(14)">
            <path d="M0 9 L22 0 L12 22 L9 12.5 Z" fill="rgba(31,79,216,0.32)" />
          </g>
        </svg>
        <div className={styles.cloudPuff} />
        <div className={styles.grain} />
      </div>

      <div className={styles.inner}>

        <div className={styles.sectionHead}>
          <span className={styles.sectionIndex}>04</span>
          <span className={styles.eyebrow}>{tag}</span>
          <span className={styles.sectionRule} aria-hidden="true" />
          <span className={styles.headMicro} aria-hidden="true">SSK·REG-04 ✦ CHECK-IN 15:00</span>
        </div>

        <div className={styles.header}>
          <div className={styles.headText}>
            <h2 className={styles.title}>
              {titleHead && <>{titleHead}{' '}</>}
              <span className={styles.titleAccent}>{titleLast}</span>
            </h2>
            <p className={styles.sub}>{subtitle}</p>
          </div>
          <div className={styles.headNote} aria-hidden="true">
            <span>hand-picked by our travel crew</span>
            <svg className={styles.headNoteArrow} viewBox="0 0 54 40" fill="none">
              <path d="M6 5 C 22 10, 38 18, 45 32" stroke="#E08A00" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 5" />
              <path d="M39 28 L46 34 L47 25" stroke="#E08A00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* ══ Voucher rail — bleeds off the right edge ══ */}
        <div className={styles.railWrap}>
          <div className={styles.scroll}>
            {hotels.map((h, i) => (
              <article key={i} className={styles.card} style={{ '--d': `${i * 0.07}s` }}>

                {i === 0 && (
                  <div className={styles.cardNote} aria-hidden="true">
                    guest favourite!
                    <svg viewBox="0 0 36 30" fill="none">
                      <path d="M6 4 C 14 8, 22 14, 26 26" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 4" />
                      <path d="M21 21 L26 27 L28 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                {i === 3 && (
                  <div className={`${styles.cardNote} ${styles.cardNoteAlt}`} aria-hidden="true">
                    booking fast!
                  </div>
                )}

                <div className={h.price ? `${styles.voucher} ${styles.voucherNotched}` : styles.voucher}>

                  <div className={styles.imgWrap}>
                    <div className={styles.imgClip}>
                      <img src={h.img} alt={h.name} loading="lazy" />
                    </div>
                    <button className={styles.fav} aria-label={`Save ${h.name} to favourites`}><Heart /></button>
                    {h.score && (
                      <div className={styles.score}>
                        <span className={styles.scoreNum}>{h.score}</span>
                        <span className={styles.scoreLbl}>Guest score</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.body}>
                    <div className={styles.metaRow}>
                      <div className={styles.stars}>{Array(h.stars || 5).fill(0).map((_,j) => <Star key={j}/>)}</div>
                      <span className={styles.code}>SSK · HTL · {String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div className={styles.name}>{h.name}</div>
                    <div className={styles.loc}>{h.loc}</div>
                    <div className={styles.checkRow} aria-hidden="true">
                      <span>IN 15:00</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M2 12h18M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>OUT 11:00</span>
                      <i className={styles.checkDot} />
                      <span>FREE WIFI</span>
                    </div>
                  </div>

                  {h.price && (
                    <div className={styles.stub}>
                      <div className={styles.stubLeft}>
                        <div className={styles.from}>From</div>
                        <div className={styles.price}>{h.price} <span className={styles.pp}>p.p.</span></div>
                      </div>
                      <div className={styles.barcodeBlock} aria-hidden="true">
                        <Barcode />
                        <span className={styles.roomCode}>RM-{204 + i * 7}</span>
                      </div>
                      <button className={styles.viewBtn}>
                        View Deal
                        <span className={styles.viewArrow} aria-hidden="true">→</span>
                      </button>
                    </div>
                  )}

                </div>
              </article>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
