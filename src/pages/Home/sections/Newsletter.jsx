import { useState } from 'react';
import styles from './Newsletter.module.css';

export default function Newsletter({ cms }) {
  const [email, setEmail] = useState('');

  const nl = cms?.newsletter;
  const title       = nl?.title            || 'Get exclusive holiday deals';
  const subtitle    = nl?.subtitle         || 'Subscribe for last-minute offers, travel inspiration, and member-only prices.';
  const placeholder = nl?.inputPlaceholder || 'Enter your email address';
  const btnText     = nl?.buttonText       || 'Subscribe';

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.box}>
          <div className={styles.bg} />
          <div className={styles.pattern} />
          <div className={styles.content}>
            <h2>{title}</h2>
            <p>{subtitle}</p>
            <div className={styles.form}>
              <input
                className={styles.input}
                type="email"
                placeholder={placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className={styles.btn}>{btnText}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
