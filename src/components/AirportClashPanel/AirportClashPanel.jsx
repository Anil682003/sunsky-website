import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AirportClashPanel.module.css';
import { airportCity } from '../../utils/airports';

// "Antalya of Side", "ANR en LGG": the browser's own list grammar in the reader's language. A
// runtime without Intl.ListFormat gets commas, which reads less well and says the same.
function joinList(items, language, type) {
  try {
    return new Intl.ListFormat(language, { style: 'long', type }).format(items);
  } catch {
    return items.join(', ');
  }
}

/**
 * UI-06 (Ch1 §9A, Ch3 §4A). The question asked when a destination the traveller just picked
 * cannot be flown from every departure airport they ticked:
 *
 *   Antwerpen (ANR) vliegt niet naar Antalya
 *   Vanaf Brussel (BRU) kan het wel.
 *   [ ANR verwijderen en doorgaan ]  [ Mijn luchthavens behouden ]
 *
 * It is drawn in the page, not in window.confirm: a browser dialog cannot name the airports in
 * the site's own words, cannot be styled, and blocks the whole tab over a question that is only
 * about one field.
 *
 * The panel decides nothing. Whether to ask, and what, is `clashingAirports` (hooks/
 * useDestinationFeasibility); the page holds the pick and applies or drops it. This only says
 * it, so Home and Results ask the same question in the same words.
 *
 * Accessibility: an alertdialog, because it needs an answer before the pick can go anywhere.
 * Focus moves to it when it appears (and again whenever `focusKey` changes, so a page can bring
 * the traveller back to it, e.g. when they press Search with the question still open), and
 * Escape is "keep", the answer that changes nothing.
 *
 * @param verdict      { state, clashing, keep } from clashingAirports
 * @param destinations display names of what was picked ("Antalya", "Side")
 * @param checking     the check is on its way: a quiet status line, nothing flagged
 * @param focusKey     change it to send focus back to the question
 * @param onRemove     untick `verdict.clashing` and apply the pick
 * @param onKeep       drop the pick; airports and destination stay as they were
 */
export default function AirportClashPanel({
  verdict,
  destinations = [],
  checking = false,
  focusKey = 0,
  onRemove,
  onKeep,
  className = '',
}) {
  const { t, i18n } = useTranslation('common');
  const ref = useRef(null);
  const titleId = useId();
  const bodyId = useId();

  const state = verdict?.state;
  const asking = state === 'some' || state === 'all';

  useEffect(() => {
    if (asking) ref.current?.focus();
  }, [asking, focusKey]);

  const lang = i18n.language;
  // "or", not "and": with two places picked an airport only clashes when it reaches NEITHER
  // (case 20), so "ANR does not fly to Antalya or Side" is the exact claim.
  const destination = destinations.length
    ? joinList(destinations, lang, 'disjunction')
    : t('airportClash.thisDestination', 'this destination');
  // City first, code in brackets: "Antwerpen (ANR)", the way the search bar names one airport.
  const named = (codes) => joinList(codes.map((c) => `${airportCity(c)} (${c})`), lang, 'conjunction');

  if (asking) {
    const all = state === 'all';
    return (
      <div
        ref={ref}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={`${styles.panel} ${className}`}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Ours alone: the page's own Escape handlers close panels this one is not part of.
          e.stopPropagation();
          onKeep?.();
        }}
      >
        <p id={titleId} className={styles.title}>
          {t('airportClash.notServed', {
            count: verdict.clashing.length,
            airports: named(verdict.clashing),
            destination,
            defaultValue_one: '{{airports}} does not fly to {{destination}}',
            defaultValue_other: '{{airports}} do not fly to {{destination}}',
          })}
        </p>
        <p id={bodyId} className={styles.body}>
          {all
            // Nothing to offer: removing every airport would quietly become No preference.
            ? t('airportClash.changeFirst', {
              destination,
              defaultValue: 'Choose a different departure airport first, then pick {{destination}} again.',
            })
            : t('airportClash.continueFrom', {
              airports: named(verdict.keep),
              defaultValue: 'You can still go from {{airports}}.',
            })}
        </p>
        <div className={styles.actions}>
          {!all && (
            <button type="button" className={styles.remove} onClick={onRemove}>
              {t('airportClash.remove', {
                codes: joinList(verdict.clashing, lang, 'conjunction'),
                defaultValue: 'Remove {{codes}} and continue',
              })}
            </button>
          )}
          <button type="button" className={styles.keep} onClick={onKeep}>
            {t('airportClash.keep', 'Keep my airports')}
          </button>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <p role="status" className={`${styles.checking} ${className}`}>
        {t('airportClash.checking', {
          destination,
          defaultValue: 'Checking which of your airports fly to {{destination}}…',
        })}
      </p>
    );
  }

  return null;
}
