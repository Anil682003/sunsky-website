import styles from './SectionHead.module.css';
import { cmsText } from '../../../utils/cmsText';

/**
 * The heading every homepage section shares: a small eyebrow, the title, one line of
 * supporting text, and optionally an action on the right.
 *
 * The title's last word carries the site's handwritten accent, and that is the ONLY script
 * a section gets. Pass `accent={false}` where even that is too playful (the trust section).
 * Every piece of text arrives verbatim from the CMS or the translations; nothing here adds
 * glyphs, numbering or codes of its own.
 */
export default function SectionHead({ eyebrow, title, subtitle, action, accent = true, id, align = 'start' }) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);
  const last = accent ? words.pop() : null;
  const lead = words.join(' ');

  return (
    <header className={`${styles.head} ${align === 'center' ? styles.center : ''}`}>
      <div className={styles.text}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2 id={id} className={styles.title}>
          {lead}
          {last && <>{lead && ' '}<span className={styles.accent}>{last}</span></>}
        </h2>
        {subtitle && <p className={styles.sub}>{cmsText(subtitle)}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
