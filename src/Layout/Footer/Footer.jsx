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

      {/* Trustpilot. The score widget when the plan has one, and either way the review
          invitation — the one widget the free plan includes, and the thing that grows the
          reviews in the first place. */}
      <div className={styles.trustRow}>
        <Trustpilot template={SCORE_TEMPLATE} showPlaceholder={false} className={styles.trustWidget} />
        <Trustpilot template="reviewCollector" height="52px" className={styles.trustCollector} />
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
