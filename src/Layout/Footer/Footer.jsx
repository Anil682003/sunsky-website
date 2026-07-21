import { useNavigate } from 'react-router-dom';
import styles from './Footer.module.css';
import { useHomepageConfig } from '../../api';
import { resolveCmsImageUrl } from '../../utils/cmsImage';

const COLS = [
  { title: 'Destinations', links: ['Spain','Turkey','Greece','Egypt','Canary Islands','Italy'] },
  { title: 'Travel Types',  links: ['All Inclusive','City Trips','Last Minute','Family Holidays','Adults Only','Car Holidays'] },
  { title: 'Support',       links: ['Help Centre','Contact Us','Booking FAQs','Travel Insurance','About Sunsky','Press'] },
];

export default function Footer() {
  const navigate = useNavigate();
  const { data: cmsConfig } = useHomepageConfig();
  const cmsLogoUrl = resolveCmsImageUrl(cmsConfig?.logo?.mainUrl);

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            {cmsLogoUrl ? (
              <img src={cmsLogoUrl} alt="Sunsky" className={styles.logoImg} />
            ) : (
              <span className={styles.logoText}>Sunsky</span>
            )}
          </div>
          <p>Your trusted travel partner for unforgettable sun-soaked holidays around the world.</p>
          <div className={styles.pays}>
            {['VISA','MC','AMEX','PayPal'].map(p => <span key={p} className={styles.pay}>{p}</span>)}
          </div>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className={styles.col}>
            <h4>{col.title}</h4>
            {col.links.map((l) => <a key={l} href="#">{l}</a>)}
          </div>
        ))}
      </div>
      <div className={styles.divider} />
      <div className={styles.bottom}>
        <p className={styles.copy}>© {new Date().getFullYear()} Sunsky Travel. All rights reserved.</p>
        <div className={styles.bottomLinks}>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms & Conditions</a>
          <a href="#">Cookie Policy</a>
        </div>
      </div>
    </footer>
  );
}
