import styles from './Trust.module.css';
import { INSURANCE_MARKS } from '../../../utils/insuranceMarks';
import { resolveCmsImageUrl } from '../../../utils/cmsImage';
import { cmsText } from '../../../utils/cmsText';
import CmsLink from '../../../components/CmsLink/CmsLink';
import { useTranslation } from 'react-i18next';

const FALLBACK_ITEMS = [
  { key:'bestPrice', title:'Best Price Guarantee', desc:"Found it cheaper? We'll match and beat it.",
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg> },
  { key:'noFees', title:'No Booking Fees', desc:'What you see is what you pay. Zero hidden charges.',
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7.5V6a2 2 0 00-2-2H5.5A2.5 2.5 0 003 6.5v11A2.5 2.5 0 005.5 20H19a2 2 0 002-2v-1.5"/><path d="M3 6.5A2.5 2.5 0 005.5 9H20a1 1 0 011 1v2.5h-4.2a2 2 0 100 4H21"/></svg> },
  { key:'securePayment', title:'Secure Payment', desc:'256-bit SSL encryption on every transaction.',
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4.5" width="20" height="15" rx="3"/><path d="M2 9.5h20"/><path d="M6 15h4"/></svg> },
  { key:'trustedPartners', title:'Trusted Partners', desc:'Only verified hotels and airlines.',
    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
];

/**
 * One colour per card, in the order the cards are laid out.
 *
 * `tint` is the icon tile, `wash` the arrow's disc and `ink` the mark drawn on both. They go
 * down as custom properties rather than as six pairs of classes, so a card's whole colour
 * story is one row of this table and the stylesheet stays one card wide.
 */
const ACCENTS = [
  { tint:'#DBEAFE', wash:'#EDF4FE', ink:'#2563EB' },
  { tint:'#E2F7E7', wash:'#EDF8F1', ink:'#0E9F6E' },
  { tint:'#FEF3E4', wash:'#FDF5EA', ink:'#E0870F' },
  { tint:'#E7E0FE', wash:'#F1EDFE', ink:'#7C3AED' },
  { tint:'#FED8E2', wash:'#FDEAEF', ink:'#E11D48' },
  { tint:'#DBEAFE', wash:'#EDF4FE', ink:'#2563EB' },
];

const ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

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
  const subtitle = sh?.subtitle || t('trust.subtitle', 'Thousands of travellers trust us for stress-free holidays.');

  // The heading is written out here instead of coming from SectionHead: this section runs at
  // its own scale over the photograph, and its last word is picked out in brand blue rather
  // than in the handwritten accent the other sections use.
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);
  const lastWord = words.pop();
  const leadWords = words.join(' ');

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
        <header className={styles.head}>
          {tag && <p className={styles.eyebrow}>{tag}</p>}
          <h2 className={styles.title}>
            {leadWords}
            {lastWord && (
              <>
                {leadWords && ' '}
                <span className={styles.titleAccent}>{lastWord}</span>
              </>
            )}
          </h2>
          {subtitle && <p className={styles.sub}>{cmsText(subtitle)}</p>}
        </header>

        {/* Every card has the same shape: a mark (icon, or the seal itself), a title and a
            line of text, so a promise and a guarantee read at the same weight. */}
        <div className={styles.grid}>
          {items.map((item, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            return (
              <div
                key={i}
                className={styles.item}
                style={{ '--tint': accent.tint, '--wash': accent.wash, '--ink': accent.ink }}
              >
                <div className={styles.top}>
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

                  {/* An arrow only where there is somewhere to go. The design draws one on every
                      card, but a promise written in the dashboard has no destination, and an
                      arrow that invites a click and does nothing is worse than no arrow. A seal
                      card is already linked through the seal itself, so a second link to the
                      same place would only read the destination out twice. */}
                  {item.url && !item.mark && (
                    <CmsLink url={item.url} className={styles.arrow} aria-label={item.title || undefined}>
                      {ARROW}
                    </CmsLink>
                  )}
                </div>

                {item.title && <div className={styles.itemTitle}>{item.title}</div>}
                {item.desc && <div className={styles.itemDesc}>{item.desc}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
