import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router keeps the window scroll position across navigations, so following
 * a link from halfway down a page lands you halfway down the next one.
 *
 * The catch: index.css sets `html { scroll-behavior: smooth }`, which turns every
 * programmatic scroll into an animation. The incoming page then changes the
 * document height mid-animation, the browser aborts the scroll, and you are left
 * stranded near the bottom. So the reset switches smooth scrolling off for the
 * duration of the jump and restores it afterwards.
 *
 * useLayoutEffect (not useEffect) runs before paint, so the new page is never
 * briefly visible at the old offset.
 *
 * Search-param changes are ignored on purpose — the results page rewrites its own
 * query string while filtering and paginating, and must not be yanked to the top.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;

    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    html.scrollTop = 0;
    document.body.scrollTop = 0;   // Safari keeps the offset on <body>
    html.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}
