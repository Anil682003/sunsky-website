import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useBrandLogo } from '../../hooks/useBrandLogo';
// The round chip inside the card is a circular slot; the wide wordmark would be a sliver in
// it, so it keeps the square mark — the same one the browser tab shows.
import logoIcon from '../../assets/logo-icon.png';
import styles from './Login.module.css';
import LanguageMenu from './LanguageMenu';
import { useLogin } from '../../api';
import { useToast } from '../../context/ToastContext';

const Icon = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const GlobeIcon = ({ size }) => (
  <Icon size={size}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></Icon>
);
const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
);

export default function Login() {
  // The logo the dashboard sets, with the bundled one showing until it lands.
  const brandLogo = useBrandLogo();
  const { t } = useTranslation('auth');
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
      showToast(err.response?.data?.message || t('auth:errors.loginFailed', 'Login failed. Please try again.'), 'error');
    }
  };

  return (
    <div className={styles.page}>
      {/* The journey the site is about, top right. Words, not navigation. */}
      <p className={styles.trail} aria-hidden="true">
        <span>{t('auth:login.trail.explore', 'Explore')}</span>
        <Chevron />
        <span>{t('auth:login.trail.book', 'Book')}</span>
        <Chevron />
        <span className={styles.trailOn}>{t('auth:login.trail.experience', 'Experience')}</span>
      </p>

      {/* Left branding column */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          {/* The wordmark carries the name, so no text beside it. */}
          <img src={brandLogo.src} alt={brandLogo.alt || 'Sunsky Vakanties'} onError={brandLogo.onError} className={styles.logoWordmark} />
        </Link>

        <div className={styles.brandHero}>
          <p className={styles.eyebrow}>{t('auth:login.eyebrow', 'Travel • Discover • Create memories')}</p>
          <h2 className={styles.brandTitle}>
            <Trans i18nKey="auth:login.brandTitle" t={t}>Welcome back,<br /><em>traveller</em></Trans>
          </h2>
          <p className={styles.brandSub}>
            {t('auth:login.brandSub', 'Your next unforgettable journey is just a sign-in away. Thousands of destinations, one seamless experience.')}
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={`${styles.statIcon} ${styles.statBlue}`}><GlobeIcon size={22} /></span>
            <span className={styles.statText}>
              <span className={styles.statNum}>500+</span>
              <span className={styles.statLabel}>{t('auth:login.statDestinations', 'Destinations')}</span>
            </span>
          </div>
          <span className={styles.statDivider} aria-hidden="true" />
          <div className={styles.statItem}>
            <span className={`${styles.statIcon} ${styles.statOrange}`}>
              <Icon size={22}><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" /></Icon>
            </span>
            <span className={styles.statText}>
              <span className={styles.statNum}>24/7</span>
              <span className={styles.statLabel}>{t('auth:login.statSupport', 'Support')}</span>
            </span>
          </div>
          <span className={styles.statDivider} aria-hidden="true" />
          <div className={styles.statItem}>
            <span className={`${styles.statIcon} ${styles.statGreen}`}>
              <Icon size={22}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Icon>
            </span>
            <span className={styles.statText}>
              <span className={styles.statNum}>100%</span>
              <span className={styles.statLabel}>{t('auth:login.statSecure', 'Secure')}</span>
            </span>
          </div>
        </div>

        <p className={styles.quote}>
          {t('auth:login.quote', '“More than travel,\nit’s a feeling.”')}
          <svg className={styles.quoteSwash} viewBox="0 0 150 16" fill="none" aria-hidden="true">
            <path d="M3 12 C 40 4, 95 1, 147 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </p>
      </div>

      {/* Right form card */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            <LanguageMenu className={styles.langMenu} />

            <div className={styles.cardHead}>
              <div className={styles.avatarRing}>
                <img src={logoIcon} alt="" className={styles.avatarLogo} />
              </div>
              <h1 className={styles.cardTitle}>{t('auth:login.title', 'Sign in to SunSky')}</h1>
              <p className={styles.cardSub}>{t('auth:login.subtitle', 'Continue to explore amazing destinations')}</p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={`${styles.field} ${focused === 'email' ? styles.fieldFocused : ''} ${email ? styles.fieldHasValue : ''}`}>
                <label className={styles.fieldLabel} htmlFor="login-email">{t('auth:fields.emailAddress', 'Email address')}</label>
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <Icon size={20}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5 12 13l8.5-6.5" /></Icon>
                  </span>
                  <input
                    id="login-email"
                    className={styles.fieldInput}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused('')}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className={`${styles.field} ${focused === 'password' ? styles.fieldFocused : ''} ${password ? styles.fieldHasValue : ''}`}>
                <label className={styles.fieldLabel} htmlFor="login-password">{t('auth:fields.password', 'Password')}</label>
                <div className={styles.fieldWrap}>
                  <span className={styles.fieldIcon}>
                    <Icon size={20}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Icon>
                  </span>
                  <input
                    id="login-password"
                    className={styles.fieldInput}
                    type={showPw ? 'text' : 'password'}
                    placeholder={t('auth:fields.yourPassword', 'Your password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused('')}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? t('auth:fields.hidePassword', 'Hide password') : t('auth:fields.showPassword', 'Show password')}
                  >
                    {showPw ? (
                      <Icon size={20}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><path d="M1 1l22 22" /></Icon>
                    ) : (
                      <Icon size={20}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.rememberRow}>
                {/* A real checkbox under the drawn box: it used to be a clickable div,
                    unreachable by keyboard and silent to a screen reader. */}
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    className={styles.checkInput}
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className={styles.checkbox} aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <span className={styles.rememberLabel}>{t('auth:login.keepSignedIn', 'Keep me signed in for 30 days')}</span>
                </label>
                <Link to="/forgot-password" className={styles.forgotLink}>{t('auth:login.forgotPassword', 'Forgot password?')}</Link>
              </div>

              <button className={styles.submitBtn} type="submit" disabled={loading}>
                <span>{loading ? t('auth:login.signingIn', 'Signing in…') : t('auth:login.signIn', 'Sign In')}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>

            <div className={styles.orRow}>{t('auth:login.orContinueWith', 'Or continue with')}</div>
            <div className={styles.guestRow}>
              <button type="button" className={styles.guestBtn} onClick={() => navigate('/')}>
                <GlobeIcon size={20} />
                {t('auth:continueAsGuest', 'Continue as Guest')}
              </button>
            </div>

            {/* Not in the design, but without it a new customer has no way from here to an
                account: this page has no header. Kept small, under everything else. */}
            <p className={styles.registerLine}>
              <Trans i18nKey="auth:login.noAccount" t={t}>Don't have an account? <Link to="/register">Create one free</Link></Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
