import { Link } from 'react-router-dom';
import styles from './TrustBar.module.css';
import { useFooterConfig, useHomepageConfig } from '../../../api';
import { findLegalLink } from '../../../utils/legalLinks';
import { INSURANCE_MARKS, INSURANCE_MARK_LIST } from '../../../utils/insuranceMarks';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import CmsLink from '../../../components/CmsLink/CmsLink';

/**
 * The guarantee bar — the "trust balk" the agency asked for, sitting high on the page where a
 * traveller is still deciding whether this is a company to hand money to.
 *
 * It shows the marks and NOTHING ELSE about them. Everything a seal asserts is already printed
 * on the seal; anything this bar added on top would be the website making a financial-protection
 * claim of its own, which is not the website's to make. The one link goes to the agency's own
 * insurance page, resolved out of the footer CMS the same way the checkout resolves its legal
 * links, so renaming that page in the dashboard never leaves a dead end here.
 *
 * Each mark can also carry its own link to the body it represents, set in the dashboard on the
 * same trust row the homepage grid reads. Deliberately the SAME row rather than a second list:
 * the two surfaces show the same seal, and a mark that goes to VVR in one place and nowhere in
 * the other is the kind of difference nobody notices until a traveller reports it.
 */
export default function TrustBar() {
  const { data: footer } = useFooterConfig();
  // Keyed on "protection", not "insurance": the agency's page is called "Financial Protection
  // and VVR Membership", while "insurance" matches their SEPARATE travel-and-cancellation
  // insurance page — a product the traveller buys, not the guarantee these marks stand for.
  const insuranceUrl = findLegalLink(footer, ['protection'], '/p/protection-insurance');

  // The marks sit at a known offset in the dashboard's trust list (see insuranceMarks.js), so
  // mark N is trust row offset+N. An absent row just means the bundled seal and no link.
  const { data: cmsConfig } = useHomepageConfig();
  const rowFor = (i) => cmsConfig?.trustItems?.[INSURANCE_MARKS.offset + i] ?? null;

  /**
   * The picture, the words under it and where it goes, all off the same dashboard row.
   *
   * The seals were bundled files for a while, which meant changing one — a renewed insolvency
   * certificate, a rebranded association — was a developer job and a deploy. An uploaded logo
   * now wins over the bundled one, and the bundled one stays as the fallback so the bar is
   * never empty while nobody has uploaded anything.
   */
  const markFor = (m, i) => {
    const row = rowFor(i);
    const uploaded = resolveCmsImageUrl(row?.imageUrl);
    return {
      src: uploaded || m.img,
      // A custom logo needs its own description; the bundled alt would describe the wrong seal.
      alt: row?.imageAlt || (uploaded ? row?.title || '' : m.alt),
      url: row?.url || row?.link || '',
    };
  };

  return (
    <section className={styles.wrap} aria-labelledby="trustbar-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.lead}>
          <span className={styles.eyebrow} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
            </svg>
            Guarantees
          </span>
          <h2 id="trustbar-title" className={styles.title}>
            Your holiday is <span className={styles.accent}>protected</span>
          </h2>
        </div>

        <ul className={styles.marks}>
          {INSURANCE_MARK_LIST.map((m, i) => {
            const { src, alt, url } = markFor(m, i);
            return (
              <li key={m.key} className={styles.markItem}>
                <CmsLink
                  url={url}
                  className={styles.markLink}
                  title={url && alt ? `${alt} (opens their website)` : undefined}
                >
                  <img className={styles.mark} src={src} alt={alt} loading="lazy" />
                </CmsLink>
              </li>
            );
          })}
        </ul>

        <Link className={styles.more} to={insuranceUrl}>
          How you are covered
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
