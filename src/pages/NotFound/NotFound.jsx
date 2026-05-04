import { useNavigate } from 'react-router-dom';
import { Plane, ArrowLeft } from 'lucide-react';
import styles from './NotFound.module.css';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <div className={styles.icon}><Plane size={48} /></div>
      <h1 className={styles.code}>404</h1>
      <p className={styles.title}>Page not found</p>
      <p className={styles.desc}>The page you're looking for doesn't exist or has been moved.</p>
      <button className={styles.btn} onClick={() => navigate('/')}>
        <ArrowLeft size={16} /> Back to Home
      </button>
    </div>
  );
}
