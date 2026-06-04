import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import styles from './Login.module.css';
import axiosInstance from '../../services/axiosInstance';
import { loginSuccess } from '../../store/slices/authSlice';
import { useToast } from '../../context/ToastContext';

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axiosInstance.post('/public/auth/login', { email, password, rememberMe: remember });
      const { accessToken, refreshToken, user } = res.data.data;
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      dispatch(loginSuccess({ user, accessToken }));
      navigate('/account/bookings');
    } catch (err) {
      showToast(err.response?.data?.message || 'Login failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Animated background */}
      <div className={styles.bgArt}>
        <div className={styles.bgGrad} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.ring} />
        <div className={styles.ring2} />
        <div className={styles.gridLines} />
      </div>

      {/* Left branding panel */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </div>
          <div className={styles.logoText}>Sun<span>Sky</span></div>
        </Link>

        <div className={styles.brandHero}>
          <h2 className={styles.brandTitle}>
            Welcome<br />back, <em>traveller</em>
          </h2>
          <p className={styles.brandSub}>
            Your next unforgettable journey is just a sign-in away. Thousands of destinations, one seamless experience.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            {/* Header */}
            <div className={styles.cardHead}>
              <div className={styles.avatarRing}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sun-gold)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h1 className={styles.cardTitle}>Sign in to SunSky</h1>
              <p className={styles.cardSub}>
                Don't have an account? <Link to="/register">Create one free</Link>
              </p>
            </div>



            <form className={styles.form} onSubmit={handleSubmit}>
              {/* Email field */}
              <div className={`${styles.field} ${focused === 'email' ? styles.fieldFocused : ''} ${email ? styles.fieldHasValue : ''}`}>
                <label className={styles.fieldLabel}>Email address</label>
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <path d="M22 6l-10 7L2 6" />
                    </svg>
                  </span>
                  <input
                    className={styles.fieldInput}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused('')}
                    autoComplete="email"
                  />
                  {email && (
                    <span className={styles.fieldCheck}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Password field */}
              <div className={`${styles.field} ${focused === 'password' ? styles.fieldFocused : ''} ${password ? styles.fieldHasValue : ''}`}>
                {/* <div className={styles.fieldLabelRow}>
                  <label className={styles.fieldLabel}>Password</label>
                  <Link to="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
                </div> */}
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  </span>
                  <input
                    className={styles.fieldInput}
                    type={showPw ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused('')}
                    autoComplete="current-password"
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(!showPw)}>
                    {showPw ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className={styles.rememberRow}>
                <div
                  className={`${styles.checkbox} ${remember ? styles.checked : ''}`}
                  onClick={() => setRemember(!remember)}
                >
                  {remember && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className={styles.rememberLabel}>Keep me signed in for 30 days</span>
              </div>

              {/* Submit */}
              <button className={styles.submitBtn} type="submit" disabled={loading}>
                <span>{loading ? 'Signing in…' : 'Sign In'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>

            {/* Guest */}
            <div className={styles.guestRow}>
              <div className={styles.guestLine} />
              <button className={styles.guestBtn} onClick={() => navigate('/')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
                Continue as Guest
              </button>
              <div className={styles.guestLine} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
