import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import mainLogo from '../../assets/main-logo.png';
import styles from './Login.module.css';
import { useLogin } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { execute: login, loading } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [focused, setFocused] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login({ email, password, rememberMe: remember });
    } catch (err) {
      showToast(err.response?.data?.message || 'Login failed. Please try again.', 'error');
    }
  };

  return (
    <div className={styles.page}>
      {/* The sky scene */}
      <div className={styles.bgArt} aria-hidden="true">
        <div className={styles.bgGrad} />
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
        <div className={styles.ring} />
        <div className={styles.ring2} />
        <div className={styles.gridLines} />
        <div className={styles.sun}>
          <div className={styles.sunRays} />
          <div className={styles.sunCore} />
        </div>
        <div className={`${styles.cloud} ${styles.cloud1}`} />
        <div className={`${styles.cloud} ${styles.cloud2}`} />
        <div className={`${styles.cloud} ${styles.cloud3}`} />
        <svg className={styles.flightPath} viewBox="0 0 1600 900" fill="none">
          <path d="M-40 190 C 380 110, 950 70, 1660 150" stroke="rgba(58,111,232,0.28)" strokeWidth="1.6" strokeDasharray="1 12" strokeLinecap="round" />
        </svg>
        <div className={styles.plane}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(58,111,232,0.9)">
            <path d="M21.9 14.9L13.6 10.6V3.8c0-1-.7-1.8-1.6-1.8s-1.6.8-1.6 1.8v6.8L2.1 14.9v2.2l8.3-2.6v5.2L7.9 21.5v1.7l4.1-1.2 4.1 1.2v-1.7l-2.5-1.8v-5.2l8.3 2.6v-2.2z" />
          </svg>
        </div>
        <svg className={styles.balloon} viewBox="0 0 120 164" fill="none">
          <defs>
            <linearGradient id="ssbGrad1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2E62E6" />
              <stop offset="0.55" stopColor="#3D7BF0" />
              <stop offset="1" stopColor="#7FB8FF" />
            </linearGradient>
          </defs>
          <path d="M60 4C27 4 8 30 8 60c0 30 27 51 39 64h26c12-13 39-34 39-64C112 30 93 4 60 4Z" fill="url(#ssbGrad1)" />
          <path d="M60 4C43 4 33 30 33 60c0 30 13 51 19 64h8V4Z" fill="rgba(255,255,255,0.28)" />
          <path d="M60 4c17 0 27 26 27 56 0 30-13 51-19 64h-8V4Z" fill="rgba(10,35,110,0.12)" />
          <path d="M10 47c16-9 84-9 100 0 1.5 4 2 9 2 13-18-8-86-8-104 0 0-4 .5-9 2-13Z" fill="#FFC24D" />
          <path d="M47 124l6 18M73 124l-6 18M60 124v18" stroke="#B07A22" strokeWidth="1.6" />
          <rect x="48" y="140" width="24" height="17" rx="4" fill="#D89B3F" />
          <rect x="48" y="140" width="24" height="6" rx="3" fill="#B07A22" />
        </svg>
        <svg className={`${styles.balloon} ${styles.balloonSmall}`} viewBox="0 0 120 164" fill="none">
          <defs>
            <linearGradient id="ssbGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FF9F1C" />
              <stop offset="1" stopColor="#FFD166" />
            </linearGradient>
          </defs>
          <path d="M60 4C27 4 8 30 8 60c0 30 27 51 39 64h26c12-13 39-34 39-64C112 30 93 4 60 4Z" fill="url(#ssbGrad2)" />
          <path d="M60 4C43 4 33 30 33 60c0 30 13 51 19 64h8V4Z" fill="rgba(255,255,255,0.30)" />
          <path d="M47 124l6 18M73 124l-6 18M60 124v18" stroke="#B07A22" strokeWidth="1.6" />
          <rect x="48" y="140" width="24" height="17" rx="4" fill="#D89B3F" />
        </svg>
        <svg className={styles.birds} width="56" height="20" viewBox="0 0 56 20" fill="none">
          <path d="M2 10c4-5 9-5 13 0M15 10c4-5 9-5 13 0" stroke="#3A6FE8" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
          <path d="M36 6c3-4 6.5-4 9.5 0M45.5 6c3-4 6.5-4 9.5 0" stroke="#3A6FE8" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
        </svg>
        <div className={styles.horizon} />
        <div className={styles.grain} />
      </div>

      {/* Left branding column */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoIcon}>
            <img src={mainLogo} alt="SunSky" className={styles.logoImg} />
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

        <div className={styles.ratingPill}>
          <span className={styles.ratingStars}>★★★★★</span>
          <span>Trusted by travellers across Europe</span>
        </div>

        <div className={styles.destCards}>
          <div className={`${styles.destCard} ${styles.destCard1}`}>
            <span className={styles.destCardFlag}>🏝️</span>
            <div className={styles.destCardInfo}>
              <span className={styles.destCardName}>Santorini, Greece</span>
              <span className={styles.destCardPrice}>Island escapes &amp; sunsets</span>
            </div>
            <span className={styles.destCardBadge}>Popular</span>
          </div>
          <div className={`${styles.destCard} ${styles.destCard2}`}>
            <span className={styles.destCardFlag}>🌴</span>
            <div className={styles.destCardInfo}>
              <span className={styles.destCardName}>Bali, Indonesia</span>
              <span className={styles.destCardPrice}>Beaches, temples &amp; jungles</span>
            </div>
            <span className={`${styles.destCardBadge} ${styles.destCardBadgeBlue}`}>Trending</span>
          </div>
          <div className={`${styles.destCard} ${styles.destCard3}`}>
            <span className={styles.destCardFlag}>🏙️</span>
            <div className={styles.destCardInfo}>
              <span className={styles.destCardName}>Dubai, UAE</span>
              <span className={styles.destCardPrice}>City lights &amp; desert dunes</span>
            </div>
            <span className={`${styles.destCardBadge} ${styles.destCardBadgeCoral}`}>Sunny</span>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={styles.statNum}>500+</span>
            <span className={styles.statLabel}>Destinations</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statNum}>24/7</span>
            <span className={styles.statLabel}>Support</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statNum}>100%</span>
            <span className={styles.statLabel}>Secure</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            {/* Header */}
            <div className={styles.cardHead}>
              <div className={styles.routeRow} aria-hidden="true">
                <span>BRU</span>
                <span className={styles.routeDash} />
                <span className={styles.routePlane}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                    <path d="M21.9 14.9L13.6 10.6V3.8c0-1-.7-1.8-1.6-1.8s-1.6.8-1.6 1.8v6.8L2.1 14.9v2.2l8.3-2.6v5.2L7.9 21.5v1.7l4.1-1.2 4.1 1.2v-1.7l-2.5-1.8v-5.2l8.3 2.6v-2.2z" />
                  </svg>
                </span>
                <span className={styles.routeDash} />
                <span>SUN</span>
              </div>
              <div className={styles.avatarRing}>
                <img src={mainLogo} alt="" className={styles.avatarLogo} />
              </div>
              <h1 className={styles.cardTitle}>Sign in to SunSky</h1>
              <p className={styles.cardSub}>
                Don't have an account? <Link to="/register">Create one free</Link>
              </p>
            </div>



            <form className={styles.form} onSubmit={handleSubmit}>
              {/* Email field */}
              <div className={`${styles.field} ${focused === 'email' ? styles.fieldFocused : ''} ${email ? styles.fieldHasValue : ''}`}>
                <label className={styles.fieldLabel} htmlFor="login-email">Email address</label>
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <path d="M22 6l-10 7L2 6" />
                    </svg>
                  </span>
                  <input
                    id="login-email"
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
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Password field */}
              <div className={`${styles.field} ${focused === 'password' ? styles.fieldFocused : ''} ${password ? styles.fieldHasValue : ''}`}>
                <label className={styles.fieldLabel} htmlFor="login-password">Password</label>
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    className={styles.fieldInput}
                    type={showPw ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused('')}
                    autoComplete="current-password"
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
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
                <Link to="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
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
