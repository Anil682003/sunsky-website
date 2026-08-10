import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { resolveCmsImageUrl } from './cmsImage';
import { airlineName as staticAirlineName } from './flightNames';

/**
 * Airline logos, uploaded by the team in the dashboard (Products → Flights → Airlines).
 *
 * The flight suppliers only ever return a bare marketing code — "PC", "TK", "XQ" — so a
 * logo can only be found by looking that code up. The directory is fetched ONCE per page
 * load and shared by every component that needs it, because a hotel page can render a
 * dozen airline marks (two cards, plus every leg inside the flight modal) and each one
 * asking the API separately would be a dozen identical requests.
 *
 * The promise itself is the cache, not the result: components mounting in the same tick
 * all await the same in-flight request instead of racing to start their own.
 */

let logoPromise = null;

/**
 * code (IATA, upper) → { name, logo }. EVERY row is kept, logo or not.
 *
 * Rows without a logo used to be dropped, on the grounds that the caller's fallback would
 * render the same thing anyway. That threw away the name: the dashboard knows "VF" is
 * Vietjet, and the static table in flightNames.js does not, so the card printed the bare
 * code as though it were the airline. `logo` is null when there is no image, which is the
 * only thing callers need to branch on.
 */
async function loadAirlineLogos() {
  const { data } = await axiosInstance.get('/flight-availability/airlines');
  const rows = Array.isArray(data?.data) ? data.data : [];
  const map = new Map();
  for (const a of rows) {
    const code = String(a?.iataCode || '').trim().toUpperCase();
    if (!code) continue;
    map.set(code, { name: a.name || null, logo: (a.logo && resolveCmsImageUrl(a.logo)) || null });
  }
  return map;
}

const EMPTY = new Map();

/**
 * The shared directory. Returns an empty Map until it has loaded, and an empty Map
 * forever if the lookup fails — callers render their own fallback, so a missing logo
 * service can never blank out a flight card.
 */
export function useAirlineLogos() {
  const [logos, setLogos] = useState(EMPTY);
  useEffect(() => {
    let live = true;
    if (!logoPromise) {
      logoPromise = loadAirlineLogos().catch(() => {
        // Let the next mount try again rather than caching the failure for the session.
        logoPromise = null;
        return EMPTY;
      });
    }
    logoPromise.then((m) => { if (live) setLogos(m); });
    return () => { live = false; };
  }, []);
  return logos;
}

/**
 * The airline's name for display, as a function of its code.
 *
 * The dashboard directory wins over the static table in flightNames.js: it is maintained by the
 * team, it covers carriers the hardcoded list never heard of, and it is already being fetched
 * for the logos. The static table stays as the fallback for the moment before the directory has
 * loaded, and for any code the dashboard has not been told about — an unknown code still comes
 * back as itself, so a card never renders a blank where an airline should be.
 */
export function useAirlineName() {
  const directory = useAirlineLogos();
  return (code) => {
    const hit = directory.get(String(code || '').trim().toUpperCase());
    return hit?.name || staticAirlineName(code);
  };
}

/** Test seam: drop the shared cache so a suite can control what the next mount fetches. */
export function __resetAirlineLogos() { logoPromise = null; }
