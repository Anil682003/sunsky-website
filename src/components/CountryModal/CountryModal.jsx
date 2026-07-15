import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './CountryModal.module.css';

/**
 * Full-list country picker. The caller owns the country data (fetched once via
 * useCountries) so reopening the modal never refetches.
 *
 * onSelect receives the whole country object:
 *   { id, code, isoCode, name, flag, flagUrl, euMember }
 */
export default function CountryModal({
  open,
  countries = [],
  loading = false,
  error = null,
  selectedCode = '',
  onSelect,
  onClose,
}) {
  // Close on Escape, and stop the page behind the modal from scrolling.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a destination country"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Choose a destination</h3>
            <p className={styles.subtitle}>Pick the country you want to travel to</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.body}>
          {loading && <div className={styles.state}>Loading countries…</div>}

          {!loading && error && (
            <div className={`${styles.state} ${styles.stateError}`}>
              Could not load countries. Please try again.
            </div>
          )}

          {!loading && !error && countries.length === 0 && (
            <div className={styles.state}>No countries available.</div>
          )}

          {!loading && !error && countries.length > 0 && (
            <div className={styles.grid}>
              {countries.map((c) => {
                const code = c.isoCode || c.code;
                return (
                  <button
                    key={c.id ?? code}
                    type="button"
                    className={`${styles.item} ${selectedCode && selectedCode === code ? styles.itemActive : ''}`}
                    onClick={() => onSelect(c)}
                  >
                    {c.flagUrl
                      ? <img className={styles.flagImg} src={c.flagUrl} alt="" loading="lazy" width="28" height="21" />
                      : <span className={styles.flagEmoji}>{c.flag || '🏳️'}</span>
                    }
                    <span className={styles.name}>{c.name}</span>
                    {code && <span className={styles.code}>{code}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
