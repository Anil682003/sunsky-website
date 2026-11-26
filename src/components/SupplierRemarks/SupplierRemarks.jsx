import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { remarksParagraphs, remarksBlocks } from '../../utils/supplierRemarks';
import styles from './SupplierRemarks.module.css';

/**
 * "Important information from the hotel": the supplier's remarks for the exact rate being booked,
 * in full (Levent, 20 Nov 2026). Open by default; the traveller may fold it away and back.
 *
 * The supplier's own words, all of them, no bullets, no counts, no "show more"; laid out by what
 * the text itself says (utils/supplierRemarks remarksBlocks, 26 Nov 2026): its own headings as
 * headings, its "label:" / value pairs side by side, run-together list items on their own lines.
 * Renders nothing when the supplier said nothing.
 *
 * `lead` goes before the info mark inside the toggle (the checkout review puts its section
 * number there, so the whole heading row folds the section).
 *
 * A new text (the rate changed and its remarks with it) opens the section again, so a traveller
 * who folded the old remarks away is not left unaware that they changed.
 */
// Consecutive label/value pairs share one list, so they line up as one block.
function groupFacts(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === 'fact') {
      if (last?.type === 'facts') last.items.push(b);
      else out.push({ type: 'facts', items: [b] });
    } else out.push(b);
  }
  return out;
}

export default function SupplierRemarks({ text, className = '', as: Heading = 'h3', lead = null }) {
  const { t } = useTranslation('common');
  const paragraphs = remarksParagraphs(text);
  const signature = paragraphs.join('\n\n');
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(signature);
  const bodyId = useId();

  // New remarks: adjust during render (React's pattern for state derived from a prop change).
  if (shown !== signature) {
    setShown(signature);
    setOpen(true);
  }

  if (!paragraphs.length) return null;

  const title = t('supplierRemarks.title', 'Important information from the hotel');
  return (
    <section className={`${styles.box}${className ? ` ${className}` : ''}`} data-testid="supplier-remarks">
      <Heading className={styles.heading}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {lead}
          <span className={styles.ico} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="11" x2="12" y2="16.5" />
              <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className={styles.title}>{title}</span>
          <span className={`${styles.chev}${open ? ` ${styles.chevOpen}` : ''}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      </Heading>
      <div id={bodyId} className={styles.body} hidden={!open}>
        {groupFacts(remarksBlocks(text)).map((b, i) => (
          b.type === 'facts' ? (
            <dl key={i} className={styles.facts}>
              {b.items.map((f, k) => (
                <div key={k} className={styles.fact}><dt>{f.label}</dt><dd>{f.value}</dd></div>
              ))}
            </dl>
          ) : b.type === 'heading' ? (
            <h4 key={i} className={styles.sub}>{b.text}</h4>
          ) : (
            <p key={i} className={styles.para}>{b.text}</p>
          )
        ))}
      </div>
    </section>
  );
}
