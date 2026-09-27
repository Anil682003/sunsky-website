import { Link, useNavigate } from 'react-router-dom';
import styles from './Footer.module.css';
import { useHomepageConfig, useFooterConfig } from '../../api';
import { resolveCmsImageUrl } from '../../utils/cmsImage';
import { cmsText } from '../../utils/cmsText';
import { findLegalLink } from '../../utils/legalLinks';
import Trustpilot from '../../components/Trustpilot/Trustpilot';
import { SCORE_TEMPLATE } from '../../components/Trustpilot/trustpilotConfig';
import { useConsent } from '../../context/ConsentContext';
import { useBrandLogo, BUNDLED_LOGO } from '../../hooks/useBrandLogo';
import { useTranslation } from 'react-i18next';

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

/**
 * The one footer entry that cannot be a URL: reopening the cookie consent
 * dialog calls a function. Withdrawing consent has to be as easy as giving it,
 * so it lives in the bottom bar unconditionally — but the CMS also needs to be
 * able to place it in a column, because that is where a reader looks for it,
 * next to the cookie policy. Writing this token as a link's URL does that.
 */
const CONSENT_TOKENS = ['#cookie-settings', '#cookie-instellingen', '#consent'];
const isConsentLink = (url) =>
  typeof url === 'string' && CONSENT_TOKENS.includes(url.trim().toLowerCase());

export default function Footer() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { data: footer } = useFooterConfig();
  const { data: cmsConfig } = useHomepageConfig();
  // Withdrawing consent has to be as easy as giving it, and it has to be reachable from every
  // page. The footer is the only thing on the site that qualifies. This cannot be a CMS link
  // like the others in this footer — it calls a function rather than going to a URL.
  const { reopen } = useConsent();
  const cookiePolicyUrl = findLegalLink(footer, ['cookie'], '/p/privacy-legal#cookie-policy');

  // One logo for the whole site, and the header slot leads — see hooks/useBrandLogo. This
  // footer used to prefer its OWN brandLogoUrl, which is why changing the logo in CMS →
  // Layout → Header moved the bar and left the footer showing the previous mark. The footer's
  // own slot is still honoured, but behind the one the agency actually edits.
  const { src: logoUrl, alt: cmsLogoAlt } = useBrandLogo({
    homepage: cmsConfig?.logo?.mainUrl,
    footer: footer?.brandLogoUrl,
  });
  const brandName = footer?.brandName || 'Sunsky';
  const brandDesc =
    footer?.brandDescription ||
    t('footer.brandDescription', 'Your trusted travel partner for unforgettable sun-soaked holidays around the world.');

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
                alt={cmsLogoAlt || brandName}
                className={styles.logoImg}
                onError={(e) => { if (e.currentTarget.src !== BUNDLED_LOGO) e.currentTarget.src = BUNDLED_LOGO; }}
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
                    alt={p.label || t('footer.paymentMethod', 'Payment method')}
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
                if (isConsentLink(url)) {
                  return (
                    <button key={key} type="button" className={styles.linkBtn} onClick={reopen}>
                      {l.label}
                    </button>
                  );
                }
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
          becomes the action of a panel that asks for something: a plain white card with the
          question on the left and their button on the right. */}
      <div className={styles.trustRow}>
        <Trustpilot template={SCORE_TEMPLATE} showPlaceholder={false} className={styles.trustWidget} />

        <div className={styles.invite}>
          <div className={styles.inviteText}>
            <h3 className={styles.inviteTitle}>{t('footer.inviteTitle', 'Travelled with us?')}</h3>
            <p className={styles.inviteSub}>
              {t(
                'footer.inviteText',
                'Tell the next traveller how it went. It takes a minute, and it helps someone choose their holiday with a bit more confidence.'
              )}
            </p>
          </div>

          <div className={styles.inviteAction}>
            {/* Trustpilot's own button. Sized here, styled by them. */}
            <Trustpilot template="reviewCollector" height="52px" className={styles.trustCollector} />
          </div>
        </div>
      </div>

      <div className={styles.divider} />
      <div className={styles.bottom}>
        <p className={styles.copy}>{copyright}</p>
        <div className={styles.bottomLinks}>
          {/* Dutch, like the rest of the site and like the CMS column above these. The
              settings control has to be reachable from every page, which is why it lives
              in the bottom bar rather than in a CMS column somebody could delete. */}
          <Link to={cookiePolicyUrl}>{t('footer.cookiePolicy', 'Cookiebeleid')}</Link>
          <button type="button" onClick={reopen}>{t('footer.cookieSettings', 'Cookie-instellingen')}</button>
        </div>
        {footer?.showLegal && footer?.legalText ? (
          <p className={styles.copy}>{footer.legalText}</p>
        ) : null}
      </div>
    </footer>
  );
}
