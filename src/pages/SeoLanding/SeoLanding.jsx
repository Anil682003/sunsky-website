import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../services/axiosInstance';
import { ENDPOINTS } from '../../api/endpoints';
import styles from './SeoLanding.module.css';
import { SeoHotelCodeContext } from './seoHotelCode';
import HotelDetail from '../HotelDetail/HotelDetail';
import SeoOffers from './SeoOffers';

/**
 * A permanent SEO page: /zonvakanties/turkije/antalya and the rest of the §5 architecture.
 *
 * THIS COMPONENT OWNS NO SEO RULES. It asks the backend what this path is and renders the
 * answer. The title, description, canonical URL, breadcrumbs and robots value all arrive
 * from `/website/seo/resolve`, which is the same endpoint `server/index.js` calls to write
 * those tags into the HTML before it leaves the server. One resolver, so a crawler and a
 * visitor are never shown different things.
 *
 * SEO Master §3: "SEO is a discovery and presentation layer only. It must never calculate
 * whether an offer is commercially valid." Nothing here prices or searches anything; the
 * call to action hands the entity to the existing Results page and that engine does the
 * work (§38: "These components must reuse the existing commercial engine").
 */
export default function SeoLanding() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  /**
   * The resolved path travels WITH the result, and "loading" is derived from it rather than
   * set at the top of the effect.
   *
   * Resetting state synchronously inside the effect costs an extra render and, worse, leaves
   * a tick where the previous page's content is on screen under the new URL. Comparing the
   * two is both cheaper and more honest: anything not resolved for the current path is, by
   * definition, still loading.
   */
  const [state, setState] = useState({ status: 'loading', page: null, path: null });
  const resolved = state.path === pathname;

  useEffect(() => {
    let live = true;

    axiosInstance.get(ENDPOINTS.seoResolve(pathname))
      .then(({ data }) => {
        if (!live) return;
        const page = data?.data;

        // §8 and §12: an old slug 301s to the current URL rather than serving a second one.
        // `replace` so Back does not bounce the visitor straight into the redirect again.
        if (page?.status === 'MOVED' && page.redirectTo) {
          navigate(page.redirectTo, { replace: true });
          return;
        }
        setState({ status: 'ok', page, path: pathname });
      })
      .catch((err) => {
        if (!live) return;
        // A 404 from the resolver means this is genuinely not an SEO page. Anything else is
        // an outage, and an outage must not be dressed up as a missing page.
        setState({
          status: err?.response?.status === 404 ? 'notfound' : 'error',
          page: null,
          path: pathname,
        });
      });

    return () => { live = false; };
  }, [pathname, navigate]);

  const page = resolved ? state.page : null;

  /**
   * Keep the document head right after an in-app navigation.
   *
   * The server already wrote these tags for the first load, which is what §12 requires and
   * what a crawler reads. But React Router moves between pages without a request, so without
   * this the tab title and the canonical would still describe the previous page.
   */
  useEffect(() => {
    if (!page || page.status !== 'OK') return;
    const prevTitle = document.title;
    if (page.title) document.title = page.title;

    const tags = [];
    const upsert = (selector, make) => {
      let el = document.head.querySelector(selector);
      if (!el) { el = make(); document.head.appendChild(el); tags.push(el); }
      return el;
    };

    if (page.metaDescription) {
      const m = upsert('meta[name="description"]', () => {
        const e = document.createElement('meta'); e.setAttribute('name', 'description'); return e;
      });
      m.setAttribute('content', page.metaDescription);
    }
    if (page.canonicalPath) {
      const l = upsert('link[rel="canonical"]', () => {
        const e = document.createElement('link'); e.setAttribute('rel', 'canonical'); return e;
      });
      l.setAttribute('href', `${window.location.origin}${page.canonicalPath}`);
    }
    if (page.robots && page.robots !== 'index,follow') {
      const r = upsert('meta[name="robots"]', () => {
        const e = document.createElement('meta'); e.setAttribute('name', 'robots'); return e;
      });
      r.setAttribute('content', page.robots);
    }

    return () => {
      document.title = prevTitle;
      // Only the tags this page added are removed. One it merely updated was put there by
      // the server for this same URL, so tearing it out would leave the page worse than it
      // was found.
      for (const el of tags) el.remove();
    };
  }, [page]);

  /**
   * Where the call to action goes.
   *
   * Navigation Addendum §6: an explicit commercial action creates or updates SearchContext
   * and opens Search Results. The most specific entity wins, because that is what the
   * visitor clicked on. Zone searches fall back to their destination: the results page
   * scopes by destination code, and a zone narrows within one.
   */
  const searchHref = useMemo(() => {
    const s = page?.search;
    if (!s) return '/results';
    const qs = new URLSearchParams();
    if (s.destinationCode) qs.set('destinations', s.destinationCode);
    else if (s.countryCode) qs.set('countries', s.countryCode);
    if (page?.h1) qs.set('destinationLabel', lastCrumbLabel(page) || page.h1);
    if (s.themeCode) qs.set('boards', s.themeCode);
    return `/results?${qs.toString()}`;
  }, [page]);

  if (!resolved || state.status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.skelCrumb} />
        <div className={styles.skelTitle} />
        <div className={styles.skelText} />
        <div className={styles.skelText} style={{ width: '72%' }} />
      </div>
    );
  }

  if (resolved && state.status === 'notfound') {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h1>{t('seo.notFoundTitle', 'Deze pagina bestaat niet')}</h1>
          <p>{t('seo.notFoundBody', 'De pagina die je zoekt is verplaatst of bestaat niet meer.')}</p>
          <Link to="/" className={styles.cta}>{t('seo.backHome', 'Terug naar de homepage')}</Link>
        </div>
      </div>
    );
  }

  /**
   * A hotel URL renders the REAL hotel page, not a summary of it.
   *
   * §8 allows exactly one canonical page per Hotelbeds code. Showing a thin landing page
   * here while the rich, bookable page lived at /hotel/:hotelCode would be two URLs for one
   * hotel, which is the duplicate that rule exists to prevent. So the readable URL is simply
   * a nicer address for the same page; the code comes down through context because the URL
   * carries a name slug, not a code.
   *
   * The head tags for it were already written server-side, so a crawler has the right title
   * whether or not this component ever runs.
   */
  if (page?.status === 'OK' && page.pageType === 'HOTEL' && page.search?.hotelCode) {
    return (
      <SeoHotelCodeContext.Provider value={page.search.hotelCode}>
        <HotelDetail />
      </SeoHotelCodeContext.Provider>
    );
  }

  if (state.status === 'error' || !page) {
    // An outage is not a missing page. Say so, and offer the search, which does not depend
    // on this endpoint.
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h1>{t('seo.errorTitle', 'Deze pagina is tijdelijk niet beschikbaar')}</h1>
          <p>{t('seo.errorBody', 'Probeer het zo opnieuw, of zoek direct naar een vakantie.')}</p>
          <Link to="/results" className={styles.cta}>{t('seo.searchCta', 'Bekijk vakanties')}</Link>
        </div>
      </div>
    );
  }

  const isGuide = page.pageType === 'TRAVEL_GUIDE';

  return (
    <div className={styles.page}>
      {/* §13: visible breadcrumbs matching the page hierarchy. */}
      {page.breadcrumbs?.length > 1 && (
        <nav className={styles.crumbs} aria-label="Kruimelpad">
          <ol>
            {page.breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                {c.path && i < page.breadcrumbs.length - 1
                  ? <Link to={c.path}>{c.label}</Link>
                  : <span aria-current={i === page.breadcrumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <header className={styles.head}>
        {isGuide && page.guideCategory && (
          <span className={styles.kicker}>{page.guideCategory}</span>
        )}
        <h1 className={styles.h1}>{page.h1}</h1>
        {page.intro && <p className={styles.intro}>{page.intro}</p>}
        {/* No "book now" button at the top of an ARTICLE. A reader who has just arrived to
            find out the best time to visit has not decided anything yet, and §14's rule is
            that articles link to commercial pages, not that they open with an advert. The
            link sits at the end instead, where it has been earned. */}
        {!isGuide && (
          <Link to={searchHref} className={styles.cta}>
            {t('seo.viewHolidays', 'Bekijk vakanties')}
          </Link>
        )}
      </header>

      {page.heroImageUrl && (
        <img
          className={styles.hero}
          src={page.heroImageUrl}
          alt={page.heroImageAlt || ''}
          loading="lazy"
        />
      )}

      {page.content && (
        <article className={styles.body}>
          {/* Plain text, rendered as paragraphs. The CMS field carries no markup and there
              is no sanitiser in this project, so nothing is set as HTML. */}
          {String(page.content).split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </article>
      )}

      {/* §38: the commercial block. Not on an article: §14 keeps a guide editorial and gives
          it one commercial link at the end, and a grid of priced hotel cards halfway through
          "when is the best time to visit" is an advert interrupting the thing the reader
          came for. */}
      {!isGuide && (
        <SeoOffers
          scope={page.search}
          heading={t('seo.offersHeadingPlace', 'Populaire hotels in {{place}}', {
            place: lastCrumbLabel(page) || page.h1,
          })}
        />
      )}

      {/* §14: "Articles should link to relevant commercial pages." At the END of an article,
          where a reader who has finished reading is actually ready to go and book. */}
      {isGuide && page.commercialTarget?.path && (
        <aside className={styles.targetCard}>
          <div>
            <span className={styles.targetKicker}>{t('seo.readyToBook', 'Klaar om te boeken?')}</span>
            <strong>{page.commercialTarget.label}</strong>
          </div>
          <Link to={page.commercialTarget.path} className={styles.cta}>
            {t('seo.viewHolidays', 'Bekijk vakanties')}
          </Link>
        </aside>
      )}

      {/* §14: "Commercial pages may show related Travel Guide articles." */}
      {page.relatedGuides?.length > 0 && (
        <section className={styles.related}>
          <h2>{t('seo.relatedReading', 'Lees ook')}</h2>
          <ul>
            {page.relatedGuides.map((g) => (
              <li key={g.path}>
                <Link to={g.path}>
                  <span className={styles.relatedTitle}>{g.title}</span>
                  {g.category && <span className={styles.relatedCat}>{g.category}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* §13 and §15: structured data for the breadcrumb trail. Safe to inline: every value
          comes from our own API and JSON.stringify escapes it. */}
      {page.breadcrumbs?.length > 1 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(page)) }}
        />
      )}

      {/* §15: "Article for Travel Guide articles where appropriate." Only for articles, and
          only when there is real body text: marking an empty page as an Article claims
          content that is not there. Product/Offer/aggregateRating stay out of scope per §15. */}
      {isGuide && page.content && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(page)) }}
        />
      )}
    </div>
  );
}

const lastCrumbLabel = (page) => page?.breadcrumbs?.[page.breadcrumbs.length - 1]?.label || null;

/**
 * Article, for a Travel Guide (§15).
 *
 * `author` and `publisher` are the Organization, not a person: these are agency articles and
 * inventing a byline would be structured data that contradicts the page. Dates come from the
 * CMS row's own timestamps, so they move when the ARTICLE is edited and not when a price
 * changes, which is the distinction §12 draws for sitemap lastmod.
 */
function articleJsonLd(page) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const org = { '@type': 'Organization', name: 'SUNSKY' };
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    ...(page.metaDescription ? { description: page.metaDescription } : {}),
    ...(page.heroImageUrl ? { image: page.heroImageUrl } : {}),
    ...(page.publishedAt ? { datePublished: page.publishedAt } : {}),
    ...(page.updatedAt ? { dateModified: page.updatedAt } : {}),
    author: org,
    publisher: org,
    ...(page.canonicalPath
      ? { mainEntityOfPage: { '@type': 'WebPage', '@id': `${origin}${page.canonicalPath}` } }
      : {}),
  };
}

/** BreadcrumbList, which §15 lists as in scope for Phase 1. */
function breadcrumbJsonLd(page) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: page.breadcrumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.path ? { item: `${origin}${c.path}` } : {}),
    })),
  };
}
