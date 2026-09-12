import { Link, useNavigate } from 'react-router-dom';
import styles from './Footer.module.css';
import { useHomepageConfig, useFooterConfig } from '../../api';
import { resolveCmsImageUrl } from '../../utils/cmsImage';
import { cmsText } from '../../utils/cmsText';
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
/**
 * Repair a CMS link that starts with more slashes than it should.
 *
 * A saved footer link read "//p/Bankgegevens-#Bankgegevens" and was dead: a
 * browser reads a leading double slash as the start of a HOST, so it went
 * looking for a site called "p" rather than a page here. The CMS field is for
 * site paths ("/help/customer-service") and nobody enters protocol-relative
 * URLs there, so the extra slashes are always a typo and are collapsed.
 *
 * A real external link carries its scheme (https://, mailto:, tel:) and is left
 * exactly as it is, as is a bare anchor.
 */
const normaliseUrl = (url) => {
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('#')) return trimmed;
  return trimmed.replace(/^\/{2,}/, '/');
};

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

  // The footer CMS owns its own brand logo, then the homepage one, then the bundled file.
  // That last step is new: before, an empty or unreachable CMS dropped the footer to a plain
  // text brand name, which looks broken for a reason the visitor cannot see. All three hold
  // the same wordmark now.
  const logoUrl =
    resolveCmsImageUrl(footer?.brandLogoUrl)
    || resolveCmsImageUrl(cmsConfig?.logo?.mainUrl)
    || mainLogoFallback;
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

  // An icon counts if it has a picture OR a label. It used to require a label,
  // so an uploaded image with no caption was dropped and the author saw nothing
  // appear however many times they uploaded it.
  const pays = (footer?.paymentIcons ?? []).filter(
    (p) => p && p.active !== false && (p.label || p.imageUrl)
  );
  const payItems = pays.length
    ? pays.map((p) => ({ label: p.label || '', imageUrl: resolveCmsImageUrl(p.imageUrl) }))
    : FALLBACK_PAYS.map((label) => ({ label, imageUrl: null }));

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
          <p>{cmsText(brandDesc)}</p>
          <div className={styles.pays}>
            {/* The uploaded icon when there is one, the label otherwise. An
                image that fails to load falls back to its label rather than
                leaving an empty box in the row. */}
            {payItems.map((p, i) => (
              <span key={`${p.label}-${i}`} className={p.imageUrl ? styles.payImg : styles.pay}>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.label || 'Payment method'}
                    loading="lazy"
                    onError={(e) => {
                      const holder = e.currentTarget.parentElement;
                      if (!holder) return;
                      holder.className = styles.pay;
                      holder.textContent = p.label || '';
                    }}
                  />
                ) : (
                  p.label
                )}
              </span>
            ))}
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
                const url = normaliseUrl(l.url);
                if (isPlaceholder(url)) return <a key={key} href="#">{l.label}</a>;
                return isInternal(url)
                  ? <Link key={key} to={url}>{l.label}</Link>
                  : <a key={key} href={url} target="_blank" rel="noreferrer">{l.label}</a>;
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
