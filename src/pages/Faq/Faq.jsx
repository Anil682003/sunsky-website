import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Faq.module.css';
import { fetchAllFaqs, fetchFaqCategories } from '../../api';
import { cmsText } from '../../utils/cmsText';
import { STAGES, stageForTitle, FALLBACK_FAQS } from './faqContent';

/* ═══════════════════════════════════════════════════════════════════════════
   SUNSKY — help centre.

   Organised around the JOURNEY rather than around one long list: before you
   book, after booking, during the trip, after the trip. Somebody whose transfer
   has not turned up is in a very different frame of mind from somebody
   comparing board types, and they should not have to read past each other.

   Content comes from the CMS (sunsky-admin → CMS → FAQ) and falls back to the
   questions shipped in faqContent.js, so the page is never empty and never
   depends on the admin API being up.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Reachable people, not a contact form. These are SUNSKY's published details,
   taken from the Contact section of /p/about-sunsky so the help centre cannot
   drift from the page that already states them.

   The emergency line is listed separately and labelled, because it is for
   travellers in difficulty during a trip and not a second general number. The
   About page is explicit about that, and this page should be too. */
const CONTACT = {
  phone: '+32 11 57 44 27',
  phoneHref: 'tel:+3211574427',
  email: 'info@sunsky.be',
  hours: 'Mon to Fri 10:00-18:30, Sat 10:00-16:00',
  emergency: '+32 497 54 38 16',
  emergencyHref: 'tel:+32497543816',
};

/* How many questions the CMS must hold before it replaces the shipped set.
   Four is one per stage of the journey: below that the table is being set up,
   not published, and the reader is better served by the content in this repo. */
const MIN_CMS_FAQS = 4;

const norm = (s) => String(s ?? '').toLowerCase();

/**
 * The question a shared /faq#faq-<id> address points at, if any.
 *
 * Read straight into initial state rather than corrected by an effect, so the
 * answer is open on the very first paint instead of snapping open after it. An
 * id that matches nothing simply opens nothing.
 */
const readHashId = () => {
  if (typeof window === 'undefined') return null;
  const hash = decodeURIComponent(String(window.location.hash || '').replace(/^#/, ''));
  return hash.startsWith('faq-') ? hash.slice(4) || null : null;
};

/* Same convention as every other CMS surface: blank lines separate paragraphs,
   and the text is rendered as text nodes, never as markup. */
const toParagraphs = (text) =>
  cmsText(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * A CMS row in the shape the page works in.
 *
 * A question whose category does not match one of the four journey stages keeps
 * its own key (`cat-<id>`) and becomes a card of its own, which is what lets the
 * dashboard add a fifth topic without anybody touching this file.
 */
const fromCms = (row) => ({
  id: `cms-${row.id}`,
  stage:
    stageForTitle(row?.faqCategory?.title) ??
    (row?.faqCategoryId != null ? `cat-${row.faqCategoryId}` : 'other'),
  categoryTitle: row?.faqCategory?.title ?? '',
  question: String(row?.question ?? '').trim(),
  answer: String(row?.answer ?? '').trim(),
  featured: !!row?.isFeatured,
  sortOrder: Number(row?.sortOrder) || 0,
});

/**
 * The category cards, in journey order, skipping any that has no question.
 *
 * An empty card is worse than a missing one: it invites a click that leads
 * nowhere. Categories the CMS added beyond the four stages follow after them in
 * their own sortOrder.
 */
const buildCategories = (items, cmsCats) => {
  const counts = new Map();
  const titles = new Map();
  for (const it of items) {
    counts.set(it.stage, (counts.get(it.stage) ?? 0) + 1);
    if (it.categoryTitle && !titles.has(it.stage)) titles.set(it.stage, it.categoryTitle);
  }

  const extras = [];
  const seen = new Set();
  for (const c of cmsCats) {
    if (stageForTitle(c?.title)) continue;
    const key = `cat-${c?.id}`;
    if (!counts.get(key) || seen.has(key)) continue;
    seen.add(key);
    extras.push({
      key,
      title: String(c?.title ?? '').trim() || 'More questions',
      blurb: cmsText(c?.description ?? ''),
      order: Number(c?.sortOrder) || 0,
    });
  }
  // The categories call can fail while the FAQ call succeeds. Those questions
  // still have a category id and a title on the row, so they get a card too
  // rather than vanishing.
  for (const [key, n] of counts) {
    if (!n || seen.has(key) || !key.startsWith('cat-')) continue;
    seen.add(key);
    extras.push({ key, title: titles.get(key) || 'More questions', blurb: '', order: 9999 });
  }
  extras.sort((a, b) => a.order - b.order);

  const out = STAGES.filter((s) => counts.get(s.key)).map((s) => ({
    key: s.key,
    title: s.title,
    blurb: s.blurb,
  }));
  out.push(...extras.map(({ key, title, blurb }) => ({ key, title, blurb })));
  if (counts.get('other')) {
    out.push({
      key: 'other',
      title: 'Other questions',
      blurb: 'Everything that does not sit neatly in one stage of the journey.',
    });
  }
  return out;
};

/* ── Icons ────────────────────────────────────────────────────────────────
   Drawn here rather than pulled from an icon set, matching the rest of the
   site. One stroke weight, currentColor, so they take the card's own colour. */
const S = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const STAGE_ICON = {
  // Before you book — a compass: still choosing where to go.
  'before-booking': (
    <S><circle cx="12" cy="12" r="9" /><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" /></S>
  ),
  // After booking — a ticket: it is yours, now get it ready.
  'before-departure': (
    <S><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z" /><path d="M14 6v2M14 11v2M14 16v2" /></S>
  ),
  // During your trip — in the air.
  'during-trip': (
    <S><path d="M10.2 3.3a1.6 1.6 0 0 1 3.1 0L14.6 10l6.1 3.1a1 1 0 0 1 .5.9v1.3a.6.6 0 0 1-.8.6L14 14v3.6l2 1.6a.8.8 0 0 1 .3.6v.8a.5.5 0 0 1-.6.5l-3.7-1-3.7 1a.5.5 0 0 1-.6-.5v-.8a.8.8 0 0 1 .3-.6l2-1.6V14l-6.4 1.9a.6.6 0 0 1-.8-.6V14a1 1 0 0 1 .5-.9L9.4 10z" /></S>
  ),
  // After your trip — home again.
  'after-trip': (
    <S><path d="M3.5 10.5L12 4l8.5 6.5" /><path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8" /><path d="M10 20v-5.5h4V20" /></S>
  ),
};
const DEFAULT_ICON = (
  <S><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5" /><path d="M12 16.8v.01" /></S>
);

const ICON = {
  search: <S><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></S>,
  close: <S><path d="M6 6l12 12M18 6L6 18" /></S>,
  phone: <S><path d="M6.2 3.5h2.9l1.4 3.6-1.8 1.3a11.5 11.5 0 0 0 5.1 5.1l1.3-1.8 3.6 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2z" /></S>,
  mail: <S><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6 8.5-6" /></S>,
  clock: <S><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 1.9" /></S>,
  shield: <S><path d="M12 3l7 2.6v5.1c0 4.2-2.8 8-7 10.3-4.2-2.3-7-6.1-7-10.3V5.6z" /><path d="M9 12l2.2 2.2L15.4 10" /></S>,
  folder: <S><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M8 3v3M16 3v3" /><path d="M8.5 14.5l2 2 4-4" /></S>,
  arrow: <S><path d="M5 12h13" /><path d="M13 6.5l5.5 5.5-5.5 5.5" /></S>,
};

/* ── One question ─────────────────────────────────────────────────────────
   The panel animates on a max-height measured from the content. The grid
   0fr→1fr trick collapses to 0px once a transition is attached, and the answer
   stays in the DOM while closed so the browser's own in-page search still
   finds it. Same approach as the FAQ blocks on the legal pages. */
function FaqRow({ item, isOpen, onToggle, query, related, onPickRelated }) {
  const innerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const measure = () => setMaxHeight(el.scrollHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `related` changes the panel height, so it has to re-measure with it.
  }, [item, related]);

  const panelId = `faq-panel-${item.id}`;
  const btnId = `faq-btn-${item.id}`;

  return (
    <div id={`faq-${item.id}`} className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}>
      <h3 className={styles.rowHeading}>
        <button
          type="button"
          id={btnId}
          className={styles.rowQ}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className={styles.rowQText}>
            <Highlight text={item.question} query={query} />
          </span>
          <span className={styles.rowIcon} aria-hidden="true">
            <span className={styles.rowIconBar} />
            <span className={`${styles.rowIconBar} ${styles.rowIconBarV}`} />
          </span>
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className={styles.rowPanel}
        style={{ maxHeight: isOpen ? maxHeight : 0 }}
      >
        <div ref={innerRef} className={styles.rowPanelInner}>
          <div className={styles.rowA}>
            {toParagraphs(item.answer).map((p, i) => <p key={i}>{p}</p>)}

            {related.length > 0 && (
              <div className={styles.related}>
                <p className={styles.relatedLabel}>Related questions</p>
                <ul className={styles.relatedList}>
                  {related.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={styles.relatedLink}
                        onClick={() => onPickRelated(r.id)}
                      >
                        <span className={styles.relatedArrow} aria-hidden="true">{ICON.arrow}</span>
                        {r.question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The searched-for words, marked inside the question so a hit is obvious. */
function Highlight({ text, query }) {
  const q = String(query ?? '').trim();
  const src = String(text ?? '');
  if (q.length < 2) return src;

  const lower = norm(src);
  const needle = norm(q);
  const out = [];
  let at = 0;
  for (;;) {
    const hit = lower.indexOf(needle, at);
    if (hit === -1) break;
    if (hit > at) out.push(src.slice(at, hit));
    out.push(<mark key={hit} className={styles.mark}>{src.slice(hit, hit + needle.length)}</mark>);
    at = hit + needle.length;
  }
  if (out.length === 0) return src;
  if (at < src.length) out.push(src.slice(at));
  return out;
}

export default function Faq() {
  const [cmsFaqs, setCmsFaqs] = useState(null);   // null = still asking
  const [cmsCats, setCmsCats] = useState([]);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [openId, setOpenId] = useState(readHashId);
  // `undefined` means "not initialised"; null means "nothing left to scroll to".
  // Lazily seeded once from the address, so a shared link scrolls exactly once.
  const pendingScroll = useRef(undefined);
  if (pendingScroll.current === undefined) pendingScroll.current = readHashId();

  /* The CMS is the source of truth once it holds anything. Both calls resolve
     rather than throw, so a failure just leaves the shipped content in place. */
  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    (async () => {
      const [faqs, cats] = await Promise.all([
        fetchAllFaqs({ signal: ac.signal }),
        fetchFaqCategories({ signal: ac.signal }),
      ]);
      if (!alive) return;
      setCmsFaqs(faqs);
      setCmsCats(cats);
    })();
    return () => { alive = false; ac.abort(); };
  }, []);

  /**
   * What the page actually shows.
   *
   * The CMS takes over completely once it is genuinely stocked, so a question
   * retired in the dashboard disappears from the site. Below MIN_CMS_FAQS it is
   * treated as not yet in use and the shipped questions stand.
   *
   * That floor is not defensive programming for its own sake: the live CMS has
   * held a single row reading "Test 1" since March, and without it the first
   * deploy of this page would have replaced every real answer with that one
   * stray. A half-finished table should never be able to empty the help centre.
   */
  const items = useMemo(() => {
    const rows = (cmsFaqs ?? []).map(fromCms).filter((r) => r.question && r.answer);
    if (rows.length < MIN_CMS_FAQS) return FALLBACK_FAQS;
    // The dashboard's own ordering, per category.
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [cmsFaqs]);

  const categories = useMemo(() => buildCategories(items, cmsCats), [items, cmsCats]);

  /* A category that disappeared when the CMS answered (or that was emptied in the
     dashboard) must not leave the page filtered to nothing with no way back.
     Derived rather than corrected in an effect: there is no frame in which the
     page is filtered to a category that is not on screen. */
  const activeStage = categories.some((c) => c.key === stage) ? stage : 'all';

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  const hits = useMemo(() => {
    if (!searching) return items;
    const q = norm(trimmed);
    return items.filter((it) => norm(it.question).includes(q) || norm(it.answer).includes(q));
  }, [items, trimmed, searching]);

  /* Live per-category counts, so a search that finds nothing in the open
     category still shows where the answers actually are. */
  const countsByStage = useMemo(() => {
    const m = new Map();
    for (const it of hits) m.set(it.stage, (m.get(it.stage) ?? 0) + 1);
    return m;
  }, [hits]);

  const visible = useMemo(
    () => (activeStage === 'all' ? hits : hits.filter((it) => it.stage === activeStage)),
    [hits, activeStage]
  );

  const groups = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, items: visible.filter((it) => it.stage === c.key) }))
        .filter((g) => g.items.length > 0),
    [categories, visible]
  );

  const featured = useMemo(() => items.filter((it) => it.featured).slice(0, 6), [items]);

  /* Opening a question from the "Most asked" strip, from a related link or from
     a shared /faq#faq-<id> address has to clear whatever filter is hiding it,
     then scroll once it is on screen. */
  const reveal = useCallback((id) => {
    setQuery('');
    setStage('all');
    setOpenId(id);
    pendingScroll.current = id;
  }, []);

  /* An answer opened from the strip, from a related link or from a shared
     address is scrolled to once it is actually on screen. The id is kept until
     the element exists, so a CMS answer that arrives after the first paint still
     gets scrolled to rather than being silently dropped. */
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    const el = document.getElementById(`faq-${id}`);
    if (!el) return;
    pendingScroll.current = null;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [openId, activeStage, query, items]);

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  const relatedFor = useCallback(
    (item) => items.filter((it) => it.stage === item.stage && it.id !== item.id).slice(0, 3),
    [items]
  );

  const total = visible.length;

  return (
    <main className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.hero}>
        <span className={styles.heroGlow} aria-hidden="true" />
        <span className={styles.heroGrid} aria-hidden="true" />

        <div className={styles.heroInner}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link to="/" className={styles.crumbLink}>Home</Link>
            <span className={styles.crumbSep} aria-hidden="true">/</span>
            <span className={styles.crumbCurrent}>Help</span>
          </nav>

          <span className={styles.heroTag}>
            <span className={styles.heroTagDot} aria-hidden="true" />
            Help centre
          </span>

          <h1 className={styles.title}>Frequently Asked Questions</h1>
          <p className={styles.lede}>
            Find the answer to your question quickly. Can&rsquo;t find what you&rsquo;re looking
            for? Our team will be happy to help.
          </p>

          {/* ── Search ──────────────────────────────────────────────────── */}
          <div className={styles.searchWrap}>
            <label htmlFor="faq-search" className={styles.srOnly}>
              Search the frequently asked questions
            </label>
            <span className={styles.searchIcon} aria-hidden="true">{ICON.search}</span>
            <input
              id="faq-search"
              type="search"
              className={styles.searchInput}
              placeholder="How can we help you?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {searching && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setQuery('')}
                aria-label="Clear the search"
              >
                {ICON.close}
              </button>
            )}
          </div>

          <p className={styles.searchNote} role="status" aria-live="polite">
            {searching
              ? `${total} ${total === 1 ? 'answer' : 'answers'} for “${trimmed}”`
              : 'Searches every question and every answer on this page.'}
          </p>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.main}>
          {/* Most asked — a shortcut, so it steps aside while filtering. */}
          {!searching && activeStage === 'all' && featured.length > 0 && (
            <section className={styles.popular} aria-labelledby="faq-popular">
              <h2 id="faq-popular" className={styles.popularTitle}>Most asked</h2>
              <ul className={styles.popularList}>
                {featured.map((f) => (
                  <li key={f.id}>
                    <button type="button" className={styles.popularChip} onClick={() => reveal(f.id)}>
                      {f.question}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Categories, drawn as the journey they describe ──────────── */}
          <section className={styles.stages} aria-labelledby="faq-stages">
            <h2 id="faq-stages" className={styles.srOnly}>Browse by stage of your trip</h2>

            <div className={styles.stageBar} role="group" aria-label="Filter questions by stage">
              <button
                type="button"
                className={`${styles.allBtn} ${activeStage === 'all' ? styles.allBtnOn : ''}`}
                aria-pressed={activeStage === 'all'}
                onClick={() => setStage('all')}
              >
                All questions
                <span className={styles.allCount}>{hits.length}</span>
              </button>

              <div className={styles.stageTrack}>
                <span className={styles.stageLine} aria-hidden="true" />
                {categories.map((c, i) => {
                  const on = activeStage === c.key;
                  const n = countsByStage.get(c.key) ?? 0;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`${styles.stageCard} ${on ? styles.stageCardOn : ''} ${
                        searching && n === 0 ? styles.stageCardEmpty : ''
                      }`}
                      aria-pressed={on}
                      onClick={() => setStage(on ? 'all' : c.key)}
                    >
                      <span className={styles.stageStep} aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.stageIcon} aria-hidden="true">
                        {STAGE_ICON[c.key] ?? DEFAULT_ICON}
                      </span>
                      <span className={styles.stageTitle}>{c.title}</span>
                      {c.blurb && <span className={styles.stageBlurb}>{c.blurb}</span>}
                      <span className={styles.stageCount}>
                        {n} {n === 1 ? 'question' : 'questions'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Questions ───────────────────────────────────────────────── */}
          {groups.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">{ICON.search}</span>
              <h2 className={styles.emptyTitle}>No answer matched that</h2>
              <p className={styles.emptyText}>
                Try a shorter search, or a word that would appear in the answer, such as
                &ldquo;baggage&rdquo;, &ldquo;refund&rdquo; or &ldquo;transfer&rdquo;. If the
                question is about your own booking, our team can answer it faster than this page
                can.
              </p>
              <div className={styles.emptyActions}>
                <button type="button" className={styles.emptyReset} onClick={() => { setQuery(''); setStage('all'); }}>
                  Show all questions
                </button>
                <Link to="/contact" className={styles.emptyCta}>Contact us</Link>
              </div>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className={styles.group} aria-labelledby={`grp-${g.key}`}>
                <div className={styles.groupHead}>
                  <span className={styles.groupIcon} aria-hidden="true">
                    {STAGE_ICON[g.key] ?? DEFAULT_ICON}
                  </span>
                  <div>
                    <h2 id={`grp-${g.key}`} className={styles.groupTitle}>{g.title}</h2>
                    {g.blurb && <p className={styles.groupBlurb}>{g.blurb}</p>}
                  </div>
                </div>

                <div className={styles.rows}>
                  {g.items.map((item) => (
                    <FaqRow
                      key={item.id}
                      item={item}
                      isOpen={openId === item.id}
                      onToggle={() => toggle(item.id)}
                      query={trimmed}
                      related={openId === item.id ? relatedFor(item) : []}
                      onPickRelated={reveal}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className={styles.side} aria-label="More help">
          <section className={`${styles.card} ${styles.cardContact}`}>
            <span className={styles.cardStamp} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Can&rsquo;t find what you&rsquo;re looking for?</h2>
            <p className={styles.cardText}>Our team will be happy to help.</p>

            <Link to="/contact" className={styles.cardCta}>
              Contact us
              <span className={styles.cardCtaArrow} aria-hidden="true">{ICON.arrow}</span>
            </Link>

            <ul className={styles.contactList}>
              <li>
                <span className={styles.contactIcon} aria-hidden="true">{ICON.phone}</span>
                <a href={CONTACT.phoneHref} className={styles.contactLink}>{CONTACT.phone}</a>
              </li>
              <li>
                <span className={styles.contactIcon} aria-hidden="true">{ICON.mail}</span>
                <a href={`mailto:${CONTACT.email}`} className={styles.contactLink}>{CONTACT.email}</a>
              </li>
              {CONTACT.hours && (
                <li>
                  <span className={styles.contactIcon} aria-hidden="true">{ICON.clock}</span>
                  <span className={styles.contactPlain}>{CONTACT.hours}</span>
                </li>
              )}
            </ul>

            {CONTACT.emergency && (
              <p className={styles.emergency}>
                <span className={styles.emergencyLabel}>Already travelling?</span>
                Urgent problems that cannot wait for opening hours:{' '}
                <a href={CONTACT.emergencyHref} className={styles.contactLink}>
                  {CONTACT.emergency}
                </a>
              </p>
            )}
          </section>

          <section className={`${styles.card} ${styles.cardTip}`}>
            <span className={styles.cardIcon} aria-hidden="true">{ICON.folder}</span>
            <h2 className={styles.cardTitle}>Helpful tip</h2>
            <p className={styles.cardText}>
              Many details about your booking, payments and travel documents can also be found in
              My Booking.
            </p>
            <Link to="/account/bookings" className={styles.cardLink}>
              Go to My Booking
              <span className={styles.cardCtaArrow} aria-hidden="true">{ICON.arrow}</span>
            </Link>
          </section>

          <section className={`${styles.card} ${styles.cardTrust}`}>
            <span className={styles.cardIcon} aria-hidden="true">{ICON.shield}</span>
            <h2 className={styles.cardTitle}>Safe &amp; trusted</h2>
            <p className={styles.cardText}>
              SUNSKY is a licensed Belgian travel agency. Every payment runs over a secure
              connection, and your booking is confirmed in writing before you travel.
            </p>
            <Link to="/about" className={styles.cardLink}>
              About SUNSKY
              <span className={styles.cardCtaArrow} aria-hidden="true">{ICON.arrow}</span>
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
