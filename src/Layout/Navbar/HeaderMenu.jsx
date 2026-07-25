import { useState, useRef, useEffect } from 'react';
import styles from './Navbar.module.css';

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
// items: [{ key, label, sub, icon, onPick }]
export default function HeaderMenu({ label, buttonIcon, tally, items, align = 'left' }) {
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

  return (
    <div className={styles.hmWrap} ref={ref}>
      <button
        type="button"
        className={`${styles.hmBtn} ${sideClass} ${open ? styles.hmBtnOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={styles.hmBtnIcon}>{buttonIcon}</span>
        <span className={styles.hmBtnLabel}>{label}</span>
        <span className={styles.hmStamp} aria-hidden="true">{String(items.length).padStart(2, '0')}</span>
        <svg
          className={`${styles.hmChevron} ${open ? styles.hmChevronUp : ''}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={`${styles.hmPanel} ${sideClass} ${align === 'right' ? styles.hmPanelRight : ''}`} role="menu">
          <div className={styles.hmStrip}><span className={styles.hmTally}>{tally}</span></div>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button" role="menuitem"
              className={styles.hmItem}
              style={{ animationDelay: `${i * 22}ms` }}
              onClick={() => { setOpen(false); it.onPick(); }}
            >
              <span className={styles.hmItemIcon}>{it.icon}</span>
              <span className={styles.hmItemText}>
                <span className={styles.hmItemMain}>{it.label}</span>
                {it.sub && <span className={styles.hmItemSub}>{it.sub}</span>}
              </span>
              <svg className={styles.hmItemArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
