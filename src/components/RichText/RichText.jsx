import styles from './RichText.module.css';
import { parseBlocks, parseInline } from '../../utils/richText';

/* CMS body text, rendered as a fixed set of React elements.
 *
 * The whole point is the list below: <p>, <ul>, <li>, <strong>, <mark>. That is
 * every element this can produce. There is no HTML string anywhere in the path,
 * so nothing an author types (or anyone else, given /api/cms/* has no auth) can
 * become markup. See utils/richText.js for the reasoning. */

function Inline({ line }) {
  return parseInline(line).map((run, i) => {
    if (run.kind === 'bold') return <strong key={i}>{run.text}</strong>;
    if (run.kind === 'mark') return <mark key={i} className={styles.mark}>{run.text}</mark>;
    return run.text;
  });
}

/**
 * @param {string} text        Body text from the CMS.
 * @param {string} paraClass   Class for each paragraph, so a caller keeps its
 *                             own measure, indent and colour.
 * @param {string} listClass   Class for the <ul>. Optional.
 */
export default function RichText({ text, paraClass, listClass }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;

  return blocks.map((block, i) => {
    if (block.type === 'ul') {
      return (
        <ul key={i} className={`${styles.list} ${listClass ?? ''}`}>
          {block.lines.map((line, j) => (
            <li key={j}><Inline line={line} /></li>
          ))}
        </ul>
      );
    }
    // Single newlines inside a paragraph survive: the stylesheet sets
    // white-space: pre-line, matching how CMS text has always behaved.
    return (
      <p key={i} className={paraClass}>
        {block.lines.map((line, j) => (
          <span key={j}>
            {j > 0 ? '\n' : null}
            <Inline line={line} />
          </span>
        ))}
      </p>
    );
  });
}
