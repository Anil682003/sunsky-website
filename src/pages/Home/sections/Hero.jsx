import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.bg} />
      <div className={styles.overlay} />
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.ring} />

      <div className={styles.content}>
        <div className={styles.badge}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
          Discover 10,000+ holidays worldwide
        </div>

        <h1 className={styles.title}>
          Where will you<br />chase the <span className={styles.script}>sun</span>?
        </h1>

        <p className={styles.subtitle}>
          Sun-soaked beaches, vibrant cities, and hidden gems — all at the best guaranteed prices.
        </p>

        <div className={styles.searchBar}>
          <div className={styles.sf}>
            <span className={styles.sfIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <div className={styles.sfText}>
              <span className={styles.sfLabel}>Destination</span>
              <span className={styles.sfValue}>Where to?</span>
            </div>
          </div>
          <div className={styles.sfDivider} />
          <div className={styles.sf}>
            <span className={styles.sfIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </span>
            <div className={styles.sfText}>
              <span className={styles.sfLabel}>Departure</span>
              <span className={styles.sfValue}>Pick a date</span>
            </div>
          </div>
          <div className={styles.sfDivider} />
          <div className={styles.sf}>
            <span className={styles.sfIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </span>
            <div className={styles.sfText}>
              <span className={styles.sfLabel}>Duration</span>
              <span className={styles.sfValue}>7 nights</span>
            </div>
          </div>
          <div className={styles.sfDivider} />
          <div className={styles.sf}>
            <span className={styles.sfIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </span>
            <div className={styles.sfText}>
              <span className={styles.sfLabel}>Travelers</span>
              <span className={styles.sfValue}>2 adults</span>
            </div>
          </div>
          <button className={styles.searchBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Search
          </button>
        </div>
      </div>

      <div className={styles.scrollIndicator}>
        <div className={styles.scrollLine} />
      </div>
    </section>
  );
}
