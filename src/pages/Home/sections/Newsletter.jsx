import { useState } from 'react';
import styles from './Newsletter.module.css';
import { cmsText } from '../../../utils/cmsText';
import { useTranslation } from 'react-i18next';

const MailIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5 12 13l8.5-6.5" />
  </svg>
);

export default function Newsletter({ cms }) {
  const { t } = useTranslation('home');
  const [email, setEmail] = useState('');

  const nl = cms?.newsletter;
  const title       = nl?.title            || t('newsletter.title', 'Get exclusive holiday deals');
  const subtitle    = nl?.subtitle         || t('newsletter.subtitle', 'Subscribe for last-minute offers, travel inspiration, and member-only prices.');
  const placeholder = nl?.inputPlaceholder || t('newsletter.placeholder', 'Enter your email address');
  const btnText     = nl?.buttonText       || t('newsletter.button', 'Subscribe');

  // The last word of the title carries the section's one handwritten accent.
  const words  = String(title).trim().split(/\s+/);
  const accent = words.length ? words.pop() : '';
  const lead   = words.join(' ');

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.panel}>
          <div className={styles.copy}>
            <span className={styles.icon}><MailIcon /></span>
            <div>
              <h2 className={styles.title}>
                {lead ? `${lead} ` : ''}
                {accent && <em className={styles.accent}>{accent}</em>}
              </h2>
              <p className={styles.subtitle}>{cmsText(subtitle)}</p>
            </div>
          </div>

          <div className={styles.formCol}>
            <div className={styles.form}>
              <input
                className={styles.input}
                type="email"
                placeholder={placeholder}
                aria-label={placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className={styles.btn}>{btnText}</button>
            </div>
            <p className={styles.note}>{t('newsletter.noSpam', 'No spam, promise.')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
