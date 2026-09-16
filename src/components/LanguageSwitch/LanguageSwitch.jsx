import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitch.module.css';
import { SUPPORTED_LANGUAGES, setLanguage } from '../../i18n';

/**
 * The language control in the header.
 *
 * Two segments rather than a dropdown. With exactly two languages a dropdown
 * hides the alternative behind a click and gives no clue what it contains, while
 * two visible segments say what is on offer and which one you are reading. If a
 * third language is ever added this should become a menu; two is the number that
 * makes a toggle the right shape.
 *
 * NOT a flag. Flags are countries, not languages: Dutch is not Dutch-the-country
 * here, English is not the United Kingdom, and a Belgian site labelling Dutch
 * with a Netherlands flag would be its own small insult. Short codes, with the
 * full language name carried for screen readers.
 *
 * Switching does not reload. i18next re-renders whatever is on screen, so the
 * reader keeps their place, their scroll position and anything they had typed.
 */
export default function LanguageSwitch({ className = '', compact = false }) {
  const { t, i18n } = useTranslation('common');
  const current = i18n.resolvedLanguage || i18n.language;

  return (
    <div
      className={`${styles.wrap} ${compact ? styles.compact : ''} ${className}`}
      role="group"
      aria-label={t('language.label', 'Language')}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = lng === current;
        const name = t(`language.${lng}`, lng.toUpperCase());
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
            {lng.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
