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
 * NAMING IS THE COMPONENT'S JOB, not the caller's, and the name is now ALWAYS printed, ahead
 * of the mark: "Turkish Airlines ◯".
 *
 * It used to be the other way round — mark first, name only as a fallback — because a logo is
 * a wordmark that already says the airline in its own type, so printing the name beside it
 * said everything twice. That reasoning held only while the mark was WIDE: the marks are
 * round now, and a wordmark scaled into a 24px circle is a smudge, not a word. A round mark
 * is an avatar; the name beside it is what actually names the carrier, and every row reads
 * the same whether or not we happen to hold that airline's logo.
 *
 * `nameClassName` is for the host's typography. Pass `null` to suppress the name where the
 * surrounding row already states the carrier.
 */
export default function AirlineMark({ code, name, className = '', nameClassName = '' }) {
  const directory = useAirlineLogos();
  const [failed, setFailed] = useState(false);
  const hit = directory.get(String(code || '').trim().toUpperCase());
  const label = String(name || hit?.name || staticAirlineName(code) || '');

  const mark = (!hit?.logo || failed)
    ? <span className={`${className} air-mark`.trim()} aria-hidden="true">{label.charAt(0)}</span>
    : (
      <img
        className={`${className} air-mark air-logo`.trim()}
        src={hit.logo}
        // Empty: the name is printed as text right beside it, so an alt would read it twice.
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );

  return (
    <>
      {nameClassName !== null && <span className={`air-name ${nameClassName}`.trim()}>{label}</span>}
      {mark}
    </>
  );
}
