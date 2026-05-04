import styles from './Hotels.module.css';

const HOTELS = [
  { name:'Rixos Premium Belek',    loc:'🇹🇷 Antalya, Turkey',     score:'9.2', stars:5, price:'€899',  img:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80' },
  { name:'Atlantica Mare Village', loc:'🇨🇾 Ayia Napa, Cyprus',   score:'8.8', stars:5, price:'€749',  img:'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=80' },
  { name:'Iberostar Selection',    loc:'🇪🇸 Mallorca, Spain',      score:'9.0', stars:5, price:'€1,049',img:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80' },
  { name:'Steigenberger Aldau',    loc:'🇪🇬 Hurghada, Egypt',      score:'8.6', stars:5, price:'€599',  img:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80' },
  { name:'Secrets Lanzarote',      loc:'🇪🇸 Lanzarote, Spain',    score:'9.1', stars:5, price:'€879',  img:'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&q=80' },
];

const Star = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFD166"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const Heart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;

export default function Hotels() {
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <div className={styles.tag}>★ Top Rated</div>
          <h2 className={styles.title}>Popular with our <span className={styles.accent}>holidaymakers</span></h2>
          <p className={styles.sub}>Top-rated hotels loved by thousands of happy travelers.</p>
        </div>
      </div>
      <div className={styles.scroll}>
        {HOTELS.map((h, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.imgWrap}>
              <img src={h.img} alt={h.name} loading="lazy" />
              <button className={styles.fav}><Heart /></button>
              <div className={styles.score}>{h.score}</div>
            </div>
            <div className={styles.body}>
              <div className={styles.stars}>{Array(h.stars).fill(0).map((_,j) => <Star key={j}/>)}</div>
              <div className={styles.name}>{h.name}</div>
              <div className={styles.loc}>{h.loc}</div>
              <div className={styles.priceRow}>
                <div>
                  <div className={styles.from}>From</div>
                  <div className={styles.price}>{h.price} <span className={styles.pp}>p.p.</span></div>
                </div>
                <button className={styles.viewBtn}>View Deal</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
