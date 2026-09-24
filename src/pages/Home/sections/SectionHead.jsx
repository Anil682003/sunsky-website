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
 *
 * `rule` draws a short line after the eyebrow and `swash` a brush stroke under the
 * handwritten word. Both are off unless a section's design asks for them.
 */
export default function SectionHead({
  eyebrow, title, subtitle, action, accent = true, id, align = 'start', rule = false, swash = false,
}) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);
  const last = accent ? words.pop() : null;
  const lead = words.join(' ');

  return (
    <header className={`${styles.head} ${align === 'center' ? styles.center : ''}`}>
      <div className={styles.text}>
        {eyebrow && <p className={`${styles.eyebrow} ${rule ? styles.eyebrowRule : ''}`}>{eyebrow}</p>}
        <h2 id={id} className={styles.title}>
          {lead}
          {last && (
            <>
              {lead && ' '}
              <span className={`${styles.accent} ${swash ? styles.accentSwash : ''}`}>
                {last}
                {swash && (
                  <svg className={styles.swash} viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 10.5 C 52 5, 128 2.5, 197 4.6 C 132 5.8, 66 8.6, 5 13 C 1.8 13.2, 1 10.8, 3 10.5 Z" fill="currentColor" />
                  </svg>
                )}
              </span>
            </>
          )}
        </h2>
        {subtitle && <p className={styles.sub}>{cmsText(subtitle)}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
