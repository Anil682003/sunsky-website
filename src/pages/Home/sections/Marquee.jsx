import styles from './Marquee.module.css';

const ITEMS = ['Best Price Guarantee','10,000+ Holidays','No Booking Fees','Secure Payments','24/7 Support','Trusted by 2M+ Travelers','Free Cancellation','Award-Winning Service'];

export default function Marquee() {
  return (
    <div className={styles.wrap}>
      <div className={styles.track}>
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <div key={i} className={styles.item}>
            <div className={styles.dot} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
