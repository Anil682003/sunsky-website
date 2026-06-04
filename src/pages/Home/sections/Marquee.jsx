import styles from './Marquee.module.css';

const FALLBACK = ['Best Price Guarantee','10,000+ Holidays','No Booking Fees','Secure Payments','24/7 Support','Trusted by 2M+ Travelers','Free Cancellation','Award-Winning Service'];

export default function Marquee({ cms }) {
  const items = (cms?.marqueeItems?.length > 0) ? cms.marqueeItems : FALLBACK;
  const doubled = [...items, ...items];

  return (
    <div className={styles.wrap}>
      <div className={styles.track}>
        {doubled.map((item, i) => (
          <div key={i} className={styles.item}>
            <div className={styles.dot} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
