import { useState } from 'react';
import { useAirlineLogos } from '../../utils/airlineLogos';
import { airlineName as staticAirlineName } from '../../utils/flightNames';

/**
 * The airline's mark: its dashboard logo when we have one, otherwise the initial badge.
 *
 * The fallback is not a nicety. Logos are uploaded by hand, so a carrier the supplier returns
 * may simply not have one yet, and a stored logo can 404 if the file moved (all 170 of them did
 * once, when they still lived on the backend's own disk). Both cases must land on the initial
 * rather than a broken-image icon, which is why `onError` flips back instead of leaving the
 * <img> to fail visibly.
 *
 * `className` is passed through rather than owned here, so each host keeps the size and shape
 * its own stylesheet already gives this slot: the boarding-pass card, the per-leg rows inside
 * the flight modal and the checkout summary all render the same component at three sizes.
 *
 * NAMING IS THE COMPONENT'S JOB, not the caller's. A logo is a wordmark — it already says
 * "Turkish Airlines" in the airline's own type — so printing the name beside it said everything
 * twice and crowded the row. But the name cannot simply be dropped by the caller either: when
 * there is no logo, or when a stored one fails to load, all that is left is a single letter, and
 * "T" is not an airline. So the two are decided together here. Pass `nameClassName` and the name
 * appears exactly when the logo does not.
 */
export default function AirlineMark({ code, name, className = '', nameClassName }) {
  const directory = useAirlineLogos();
  const [failed, setFailed] = useState(false);
  const hit = directory.get(String(code || '').trim().toUpperCase());
  const label = String(name || hit?.name || staticAirlineName(code) || '');

  if (!hit?.logo || failed) {
    return (
      <>
        <span className={className} aria-hidden="true">{label.charAt(0)}</span>
        {nameClassName !== undefined && <span className={nameClassName}>{label}</span>}
      </>
    );
  }
  return (
    <img
      className={`${className} air-logo`.trim()}
      src={hit.logo}
      // The name still reaches a screen reader, which cannot see the wordmark.
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
