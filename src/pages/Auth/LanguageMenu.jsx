import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setLanguage } from '../../i18n';
import styles from './LanguageMenu.module.css';

const Globe = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
);

/**
 * The sign-in card's language picker: the current language by name, the others in a small
 * menu. Same languages and same switch as the header's NL | EN toggle (setLanguage), so the
 * choice carries over to the rest of the site; only the shape differs, because a named
 * dropdown is what the sign-in design calls for.
 */
export default function LanguageMenu({ className = '' }) {
  const { t, i18n } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = i18n.resolvedLanguage || i18n.language;
  const name = (lng) => t(`language.${lng}`, lng.toUpperCase());

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`${styles.wrap} ${className}`} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('language.label', 'Language')}: ${name(current)}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Globe />
        <span>{name(current)}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronUp : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul className={styles.menu}>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <li key={lng}>
              <button
                type="button"
                className={`${styles.item} ${lng === current ? styles.itemOn : ''}`}
                aria-current={lng === current ? 'true' : undefined}
                onClick={() => { setLanguage(lng); setOpen(false); }}
              >
                {name(lng)}
                {lng === current && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
