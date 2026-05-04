import { useState } from 'react';
import styles from './Newsletter.module.css';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.box}>
          <div className={styles.bg} />
          <div className={styles.pattern} />
          <div className={styles.content}>
            <h2>Get exclusive holiday deals</h2>
            <p>Subscribe for last-minute offers, travel inspiration, and member-only prices.</p>
            <div className={styles.form}>
              <input
                className={styles.input}
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className={styles.btn}>Subscribe</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
