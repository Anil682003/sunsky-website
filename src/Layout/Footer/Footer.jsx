import { Link, useNavigate } from 'react-router-dom';
import styles from './Footer.module.css';
import { useHomepageConfig, useFooterConfig } from '../../api';
import { resolveCmsImageUrl } from '../../utils/cmsImage';
import { findLegalLink } from '../../utils/legalLinks';
import Trustpilot from '../../components/Trustpilot/Trustpilot';
import { SCORE_TEMPLATE } from '../../components/Trustpilot/trustpilotConfig';
import { useConsent } from '../../context/ConsentContext';
import mainLogoFallback from '../../assets/main-logo.png';

// Shown only until the footer CMS answers (or if it is unreachable), so the
// footer never renders blank.
const FALLBACK_COLS = [
  { title: 'Destinations', links: ['Spain','Turkey','Greece','Egypt','Canary Islands','Italy'] },
  { title: 'Travel Types', links: ['All Inclusive','City Trips','Last Minute','Family Holidays','Adults Only','Car Holidays'] },
];

const FALLBACK_PAYS = ['VISA', 'MC', 'AMEX', 'PayPal'];

// A link is internal when it is a site path; anything else (mailto:, https://…)
// has to stay a plain anchor. '#' and blanks are placeholders for pages that do
// not exist yet and must not navigate.
const isPlaceholder = (url) => !url || url === '#';
const isInternal = (url) => typeof url === 'string' && url.startsWith('/');

export default function Footer() {
  const navigate = useNavigate();
  const { data: footer } = useFooterConfig();
  const { data: cmsConfig } = useHomepageConfig();
  // Withdrawing consent has to be as easy as giving it, and it has to be reachable from every
  // page. The footer is the only thing on the site that qualifies. This cannot be a CMS link
  // like the others in this footer — it calls a function rather than going to a URL.
  const { reopen } = useConsent();
  const cookiePolicyUrl = findLegalLink(footer, ['cookie'], '/p/privacy-legal#cookie-policy');

  // The footer CMS owns its own brand logo; the homepage logo is the fallback so
  // the site still shows a mark before/without one being set there.
  const logoUrl =
    resolveCmsImageUrl(footer?.brandLogoUrl) || resolveCmsImageUrl(cmsConfig?.logo?.mainUrl);
  const brandName = footer?.brandName || 'Sunsky';
  const brandDesc =
    footer?.brandDescription ||
    'Your trusted travel partner for unforgettable sun-soaked holidays around the world.';

  // Only sections that still have at least one active link are worth a column.
  const cmsCols = (footer?.navigationSections ?? [])
    .map((s) => ({
      title: s?.title || '',
      links: (s?.links ?? []).filter((l) => l && l.active !== false && l.label),
    }))
    .filter((s) => s.title && s.links.length);

  const cols = cmsCols.length
    ? cmsCols
    : FALLBACK_COLS.map((c) => ({ title: c.title, links: c.links.map((label) => ({ label, url: '#' })) }));

  const pays = (footer?.paymentIcons ?? []).filter((p) => p && p.active !== false && p.label);
  const payLabels = pays.length ? pays.map((p) => p.label) : FALLBACK_PAYS;

  const copyright =
    footer?.copyrightText?.trim() ||
    `© ${new Date().getFullYear()} Sunsky Travel. All rights reserved.`;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                className={styles.logoImg}
                onError={(e) => { if (e.currentTarget.src !== mainLogoFallback) e.currentTarget.src = mainLogoFallback; }}
              />
            ) : (
              <span className={styles.logoText}>{brandName}</span>
            )}
          </div>
          <p>{brandDesc}</p>
          <div className={styles.pays}>
            {payLabels.map((p) => <span key={p} className={styles.pay}>{p}</span>)}
          </div>
        </div>

        {/* Columns are siblings of the brand block, not nested, so they share
            its grid row instead of starting underneath it. */}
        {cols.map((col) => (
          <div key={col.title} className={styles.navCol}>
            <h4>{col.title}</h4>
            <div className={styles.navLinks}>
              {col.links.map((l, i) => {
                const key = `${l.label}-${i}`;
                if (isPlaceholder(l.url)) return <a key={key} href="#">{l.label}</a>;
                return isInternal(l.url)
                  ? <Link key={key} to={l.url}>{l.label}</Link>
                  : <a key={key} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The review invitation.

          Trustpilot's button is an iframe from their origin, so not one pixel inside it can
          be restyled — that is the whole point of their brand rules. What CAN be designed is
          everything around it, so the button stops being a stray bordered box in a gap and
          becomes the action of a panel that asks for something. The panel is built in the
          same passport-stamp idiom as the homepage trust section: dashed orange border, a
          postmark, and a handwritten note pointing at the thing to press. */}
      <div className={styles.trustRow}>
        <Trustpilot template={SCORE_TEMPLATE} showPlaceholder={false} className={styles.trustWidget} />

        <div className={styles.invite}>
          <span className={styles.invitePostmark} aria-hidden="true">
            <svg viewBox="0 0 96 96" fill="none">
              <circle cx="48" cy="48" r="45" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" />
              <circle cx="48" cy="48" r="34" stroke="currentColor" strokeWidth="1.2" />
              <path d="M25 48h46M48 25v46" stroke="currentColor" strokeWidth="1" opacity="0.45" />
              <g transform="translate(48 48) rotate(-18)">
                <path d="M15 0 L-11 10 L-4 0 L-11 -10 Z" fill="currentColor" />
              </g>
            </svg>
          </span>

          <div className={styles.inviteText}>
            <h3 className={styles.inviteTitle}>Travelled with us?</h3>
            <p className={styles.inviteSub}>
              Tell the next traveller how it went. It takes a minute, and it helps someone
              choose their holiday with a bit more confidence.
            </p>
          </div>

          <div className={styles.inviteAction}>
            {/* Trustpilot's own button. Sized here, styled by them. */}
            <Trustpilot template="reviewCollector" height="52px" className={styles.trustCollector} />
            <span className={styles.inviteNote} aria-hidden="true">
              <svg className={styles.inviteArrow} viewBox="0 0 58 44" fill="none">
                <path d="M6 6 C 18 26, 34 34, 50 33" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M42 27 L51 34 L41 38" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={styles.inviteNoteText}>your turn!</span>
            </span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />
      <div className={styles.bottom}>
        <p className={styles.copy}>{copyright}</p>
        <div className={styles.bottomLinks}>
          <Link to={cookiePolicyUrl}>Cookie policy</Link>
          <button type="button" onClick={reopen}>Cookie settings</button>
        </div>
        {footer?.showLegal && footer?.legalText ? (
          <p className={styles.copy}>{footer.legalText}</p>
        ) : null}
      </div>
    </footer>
  );
}
