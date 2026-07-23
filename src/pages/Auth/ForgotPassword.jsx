import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import mainLogo from '../../assets/main-logo.png';
import styles from './Login.module.css';   // shared auth shell (sky scene, card, fields)
import fp from './ForgotPassword.module.css';
import { requestPasswordReset, verifyPasswordResetCode, submitNewPassword } from '../../api';
import { useToast } from '../../context/ToastContext';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 45;

// Mirrors the server's rules exactly (websiteAuth.controller validatePassword), so the
// checklist can never say "all good" on a password the API will reject.
const PASSWORD_RULES = [
  { key: 'len',   label: 'At least 8 characters',  test: (v) => v.length >= 8 },
  { key: 'upper', label: 'One uppercase letter',   test: (v) => /[A-Z]/.test(v) },
  { key: 'num',   label: 'One number',             test: (v) => /[0-9]/.test(v) },
  { key: 'sym',   label: 'One special character',  test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const apiError = (err, fallback) => err?.response?.data?.message || fallback;

/* ── 6-digit code input: auto-advance, backspace-back, paste-to-fill ── */
function CodeInput({ value, onChange, disabled, invalid }) {
  const refs = useRef([]);

  const setDigit = (i, digit) => {
    const next = value.split('');
    next[i] = digit;
    onChange(next.join('').slice(0, CODE_LENGTH));
  };

  const handleChange = (i, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    if (digits.length > 1) {
      // Typing/pasting several digits at once fills forward from here.
      const merged = (value.slice(0, i) + digits).slice(0, CODE_LENGTH).padEnd(value.length, '');
      onChange(merged.slice(0, CODE_LENGTH));
      refs.current[Math.min(i + digits.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigit(i, digits);
    if (i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) setDigit(i, '');
      else if (i > 0) { setDigit(i - 1, ''); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    refs.current[Math.min(digits.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className={`${fp.codeRow} ${invalid ? fp.codeRowInvalid : ''}`} onPaste={handlePaste}>
      {Array.from({ length: CODE_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`${fp.codeBox} ${value[i] ? fp.codeBoxFilled : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={CODE_LENGTH}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
        />
      ))}
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);           // 1 email · 2 code · 3 password · 4 done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [focused, setFocused] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expiryMinutes, setExpiryMinutes] = useState(null);

  // Resend cooldown
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const rules = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password) })), [password]);
  const passwordValid = rules.every((r) => r.ok);
  const strength = rules.filter((r) => r.ok).length;

  /* ── Step 1: request the code ── */
  const sendCode = async (e, { silent = false } = {}) => {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset(email.trim().toLowerCase());
      setExpiryMinutes(res?.data?.data?.expiresInMinutes ?? null);
      setSecondsLeft(RESEND_SECONDS);
      setStep(2);
      showToast(silent ? 'A new code is on its way' : 'Check your inbox for the 6-digit code', 'success');
    } catch (err) {
      showToast(apiError(err, 'Could not send the code. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 2: verify the code ── */
  const verifyCode = async (e) => {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    setLoading(true);
    setCodeInvalid(false);
    try {
      await verifyPasswordResetCode(email.trim().toLowerCase(), code);
      setStep(3);
    } catch (err) {
      setCodeInvalid(true);
      showToast(apiError(err, 'That code is incorrect.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: set the new password ── */
  const savePassword = async (e) => {
    e?.preventDefault();
    if (!passwordValid) { showToast('Please meet all password requirements', 'error'); return; }
    if (password !== confirm) { showToast('Both passwords must match', 'error'); return; }
    setLoading(true);
    try {
      await submitNewPassword(email.trim().toLowerCase(), code, password);
      setStep(4);
    } catch (err) {
      showToast(apiError(err, 'Could not reset your password. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const STEP_LABELS = ['Email', 'Code', 'New password'];

  return (
    <div className={styles.page}>
      {/* Shared sky scene */}
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
        <div className={styles.horizon} />
        <div className={styles.grain} />
      </div>

      {/* Left branding */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoIcon}>
            <img src={mainLogo} alt="SunSky" className={styles.logoImg} />
          </div>
          <div className={styles.logoText}>Sun<span>Sky</span></div>
        </Link>

        <div className={styles.brandHero}>
          <h2 className={styles.brandTitle}>
            Locked out?<br />We'll get you <em>flying</em>
          </h2>
          <p className={styles.brandSub}>
            Reset your password in three quick steps and pick up right where you left off.
          </p>
        </div>

        <ol className={fp.brandSteps}>
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={`${fp.brandStep} ${step > i ? fp.brandStepDone : ''} ${step === i + 1 ? fp.brandStepActive : ''}`}>
              <span className={fp.brandStepDot}>
                {step > i + 1 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {/* Right form card */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardHead}>
              <div className={styles.routeRow} aria-hidden="true">
                <span>KEY</span>
                <span className={styles.routeDash} />
                <span className={styles.routePlane}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                    <path d="M21.9 14.9L13.6 10.6V3.8c0-1-.7-1.8-1.6-1.8s-1.6.8-1.6 1.8v6.8L2.1 14.9v2.2l8.3-2.6v5.2L7.9 21.5v1.7l4.1-1.2 4.1 1.2v-1.7l-2.5-1.8v-5.2l8.3 2.6v-2.2z" />
                  </svg>
                </span>
                <span className={styles.routeDash} />
                <span>NEW</span>
              </div>
              <div className={styles.avatarRing}>
                <img src={mainLogo} alt="" className={styles.avatarLogo} />
              </div>

              {step === 1 && <>
                <h1 className={styles.cardTitle}>Forgot your password?</h1>
                <p className={styles.cardSub}>Enter your email and we'll send you a 6-digit code.</p>
              </>}
              {step === 2 && <>
                <h1 className={styles.cardTitle}>Check your inbox</h1>
                <p className={styles.cardSub}>
                  We sent a 6-digit code to <strong className={fp.emailStrong}>{email}</strong>
                </p>
              </>}
              {step === 3 && <>
                <h1 className={styles.cardTitle}>Set a new password</h1>
                <p className={styles.cardSub}>Choose a strong password you haven't used before.</p>
              </>}
              {step === 4 && <>
                <h1 className={styles.cardTitle}>Password updated</h1>
                <p className={styles.cardSub}>You're all set — sign in with your new password.</p>
              </>}
            </div>

            {/* Progress rail */}
            {step < 4 && (
              <div className={fp.progress} aria-hidden="true">
                {[1, 2, 3].map((s) => (
                  <span key={s} className={`${fp.progressBar} ${step >= s ? fp.progressBarOn : ''}`} />
                ))}
              </div>
            )}

            {/* ── Step 1 · email ── */}
            {step === 1 && (
              <form className={styles.form} onSubmit={sendCode}>
                <div className={`${styles.field} ${focused === 'email' ? styles.fieldFocused : ''} ${email ? styles.fieldHasValue : ''}`}>
                  <label className={styles.fieldLabel} htmlFor="fp-email">Email address</label>
                  <div className={styles.fieldWrap}>
                    <span className={styles.fieldIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <path d="M22 6l-10 7L2 6" />
                      </svg>
                    </span>
                    <input
                      id="fp-email"
                      className={styles.fieldInput}
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocused('email')}
                      onBlur={() => setFocused('')}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                <button className={styles.submitBtn} type="submit" disabled={loading}>
                  <span>{loading ? 'Sending code…' : 'Send reset code'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>

                <Link to="/login" className={fp.backLink}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Back to sign in
                </Link>
              </form>
            )}

            {/* ── Step 2 · code ── */}
            {step === 2 && (
              <form className={styles.form} onSubmit={verifyCode}>
                <CodeInput value={code} onChange={(v) => { setCode(v); setCodeInvalid(false); }} disabled={loading} invalid={codeInvalid} />

                {expiryMinutes != null && (
                  <p className={fp.hint}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    This code expires in {expiryMinutes} minutes
                  </p>
                )}

                <button className={styles.submitBtn} type="submit" disabled={loading || code.length !== CODE_LENGTH}>
                  <span>{loading ? 'Verifying…' : 'Verify code'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>

                <div className={fp.resendRow}>
                  {secondsLeft > 0 ? (
                    <span className={fp.resendMuted}>Didn't get it? Resend in {secondsLeft}s</span>
                  ) : (
                    <button type="button" className={fp.linkBtn} onClick={(e) => sendCode(e, { silent: true })} disabled={loading}>
                      Resend code
                    </button>
                  )}
                  <button type="button" className={fp.linkBtn} onClick={() => { setStep(1); setCode(''); }}>
                    Change email
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 3 · new password ── */}
            {step === 3 && (
              <form className={styles.form} onSubmit={savePassword}>
                <div className={`${styles.field} ${focused === 'pw' ? styles.fieldFocused : ''} ${password ? styles.fieldHasValue : ''}`}>
                  <label className={styles.fieldLabel} htmlFor="fp-pw">New password</label>
                  <div className={styles.fieldWrap}>
                    <span className={styles.fieldIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    </span>
                    <input
                      id="fp-pw"
                      className={styles.fieldInput}
                      type={showPw ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocused('pw')}
                      onBlur={() => setFocused('')}
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Strength + live rules */}
                <div className={fp.strengthWrap}>
                  <div className={fp.strengthBars}>
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className={`${fp.strengthBar} ${strength >= n ? fp[`strength${strength}`] : ''}`} />
                    ))}
                  </div>
                  <ul className={fp.rules}>
                    {rules.map((r) => (
                      <li key={r.key} className={r.ok ? fp.ruleOk : ''}>
                        <span className={fp.ruleDot}>
                          {r.ok
                            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                            : <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>}
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`${styles.field} ${focused === 'cf' ? styles.fieldFocused : ''} ${confirm ? styles.fieldHasValue : ''}`}>
                  <label className={styles.fieldLabel} htmlFor="fp-confirm">Confirm password</label>
                  <div className={styles.fieldWrap}>
                    <span className={styles.fieldIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                      </svg>
                    </span>
                    <input
                      id="fp-confirm"
                      className={styles.fieldInput}
                      type={showPw ? 'text' : 'password'}
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      onFocus={() => setFocused('cf')}
                      onBlur={() => setFocused('')}
                      autoComplete="new-password"
                    />
                  </div>
                  {confirm && confirm !== password && <p className={fp.fieldError}>Passwords don't match</p>}
                </div>

                <button className={styles.submitBtn} type="submit" disabled={loading || !passwordValid || password !== confirm}>
                  <span>{loading ? 'Updating…' : 'Update password'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            )}

            {/* ── Step 4 · done ── */}
            {step === 4 && (
              <div className={fp.done}>
                <div className={fp.doneMark}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <p className={fp.doneNote}>
                  For your security we signed you out everywhere else.
                </p>
                <button className={styles.submitBtn} type="button" onClick={() => navigate('/login')}>
                  <span>Go to sign in</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
