import { useEffect, useRef, useState } from 'react';

/**
 * PURE. Which section is being read: the last one whose top has reached the line just under the
 * stuck tab bar, or the last section once the page cannot scroll any further (a short final
 * section never reaches the line).
 *
 * tops     each section's top, relative to the viewport, in page order (null: not on the page)
 * line     the reading line (px from the viewport top)
 * atBottom the page is scrolled to its end and the last section is on screen
 */
export function sectionInView(tops, line, atBottom = false) {
  let current = 0;
  tops.forEach((top, i) => { if (top != null && top <= line) current = i; });
  if (atBottom && tops[tops.length - 1] != null) current = tops.length - 1;
  return current;
}

/**
 * The hotel page's tab bar as a table of contents (Levent, 23 Nov 2026: "one continuous,
 * natural scrolling experience", both directions, no jumps). Prijzen, Informatie and
 * Voorzieningen are sections of ONE page; scrolling simply moves through them. This bar lights
 * up the section being read and glides to a section when clicked. It never hides a section and
 * never moves the page by itself.
 *
 * The highlight lives HERE, not in the page: a page-level state change re-renders the whole hotel
 * page, long enough to stall a glide that has just started. Here it redraws only this bar.
 *
 * sectionRefs.current = { [tab]: element }, filled by the page.
 */
export default function SectionTabs({ tabs, sectionRefs, renderLabel }) {
  const [active, setActive] = useState(tabs[0]);
  const barRef = useRef(null);
  // While a click glides the page, the highlight stays on the clicked tab instead of flickering
  // through the sections passed on the way.
  const hold = useRef(0);

  // Where a section's top lands once scrolled to: just under the stuck tab bar.
  const readingLine = () => {
    const bar = barRef.current;
    if (!bar) return 0;
    return (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight + 12;
  };

  useEffect(() => {
    let raf = 0;
    const spy = () => {
      raf = 0;
      if (Date.now() < hold.current) return;
      const els = tabs.map((tab) => sectionRefs.current?.[tab] || null);
      const tops = els.map((el) => (el ? el.getBoundingClientRect().top : null));
      const doc = document.documentElement;
      const last = els[els.length - 1];
      const atBottom = Boolean(last) && window.innerHeight + window.scrollY >= doc.scrollHeight - 2
        && last.getBoundingClientRect().top < window.innerHeight;
      const next = tabs[sectionInView(tops, readingLine() + 1, atBottom)];
      setActive((prev) => (prev === next ? prev : next));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
    // The glide is over: read where the page really is.
    const onScrollEnd = () => { hold.current = 0; onScroll(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd);
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // The sections and their order are fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (tab) => {
    setActive(tab);
    const el = sectionRefs.current?.[tab];
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Released by `scrollend`; the timeout only covers browsers without it.
    hold.current = Date.now() + (reduce ? 0 : 1500);
    const y = el.getBoundingClientRect().top + window.scrollY - readingLine();
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="tw" ref={barRef}>
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tb${active === tab ? ' act' : ''}`}
            aria-current={active === tab ? 'true' : undefined}
            onClick={() => goTo(tab)}
          >
            {renderLabel(tab)}
          </button>
        ))}
      </div>
    </div>
  );
}
