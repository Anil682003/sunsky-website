import styles from './Trust.module.css';
import SectionHead from './SectionHead';
import { INSURANCE_MARKS } from '../../../utils/insuranceMarks';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import CmsLink from '../../../components/CmsLink/CmsLink';
import { useTranslation } from 'react-i18next';

const FALLBACK_ITEMS = [
  { key:'bestPrice', title:'Best Price Guarantee', desc:"Found it cheaper? We'll match and beat it.",
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg> },
  { key:'noFees', title:'No Booking Fees', desc:'What you see is what you pay. Zero hidden charges.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg> },
  { key:'securePayment', title:'Secure Payment', desc:'256-bit SSL encryption on every transaction.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg> },
  { key:'trustedPartners', title:'Trusted Partners', desc:'Only verified hotels and airlines.',
    icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
];

/**
 * The guarantee seal for a slot the dashboard left EMPTY.
 *
 * Position alone is not enough. The seals live at indices 4 and 5 because that is where the
 * dashboard's two blank entries sit today, but the moment anyone adds or reorders a promise in
 * the dashboard, index 4 is a different card — and stamping "Verzekerd tegen Insolventie" onto
 * whatever marketing line happens to land there would be the site asserting insolvency cover
 * over unrelated copy. So a seal is only ever placed where the agency wrote nothing at all,
 * which is exactly the slot they left for it. Reorder the list and the seals simply stop
 * appearing, which is visible and harmless; the alternative is quietly wrong.
 */
const markFor = (item, i) => {
  // An uploaded logo is an explicit instruction: show THIS picture on THIS row. It wins over
  // everything below, and it may carry words, because the person who uploaded it also wrote
  // them and nothing is being asserted on their behalf.
  const uploaded = resolveCmsImageUrl(item?.imageUrl);
  if (uploaded) {
    return { img: uploaded, alt: item?.imageAlt || item?.title || '' };
  }

  const hasWords = Boolean(item?.title || item?.description || item?.desc);
  if (hasWords) return null;
  return INSURANCE_MARKS[i - INSURANCE_MARKS.offset] || null;
};

export default function Trust({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.trust;
  const tag      = sh?.tag      || t('trust.tag', 'Trust');
  const title    = sh?.title    || t('trust.title', 'Why book with Sunsky?');
  const subtitle = sh?.subtitle || t('trust.subtitle', 'Thousands of travelers trust us for stress-free holidays.');

  // A card is a PROMISE (icon + words, written in the dashboard) or a SEAL (a guarantee mark
  // we hold, drawn from the assets). The dashboard's own text still wins on a seal card, so the
  // client can word the cover however their insurer requires without a release; where they have
  // written nothing, the seal stands on its own rather than being captioned with a claim about
  // financial protection that nobody has approved.
  const items = (cms?.trustItems?.length > 0)
    ? cms.trustItems.map((row, i) => {
        const mark = markFor(row, i);
        return {
          title: row.title || mark?.title || '',
          desc: row.description || row.desc || mark?.desc || '',
          // Where the dashboard wants this card to go. Read off the same row the words come
          // from, so the person who writes a seal's caption also sets where it points.
          url: row.url || row.link || '',
          mark,
          icon: mark ? null : FALLBACK_ITEMS[i % FALLBACK_ITEMS.length].icon,
        };
      })
      // An entry with no words and no seal is an empty slot in the dashboard, not a card. It
      // used to render as a blank dashed rectangle on the live homepage.
      .filter((it) => it.mark || it.title || it.desc)
    : FALLBACK_ITEMS.map((it) => ({
        ...it,
        title: t(`trust.items.${it.key}.title`, it.title),
        desc: t(`trust.items.${it.key}.desc`, it.desc),
      }));

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* The trust section keeps its heading plain: no script word, nothing playful. */}
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} accent={false} />

        {/* Every card has the same shape: a mark (icon, or the seal itself), a title and a
            line of text, so a promise and a guarantee read at the same weight. */}
        <div className={styles.grid}>
          {items.map((item, i) => (
            <div key={i} className={styles.item}>
              {item.mark ? (
                <div className={styles.markWrap}>
                  <CmsLink
                    url={item.url}
                    className={styles.markLink}
                    title={
                      item.url
                        ? t('trust.opensWebsite', {
                            name: item.mark.alt,
                            defaultValue: '{{name}} (opens their website)',
                          })
                        : undefined
                    }
                  >
                    <img className={styles.mark} src={item.mark.img} alt={item.mark.alt} loading="lazy" />
                  </CmsLink>
                </div>
              ) : (
                item.icon && <div className={styles.icon}>{item.icon}</div>
              )}
              {item.title && <div className={styles.itemTitle}>{item.title}</div>}
              {item.desc && <div className={styles.itemDesc}>{item.desc}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
