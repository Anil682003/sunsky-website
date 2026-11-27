import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { remarksParagraphs, remarksBlocks } from '../../utils/supplierRemarks';
import styles from './SupplierRemarks.module.css';

/**
 * "Important information from the hotel": the supplier's remarks for the exact rate being booked,
 * in full (Levent, 20 Nov 2026). Open by default; the traveller may fold it away and back.
 *
 * The supplier's own words, all of them, no bullets, no counts, no "show more"; laid out by what
 * the text itself says (utils/supplierRemarks remarksBlocks; Levent, 26 Nov 2026, option A):
 *   - its "label:" / value pairs (check-in time, minimum age …) as tiles at the top;
 *   - each of its own headings opens a section that can be folded, every one OPEN to start with
 *     (nothing hidden, as on 20 Nov);
 *   - a run of short lines (a list it ran together) as small tags, amounts of money highlighted.
 * Renders nothing when the supplier said nothing.
 *
 * `lead` goes before the info mark inside the toggle (the checkout review puts its section
 * number there, so the whole heading row folds the section).
 *
 * A new text (the rate changed and its remarks with it) opens the section again, so a traveller
 * who folded the old remarks away is not left unaware that they changed.
 */
// The blocks arranged: label/value pairs first, the text before the first heading, then one section
// per heading with the text under it. A heading whose text was only label/value pairs has nothing
// left under it and is not drawn.
export function arrange(blocks) {
  const facts = [];
  const intro = [];
  const sections = [];
  let cur = null;
  for (const b of blocks) {
    // A label/value pair moves to the top and ends the section it stood in: the text after it
    // belongs to whatever the pair was about, not to the heading before ("213 sq feet" after
    // "Room Description: 1 King Bed" is not a check-in instruction).
    if (b.type === 'fact') { facts.push(b); if (cur?.title) { cur = { title: null, items: [] }; sections.push(cur); } }
    else if (b.type === 'heading') { cur = { title: b.text, items: [] }; sections.push(cur); }
    else (cur ? cur.items : intro).push(b);
  }
  return { facts, intro, sections: sections.filter((s) => s.items.length) };
}

// Amounts of money, with the currency before or after: "USD 25", "€ 12,40", "780,82 MXN".
const CCY = '(?:USD|EUR|GBP|MXN|CHF|TRY|EGP|MAD|AED|THB|DKK|SEK|NOK|PLN|CZK|HUF|\\$|€|£)';
const MONEY = new RegExp(`(${CCY}\\s?\\d[\\d.,]*\\d|${CCY}\\s?\\d|\\d[\\d.,]*\\s?${CCY}(?![A-Za-z]))`, 'g');
function withMoney(text, cls) {
  const parts = text.split(MONEY);
  return parts.map((p, i) => (i % 2 ? <span key={i} className={cls}>{p}</span> : p));
}

// A paragraph's lines: a run of three or more short lines (a list the supplier ran together) as
// tags, the rest as text. Short: at most 40 characters, not ending a sentence or a heading.
const isItem = (l) => l.trim().length > 0 && l.trim().length <= 40 && !/[.:]\s*$/.test(l);
function paraParts(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && isItem(lines[j])) j += 1;
    if (j - i >= 3) { out.push({ tags: lines.slice(i, j) }); i = j; continue; }
    const last = out[out.length - 1];
    if (last && 'text' in last) last.text += `\n${lines[i]}`;
    else out.push({ text: lines[i] });
    i += 1;
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

  const title = t('supplierRemarks.title', 'Hotel remarks');
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
        <Body text={text} />
      </div>
    </section>
  );
}

function Para({ text }) {
  return paraParts(text).map((part, k) => (part.tags ? (
    <div key={k} className={styles.tags}>{part.tags.map((tag, n) => <span key={n} className={styles.tag}>{tag}</span>)}</div>
  ) : (
    <p key={k} className={styles.para}>{withMoney(part.text, styles.money)}</p>
  )));
}

const ICONS = {
  fees: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2" /></>,
  bed: <path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1M7 11a2 2 0 1 0 0-.01" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.01" /></>,
};
const iconFor = (title) => (/fee|tax|charge|cost|price|payment|deposit/i.test(title) ? ICONS.fees
  : /check.?in|check.?out|arriv|instruction/i.test(title) ? ICONS.key
    : /room|bed/i.test(title) ? ICONS.bed : ICONS.info);

function Body({ text }) {
  const { facts, intro, sections } = arrange(remarksBlocks(text));
  return (
    <>
      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((f, k) => <div key={k} className={styles.fact}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}
      {intro.map((b, k) => <Para key={k} text={b.text} />)}
      {sections.map((s, k) => (!s.title ? (
        <div key={k} className={styles.loose}>{s.items.map((b, n) => <Para key={n} text={b.text} />)}</div>
      ) : (
        <details key={k} className={styles.section} open>
          <summary className={styles.secHead}>
            <svg className={styles.secIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconFor(s.title)}</svg>
            <h4 className={styles.sub}>{s.title}</h4>
            <svg className={styles.secChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
          </summary>
          <div className={styles.secBody}>{s.items.map((b, n) => <Para key={n} text={b.text} />)}</div>
        </details>
      )))}
    </>
  );
}
