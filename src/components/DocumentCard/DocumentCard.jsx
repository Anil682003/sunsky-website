import { useId, useState } from 'react';
import styles from './DocumentCard.module.css';

/* A PDF attached to a page section.
 *
 * Travel conditions and standard-information forms are published as files, and
 * a bare link to a .pdf tells the reader nothing about what they are about to
 * download. This names it, sizes it, and lets them read it WITHOUT leaving the
 * page, because most people want to glance at one clause rather than keep a
 * copy.
 *
 * The viewer is mounted only once it is opened. Browsers load a PDF eagerly, and
 * a legal page with four attachments would otherwise pull several megabytes on
 * first paint for documents nobody asked to see. */

const PDF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 2.8h7.2L19 8.4V21a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 21V4A1.2 1.2 0 0 1 6 2.8Z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
    />
    <path d="M13 3v5.2h5.4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8.4 17.6v-4.4h1.4a1.2 1.2 0 0 1 0 2.4H8.4M13.6 17.6v-4.4h1a1.7 1.7 0 0 1 0 4.4h-1Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Readable size. Bytes are never what a reader wants to see. */
const readableSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
};

/** The file's own name when the CMS did not record one. */
const nameFromUrl = (url) => {
  try {
    const last = String(url).split('?')[0].split('#')[0].split('/').pop() || '';
    // Uploads are stored as "<timestamp>-<original-name>.pdf"; drop the stamp.
    return decodeURIComponent(last).replace(/^\d{10,}-/, '') || 'Document.pdf';
  } catch {
    return 'Document.pdf';
  }
};

export default function DocumentCard({ url, name, size, label }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!url) return null;

  const fileName = String(name ?? '').trim() || nameFromUrl(url);
  // What the reader sees. The CMS owns this wording, because the site is Dutch
  // and a filename rarely reads as a sentence. Falls back to the filename.
  const headline = String(label ?? '').trim() || fileName;
  const sizeText = readableSize(size);

  return (
    <div className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden="true">{PDF_ICON}</span>

        <span className={styles.meta}>
          <span className={styles.name}>{headline}</span>
          <span className={styles.sub}>
            {headline === fileName ? 'PDF' : fileName}
            {sizeText ? ` · ${sizeText}` : ''}
          </span>
        </span>

        <span className={styles.actions}>
          <button
            type="button"
            className={styles.view}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'View'}
            <span className={`${styles.chev} ${open ? styles.chevOpen : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {/* Opening in a tab is the reliable path: some browsers and most
              phones will not render a PDF in a frame at all. */}
          <a className={styles.open} href={url} target="_blank" rel="noreferrer">
            Open
            <span className={styles.openIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M14 4h6v6M20 4l-8.5 8.5" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
        </span>
      </div>

      <div id={panelId} className={styles.panel} hidden={!open}>
        {open && (
          <>
            <iframe className={styles.frame} src={url} title={headline} loading="lazy" />
            <p className={styles.fallback}>
              Not showing?{' '}
              <a href={url} target="_blank" rel="noreferrer">Open the PDF in a new tab</a>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
