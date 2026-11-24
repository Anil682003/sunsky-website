import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConsent } from '../../context/ConsentContext';
import { SITE_DOMAINS } from '../../utils/siteDomain';
import { siteOfHost, siteToOffer } from './siteSwitchRules';
import styles from './SiteSwitch.module.css';

/**
 * "Would you like the Belgian website?" (Levent, 24 Nov 2026). A visitor from Belgium on
 * www.sunsky.nl is offered www.sunsky.be, and a visitor from the Netherlands on www.sunsky.be is
 * offered www.sunsky.nl. Yes: the same page on the other site. No: they stay, and are not asked
 * again on this site.
 *
 *   - The country comes from our own website server (/__site/country, a local IP list): no
 *     outside service, nothing stored. Anyone else (another country, unknown) is never asked.
 *   - Never during checkout, payment, a booking or an account page: switching there would lose
 *     what the visitor is doing.
 *   - Only on www.sunsky.be / www.sunsky.nl themselves (not holidaybooking.be, not localhost).
 *   - A question, never a redirect: search engines index both sites as they are.
 *   - Waits for the cookie notice to be answered, so two cards never stack.
 */
const KEY = 'sunsky.siteSwitch';
const NO_PROMPT = /^\/(checkout|booking|account|voucher|login|register|forgot-password)(\/|$)/;

const remembered = () => { try { return window.localStorage.getItem(KEY); } catch { return null; } };
const remember = (v) => { try { window.localStorage.setItem(KEY, v); } catch { /* private mode: asked again next visit */ } };

export default function SiteSwitch() {
  const { t } = useTranslation('common');
  const { pathname, search, hash } = useLocation();
  const { open: consentOpen } = useConsent();
  const [offer, setOffer] = useState(null);   // 'BE' | 'NL' | null
  const here = siteOfHost(typeof window !== 'undefined' ? window.location.hostname : '');

  useEffect(() => {
    if (!here || remembered()) return undefined;
    let alive = true;
    fetch('/__site/country', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setOffer(siteToOffer(here, d?.country)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [here]);

  if (!offer || consentOpen || NO_PROMPT.test(pathname)) return null;

  const target = SITE_DOMAINS[offer];
  const otherName = offer === 'BE' ? 'sunsky.be' : 'sunsky.nl';
  const hereName = here === 'BE' ? 'sunsky.be' : 'sunsky.nl';
  const go = () => { remember('switched'); window.location.assign(`${target}${pathname}${search}${hash}`); };
  const stay = () => { remember('stay'); setOffer(null); };

  return (
    <div className={styles.card} role="dialog" aria-modal="false" aria-labelledby="site-switch-title">
      <p id="site-switch-title" className={styles.text}>
        {offer === 'BE'
          ? t('siteSwitch.toBe', 'It looks like you are in Belgium. Would you like to go to our Belgian website?')
          : t('siteSwitch.toNl', 'It looks like you are in the Netherlands. Would you like to go to our Dutch website?')}
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} onClick={go}>
          {t('siteSwitch.go', { site: otherName, defaultValue: 'Go to {{site}}' })}
        </button>
        <button type="button" className={styles.secondary} onClick={stay}>
          {t('siteSwitch.stay', { site: hereName, defaultValue: 'Stay on {{site}}' })}
        </button>
      </div>
    </div>
  );
}
