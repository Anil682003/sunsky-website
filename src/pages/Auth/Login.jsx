import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Plane, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { loginSuccess } from '../../store/slices/authSlice';
import styles from './Auth.module.css';

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // TODO: replace with real API call
    console.log('Login payload:', form);
    setTimeout(() => {
      setLoading(false);
      // Mock success:
      // dispatch(loginSuccess({ user: { firstName: 'John', lastName: 'Doe', email: form.email }, accessToken: 'mock-token' }));
      // navigate('/account');
    }, 800);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow} onClick={() => navigate('/')}>
          <div className={styles.logoIcon}><Plane size={20} /></div>
          <span className={styles.logoText}>Sun<span className={styles.logoAccent}>sky</span></span>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to manage your bookings</p>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <div className={styles.inputWrap}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <div className={styles.inputWrap}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                type={showPass ? 'text' : 'password'}
                className={styles.input}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPass((s) => !s)}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className={styles.switchText}>
          Don't have an account?{' '}
          <button className={styles.switchLink} onClick={() => navigate('/register')}>Register</button>
        </p>
      </div>
    </div>
  );
}
