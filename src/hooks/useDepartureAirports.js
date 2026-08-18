// useDepartureAirports — the §25 departure master list, fetched from admin and cached
// once per session, with the label registry kept in sync so airportCity()/airportLabel()
// resolve any admin-added airport. Optionally annotates §26 validity (which airports have a
// real flight to the searched destination) when { destination, checkIn } are supplied.
import { useEffect, useState } from 'react';
import { fetchDepartureAirports } from '../api/filters';
import { setDepartureAirports, getDepartureAirports } from '../utils/airports';

// Module-level cache: the master list is the same for everyone and rarely changes, so it is
// fetched once and shared across every picker on the site.
let _masterCache = null;
let _inflight = null;

function loadMaster() {
  if (_masterCache) return Promise.resolve(_masterCache);
  if (_inflight) return _inflight;
  // The whole call is guarded: a missing/failing airports API must degrade to the seed,
  // never crash a picker. (Wrapping catches even a synchronous throw, e.g. a test mock that
  // doesn't provide this export.)
  try {
    _inflight = Promise.resolve(fetchDepartureAirports())
      .then(({ airports }) => {
        if (airports?.length) setDepartureAirports(airports);   // feed the label registry
        _masterCache = getDepartureAirports();
        return _masterCache;
      })
      .catch(() => { _masterCache = getDepartureAirports(); return _masterCache; })
      .finally(() => { _inflight = null; });
    return _inflight;
  } catch {
    _masterCache = getDepartureAirports();
    return Promise.resolve(_masterCache);
  }
}

export function useDepartureAirports({ destination, checkIn, checkOut, adults } = {}) {
  const [airports, setAirports] = useState(getDepartureAirports());
  const [available, setAvailable] = useState(null); // §26: { CODE: boolean } or null (unknown)

  // 1) master list, once
  useEffect(() => {
    let live = true;
    loadMaster().then((list) => { if (live && list) setAirports([...list]); });
    return () => { live = false; };
  }, []);

  // 2) §26 validity for the current destination + dates. All setState happens inside the async
  // `run()` (never synchronously in the effect body), so a destination change resets validity
  // without a cascading render.
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const run = async () => {
      if (!destination || !checkIn) { if (live) setAvailable(null); return; }
      try {
        const { airports: annotated, cacheHasData } = await fetchDepartureAirports(
          { destination, checkIn, checkOut, adults }, { signal: ctrl.signal },
        );
        if (!live) return;
        if (!cacheHasData) { setAvailable(null); return; }     // cache empty → hide nothing
        const map = {};
        for (const a of annotated) map[a.code] = a.available !== false;
        setAvailable(map);
      } catch { if (live) setAvailable(null); }
    };
    run();
    return () => { live = false; ctrl.abort(); };
  }, [destination, checkIn, checkOut, adults]);

  // §26: when validity is known, hide airports with no valid flight; otherwise show all.
  const visible = available ? airports.filter((a) => available[a.code] !== false) : airports;
  return {
    airports: visible,
    popular: visible.filter((a) => a.popular),
    other: visible.filter((a) => !a.popular),
    available,
    loading: !_masterCache,
  };
}
