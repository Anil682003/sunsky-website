import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useBrandLogo } from '../../hooks/useBrandLogo';
// The round chip inside the card is a circular slot; the wide wordmark would be a sliver in
// it, so it keeps the square mark — the same one the browser tab shows.
import logoIcon from '../../assets/logo-icon.png';
import styles from './Login.module.css';   // shared auth shell (brand column, card, fields)
import fp from './ForgotPassword.module.css';
import CodeInput, { CODE_LENGTH } from './CodeInput';
import { requestPasswordReset, verifyPasswordResetCode, submitNewPassword } from '../../api';
import { useToast } from '../../context/ToastContext';
import i18n from '../../i18n';

const RESEND_SECONDS = 45;

// Mirrors the server's rules exactly (websiteAuth.controller validatePassword), so the
// checklist can never say "all good" on a password the API will reject.
const PASSWORD_RULES = [
  { key: 'len',   get label() { return i18n.t('auth:passwordRules.len', 'At least 8 characters'); },   test: (v) => v.length >= 8 },
  { key: 'upper', get label() { return i18n.t('auth:passwordRules.upper', 'One uppercase letter'); },  test: (v) => /[A-Z]/.test(v) },
  { key: 'num',   get label() { return i18n.t('auth:passwordRules.num', 'One number'); },              test: (v) => /[0-9]/.test(v) },
  { key: 'sym',   get label() { return i18n.t('auth:passwordRules.sym', 'One special character'); },   test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const apiError = (err, fallback) => err?.response?.data?.message || fallback;

export default function ForgotPassword() {
  // The logo the dashboard sets, with the bundled one showing until it lands.
  const brandLogo = useBrandLogo();
  const { t } = useTranslation('auth');
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

  // `t` in the deps even though the map doesn't take it: PASSWORD_RULES reads i18n.t() through
  // getters, invisibly to the linter, and t's identity is what changes on a language switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rules = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password) })), [password, t]);
  const passwordValid = rules.every((r) => r.ok);
  const strength = rules.filter((r) => r.ok).length;

  /* ── Step 1: request the code ── */
  const sendCode = async (e, { silent = false } = {}) => {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      showToast(t('auth:validation.emailInvalid', 'Please enter a valid email address'), 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset(email.trim().toLowerCase());
      setExpiryMinutes(res?.data?.data?.expiresInMinutes ?? null);
      setSecondsLeft(RESEND_SECONDS);
      setStep(2);
      // Same caveat as the step-2 copy: the server won't say whether the address is
      // registered, so neither can this.
      showToast(silent ? t('auth:forgot.newCodeOnWay', 'A new code is on its way') : t('auth:forgot.checkInbox', 'If we have that email on file, the code is on its way'), 'success');
    } catch (err) {
      showToast(apiError(err, t('auth:errors.codeSendFailed', 'Could not send the code. Please try again.')), 'error');
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
      showToast(apiError(err, t('auth:errors.codeIncorrect', 'That code is incorrect.')), 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: set the new password ── */
  const savePassword = async (e) => {
    e?.preventDefault();
    if (!passwordValid) { showToast(t('auth:validation.meetPasswordRequirements', 'Please meet all password requirements'), 'error'); return; }
    if (password !== confirm) { showToast(t('auth:validation.passwordsMustMatch', 'Both passwords must match'), 'error'); return; }
    setLoading(true);
    try {
      await submitNewPassword(email.trim().toLowerCase(), code, password);
      setStep(4);
    } catch (err) {
      showToast(apiError(err, t('auth:errors.resetFailed', 'Could not reset your password. Please try again.')), 'error');
    } finally {
      setLoading(false);
    }
  };

  const STEP_LABELS = [t('auth:forgot.stepEmail', 'Email'), t('auth:forgot.stepCode', 'Code'), t('auth:forgot.stepNewPassword', 'New password')];

  return (
    <div className={styles.page}>
      {/* Left branding */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          {/* The wordmark carries the name, so no text beside it. */}
          <img src={brandLogo.src} alt={brandLogo.alt || 'Sunsky Vakanties'} onError={brandLogo.onError} className={styles.logoWordmark} />
        </Link>

        <div className={styles.brandHero}>
          <h2 className={styles.brandTitle}>
            <Trans i18nKey="auth:forgot.brandTitle" t={t}>Locked out?<br />We'll get you <em>flying</em></Trans>
          </h2>
          <p className={styles.brandSub}>
            {t('auth:forgot.brandSub', 'Reset your password in three quick steps and pick up right where you left off.')}
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
              <div className={styles.avatarRing}>
                <img src={logoIcon} alt="" className={styles.avatarLogo} />
              </div>

              {step === 1 && <>
                <h1 className={styles.cardTitle}>{t('auth:forgot.step1Title', 'Forgot your password?')}</h1>
                <p className={styles.cardSub}>{t('auth:forgot.step1Sub', 'Enter your email and we\'ll send you a 6-digit code.')}</p>
              </>}
              {step === 2 && <>
                <h1 className={styles.cardTitle}>{t('auth:forgot.step2Title', 'Check your inbox')}</h1>
                {/* Not "we sent you a code". The server deliberately answers the same way
                    whether or not it knows the address, so that it cannot be used to find
                    out who is registered here, which means this screen genuinely does not
                    know whether anything was sent. Claiming it did left anyone who mistyped
                    their address waiting on an email that was never going to arrive, with
                    nothing on screen to suggest why.

                    "On file" rather than "has an account" because a code also goes to
                    someone an agent booked over the phone, who has bookings here but has
                    never had a login: the reset is where they get one. */}
                <p className={styles.cardSub}>
                  {t('auth:forgot.step2Sub', 'If we have that email on file, a 6-digit code is on its way to')} <strong className={fp.emailStrong}>{email}</strong>
                </p>
                {/* Same reason as the signup screen: junk-foldered and never-sent look
                    identical from the outside. */}
                <p className={fp.hint}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M4 7l8 6 8-6" /></svg>
                  {t('auth:checkSpamFolder', 'Not there within a minute? Check your spam or junk folder.')}
                </p>
                {/* The way out of the dead end, for the one case the reset cannot serve:
                    someone we have never dealt with at all. Without this they have no
                    reading of this screen except "the email is broken". */}
                <p className={fp.hint}>
                  {t('auth:forgot.noAccountHint', 'Never booked with us before?')}{' '}
                  <Link to="/register" className={fp.linkBtn}>{t('auth:forgot.createAccount', 'Create one')}</Link>
                </p>
              </>}
              {step === 3 && <>
                <h1 className={styles.cardTitle}>{t('auth:forgot.step3Title', 'Set a new password')}</h1>
                <p className={styles.cardSub}>{t('auth:forgot.step3Sub', 'Choose a strong password you haven\'t used before.')}</p>
              </>}
              {step === 4 && <>
                <h1 className={styles.cardTitle}>{t('auth:forgot.step4Title', 'Password updated')}</h1>
                <p className={styles.cardSub}>{t('auth:forgot.step4Sub', 'You\'re all set — sign in with your new password.')}</p>
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
                  <label className={styles.fieldLabel} htmlFor="fp-email">{t('auth:fields.emailAddress', 'Email address')}</label>
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
                  <span>{loading ? t('auth:forgot.sendingCode', 'Sending code…') : t('auth:forgot.sendResetCode', 'Send reset code')}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>

                <Link to="/login" className={fp.backLink}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  {t('auth:backToSignIn', 'Back to sign in')}
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
                    {t('auth:codeExpiresIn', { count: expiryMinutes, defaultValue_one: 'This code expires in {{count}} minute', defaultValue_other: 'This code expires in {{count}} minutes' })}
                  </p>
                )}

                <button className={styles.submitBtn} type="submit" disabled={loading || code.length !== CODE_LENGTH}>
                  <span>{loading ? t('auth:forgot.verifying', 'Verifying…') : t('auth:forgot.verifyCode', 'Verify code')}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>

                <div className={fp.resendRow}>
                  {secondsLeft > 0 ? (
                    <span className={fp.resendMuted}>{t('auth:resendIn', { seconds: secondsLeft, defaultValue: 'Didn\'t get it? Resend in {{seconds}}s' })}</span>
                  ) : (
                    <button type="button" className={fp.linkBtn} onClick={(e) => sendCode(e, { silent: true })} disabled={loading}>
                      {t('auth:resendCode', 'Resend code')}
                    </button>
                  )}
                  <button type="button" className={fp.linkBtn} onClick={() => { setStep(1); setCode(''); }}>
                    {t('auth:forgot.changeEmail', 'Change email')}
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 3 · new password ── */}
            {step === 3 && (
              <form className={styles.form} onSubmit={savePassword}>
                <div className={`${styles.field} ${focused === 'pw' ? styles.fieldFocused : ''} ${password ? styles.fieldHasValue : ''}`}>
                  <label className={styles.fieldLabel} htmlFor="fp-pw">{t('auth:fields.newPassword', 'New password')}</label>
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
                      placeholder={t('auth:fields.createStrongPassword', 'Create a strong password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocused('pw')}
                      onBlur={() => setFocused('')}
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(!showPw)} aria-label={showPw ? t('auth:fields.hidePassword', 'Hide password') : t('auth:fields.showPassword', 'Show password')}>
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
                  <label className={styles.fieldLabel} htmlFor="fp-confirm">{t('auth:fields.confirmPassword', 'Confirm password')}</label>
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
                      placeholder={t('auth:fields.repeatPassword', 'Repeat your password')}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      onFocus={() => setFocused('cf')}
                      onBlur={() => setFocused('')}
                      autoComplete="new-password"
                    />
                  </div>
                  {confirm && confirm !== password && <p className={fp.fieldError}>{t('auth:validation.passwordsDontMatch', 'Passwords don\'t match')}</p>}
                </div>

                <button className={styles.submitBtn} type="submit" disabled={loading || !passwordValid || password !== confirm}>
                  <span>{loading ? t('auth:forgot.updating', 'Updating…') : t('auth:forgot.updatePassword', 'Update password')}</span>
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
                  {t('auth:forgot.signedOutEverywhere', 'For your security we signed you out everywhere else.')}
                </p>
                <button className={styles.submitBtn} type="button" onClick={() => navigate('/login')}>
                  <span>{t('auth:forgot.goToSignIn', 'Go to sign in')}</span>
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
