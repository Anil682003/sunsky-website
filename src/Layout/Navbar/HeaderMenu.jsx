import { useState, useRef, useEffect } from 'react';
import styles from './Navbar.module.css';
import { newTabProps } from '../../utils/siteHeader';

// A header dropdown menu flanking the search ticket — same manifest language as the
// search results panel: cream tally strip, icon-tile rows, staggered rise, boarding-bar
// hover. Click to open; closes on outside click, Escape, or a pick.
//
// Two elevation motifs live here (design-panel winners):
// - Gate-count stamp: the trigger carries its item count zero-padded ("07"), set in the
//   manifest's fare-stamp recipe — blue at rest, heating amber while open.
// - Golden thread: hovering draws a gold line under the label; opening re-draws that same
//   line across the panel's cream strip FROM THE TRIGGER'S SIDE, stitching the two
//   together. The side-aware classes keep the draw direction honest for the right menu.
//
// items: [{ key, label, sub, icon, onPick }]          a path on this site, through the router
//      | [{ key, label, sub, icon, href, newTab }]    anything else: a real <a href>
// footer: the same two shapes with a label, drawn as a "See all" row under the list, or null.
//
// Router links stay buttons rather than anchors because the caller also closes the phone menu
// and routes through navigate(); a link that leaves the site, or opens a new tab, has to be a
// real anchor so the browser (and a screen reader) knows that is what it does.
export default function HeaderMenu({ label, buttonIcon, tally, items, footer = null, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!items.length) return null;

  const sideClass = align === 'right' ? styles.hmFromRight : '';

  // One row, either shape. `key` is passed separately: React does not read it from a spread.
  const entry = (it, className, inner, style) => {
    if (it.href) {
      return (
        <a
          key={it.key}
          role="menuitem"
          className={className}
          style={style}
          href={it.href}
          {...newTabProps(it.newTab)}
          onClick={() => setOpen(false)}
        >
          {inner}
        </a>
      );
    }
    return (
      <button
        key={it.key}
        type="button" role="menuitem"
        className={className}
        style={style}
        onClick={() => { setOpen(false); it.onPick(); }}
      >
        {inner}
      </button>
    );
  };

  return (
    <div className={`${styles.hmWrap} ${className}`} ref={ref}>
      <button
        type="button"
        className={`${styles.hmBtn} ${sideClass} ${open ? styles.hmBtnOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The label is hidden below 1500px to give the search ticket its width back, so the
        // button carries the name itself rather than borrowing it from the span.
        aria-label={label}
        title={label}
      >
        <span className={styles.hmBtnIcon}>{buttonIcon}</span>
        <span className={styles.hmBtnLabel}>{label}</span>
        <svg
          className={`${styles.hmChevron} ${open ? styles.hmChevronUp : ''}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={`${styles.hmPanel} ${sideClass} ${align === 'right' ? styles.hmPanelRight : ''}`} role="menu" aria-label={label}>
          <div className={styles.hmStrip}><span className={styles.hmTally}>{tally}</span></div>
          {items.map((it, i) => entry(
            it,
            styles.hmItem,
            <>
              <span className={styles.hmItemIcon}>{it.icon}</span>
              <span className={styles.hmItemText}>
                <span className={styles.hmItemMain}>{it.label}</span>
                {it.sub && <span className={styles.hmItemSub}>{it.sub}</span>}
              </span>
              <svg className={styles.hmItemArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
            </>,
            { animationDelay: `${i * 22}ms` },
          ))}
          {/* "See all": under the list, after a hairline, so it reads as a way OUT of the
              shortlist rather than as one more entry in it. */}
          {footer && entry(
            { ...footer, key: '__footer' },
            styles.hmFooter,
            <>
              <span>{footer.label}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </>,
          )}
        </div>
      )}
    </div>
  );
}
