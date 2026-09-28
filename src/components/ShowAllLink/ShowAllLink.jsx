import { Link } from 'react-router-dom';
import styles from './ShowAllLink.module.css';

/**
 * "Show all", at the right of a section's heading: one search across everything the section
 * shows, built with sectionSearchUrl. Renders nothing without a link, so a section whose
 * places are not linked in the dashboard never shows a button that goes nowhere.
 *
 * `tone="dark"` is for a heading that sits on a dark banner.
 */
export default function ShowAllLink({ to, children, title, tone = 'light', className = '' }) {
  if (!to) return null;
  return (
    <Link
      to={to}
      title={title}
      className={[styles.link, tone === 'dark' ? styles.dark : '', className].filter(Boolean).join(' ')}
    >
      {children}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
