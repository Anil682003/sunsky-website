import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useBrandLogo } from '../../hooks/useBrandLogo';
// The round chip inside the card is a circular slot; the wide wordmark would be a sliver in
// it, so it keeps the square mark — the same one the browser tab shows.
import logoIcon from '../../assets/logo-icon.png';
import styles from './Login.module.css';   // shared auth shell (brand column, card, fields)
import fp from './ForgotPassword.module.css';
import CodeInput, { CODE_LENGTH } from './CodeInput';

const RESEND_SECONDS = 45;

/**
 * Signup step 2: confirm the email address.
 *
 * Rendered instead of the signup form once the server has accepted the details
 * and sent a code. It owns none of the signup data — the form keeps that in
 * state and passes the two actions in — so going back is free and nothing is
 * lost if the code never arrives.
 *
 * Deliberately the same shell and the same code field as the password-reset
 * flow: a customer who has seen one should find nothing new to learn here.
 */
export default function RegisterVerify({
  email,
  expiryMinutes,
  submitting,
  onVerify,      // (code) => Promise<void>  — creates the account
  onResend,      // () => Promise<boolean>   — true when a new code went out
  onBack,        // () => void               — back to the form
}) {
  const { t } = useTranslation('auth');
  // The logo the dashboard sets, with the bundled one showing until it lands.
  const brandLogo = useBrandLogo();

  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const busy = submitting || resending;

  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || busy) return;
    try {
      await onVerify(code);
    } catch {
      // The parent surfaces the reason; here we only mark the field wrong and
      // clear it, so the next attempt starts from an empty row.
      setInvalid(true);
      setCode('');
    }
  };

  const resend = async () => {
    if (busy || secondsLeft > 0) return;
    setResending(true);
    try {
      const ok = await onResend();
      if (ok) { setSecondsLeft(RESEND_SECONDS); setCode(''); setInvalid(false); }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Left branding */}
      <div className={styles.brandPanel}>
        <Link to="/" className={styles.logo}>
          {/* The wordmark carries the name, so no text beside it. */}
          <img src={brandLogo.src} alt={brandLogo.alt || 'Sunsky Vakanties'} className={styles.logoWordmark} />
        </Link>

        <div className={styles.brandHero}>
          <h2 className={styles.brandTitle}>
            <Trans i18nKey="auth:registerVerify.brandTitle" t={t}>One last step<br />and you're <em>onboard</em></Trans>
          </h2>
          <p className={styles.brandSub}>
            {t('auth:registerVerify.brandSub', 'We just need to know this inbox is really yours. Your account is created the moment the code checks out.')}
          </p>
        </div>
      </div>

      {/* Right card */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardHead}>
              <div className={styles.avatarRing}>
                <img src={logoIcon} alt="" className={styles.avatarLogo} />
              </div>

              <h1 className={styles.cardTitle}>{t('auth:registerVerify.title', 'Confirm your email')}</h1>
              <p className={styles.cardSub}>
                {t('auth:forgot.step2Sub', 'We sent a 6-digit code to')} <strong className={fp.emailStrong}>{email}</strong>
              </p>
            </div>

            <form className={styles.form} onSubmit={submit}>
              <CodeInput
                value={code}
                onChange={(v) => { setCode(v); setInvalid(false); }}
                disabled={busy}
                invalid={invalid}
              />

              {expiryMinutes != null && (
                <p className={fp.hint}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  {t('auth:codeExpiresIn', { count: expiryMinutes, defaultValue_one: 'This code expires in {{count}} minute', defaultValue_other: 'This code expires in {{count}} minutes' })}
                </p>
              )}

              {/* A code sitting in the junk folder looks exactly like a code that was never
                  sent, and the person waiting has no way to tell the difference. */}
              <p className={fp.hint}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M4 7l8 6 8-6" /></svg>
                {t('auth:checkSpamFolder', 'Not there within a minute? Check your spam or junk folder.')}
              </p>

              <button className={styles.submitBtn} type="submit" disabled={busy || code.length !== CODE_LENGTH}>
                <span>{submitting ? t('auth:registerVerify.creatingAccount', 'Creating account…') : t('auth:registerVerify.confirmAndCreate', 'Confirm and create account')}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>

              <div className={fp.resendRow}>
                {secondsLeft > 0 ? (
                  <span className={fp.resendMuted}>{t('auth:resendIn', { seconds: secondsLeft, defaultValue: 'Didn\'t get it? Resend in {{seconds}}s' })}</span>
                ) : (
                  <button type="button" className={fp.linkBtn} onClick={resend} disabled={busy}>
                    {resending ? t('auth:registerVerify.sending', 'Sending…') : t('auth:resendCode', 'Resend code')}
                  </button>
                )}
                <button type="button" className={fp.linkBtn} onClick={onBack} disabled={busy}>
                  {t('auth:registerVerify.changeDetails', 'Change details')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
