import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './StaticPage.module.css';
import { useStaticPages } from '../../api';

// The CMS stores body/intro/bullets as PLAIN TEXT — blank lines separate
// paragraphs. Everything below renders as React text nodes; never as HTML.
const toParagraphs = (text) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const bySortOrder = (a, b) =>
  (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0) ||
  String(a?.title ?? '').localeCompare(String(b?.title ?? ''));

export default function StaticPage() {
  const { slug } = useParams();
  const { data, loading, error } = useStaticPages();

  const pages  = useMemo(() => data?.pages  ?? [], [data]);
  const groups = useMemo(() => data?.groups ?? [], [data]);

  const page  = useMemo(
    () => pages.find((p) => p?.slug === slug) ?? null,
    [pages, slug]
  );
  const group = useMemo(
    () => (page ? groups.find((g) => g?.groupKey === page.groupKey) ?? null : null),
    [groups, page]
  );

  // Sibling pages — what the sidebar lists, in the order the dashboard set.
  const siblings = useMemo(
    () => (page ? pages.filter((p) => p?.groupKey === page.groupKey).sort(bySortOrder) : []),
    [pages, page]
  );

  // Tab title / meta description come from the CMS when filled in. Restored on
  // unmount so the next route does not inherit this page's SEO copy.
  useEffect(() => {
    if (!page) return undefined;
    const previousTitle = document.title;
    document.title = page.seoTitle || page.title || 'Sunsky Holidays';

    const meta = document.querySelector('meta[name="description"]');
    const previousDesc = meta?.getAttribute('content') ?? null;
    if (meta && page.seoDescription) meta.setAttribute('content', page.seoDescription);

    return () => {
      document.title = previousTitle;
      if (meta && previousDesc !== null) meta.setAttribute('content', previousDesc);
    };
  }, [page]);

  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const intro    = toParagraphs(page?.intro);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={`${styles.sk} ${styles.skCrumbs}`} />
            <div className={`${styles.sk} ${styles.skTitle}`} />
            <div className={`${styles.sk} ${styles.skLede}`} />
          </div>
        </header>

        <div className={styles.body}>
          <div className={`${styles.sk} ${styles.skSidebar}`} />
          <div className={styles.skContent}>
            {[92, 78, 88, 40, 84, 70, 90, 62].map((w, i) => (
              <div key={i} className={`${styles.sk} ${styles.skLine}`} style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Unknown slug (or the list failed to load) ───────────────────────────
  if (!page) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link to="/" className={styles.crumbLink}>Home</Link>
              <span className={styles.crumbSep} aria-hidden="true">/</span>
              <span className={styles.crumbCurrent}>Page not found</span>
            </nav>
            <h1 className={styles.title}>We couldn’t find that page</h1>
            <p className={styles.lede}>
              {error
                ? 'Our information pages didn’t load just now. Please try again in a moment.'
                : 'The page you were looking for has moved or no longer exists.'}
            </p>
          </div>
        </header>

        <div className={styles.missing}>
          <Link to="/" className={styles.cta}>
            Back to home
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>
    );
  }

  // ── The page ────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link to="/" className={styles.crumbLink}>Home</Link>
            {group?.title && (
              <>
                <span className={styles.crumbSep} aria-hidden="true">/</span>
                <span className={styles.crumbGroup}>{group.title}</span>
              </>
            )}
            <span className={styles.crumbSep} aria-hidden="true">/</span>
            <span className={styles.crumbCurrent}>{page.title}</span>
          </nav>

          <h1 className={styles.title}>{page.title}</h1>
          {page.subtitle && <p className={styles.lede}>{page.subtitle}</p>}
        </div>
      </header>

      <div className={styles.body}>
        {siblings.length > 1 && (
          <nav className={styles.sidebar} aria-label={group?.title || 'Related pages'}>
            <div className={styles.sidebarCard}>
              <p className={styles.sidebarLabel}>{group?.title || 'Information'}</p>
              {group?.subtitle && <p className={styles.sidebarNote}>{group.subtitle}</p>}
              <ul className={styles.sidebarList}>
                {siblings.map((s) => {
                  const isActive = s.slug === page.slug;
                  return (
                    <li key={s.id ?? s.slug}>
                      <Link
                        to={`/p/${s.slug}`}
                        className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {s.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        )}

        <article className={`${styles.content} ${siblings.length > 1 ? '' : styles.contentWide}`}>
          {intro.length > 0 && (
            <div className={styles.intro}>
              {intro.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}

          {sections.map((section, i) => {
            const paras   = toParagraphs(section?.body);
            const bullets = Array.isArray(section?.bullets)
              ? section.bullets.filter((b) => String(b ?? '').trim())
              : [];

            return (
              <section key={i} className={styles.section}>
                {section?.heading && <h2 className={styles.heading}>{section.heading}</h2>}
                {paras.map((p, j) => <p key={j} className={styles.para}>{p}</p>)}
                {bullets.length > 0 && (
                  <ul className={styles.bullets}>
                    {bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                )}
              </section>
            );
          })}

          {intro.length === 0 && sections.length === 0 && (
            <p className={styles.para}>This page is being written. Please check back soon.</p>
          )}
        </article>
      </div>
    </div>
  );
}
