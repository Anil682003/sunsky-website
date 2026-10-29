import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitch.module.css';
import { SUPPORTED_LANGUAGES, setLanguage } from '../../i18n';

/* 3:2 flags, drawn to the box so the two sit at identical weight in the bar. */
const FlagBE = () => (
  <svg viewBox="0 0 9 6" className={styles.flag} aria-hidden="true" focusable="false">
    <rect width="3" height="6" x="0" fill="#2D2926" />
    <rect width="3" height="6" x="3" fill="#FAE042" />
    <rect width="3" height="6" x="6" fill="#ED2939" />
  </svg>
);
const FlagNL = () => (
  <svg viewBox="0 0 9 6" className={styles.flag} aria-hidden="true" focusable="false">
    <rect width="9" height="2" y="0" fill="#AE1C28" />
    <rect width="9" height="2" y="2" fill="#FFF" />
    <rect width="9" height="2" y="4" fill="#21468B" />
  </svg>
);
const FlagGB = () => (
  <svg viewBox="0 0 60 40" className={styles.flag} aria-hidden="true" focusable="false">
    <rect width="60" height="40" fill="#012169" />
    <path d="M0 0l60 40M60 0L0 40" stroke="#FFF" strokeWidth="8" />
    <path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" strokeWidth="4" />
    <path d="M30 0v40M0 20h60" stroke="#FFF" strokeWidth="13" />
    <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="8" />
  </svg>
);
/* Closed list, like entryOf: a language with no flag here simply shows its code. Dutch flies
   both Belgium's and the Netherlands' flags, as in the client's header design (Oct 2026): the
   agency trades in Belgium, and the same Dutch serves travellers from the Netherlands too. */
const FLAGS = {
  nl: () => (<span className={styles.flagPair}><FlagBE /><FlagNL /></span>),
  en: FlagGB,
};

/**
 * The language control in the header.
 *
 * Two segments rather than a dropdown. With exactly two languages a dropdown
 * hides the alternative behind a click and gives no clue what it contains, while
 * two visible segments say what is on offer and which one you are reading. If a
 * third language is ever added this should become a menu; two is the number that
 * makes a toggle the right shape.
 *
 * A flag beside each code, at the client's request. Flags are countries rather than
 * languages, which is why this used to carry codes alone, so the pairing is chosen to be
 * the least wrong one available. Dutch flies Belgium's flag first, the country the agency
 * trades in, with the Netherlands' beside it (the client's header design, Oct 2026). English
 * gets the Union Jack, the convention every Belgian travel site uses for it.
 *
 * The flag is decorative only (aria-hidden): the accessible name stays the full language
 * name, so a screen reader still hears "Nederlands", not "flag of Belgium". Drawn inline
 * rather than set as an emoji — Windows ships no flag glyphs at all, so an emoji flag
 * renders there as two bare letters in a box.
 *
 * Switching does not reload. i18next re-renders whatever is on screen, so the
 * reader keeps their place, their scroll position and anything they had typed.
 */
// `tone="onDark"`: white labels for a dark or brand-blue band (the homepage's top strip).
export default function LanguageSwitch({ className = '', compact = false, tone = '' }) {
  const { t, i18n } = useTranslation('common');
  const current = i18n.resolvedLanguage || i18n.language;

  return (
    <div
      className={`${styles.wrap} ${compact ? styles.compact : ''} ${tone === 'onDark' ? styles.onDark : ''} ${className}`}
      role="group"
      aria-label={t('language.label', 'Language')}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = lng === current;
        const name = t(`language.${lng}`, lng.toUpperCase());
        const Flag = FLAGS[lng];
        return (
          <button
            key={lng}
            type="button"
            className={`${styles.btn} ${active ? styles.btnOn : ''}`}
            // `aria-current` rather than `aria-pressed`: this is "which one are
            // you reading", not two independent toggles.
            aria-current={active ? 'true' : undefined}
            // The visible label is a two-letter code, which reads as an initialism
            // out loud. The full name goes on the accessible name instead.
            aria-label={active ? name : t('language.switchTo', { language: name, defaultValue: `Switch to ${name}` })}
            onClick={() => setLanguage(lng)}
          >
            {Flag && <Flag />}
            {lng.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
