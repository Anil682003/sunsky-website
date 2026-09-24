import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { hotelDetailHref } from '../../../utils/searchDefaults';
import { formatReview } from '../../../utils/reviewBadge';
import HotelPhotoFallback from '../../../components/HotelPhotoFallback/HotelPhotoFallback';
import styles from './Hotels.module.css';
import SectionHead from './SectionHead';
import { useTranslation } from 'react-i18next';

// The CMS-picked cards carry the hotel's real identity (hotelCode + destinationCode), so each
// one links to that hotel's own live-priced detail page. The demo fallbacks below have no
// hotelCode and stay non-clickable — a card that goes nowhere is better than one that opens an
// empty search for a hotel that isn't in the inventory.
const FALLBACK_HOTELS = [
  { name:'Rixos Premium Belek',    loc:'🇹🇷 Antalya, Turkey',     score:'9.2', stars:5, price:'€899',  img:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80' },
  { name:'Atlantica Mare Village', loc:'🇨🇾 Ayia Napa, Cyprus',   score:'8.8', stars:5, price:'€749',  img:'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=80' },
  { name:'Iberostar Selection',    loc:'🇪🇸 Mallorca, Spain',      score:'9.0', stars:5, price:'€1,049',img:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80' },
  { name:'Steigenberger Aldau',    loc:'🇪🇬 Hurghada, Egypt',      score:'8.6', stars:5, price:'€599',  img:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80' },
  { name:'Secrets Lanzarote',      loc:'🇪🇸 Lanzarote, Spain',    score:'9.1', stars:5, price:'€879',  img:'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&q=80' },
];

const Star = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const Heart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const Chevron = ({ dir }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);

/**
 * Previous / next for the rail. The rail still scrolls by touch and trackpad; these are for
 * a mouse, which otherwise had no way to reach the cards past the right edge. Each end
 * disables its button once there is nothing further that way.
 */
function useRail(ref) {
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [ref, measure]);

  // One card (plus its gap) per press, so the rail always stops on a card edge.
  const step = (dir) => {
    const el = ref.current;
    const card = el?.firstElementChild;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: 'smooth' });
  };

  return { edges, step };
}

export default function Hotels({ cms }) {
  const { t } = useTranslation('home');
  const sh = cms?.sectionHeaders?.hotels;
  const tag      = sh?.tag      || t('hotels.tag', 'Top Rated');
  const title    = sh?.title    || t('hotels.title', 'Popular with our holidaymakers');
  const subtitle = sh?.subtitle || t('hotels.subtitle', 'Top-rated hotels loved by thousands of happy travelers.');

  const hotels = (cms?.popularHotels?.length > 0)
    ? cms.popularHotels.map((h) => {
        // The real stored TripAdvisor rating (/10) wins over the manual marketing "score" — the
        // spec wants the homepage to show the stored rating. `rev` is null when the hotel has no
        // fresh rating, and the card then falls back to the CMS score.
        const rev = formatReview(h.review);
        const card = {
          name:  h.name,
          loc:   h.location || h.loc,
          score:      rev ? rev.score : h.score,
          scoreLabel: rev ? rev.label : t('hotels.guestScore', 'Guest score'),
          stars: h.stars || 5,
          price: h.price,
          img:   h.imageUrl || h.img,
          hotelCode:       h.hotelCode ?? null,
          destinationCode: h.destinationCode ?? null,
        };
        return { ...card, href: hotelDetailHref(card) };
      })
    : FALLBACK_HOTELS.map((h) => ({ ...h, href: null, scoreLabel: t('hotels.guestScore', 'Guest score') }));

  const railRef = useRef(null);
  const { edges, step } = useRail(railRef);
  const controls = (
    <div className={styles.railNav}>
      <button
        type="button"
        className={styles.railBtn}
        onClick={() => step(-1)}
        disabled={edges.start}
        aria-label={t('hotels.previous', 'Previous hotels')}
      >
        <Chevron dir="prev" />
      </button>
      <button
        type="button"
        className={styles.railBtn}
        onClick={() => step(1)}
        disabled={edges.end}
        aria-label={t('hotels.next', 'Next hotels')}
      >
        <Chevron dir="next" />
      </button>
    </div>
  );

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <SectionHead eyebrow={tag} title={title} subtitle={subtitle} action={controls} />

        <div className={styles.scroll} ref={railRef}>
          {hotels.map((h, i) => (
            <article key={i} className={`${styles.card} ${h.href ? styles.cardLinked : ''}`}>

              {/* Whole-card click target. Hidden from the keyboard and from assistive tech
                  (tabIndex -1 + aria-hidden) because "View Deal" below is the SAME link and
                  is the one that should be announced — one destination, one announced link. */}
              {h.href && (
                <Link to={h.href} className={styles.cardLink} tabIndex={-1} aria-hidden="true" />
              )}

              <div className={styles.imgWrap}>
                <div className={styles.imgClip}>
                  {h.img
                    ? <img src={h.img} alt={h.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : null}
                  <HotelPhotoFallback variant="tile" seed={h.hotelCode || h.name} />
                </div>
                <button type="button" className={styles.fav} aria-label={t('hotels.saveToFavourites', {
                  name: h.name,
                  defaultValue: 'Save {{name}} to favourites',
                })}><Heart /></button>
                {h.score && (
                  <div className={styles.score}>
                    <span className={styles.scoreNum}>{h.score}</span>
                    <span className={styles.scoreLbl}>{h.scoreLabel || t('hotels.guestScore', 'Guest score')}</span>
                  </div>
                )}
              </div>

              <div className={styles.body}>
                <div className={styles.stars}>{Array(h.stars || 5).fill(0).map((_, j) => <Star key={j} />)}</div>
                <div className={styles.name}>{h.name}</div>
                <div className={styles.loc}>{h.loc}</div>

                {h.price && (
                  <div className={styles.foot}>
                    <div className={styles.priceBlock}>
                      <div className={styles.from}>{t('hotels.from', 'From')}</div>
                      <div className={styles.price}>{h.price} <span className={styles.pp}>{t('hotels.perPerson', 'p.p.')}</span></div>
                    </div>
                    {h.href ? (
                      <Link to={h.href} className={styles.viewBtn} aria-label={t('hotels.viewDealFor', {
                          name: h.name,
                          defaultValue: 'View deal for {{name}}',
                        })}>
                        {t('hotels.viewDeal', 'View Deal')}
                      </Link>
                    ) : (
                      <button type="button" className={styles.viewBtn} disabled>
                        {t('hotels.viewDeal', 'View Deal')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
