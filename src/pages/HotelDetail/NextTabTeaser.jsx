import { useEffect, useRef, useState } from 'react';

// Wait this long after the block appears before it may switch, so a tab that just opened (or a
// page that loads already scrolled) never hops on by itself.
const ARM_MS = 700;
// A finger swipe up of this many pixels counts as "keep scrolling" when the page cannot move.
const SWIPE_PX = 40;

/** 0 while the block is below the screen, 1 once all of it is in view. */
export function revealProgress(rect, viewportHeight) {
  if (!rect || !rect.height) return 0;
  return Math.max(0, Math.min(1, (viewportHeight - rect.top) / rect.height));
}

/**
 * The end of a hotel tab (Prijzen, Informatie): scrolling on past it opens the next tab from
 * its top, as if the page carried on. The bar fills while the block comes into view; once it
 * is fully in view, scrolling further down switches. Clicking it switches too. The tabs above
 * stay the normal way to move between sections.
 */
export default function NextTabTeaser({ label, icon, hint, onNext }) {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;

  useEffect(() => {
    const armedAt = performance.now() + ARM_MS;
    let lastY = window.scrollY;
    let fired = false;
    let raf = 0;
    let touchY = null;

    const progressNow = () => revealProgress(ref.current?.getBoundingClientRect(), window.innerHeight);
    const fire = () => {
      if (fired || performance.now() < armedAt) return;
      fired = true;
      nextRef.current();
    };

    const check = () => {
      raf = 0;
      const y = window.scrollY;
      const down = y > lastY;
      lastY = y;
      const p = progressNow();
      setProgress(p);
      if (down && p >= 1) fire();
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    // At the very bottom of the page a scroll no longer moves anything, so no scroll event
    // comes: the wheel or a swipe up is the "keep scrolling" then.
    const onWheel = (e) => { if (e.deltaY > 0 && progressNow() >= 1) fire(); };
    const onTouchStart = (e) => { touchY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const yNow = e.touches[0]?.clientY;
      if (touchY != null && yNow != null && touchY - yNow > SWIPE_PX && progressNow() >= 1) fire();
    };

    setProgress(progressNow());
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <button
      type="button"
      ref={ref}
      className={`nt${progress >= 1 ? ' nt-full' : ''}`}
      onClick={() => nextRef.current()}
      style={{ '--nt-p': progress }}
    >
      <span className="nt-hint">{hint}</span>
      <span className="nt-tab">{icon} {label}</span>
      <span className="nt-bar" aria-hidden="true"><span className="nt-fill" /></span>
      <svg className="nt-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
