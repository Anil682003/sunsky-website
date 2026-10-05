import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../services/axiosInstance';
import HotelImg from '../../components/HotelImg/HotelImg';
import HotelPhotoFallback from '../../components/HotelPhotoFallback/HotelPhotoFallback';
import { mainPrice, formatEuros, PRICE_KIND, PRODUCT } from '../../utils/tripPrice';
import { formatReview } from '../../utils/reviewBadge';
import { defaultSearchContext } from '../../utils/searchDefaults';
import styles from './SeoOffers.module.css';

/**
 * The commercial block on a permanent SEO page (§38).
 *
 * TWO RULES SHAPE EVERYTHING HERE.
 *
 * §38: "These components must reuse the existing commercial engine. No separate SEO-specific
 * price engine, search engine or availability engine may be introduced." So this calls the
 * SAME two cache endpoints the results page calls, with the same parameters and the same
 * response shapes, and prices are formatted through the SAME `mainPrice()` that implements
 * the Price & Display Policy. There is no arithmetic in this file.
 *
 * §39: "If a Tenerife SEO Page retrieves Tenerife offers internally to display a commercial
 * block, that internal query does not automatically mean the user explicitly selected
 * Tenerife. The user's SearchContext changes only through an explicit customer search."
 * So nothing here writes to the search store, saves a party, or touches the URL. It reads and
 * renders. The visitor's SearchContext is created only when they click through, which the
 * Navigation Addendum §6 defines as the explicit commercial action.
 */

/** Same constant, same default, as the results page. */
const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';

/** Eight cards. A landing page is a shop window, not a result set. */
const CARDS = 8;

/**
 * The party the from-prices are quoted for.
 *
 * Exactly 2 adults in 1 room, because that is the ONLY composition the Price & Display Policy
 * allows a "Vanaf € X p.p." headline for (§10, and spec 2.4). Quoting a from-price per person
 * for any other party would be the one thing that rule exists to prevent, so the block does
 * not offer the choice.
 */
const PARTY = Object.freeze({ adults: 2, children: 0, rooms: 1, childAges: [] });

export default function SeoOffers({ scope, heading }) {
  const { t, i18n } = useTranslation('common');
  /**
   * The cache keys on DESTINATION codes, not country codes: `destinations=TR` returns
   * nothing at all, while `destinations=AYT` returns hotels. The resolver therefore hands a
   * country page its destinations, already capped, and this just joins them.
   */
  const destinations = (scope?.destinationCodes?.length
    ? scope.destinationCodes.join(',')
    : scope?.destinationCode) || null;

  /**
   * The scope travels WITH the result, so "loading" is derived rather than set at the top of
   * the effect. Besides costing an extra render, resetting there leaves a tick where the
   * previous place's hotels sit under the new place's heading.
   */
  const [state, setState] = useState({ status: 'loading', cards: [], of: null });
  const fresh = state.of === destinations;

  useEffect(() => {
    if (!destinations) return undefined;
    let live = true;
    const ctrl = new AbortController();

    (async () => {
      try {
        /* 1 — prices, from the same endpoint and with the same parameter names the results
               page uses. `source=external` is the existing fast discovery path for a search
               with no dates, which is exactly what a landing page is. */
        /* The cache requires dates, so the block uses the SITE'S OWN default search context
           (30 days out, 7 nights) rather than inventing its own. That keeps §38 true in the
           detail as well as the shape: the same window the homepage and results page assume
           when a visitor has not picked dates, so a from-price here matches the one they
           will see after clicking through. */
        const ctx = defaultSearchContext();
        const qs = new URLSearchParams({
          destinations,
          checkIn: ctx.checkIn,
          checkOut: ctx.checkOut,
          adults: String(PARTY.adults),
          children: String(PARTY.children),
          rooms: String(PARTY.rooms),
          limit: String(CARDS),
          pageSize: String(CARDS),
          page: '1',
          sortBy: 'price_asc',
          source: 'external',
        });
        const priced = await fetch(`${CONTRACTS_API}/contracts/cheapest?${qs}`, { signal: ctrl.signal })
          .then((r) => { if (!r.ok) throw new Error(`cache ${r.status}`); return r.json(); });

        const results = (priced?.results || []).slice(0, CARDS);
        if (!live) return;
        if (!results.length) { setState({ status: 'empty', cards: [], of: destinations }); return; }

        const codes = [...new Set(results.map((r) => String(r.hotelCode)).filter(Boolean))];

        /* 2 — content and 3 — canonical URLs, in parallel. Neither is worth delaying the
               other for, and a failure in either leaves the cards usable. */
        const [info, paths] = await Promise.all([
          fetch(`${CONTRACTS_API}/hotels/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotelCodes: codes }),
            signal: ctrl.signal,
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          // The readable hotel URL for each card, so an internal link points straight at the
          // canonical address instead of /hotel/1672 and a redirect hop (§13).
          axiosInstance.get(`/website/seo/hotel-paths?codes=${codes.join(',')}`)
            .then(({ data }) => data?.data || {})
            .catch(() => ({})),
        ]);
        if (!live) return;

        const byCode = {};
        for (const h of (info?.hotels || info?.data || info || [])) {
          if (h?.hotelCode != null) byCode[String(h.hotelCode)] = h;
        }

        setState({
          status: 'ok',
          cards: results.map((r) => toCard(r, byCode[String(r.hotelCode)], paths)),
          of: destinations,
        });
      } catch (err) {
        if (!live || err?.name === 'AbortError') return;
        // A landing page whose shop window failed is still a useful page. §8's spirit as well
        // as its letter: "a supplier timeout must not turn a valid hotel content page into a
        // 404", and the same holds for the article and destination copy around this block.
        setState({ status: 'error', cards: [], of: destinations });
      }
    })();

    return () => { live = false; ctrl.abort(); };
  }, [destinations]);

  // No place to search for: a Travel Guide with no tags, or a holiday-type index page.
  if (!destinations) return null;

  // Nothing to show is not an error worth words. The page keeps its content and its CTA.
  if (!fresh) return <SkeletonGrid />;
  if (state.status !== 'ok' || !state.cards.length) return null;

  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>
        {heading || t('seo.offersHeading', 'Populaire hotels')}
      </h2>
      <p className={styles.sub}>
        {t('seo.offersSub', 'Vanafprijzen per persoon, op basis van 2 personen in 1 kamer.')}
      </p>

      <ul className={styles.grid}>
        {state.cards.map((c) => (
          <li key={c.hotelCode} className={styles.card}>
            <Link to={c.href} className={styles.cardLink}>
              <div className={styles.media}>
                {c.img
                  ? <HotelImg src={c.img} size="bigger" alt={c.name} loading="lazy" className={styles.img} />
                  : <HotelPhotoFallback name={c.name} location={c.loc || ''} seed={c.hotelCode} variant="card" className={styles.img} />}
              </div>
              <div className={styles.body}>
                {c.stars > 0 && (
                  <span className={styles.stars} aria-label={`${c.stars} sterren`}>
                    {'★'.repeat(Math.min(c.stars, 5))}
                  </span>
                )}
                <span className={styles.name}>{c.name}</span>
                {c.loc && <span className={styles.loc}>{c.loc}</span>}
                {c.review && (
                  <span className={styles.review} title={c.review.title}>
                    {c.review.score}
                    {/* `count` is 0 when the supplier did not give one, and "0 reviews"
                        beside an 8.8 reads as a contradiction. `meta` already omits it. */}
                    {c.review.count > 0 && <small>{c.review.meta}</small>}
                  </span>
                )}
                {c.price && (
                  <span className={styles.price}>
                    <small>{t(`${c.price.i18nKey}`, c.price.variant === 'FROM_PER_PERSON' ? 'Vanaf' : 'Totaal')}</small>
                    {formatEuros(c.price.amount, PRICE_KIND.SELLING, { locale: i18n.language === 'en' ? 'en-GB' : 'nl-BE' })}
                    {c.price.variant === 'FROM_PER_PERSON' && <small> p.p.</small>}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One cache result plus its content record, turned into a card.
 *
 * The price goes through `mainPrice()` untouched: it owns the "2 adults, 1 room → per person,
 * otherwise a total" rule and the whole-euro rounding. This function does no arithmetic,
 * which is how §38's "no separate SEO price engine" is kept true rather than merely stated.
 */
function toCard(result, info, paths) {
  const code = String(result.hotelCode);
  const images = Array.isArray(info?.images) ? info.images : [];
  // Same ordering preference the rest of the site uses for a hero shot.
  const first = [...images].sort(
    (a, b) => (a.visualOrder ?? a.order ?? 99) - (b.visualOrder ?? b.order ?? 99),
  )[0];

  return {
    hotelCode: code,
    name: info?.name?.trim() || result.hotelName || `Hotel ${code}`,
    stars: Number(info?.stars) || 0,
    loc: info?.cityName || info?.city || null,
    img: first?.url || null,
    review: info?.review ? formatReview(info.review) : null,
    price: mainPrice({
      total: result.totalAmount,
      party: PARTY,
      // A discovery search with no dates is a stay, not a package: no flight has been
      // priced, so labelling it a trip total would describe something that was not quoted.
      product: PRODUCT.HOTEL_ONLY,
    }),
    // The canonical URL when the backend could build one, else the existing code handle,
    // which canonicalises to the same place.
    href: paths?.[code] || `/hotel/${code}`,
  };
}

function SkeletonGrid() {
  return (
    <section className={styles.block} aria-hidden="true">
      <div className={styles.skelHeading} />
      <ul className={styles.grid}>
        {[...Array(4)].map((_, i) => (
          <li key={i} className={styles.card}>
            <div className={styles.skelMedia} />
            <div className={styles.body}>
              <div className={styles.skelLine} style={{ width: '70%' }} />
              <div className={styles.skelLine} style={{ width: '45%' }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
