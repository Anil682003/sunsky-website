import { useNavigate } from 'react-router-dom';
import { Plane, Mail, Phone, MapPin, Share2, MessageCircle, Camera, Play } from 'lucide-react';
import styles from './Footer.module.css';

const LINKS = {
  Company:  [
    { label: 'About Us',   path: '/about' },
    { label: 'Contact',    path: '/contact' },
  ],
  Products: [
    { label: 'Packages',   path: '/packages' },
    { label: 'Flights',    path: '/flights' },
    { label: 'Hotels',     path: '/hotels' },
    { label: 'Transfers',  path: '/transfers' },
  ],
  Account:  [
    { label: 'My Account', path: '/account' },
    { label: 'My Bookings',path: '/account/bookings' },
    { label: 'Sign In',    path: '/login' },
    { label: 'Register',   path: '/register' },
  ],
};

export default function Footer() {
  const navigate = useNavigate();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            <div className={styles.logoIcon}><Plane size={18} /></div>
            <span className={styles.logoText}>Sun<span className={styles.logoAccent}>sky</span></span>
          </div>
          <p className={styles.tagline}>Your trusted travel partner for unforgettable journeys around the world.</p>
          <div className={styles.contact}>
            <span><Mail size={14} /> hello@sunsky.travel</span>
            <span><Phone size={14} /> +1 800 SUNSKY</span>
            <span><MapPin size={14} /> 12 Travel Lane, NY</span>
          </div>
          <div className={styles.social}>
            <a href="#" className={styles.socialBtn}><Share2 size={16} /></a>
            <a href="#" className={styles.socialBtn}><MessageCircle size={16} /></a>
            <a href="#" className={styles.socialBtn}><Camera size={16} /></a>
            <a href="#" className={styles.socialBtn}><Play size={16} /></a>
          </div>
        </div>

        {Object.entries(LINKS).map(([group, links]) => (
          <div key={group} className={styles.col}>
            <h4 className={styles.colTitle}>{group}</h4>
            <ul className={styles.colLinks}>
              {links.map((l) => (
                <li key={l.path}>
                  <button className={styles.link} onClick={() => navigate(l.path)}>{l.label}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Sunsky Travel. All rights reserved.</p>
      </div>
    </footer>
  );
}
