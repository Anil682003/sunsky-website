import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import mainLogo from '../../assets/main-logo.png';
import styles from './Login.module.css';   // shared auth shell (sky scene, card, fields)
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
            One last step<br />and you're <em>onboard</em>
          </h2>
          <p className={styles.brandSub}>
            We just need to know this inbox is really yours. Your account is created the moment the code checks out.
          </p>
        </div>
      </div>

      {/* Right card */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardInner}>
            <div className={styles.cardHead}>
              <div className={styles.routeRow} aria-hidden="true">
                <span>YOU</span>
                <span className={styles.routeDash} />
                <span className={styles.routePlane}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                    <path d="M21.9 14.9L13.6 10.6V3.8c0-1-.7-1.8-1.6-1.8s-1.6.8-1.6 1.8v6.8L2.1 14.9v2.2l8.3-2.6v5.2L7.9 21.5v1.7l4.1-1.2 4.1 1.2v-1.7l-2.5-1.8v-5.2l8.3 2.6v-2.2z" />
                  </svg>
                </span>
                <span className={styles.routeDash} />
                <span>SUNSKY</span>
              </div>
              <div className={styles.avatarRing}>
                <img src={mainLogo} alt="" className={styles.avatarLogo} />
              </div>

              <h1 className={styles.cardTitle}>Confirm your email</h1>
              <p className={styles.cardSub}>
                We sent a 6-digit code to <strong className={fp.emailStrong}>{email}</strong>
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
                  This code expires in {expiryMinutes} minutes
                </p>
              )}

              <button className={styles.submitBtn} type="submit" disabled={busy || code.length !== CODE_LENGTH}>
                <span>{submitting ? 'Creating account…' : 'Confirm and create account'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>

              <div className={fp.resendRow}>
                {secondsLeft > 0 ? (
                  <span className={fp.resendMuted}>Didn't get it? Resend in {secondsLeft}s</span>
                ) : (
                  <button type="button" className={fp.linkBtn} onClick={resend} disabled={busy}>
                    {resending ? 'Sending…' : 'Resend code'}
                  </button>
                )}
                <button type="button" className={fp.linkBtn} onClick={onBack} disabled={busy}>
                  Change details
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
