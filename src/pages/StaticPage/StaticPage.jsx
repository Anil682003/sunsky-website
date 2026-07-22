import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import styles from './StaticPage.module.css';
import { useStaticPages } from '../../api';

// Section anchors are derived from the CMS heading, so the footer can link
// straight to "Secure Online Payments" without storing an id alongside it.
export const slugifyHeading = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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

  // Sibling pages — kept for the "More information" links under the index.
  const siblings = useMemo(
    () => (page ? pages.filter((p) => p?.groupKey === page.groupKey).sort(bySortOrder) : []),
    [pages, page]
  );

  // The sidebar is a table of contents for THIS page: one entry per section,
  // anchored to it. Headings come from the CMS, so ids are derived from them
  // and de-duplicated in case two sections share a heading.
  const sectionIndex = useMemo(() => {
    const seen = new Map();
    return (Array.isArray(page?.sections) ? page.sections : [])
      .filter((s) => s?.heading)
      .map((s) => {
        const base = slugifyHeading(s.heading);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        return { id: n > 1 ? `${base}-${n}` : base, heading: s.heading };
      });
  }, [page]);

  // Which section the reader is in, so the index can mark it. Plain scroll maths
  // rather than IntersectionObserver: "the last heading that has passed the
  // navbar" is exactly the rule we want, and a rootMargin band leaves no entry
  // marked whenever a long section spans the whole viewport.
  const [activeId, setActiveId] = useState(null);
  useEffect(() => {
    if (!sectionIndex.length) return undefined;

    const NAV_OFFSET = 120;
    const pick = () => {
      let current = sectionIndex[0]?.id ?? null;
      for (const { id } of sectionIndex) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= NAV_OFFSET) current = id;
        else break;
      }
      // At the very bottom the last section may never reach the offset.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = sectionIndex[sectionIndex.length - 1].id;
      setActiveId(current);
    };

    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, [sectionIndex]);

  // Deep link from the footer (/p/about-sunsky#secure-online-payments).
  // The content only exists once the fetch resolves, and the layout keeps
  // settling after that as images and fonts land — so re-assert the scroll a
  // few times rather than firing once and hoping it stuck.
  const { hash } = useLocation();
  useEffect(() => {
    const id = hash ? hash.slice(1) : '';
    if (!id || !sectionIndex.length) return undefined;

    let cancelled = false;
    const timers = [];
    // index.css sets `html { scroll-behavior: smooth }`, and scrollIntoView's
    // 'auto' defers to that — so the jump animates, and the animation is
    // aborted as the page reflows. Force it off for the jump, as ScrollToTop
    // does for the same reason.
    const jump = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (!el) return;
      const html = document.documentElement;
      const previous = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      el.scrollIntoView({ block: 'start' });
      html.style.scrollBehavior = previous;
    };

    // Land immediately, then correct for any reflow that follows.
    jump();
    [60, 220, 600].forEach((ms) => timers.push(setTimeout(jump, ms)));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [hash, sectionIndex]);

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
        {sectionIndex.length > 1 && (
          <nav className={styles.sidebar} aria-label={`On this page: ${page.title}`}>
            <div className={styles.sidebarCard}>
              <p className={styles.sidebarLabel}>On this page</p>
              <ul className={styles.sidebarList}>
                {sectionIndex.map(({ id, heading }) => {
                  const isActive = activeId === id;
                  return (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className={`${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={(e) => {
                          // Scroll smoothly and put the anchor in the URL so the
                          // section stays shareable, without a full navigation.
                          e.preventDefault();
                          const el = document.getElementById(id);
                          if (!el) return;
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          window.history.replaceState(null, '', `#${id}`);
                        }}
                      >
                        {heading}
                      </a>
                    </li>
                  );
                })}
              </ul>

              {siblings.length > 1 && (
                <div className={styles.sidebarMore}>
                  <p className={styles.sidebarLabel}>More information</p>
                  <ul className={styles.sidebarList}>
                    {siblings
                      .filter((s) => s.slug !== page.slug)
                      .map((s) => (
                        <li key={s.id ?? s.slug}>
                          <Link to={`/p/${s.slug}`} className={styles.sidebarLink}>
                            {s.title}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </nav>
        )}

        <article className={`${styles.content} ${sectionIndex.length > 1 ? '' : styles.contentWide}`}>
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

            // Same id the index and the footer anchors use.
            const headingId = section?.heading
              ? sectionIndex[sections.slice(0, i).filter((s) => s?.heading).length]?.id
              : undefined;

            return (
              <section key={i} className={styles.section}>
                {section?.heading && (
                  <h2 id={headingId} className={styles.heading}>{section.heading}</h2>
                )}
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
