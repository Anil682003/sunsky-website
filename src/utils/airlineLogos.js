import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { resolveCmsImageUrl } from './cmsImage';

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

/** code (IATA, upper) → { name, logo } for airlines that HAVE a logo. */
async function loadAirlineLogos() {
  const { data } = await axiosInstance.get('/flight-availability/airlines');
  const rows = Array.isArray(data?.data) ? data.data : [];
  const map = new Map();
  for (const a of rows) {
    const code = String(a?.iataCode || '').trim().toUpperCase();
    // A row without a logo is not worth storing: the consumer's fallback (the airline's
    // initial) is what it would render anyway, and an entry here means "there is a logo".
    if (!code || !a?.logo) continue;
    const url = resolveCmsImageUrl(a.logo);
    if (url) map.set(code, { name: a.name || null, logo: url });
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

/** Test seam: drop the shared cache so a suite can control what the next mount fetches. */
export function __resetAirlineLogos() { logoPromise = null; }
